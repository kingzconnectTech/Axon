import os
from cryptography.fernet import Fernet

def _key() -> bytes:
    k = os.getenv("SECRET_KEY", None)
    if not k:
        k = Fernet.generate_key().decode()
        os.environ["SECRET_KEY"] = k
    return k.encode()

def encrypt(text: str) -> str:
    f = Fernet(_key())
    return f.encrypt(text.encode()).decode()

def decrypt(token: str) -> str:
    f = Fernet(_key())
    return f.decrypt(token.encode()).decode()

