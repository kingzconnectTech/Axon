import os
from typing import Optional
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import firebase_admin
from firebase_admin import auth

app = FastAPI()

try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app()


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

