// سوكِت واحد مشترك لكل التطبيق — إعادة اتصال تلقائية + معالجة رفض المصادقة (connect_error)
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import { getToken } from './storage';

let socket = null;
let connecting = null;
let retryTimer = null;
let retryDelay = 2000;
let appStateSub = null;
let stopped = true;
const listeners = new Map(); // event -> Set<handler>
const statusListeners = new Set();

function notifyStatus() {
  const c = !!socket?.connected;
  statusListeners.forEach(fn => { try { fn(c); } catch {} });
}

function dispatch(event, args) {
  const set = listeners.get(event);
  if (!set) return;
  set.forEach(fn => { try { fn(...args); } catch (e) { /* لا نكسر بقية المستمعين */ } });
}

function scheduleRetry() {
  if (stopped || retryTimer) return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (stopped || !socket || socket.connected) return;
    const token = await getToken();
    if (!token) { disconnectSocket(); return; }
    socket.auth = { token }; // توكن جديد إن تغيّر
    try { socket.connect(); } catch {}
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30000);
}

export async function connectSocket() {
  stopped = false;
  if (socket) {
    if (!socket.connected && !socket.active) scheduleRetry();
    return socket;
  }
  if (connecting) return connecting;
  connecting = (async () => {
    const token = await getToken();
    if (!token || stopped) return null;
    const s = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 15000,
    });
    s.onAny((event, ...args) => dispatch(event, args));
    s.on('connect', () => { retryDelay = 2000; notifyStatus(); dispatch('__reconnected', []); });
    s.on('disconnect', (reason) => {
      notifyStatus();
      // السيرفر قطع الاتصال عمداً → socket.io لا يعيد الاتصال تلقائياً
      if (reason === 'io server disconnect') scheduleRetry();
    });
    s.on('connect_error', () => {
      notifyStatus();
      // رفض من middleware المصادقة: socket.active=false ولا إعادة تلقائية
      if (!s.active) scheduleRetry();
    });
    socket = s;
    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', (st) => {
        if (st === 'active' && socket && !socket.connected && !stopped) {
          retryDelay = 1000;
          if (!socket.active) scheduleRetry();
        }
      });
    }
    return s;
  })();
  try { return await connecting; } finally { connecting = null; }
}

export function disconnectSocket() {
  stopped = true;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (socket) {
    try { socket.removeAllListeners(); socket.offAny(); socket.disconnect(); } catch {}
    socket = null;
  }
  if (appStateSub) { try { appStateSub.remove(); } catch {} appStateSub = null; }
  notifyStatus();
}

export function subscribe(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => { listeners.get(event)?.delete(handler); };
}

export function onConnectionChange(handler) {
  statusListeners.add(handler);
  return () => statusListeners.delete(handler);
}

export function emit(event, payload) {
  if (socket?.connected) { socket.emit(event, payload); return true; }
  return false;
}

export function isSocketConnected() { return !!socket?.connected; }

// هوك: يستمع لحدث مع أحدث نسخة من الدالة (بدون إغلاقات قديمة)
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(event, (...a) => ref.current && ref.current(...a)), [event]);
}
