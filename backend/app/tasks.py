from typing import Dict, Any
import os
import time
import json
import redis
from .celery_app import celery, user_queue
from .session import update_metrics
from .iq_option import IQOptionClient
from .models import SessionLocal, Trade as DbTrade, IQCredential as DbCred
from .credentials import decrypt
from .pairs import OTC_PAIRS
from .strategies import get_strategy

redis_host = os.getenv("REDIS_HOST", "redis")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
r = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

@celery.task(name="axon.analyze_market")
def analyze_market(uid: str, session_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    # Check session status
    key = f"session:{uid}:{session_id}"
    status = r.hget(key, "status")
    if status != "running":
        return {"uid": uid, "session_id": session_id, "processed": False, "reason": "stopped"}

    # Update heartbeat
    r.hset(key, "heartbeat", time.time())

    # Get configuration
    strategy_name = config.get("strategy_id") or config.get("strategy")
    pairs = config.get("pairs") or OTC_PAIRS
    amount = float(config.get("amount") or 0)
    
    # Parse timeframe
    timeframe_input = str(config.get("timeframe") or "60")
    try:
        if "min" in timeframe_input:
            timeframe = int(timeframe_input.replace("min", "").strip()) * 60
        elif "s" in timeframe_input:
            timeframe = int(timeframe_input.replace("s", "").strip())
        else:
            val = int(timeframe_input)
            # Heuristic: if < 15, assume minutes, else seconds
            timeframe = val * 60 if val < 15 else val
    except:
        timeframe = 60
    
    # Get strategy
    strategy = get_strategy(strategy_name)
    if not strategy:
        # Log error or stop? For now just skip this tick
        # But reschedule to check if strategy becomes valid or config changes (unlikely)
        # Actually, if strategy is missing, maybe just use a default or log error
        r.publish(f"metrics:{uid}", json.dumps({"type": "error", "message": f"Strategy {strategy_name} not found", "session_id": session_id}))
        # Reschedule slowly to avoid log spam
        analyze_market.apply_async(args=[uid, session_id, config], countdown=5, queue=user_queue(uid, session_id))
        return {"uid": uid, "session_id": session_id, "processed": False, "reason": "strategy_not_found"}

    # Check consecutive losses
    max_losses = int(config.get("max_consecutive_losses") or 3)
    consecutive_losses = int(r.hget(key, "consecutive_losses") or 0)
    
    if consecutive_losses >= max_losses:
        # Stop session safely
        r.hset(key, "status", "halted")
        r.publish(f"metrics:{uid}", json.dumps({"type": "halt", "reason": "max_consecutive_losses", "session_id": session_id}))
        return {"uid": uid, "session_id": session_id, "processed": False, "reason": "max_losses"}

    client = IQOptionClient()
    with SessionLocal() as db:
        cred = db.get(DbCred, uid)
        if not cred:
            r.hset(key, "status", "halted")
            r.publish(f"metrics:{uid}", json.dumps({"type": "halt", "reason": "not_connected", "session_id": session_id}))
            return {"uid": uid, "session_id": session_id, "processed": False, "reason": "not_connected"}
        password = decrypt(cred.password_enc)
        account_type = getattr(cred, "account_type", "PRACTICE")

    ok = client.connect(cred.username, password, account_type, uid=uid)
    if not ok:
        code = client.error_code()
        msg = client.error_message()
        r.publish(f"metrics:{uid}", json.dumps({"type": "error", "message": msg or "failed to connect", "error_code": code, "session_id": session_id}))
        if client.error_is_terminal():
            r.hset(key, "status", "halted")
            r.publish(f"metrics:{uid}", json.dumps({"type": "halt", "reason": "auth_error", "session_id": session_id}))
            return {"uid": uid, "session_id": session_id, "processed": False, "reason": "auth_error"}
        analyze_market.apply_async(args=[uid, session_id, config], countdown=5, queue=user_queue(uid, session_id))
        return {"uid": uid, "session_id": session_id, "processed": False, "reason": "connect_failed"}

    processed_count = 0

    # Log analysis start (throttle to avoid spam if needed, but UI can handle it)
    r.publish(f"logs:{uid}", json.dumps({"type": "log", "message": f"Analyzing {len(pairs)} pairs with {strategy_name}...", "timestamp": time.time()}))
    
    # Debug: Check strategy type
    r.publish(f"logs:{uid}", json.dumps({"type": "debug", "message": f"Strategy Class: {type(strategy).__name__}", "timestamp": time.time()}))

    for pair in pairs:
        # Log analysis of specific pair
        msg = f"Analyzing {pair}..."
        r.publish(f"logs:{uid}", json.dumps({"type": "log", "message": msg, "timestamp": time.time()}))

        # Check cooldown
        cooldown_key = f"{key}:cooldown:{pair}"
        if r.exists(cooldown_key):
            continue

        # Get candles
        # Need enough candles for indicators (e.g. 100)
        candles = client.get_candles(pair, timeframe, 100, int(time.time()))
        
        if not candles:
            r.publish(f"logs:{uid}", json.dumps({"type": "debug", "message": f"No candles for {pair}", "timestamp": time.time()}))
            continue
            
        r.publish(f"logs:{uid}", json.dumps({"type": "debug", "message": f"Got {len(candles)} candles for {pair}", "timestamp": time.time()}))

        # Generate signal
        signal_data = strategy.generate_signal(candles)
        
        if signal_data:
            r.publish(f"logs:{uid}", json.dumps({"type": "debug", "message": f"Signal found for {pair}: {signal_data}", "timestamp": time.time()}))
            direction = signal_data.get("direction")
            confidence = signal_data.get("confidence", 0.0)
            
            # Publish signal
            signal_msg = {
                "type": "signal", 
                "session_id": session_id, 
                "pair": pair, 
                "direction": direction, 
                "confidence": confidence,
                "strategy": strategy_name
            }
            r.publish(f"signals:{uid}", json.dumps(signal_msg))
            r.publish(f"logs:{uid}", json.dumps({"type": "log", "message": f"Signal found: {pair} {direction} ({confidence}%)", "timestamp": time.time()}))
            
            # Auto-trade if configured
            if amount > 0:
                # Calculate expiry in minutes (approx 5 candles)
                expiry_minutes = max(1, (timeframe * 5) // 60)
                place_trade.delay(uid, session_id, pair, direction, amount, expiry_minutes)
                
                # Set cooldown (e.g. 3 minutes or until trade finishes)
                # User said "Enforce cooldown per pair". 
                # Let's set it to 300s (5 mins) to be safe, or configurable
                cooldown_sec = int(config.get("cooldown") or 300)
                r.setex(cooldown_key, cooldown_sec, "1")
                
                processed_count += 1
                
                # If "Allow only ONE strategy per session" applies to concurrent trades?
                # User said "Allow only ONE strategy per session" -> One algo running.
                # If user wants only one OPEN trade at a time, we should check active trades.
                # For now, we just process one signal per tick per pair.
                
    # Reschedule
    # Interval should be roughly a candle tick or less. 
    # If timeframe is 60s, checking every 5-10s is fine.
    interval = 5
    analyze_market.apply_async(args=[uid, session_id, config], countdown=interval, queue=user_queue(uid, session_id))
    
    return {"uid": uid, "session_id": session_id, "processed": True, "signals": processed_count}


def start_user_session(uid: str, session_id: str, config: Dict[str, Any]) -> None:
    # Reset state
    key = f"session:{uid}:{session_id}"
    r.hset(key, "consecutive_losses", 0)
    
    analyze_market.apply_async(args=[uid, session_id, config], queue=user_queue(uid, session_id))


@celery.task(name="axon.trade_result")
def trade_result(uid: str, session_id: str, pnl: float, won: bool) -> None:
    r.publish(f"logs:{uid}", json.dumps({"type": "log", "message": f"Trade finished: {'WIN' if won else 'LOSS'} PnL: {pnl}", "timestamp": time.time()}))
    update_metrics(uid, session_id, pnl, won)
    
    # Update consecutive losses
    key = f"session:{uid}:{session_id}"
    if not won and pnl < 0:
        r.hincrby(key, "consecutive_losses", 1)
    elif won:
        r.hset(key, "consecutive_losses", 0)


@celery.task(name="axon.heartbeat_pulse")
def heartbeat_pulse(uid: str, session_id: str, interval: int = 10) -> None:
    key = f"session:{uid}:{session_id}"
    status = r.hget(key, "status")
    if status == "running":
        r.hset(key, "heartbeat", time.time())
        heartbeat_pulse.apply_async(args=[uid, session_id, interval], countdown=interval, queue=user_queue(uid, session_id))


@celery.task(name="axon.place_trade")
def place_trade(uid: str, session_id: str, pair: str, direction: str, amount: float, expiry_seconds: int) -> None:
    r.publish(f"logs:{uid}", json.dumps({"type": "log", "message": f"Placing trade: {pair} {direction} ${amount}", "timestamp": time.time()}))
    client = IQOptionClient()
    with SessionLocal() as db:
        cred = db.get(DbCred, uid)
        if not cred:
            return
        password = decrypt(cred.password_enc)
        account_type = getattr(cred, "account_type", "PRACTICE")
        ok = client.connect(cred.username, password, account_type, uid=uid)
        if not ok:
            code = client.error_code()
            msg = client.error_message()
            if client.error_is_terminal():
                r.hset(f"session:{uid}:{session_id}", "status", "halted")
                r.publish(f"metrics:{uid}", json.dumps({"type": "halt", "reason": "auth_error", "session_id": session_id}))
            else:
                r.hincrby(f"session:{uid}:{session_id}", "reject_count", 1)
                cnt = int(r.hget(f"session:{uid}:{session_id}", "reject_count") or "0")
                r.publish(f"metrics:{uid}", json.dumps({"type": "counter", "session_id": session_id, "reject_count": cnt}))
                r.publish(f"metrics:{uid}", json.dumps({"type": "error", "error_code": code, "message": msg, "session_id": session_id}))
            return
    order_id = client.place_order(pair, direction, amount, expiry_seconds)
    retries = client.last_retries()
    if retries:
        r.hincrby(f"session:{uid}:{session_id}", "retry_count", retries)
        cnt = int(r.hget(f"session:{uid}:{session_id}", "retry_count") or "0")
        r.publish(f"metrics:{uid}", json.dumps({"type": "counter", "session_id": session_id, "retry_count": cnt}))
    with SessionLocal() as db:
        db.add(DbTrade(user_id=uid, session_id=session_id, pair=pair, direction=direction, amount=amount, expiry=expiry_seconds, order_id=order_id, status="placed", result="pending", pnl=0.0))
        db.commit()
    result = client.poll_position(order_id)
    if client.error_code():
        code = client.error_code()
        msg = client.error_message()
        r.hincrby(f"session:{uid}:{session_id}", "reject_count", 1)
        cnt = int(r.hget(f"session:{uid}:{session_id}", "reject_count") or "0")
        r.publish(f"metrics:{uid}", json.dumps({"type": "counter", "session_id": session_id, "reject_count": cnt}))
        r.publish(f"metrics:{uid}", json.dumps({"type": "error", "error_code": code, "message": msg, "session_id": session_id}))
    won = result.get("result") == "win"
    pnl = result.get("pnl", 0.0)
    
    # Update consecutive losses for strategy safety
    key = f"session:{uid}:{session_id}"
    if not won and pnl < 0:
        r.hincrby(key, "consecutive_losses", 1)
    elif won:
        r.hset(key, "consecutive_losses", 0)
        
    with SessionLocal() as db:
        trade = db.query(DbTrade).filter(DbTrade.order_id == order_id).first()
        if trade:
            trade.status = result.get("status")
            trade.result = result.get("result")
            trade.pnl = pnl
            db.commit()
    r.hset(f"session:{uid}:{session_id}", "heartbeat", time.time())
    trade_result.delay(uid, session_id, pnl, won)
