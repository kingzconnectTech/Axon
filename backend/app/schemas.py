from typing import List, Optional
from pydantic import BaseModel, Field


class SignalStartRequest(BaseModel):
    strategy_id: str
    pairs: List[str]
    timeframe: str


class SignalStopRequest(BaseModel):
    session_id: str


class AutoTradingConfig(BaseModel):
    trade_amount: float = Field(gt=0)
    timeframe: str
    pairs: List[str]
    strategy_id: str
    stop_loss: float = Field(gt=0)
    take_profit: float = Field(gt=0)
    max_consecutive_losses: int = Field(ge=1)
    max_trades: int = Field(ge=1)


class SessionStartResponse(BaseModel):
    session_id: str

