import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB1cwnQm2Tbn86kg83mgsxndTa0pnp39gc",
  authDomain: "axontrades911.firebaseapp.com",
  projectId: "axontrades911",
  storageBucket: "axontrades911.firebasestorage.app",
  messagingSenderId: "701391769522",
  appId: "1:701391769522:web:a855d2918bae779b711eab"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export async function ensureAuth() {
  const current = auth.currentUser;
  if (current) return current;
  const { user } = await signInAnonymously(auth);
  return user;
}
