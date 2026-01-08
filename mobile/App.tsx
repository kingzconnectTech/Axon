import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, TouchableOpacity } from "react-native";
import SignalOnly from "./components/SignalOnly";
import AutoTrading from "./components/AutoTrading";
import Profile from "./components/Profile";
import { watchAuth } from "./firebase";
import Login from "./components/Login";

export default function App() {
  const [tab, setTab] = useState("signal");
  const [uid, setUid] = useState(null);
  const [idToken, setIdToken] = useState(null);

  useEffect(() => {
    const unsub = watchAuth(async (user: any) => {
      if (user) {
        const token = await user.getIdToken();
        setIdToken(token);
        setUid(user.uid);
        try {
          const res = await fetch("http://localhost:8000/auth/verify-token", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
          await res.json();
        } catch (e) {}
      } else {
        setUid(null);
        setIdToken(null);
      }
    });
    return () => unsub && unsub();
  }, []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
      <View style={{ flex: 1 }}>
        {!uid ? (
          <Login
            onLoggedIn={async (user: any) => {
              const token = await user.getIdToken();
              setIdToken(token);
              setUid(user.uid);
            }}
          />
        ) : (
          <>
            {tab === "signal" && <SignalOnly idToken={idToken} />}
            {tab === "auto" && <AutoTrading idToken={idToken} />}
            {tab === "profile" && <Profile uid={uid} idToken={idToken} />}
          </>
        )}
      </View>
      {uid && (
        <View style={{ flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#ddd", paddingBottom: 20, paddingTop: 10 }}>
          <TouchableOpacity 
            onPress={() => setTab("signal")} 
            style={{ flex: 1, alignItems: "center", opacity: tab === "signal" ? 1 : 0.5 }}
          >
            <Text style={{ color: "#007AFF", fontWeight: "600" }}>Signals</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setTab("auto")} 
            style={{ flex: 1, alignItems: "center", opacity: tab === "auto" ? 1 : 0.5 }}
          >
            <Text style={{ color: "#007AFF", fontWeight: "600" }}>Auto Trade</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setTab("profile")} 
            style={{ flex: 1, alignItems: "center", opacity: tab === "profile" ? 1 : 0.5 }}
          >
            <Text style={{ color: "#007AFF", fontWeight: "600" }}>Profile</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
