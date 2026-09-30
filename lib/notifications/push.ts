import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabase } from "../supabase/client";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const SW_URL = "/firebase-messaging-sw.js";
const TOKEN_KEY = "devenish.pushToken";

export type PushState =
  | "unconfigured" // the site has no Firebase web config
  | "unsupported" // this browser can't do web push (e.g. iOS Safari outside a home-screen app)
  | "denied" // the user blocked notifications for this site
  | "off"
  | "on";

export const PUSH_CONFIGURED = !!(config.apiKey && config.projectId && config.messagingSenderId && config.appId && VAPID_KEY);

function app(): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}

const savedToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const saveToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

export async function pushState(): Promise<PushState> {
  if (!PUSH_CONFIGURED) return "unconfigured";
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (!(await isSupported().catch(() => false))) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted" || !savedToken()) return "off";
  // The token is only useful if it is still registered to this user.
  const { data } = await supabase.from("push_tokens").select("token").eq("token", savedToken()!).maybeSingle();
  return data ? "on" : "off";
}

async function registration() {
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

/** Asks for permission (if needed), gets this browser's FCM token and stores it for the signed-in user. */
export async function enablePush(userId: string): Promise<PushState> {
  const state = await pushState();
  if (state === "unconfigured" || state === "unsupported" || state === "denied") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const token = await getToken(getMessaging(app()), { vapidKey: VAPID_KEY, serviceWorkerRegistration: await registration() });
  if (!token) return "off";
  const { error } = await supabase
    .from("push_tokens")
    .upsert({ token, user_id: userId, user_agent: navigator.userAgent.slice(0, 300), last_seen_at: new Date().toISOString() });
  if (error) throw error;
  saveToken(token);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const token = savedToken();
  if (token) await supabase.from("push_tokens").delete().eq("token", token);
  try {
    await deleteToken(getMessaging(app()));
  } catch {}
  saveToken(null);
  return "off";
}

/** Keeps the service worker registered on every visit, so messages can reach an open page. */
export async function ensureWorker() {
  if (!PUSH_CONFIGURED || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (Notification.permission === "granted" && savedToken()) await registration().catch(() => {});
}
