import redis
import os

host = "172.19.233.198"
port = 6380

try:
    r = redis.Redis(host=host, port=port, socket_timeout=5)
    print(f"Ping: {r.ping()}")
    print("Connected successfully")
except Exception as e:
    print(f"Error: {e}")
