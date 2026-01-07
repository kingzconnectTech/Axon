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
    const unsub = watchAuth(async (user) => {
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
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-around", padding: 16 }}>
        <TouchableOpacity onPress={() => setTab("signal")}>
          <Text>Signal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("auto")}>
          <Text>Auto</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("profile")}>
          <Text>Profile</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        {!uid ? (
          <Login
            onLoggedIn={async (user) => {
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
    </SafeAreaView>
  );
}
