// scheduleAlarm.js
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/*
  scheduleLocalAlarm(alarm)
    alarm: { id, title, time (Firestore Timestamp object OR ISO string), notes?, repeating? }
    returns { localId } (native) or { webTimeoutId } (web)

  cancelLocalAlarmForDoc(alarmDocId)
    cancels scheduled alarm using stored mapping
*/

const MAP_KEY = "localAlarmMap_v2";

// helpers to persist mapping (alarmDocId -> localId or timeoutId)
async function getLocalAlarmMap() {
  try {
    if (Platform.OS === "web") {
      const raw = localStorage.getItem(MAP_KEY);
      return raw ? JSON.parse(raw) : {};
    } else {
      const raw = await AsyncStorage.getItem(MAP_KEY);
      return raw ? JSON.parse(raw) : {};
    }
  } catch (e) {
    console.warn("getLocalAlarmMap error", e);
    return {};
  }
}

async function saveLocalAlarmMap(map) {
  try {
    const raw = JSON.stringify(map);
    if (Platform.OS === "web") {
      localStorage.setItem(MAP_KEY, raw);
    } else {
      await AsyncStorage.setItem(MAP_KEY, raw);
    }
  } catch (e) {
    console.warn("saveLocalAlarmMap error", e);
  }
}

function asDateFromAlarm(alarm) {
  try {
    if (!alarm) return null;
    // Firestore Timestamp shape
    if (alarm.time && typeof alarm.time === "object" && alarm.time.seconds) {
      return new Date(alarm.time.seconds * 1000);
    }
    // ISO string or JS Date
    if (alarm.time && typeof alarm.time === "string") {
      return new Date(alarm.time);
    }
    if (alarm.date && alarm.time) {
      return new Date(`${alarm.date}T${alarm.time}:00`);
    }
    return null;
  } catch (e) {
    console.warn("asDateFromAlarm error", e);
    return null;
  }
}

export async function scheduleLocalAlarm(alarm) {
  try {
    const date = asDateFromAlarm(alarm);
    if (!date || isNaN(date.getTime())) {
      console.warn("Invalid date for alarm", alarm);
      return null;
    }

    // if native (Expo)
    if (Platform.OS !== "web") {
      // ensure notifications permissions are granted
      if (Device.isDevice) {
        // schedule via expo-notifications
        const trigger = { date };
        const localId = await Notifications.scheduleNotificationAsync({
          content: {
            title: alarm.title || "Alarm",
            body: alarm.notes || "It's time",
            data: { alarmId: alarm.id }
          },
          trigger
        });

        const map = await getLocalAlarmMap();
        map[alarm.id] = { platform: "native", id: localId };
        await saveLocalAlarmMap(map);
        console.log("Scheduled native alarm", alarm.id, localId);
        return { localId };
      } else {
        console.warn("Not a physical device — notifications may not work");
      }
    }

    // web fallback: Notification API + setTimeout (works only while tab open)
    if (Platform.OS === "web") {
      // request permission if needed
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        await Notification.requestPermission();
      }
      const now = Date.now();
      const delay = date.getTime() - now;
      if (delay <= 0) {
        // fire immediately as fallback
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(alarm.title || "Alarm", { body: alarm.notes || "It's time" });
        } else {
          console.log("Notification (web) fallback: ", alarm.title);
        }
        return { webTimeoutId: null };
      }
      const timeoutId = setTimeout(() => {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(alarm.title || "Alarm", { body: alarm.notes || "It's time" });
        } else {
          console.log("Notification (web) fallback fired:", alarm.title);
        }
      }, delay);

      // persist mapping (store timeout id so we can cancel during same session)
      const map = await getLocalAlarmMap();
      map[alarm.id] = { platform: "web", id: timeoutId };
      await saveLocalAlarmMap(map);
      console.log("Scheduled web alarm", alarm.id, timeoutId);
      return { webTimeoutId: timeoutId };
    }

    return null;
  } catch (e) {
    console.warn("scheduleLocalAlarm error", e);
    return null;
  }
}

export async function cancelLocalAlarmForDoc(alarmDocId) {
  try {
    const map = await getLocalAlarmMap();
    const entry = map[alarmDocId];
    if (!entry) return false;

    if (entry.platform === "native") {
      try {
        await Notifications.cancelScheduledNotificationAsync(entry.id);
      } catch (e) {
        console.warn("cancel native error", e);
      }
    } else if (entry.platform === "web") {
      try {
        clearTimeout(entry.id);
      } catch (e) {
        console.warn("cancel web timeout error", e);
      }
    }

    delete map[alarmDocId];
    await saveLocalAlarmMap(map);
    console.log("Canceled alarm local for doc", alarmDocId);
    return true;
  } catch (e) {
    console.warn("cancelLocalAlarmForDoc error", e);
    return false;
  }
}
