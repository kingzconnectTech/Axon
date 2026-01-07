import React, { useState } from "react";
import { SafeAreaView, View, Text, TouchableOpacity } from "react-native";
import SignalOnly from "./components/SignalOnly";
import AutoTrading from "./components/AutoTrading";
import Profile from "./components/Profile";

export default function App() {
  const [tab, setTab] = useState("signal");
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
        {tab === "signal" && <SignalOnly />}
        {tab === "auto" && <AutoTrading />}
        {tab === "profile" && <Profile />}
      </View>
    </SafeAreaView>
  );
}
