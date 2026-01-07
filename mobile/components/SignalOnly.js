import React, { useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity } from "react-native";

export default function SignalOnly({ idToken }) {
  const [strategy, setStrategy] = useState("");
  const [pairs, setPairs] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [signals, setSignals] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [ws, setWs] = useState(null);

  const start = () => {
    fetch("http://localhost:8000/signal/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        strategy_id: strategy || "ema",
        pairs: pairs ? pairs.split(",").map(s => s.trim()) : ["EUR/USD"],
        timeframe: timeframe || "5min"
      })
    })
      .then(res => res.json())
      .then(data => {
        setSessionId(data.session_id);
      })
      .catch(() => {});
  };

  const stop = () => {
    setSignals([]);
    if (sessionId) {
      fetch("http://localhost:8000/signal/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ session_id: sessionId })
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (!idToken) return;
    let attempt = 0;
    let closed = false;
    const connect = () => {
      if (closed) return;
      const socket = new WebSocket(`ws://localhost:8000/ws/stream?token=${idToken}`);
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "signal") {
            setSignals(prev => [{ pair: msg.pair, direction: msg.direction, confidence: msg.confidence, timestamp: new Date().toISOString() }, ...prev]);
          }
        } catch (e) {}
      };
      socket.onclose = () => {
        attempt += 1;
        const delay = Math.min(5000, 500 * Math.pow(2, attempt));
        setTimeout(connect, delay);
      };
      socket.onerror = () => {};
      setWs(socket);
    };
    connect();
    return () => {
      closed = true;
      try { ws && ws.close(); } catch (e) {}
    };
  }, [idToken]);

  return (
    <View style={{ padding: 16 }}>
      <Text>Pairs</Text>
      <TextInput value={pairs} onChangeText={setPairs} placeholder="EUR/USD, GBP/USD" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Strategy</Text>
      <TextInput value={strategy} onChangeText={setStrategy} placeholder="EMA" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Timeframe</Text>
      <TextInput value={timeframe} onChangeText={setTimeframe} placeholder="5min" style={{ borderWidth: 1, marginBottom: 8 }} />
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        <TouchableOpacity onPress={start} style={{ marginRight: 12 }}>
          <Text>Start</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={stop}>
          <Text>Stop</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={signals}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8 }}>
            <Text>{item.pair} {item.direction} {item.confidence}</Text>
            <Text>{item.timestamp}</Text>
          </View>
        )}
      />
    </View>
  );
}
