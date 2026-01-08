import os
import time
import requests
from typing import Optional, Dict, Any
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/iqgw")
UPSTREAM = os.getenv("IQ_UPSTREAM_URL")

def _req(method: str, path: str, headers: Optional[Dict[str, str]] = None, json: Optional[Dict[str, Any]] = None):
    if not UPSTREAM:
        return None
    url = f"{UPSTREAM}{path}"
    attempt = 0
    while True:
        try:
            resp = requests.request(method, url, headers=headers, json=json, timeout=10)
            if resp.status_code >= 500 and attempt < 3:
                time.sleep(0.5 * (2 ** attempt))
                attempt += 1
                continue
            return resp
        except Exception:
            if attempt >= 3:
                raise
            time.sleep(0.5 * (2 ** attempt))
            attempt += 1


class LoginRequest(BaseModel):
    username: str
    password: str
    account_type: str = "PRACTICE"


@router.post("/login")
def login(payload: LoginRequest):
    if UPSTREAM:
        resp = _req("POST", "/login", json={"username": payload.username, "password": payload.password, "account_type": payload.account_type})
        if resp is None or resp.status_code != 200:
            return {"error_code": "UPSTREAM_LOGIN_FAILED", "message": "login failed"}
        return resp.json()
    token = f"local-{payload.account_type}-{int(time.time())}"
    return {"token": token, "account_type": payload.account_type}


@router.get("/balance")
def balance(authorization: Optional[str] = Header(None)):
    if UPSTREAM:
        resp = _req("GET", "/balance", headers={"Authorization": authorization})
        if resp is None or resp.status_code != 200:
            code = "UPSTREAM_BALANCE_FAILED"
            if resp is not None and resp.status_code == 429:
                code = "RATE_LIMIT"
            return {"error_code": code, "message": "balance failed"}
        return resp.json()
    
    # Mock behavior based on token
    token = authorization.replace("Bearer ", "") if authorization else ""
    if "REAL" in token:
        return {"balance": 0.0}  # Mock REAL balance
    elif "PRACTICE" in token:
        return {"balance": 10000.0}  # Mock PRACTICE balance
        
    return {"balance": 1000.0}


class OrderRequest(BaseModel):
    pair: str
    direction: str
    amount: float
    expiry_seconds: int


@router.post("/order")
def order(payload: OrderRequest, authorization: Optional[str] = Header(None)):
    if UPSTREAM:
        resp = _req("POST", "/order", headers={"Authorization": authorization}, json=payload.model_dump())
        if resp is None or resp.status_code != 200:
            code = "UPSTREAM_ORDER_FAILED"
            if resp is not None:
                if resp.status_code == 429:
                    code = "RATE_LIMIT"
                elif resp.status_code == 409:
                    code = "INSTRUMENT_CLOSED"
                elif resp.status_code == 423:
                    code = "MARKET_CLOSED"
            return {"error_code": code, "message": "order failed"}
        return resp.json()
    return {"order_id": f"ord-{int(time.time())}"}


@router.get("/position/{order_id}")
def position(order_id: str, authorization: Optional[str] = Header(None)):
    if UPSTREAM:
        resp = _req("GET", f"/position/{order_id}", headers={"Authorization": authorization})
        if resp is None or resp.status_code != 200:
            code = "UPSTREAM_POSITION_FAILED"
            if resp is not None:
                if resp.status_code == 429:
                    code = "RATE_LIMIT"
                elif resp.status_code == 409:
                    code = "INSTRUMENT_CLOSED"
                elif resp.status_code == 423:
                    code = "MARKET_CLOSED"
            return {"error_code": code, "message": "position failed"}
        return resp.json()
    return {"order_id": order_id, "status": "closed", "result": "win", "pnl": 0.0}
