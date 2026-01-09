from typing import Dict, Any, Optional, List
import pandas as pd
import random
try:
    import pandas_ta as ta
except ImportError:
    ta = None

class Strategy:
    def __init__(self, name: str):
        self.name = name

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        return df

    def generate_signal(self, candles: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not candles or len(candles) < 50:
            return None
            
        df = pd.DataFrame(candles)
        # Ensure correct types and sort
        df['close'] = df['close'].astype(float)
        df['open'] = df['open'].astype(float)
        df['max'] = df['max'].astype(float)
        df['min'] = df['min'].astype(float)
        df['volume'] = df['volume'].astype(float)
        
        # Sort by timestamp (id) just in case
        # IQ Option returns 'at' (timestamp) usually
        if 'at' in df.columns:
            df = df.sort_values('at')
        
        if ta is None:
            return None

        try:
            df = self.calculate_indicators(df)
            last_candle = df.iloc[-1]
            prev_candle = df.iloc[-2]
            
            return self.check_rules(df, last_candle, prev_candle)
        except Exception as e:
            print(f"Strategy Error: {e}")
            return None

    def check_rules(self, df, last, prev) -> Optional[Dict[str, Any]]:
        return None

# 1. Trend Continuation (EMA Pullback)
class TrendContinuation(Strategy):
    def __init__(self):
        super().__init__("Trend Continuation")

    def calculate_indicators(self, df):
        df['EMA_20'] = ta.ema(df['close'], length=20)
        df['EMA_50'] = ta.ema(df['close'], length=50)
        df['RSI'] = ta.rsi(df['close'], length=14)
        return df

    def check_rules(self, df, last, prev):
        # Trend Definition
        uptrend = last['EMA_20'] > last['EMA_50']
        downtrend = last['EMA_20'] < last['EMA_50']
        
        rsi = last['RSI']
        
        if uptrend:
            # BUY: RSI 45-60, Pullback to EMA 20 or 50
            if 45 <= rsi <= 60:
                # Candle closes in trend direction (Bullish)
                if last['close'] > last['open']:
                    return {"direction": "CALL", "confidence": 0.8}
        
        if downtrend:
            # SELL: RSI 40-55
            if 40 <= rsi <= 55:
                # Candle closes in trend direction (Bearish)
                if last['close'] < last['open']:
                    return {"direction": "PUT", "confidence": 0.8}
                
        return None

# 2. RSI Reversal (Mean Reversion)
class RsiReversal(Strategy):
    def __init__(self):
        super().__init__("RSI Reversal")

    def calculate_indicators(self, df):
        df['RSI'] = ta.rsi(df['close'], length=14)
        bb = ta.bbands(df['close'], length=20, std=2)
        df = pd.concat([df, bb], axis=1)
        return df

    def check_rules(self, df, last, prev):
        rsi = last['RSI']
        # pandas_ta bbands columns: BBL_20_2.0, BBM_20_2.0, BBU_20_2.0
        lower_band = last['BBL_20_2.0']
        upper_band = last['BBU_20_2.0']
        
        # BUY
        if rsi < 25 and last['close'] <= lower_band: 
             if last['close'] > last['open']: # Bullish candle
                 return {"direction": "CALL", "confidence": 0.85}

        # SELL
        if rsi > 75 and last['close'] >= upper_band:
            if last['close'] < last['open']: # Bearish close
                return {"direction": "PUT", "confidence": 0.85}
                
        return None

# 3. Breakout (Donchian Channel)
class BreakoutRetest(Strategy):
    def __init__(self):
        super().__init__("Breakout Retest")
    
    def calculate_indicators(self, df):
        # Donchian Channels (20)
        df['high_20'] = df['max'].rolling(window=20).max()
        df['low_20'] = df['min'].rolling(window=20).min()
        return df

    def check_rules(self, df, last, prev):
        # Breakout UP: Close > Prev High 20
        # (Using prev high to ensure it's a breakout of the *past* range)
        prev_high = prev['high_20']
        prev_low = prev['low_20']
        
        if last['close'] > prev_high:
            return {"direction": "CALL", "confidence": 0.75}
            
        if last['close'] < prev_low:
            return {"direction": "PUT", "confidence": 0.75}
            
        return None

# 4. EMA Crossover
class EmaCrossover(Strategy):
    def __init__(self):
        super().__init__("EMA Crossover")

    def calculate_indicators(self, df):
        df['EMA_9'] = ta.ema(df['close'], length=9)
        df['EMA_21'] = ta.ema(df['close'], length=21)
        return df
    
    def check_rules(self, df, last, prev):
        # BUY: 9 crosses above 21
        if prev['EMA_9'] <= prev['EMA_21'] and last['EMA_9'] > last['EMA_21']:
            if last['close'] > last['EMA_9']:
                return {"direction": "CALL", "confidence": 0.7}
        
        # SELL: 9 crosses below 21
        if prev['EMA_9'] >= prev['EMA_21'] and last['EMA_9'] < last['EMA_21']:
            if last['close'] < last['EMA_9']:
                return {"direction": "PUT", "confidence": 0.7}
        
        return None

# 5. Heikin Ashi Trend
class HeikinAshiTrend(Strategy):
    def __init__(self):
        super().__init__("Heikin Ashi Trend")
    
    def calculate_indicators(self, df):
        ha = ta.ha(df['open'], df['max'], df['min'], df['close'])
        df = pd.concat([df, ha], axis=1)
        df['EMA_20'] = ta.ema(df['close'], length=20)
        return df

    def check_rules(self, df, last, prev):
        # HA columns: HA_open, HA_high, HA_low, HA_close
        if 'HA_close' not in last:
            return None

        ha_close = last['HA_close']
        ha_open = last['HA_open']
        prev_ha_close = prev['HA_close']
        prev_ha_open = prev['HA_open']
        
        ema20 = last['EMA_20']
        
        is_bullish = ha_close > ha_open
        is_prev_bullish = prev_ha_close > prev_ha_open
        
        is_bearish = ha_close < ha_open
        is_prev_bearish = prev_ha_close < prev_ha_open
        
        # BUY
        if is_bullish and is_prev_bullish:
            # No lower wicks (HA_open == HA_low) approx check
            if abs(last['HA_open'] - last['HA_low']) < 0.00001:
                 if last['close'] > ema20:
                     return {"direction": "CALL", "confidence": 0.9}

        # SELL
        if is_bearish and is_prev_bearish:
            # No upper wicks (HA_open == HA_high)
            if abs(last['HA_open'] - last['HA_high']) < 0.00001:
                if last['close'] < ema20:
                    return {"direction": "PUT", "confidence": 0.9}

        return None

# 6. Volatility Squeeze
class VolatilitySqueeze(Strategy):
    def __init__(self):
        super().__init__("Volatility Squeeze")

    def calculate_indicators(self, df):
        # Bollinger Bands
        bb = ta.bbands(df['close'], length=20, std=2.0)
        # Keltner Channels
        kc = ta.kc(df['high'], df['low'], df['close'], length=20, scalar=1.5)
        
        df = pd.concat([df, bb, kc], axis=1)
        return df
    
    def check_rules(self, df, last, prev):
        # Check if Squeeze was ON in previous candle
        # Squeeze ON = BB inside KC
        # BB: BBL_20_2.0, BBU_20_2.0
        # KC: KCL_20_1.5, KCU_20_1.5 (default names from pandas_ta, may vary slightly)
        
        # Verify columns exist
        if 'BBU_20_2.0' not in last or 'KCU_20_1.5' not in last:
            return None
            
        bb_upper = prev['BBU_20_2.0']
        bb_lower = prev['BBL_20_2.0']
        kc_upper = prev['KCU_20_1.5']
        kc_lower = prev['KCL_20_1.5']
        
        squeeze_on = (bb_upper < kc_upper) and (bb_lower > kc_lower)
        
        if squeeze_on:
            # Momentum breakout
            # Simple check: Close crosses BB Upper (Call) or BB Lower (Put)
            # Or just check current candle momentum relative to middle band
            
            if last['close'] > last['BBU_20_2.0']:
                return {"direction": "CALL", "confidence": 0.8}
            elif last['close'] < last['BBL_20_2.0']:
                 return {"direction": "PUT", "confidence": 0.8}
                 
        return None

# 7. Random Strategy (For Testing)
class RandomStrategy(Strategy):
    def __init__(self):
        super().__init__("Random Strategy")

    def generate_signal(self, candles: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        # Bypass minimum candle check for testing
        print(f"DEBUG: RandomStrategy generate_signal called with {len(candles) if candles else 0} candles")
        if not candles:
            return None
            
        # 100% chance to trade for debugging
        direction = "CALL" if random.random() > 0.5 else "PUT"
        return {"direction": direction, "confidence": 1.0}

    def check_rules(self, df, last, prev):
        # Not used because we override generate_signal
        return None

STRATEGIES = {
    "Trend Continuation": TrendContinuation(),
    "RSI Reversal": RsiReversal(),
    "Breakout Retest": BreakoutRetest(),
    "EMA Crossover": EmaCrossover(),
    "Heikin Ashi Trend": HeikinAshiTrend(),
    "Volatility Squeeze": VolatilitySqueeze(),
    "Random Strategy": RandomStrategy()
}

def get_strategy(name: str) -> Optional[Strategy]:
    return STRATEGIES.get(name)

def get_all_strategy_names() -> List[str]:
    return list(STRATEGIES.keys())
