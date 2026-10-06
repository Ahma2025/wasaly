import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FiMap, FiRefreshCw, FiCrosshair, FiPackage, FiTruck, FiUser, FiNavigation, FiLayers } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { statusMeta, groupStatusMeta, money, num, isPersonal, isGroup, fmtTime } from '../utils/format';
import { PageHeader, StatTile, StatusChip, IconButton } from '../components/ui';
import GroupDetail, { GroupBadge } from '../components/GroupDetail';

const CENTER = [32.313, 35.029];

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

// أيقونات ثابتة (بلا أي بيانات مستخدم) — دبابيس بحلقة نبض للعناصر الحية
const ICON_CACHE = {};
function icon(emoji, bg, ring, pulse = false) {
  const key = emoji + bg + ring + pulse;
  if (!ICON_CACHE[key]) {
    ICON_CACHE[key] = L.divIcon({
      html: `<div class="map-pin${pulse ? ' pulse' : ''}" style="background:${bg};color:${ring}">${emoji}</div>`,
      className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
    });
  }
  return ICON_CACHE[key];
}

const valid = (lat, lng) => {
  const a = parseFloat(lat), b = parseFloat(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0) ? [a, b] : null;
};

export default function LiveOps() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRef = useRef(false);
  const pointsRef = useRef({});
  const allPtsRef = useRef([]);
  const [data, setData] = useState(readCache('adm_liveops') || { orders: [], drivers: [] });
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [focused, setFocused] = useState(null);
  const [groupId, setGroupId] = useState(null);

  const load = useCallback(() => { setRefreshing(true); return api.get('/admin/live-ops')
    .then(r => {
      const d = { orders: r.orders || r.data?.orders || [], drivers: r.drivers || r.data?.drivers || [] };
      setData(d); writeCache('adm_liveops', d); setUpdatedAt(new Date());
    })
    .catch(() => {})
    .finally(() => setRefreshing(false)); }, []);

  // init map (Leaflet مضمّن في الحزمة — يعمل بدون CDN)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let ro;
    try {
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(CENTER, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 250);
      // يعيد حساب الحجم عند طي الشريط الجانبي / تغيير النافذة
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(containerRef.current); }
    } catch { setFailed(true); }
    load();
    return () => { ro?.disconnect(); if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; } };
  }, [load]);

  // تحديث كل 8 ثوانٍ — يتوقف عندما تكون الصفحة مخفية
  useEffect(() => {
    let t = null;
    const start = () => { if (!t) t = setInterval(load, 8000); };
    const stop = () => { clearInterval(t); t = null; };
    const onVis = () => { if (document.hidden) stop(); else { load(); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  // رسم العلامات
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const layer = layerRef.current; layer.clearLayers();
    const pts = [];
    const byOrder = {};
    for (const o of data.orders) {
      const num_ = `طلب #${o.order_number || o.id}`;
      const st = statusMeta(o.status).label;
      const personal = isPersonal(o);
      const from = personal ? valid(o.pickup_lat, o.pickup_lng) : valid(o.restaurant_lat, o.restaurant_lng);
      const to = valid(o.delivery_lat, o.delivery_lng);
      if (from) {
        L.marker(from, { icon: icon(personal ? '📦' : '🏪', personal ? '#FFF1E6' : '#fff', '#FF6B00') }).addTo(layer)
          .bindPopup(popupNode(personal
            ? [['📦 توصيل شخصي — نقطة الاستلام', true], [o.pickup_address], [`${num_} — ${st}`]]
            : [[`🏪 ${o.restaurant_name || 'مطعم'}`, true], [`${num_} — ${st}`], isGroup(o) ? [`🧺 مجمّع ${o.group_number || ''}${o.stop_sequence ? ` · محطة ${o.stop_sequence}` : ''}${o.group_status ? ` · ${groupStatusMeta(o.group_status).label}` : ''}`] : null]));
        pts.push(from);
      }
      if (to) {
        L.marker(to, { icon: icon('📍', '#fff', '#F53B57') }).addTo(layer)
          .bindPopup(popupNode([[`📍 ${o.customer_name || 'زبون'}`, true], [o.customer_phone], [num_]]));
        pts.push(to);
      }
      if (from && to) {
        L.polyline([from, to], { color: personal ? '#F53B57' : '#FF6B00', weight: 3, opacity: 0.55, dashArray: '2 8', lineCap: 'round' }).addTo(layer);
      }
      byOrder[o.id] = from && to ? [from, to] : from ? [from] : to ? [to] : null;
    }
    for (const d of data.drivers) {
      const p = valid(d.current_lat, d.current_lng);
      if (!p) continue;
      const busy = !!d.is_busy;
      L.marker(p, { icon: icon('🛵', busy ? '#FFE0CC' : '#D1FADF', busy ? '#FF6B00' : '#1DB954', !busy), zIndexOffset: 500 }).addTo(layer)
        .bindPopup(popupNode([[`🛵 ${d.name || 'سائق'}`, true], [d.phone], [busy ? 'مشغول 🔴' : 'متاح 🟢']]));
      pts.push(p);
    }
    pointsRef.current = byOrder;
    allPtsRef.current = pts;
    if (!fittedRef.current && pts.length) {
      try { mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); fittedRef.current = true; } catch { /* ignore */ }
    }
  }, [data]);

  const focusOrder = (o) => {
    const p = pointsRef.current[o.id];
    setFocused(o.id);
    if (!p || !mapRef.current) return;
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

  const activeCount = data.orders.length;
  const onlineDrivers = data.drivers.length;
  const availableDrivers = data.drivers.filter(d => !d.is_busy).length;
  const noDriver = data.orders.filter(o => !o.driver_name && o.order_type !== 'pickup').length;

  return (
    <div className="page">
      <PageHeader icon={<FiMap />} title="العمليات الحية"
        subtitle={updatedAt ? `آخر تحديث ${fmtTime(updatedAt)} · كل 8 ثوانٍ` : 'يتحدّث تلقائياً كل 8 ثوانٍ'}
        action={<IconButton label="تحديث الآن" onClick={load}><FiRefreshCw className={refreshing ? 'animate-spin' : ''} /></IconButton>} />

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatTile label="طلب نشط" value={activeCount} tone="orange" icon={<FiPackage />} />
        <StatTile label="سائق متاح" value={availableDrivers} tone="green" icon={<FiTruck />} />
        <StatTile label="سائق متصل" value={onlineDrivers} tone="violet" icon={<FiNavigation />} />
        <div className="hidden lg:block"><StatTile label="بلا سائق" value={noDriver} tone="slate" icon={<FiUser />} /></div>
      </div>

      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Map */}
        <div className="order-1 lg:order-2 relative">
          {failed ? (
            <div className="card flex flex-col items-center justify-center h-[360px] text-ink-3 gap-2">
              <FiMap className="text-4xl text-ink-4" /><p className="text-sm font-bold">تعذّر تحميل الخريطة</p>
            </div>
          ) : (
            <div className="relative rounded-[24px] overflow-hidden shadow-card border border-surface-line bg-[#EEF0F5]">
              <div ref={containerRef} className="w-full h-[380px] sm:h-[460px] lg:h-[calc(100vh-290px)] lg:min-h-[520px]" style={{ zIndex: 0 }} />
              {/* Map chrome */}
              <div className="absolute top-3 right-3 z-[400] glass-light rounded-full px-3 py-1.5 shadow-soft flex items-center gap-2 text-[11px] font-extrabold text-ink pointer-events-none">
                <span className="live-dot" /> بث مباشر
              </div>
              <button onClick={fitAll} aria-label="عرض الكل" title="عرض الكل"
                className="absolute bottom-12 left-3 z-[400] w-10 h-10 rounded-xl bg-white shadow-card flex items-center justify-center text-ink hover:text-brand-600">
                <FiCrosshair />
              </button>
              <div className="absolute bottom-3 inset-x-3 z-[400] flex justify-center pointer-events-none">
                <div className="glass-light rounded-2xl shadow-soft px-3 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-ink-2">
                  <span>🏪 مطعم</span><span>📦 استلام شخصي</span><span>📍 وجهة</span>
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
            <span className="num text-xs font-black bg-ink text-white rounded-full min-w-[28px] h-7 px-2 flex items-center justify-center">{activeCount}</span>
          </div>
          {data.orders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
              <div className="w-16 h-16 rounded-[22px] bg-green-50 text-green-500 flex items-center justify-center text-3xl mb-3">✓</div>
              <p className="font-black text-ink">لا توجد طلبات نشطة الآن</p>
              <p className="text-xs text-ink-3 mt-1">ستظهر الطلبات الجديدة هنا فوراً</p>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-[#F3F4F8]">
              {data.orders.map(o => {
                const m = statusMeta(o.status);
                const personal = isPersonal(o);
                const on = focused === o.id;
                return (
                  <li key={o.id} className="relative">
                    <button onClick={() => focusOrder(o)}
                      className={`w-full text-right px-4 py-3.5 flex items-start gap-3 relative ${on ? 'bg-orange-50/70' : 'hover:bg-[#FAFBFD]'}`}>
                      <span className="absolute right-0 top-3 bottom-3 w-[3px] rounded-l" style={{ background: m.color, opacity: on ? 1 : .55 }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-ink text-sm num">#{o.order_number || o.id}</p>
                          <StatusChip status={o.status} size="sm" />
                          <GroupBadge o={o} />
                        </div>
                        <p className="text-xs text-ink-2 mt-1.5 truncate font-medium">
                          {personal ? `📦 ${o.pickup_address || 'توصيل شخصي'}` : `🏪 ${o.restaurant_name || '—'}`}
                        </p>
                        <p className={`text-[11px] mt-1 font-bold ${o.driver_name ? 'text-ink-3' : 'text-amber-600'}`}>
                          {o.driver_name ? `🛵 ${o.driver_name}` : o.order_type === 'pickup' ? '🏃 استلام من المحل' : '⏳ بلا سائق بعد'}
                        </p>
                      </div>
                      <p className="font-black text-brand-600 text-sm flex-shrink-0 num">{money(num(o.total), 0)}</p>
                    </button>
                    {isGroup(o) && o.group_id != null && (
                      <button onClick={() => setGroupId(o.group_id)} title="تفاصيل الطلب المجمّع" aria-label={`تفاصيل الطلب المجمّع ${o.group_number || ''}`}
                        className="absolute left-3 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-violet-600 text-white text-[10.5px] font-extrabold px-2.5 py-1 shadow-soft hover:bg-violet-700">
                        <FiLayers className="text-[10px]" /> المجمّع
                      </button>
                    )}
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
