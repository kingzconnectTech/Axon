from typing import Dict, Any, Optional


class Strategy:
    def warmup(self, data: Any) -> None:
        pass

    def generate_signal(self, market_snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return None


class EmaCrossover(Strategy):
    def generate_signal(self, market_snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return None


class RsiStrategy(Strategy):
    def generate_signal(self, market_snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return None

