import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut, sendPasswordResetEmail } from "firebase/auth";

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
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
export async function signInEmail(email, password) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return user;
}
export async function registerEmail(email, password) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  return user;
}
export async function signOut() {
  await fbSignOut(auth);
}
export async function requestPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}
