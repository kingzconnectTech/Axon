import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, Modal, Vibration, Platform } from "react-native";
import * as Notifications from 'expo-notifications';
import { API_URL, WS_URL } from "../config";

export default function SignalOnly({ idToken }) {
  const [strategy, setStrategy] = useState("EMA Crossover");
  const [pairs, setPairs] = useState("EUR/USD-OTC");
  const [timeframe, setTimeframe] = useState("1min");
  const [signals, setSignals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analyzingPair, setAnalyzingPair] = useState("");
  const [signalBanner, setSignalBanner] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [ws, setWs] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  
  // Selectors
  const [availablePairs, setAvailablePairs] = useState([]);
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [availableTimeframes] = useState(["1min", "2min", "3min", "4min", "5min", "15min", "1hour", "4hour", "1day"]);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [showStrategySelector, setShowStrategySelector] = useState(false);
  const [showTimeframeSelector, setShowTimeframeSelector] = useState(false);

  useEffect(() => {
     fetch(`${API_URL}/pairs`).then(r=>r.json()).then(d=>setAvailablePairs(d.pairs || [])).catch(e=>console.log(e));
     fetch(`${API_URL}/strategies`).then(r=>r.json()).then(d=>setAvailableStrategies(d.strategies || [])).catch(e=>console.log(e));
  }, []);

  const toggleStream = () => {
      if (isRunning) {
          stop();
      } else {
          start();
      }
  };

  const start = () => {
    setLogs(prev => [`Starting stream with ${strategy}...`, ...prev]);
    fetch(`${API_URL}/signal/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        strategy_id: strategy,
        pairs: pairs ? pairs.split(",").map(s => s.trim()) : ["EUR/USD-OTC"],
        timeframe: timeframe
      })
    })
      .then(res => res.json())
      .then(data => {
        setSessionId(data.session_id);
        setIsRunning(true);
        setLogs(prev => [`Session started: ${data.session_id}`, ...prev]);
      })
      .catch((e) => setLogs(prev => [`Error starting: ${e}`, ...prev]));
  };

  const stop = () => {
    if (sessionId) {
      fetch(`${API_URL}/signal/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ session_id: sessionId })
      })
      .then(() => {
          setIsRunning(false);
          setLogs(prev => ["Session stopped.", ...prev]);
      })
      .catch(() => {});
    } else {
        setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!idToken) return;

    // Check for active session
    fetch(`${API_URL}/me/sessions?limit=1`, { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const lastSession = data[0];
          if (lastSession.status === "running" && lastSession.mode === "signal") {
            setSessionId(lastSession.id);
            setIsRunning(true);
            setLogs(prev => [`Restored session: ${lastSession.id}`, ...prev]);
          }
        }
      })
      .catch(e => console.log("Failed to fetch sessions", e));

    let closed = false;
    let bannerTimer = null;
    const connect = () => {
      if (closed) return;
      const socket = new WebSocket(`${WS_URL}/ws/stream?token=${idToken}`);
      socket.onopen = () => {
          setLogs(prev => ["WebSocket connected.", ...prev]);
      };
      socket.onerror = () => {
        setLogs(prev => ["WebSocket error.", ...prev]);
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "signal") {
            const newSignal = { 
                pair: msg.pair, 
                direction: msg.direction, 
                confidence: msg.confidence, 
                timeframe: msg.timeframe,
                timestamp: new Date().toLocaleTimeString() 
            };
            setSignals(prev => [newSignal, ...prev]);
            const tf = msg.timeframe ? ` ${msg.timeframe}` : "";
            const bannerText = `Signal: ${msg.pair}${tf} ${msg.direction}`;
            setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${bannerText} (${msg.confidence}%)`, ...prev].slice(0, 100));
            setSignalBanner(bannerText);
            if (bannerTimer) clearTimeout(bannerTimer);
            bannerTimer = setTimeout(() => setSignalBanner(""), 4000);
            if (Platform.OS !== "web") {
                Vibration.vibrate(250);
                Notifications.scheduleNotificationAsync({
                    content: {
                        title: `Signal: ${msg.pair}`,
                        body: `${msg.direction} @ ${msg.confidence}% (${msg.timeframe || 'unknown'})`,
                        sound: 'default',
                    },
                    trigger: null,
                }).catch(e => console.log("Failed to schedule local notification", e));
            }
          } else if (msg.type === "log") {
              setLogs(prev => [`[${new Date(msg.timestamp * 1000).toLocaleTimeString()}] ${msg.message}`, ...prev].slice(0, 100));
              if (typeof msg.message === "string" && msg.message.startsWith("Analyzing ")) {
                setAnalyzingPair(msg.message.replace("Analyzing ", "").replace("...", ""));
              }
          } else if (msg.type === "session_halted") {
              setIsRunning(false);
              setLogs(prev => ["Session halted by server.", ...prev]);
          }
        } catch (e) {}
      };
      socket.onclose = () => {
        setLogs(prev => ["WebSocket disconnected. Reconnecting...", ...prev]);
        if (!closed) setTimeout(connect, 3000);
      };
      setWs(socket);
    };
    connect();
    return () => {
      closed = true;
      if (bannerTimer) clearTimeout(bannerTimer);
      try { ws && ws.close(); } catch (e) {}
    };
  }, [idToken]);

  const renderSignalItem = ({ item }) => {
      const isCall = item.direction?.toUpperCase() === 'CALL' || item.direction?.toUpperCase() === 'BUY';
      const color = isCall ? '#34C759' : '#FF3B30';
      return (
        <View style={[styles.signalCard, { borderLeftColor: color, borderLeftWidth: 6 }]}>
            <View style={styles.signalHeader}>
                <Text style={styles.pairText}>{item.pair}</Text>
                <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.badgeText, { color: color }]}>{item.direction}</Text>
                </View>
            </View>
            <Text style={styles.confidenceText}>Confidence: {item.confidence}%</Text>
            {item.timeframe ? <Text style={styles.timeText}>Timeframe: {item.timeframe}</Text> : null}
            <Text style={styles.timeText}>{item.timestamp}</Text>
        </View>
      );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
          <Text style={styles.title}>Signal Stream</Text>
          {analyzingPair ? <Text style={styles.subtitle}>Analyzing: {analyzingPair}</Text> : null}
          {signalBanner ? <Text style={styles.signalBanner}>{signalBanner}</Text> : null}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
          <TouchableOpacity onPress={() => setShowStrategySelector(true)} style={styles.selector}>
              <Text style={styles.selectorLabel}>Strategy</Text>
              <Text style={styles.selectorValue}>{strategy}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowTimeframeSelector(true)} style={styles.selector}>
              <Text style={styles.selectorLabel}>Timeframe</Text>
              <Text style={styles.selectorValue}>{timeframe}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPairSelector(true)} style={styles.selector}>
              <Text style={styles.selectorLabel}>Pairs</Text>
              <Text style={styles.selectorValue}>{pairs.length > 8 ? pairs.substring(0,8)+'...' : pairs}</Text>
          </TouchableOpacity>
      </View>

      <TouchableOpacity 
          onPress={toggleStream}
          style={[styles.mainButton, { backgroundColor: isRunning ? '#FF3B30' : '#007AFF' }]}
      >
          <Text style={styles.mainButtonText}>{isRunning ? "Stop Signal Stream" : "Start Signal Stream"}</Text>
      </TouchableOpacity>

      {/* Signals List */}
      <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Signals</Text>
          <FlatList
              data={signals}
              renderItem={renderSignalItem}
              keyExtractor={(item, index) => index.toString()}
              style={{ flex: 1 }}
          />
      </View>

      {/* Logs Section */}
      <View style={styles.logsContainer}>
          <Text style={styles.sectionTitle}>System Log</Text>
          <FlatList 
              data={logs}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => <Text style={styles.logText}>{item}</Text>}
          />
      </View>

      {/* Modals */}
      <Modal visible={showStrategySelector} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Strategy</Text>
                  <FlatList 
                      data={availableStrategies}
                      keyExtractor={item => item}
                      renderItem={({ item }) => (
                          <TouchableOpacity style={styles.modalItem} onPress={() => { setStrategy(item); setShowStrategySelector(false); }}>
                              <Text>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
                  <TouchableOpacity onPress={() => setShowStrategySelector(false)} style={styles.closeButton}><Text>Close</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showTimeframeSelector} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Timeframe</Text>
                  <FlatList 
                      data={availableTimeframes}
                      keyExtractor={item => item}
                      renderItem={({ item }) => (
                          <TouchableOpacity style={styles.modalItem} onPress={() => { setTimeframe(item); setShowTimeframeSelector(false); }}>
                              <Text>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
                  <TouchableOpacity onPress={() => setShowTimeframeSelector(false)} style={styles.closeButton}><Text>Close</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showPairSelector} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Pairs</Text>
                  <FlatList 
                      data={availablePairs}
                      keyExtractor={item => item}
                      renderItem={({ item }) => {
                          const isSelected = pairs.split(',').map(p=>p.trim()).includes(item);
                          return (
                              <TouchableOpacity 
                                  style={[styles.modalItem, isSelected && {backgroundColor: '#e0e0ff'}]} 
                                  onPress={() => {
                                      let current = pairs ? pairs.split(',').map(p=>p.trim()) : [];
                                      if (isSelected) current = current.filter(p => p !== item);
                                      else current.push(item);
                                      setPairs(current.join(', '));
                                  }}
                              >
                                  <Text>{item} {isSelected ? '✓' : ''}</Text>
                              </TouchableOpacity>
                          );
                      }}
                  />
                  <TouchableOpacity onPress={() => setShowPairSelector(false)} style={styles.closeButton}><Text>Done</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 10 },
  header: { marginBottom: 15 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { marginTop: 4, color: '#666' },
  signalBanner: { marginTop: 6, color: '#111', backgroundColor: '#FFE08A', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, alignSelf: 'flex-start' },
  controls: { flexDirection: 'row', marginBottom: 15 },
  selector: { backgroundColor: 'white', padding: 10, borderRadius: 8, flex: 1, marginHorizontal: 4 },
  selectorLabel: { fontSize: 12, color: '#666' },
  selectorValue: { fontSize: 14, fontWeight: 'bold' },
  mainButton: { padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  mainButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  listContainer: { flex: 1, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  signalCard: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 2 },
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  pairText: { fontSize: 16, fontWeight: 'bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  confidenceText: { color: '#666' },
  timeText: { color: '#999', fontSize: 12, marginTop: 5 },
  logsContainer: { height: 150, backgroundColor: 'black', borderRadius: 8, padding: 10 },
  logText: { color: '#00FF00', fontFamily: 'monospace', fontSize: 12, marginBottom: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  closeButton: { marginTop: 15, padding: 10, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 }
});
