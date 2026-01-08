import redis
import os

r = redis.Redis(host="127.0.0.1", port=6380, db=0, decode_responses=True)
keys = r.keys("session:*:*")
print("Session keys:", keys)
for k in keys:
    if "status" in k: # It's a hash field, but keys returns the key name
        continue
    # session:uid:id is a hash
    data = r.hgetall(k)
    print(f"{k}: {data}")
