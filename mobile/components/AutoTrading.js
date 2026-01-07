import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";

export default function AutoTrading() {
  const [connected, setConnected] = useState(false);
  const [amount, setAmount] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [pairs, setPairs] = useState("");
  const [strategy, setStrategy] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [maxLosses, setMaxLosses] = useState("");
  const [maxTrades, setMaxTrades] = useState("");

  return (
    <View style={{ padding: 16 }}>
      <Text>Status {connected ? "Connected" : "Disconnected"}</Text>
      <View style={{ flexDirection: "row", marginVertical: 8 }}>
        <TouchableOpacity onPress={() => setConnected(true)} style={{ marginRight: 12 }}>
          <Text>Connect IQ Option</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setConnected(false)}>
          <Text>Disconnect</Text>
        </TouchableOpacity>
      </View>
      <Text>Amount</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="10" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Timeframe</Text>
      <TextInput value={timeframe} onChangeText={setTimeframe} placeholder="5min" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Pairs</Text>
      <TextInput value={pairs} onChangeText={setPairs} placeholder="OTC pairs" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Strategy</Text>
      <TextInput value={strategy} onChangeText={setStrategy} placeholder="EMA" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Stop Loss</Text>
      <TextInput value={stopLoss} onChangeText={setStopLoss} placeholder="100" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Take Profit</Text>
      <TextInput value={takeProfit} onChangeText={setTakeProfit} placeholder="50" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Max Consecutive Losses</Text>
      <TextInput value={maxLosses} onChangeText={setMaxLosses} placeholder="3" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Max Trades</Text>
      <TextInput value={maxTrades} onChangeText={setMaxTrades} placeholder="20" style={{ borderWidth: 1, marginBottom: 8 }} />
      <TouchableOpacity disabled={!connected}>
        <Text>Start Auto-Trading</Text>
      </TouchableOpacity>
      <View style={{ marginTop: 16 }}>
        <Text>Session P&L 0</Text>
        <Text>Trades 0 / 0</Text>
        <Text>Consecutive losses 0</Text>
        <TouchableOpacity>
          <Text>Emergency Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
