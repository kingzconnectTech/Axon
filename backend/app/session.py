import os
import redis

redis_host = os.getenv("REDIS_HOST", "redis")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
r = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)


def session_key(uid: str, session_id: str) -> str:
    return f"session:{uid}:{session_id}"


def update_metrics(uid: str, session_id: str, delta_pnl: float, won: bool) -> None:
    key = session_key(uid, session_id)
    if not r.exists(key):
        return
    pnl = float(r.hget(key, "profit") or "0")
    trades = int(r.hget(key, "trades") or "0")
    consecutive_losses = int(r.hget(key, "consecutive_losses") or "0")
    wins = int(r.hget(key, "wins") or "0")
    pnl += delta_pnl
    trades += 1
    if won:
        wins += 1
        consecutive_losses = 0
    else:
        consecutive_losses += 1
    r.hmset(key, {"profit": pnl, "trades": trades, "wins": wins, "consecutive_losses": consecutive_losses})
    r.publish(f"metrics:{uid}", f'{{"type":"metrics","session_id":"{session_id}","pnl":{pnl},"trades":{trades},"wins":{wins},"consecutive_losses":{consecutive_losses}}}')
    _evaluate_safety(uid, session_id)


def _evaluate_safety(uid: str, session_id: str) -> None:
    key = session_key(uid, session_id)
    stop_loss = float(r.hget(key, "stop_loss") or "0")
    take_profit = float(r.hget(key, "take_profit") or "0")
    max_losses = int(r.hget(key, "max_consecutive_losses") or "0")
    max_trades = int(r.hget(key, "max_trades") or "0")
    pnl = float(r.hget(key, "profit") or "0")
    trades = int(r.hget(key, "trades") or "0")
    consecutive_losses = int(r.hget(key, "consecutive_losses") or "0")
    if stop_loss and pnl <= -abs(stop_loss):
        r.hset(key, "status", "halted")
        r.publish(f"metrics:{uid}", f'{{"type":"halt","reason":"stop_loss","session_id":"{session_id}"}}')
        return
    if take_profit and pnl >= abs(take_profit):
        r.hset(key, "status", "halted")
        r.publish(f"metrics:{uid}", f'{{"type":"halt","reason":"take_profit","session_id":"{session_id}"}}')
        return
    if max_losses and consecutive_losses >= max_losses:
        r.hset(key, "status", "halted")
        r.publish(f"metrics:{uid}", f'{{"type":"halt","reason":"max_consecutive_losses","session_id":"{session_id}"}}')
        return
    if max_trades and trades >= max_trades:
        r.hset(key, "status", "halted")
        r.publish(f"metrics:{uid}", f'{{"type":"halt","reason":"max_trades","session_id":"{session_id}"}}')
        return
