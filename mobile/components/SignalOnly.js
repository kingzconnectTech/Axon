import React, { useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity } from "react-native";

export default function SignalOnly() {
  const [strategy, setStrategy] = useState("");
  const [pairs, setPairs] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [signals, setSignals] = useState([]);

  const start = () => {
    setSignals([{ pair: "EUR/USD", direction: "CALL", confidence: 0.7, timestamp: new Date().toISOString() }]);
  };

  const stop = () => {
    setSignals([]);
  };

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
