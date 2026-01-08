import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

def _key() -> bytes:
    k = os.getenv("SECRET_KEY", None)
    if not k:
        raise RuntimeError("SECRET_KEY is not set")
    return k.encode()

def encrypt(text: str) -> str:
    f = Fernet(_key())
    return f.encrypt(text.encode()).decode()

def decrypt(token: str) -> str:
    f = Fernet(_key())
    return f.decrypt(token.encode()).decode()
