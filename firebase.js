// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyANmG9mm9sZhfpKDmhGnt94eJ7UWOrNh38",
  authDomain: "gps-tracker-demo-e5667.firebaseapp.com",
  projectId: "gps-tracker-demo-e5667",
  storageBucket: "gps-tracker-demo-e5667.firebasestorage.app",
  messagingSenderId: "369759286645",
  appId: "1:369759286645:web:72acf3faece79c61d28f3c"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
