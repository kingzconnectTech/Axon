from typing import Optional, Dict, Any


class IQOptionClient:
    def __init__(self):
        self._connected = False
        self._session: Optional[Dict[str, Any]] = None

    def connect(self, username: str, password: str) -> bool:
        self._session = {"username": username}
        self._connected = True
        return self._connected

    def disconnect(self) -> None:
        self._session = None
        self._connected = False

    def status(self) -> Dict[str, Any]:
        return {"connected": self._connected}

    def get_balance(self) -> float:
        if not self._connected:
            return 0.0
        return 0.0

    def place_order(self, pair: str, direction: str, amount: float, expiry_seconds: int) -> str:
        if not self._connected:
            raise RuntimeError("not connected")
        return "order"

    def poll_position(self, order_id: str) -> Dict[str, Any]:
        return {"order_id": order_id, "status": "closed", "result": "win", "pnl": 0.0}

