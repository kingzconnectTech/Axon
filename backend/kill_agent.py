import redis
import os
import signal
import sys

uid = "v0CWHAKcDsaH2zYmxHriM0h4jbc2"
r = redis.Redis(host="127.0.0.1", port=6380, db=0, decode_responses=True)

status_key = f"agent:{uid}:status"
data = r.hgetall(status_key)
print(f"Agent data: {data}")

pid = data.get("pid")
if pid:
    try:
        os.kill(int(pid), signal.SIGTERM)
        print(f"Killed agent PID {pid}")
    except Exception as e:
        print(f"Failed to kill agent: {e}")

r.delete(status_key)
print("Deleted agent status key.")
