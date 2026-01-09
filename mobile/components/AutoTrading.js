import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Modal, FlatList, Vibration, Platform } from "react-native";
import * as Notifications from 'expo-notifications';
import { API_URL, WS_URL } from "../config";

export default function AutoTrading({ idToken }) {
  const [connected, setConnected] = useState(false);
  const [iqUser, setIqUser] = useState("");
  const [iqPass, setIqPass] = useState("");
  const [accountType, setAccountType] = useState("PRACTICE");
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
  const [connectRetryMinutes, setConnectRetryMinutes] = useState(null);
  const [heartbeatLatency, setHeartbeatLatency] = useState(0);
  const [missedCount, setMissedCount] = useState(0);
  const [rejectCount, setRejectCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [analyzingPair, setAnalyzingPair] = useState("");
  const [signalBanner, setSignalBanner] = useState("");

  // Selector state
  const [availablePairs, setAvailablePairs] = useState([]);
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [showStrategySelector, setShowStrategySelector] = useState(false);
  const [showTimeframeSelector, setShowTimeframeSelector] = useState(false);
  
  const timeframes = ["1min", "2min", "3min", "4min", "5min", "15min", "30min", "1hr", "4hr", "1day"];

  const adviceForCode = (code) => {
    if (!code) return "";
    const c = String(code).toUpperCase();
    if (c === "RATE_LIMIT" || c.includes("RATE_LIMIT")) return "Rate limit hit. Wait and retry or reduce requests.";
    if (c === "INSTRUMENT_CLOSED" || c.includes("INSTRUMENT_CLOSED")) return "Instrument closed. Choose a different pair.";
    if (c === "MARKET_CLOSED") return "Market closed. Check schedule and retry when open.";
    if (c.includes("INSUFFICIENT_FUNDS")) return "Insufficient funds. Top up your account.";
    if (c.includes("TRADE_EXPIRED")) return "Trade expired. Try placing a new trade.";
    if (c.includes("LOGIN_FAILED") || c.includes("AUTH_FAILED")) return "Authentication failed. Check credentials.";
    return "";
  };

  const parseIqConnectError = (rawText) => {
    const raw = String(rawText || "");
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.detail === "string") detail = parsed.detail;
    } catch (e) {}

    const firstBrace = detail.indexOf("{");
    const lastBrace = detail.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const innerStr = detail.slice(firstBrace, lastBrace + 1);
      try {
        const inner = JSON.parse(innerStr);
        const ttlSeconds = Number(inner.ttl);
        const retryMinutes = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.ceil(ttlSeconds / 60) : null;
        return {
          message: typeof inner.message === "string" ? inner.message : detail,
          retryMinutes,
        };
      } catch (e) {}
    }

    return { message: detail, retryMinutes: null };
  };

  const connectIq = () => {
    console.log("Connect button pressed");
    setIsLoading(true);
    setError("");
    setConnectRetryMinutes(null);
    fetch(`${API_URL}/iq/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ username: iqUser, password: iqPass, account_type: accountType })
    })
      .then(async (res) => {
        console.log("Connect response status:", res.status);
        if (!res.ok) {
          const errText = await res.text();
          console.log("Connect error body:", errText);
          throw new Error(errText || "connect failed");
        }
        await res.json();
        setConnected(true);
        setError("");
        setConnectRetryMinutes(null);
      })
      .catch((e) => {
        console.log("Connect exception:", e);
        const parsed = parseIqConnectError(e?.message);
        setError("Connect failed: " + (parsed.message || e?.message || "connect failed"));
        setConnectRetryMinutes(parsed.retryMinutes);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    // Fetch options
    fetch(`${API_URL}/pairs`).then(r=>r.json()).then(d=>setAvailablePairs(d.pairs || [])).catch(e=>console.log(e));
    fetch(`${API_URL}/strategies`).then(r=>r.json()).then(d=>setAvailableStrategies(d.strategies || [])).catch(e=>console.log(e));

    if (!idToken) return;
    
    // Check for active session
    fetch(`${API_URL}/me/sessions?limit=1`, { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const lastSession = data[0];
          if (lastSession.status === "running" && lastSession.mode === "auto") {
            setSessionId(lastSession.id);
            setPnl(lastSession.profit || 0);
            setTrades(lastSession.trades || 0);
            setHaltReason("");
            console.log("Restored session:", lastSession.id);
          }
        }
      })
      .catch(e => console.log("Failed to fetch sessions", e));

    fetch(`${API_URL}/iq/status`, { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.json())
      .then(data => {
        setConnected(!!data.connected);
        setError("");
      })
      .catch(() => setError("Status check failed"));
    let attempt = 0;
    let closed = false;
    let bannerTimer = null;
    const connectWs = () => {
      if (closed) return;
      const socket = new WebSocket(`${WS_URL}/ws/stream?token=${idToken}`);
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
          } else if (msg.type === "signal") {
            const tf = msg.timeframe ? ` ${msg.timeframe}` : "";
            const bannerText = `Signal: ${msg.pair}${tf} ${msg.direction}`;
            setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${bannerText} (${msg.confidence}%)`, ...prev]);
            setSignalBanner(bannerText);
            if (bannerTimer) clearTimeout(bannerTimer);
            bannerTimer = setTimeout(() => setSignalBanner(""), 4000);
            if (Platform.OS !== "web") {
                Vibration.vibrate(250);
                Notifications.scheduleNotificationAsync({
                    content: {
                        title: `Auto Trade Signal: ${msg.pair}`,
                        body: `${msg.direction} @ ${msg.confidence}% (${msg.timeframe || 'unknown'})`,
                        sound: 'default',
                    },
                    trigger: null,
                }).catch(e => console.log("Failed to schedule local notification", e));
            }
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
          } else if (msg.type === "log") {
            setLogs(prev => [`[${new Date(msg.timestamp * 1000).toLocaleTimeString()}] ${msg.message}`, ...prev]);
            if (typeof msg.message === "string" && msg.message.startsWith("Analyzing ")) {
              setAnalyzingPair(msg.message.replace("Analyzing ", "").replace("...", ""));
            }
          }
        } catch (e) {}
      };
      socket.onerror = () => {};
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
      if (bannerTimer) clearTimeout(bannerTimer);
      try { ws && ws.close(); } catch (e) {}
    };
  }, [idToken]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Dashboard Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Live Dashboard</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>P&L</Text>
            <Text style={[styles.statValue, { color: pnl >= 0 ? "#34C759" : "#FF3B30" }]}>
              ${pnl.toFixed(2)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Trades</Text>
            <Text style={styles.statValue}>{trades}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Wins</Text>
            <Text style={styles.statValue}>{wins}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Loss Streak</Text>
            <Text style={styles.statValue}>{lossStreak}</Text>
          </View>
        </View>
        
        {/* System Health */}
        <View style={styles.healthContainer}>
            <View style={styles.healthRow}>
                <Text style={styles.healthText}>Latency: {heartbeatLatency.toFixed(2)}s</Text>
                <Text style={styles.healthText}>Missed: {missedCount}</Text>
            </View>
            <View style={styles.healthRow}>
                <Text style={styles.healthText}>Rejects: {rejectCount}</Text>
                <Text style={styles.healthText}>Retries: {retryCount}</Text>
            </View>
            {analyzingPair ? (
              <View style={styles.healthRow}>
                <Text style={styles.healthText}>Analyzing: {analyzingPair}</Text>
              </View>
            ) : null}
            {signalBanner ? (
              <View style={styles.healthRow}>
                <Text style={styles.healthText}>{signalBanner}</Text>
              </View>
            ) : null}
        </View>

        {haltReason ? (
          <View style={styles.alertBox}>
            <Text style={styles.alertText}>HALTED: {haltReason}</Text>
          </View>
        ) : null}
        
        {error ? (
           <View style={styles.errorBox}>
             <Text style={styles.errorText}>{error}</Text>
             {errorCode ? <Text style={styles.errorCode}>Code: {errorCode}</Text> : null}
             {!!adviceForCode(errorCode) && (
                <Text style={styles.adviceText}>{adviceForCode(errorCode)}</Text>
             )}
           </View>
        ) : null}
      </View>

      {/* Connection Section */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>IQ Option Connection</Text>
            <View style={[styles.statusBadge, { backgroundColor: connected ? "#34C759" : "#FF3B30" }]}>
                <Text style={styles.statusText}>{connected ? "Connected" : "Disconnected"}</Text>
            </View>
        </View>
        
        <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput 
                value={iqUser} 
                onChangeText={setIqUser} 
                placeholder="email@example.com" 
                style={styles.input} 
                autoCapitalize="none"
            />
        </View>
        <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput 
                value={iqPass} 
                onChangeText={setIqPass} 
                placeholder="••••••••" 
                secureTextEntry 
                style={styles.input} 
            />
        </View>

        <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Type</Text>
            <View style={{ flexDirection: 'row', marginTop: 5 }}>
                <TouchableOpacity 
                    onPress={() => setAccountType("PRACTICE")}
                    style={{
                        flex: 1, 
                        padding: 10, 
                        backgroundColor: accountType === "PRACTICE" ? "#007AFF" : "#f0f0f0",
                        borderTopLeftRadius: 8,
                        borderBottomLeftRadius: 8,
                        alignItems: 'center'
                    }}
                >
                    <Text style={{ color: accountType === "PRACTICE" ? "#fff" : "#333", fontWeight: '600' }}>Demo</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => setAccountType("REAL")}
                    style={{
                        flex: 1, 
                        padding: 10, 
                        backgroundColor: accountType === "REAL" ? "#007AFF" : "#f0f0f0",
                        borderTopRightRadius: 8,
                        borderBottomRightRadius: 8,
                        alignItems: 'center'
                    }}
                >
                    <Text style={{ color: accountType === "REAL" ? "#fff" : "#333", fontWeight: '600' }}>Real</Text>
                </TouchableOpacity>
            </View>
        </View>

        <View style={styles.buttonRow}>
            <TouchableOpacity
              disabled={isLoading}
              onPress={connectIq}
              style={[styles.button, styles.primaryButton, { flex: 1, marginRight: 8, opacity: isLoading ? 0.7 : 1 }]}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Connect</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                fetch(`${API_URL}/iq/disconnect`, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` } })
                  .then(() => {
                    setConnected(false);
                    setError("");
                  })
                  .catch(() => setError("Disconnect failed"));
              }}
              style={[styles.button, styles.outlineButton, { flex: 1 }]}
            >
              <Text style={styles.outlineButtonText}>Disconnect</Text>
            </TouchableOpacity>
        </View>

        {typeof connectRetryMinutes === "number" && connectRetryMinutes > 0 ? (
          <View style={styles.retryBox}>
            <Text style={styles.retryText}>Try again in {connectRetryMinutes} minutes.</Text>
          </View>
        ) : null}
        
        {(!connected && errorCode && errorCode.toLowerCase().includes("login")) && (
             <TouchableOpacity
             onPress={() => {
               connectIq();
             }}
             style={[styles.button, styles.secondaryButton, { marginTop: 10 }]}
           >
             <Text style={styles.buttonText}>Retry Connect</Text>
           </TouchableOpacity>
        )}

        <View style={styles.balanceRow}>
            <TouchableOpacity
                onPress={() => {
                fetch(`${API_URL}/iq/balance`, { headers: { Authorization: `Bearer ${idToken}` } })
                    .then(async (res) => {
                    if (!res.ok) throw new Error("balance failed");
                    const data = await res.json();
                    setBalance(data.balance);
                    setError("");
                    })
                    .catch(() => setError("Balance fetch failed"));
                }}
                style={styles.linkButton}
            >
                <Text style={styles.linkText}>Refresh Balance</Text>
            </TouchableOpacity>
            <Text style={styles.balanceText}>{balance !== null ? `$${balance} (${accountType})` : "---"}</Text>
        </View>
      </View>

      {/* Trading Configuration */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trading Configuration</Text>
        
        <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Amount ($)</Text>
                <TextInput 
                    value={amount} 
                    onChangeText={setAmount} 
                    placeholder="10" 
                    keyboardType="numeric"
                    style={styles.input} 
                />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Timeframe</Text>
                <TouchableOpacity onPress={() => setShowTimeframeSelector(true)} style={[styles.input, { justifyContent: 'center' }]}>
                    <Text style={{ color: timeframe ? '#000' : '#aaa' }}>{timeframe || "5min"}</Text>
                </TouchableOpacity>
            </View>
        </View>

        <View style={styles.inputGroup}>
            <Text style={styles.label}>Strategy</Text>
            <TouchableOpacity onPress={() => setShowStrategySelector(true)} style={[styles.input, { justifyContent: 'center' }]}>
                <Text style={{ color: strategy ? '#000' : '#aaa' }}>{strategy || "Select Strategy"}</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
            <Text style={styles.label}>Pairs</Text>
            <TouchableOpacity onPress={() => setShowPairSelector(true)} style={[styles.input, { justifyContent: 'center' }]}>
                <Text style={{ color: pairs ? '#000' : '#aaa' }} numberOfLines={1}>{pairs || "Select Pairs"}</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* Risk Management */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Risk Management</Text>
        
        <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Stop Loss ($)</Text>
                <TextInput 
                    value={stopLoss} 
                    onChangeText={setStopLoss} 
                    placeholder="100" 
                    keyboardType="numeric"
                    style={styles.input} 
                />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Take Profit ($)</Text>
                <TextInput 
                    value={takeProfit} 
                    onChangeText={setTakeProfit} 
                    placeholder="50" 
                    keyboardType="numeric"
                    style={styles.input} 
                />
            </View>
        </View>

        <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Max Cons. Losses</Text>
                <TextInput 
                    value={maxLosses} 
                    onChangeText={setMaxLosses} 
                    placeholder="3" 
                    keyboardType="numeric"
                    style={styles.input} 
                />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Max Trades</Text>
                <TextInput 
                    value={maxTrades} 
                    onChangeText={setMaxTrades} 
                    placeholder="20" 
                    keyboardType="numeric"
                    style={styles.input} 
                />
            </View>
        </View>
      </View>

      {/* Main Actions */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
            disabled={!connected && !sessionId}
            onPress={() => {
                if (sessionId) {
                    // STOP TRADING
                    fetch(`${API_URL}/session/stop`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                        body: JSON.stringify({ session_id: sessionId })
                    })
                    .then(() => {
                        setSessionId(null);
                        setError("");
                    })
                    .catch(() => setError("Stop failed"));
                } else {
                    // START TRADING
                    fetch(`${API_URL}/session/start`, {
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
                        setHaltReason(""); // Clear previous halt reason
                    })
                    .catch(() => setError("Start failed"));
                }
            }}
            style={[
                styles.mainButton, 
                { backgroundColor: sessionId ? "#FF3B30" : (connected ? "#007AFF" : "#A0A0A0") }
            ]}
        >
            <Text style={styles.mainButtonText}>
                {sessionId ? "Stop Trading" : "Start Auto-Trading"}
            </Text>
        </TouchableOpacity>
      </View>
      
      {/* Logs Section */}
      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>System Log</Text>
        <View style={{ height: 150, backgroundColor: 'black', borderRadius: 8, padding: 10 }}>
            <ScrollView nestedScrollEnabled={true}>
                {logs.map((item, index) => (
                    <Text key={index} style={{ color: '#00FF00', fontFamily: 'monospace', fontSize: 12, marginBottom: 2 }}>{item}</Text>
                ))}
            </ScrollView>
        </View>
      </View>

      <View style={{ height: 40 }} />

      {/* Selectors */}
      <Modal visible={showTimeframeSelector} animationType="slide" transparent={true} onRequestClose={() => setShowTimeframeSelector(false)}>
          <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <View style={{ margin: 20, backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '80%' }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Select Timeframe</Text>
                  <FlatList 
                      data={timeframes}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => (
                          <TouchableOpacity 
                              style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                              onPress={() => { setTimeframe(item); setShowTimeframeSelector(false); }}
                          >
                              <Text style={{fontSize: 16}}>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
                  <TouchableOpacity onPress={() => setShowTimeframeSelector(false)} style={{ marginTop: 15, padding: 10, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 }}>
                      <Text style={{ color: 'red', fontWeight: 'bold' }}>Cancel</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showStrategySelector} animationType="slide" transparent={true} onRequestClose={() => setShowStrategySelector(false)}>
          <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <View style={{ margin: 20, backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '80%' }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Select Strategy</Text>
                  <FlatList 
                      data={availableStrategies}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => (
                          <TouchableOpacity 
                              style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                              onPress={() => { setStrategy(item); setShowStrategySelector(false); }}
                          >
                              <Text style={{fontSize: 16}}>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
                  <TouchableOpacity onPress={() => setShowStrategySelector(false)} style={{ marginTop: 15, padding: 10, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 }}>
                      <Text style={{ color: 'red', fontWeight: 'bold' }}>Cancel</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showPairSelector} animationType="slide" transparent={true} onRequestClose={() => setShowPairSelector(false)}>
          <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <View style={{ margin: 20, backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '80%' }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Select Pairs</Text>
                  <FlatList 
                      data={availablePairs}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => {
                          const selected = pairs.split(',').map(p=>p.trim()).includes(item);
                          return (
                              <TouchableOpacity 
                                  style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                                  onPress={() => { 
                                      let current = pairs ? pairs.split(',').map(p=>p.trim()).filter(p=>p) : [];
                                      if (selected) {
                                          current = current.filter(p => p !== item);
                                      } else {
                                          current.push(item);
                                      }
                                      setPairs(current.join(', '));
                                  }}
                              >
                                  <Text style={{fontSize: 16}}>{item}</Text>
                                  {selected && <Text style={{ color: '#007AFF', fontWeight: 'bold', fontSize: 18 }}>✓</Text>}
                              </TouchableOpacity>
                          );
                      }}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
                       <TouchableOpacity onPress={() => setPairs(availablePairs.join(', '))} style={{ padding: 10, backgroundColor: '#f0f0f0', borderRadius: 8, flex: 1, marginRight: 5, alignItems: 'center' }}>
                          <Text style={{ color: '#007AFF' }}>Select All</Text>
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => setPairs("")} style={{ padding: 10, backgroundColor: '#f0f0f0', borderRadius: 8, flex: 1, marginRight: 5, marginLeft: 5, alignItems: 'center' }}>
                          <Text style={{ color: '#FF3B30' }}>Clear</Text>
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => setShowPairSelector(false)} style={{ padding: 10, backgroundColor: '#007AFF', borderRadius: 8, flex: 1, marginLeft: 5, alignItems: 'center' }}>
                          <Text style={{ color: 'white', fontWeight: 'bold' }}>Done</Text>
                       </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: "#F2F2F7",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: "#1C1C1E",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  statItem: {
    width: "50%",
    padding: 8,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1C1C1E",
  },
  healthContainer: {
    backgroundColor: "#F2F2F7",
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  healthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  healthText: {
    fontSize: 10,
    color: "#8E8E93",
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: "#3A3A3C",
    marginBottom: 6,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#F2F2F7",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#1C1C1E",
  },
  row: {
    flexDirection: "row",
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  button: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#007AFF",
  },
  secondaryButton: {
    backgroundColor: "#5856D6",
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#007AFF",
    backgroundColor: "transparent",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  outlineButtonText: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 16,
  },
  helperLink: {
    marginTop: 4,
    alignSelf: "flex-end",
  },
  helperText: {
    color: "#007AFF",
    fontSize: 12,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  linkButton: {
    padding: 4,
  },
  linkText: {
    color: "#007AFF",
    fontWeight: "500",
  },
  balanceText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1C1C1E",
  },
  actionContainer: {
    marginTop: 8,
  },
  mainButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  mainButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  stopButton: {
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FF3B30",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  stopButtonText: {
    color: "#FF3B30",
    fontSize: 18,
    fontWeight: "bold",
  },
  alertBox: {
    backgroundColor: "#FFECEC",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  alertText: {
    color: "#FF3B30",
    fontWeight: "bold",
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "#FF3B30",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: {
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
  },
  errorCode: {
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    fontSize: 12,
    marginTop: 4,
  },
  adviceText: {
    color: "#fff",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  retryBox: {
    backgroundColor: "#FFF4E5",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FF9500",
  },
  retryText: {
    color: "#FF9500",
    fontWeight: "bold",
    textAlign: "center",
  },
});
