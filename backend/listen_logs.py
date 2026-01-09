import os
import redis
import json
import time

r = redis.Redis(
    host=os.getenv("REDIS_HOST", "127.0.0.1"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    db=0,
    decode_responses=True,
)
p = r.pubsub()
p.psubscribe('logs:*')

print("Listening for logs on logs:*...")

for message in p.listen():
    if message['type'] == 'pmessage':
        channel = message['channel']
        data = message['data']
        try:
            parsed = json.loads(data)
            print(f"[{channel}] {parsed.get('type')}: {parsed.get('message')}")
        except:
            print(f"[{channel}] {data}")
