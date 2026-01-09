import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, TouchableOpacity, Platform } from "react-native";
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import SignalOnly from "./components/SignalOnly";
import AutoTrading from "./components/AutoTrading";
import Profile from "./components/Profile";
import { watchAuth } from "./firebase";
import Login from "./components/Login";
import { API_URL } from "./config";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return;
    }
    try {
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
      if (!projectId) {
        console.warn("Project ID not found. Run 'npx eas-cli init' to configure push notifications.");
        return null;
      }
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      return token;
    } catch (e) {
      console.log("Push Token Error:", e);
    }
  }
  return null;
}

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
          // Verify Token
          const res = await fetch(`${API_URL}/auth/verify-token`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
          await res.json();
          
          // Register Push Token
          registerForPushNotificationsAsync().then(pushToken => {
            if (pushToken) {
              console.log("Push Token:", pushToken);
              fetch(`${API_URL}/auth/push-token`, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json", 
                  Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ token: pushToken })
              }).catch(e => console.log("Send token error:", e));
            }
          });
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
