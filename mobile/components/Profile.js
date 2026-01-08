import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { signOut } from "../firebase";
import { API_URL } from "../config";

export default function Profile({ uid, idToken }) {
  const [sessions, setSessions] = useState([]);
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    if (!idToken) return;
    fetch(`${API_URL}/me/sessions`, { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => Array.isArray(data) ? setSessions(data) : setSessions([]))
      .catch(() => setSessions([]));
    fetch(`${API_URL}/me/trades`, { headers: { Authorization: `Bearer ${idToken}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => Array.isArray(data) ? setTrades(data) : setTrades([]))
      .catch(() => setTrades([]));
  }, [idToken]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Profile</Text>
      
      {/* User Card */}
      <View style={styles.card}>
        <View style={styles.userInfo}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{uid ? uid.substring(0, 2).toUpperCase() : "U"}</Text>
            </View>
            <View style={styles.userDetails}>
                <Text style={styles.userLabel}>User ID</Text>
                <Text style={styles.userId} numberOfLines={1} ellipsizeMode="middle">{uid}</Text>
            </View>
        </View>
        <TouchableOpacity
            onPress={async () => {
            await signOut();
            }}
            style={styles.signOutButton}
        >
            <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeader}>Recent Sessions</Text>
      {sessions.length === 0 ? (
        <Text style={styles.emptyText}>No sessions found.</Text>
      ) : (
        sessions.map((item) => (
            <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemRow}>
                    <Text style={styles.itemTitle}>{item.mode} Mode</Text>
                    <Text style={[styles.statusText, { color: item.status === 'active' ? '#34C759' : '#8E8E93' }]}>
                        {item.status}
                    </Text>
                </View>
                <View style={styles.itemRow}>
                    <Text style={styles.itemDetail}>Trades: {item.trades}</Text>
                    <Text style={[styles.itemDetail, { fontWeight: "bold", color: (item.profit || 0) >= 0 ? "#34C759" : "#FF3B30" }]}>
                        ${item.profit}
                    </Text>
                </View>
            </View>
        ))
      )}

      <Text style={styles.sectionHeader}>Recent Trades</Text>
      {trades.length === 0 ? (
        <Text style={styles.emptyText}>No trades found.</Text>
      ) : (
        trades.map((item) => (
            <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemRow}>
                    <Text style={styles.itemTitle}>{item.pair}</Text>
                    <Text style={[styles.directionText, { color: item.direction === 'CALL' ? '#34C759' : '#FF3B30' }]}>
                        {item.direction}
                    </Text>
                </View>
                <View style={styles.itemRow}>
                    <Text style={styles.itemDetail}>Amount: ${item.amount}</Text>
                    <Text style={[styles.itemDetail, { 
                        fontWeight: "bold", 
                        color: item.result === 'win' ? '#34C759' : (item.result === 'loss' ? '#FF3B30' : '#8E8E93') 
                    }]}>
                        {item.result ? item.result.toUpperCase() : 'PENDING'} (${item.pnl})
                    </Text>
                </View>
            </View>
        ))
      )}
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#F2F2F7",
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#000",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E5E5EA",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#8E8E93",
  },
  userDetails: {
    flex: 1,
  },
  userLabel: {
    fontSize: 12,
    color: "#8E8E93",
  },
  userId: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1C1C1E",
  },
  signOutButton: {
    backgroundColor: "#F2F2F7",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: {
    color: "#FF3B30",
    fontWeight: "600",
    fontSize: 16,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    marginTop: 12,
    color: "#1C1C1E",
  },
  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  itemDetail: {
    fontSize: 14,
    color: "#8E8E93",
  },
  directionText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  emptyText: {
    color: "#8E8E93",
    fontStyle: "italic",
    marginBottom: 16,
  },
});
