import os
import time
import json
import redis
import uuid
import subprocess
import sys
from typing import Optional, Dict, Any

# Setup Redis
redis_host = os.getenv("REDIS_HOST", "127.0.0.1")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
print(f"[IQClient] Redis config: {redis_host}:{redis_port}")
r = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)


class IQOptionClient:
    def __init__(self):
        self.uid = None
        self._connected = False
        self._last_error: Optional[Dict[str, Any]] = None
        self._base_url = os.getenv("IQ_BASE_URL")
        print(f"[IQClient] Base URL: {self._base_url}")

    def _normalize_active(self, pair: str) -> str:
        if not pair:
            return pair
        s = str(pair).strip().upper()
        otc = "OTC" in s
        s = s.replace("OTC", "")
        s = s.replace("/", "").replace(" ", "").replace("_", "").replace("-", "")
        if otc:
            return f"{s}-OTC"
        return s

    def connect(self, username: str, password: str, account_type: str = "PRACTICE", uid: str = None) -> bool:
        if uid:
            self.uid = uid

            # Check if agent is running
            status = r.hget(f"agent:{uid}:status", "status")
            if status == "connected":
                # Ping to verify
                pong = self._send_command("ping", timeout=5)
                if pong == "pong":
                    self._connected = True
                    # Ensure account type matches
                    self._send_command("change_balance", {"account_type": account_type})
                    
                    # Log connection reuse
                    try:
                        bal = self.get_balance()
                        log_msg = f"IQ Option connected (existing): {username} (Balance: {bal})"
                        r.publish(f"logs:{uid}", json.dumps({
                            "type": "log",
                            "message": log_msg,
                            "timestamp": time.time()
                        }))
                    except Exception as e:
                        print(f"[IQClient] Failed to log reuse: {e}")

                    return True
                else:
                     print(f"[IQClient] Agent for {uid} unresponsive. Restarting...")
                     # Try to kill old process
                     old_pid = r.hget(f"agent:{uid}:status", "pid")
                     if old_pid:
                         try:
                             pid_int = int(old_pid)
                             if os.name == "nt":
                                 subprocess.run(["taskkill", "/F", "/PID", str(pid_int)], capture_output=True)
                             else:
                                 os.kill(pid_int, 9)
                         except:
                             pass
                     r.delete(f"agent:{uid}:status")

            # Start Agent
            # Cleanup previous agent if any
            old_pid = r.hget(f"agent:{uid}:status", "pid")
            if old_pid:
                try:
                    pid_int = int(old_pid)
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/F", "/PID", str(pid_int)], capture_output=True)
                    else:
                        os.kill(pid_int, 9)
                except:
                    pass

            print(f"[IQClient] Spawning agent for {uid}")
            env = os.environ.copy()
            env["REDIS_HOST"] = redis_host
            env["REDIS_PORT"] = str(redis_port)
            env["PYTHONPATH"] = os.getcwd() # Ensure backend module is found

            python_exe = sys.executable

            # Run in background with logging
            log_file = open(f"agent_{uid}.log", "w")
            
            try:
                # Determine module path based on CWD
                # If we are in 'backend' dir, use 'app.agent'
                # If we are in 'Axon' dir, use 'backend.app.agent'
                module_name = "backend.app.agent"
                if os.path.basename(os.getcwd()) == "backend":
                    module_name = "app.agent"

                subprocess.Popen([python_exe, "-u", "-m", module_name, uid, username, password, account_type],
                                cwd=os.getcwd(),
                                env=env,
                                stdout=log_file,
                                stderr=subprocess.STDOUT)
            except Exception as e:
                print(f"[IQClient] Failed to spawn agent: {e}")
                self._last_error = {"error_code": "SPAWN_FAILED", "detail": str(e)}
                return False

            # Wait for connection
            for _ in range(60): # Wait up to 30 seconds (IQ login can be slow with retries)
                time.sleep(0.5)
                status = r.hget(f"agent:{uid}:status", "status")
                if status == "connected":
                    self._connected = True
                    return True
                if status in ["failed", "error"]:
                    err = r.hget(f"agent:{uid}:status", "error")
                    self._last_error = {"error_code": "LOGIN_FAILED", "detail": err}
                    return False

            self._last_error = {"error_code": "TIMEOUT", "detail": "Agent startup timed out"}
            return False

        if self._base_url:
            # Legacy gateway logic (mock or upstream)
            # Not updated for UID support, assumed unused or stateless
            import requests
            try:
                resp = requests.post(f"{self._base_url}/login", json={"username": username, "password": password, "account_type": account_type})
                if resp.status_code == 200:
                    self._connected = True
                    return True
                return False
            except:
                return False
        
        if not uid:
            print("[IQClient] Warning: UID not provided for real connection. Cannot spawn agent.")
            self._last_error = {"error_code": "NO_UID", "detail": "UID required"}
            return False

    def disconnect(self, uid: str = None):
        target_uid = uid or self.uid
        if not target_uid:
            return
            
        # Send stop command
        r.publish(f"agent:{target_uid}:cmd", json.dumps({"id": "exit", "cmd": "stop"}))
        
        # Clean up status
        r.delete(f"agent:{target_uid}:status")
        
        if target_uid == self.uid:
            self._connected = False
            self.uid = None

    def _send_command(self, cmd: str, data: Dict[str, Any] = None, timeout: int = 10):
        if not self.uid:
            return None

        cmd_id = uuid.uuid4().hex
        payload = {"id": cmd_id, "cmd": cmd}
        if data:
            payload.update(data)

        pubsub = r.pubsub()
        channel = f"agent:{self.uid}:resp:{cmd_id}"
        pubsub.subscribe(channel)

        r.publish(f"agent:{self.uid}:cmd", json.dumps(payload))

        start = time.time()
        while time.time() - start < timeout:
            msg = pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
            if msg:
                try:
                    resp = json.loads(msg["data"])
                    if resp.get("id") == cmd_id:
                        pubsub.unsubscribe()
                        if resp.get("status") == "error":
                             self._last_error = {"error_code": "CMD_ERROR", "detail": resp.get("error")}
                             return None
                        return resp.get("result")
                except:
                    pass
            time.sleep(0.01)
        
        pubsub.unsubscribe()
        return None

    def get_balance(self) -> float:
        res = self._send_command("get_balance")
        return float(res) if res is not None else 0.0

    def place_order(self, pair: str, direction: str, amount: float, expiry_seconds: int):
        expiry_val = int(expiry_seconds)
        duration = int(expiry_val / 60) if expiry_val >= 60 else expiry_val
        if duration < 1:
            duration = 1

        active = self._normalize_active(pair)
        action = str(direction or "").strip().lower()
        if action == "buy":
            action = "call"
        elif action == "sell":
            action = "put"

        res = self._send_command("buy", {"amount": amount, "active": active, "action": action, "duration": duration})
        return res # Returns order_id or None

    def poll_position(self, order_id):
        # Check win
        # iqoptionapi check_win_v3 returns:
        # > 0 : win amount
        # < 0 : loose amount (usually -1 * bet)
        # 0 : draw? or not finished?
        # Wait, check_win_v3 might block until closed? 
        # If agent blocks, we block.
        # But we want to poll.
        # If check_win_v3 returns None, it means not closed?
        
        # We'll use a short timeout for the command, but check_win_v3 in Agent might block.
        # We should update Agent to NOT block if possible, or use check_win_v3 which blocks but we rely on Celery loop?
        # Actually Celery tasks.py calls poll_position once?
        # No, tasks.py:
        # result = client.poll_position(order_id)
        # It expects it to wait until done?
        
        res = self._send_command("check_win", {"order_id": order_id}, timeout=300) # Wait up to 5 mins for trade
        
        if res is not None:
             pnl = float(res)
             return {"status": "closed", "result": "win" if pnl > 0 else "lose", "pnl": pnl}
        
        return {"status": "open"}

    def get_candles(self, pair: str, timeframe: int, count: int, timestamp: int) -> list:
        # timeframe in seconds (e.g., 60 for 1min)
        active = self._normalize_active(pair)
        res = self._send_command("get_candles", {"active": active, "duration": timeframe, "count": count, "timestamp": timestamp})
        return res if res else []

    def error_code(self):
        return self._last_error.get("error_code") if self._last_error else None

    def error_message(self):
        return self._last_error.get("detail") if self._last_error else None

    def error_is_terminal(self):
        return True
    
    def last_retries(self):
        return 0
