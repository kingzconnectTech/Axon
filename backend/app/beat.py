import os
import time
import redis
from .celery_app import user_queue
from .tasks import heartbeat_pulse

redis_host = os.getenv("REDIS_HOST", "redis")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
r = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

def run(interval: int = 10):
    while True:
        try:
            for key in r.scan_iter("session:*"):
                status = r.hget(key, "status")
                if status != "running":
                    continue
                parts = key.split(":")
                uid = parts[1] if len(parts) > 1 else ""
                session_id = parts[2] if len(parts) > 2 else ""
                heartbeat_pulse.apply_async(args=[uid, session_id, interval], queue=user_queue(uid, session_id))
                hb = float(r.hget(key, "heartbeat") or "0")
                if hb:
                    import time as t
                    latency = t.time() - hb
                    r.publish(f"metrics:{uid}", f'{{"type":"heartbeat","session_id":"{session_id}","latency":{latency}}}')
                    if latency > interval * 1.5:
                        missed = int(r.hget(key, "heartbeat_missed") or "0") + 1
                        r.hset(key, "heartbeat_missed", missed)
                        r.publish(f"metrics:{uid}", f'{{"type":"heartbeat_warning","session_id":"{session_id}","missed":{missed},"latency":{latency}}}')
        except Exception:
            pass
        time.sleep(interval)

if __name__ == "__main__":
    run()
