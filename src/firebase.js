import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD39OoqoCtoShWYaolb0fGMCV-yarnGtw0",
  authDomain: "interval-app-d0b1e.firebaseapp.com",
  projectId: "interval-app-d0b1e",
  storageBucket: "interval-app-d0b1e.firebasestorage.app",
  messagingSenderId: "505311169636",
  appId: "1:505311169636:web:cde08a6635bac2f6c36371",
  measurementId: "G-WQ7SCBZWR0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and Export Auth so App.jsx can use it
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);