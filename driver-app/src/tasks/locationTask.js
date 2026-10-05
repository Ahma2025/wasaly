// مهمة تتبّع الموقع في الخلفية — تعمل فقط أثناء توصيل نشط (تُشغَّل/تُوقف من LocationContext)
import { AppState } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { API_BASE, LOCATION_UPLOAD_MS } from '../config';
import { readTokenFresh } from '../utils/storage';

export const LOCATION_TASK = 'wasaly-driver-location';

let lastSent = 0;
let lastCheck = 0;
const CHECK_EVERY_MS = 60000;

async function stopSelf() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {}
}

// تُعرّف مرة واحدة عند إقلاع التطبيق (تُستورد من App.js)
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  try {
    const { locations } = data;
    const loc = locations && locations[locations.length - 1];
    const lat = loc?.coords?.latitude;
    const lng = loc?.coords?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return; // لا نرسل إحداثيات فارغة أبداً

    const token = await readTokenFresh();
    if (!token) { await stopSelf(); return; } // خرج السائق → أوقف الخدمة

    const now = Date.now();
    // تحقّق دوري: إن لم يعد هناك توصيل نشط (أو انتهت الجلسة) نوقف الخدمة بأنفسنا
    if (now - lastCheck > CHECK_EVERY_MS) {
      lastCheck = now;
      try {
        const r = await fetch(`${API_BASE}/drivers/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 401) { await stopSelf(); return; }
        if (r.ok) {
          const j = await r.json();
          const o = j?.data?.active_order;
          const offer = o && (o.is_offer === true || j?.data?.is_offer === true);
          const accepted = o && !offer && (o.status === 'on_the_way' || (o.driver_assigned_at !== undefined ? !!o.driver_assigned_at : ['preparing', 'ready'].includes(o.status)));
          if (!accepted) { await stopSelf(); return; }
        }
      } catch { /* شبكة مؤقتة */ }
    }

    // التطبيق ظاهر: مراقب المقدّمة في LocationContext يتكفّل بالرفع (منع التكرار)
    if (AppState.currentState === 'active') return;
    if (now - lastSent < LOCATION_UPLOAD_MS - 300) return;
    lastSent = now;
    await fetch(`${API_BASE}/drivers/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat, lng }),
    });
  } catch { /* تجاهل أخطاء الشبكة المؤقتة في الخلفية */ }
});

export async function isBackgroundTrackingRunning() {
  try { return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK); } catch { return false; }
}

export async function startBackgroundTracking() {
  try {
    if (await isBackgroundTrackingRunning()) return true;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_UPLOAD_MS,
      distanceInterval: 8,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'وصلّي - مندوب',
        notificationBody: 'يتم مشاركة موقعك مع الزبون أثناء التوصيل',
        notificationColor: '#FF6B00',
      },
    });
    lastCheck = Date.now();
    return true;
  } catch (e) {
    return false;
  }
}

export async function stopBackgroundTracking() {
  await stopSelf();
}
