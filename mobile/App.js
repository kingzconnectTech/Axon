import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, TouchableOpacity } from "react-native";
import SignalOnly from "./components/SignalOnly";
import AutoTrading from "./components/AutoTrading";
import Profile from "./components/Profile";
import { ensureAuth, auth } from "./firebase";

export default function App() {
  const [tab, setTab] = useState("signal");
  const [uid, setUid] = useState(null);
  const [idToken, setIdToken] = useState(null);

  useEffect(() => {
    (async () => {
      const user = await ensureAuth();
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
    })();
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
        {tab === "signal" && <SignalOnly idToken={idToken} />}
        {tab === "auto" && <AutoTrading idToken={idToken} />}
        {tab === "profile" && <Profile uid={uid} idToken={idToken} />}
      </View>
    </SafeAreaView>
  );
}
