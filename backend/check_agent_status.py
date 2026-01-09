import os
import argparse
import redis
import json

r = redis.Redis(
    host=os.getenv("REDIS_HOST", "127.0.0.1"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    db=0,
    decode_responses=True,
)

def _is_smoke_key(key: str) -> bool:
    parts = str(key).split(":")
    if len(parts) < 3:
        return False
    return parts[1].startswith("__smoke")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--cleanup-smoke", action="store_true")
    args = parser.parse_args()

    keys = sorted(r.keys("agent:*:status"))
    if args.cleanup_smoke:
        deleted = 0
        for k in keys:
            if _is_smoke_key(k):
                deleted += r.delete(k)
        print(json.dumps({"deleted": deleted}))
        keys = sorted(r.keys("agent:*:status"))

    for k in keys:
        if not args.all and _is_smoke_key(k):
            continue
        data = r.hgetall(k)
        print(f"{k}: {data}")


if __name__ == "__main__":
    main()
