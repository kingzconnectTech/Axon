import redis
import json

r = redis.Redis(host='127.0.0.1', port=6380, db=0, decode_responses=True)

keys = r.keys("agent:*:status")
for k in keys:
    data = r.hgetall(k)
    print(f"{k}: {data}")
