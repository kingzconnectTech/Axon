import os
import uuid
import json
import time
import threading
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import firebase_admin
from firebase_admin import auth, credentials
import redis
from .schemas import SignalStartRequest, SignalStopRequest, AutoTradingConfig, SessionStartResponse
from .tasks import start_user_session
from .models import SessionLocal, Base, engine, Session as DbSession, Trade as DbTrade, IQCredential as DbCred
from .credentials import encrypt, decrypt
from .iq_option import IQOptionClient
from .workers import spawn_user_worker, stop_user_worker
from .workers import spawn_beat
from .iq_gateway import router as iqgw_router
from .pairs import OTC_PAIRS
from .strategies import get_all_strategy_names

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    firebase_admin.get_app()
except ValueError:
    cred_path = os.getenv("FIREBASE_CREDENTIALS") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    else:
        firebase_admin.initialize_app()

redis_host = os.getenv("REDIS_HOST", "redis")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
r = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

class VerifyTokenResponse(BaseModel):
    uid: str


def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="invalid authorization header")
    return authorization.split(" ", 1)[1].strip()


def _verify_id_token(authorization: Optional[str]) -> str:
    token = _bearer_token(authorization)
    try:
        decoded = auth.verify_id_token(token)
        return decoded.get("uid")
    except Exception:
        raise HTTPException(status_code=401, detail="invalid token")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/verify-token", response_model=VerifyTokenResponse)
def verify_token(authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    return VerifyTokenResponse(uid=uid)

app.include_router(iqgw_router)


def _session_key(uid: str, session_id: str) -> str:
    return f"session:{uid}:{session_id}"


@app.post("/signal/start", response_model=SessionStartResponse)
def signal_start(payload: SignalStartRequest, authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    session_id = uuid.uuid4().hex
    key = _session_key(uid, session_id)
    r.hset(key, mapping={"mode": "signal", "status": "running", "strategy_id": payload.strategy_id, "timeframe": payload.timeframe})
    r.expire(key, 86400)
    r.publish(f"signals:{uid}", json.dumps({"type": "session_started", "session_id": session_id}))
    pairs = payload.pairs or OTC_PAIRS
    start_user_session(uid, session_id, {"pairs": pairs, "strategy_id": payload.strategy_id, "timeframe": payload.timeframe})
    with SessionLocal() as db:
        db.add(DbSession(id=session_id, user_id=uid, mode="signal", status="running"))
        db.commit()
    return SessionStartResponse(session_id=session_id)


@app.post("/signal/stop")
def signal_stop(payload: SignalStopRequest, authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    key = _session_key(uid, payload.session_id)
    if not r.exists(key):
        raise HTTPException(status_code=404, detail="session not found")
    r.hset(key, "status", "halted")
    r.publish(f"signals:{uid}", json.dumps({"type": "session_halted", "session_id": payload.session_id}))
    return {"status": "halted"}


@app.post("/session/start", response_model=SessionStartResponse)
def session_start(config: AutoTradingConfig, authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    session_id = uuid.uuid4().hex
    key = _session_key(uid, session_id)
    r.hset(
        key,
        mapping={
            "mode": "auto",
            "status": "running",
            "trade_amount": config.trade_amount,
            "timeframe": config.timeframe,
            "strategy_id": config.strategy_id,
            "stop_loss": config.stop_loss,
            "take_profit": config.take_profit,
            "max_consecutive_losses": config.max_consecutive_losses,
            "max_trades": config.max_trades,
            "profit": 0.0,
            "losses": 0.0,
            "wins": 0,
            "loss_streak": 0,
            "trades": 0,
            "reject_count": 0,
            "retry_count": 0,
            "heartbeat_missed": 0,
            "heartbeat": 0,
        },
    )
    r.expire(key, 86400)
    r.publish(f"metrics:{uid}", json.dumps({"type": "session_started", "session_id": session_id}))
    r.publish(f"logs:{uid}", json.dumps({"type": "log", "message": "Session started", "timestamp": time.time()}))
    task_arn = spawn_user_worker(uid, session_id)
    if task_arn:
        r.hset(key, "worker_arn", task_arn)
    pairs = config.pairs or OTC_PAIRS
    start_user_session(uid, session_id, {"pairs": pairs, "strategy_id": config.strategy_id, "timeframe": config.timeframe, "amount": config.trade_amount})
    from .tasks import heartbeat_pulse
    heartbeat_pulse.apply_async(args=[uid, session_id, 10], queue=f"user:{uid}:{session_id}")
    with SessionLocal() as db:
        db.add(DbSession(id=session_id, user_id=uid, mode="auto", status="running"))
        db.commit()
    return SessionStartResponse(session_id=session_id)


@app.post("/session/stop")
def session_stop(payload: SignalStopRequest, authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    key = _session_key(uid, payload.session_id)
    if not r.exists(key):
        raise HTTPException(status_code=404, detail="session not found")
    r.hset(key, "status", "halted")
    worker_arn = r.hget(key, "worker_arn")
    if worker_arn:
        stop_user_worker(worker_arn)
    r.publish(f"metrics:{uid}", json.dumps({"type": "session_halted", "session_id": payload.session_id}))
    with SessionLocal() as db:
        obj = db.get(DbSession, payload.session_id)
        if obj and obj.user_id == uid:
            obj.status = "halted"
            db.commit()
    return {"status": "halted"}


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        decoded = auth.verify_id_token(token)
        uid = decoded.get("uid")
    except Exception:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    # print(f"[WS] Accepted connection for {uid}")
    pubsub = r.pubsub()
    pubsub.subscribe(f"signals:{uid}", f"metrics:{uid}", f"logs:{uid}")
    # print(f"[WS] Subscribed to signals:{uid}, metrics:{uid}, logs:{uid}")

    stop_flag = {"stop": False}
    import asyncio
    loop = asyncio.get_running_loop()

    def reader():
        # print(f"[WS] Reader thread started for {uid}")
        for message in pubsub.listen():
            if stop_flag["stop"]:
                break
            if message and message["type"] == "message":
                data = message["data"]
                try:
                    # print(f"[WS] Received redis msg: {data}")
                    text = str(data)
                    asyncio.run_coroutine_threadsafe(websocket.send_text(text), loop)
                except Exception as e:
                    print(f"[WS] Error sending message: {e}")

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        stop_flag["stop"] = True
        try:
            pubsub.close()
        except Exception:
            pass
        return


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    threading.Thread(target=_monitor_sessions, daemon=True).start()
    if os.getenv("ENABLE_BEAT") == "1":
        spawn_beat()


@app.get("/me/sessions")
def me_sessions(limit: int = Query(50, ge=1, le=200), authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    with SessionLocal() as db:
        rows = db.query(DbSession).filter(DbSession.user_id == uid).order_by(DbSession.started_at.desc()).limit(limit).all()
        result = []
        for s in rows:
            key = _session_key(uid, s.id)
            counters = {"reject_count": 0, "retry_count": 0, "heartbeat_missed": 0, "heartbeat": 0}
            if r.exists(key):
                reject_count = int(r.hget(key, "reject_count") or "0")
                retry_count = int(r.hget(key, "retry_count") or "0")
                heartbeat_missed = int(r.hget(key, "heartbeat_missed") or "0")
                heartbeat = float(r.hget(key, "heartbeat") or "0")
                counters = {"reject_count": reject_count, "retry_count": retry_count, "heartbeat_missed": heartbeat_missed, "heartbeat": heartbeat}
            result.append({"id": s.id, "mode": s.mode, "status": s.status, "profit": s.profit, "trades": s.trades, "started_at": s.started_at.isoformat(), **counters})
        return result


@app.get("/me/trades")
def me_trades(limit: int = Query(200, ge=1, le=500), authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    with SessionLocal() as db:
        rows = db.query(DbTrade).filter(DbTrade.user_id == uid).order_by(DbTrade.created_at.desc()).limit(limit).all()
        return [{"id": t.id, "session_id": t.session_id, "pair": t.pair, "direction": t.direction, "amount": t.amount, "result": t.result, "pnl": t.pnl, "created_at": t.created_at.isoformat()} for t in rows]


@app.get("/iq/balance")
def iq_balance(authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    with SessionLocal() as db:
        cred = db.get(DbCred, uid)
        if not cred:
            raise HTTPException(status_code=400, detail="not connected")
        client = IQOptionClient()
        account_type = getattr(cred, "account_type", "PRACTICE")
        if not client.connect(cred.username, decrypt(cred.password_enc), account_type, uid=uid):
            raise HTTPException(status_code=400, detail="failed to connect")
        bal = client.get_balance()
        return {"balance": bal}


@app.get("/pairs")
def list_pairs():
    return {"pairs": OTC_PAIRS}


@app.get("/strategies")
def list_strategies():
    # Return a list of available strategy names
    return {"strategies": get_all_strategy_names()}


def _monitor_sessions():
    import time
    while True:
        try:
            for key in r.scan_iter("session:*"):
                status = r.hget(key, "status")
                if status != "running":
                    continue
                hb = float(r.hget(key, "heartbeat") or "0")
                if hb and time.time() - hb > 300:
                    r.hset(key, "status", "halted")
                    parts = key.split(":")
                    uid = parts[1] if len(parts) > 1 else ""
                    session_id = parts[2] if len(parts) > 2 else ""
                    worker_arn = r.hget(key, "worker_arn")
                    if worker_arn:
                        stop_user_worker(worker_arn)
                    r.publish(f"metrics:{uid}", json.dumps({"type": "halt", "reason": "heartbeat_timeout", "session_id": session_id}))
        except Exception:
            pass
        time.sleep(5)


class IQConnectRequest(BaseModel):
    username: str
    password: str
    account_type: str = "PRACTICE"


@app.post("/iq/connect")
def iq_connect(payload: IQConnectRequest, authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    client = IQOptionClient()
    ok = client.connect(payload.username, payload.password, payload.account_type, uid=uid)
    if not ok:
        detail = client.error_message() or "failed to connect"
        code = client.error_code()
        raise HTTPException(status_code=400, detail=f"{detail} (code: {code})")
    with SessionLocal() as db:
        enc = encrypt(payload.password)
        existing = db.get(DbCred, uid)
        if existing:
            existing.username = payload.username
            existing.password_enc = enc
            existing.account_type = payload.account_type
        else:
            db.add(DbCred(user_id=uid, username=payload.username, password_enc=enc, account_type=payload.account_type))
        db.commit()
    return {"status": "connected"}


@app.get("/iq/status")
def iq_status(authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    with SessionLocal() as db:
        existing = db.get(DbCred, uid)
        return {"connected": existing is not None}


@app.delete("/iq/disconnect")
def iq_disconnect(authorization: Optional[str] = Header(None)):
    uid = _verify_id_token(authorization)
    with SessionLocal() as db:
        existing = db.get(DbCred, uid)
        if existing:
            db.delete(existing)
            db.commit()
    
    # Stop the agent
    client = IQOptionClient()
    client.disconnect(uid=uid)
    
    return {"status": "disconnected"}

