import sys
import os
import json
import time
import redis
from iqoptionapi.stable_api import IQ_Option

# Redis config
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

def normalize_pair(pair):
    if not pair:
        return pair
    s = str(pair).strip().upper()
    otc = "OTC" in s
    s = s.replace("OTC", "")
    s = s.replace("/", "").replace(" ", "").replace("_", "").replace("-", "")
    if otc:
        return f"{s}-OTC"
    return s

def main():
    if len(sys.argv) < 4:
        print("Usage: agent.py <uid> <email> <password> [account_type]")
        sys.exit(1)

    uid = sys.argv[1]
    email = sys.argv[2]
    password = sys.argv[3]
    account_type = sys.argv[4] if len(sys.argv) > 4 else "PRACTICE"

    print(f"[Agent {uid}] Starting for {email}...")

    try:
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
        r.ping()
    except Exception as e:
        print(f"[Agent {uid}] Failed to connect to Redis: {e}")
        sys.exit(1)

    # Initialize IQ Option API
    api = IQ_Option(email, password)
    
    # Connect
    check, reason = api.connect()
    
    if check:
        print(f"[Agent {uid}] Connected to IQ Option.")
        api.change_balance(account_type)
        
        # Set status in Redis
        r.hset(f"agent:{uid}:status", mapping={
            "status": "connected", 
            "pid": os.getpid(),
            "start_time": time.time()
        })
        
        # Publish log to system log
        try:
            balance = api.get_balance()
            currency = "USD"
            try:
                currency = api.get_currency()
            except:
                pass
                
            log_msg = f"IQ Option connected: {email} (Balance: {balance} {currency})"
            print(f"[Agent {uid}] Publishing log: {log_msg}")
            r.publish(f"logs:{uid}", json.dumps({
                "type": "log",
                "message": log_msg,
                "timestamp": time.time()
            }))
        except Exception as log_err:
            print(f"[Agent {uid}] Failed to publish connect log: {log_err}")
        
        sys.stdout.flush()
        
        # Subscribe to command channel
        pubsub = r.pubsub()
        cmd_channel = f"agent:{uid}:cmd"
        pubsub.subscribe(cmd_channel)
        
        print(f"[Agent {uid}] Listening on {cmd_channel}...")
        
        while True:
            try:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    data = json.loads(message["data"])
                    cmd = data.get("cmd")
                    cmd_id = data.get("id")
                    
                    print(f"[Agent {uid}] Received command: {cmd} (id: {cmd_id})")
                    
                    response = {"id": cmd_id, "status": "ok"}
                    
                    if cmd == "get_balance":
                        bal = api.get_balance()
                        response["result"] = bal
                        
                    elif cmd == "buy":
                        amount = data.get("amount")
                        raw_active = data.get("active")
                        active = normalize_pair(raw_active)
                        action = data.get("action") # "call" or "put"
                        duration = data.get("duration")
                        
                        check_buy, id_buy = api.buy(amount, active, action, duration)
                        if check_buy:
                            response["result"] = id_buy
                        else:
                            response["status"] = "error"
                            response["error"] = "Buy failed"
                            
                    elif cmd == "check_win":
                        id_number = data.get("order_id")
                        res = api.check_win_v3(id_number)
                        response["result"] = res

                    elif cmd == "get_candles":
                        raw_active = data.get("active")
                        active = normalize_pair(raw_active)
                        duration = data.get("duration") # seconds usually, or 60, 300 etc
                        count = data.get("count")
                        timestamp = data.get("timestamp") # end time
                        
                        try:
                            if not api.check_connect():
                                print(f"[Agent {uid}] Connection lost. Reconnecting...")
                                check_recon, reason_recon = api.connect()
                                if check_recon:
                                    api.change_balance(account_type)
                                else:
                                    print(f"[Agent {uid}] Reconnect inside get_candles failed: {reason_recon}")

                            # Debug log
                            print(f"[Agent {uid}] Requesting candles: {active} (raw: {raw_active}), {duration}, {count}, {timestamp}")
                            candles = api.get_candles(active, duration, count, timestamp)
                            print(f"[Agent {uid}] get_candles returned type: {type(candles)}, value: {candles[:1] if isinstance(candles, list) and candles else candles}")
                            
                            # iqoptionapi might return empty list or None on failure without raising
                            if not candles:
                                print(f"[Agent {uid}] get_candles returned empty. Attempting reconnect...")
                                check_recon, reason_recon = api.connect()
                                if check_recon:
                                    api.change_balance(account_type)
                                    candles = api.get_candles(active, duration, count, timestamp)
                                else:
                                    print(f"[Agent {uid}] Reconnect failed inside get_candles: {reason_recon}")
                                
                            response["result"] = candles
                        except Exception as e:
                            print(f"[Agent {uid}] get_candles error: {e}")
                            print(f"[Agent {uid}] Attempting reconnect due to error...")
                            
                            # Aggressive reconnect
                            try:
                                api = IQ_Option(email, password)
                                check_recon, reason_recon = api.connect()
                                if not check_recon:
                                    raise RuntimeError(f"reconnect failed: {reason_recon}")
                                api.change_balance(account_type)
                                print(f"[Agent {uid}] Reinitialized API client.")
                            except Exception as recon_e:
                                print(f"[Agent {uid}] Reinit failed: {recon_e}")
                            
                            time.sleep(2) # Prevent tight loop
                            
                            try:
                                candles = api.get_candles(active, duration, count, timestamp)
                                response["result"] = candles
                            except Exception as retry_e:
                                print(f"[Agent {uid}] Retry failed: {retry_e}")
                                response["result"] = []

                    elif cmd == "change_balance":
                        act = data.get("account_type")
                        api.change_balance(act)
                        response["result"] = "ok"

                    elif cmd == "ping":
                        response["result"] = "pong"
                    
                    elif cmd == "stop":
                        print(f"[Agent {uid}] Stopping...")
                        break
                    
                    # Publish response if cmd_id provided
                    if cmd_id:
                        r.publish(f"agent:{uid}:resp:{cmd_id}", json.dumps(response))
                
                # Check connection periodically
                if not api.check_connect():
                    print(f"[Agent {uid}] Connection lost. Reconnecting...")
                    check_recon, reason_recon = api.connect()
                    if not check_recon:
                        print(f"[Agent {uid}] Reconnection failed: {reason_recon}. Exiting.")
                        r.hset(f"agent:{uid}:status", "status", "failed")
                        break
                    print(f"[Agent {uid}] Reconnected.")
                    api.change_balance(account_type)

            except Exception as e:
                print(f"[Agent {uid}] Error in loop: {e}")
                if 'cmd_id' in locals() and cmd_id:
                    r.publish(f"agent:{uid}:resp:{cmd_id}", json.dumps({"id": cmd_id, "status": "error", "error": str(e)}))

    else:
        print(f"[Agent {uid}] Login failed: {reason}")
        r.hset(f"agent:{uid}:status", "status", "failed")
        r.hset(f"agent:{uid}:status", "error", str(reason))
        sys.exit(1)

    # Cleanup
    r.delete(f"agent:{uid}:status")
    print(f"[Agent {uid}] Exited.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[Agent] Critical error: {e}")
        import traceback
        traceback.print_exc()
