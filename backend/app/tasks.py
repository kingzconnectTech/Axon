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

redis_host = os.getenv("REDIS_HOST", "redis")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
r = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

@celery.task(name="axon.analyze_market")
def analyze_market(uid: str, session_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    pairs = config.get("pairs", [])
    for i in range(5):
        for p in pairs:
            status = r.hget(f"session:{uid}:{session_id}", "status")
            if status != "running":
                return {"uid": uid, "session_id": session_id, "processed": False}
            signal = {"type": "signal", "session_id": session_id, "pair": p, "direction": "CALL", "confidence": 0.6}
            r.publish(f"signals:{uid}", json.dumps(signal))
            r.hset(f"session:{uid}:{session_id}", "heartbeat", time.time())
            time.sleep(0.2)
            amount = config.get("amount")
            if amount:
                place_trade.delay(uid, session_id, p, "CALL", float(amount), 300)
    return {"uid": uid, "session_id": session_id, "processed": True}


def start_user_session(uid: str, session_id: str, config: Dict[str, Any]) -> None:
    analyze_market.apply_async(args=[uid, session_id, config], queue=user_queue(uid, session_id))


@celery.task(name="axon.trade_result")
def trade_result(uid: str, session_id: str, pnl: float, won: bool) -> None:
    update_metrics(uid, session_id, pnl, won)

@celery.task(name="axon.heartbeat_pulse")
def heartbeat_pulse(uid: str, session_id: str, interval: int = 10) -> None:
    key = f"session:{uid}:{session_id}"
    status = r.hget(key, "status")
    if status == "running":
        r.hset(key, "heartbeat", time.time())
        heartbeat_pulse.apply_async(args=[uid, session_id, interval], countdown=interval, queue=user_queue(uid, session_id))


@celery.task(name="axon.place_trade")
def place_trade(uid: str, session_id: str, pair: str, direction: str, amount: float, expiry_seconds: int) -> None:
    client = IQOptionClient()
    with SessionLocal() as db:
        cred = db.get(DbCred, uid)
        if not cred:
            return
        password = decrypt(cred.password_enc)
        ok = client.connect(cred.username, password)
        if not ok:
            code = client.error_code()
            msg = client.error_message()
            if client.error_is_terminal():
                r.hset(f"session:{uid}:{session_id}", "status", "halted")
                r.publish(f"metrics:{uid}", json.dumps({"type": "halt", "reason": "auth_error", "session_id": session_id}))
            else:
                r.publish(f"metrics:{uid}", json.dumps({"type": "error", "error_code": code, "message": msg, "session_id": session_id}))
            return
    order_id = client.place_order(pair, direction, amount, expiry_seconds)
    with SessionLocal() as db:
        db.add(DbTrade(user_id=uid, session_id=session_id, pair=pair, direction=direction, amount=amount, expiry=expiry_seconds, order_id=order_id, status="placed", result="pending", pnl=0.0))
        db.commit()
    result = client.poll_position(order_id)
    if client.error_code():
        code = client.error_code()
        msg = client.error_message()
        r.publish(f"metrics:{uid}", json.dumps({"type": "error", "error_code": code, "message": msg, "session_id": session_id}))
    won = result.get("result") == "win"
    pnl = result.get("pnl", 0.0)
    with SessionLocal() as db:
        trade = db.query(DbTrade).filter(DbTrade.order_id == order_id).first()
        if trade:
            trade.status = result.get("status")
            trade.result = result.get("result")
            trade.pnl = pnl
            db.commit()
    r.hset(f"session:{uid}:{session_id}", "heartbeat", time.time())
    trade_result.delay(uid, session_id, pnl, won)
