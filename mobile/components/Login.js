import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { signInEmail, registerEmail, requestPasswordReset } from "../firebase";

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  return (
    <View style={{ padding: 16 }}>
      <Text>Email</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="email" autoCapitalize="none" style={{ borderWidth: 1, marginBottom: 8 }} />
      <Text>Password</Text>
      <TextInput value={password} onChangeText={setPassword} placeholder="password" secureTextEntry style={{ borderWidth: 1, marginBottom: 8 }} />
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        <TouchableOpacity
          onPress={async () => {
            try {
              const user = await signInEmail(email, password);
              setError("");
              setInfo("");
              onLoggedIn(user);
            } catch (e) {
              setError("Login failed");
            }
          }}
          style={{ marginRight: 12 }}
        >
          <Text>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            try {
              const user = await registerEmail(email, password);
              setError("");
              setInfo("");
              onLoggedIn(user);
            } catch (e) {
              setError("Register failed");
            }
          }}
        >
          <Text>Register</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={async () => {
          try {
            await requestPasswordReset(email);
            setError("");
            setInfo("Password reset email sent");
          } catch (e) {
            setError("Reset failed");
            setInfo("");
          }
        }}
        style={{ marginBottom: 12 }}
      >
        <Text>Forgot Password</Text>
      </TouchableOpacity>
      <Text style={{ color: "red" }}>{error}</Text>
      <Text style={{ color: "green" }}>{info}</Text>
    </View>
  );
}
