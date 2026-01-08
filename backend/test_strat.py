from app.strategies import STRATEGIES
import random

rs = STRATEGIES["Random Strategy"]
hits = 0
for i in range(100):
    sig = rs.generate_signal([{"close": 1.0}])
    if sig:
        hits += 1
print(f"Hits: {hits}/100")
