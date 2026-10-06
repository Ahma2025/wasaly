import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FiMap, FiRefreshCw, FiCrosshair, FiPackage, FiTruck, FiUser, FiNavigation, FiLayers, FiWifiOff } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { statusLabel, statusMeta, groupStatusMeta, money, num, isPersonal, isGroup, fmtTime, driverAssigned, driverOfferPending } from '../utils/format';
import { arCount, ofTotal } from '../utils/plural';
import { PageHeader, StatTile, StatusChip, IconButton, Button, useVisiblePolling } from '../components/ui';
import { Sk } from '../components/Skeleton';
import GroupDetail, { GroupStatusChip } from '../components/GroupDetail';

const CENTER = [32.313, 35.029];
const POLL_MS = 8000;

/** يبني محتوى popup كعناصر DOM بنصوص آمنة (textContent) — لا HTML من المستخدمين أبداً */
function popupNode(lines) {
  const root = document.createElement('div');
  root.style.minWidth = '160px';
  lines.filter(l => l && l[0] != null && String(l[0]).trim() !== '').forEach(([text, bold], i) => {
    const el = document.createElement('div');
    el.textContent = String(text ?? '');
    if (bold) { el.style.fontWeight = '800'; el.style.fontSize = '14px'; el.style.color = '#14142B'; }
    if (i > 0) { el.style.fontSize = '12px'; el.style.color = '#4E4B66'; el.style.marginTop = '3px'; }
    root.appendChild(el);
  });
  return root;
}

// أيقونات ثابتة (نص الدبوس إيموجي أو رقم محطة فقط — بلا بيانات مستخدم) — دبابيس بحلقة نبض للعناصر الحية
const ICON_CACHE = {};
function icon(glyph, bg, ring, pulse = false) {
  const key = glyph + bg + ring + pulse;
  if (!ICON_CACHE[key]) {
    const safe = String(glyph).replace(/[<>&"']/g, '');
    ICON_CACHE[key] = L.divIcon({
      html: `<div class="map-pin${pulse ? ' pulse' : ''}" style="background:${bg};color:${ring};font-weight:900">${safe}</div>`,
      className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
    });
  }
  return ICON_CACHE[key];
}

const valid = (lat, lng) => {
  const a = parseFloat(lat), b = parseFloat(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0) ? [a, b] : null;
};
const samePt = (a, b) => a && b && Math.abs(a.lat - b[0]) < 1e-7 && Math.abs(a.lng - b[1]) < 1e-7;

/** سطر السائق — المعروض عليه الطلب ليس «سائق الطلب» قبل القبول (X-03) */
const driverLine = (o) => (driverAssigned(o) ? { text: `🛵 ${o.driver_name || 'سائق'}`, warn: false }
  : o.order_type === 'pickup' ? { text: '🏃 استلام من المحل', warn: false }
  : driverOfferPending(o) ? { text: '⏳ بانتظار قبول سائق', warn: true }
  : { text: '⏳ بلا سائق بعد', warn: true });

export default function LiveOps() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map()); // key → { layer, sig, kind }
  const fittedRef = useRef(false);
  const pointsRef = useRef({});
  const allPtsRef = useRef([]);
  const inFlight = useRef(false);
  const reqId = useRef(0);
  const pickupCache = useRef({}); // id → {pickup_lat,…} للخادم القديم الذي لا يرسلها — A-01
  const cached = readCache('adm_liveops');
  const [data, setData] = useState(cached || { orders: [], drivers: [] });
  const [loaded, setLoaded] = useState(!!cached);
  const [loadError, setLoadError] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [focused, setFocused] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [pickupTick, setPickupTick] = useState(0);

  // حارس «طلب واحد بالطيران» + رقم طلب: الردود القديمة لا تكتب فوق الأحدث — A-10
  const load = useCallback(() => {
    if (inFlight.current) return Promise.resolve();
    inFlight.current = true;
    const rid = ++reqId.current;
    setRefreshing(true);
    return api.get('/admin/live-ops')
      .then(r => {
        if (rid !== reqId.current) return;
        const d = { orders: r.orders || r.data?.orders || [], drivers: r.drivers || r.data?.drivers || [] };
        setData(d); writeCache('adm_liveops', d); setUpdatedAt(new Date()); setLoadError(false); setLoaded(true);
      })
      .catch(() => { if (rid === reqId.current) setLoadError(true); })
      .finally(() => { inFlight.current = false; setRefreshing(false); });
  }, []);

  // init map (Leaflet مضمّن في الحزمة — يعمل بدون CDN)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let ro;
    try {
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(CENTER, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 250);
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(containerRef.current); }
    } catch { setMapFailed(true); }
    load();
    const markers = markersRef.current;
    return () => { ro?.disconnect(); markers.clear(); if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; } };
  }, [load]);

  // تحديث كل 8 ثوانٍ — يتوقف عندما تكون الصفحة مخفية
  useVisiblePolling(load, POLL_MS);

  // نقطة الاستلام للتوصيل الشخصي: إن لم يرسلها الخادم نجلبها من تفاصيل الطلب مرة واحدة — A-01
  useEffect(() => {
    const missing = data.orders.filter(o => isPersonal(o) && !valid(o.pickup_lat, o.pickup_lng) && !pickupCache.current[o.id]).slice(0, 10);
    if (!missing.length) return;
    missing.forEach(o => { pickupCache.current[o.id] = { pending: true }; });
    Promise.all(missing.map(o => api.get(`/orders/${o.id}`).then(r => {
      const f = r?.data || {};
      pickupCache.current[o.id] = { pickup_lat: f.pickup_lat, pickup_lng: f.pickup_lng, pickup_address: f.pickup_address, service_type: f.service_type };
    }).catch(() => { pickupCache.current[o.id] = { failed: true }; }))).then(() => setPickupTick(t => t + 1));
  }, [data]);

  const orders = useMemo(() => data.orders.map(o => {
    if (!isPersonal(o) || valid(o.pickup_lat, o.pickup_lng)) return o;
    const p = pickupCache.current[o.id];
    return p && !p.pending && !p.failed ? { ...o, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)) } : o;
  }), [data, pickupTick]); // eslint-disable-line react-hooks/exhaustive-deps

  /** مدخلات القائمة: كل طلب مجمّع يظهر مرة واحدة — A-27 */
  const entries = useMemo(() => {
    const out = []; const groups = new Map();
    for (const o of orders) {
      if (isGroup(o) && o.group_id != null) {
        let g = groups.get(o.group_id);
        if (!g) { g = { kind: 'group', key: `g${o.group_id}`, group_id: o.group_id, group_number: o.group_number, group_status: o.group_status, children: [], created_at: o.created_at }; groups.set(o.group_id, g); out.push(g); }
        g.children.push(o);
      } else out.push({ kind: 'order', key: `o${o.id}`, order: o });
    }
    for (const g of groups.values()) {
      g.children.sort((a, b) => (parseInt(a.stop_sequence) || 99) - (parseInt(b.stop_sequence) || 99));
      const c0 = g.children.find(c => driverAssigned(c)) || g.children[0];
      g.driver = c0; g.total = g.children.reduce((a, c) => a + num(c.total), 0);
      g.stops = parseInt(c0?.stops_total ?? c0?.group_stops_count) || g.children.length;
    }
    return out;
  }, [orders]);

  // رسم العلامات بمفاتيح ثابتة: تحديث الموقع/الأيقونة/المحتوى بدل المسح وإعادة الرسم، فالنوافذ المفتوحة تبقى — A-06
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    const store = markersRef.current;
    const seen = new Set();
    const pts = [];
    const byKey = {};

    const putMarker = (key, latlng, ic, lines, z = 0) => {
      seen.add(key);
      const sig = JSON.stringify(lines);
      const cur = store.get(key);
      if (cur && cur.kind === 'marker') {
        if (!samePt(cur.layer.getLatLng(), latlng)) cur.layer.setLatLng(latlng);
        if (cur.icon !== ic) { cur.layer.setIcon(ic); cur.icon = ic; }
        if (cur.sig !== sig) { cur.layer.setPopupContent(popupNode(lines)); cur.sig = sig; }
        return;
      }
      if (cur) layer.removeLayer(cur.layer);
      const m = L.marker(latlng, { icon: ic, zIndexOffset: z }).addTo(layer).bindPopup(popupNode(lines));
      store.set(key, { kind: 'marker', layer: m, sig, icon: ic });
    };
    const putLine = (key, latlngs, style) => {
      seen.add(key);
      const sig = JSON.stringify(latlngs) + style.color;
      const cur = store.get(key);
      if (cur && cur.kind === 'line') { if (cur.sig !== sig) { cur.layer.setLatLngs(latlngs); cur.layer.setStyle(style); cur.sig = sig; } return; }
      if (cur) layer.removeLayer(cur.layer);
      store.set(key, { kind: 'line', layer: L.polyline(latlngs, style).addTo(layer), sig });
    };

    for (const e of entries) {
      if (e.kind === 'order') {
        const o = e.order;
        const label = `طلب #${o.order_number || o.id} — ${statusLabel(o.status, o)}`;
        const personal = isPersonal(o);
        const from = personal ? valid(o.pickup_lat, o.pickup_lng) : valid(o.restaurant_lat, o.restaurant_lng);
        const to = valid(o.delivery_lat, o.delivery_lng);
        if (from) {
          putMarker(`${e.key}:from`, from, icon(personal ? '📦' : '🏪', personal ? '#FFF1E6' : '#fff', '#FF6B00'), personal
            ? [['📦 توصيل شخصي — نقطة الاستلام', true], [o.pickup_address], [label]]
            : [[`🏪 ${o.restaurant_name || 'مطعم'}`, true], [label]]);
          pts.push(from);
        }
        if (to) {
          putMarker(`${e.key}:to`, to, icon('📍', '#fff', '#F53B57'), [[`📍 ${o.customer_name || 'زبون'}`, true], [o.customer_phone], [`طلب #${o.order_number || o.id}`]]);
          pts.push(to);
        }
        if (from && to) putLine(`${e.key}:line`, [from, to], { color: personal ? '#F53B57' : '#FF6B00', weight: 3, opacity: 0.55, dashArray: '2 8', lineCap: 'round' });
        byKey[e.key] = [from, to].filter(Boolean);
      } else {
        // مجمّع: دبوس مرقّم لكل مطعم + دبوس وجهة واحد + خط واحد بترتيب المحطات
        const route = [];
        const gst = e.group_status ? groupStatusMeta(e.group_status).label : '';
        e.children.forEach((c, i) => {
          const p = valid(c.restaurant_lat, c.restaurant_lng);
          if (!p) return;
          const seq = ofTotal(c.stop_sequence, e.stops)?.x || (i + 1);
          putMarker(`${e.key}:s${c.id}`, p, icon(String(seq), '#E6F7F6', '#0E9F9A'),
            [[`🏪 ${c.restaurant_name || 'مطعم'}`, true], [`مجمّع ${e.group_number || ''} · مطعم ${seq} من ${Math.max(e.stops, seq)}`], [`طلب #${c.order_number || c.id} — ${statusLabel(c.status, c)}`], [gst]]);
          route.push(p); pts.push(p);
        });
        const c0 = e.children[0];
        const to = valid(c0?.delivery_lat, c0?.delivery_lng);
        if (to) {
          putMarker(`${e.key}:to`, to, icon('📍', '#fff', '#0E9F9A'), [[`📍 ${c0.customer_name || 'زبون'}`, true], [c0.customer_phone], [`طلب مجمّع ${e.group_number || ''}`]]);
          route.push(to); pts.push(to);
        }
        if (route.length > 1) putLine(`${e.key}:line`, route, { color: '#0E9F9A', weight: 3, opacity: 0.6, dashArray: '2 8', lineCap: 'round' });
        byKey[e.key] = route;
      }
    }
    data.drivers.forEach((d, i) => {
      const p = valid(d.current_lat, d.current_lng);
      if (!p) return;
      const busy = !!d.is_busy;
      putMarker(`d:${d.phone || d.name || i}`, p, icon('🛵', busy ? '#FFE0CC' : '#D1FADF', busy ? '#FF6B00' : '#1DB954', !busy),
        [[`🛵 ${d.name || 'سائق'}`, true], [d.phone], [busy ? 'مشغول 🔴' : 'متاح 🟢']], 500);
      pts.push(p);
    });

    for (const [k, v] of store) if (!seen.has(k)) { layer.removeLayer(v.layer); store.delete(k); }
    pointsRef.current = byKey;
    allPtsRef.current = pts;
    if (!fittedRef.current && pts.length) {
      try { mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); fittedRef.current = true; } catch { /* ignore */ }
    }
  }, [entries, data.drivers]);

  const focusEntry = (e) => {
    const p = pointsRef.current[e.key];
    setFocused(e.key);
    if (!p || !p.length || !mapRef.current) return;
    try {
      if (p.length > 1) mapRef.current.flyToBounds(p, { padding: [60, 60], maxZoom: 16, duration: 0.8 });
      else mapRef.current.flyTo(p[0], 16, { duration: 0.8 });
      if (window.matchMedia('(max-width: 1023px)').matches) containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch { /* ignore */ }
  };
  const fitAll = () => {
    setFocused(null);
    const pts = allPtsRef.current;
    if (!mapRef.current) return;
    try { if (pts.length) mapRef.current.flyToBounds(pts, { padding: [40, 40], maxZoom: 15, duration: 0.8 }); else mapRef.current.flyTo(CENTER, 13); } catch { /* ignore */ }
  };

  const activeCount = entries.length;
  const onlineDrivers = data.drivers.length;
  const availableDrivers = data.drivers.filter(d => !d.is_busy).length;
  // «بلا سائق» = لم يقبل أي سائق بعد (العرض المعلّق لا يُحسب تعييناً) — X-03
  const noDriver = entries.filter(e => {
    const o = e.kind === 'group' ? e.driver : e.order;
    return o && o.order_type !== 'pickup' && !driverAssigned(o);
  }).length;
  const stale = loadError && loaded;

  return (
    <div className="page">
      <PageHeader icon={<FiMap />} title="العمليات الحية"
        subtitle={stale ? `تعذّر التحديث — آخر بيانات ${updatedAt ? fmtTime(updatedAt) : 'محفوظة'}` : updatedAt ? `آخر تحديث ${fmtTime(updatedAt)} · كل 8 ثوانٍ` : 'يتحدّث تلقائياً كل 8 ثوانٍ'}
        action={<IconButton label="تحديث الآن" onClick={load}><FiRefreshCw className={refreshing ? 'animate-spin' : ''} /></IconButton>} />

      {loadError && (
        <div className="rounded-[18px] p-3.5 bg-red-50 border border-red-100 flex items-center gap-3 animate-fade-up" role="alert">
          <span className="w-9 h-9 rounded-xl bg-white text-red-500 flex items-center justify-center flex-shrink-0 shadow-soft"><FiWifiOff /></span>
          <p className="flex-1 text-[12.5px] font-bold text-red-700">{loaded ? 'تعذّر تحديث العمليات — المعروض قد يكون قديماً.' : 'تعذّر تحميل العمليات الحية.'}</p>
          <Button size="sm" variant="secondary" icon={<FiRefreshCw />} onClick={load}>إعادة المحاولة</Button>
        </div>
      )}

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatTile label="طلب نشط" value={loaded ? activeCount : '—'} tone="orange" icon={<FiPackage />} />
        <StatTile label="سائق متاح" value={loaded ? availableDrivers : '—'} tone="green" icon={<FiTruck />} />
        <StatTile label="سائق متصل" value={loaded ? onlineDrivers : '—'} tone="violet" icon={<FiNavigation />} />
        <div className="hidden lg:block"><StatTile label="بلا سائق" value={loaded ? noDriver : '—'} tone="slate" icon={<FiUser />} hint="لم يقبله أي سائق بعد" /></div>
      </div>

      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Map */}
        <div className="order-1 lg:order-2 relative">
          {mapFailed ? (
            <div className="card flex flex-col items-center justify-center h-[360px] text-ink-3 gap-2">
              <FiMap className="text-4xl text-ink-4" /><p className="text-sm font-bold">تعذّر تحميل الخريطة</p>
            </div>
          ) : (
            <div className="relative rounded-[24px] overflow-hidden shadow-card border border-surface-line bg-[#EEF0F5]">
              <div ref={containerRef} className="w-full h-[380px] sm:h-[460px] lg:h-[calc(100vh-290px)] lg:min-h-[520px]" style={{ zIndex: 0 }} />
              {/* Map chrome */}
              <div className="absolute top-3 right-3 z-[400] glass-light rounded-full px-3 py-1.5 shadow-soft flex items-center gap-2 text-[11px] font-extrabold text-ink pointer-events-none">
                {loadError || !loaded
                  ? <><span className="w-2 h-2 rounded-full bg-gray-400" /> {loaded ? 'البث متوقف' : 'جاري الاتصال…'}</>
                  : <><span className="live-dot" /> بث مباشر</>}
              </div>
              {/* زر «عرض الكل» أعلى اليسار تحت أزرار التكبير، بعيداً عن مفتاح الخريطة — A-28 */}
              <button onClick={fitAll} aria-label="عرض الكل" title="عرض الكل"
                className="absolute top-[92px] left-[10px] z-[400] w-10 h-10 rounded-xl bg-white shadow-card flex items-center justify-center text-ink hover:text-brand-600">
                <FiCrosshair />
              </button>
              <div className="absolute bottom-3 inset-x-3 z-[400] flex justify-center pointer-events-none">
                <div className="glass-light rounded-2xl shadow-soft px-3 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-ink-2">
                  <span>🏪 مطعم</span><span>📦 استلام شخصي</span><span>📍 وجهة</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-teal-500" /> مجمّع</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-ok" /> متاح</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> مشغول</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side panel list */}
        <aside className="order-2 lg:order-1 card flex flex-col overflow-hidden lg:h-[calc(100vh-290px)] lg:min-h-[520px]">
          <div className="px-4 py-3.5 border-b border-surface-line flex items-center justify-between bg-[#FAFBFD]">
            <div>
              <h2 className="panel-title">الطلبات النشطة</h2>
              <p className="text-[11px] text-ink-3 font-medium">اضغط طلباً لتحديده على الخريطة</p>
            </div>
            <span className="num text-xs font-black bg-ink text-white rounded-full min-w-[28px] h-7 px-2 flex items-center justify-center">{loaded ? activeCount : '—'}</span>
          </div>
          {!loaded ? (
            loadError ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
                <div className="w-16 h-16 rounded-[22px] bg-red-50 text-red-400 flex items-center justify-center text-3xl mb-3"><FiWifiOff /></div>
                <p className="font-black text-ink">تعذّر تحميل الطلبات النشطة</p>
                <Button className="mt-4" variant="secondary" icon={<FiRefreshCw />} onClick={load}>إعادة المحاولة</Button>
              </div>
            ) : (
              <div className="p-4 space-y-4" role="status" aria-label="جاري التحميل">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="flex gap-3" style={{ opacity: 1 - i * 0.15 }}>
                    <div className="flex-1 space-y-2"><Sk w="45%" h={14} /><Sk w="70%" h={11} /><Sk w="35%" h={10} /></div><Sk w={48} h={16} />
                  </div>
                ))}
              </div>
            )
          ) : entries.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
              <div className="w-16 h-16 rounded-[22px] bg-green-50 text-green-500 flex items-center justify-center text-3xl mb-3">✓</div>
              <p className="font-black text-ink">لا توجد طلبات نشطة الآن</p>
              <p className="text-xs text-ink-3 mt-1">ستظهر الطلبات الجديدة هنا فوراً</p>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-[#F3F4F8]">
              {entries.map(e => {
                const on = focused === e.key;
                if (e.kind === 'group') {
                  const dl = driverLine(e.driver || {});
                  const gm = groupStatusMeta(e.group_status);
                  return (
                    <li key={e.key} className="relative">
                      <button onClick={() => focusEntry(e)}
                        className={`w-full text-right px-4 py-3.5 flex items-start gap-3 relative ${on ? 'bg-teal-50/70' : 'hover:bg-[#FAFBFD]'}`}>
                        <span className="absolute right-0 top-3 bottom-3 w-[3px] rounded-l" style={{ background: gm.color, opacity: on ? 1 : .55 }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-teal-700 text-sm flex items-center gap-1"><FiLayers className="text-xs" /> مجمّع <span className="num" dir="ltr">{e.group_number || ''}</span></p>
                            {e.group_status && <GroupStatusChip status={e.group_status} size="sm" />}
                          </div>
                          <p className="text-xs text-ink-2 mt-1.5 truncate font-medium">🏪 {arCount(e.stops, 'restaurant')}: {e.children.map(c => c.restaurant_name).filter(Boolean).join('، ')}</p>
                          <p className={`text-[11px] mt-1 font-bold ${dl.warn ? 'text-amber-600' : 'text-ink-3'}`}>{dl.text}</p>
                        </div>
                        <p className="font-black text-brand-600 text-sm flex-shrink-0 num">{money(e.total, 0)}</p>
                      </button>
                      <button onClick={() => setGroupId(e.group_id)} title="تفاصيل الطلب المجمّع" aria-label={`تفاصيل الطلب المجمّع ${e.group_number || ''}`}
                        className="absolute left-3 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-teal-600 text-white text-[10.5px] font-extrabold px-2.5 py-1 shadow-soft hover:bg-teal-700">
                        <FiLayers className="text-[10px]" /> التفاصيل
                      </button>
                    </li>
                  );
                }
                const o = e.order;
                const m = statusMeta(o.status);
                const personal = isPersonal(o);
                const dl = driverLine(o);
                return (
                  <li key={e.key} className="relative">
                    <button onClick={() => focusEntry(e)}
                      className={`w-full text-right px-4 py-3.5 flex items-start gap-3 relative ${on ? 'bg-orange-50/70' : 'hover:bg-[#FAFBFD]'}`}>
                      <span className="absolute right-0 top-3 bottom-3 w-[3px] rounded-l" style={{ background: m.color, opacity: on ? 1 : .55 }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-ink text-sm num">#{o.order_number || o.id}</p>
                          <StatusChip status={o.status} order={o} size="sm" />
                        </div>
                        <p className="text-xs text-ink-2 mt-1.5 truncate font-medium">
                          {personal ? `${o.service_type === 'ride' ? '🚗' : '📦'} ${o.pickup_address || 'توصيل شخصي'}` : `🏪 ${o.restaurant_name || '—'}`}
                        </p>
                        <p className={`text-[11px] mt-1 font-bold ${dl.warn ? 'text-amber-600' : 'text-ink-3'}`}>{dl.text}</p>
                      </div>
                      <p className="font-black text-brand-600 text-sm flex-shrink-0 num">{money(num(o.total), 0)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
      <GroupDetail groupId={groupId} onClose={() => setGroupId(null)} onChanged={load} />
    </div>
  );
}
