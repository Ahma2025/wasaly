// تخزين التوكن في expo-secure-store (مع ترحيل تلقائي من AsyncStorage للنسخ القديمة)
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'driver_token';
export const USER_KEY = 'driver_user';
export const ONLINE_KEY = 'driver_online';

let memToken; // undefined = لم يُقرأ بعد

async function secureGet() {
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}

export async function getToken() {
  if (memToken !== undefined) return memToken;
  let t = await secureGet();
  if (!t) {
    // ترحيل من AsyncStorage (نسخ ≤ 2.3.0) — أو احتياط إن فشل SecureStore
    let legacy = null;
    try { legacy = await AsyncStorage.getItem(TOKEN_KEY); } catch {}
    if (legacy) {
      t = legacy;
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, legacy);
        await AsyncStorage.removeItem(TOKEN_KEY);
      } catch { /* يبقى في AsyncStorage كاحتياط */ }
    }
  }
  memToken = t || null;
  return memToken;
}

export async function setToken(t) {
  memToken = t || null;
  if (!t) return clearToken();
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, t);
    try { await AsyncStorage.removeItem(TOKEN_KEY); } catch {}
  } catch {
    try { await AsyncStorage.setItem(TOKEN_KEY, t); } catch {}
  }
}

export async function clearToken() {
  memToken = null;
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch {}
  try { await AsyncStorage.removeItem(TOKEN_KEY); } catch {}
}

// تُستدعى من مهمة الخلفية (سياق JS منفصل أحياناً) — بدون كاش الذاكرة
export async function readTokenFresh() {
  memToken = undefined;
  return getToken();
}

// يمسح كل بيانات الحساب المحلية (كاش الشاشات، حالة الاتصال، المستخدم، التوكن)
export async function clearAllUserData() {
  await clearToken();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(k =>
      k.startsWith('cache_') || k === USER_KEY || k === ONLINE_KEY || k === TOKEN_KEY || k.startsWith('driver_'));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {}
}

// ── فك JWT بـ JS خالص (Hermes على RN 0.73 لا يضمن atob ولا Buffer) ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];
  let buffer = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64.indexOf(clean[i]);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}
function utf8Decode(bytes) {
  let out = '', i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      let cp = ((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}
export function decodeJWT(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(utf8Decode(base64ToBytes(b64)));
  } catch { return null; }
}

export function isTokenExpired(token) {
  const p = decodeJWT(token);
  if (!p || !p.exp) return false;
  return p.exp * 1000 < Date.now();
}
