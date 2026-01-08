import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { signInEmail, registerEmail, requestPasswordReset } from "../firebase";

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return setError("Please enter email and password");
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const user = await signInEmail(email, password);
      onLoggedIn(user);
    } catch (e) {
      setError("Login failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password) return setError("Please enter email and password");
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const user = await registerEmail(email, password);
      onLoggedIn(user);
    } catch (e) {
      setError("Register failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) return setError("Please enter your email to reset password");
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await requestPasswordReset(email);
      setInfo("Password reset email sent. Check your inbox.");
    } catch (e) {
      setError("Reset failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Axon Trades</Text>
      
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#999"
          secureTextEntry
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {info ? <Text style={styles.infoText}>{info}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginVertical: 20 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleRegister}>
            <Text style={styles.secondaryButtonText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.textButton} onPress={handleReset}>
            <Text style={styles.textButtonLabel}>Forgot Password?</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 48,
    color: "#333",
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
  textButton: {
    marginTop: 24,
    alignItems: "center",
  },
  textButtonLabel: {
    color: "#666",
    fontSize: 14,
  },
  errorText: {
    color: "#ff3b30",
    textAlign: "center",
    marginBottom: 16,
  },
  infoText: {
    color: "#34c759",
    textAlign: "center",
    marginBottom: 16,
  },
});
