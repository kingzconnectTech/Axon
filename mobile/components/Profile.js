import React, { useEffect, useState } from "react";
import { View, Text, FlatList } from "react-native";

export default function Profile({ uid, idToken }) {
  const [sessions, setSessions] = useState([]);
  const [trades, setTrades] = useState([]);
  useEffect(() => {
    if (!idToken) return;
    fetch("http://localhost:8000/me/sessions", { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.json())
      .then(setSessions)
      .catch(() => {});
    fetch("http://localhost:8000/me/trades", { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.json())
      .then(setTrades)
      .catch(() => {});
  }, [idToken]);
  return (
    <View style={{ padding: 16 }}>
      <Text>User {uid}</Text>
      <Text>Sessions</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 6 }}>
            <Text>{item.id} {item.mode} {item.status} {item.trades} {item.profit}</Text>
          </View>
        )}
      />
      <Text>Trades</Text>
      <FlatList
        data={trades}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 6 }}>
            <Text>{item.session_id} {item.pair} {item.direction} {item.amount} {item.result} {item.pnl}</Text>
          </View>
        )}
      />
    </View>
  );
}
