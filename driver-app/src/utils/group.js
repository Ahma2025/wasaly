// 🧺 الطلب المجمّع (عدة مطاعم — سائق واحد): توحيد شكل البيانات + أدوات عرض + فتح تطبيقات الملاحة
// العقد: D:\wasaly-study\MULTI_CONTRACT.md — المال على مستوى المجموعة فقط (لا نجمع مال الأبناء)
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { num, haversineKm } from './format';

export const gid = (v) => (v == null ? '' : String(v));
export const groupKey = (id) => `g${gid(id)}`; // مفتاح منفصل عن معرّفات الطلبات العادية

const round2 = (n) => Math.round(n * 100) / 100;
const qtyOf = (items) => (Array.isArray(items) ? items.reduce((s, it) => s + (parseInt(it?.quantity, 10) || 1), 0) : null);

// يدمج أي مصدر (حمولة السوكِت new_order_request / GroupView / ردّ القبول) في شكل واحد ثابت
export function normalizeGroup(src, prev = null) {
  if (!src && !prev) return null;
  const s = src || {};
  const p = prev || {};
  const id = s.group_id ?? s.id ?? p.id;
  const orders = Array.isArray(s.orders) ? s.orders : (Array.isArray(p.orders) ? p.orders : []);
  const prevStops = Array.isArray(p.stops) ? p.stops : [];
  const rawStops = Array.isArray(s.stops) ? s.stops : prevStops;
  const stops = rawStops.map((st) => {
    const oid = st.order_id ?? st.id;
    const old = prevStops.find(x => gid(x.order_id) === gid(oid)) || {};
    const child = orders.find(o => gid(o.order_id ?? o.id) === gid(oid)) || {};
    const items = qtyOf(child.items);
    return {
      ...old,
      ...st,
      order_id: oid,
      name: st.name || child.restaurant_name || old.name || 'المطعم',
      lat: st.lat != null ? num(st.lat) || null : (old.lat ?? (child.restaurant_lat != null ? num(child.restaurant_lat) || null : null)),
      lng: st.lng != null ? num(st.lng) || null : (old.lng ?? (child.restaurant_lng != null ? num(child.restaurant_lng) || null : null)),
      phone: st.phone ?? child.restaurant_phone ?? old.phone ?? null,
      address: st.address ?? child.restaurant_address ?? old.address ?? null,
      status: st.status || child.status || old.status || 'preparing',
      picked: st.picked != null ? !!st.picked : (child.picked_up_at ? true : !!old.picked),
      sequence: parseInt(st.sequence ?? st.stop_sequence ?? child.stop_sequence ?? old.sequence, 10) || 0,
      items_count: items != null ? items : (old.items_count ?? null),
      subtotal: child.subtotal != null ? num(child.subtotal) : (old.subtotal ?? null),
    };
  }).sort((a, b) => (a.sequence || 99) - (b.sequence || 99));

  const dropoff = s.dropoff || (s.delivery_lat != null
    ? { lat: num(s.delivery_lat), lng: num(s.delivery_lng), address: s.delivery_address || '' }
    : p.dropoff) || { lat: null, lng: null, address: '' };

  const merged = { ...p, ...s };
  const driverFee = num(merged.driver_fee);
  const tip = num(merged.tip);
  return {
    ...merged,
    id,
    group_id: id,
    is_group: true,
    stops,
    orders,
    dropoff: { lat: num(dropoff.lat) || null, lng: num(dropoff.lng) || null, address: dropoff.address || s.delivery_address || p.delivery_address || '' },
    driver_fee: driverFee,
    tip,
    driver_earning: s.driver_earning != null ? num(s.driver_earning) : round2(driverFee + tip),
    cash_to_collect: num(merged.cash_to_collect),
    stops_total: stops.length || parseInt(merged.stops_count ?? merged.stops_total, 10) || 0,
  };
}


export const groupNo = (g) => (g ? (g.group_number || g.id) : '');
export const groupEarning = (g) => (g ? num(g.driver_earning != null ? g.driver_earning : num(g.driver_fee) + num(g.tip)) : 0);
export const pickedCount = (g) => (g?.stops || []).filter(s => s.picked).length;
export const allPicked = (g) => !!g && (g.status === 'on_the_way' || ((g.stops || []).length > 0 && g.stops.every(s => s.picked)));
export const nextStop = (g) => (g?.stops || []).find(s => !s.picked) || null;

// هل هذه المجموعة مهمة مقبولة لهذا السائق؟
export function isGroupAccepted(g) {
  if (!g) return false;
  if (g.is_offer === true) return false;
  if (!['picking_up', 'on_the_way'].includes(g.status)) return false;
  return !!g.driver_assigned_at || g.is_offer === false;
}

// حالة المحطة كما يراها السائق
export function stopState(s) {
  if (!s) return { label: '—', tone: 'gray', icon: 'ellipse' };
  if (s.picked || s.status === 'on_the_way' || s.status === 'delivered') return { label: 'تم الاستلام', tone: 'green', icon: 'checkmark-done' };
  if (s.status === 'ready') return { label: 'جاهز للاستلام', tone: 'purple', icon: 'bag-check' };
  if (s.status === 'pending') return { label: 'بانتظار المطعم', tone: 'amber', icon: 'hourglass' };
  return { label: 'قيد التحضير', tone: 'brand', icon: 'flame' };
}

// مسافات المسار المقترح: السائق → المحطة ١ → ٢ → ... → الزبون
export function routeLegs(g, from) {
  const stops = g?.stops || [];
  const legs = [];
  let cur = from && Number.isFinite(from.lat) ? { lat: from.lat, lng: from.lng } : null;
  stops.forEach((s) => {
    const d = cur ? haversineKm(cur.lat, cur.lng, s.lat, s.lng) : null;
    legs.push(d);
    if (s.lat && s.lng) cur = { lat: s.lat, lng: s.lng };
  });
  const last = stops.length ? stops[stops.length - 1] : null;
  const toDrop = last ? haversineKm(last.lat, last.lng, g?.dropoff?.lat, g?.dropoff?.lng) : null;
  const total = [...legs, toDrop].reduce((sum, d) => sum + (d || 0), 0);
  return { legs, toDrop, total: total > 0 ? total : null };
}

// ترتيب المحطات غير المستلمة بأقرب جار من موقع السائق — نفس خوارزمية السيرفر عند القبول (recomputeRoute)
// فيرى السائق في نافذة العرض نفس الترتيب الذي سيظهر له بعد القبول
export function routeOrder(stops, from) {
  const list = Array.isArray(stops) ? stops : [];
  if (!from || !Number.isFinite(from.lat) || !Number.isFinite(from.lng)) return list;
  const picked = list.filter(s => s.picked);
  const rest = list.filter(s => !s.picked);
  const ordered = [...picked];
  let cur = { lat: from.lat, lng: from.lng };
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((s, i) => {
      const d = haversineKm(cur.lat, cur.lng, s.lat, s.lng);
      const v = d == null ? Infinity : d;
      if (v < bd) { bd = v; bi = i; }
    });
    const nx = rest.splice(bi, 1)[0];
    ordered.push(nx);
    if (nx.lat && nx.lng) cur = { lat: num(nx.lat), lng: num(nx.lng) };
  }
  return ordered;
}

// ── الملاحة: نفس المساعد للطلب العادي والمجمّع، ويتذكّر التطبيق المختار ──
const NAV_PREF_KEY = 'pref_nav_app'; // ليس driver_* حتى يبقى بعد تسجيل الخروج (تفضيل جهاز)
export const NAV_APPS = {
  google: 'Google Maps',
  waze: 'Waze',
  ...(Platform.OS === 'ios' ? { apple: 'Apple Maps' } : {}),
};
let navPref; // undefined = لم يُقرأ بعد
export async function getNavPref() {
  if (navPref !== undefined) return navPref;
  try { navPref = (await AsyncStorage.getItem(NAV_PREF_KEY)) || null; } catch { navPref = null; }
  if (navPref && !NAV_APPS[navPref]) navPref = null;
  return navPref;
}
export async function setNavPref(app) {
  navPref = app && NAV_APPS[app] ? app : null;
  try {
    if (navPref) await AsyncStorage.setItem(NAV_PREF_KEY, navPref);
    else await AsyncStorage.removeItem(NAV_PREF_KEY);
  } catch {}
}

function launch(app, lat, lng) {
  const google = () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
    .catch(() => Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}`).catch(() => {}));
  if (app === 'waze') return Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`).catch(google);
  if (app === 'apple') return Linking.openURL(`http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`).catch(google);
  return google();
}

export async function openNavigation(lat, lng, label = '') {
  if (!lat || !lng) { Alert.alert('الموقع غير متوفر', 'لا توجد إحداثيات لهذه النقطة'); return; }
  const pref = await getNavPref();
  if (pref) { launch(pref, lat, lng); return; }
  // أول مرة فقط: نسأل ونحفظ الاختيار (يمكن تغييره من "حسابي ← تطبيق الملاحة")
  const buttons = Object.keys(NAV_APPS).map(k => ({ text: NAV_APPS[k], onPress: () => { setNavPref(k); launch(k, lat, lng); } }));
  buttons.push({ text: 'إلغاء', style: 'cancel' });
  Alert.alert('اختر تطبيق الملاحة', `${label ? `الوجهة: ${label}\n` : ''}سنتذكّر اختيارك للمرات القادمة — يمكنك تغييره من صفحة حسابي.`, buttons, { cancelable: true });
}

export function callPhone(phone) {
  if (!phone) { Alert.alert('غير متوفر', 'رقم الهاتف غير متوفر'); return; }
  Linking.openURL(`tel:${phone}`).catch(() => {});
}
