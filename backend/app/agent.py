import sys
import os
import json
import time
import redis
from iqoptionapi.stable_api import IQ_Option
from iqoptionapi.api import IQOptionAPI
from iqoptionapi.http.login import Login
import iqoptionapi.global_value as global_value

# --- Monkey Patch to use auth.iqbroker.com and ws.iqoption.com ---
def custom_login_post(self, data=None, headers=None):
    # Use auth.iqbroker.com for login
    return self.api.send_http_request_v2(method="POST", url="https://auth.iqbroker.com/api/v2/login", data=data, headers=headers)

Login._post = custom_login_post

def custom_connect(self):
    try:
        self.api.close()
    except:
        pass

    # Use ws.iqoption.com for WebSocket (it's reachable)
    self.api = IQOptionAPI("ws.iqoption.com", self.email, self.password)
    check = None
    
    # Update User-Agent to avoid 429
    self.SESSION_HEADER = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    self.api.set_session(headers=self.SESSION_HEADER, cookies=self.SESSION_COOKIE)
    check, reason = self.api.connect()

    if check == True:
        self.re_subscribe_stream()
        while global_value.balance_id == None:
            pass
        self.position_change_all("subscribeMessage", global_value.balance_id)
        self.order_changed_all("subscribeMessage")
        self.api.setOptions(1, True)
        
    return check, reason

IQ_Option.connect = custom_connect
# ----------------------------------------

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
    
    # Register PID immediately
    r.hmset(f"agent:{uid}:status", {
        "status": "starting",
        "pid": os.getpid(),
        "error": "",
        "updated_at": int(time.time())
    })
    
    # Connect with retry
    check = False
    reason = "Unknown"
    for i in range(5):
        try:
            print(f"[Agent {uid}] Connection attempt {i+1}/5...")
            r.hmset(f"agent:{uid}:status", {
                "status": "connecting",
                "pid": os.getpid(),
                "error": "",
                "updated_at": int(time.time())
            })
            check, reason = api.connect()
            if check:
                break
            
            if reason and "requests_limit_exceeded" in str(reason):
                ttl = 60
                try:
                    r_data = json.loads(reason) if isinstance(reason, str) else reason
                    if isinstance(r_data, dict):
                        ttl = int(r_data.get("ttl", 60))
                except:
                    pass
                
                print(f"[Agent {uid}] Rate limit exceeded. Waiting {ttl}s...")
                
                # Report error to Redis so frontend knows immediately
                r.hmset(f"agent:{uid}:status", {
                    "status": "error",
                    "error": str(reason),
                    "updated_at": int(time.time())
                })
                
                time.sleep(ttl)
                continue

            r.hmset(f"agent:{uid}:status", {
                "status": "error",
                "error": str(reason),
                "updated_at": int(time.time())
            })
            print(f"[Agent {uid}] Connection failed: {reason}. Retrying in 2s...")
        except Exception as e:
            reason = str(e)
            r.hmset(f"agent:{uid}:status", {
                "status": "error",
                "error": reason,
                "updated_at": int(time.time())
            })
            print(f"[Agent {uid}] Connection exception: {e}. Retrying in 2s...")
        time.sleep(2)
    
    if check:
        print(f"[Agent {uid}] Connected to IQ Option.")
        api.change_balance(account_type)
        
        # Set status in Redis
        r.hmset(f"agent:{uid}:status", {
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
                        
                        try:
                            # Check connection
                            if not api.check_connect():
                                print(f"[Agent {uid}] Connection lost before buy. Reconnecting...")
                                if api.connect()[0]:
                                    api.change_balance(account_type)
                                else:
                                    print(f"[Agent {uid}] Reconnect before buy failed.")

                            print(f"[Agent {uid}] Placing trade: {active} {action} ${amount} (duration: {duration})")
                            check_buy, id_buy = api.buy(amount, active, action, duration)
                            
                            if check_buy:
                                print(f"[Agent {uid}] Trade placed successfully. ID: {id_buy}")
                                response["result"] = id_buy
                            else:
                                print(f"[Agent {uid}] Trade placement failed. Result: {check_buy}, {id_buy}")
                                r.publish(f"logs:{uid}", json.dumps({
                                    "type": "error",
                                    "message": f"Trade placement failed for {active}: {id_buy}",
                                    "timestamp": time.time()
                                }))
                                # Try one reconnect and retry
                                print(f"[Agent {uid}] Retrying trade after reconnect...")
                                if api.connect()[0]:
                                    api.change_balance(account_type)
                                    check_buy, id_buy = api.buy(amount, active, action, duration)
                                    if check_buy:
                                        print(f"[Agent {uid}] Retry trade success. ID: {id_buy}")
                                        response["result"] = id_buy
                                    else:
                                        print(f"[Agent {uid}] Retry trade failed.")
                                        response["status"] = "error"
                                        response["error"] = f"Buy failed: {id_buy}"
                                else:
                                    response["status"] = "error"
                                    response["error"] = "Buy failed and reconnect failed"
                        except Exception as e:
                            print(f"[Agent {uid}] Buy command exception: {e}")
                            response["status"] = "error"
                            response["error"] = str(e)
                            
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
