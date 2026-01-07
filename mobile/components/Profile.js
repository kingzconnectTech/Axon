import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { signOut } from "../firebase";

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
      <TouchableOpacity
        onPress={async () => {
          await signOut();
        }}
        style={{ marginVertical: 8 }}
      >
        <Text>Sign Out</Text>
      </TouchableOpacity>
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
