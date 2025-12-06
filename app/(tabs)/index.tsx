// app/(tabs)/index.tsx

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Platform,
} from "react-native";

import { auth, db } from "../../firebase";

import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

import {
  collection,
  doc,
  onSnapshot,
  deleteDoc,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";

import {
  scheduleLocalAlarm,
  cancelLocalAlarmForDoc,
} from "../../scheduleAlarm";

WebBrowser.maybeCompleteAuthSession();

// ----------------------------------------------
//  🔥  GOOGLE CLIENT IDS — YOUR FINAL CORRECT ONES
// ----------------------------------------------
const ANDROID_CLIENT_ID =
  "369759286645-rf2ds3nnbhn4d7i9llf2gi1k3pjkbpcg.apps.googleusercontent.com";

const WEB_CLIENT_ID =
  "369759286645-2qcft7cupde1cvbonni1fku1l3640933.apps.googleusercontent.com";

// Expo client ID (for developing via Expo Go)
const EXPO_CLIENT_ID = WEB_CLIENT_ID;

// iOS client — optional (can reuse web id)
const IOS_CLIENT_ID = WEB_CLIENT_ID;

// ----------------------------------------------
//  🔔 Notification handler
// ----------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ----------------------------------------------
//  MAIN SCREEN
// ----------------------------------------------
export default function HomeScreen() {
  const [user, setUser] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);

  // Google auth hook
  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: EXPO_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
    scopes: ["profile", "email"],
  });

  const [alarms, setAlarms] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const unsubRef = useRef<null | (() => void)>(null);

  // ----------------------------------------------
  //  REQUEST NOTIFICATION PERMISSION
  // ----------------------------------------------
  useEffect(() => {
    (async () => {
      if (Device.isDevice && Platform.OS !== "web") {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Enable notifications for alarms.");
        }
      } else if (Platform.OS === "web") {
        if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
          await Notification.requestPermission();
        }
      }
    })();
  }, []);

  // ----------------------------------------------
  //  FIREBASE AUTH LISTENER
  // ----------------------------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (initializing) setInitializing(false);
    });
    return unsub;
  }, []);

  // ----------------------------------------------
  //  HANDLE GOOGLE OAUTH RESPONSE
  // ----------------------------------------------
  useEffect(() => {
    if (response?.type === "success") {
      const id_token = (response as any).authentication?.idToken;

      if (!id_token) {
        console.warn("No id_token in Google response");
        return;
      }

      const credential = GoogleAuthProvider.credential(id_token);

      signInWithCredential(auth, credential)
        .then(() => console.log("Google sign-in success"))
        .catch((err) => console.error("Google sign-in error:", err));
    }
  }, [response]);

  // ----------------------------------------------
  //  FIRESTORE ALARMS LISTENER
  // ----------------------------------------------
  useEffect(() => {
    if (!user) {
      setAlarms([]);
      if (unsubRef.current) unsubRef.current();
      return;
    }

    const colRef = collection(db, "users", user.uid, "alarms");

    const unsub = onSnapshot(colRef, async (snapshot) => {
      const array = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAlarms(array);

      for (const change of snapshot.docChanges()) {
        const alarmId = change.doc.id;
        const data: any = change.doc.data();

        if (change.type === "added") {
          await scheduleLocalAlarm({ id: alarmId, ...data });
        }

        if (change.type === "modified") {
          await cancelLocalAlarmForDoc(alarmId);
          await scheduleLocalAlarm({ id: alarmId, ...data });
        }

        if (change.type === "removed") {
          await cancelLocalAlarmForDoc(alarmId);
        }
      }
    });

    unsubRef.current = unsub;
    return () => unsub();
  }, [user]);

  // ----------------------------------------------
  //  SIGN OUT
  // ----------------------------------------------
  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch {}
  }

  // ----------------------------------------------
  //  CREATE ALARM
  // ----------------------------------------------
  async function handleCreateAlarm() {
    if (!newTitle || !newDate || !newTime) {
      Alert.alert("Missing fields", "Fill title, date, and time.");
      return;
    }
    if (!user) return;

    try {
      const id = `${Date.now()}`;
      const alarmRef = doc(db, "users", user.uid, "alarms", id);

      const ts = Timestamp.fromDate(new Date(`${newDate}T${newTime}:00`));

      await setDoc(alarmRef, {
        title: newTitle,
        time: ts,
        repeating: "none",
        triggered: false,
        createdAt: Timestamp.now(),
      });

      setNewTitle("");
      setNewDate("");
      setNewTime("");
    } catch (e) {
      Alert.alert("Create error", String(e));
    }
  }

  // ----------------------------------------------
  //  DELETE ALARM
  // ----------------------------------------------
  async function handleDelete(id: string) {
    if (!user) return;

    try {
      await cancelLocalAlarmForDoc(id);
      await deleteDoc(doc(db, "users", user.uid, "alarms", id));
    } catch (e) {
      Alert.alert("Delete error", String(e));
    }
  }

  // ----------------------------------------------
  //  UI
  // ----------------------------------------------
  if (initializing) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // SIGN-IN SCREEN
  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>FiG Alarm Login</Text>

        <TouchableOpacity
          style={styles.googleBtn}
          onPress={() => promptAsync({ useProxy: Platform.OS === "web" })}
        >
          <Text style={styles.googleText}>Sign in with Google</Text>
        </TouchableOpacity>

        <Text style={styles.info}>
          Use the same Google account as the FiG web dashboard.
        </Text>
      </View>
    );
  }

  // MAIN SCREEN
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FiG Alarm</Text>

      <View style={styles.row}>
        <Text style={styles.user}>Hello, {user.email}</Text>
        <TouchableOpacity style={styles.signoutBtn} onPress={handleSignOut}>
          <Text style={styles.signoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create Alarm</Text>

        <TextInput
          placeholder="Title"
          value={newTitle}
          onChangeText={setNewTitle}
          style={styles.input}
        />

        <TextInput
          placeholder="YYYY-MM-DD"
          value={newDate}
          onChangeText={setNewDate}
          style={styles.input}
        />

        <TextInput
          placeholder="HH:MM"
          value={newTime}
          onChangeText={setNewTime}
          style={styles.input}
        />

        <TouchableOpacity style={styles.createBtn} onPress={handleCreateAlarm}>
          <Text style={styles.createBtnText}>Add Alarm</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Your Alarms</Text>

      <FlatList
        data={alarms}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => {
          const t = item.time?.seconds
            ? new Date(item.time.seconds * 1000)
            : null;

          const formatted = t
            ? t.toISOString().replace("T", " ").slice(0, 16)
            : "Invalid time";

          return (
            <View style={styles.alarmCard}>
              <Text style={styles.alarmTitle}>{item.title}</Text>
              <Text style={styles.alarmTime}>{formatted}</Text>

              <TouchableOpacity
                style={styles.delBtn}
                onPress={() => handleDelete(item.id)}
              >
                <Text style={styles.delText}>Delete</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>No alarms yet</Text>
        )}
      />
    </View>
  );
}

// ----------------------------------------------
//  STYLES
// ----------------------------------------------
const styles: any = {
  container: { flex: 1, padding: 20, backgroundColor: "#F6F7FB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 16 },

  googleBtn: {
    backgroundColor: "#4285F4",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  googleText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  info: { marginTop: 12, textAlign: "center", color: "#666", fontSize: 13 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  user: { color: "#333", fontWeight: "600" },

  signoutBtn: {
    backgroundColor: "#e74c3c",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  signoutText: { color: "#fff", fontWeight: "600" },

  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
  },
  cardTitle: { fontWeight: "700", marginBottom: 10 },

  input: {
    borderWidth: 1,
    borderColor: "#dcdcdc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#fafafa",
  },

  createBtn: {
    backgroundColor: "#27ae60",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  section: { fontSize: 18, fontWeight: "700", marginVertical: 6 },

  alarmCard: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  alarmTitle: { fontWeight: "700" },
  alarmTime: { color: "#666", marginTop: 3 },

  delBtn: {
    marginTop: 8,
    backgroundColor: "#c0392b",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  delText: { color: "#fff", fontWeight: "700" },

  empty: { textAlign: "center", marginTop: 20, color: "#777" },
};
