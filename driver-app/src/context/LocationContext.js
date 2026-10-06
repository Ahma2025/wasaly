// مسار موقع واحد للتطبيق كله:
// - مراقب مقدّمة واحد (watchPositionAsync) يعمل حين يكون السائق متصلاً أو لديه توصيل نشط
// - رفع الموقع (سوكِت + REST) بحدّ أقصى مرة كل ٥ ثوانٍ أثناء التوصيل
// - مهمة الخلفية فقط أثناء التوصيل النشط، وتتوقف عند انتهائه / عدم الاتصال / الخروج
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Alert, AppState, Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import api from '../utils/api';
import { emit as socketEmit, isSocketConnected } from '../utils/socket';
import { startBackgroundTracking, stopBackgroundTracking } from '../tasks/locationTask';
import { LOCATION_UPLOAD_MS, ANDROID_BACKGROUND_TRACKING } from '../config';

const LocationContext = createContext({});

const IDLE_UPLOAD_MS = 10000;      // متصل بدون توصيل: يكفي كل ١٠ ث لاختيار أقرب سائق
const REST_WHILE_SOCKET_MS = 20000; // أثناء التوصيل والسوكِت متصل: REST للتخزين فقط

const validCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

export function LocationProvider({ children }) {
  const [coords, setCoords] = useState(null);
  const [permission, setPermission] = useState('unknown');
  const coordsRef = useRef(null);
  const watcherRef = useRef(null);
  const watcherMode = useRef(null); // 'idle' | 'delivery' | null
  const trackingRef = useRef({ online: false, activeOrderId: null });
  const lastUpload = useRef(0);
  const lastRest = useRef(0);
  const permLock = useRef(Promise.resolve());
  const bgAskedThisSession = useRef(false);
  const mounted = useRef(true);

  const updateCoords = useCallback((lat, lng) => {
    if (!validCoords(lat, lng)) return;
    const c = { lat, lng, at: Date.now() };
    coordsRef.current = c;
    if (mounted.current) setCoords(c);
  }, []);

  // طلبات الأذونات بالتتابع (طلبان متزامنان يفشلان على أندرويد)
  const runExclusive = useCallback((fn) => {
    const next = permLock.current.then(fn, fn);
    permLock.current = next.catch(() => {});
    return next;
  }, []);

  const requestForeground = useCallback(async () => {
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.status === 'granted') { setPermission('granted'); return true; }
    } catch {}
    return runExclusive(async () => {
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.status === 'granted') { setPermission('granted'); return true; }
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status === 'granted' ? 'granted' : 'denied');
      return status === 'granted';
    } catch {
      setPermission('denied');
      return false;
    }
    });
  }, [runExclusive]);

  // قراءة موقع واحدة مع مهلة — احتياط: آخر موقع معروف
  const getFix = useCallback(async ({ timeoutMs = 8000, ask = true } = {}) => {
    try {
      const ok = ask ? await requestForeground() : permission === 'granted';
      if (!ok) return coordsRef.current;
      const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
      if (!servicesOn) return coordsRef.current;
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
        new Promise(r => setTimeout(() => r(null), timeoutMs)),
      ]);
      let lat = fix?.coords?.latitude, lng = fix?.coords?.longitude;
      if (!validCoords(lat, lng)) {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
        lat = last?.coords?.latitude; lng = last?.coords?.longitude;
      }
      if (validCoords(lat, lng)) { updateCoords(lat, lng); return { lat, lng }; }
    } catch {}
    return coordsRef.current;
  }, [requestForeground, permission, updateCoords]);

  const upload = useCallback((lat, lng, force = false) => {
    if (!validCoords(lat, lng)) return;
    const { online, activeOrderId } = trackingRef.current;
    if (!online && !activeOrderId) return;
    // التطبيق بالخلفية: مهمة الخلفية تتكفّل (أثناء التوصيل) — منع الرفع المزدوج
    if (AppState.currentState !== 'active' && !force) return;
    const now = Date.now();
    const minGap = activeOrderId ? LOCATION_UPLOAD_MS : IDLE_UPLOAD_MS;
    if (!force && now - lastUpload.current < minGap - 250) return;
    lastUpload.current = now;
    let socketSent = false;
    if (activeOrderId) {
      socketSent = socketEmit('driver:location', { lat, lng, orderId: activeOrderId, order_id: activeOrderId });
    }
    const restGap = activeOrderId && socketSent && isSocketConnected() ? REST_WHILE_SOCKET_MS : 0;
    if (force || now - lastRest.current >= restGap - 250) {
      lastRest.current = now;
      api.patch('/drivers/location', { lat, lng }).catch(() => {});
    }
  }, []);

  const stopWatcher = useCallback(() => {
    try { watcherRef.current?.remove(); } catch {}
    watcherRef.current = null;
    watcherMode.current = null;
  }, []);

  const startWatcher = useCallback(async (mode) => {
    if (watcherRef.current && watcherMode.current === mode) return;
    stopWatcher();
    watcherMode.current = mode;
    const ok = await requestForeground();
    if (!ok || watcherMode.current !== mode) return;
    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: mode === 'delivery' ? Location.Accuracy.High : Location.Accuracy.Balanced,
          timeInterval: mode === 'delivery' ? LOCATION_UPLOAD_MS : IDLE_UPLOAD_MS,
          distanceInterval: mode === 'delivery' ? 3 : 15,
        },
        (loc) => {
          const lat = loc?.coords?.latitude, lng = loc?.coords?.longitude;
          if (!validCoords(lat, lng)) return;
          updateCoords(lat, lng);
          upload(lat, lng);
        }
      );
      if (watcherMode.current !== mode) { sub.remove(); return; }
      watcherRef.current = sub;
    } catch {
      watcherMode.current = null;
    }
  }, [requestForeground, stopWatcher, updateCoords, upload]);

  const applyTracking = useCallback(() => {
    const { online, activeOrderId } = trackingRef.current;
    if (activeOrderId) startWatcher('delivery');
    else if (online) startWatcher('idle');
    else stopWatcher();
  }, [startWatcher, stopWatcher]);

  // يُستدعى من DriverContext عند تغيّر حالة الاتصال أو الطلب النشط
  const setTracking = useCallback((patch) => {
    const prev = trackingRef.current;
    const next = { ...prev, ...patch };
    trackingRef.current = next;
    if (prev.online !== next.online || prev.activeOrderId !== next.activeOrderId) {
      applyTracking();
      if (next.activeOrderId && next.activeOrderId !== prev.activeOrderId && coordsRef.current) {
        upload(coordsRef.current.lat, coordsRef.current.lng, true);
      }
    }
  }, [applyTracking, upload]);

  // إذن الخلفية مع إفصاح واضح قبل الطلب (سياسة Google Play) — ثم تشغيل المهمة
  const ensureBackgroundTracking = useCallback(() => runExclusive(async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        const r = await Location.requestForegroundPermissionsAsync();
        if (r.status !== 'granted') return false;
      }
      if (Platform.OS === 'android' && !ANDROID_BACKGROUND_TRACKING) return false; // موقوف مؤقتاً (إقرار Google Play)
      let bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        if (bgAskedThisSession.current) return false;
        bgAskedThisSession.current = true;
        const agreed = await new Promise(resolve => {
          Alert.alert(
            'مشاركة موقعك أثناء التوصيل',
            'وصلّي يجمع بيانات موقعك حتى عندما يكون التطبيق مغلقاً أو غير مستخدم، وذلك فقط أثناء توصيل طلب قبلته، لعرض مكانك للزبون والمطعم وحساب وقت الوصول.\n\nيتوقف التتبّع تلقائياً عند انتهاء التوصيل.' +
              (Platform.OS === 'android' ? '\n\nفي الشاشة التالية اختر "السماح طوال الوقت".' : ''),
            [
              { text: 'ليس الآن', style: 'cancel', onPress: () => resolve(false) },
              { text: 'موافق', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        });
        if (!agreed) return false;
        bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status !== 'granted') {
          if (bg.canAskAgain === false) {
            Alert.alert('تتبّع الخلفية غير مفعّل', 'سيُشارك موقعك فقط والتطبيق مفتوح. يمكنك تفعيله من الإعدادات.', [
              { text: 'لاحقاً', style: 'cancel' },
              { text: 'الإعدادات', onPress: () => Linking.openSettings().catch(() => {}) },
            ]);
          }
          return false;
        }
      }
      return await startBackgroundTracking();
    } catch {
      return false;
    }
  }), [runExclusive]);

  const stopBackground = useCallback(async () => {
    await stopBackgroundTracking();
  }, []);

  // عند العودة للتطبيق: تأكد أن المراقب يعمل وارفع موقعاً فورياً
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        applyTracking();
        if (coordsRef.current) upload(coordsRef.current.lat, coordsRef.current.lng);
      }
    });
    return () => sub.remove();
  }, [applyTracking, upload]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopWatcher(); };
  }, [stopWatcher]);

  return (
    <LocationContext.Provider value={{
      coords, coordsRef, permission,
      requestForeground, getFix, setTracking,
      ensureBackgroundTracking, stopBackground,
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export const useDriverLocation = () => useContext(LocationContext);
