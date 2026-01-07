import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";

export default function AutoTrading({ idToken }) {
  const [connected, setConnected] = useState(false);
  const [iqUser, setIqUser] = useState("");
  const [iqPass, setIqPass] = useState("");
  const [amount, setAmount] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [pairs, setPairs] = useState("");
  const [strategy, setStrategy] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [maxLosses, setMaxLosses] = useState("");
  const [maxTrades, setMaxTrades] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [pnl, setPnl] = useState(0);
  const [trades, setTrades] = useState(0);
  const [wins, setWins] = useState(0);
  const [lossStreak, setLossStreak] = useState(0);
  const [ws, setWs] = useState(null);
  const [haltReason, setHaltReason] = useState("");
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [heartbeatLatency, setHeartbeatLatency] = useState(0);
  const [missedCount, setMissedCount] = useState(0);
  const [rejectCount, setRejectCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!idToken) return;
    fetch("http://localhost:8000/iq/status", { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.json())
      .then(data => {
        setConnected(!!data.connected);
        setError("");
      })
      .catch(() => setError("Status check failed"));
    let attempt = 0;
    let closed = false;
    const connectWs = () => {
      if (closed) return;
      const socket = new WebSocket(`ws://localhost:8000/ws/stream?token=${idToken}`);
      socket.onopen = () => {
        attempt = 0;
        setError("");
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "metrics") {
            setPnl(msg.pnl ?? 0);
            setTrades(msg.trades ?? 0);
            setWins(msg.wins ?? 0);
            setLossStreak(msg.loss_streak ?? 0);
          } else if (msg.type === "halt") {
            setHaltReason(msg.reason || "halted");
            setConnected(false);
          } else if (msg.type === "error") {
            setErrorCode(msg.error_code || "");
            setError(msg.message || "error");
          } else if (msg.type === "heartbeat") {
            setHeartbeatLatency(msg.latency ?? 0);
          } else if (msg.type === "heartbeat_warning") {
            setMissedCount(msg.missed ?? 0);
          } else if (msg.type === "counter") {
            if (typeof msg.reject_count === "number") setRejectCount(msg.reject_count);
            if (typeof msg.retry_count === "number") setRetryCount(msg.retry_count);
          }
        } catch (e) {}
      };
      socket.onerror = () => setError("WebSocket error");
      socket.onclose = () => {
        attempt += 1;
        const delay = Math.min(5000, 500 * Math.pow(2, attempt));
        setTimeout(connectWs, delay);
      };
      setWs(socket);
    };
    connectWs();
    return () => {
      closed = true;
      try { ws && ws.close(); } catch (e) {}
    };
  }, [idToken]);

  return (
    <View style={{ padding: 16 }}>
      <Text>Status {connected ? "Connected" : "Disconnected"}</Text>
      <View style={{ flexDirection: "row", margin_vertical: 8 }}>
        <TextInput value={iqUser} onChangeText={setIqUser} placeholder="IQ username" style={{ borderWidth: 1, marginRight: 8, flex: 1 }} />
        <TextInput value={iqPass} onChangeText={setIqPass} placeholder="IQ password" secureTextEntry style={{ borderWidth: 1, marginRight: 8, flex: 1 }} />
        <TouchableOpacity
          onPress={() => {
            fetch("http://localhost:8000/iq/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ username: iqUser, password: iqPass })
            })
              .then(async (res) => {
                if (!res.ok) throw new Error("connect failed");
                await res.json();
                setConnected(true);
                setError("");
              })
              .catch(() => setError("Connect failed"));
          }}
          style={{ marginRight: 12 }}
        >
          <Text>Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            fetch("http://localhost:8000/iq/disconnect", { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` } })
              .then(() => {
                setConnected(false);
                setError("");
              })
              .catch(() => setError("Disconnect failed"));
          }}
        >
          <Text>Disconnect</Text>
        </TouchableOpacity>
      </View>
      <Text>Amount</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="10" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Timeframe</Text>
      <TextInput value={timeframe} onChangeText={setTimeframe} placeholder="5min" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Pairs</Text>
      <TextInput value={pairs} onChangeText={setPairs} placeholder="OTC pairs" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Strategy</Text>
      <TextInput value={strategy} onChangeText={setStrategy} placeholder="EMA" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Stop Loss</Text>
      <TextInput value={stopLoss} onChangeText={setStopLoss} placeholder="100" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Take Profit</Text>
      <TextInput value={takeProfit} onChangeText={setTakeProfit} placeholder="50" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Max Consecutive Losses</Text>
      <TextInput value={maxLosses} onChangeText={setMaxLosses} placeholder="3" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Max Trades</Text>
      <TextInput value={maxTrades} onChangeText={setMaxTrades} placeholder="20" style={{ borderWidth: 1, marginBottom: 8 }} />
      <TouchableOpacity
        onPress={() => {
          fetch("http://localhost:8000/iq/balance", { headers: { Authorization: `Bearer ${idToken}` } })
            .then(async (res) => {
              if (!res.ok) throw new Error("balance failed");
              const data = await res.json();
              setBalance(data.balance);
              setError("");
            })
            .catch(() => setError("Balance fetch failed"));
        }}
        style={{ marginBottom: 8 }}
      >
        <Text>Fetch Balance</Text>
      </TouchableOpacity>
      <Text>{balance !== null ? `Balance ${balance}` : ""}</Text>
      <Text style={{ color: "red" }}>{errorCode ? `Code ${errorCode}` : ""}</Text>
      <Text>Heartbeat latency {heartbeatLatency.toFixed(2)}s</Text>
      <Text>Heartbeat missed {missedCount}</Text>
      <Text>Rejects {rejectCount}</Text>
      <Text>Retries {retryCount}</Text>
      <TouchableOpacity
        disabled={!connected}
        onPress={() => {
          fetch("http://localhost:8000/session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({
              trade_amount: Number(amount || 10),
              timeframe: timeframe || "5min",
              pairs: pairs ? pairs.split(",").map(s => s.trim()) : ["EUR/USD"],
              strategy_id: strategy || "ema",
              stop_loss: Number(stopLoss || 100),
              take_profit: Number(takeProfit || 50),
              max_consecutive_losses: Number(maxLosses || 3),
              max_trades: Number(maxTrades || 20)
            })
          })
            .then(res => res.json())
            .then(data => {
              setSessionId(data.session_id);
              setError("");
            })
            .catch(() => setError("Start failed"));
        }}
      >
        <Text>Start Auto-Trading</Text>
      </TouchableOpacity>
      <View style={{ marginTop: 16 }}>
        <Text>Session P&L {pnl}</Text>
        <Text>Trades {trades}</Text>
        <Text>Wins {wins}</Text>
        <Text>Consecutive losses {lossStreak}</Text>
        <Text>{haltReason ? `Halt ${haltReason}` : ""}</Text>
        <Text style={{ color: "red" }}>{error}</Text>
        {(!connected && errorCode && errorCode.toLowerCase().includes("login")) && (
          <TouchableOpacity
            onPress={() => {
              fetch("http://localhost:8000/iq/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ username: iqUser, password: iqPass })
              })
                .then(async (res) => {
                  if (!res.ok) throw new Error("connect failed");
                  await res.json();
                  setConnected(true);
                  setError("");
                  setErrorCode("");
                })
                .catch(() => setError("Retry connect failed"));
            }}
            style={{ marginTop: 8 }}
          >
            <Text>Retry Connect</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => {
            if (!sessionId) return;
            fetch("http://localhost:8000/session/stop", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ session_id: sessionId })
            })
              .then(() => setError(""))
              .catch(() => setError("Stop failed"));
          }}
        >
          <Text>Emergency Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
