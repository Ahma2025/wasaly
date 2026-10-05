import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { statusMeta, money, num, isPersonal, fmtTime } from '../utils/format';
import { PageHeader, StatTile, EmptyState, Badge } from '../components/ui';

const CENTER = [32.313, 35.029];

/** يبني محتوى popup كعناصر DOM بنصوص آمنة (textContent) — لا HTML من المستخدمين أبداً */
function popupNode(lines) {
  const root = document.createElement('div');
  root.style.minWidth = '150px';
  lines.filter(l => l && l[0] != null && String(l[0]).trim() !== '').forEach(([text, bold], i) => {
    const el = document.createElement('div');
    el.textContent = String(text ?? '');
    if (bold) el.style.fontWeight = '800';
    if (i > 0) { el.style.fontSize = '12px'; el.style.color = '#5B6070'; el.style.marginTop = '2px'; }
    root.appendChild(el);
  });
  return root;
}

// أيقونات ثابتة (بلا أي بيانات مستخدم)
const ICON_CACHE = {};
function icon(emoji, bg) {
  const key = emoji + bg;
  if (!ICON_CACHE[key]) {
    ICON_CACHE[key] = L.divIcon({
      html: `<div style="font-size:17px;background:${bg};border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${emoji}</div>`,
      className: '', iconSize: [32, 32], iconAnchor: [16, 16],
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
  const [data, setData] = useState(readCache('adm_liveops') || { orders: [], drivers: [] });
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(() => api.get('/admin/live-ops')
    .then(r => {
      const d = { orders: r.orders || r.data?.orders || [], drivers: r.drivers || r.data?.drivers || [] };
      setData(d); writeCache('adm_liveops', d); setUpdatedAt(new Date());
    })
    .catch(() => {}), []);

  // init map (Leaflet مضمّن في الحزمة — يعمل بدون CDN)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(CENTER, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 250);
    } catch { setFailed(true); }
    load();
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; } };
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
    for (const o of data.orders) {
      const num_ = `طلب #${o.order_number || o.id}`;
      const st = statusMeta(o.status).label;
      const personal = isPersonal(o);
      const from = personal ? valid(o.pickup_lat, o.pickup_lng) : valid(o.restaurant_lat, o.restaurant_lng);
      const to = valid(o.delivery_lat, o.delivery_lng);
      if (from) {
        L.marker(from, { icon: icon(personal ? '📦' : '🏪', personal ? '#FFF1E6' : '#fff') }).addTo(layer)
          .bindPopup(popupNode(personal
            ? [['📦 توصيل شخصي — نقطة الاستلام', true], [o.pickup_address], [`${num_} — ${st}`]]
            : [[`🏪 ${o.restaurant_name || 'مطعم'}`, true], [`${num_} — ${st}`]]));
        pts.push(from);
      }
      if (to) {
        L.marker(to, { icon: icon('📍', '#fff') }).addTo(layer)
          .bindPopup(popupNode([[`📍 ${o.customer_name || 'زبون'}`, true], [o.customer_phone], [num_]]));
        pts.push(to);
      }
      if (from && to) {
        L.polyline([from, to], { color: personal ? '#F53B57' : '#FF6B00', weight: 2, opacity: 0.45, dashArray: '6' }).addTo(layer);
      }
    }
    for (const d of data.drivers) {
      const p = valid(d.current_lat, d.current_lng);
      if (!p) continue;
      L.marker(p, { icon: icon('🛵', d.is_busy ? '#FFE0CC' : '#D1FADF') }).addTo(layer)
        .bindPopup(popupNode([[`🛵 ${d.name || 'سائق'}`, true], [d.phone], [d.is_busy ? 'مشغول 🔴' : 'متاح 🟢']]));
      pts.push(p);
    }
    if (!fittedRef.current && pts.length) {
      try { mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); fittedRef.current = true; } catch { /* ignore */ }
    }
  }, [data]);

  const activeCount = data.orders.length;
  const onlineDrivers = data.drivers.length;
  const availableDrivers = data.drivers.filter(d => !d.is_busy).length;

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="🗺️" title="العمليات الحية" subtitle={updatedAt ? `آخر تحديث ${fmtTime(updatedAt)} · كل 8 ثوانٍ` : 'يتحدّث تلقائياً كل 8 ثوانٍ'} />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="طلب نشط" value={activeCount} tone="orange" />
        <StatTile label="سائق متاح" value={availableDrivers} tone="green" />
        <StatTile label="سائق متصل" value={onlineDrivers} tone="violet" />
      </div>

      {failed ? (
        <div className="card flex flex-col items-center justify-center h-40 text-gray-400 gap-1">
          <span className="text-3xl">🗺️</span><p className="text-sm font-semibold">تعذّر تحميل الخريطة</p>
        </div>
      ) : (
        <div ref={containerRef} style={{ width: '100%', height: '340px', borderRadius: '20px', overflow: 'hidden', zIndex: 0 }} className="shadow-card border border-gray-100" />
      )}
      <p className="text-[11px] text-gray-400 text-center font-semibold">🏪 مطعم · 📦 استلام شخصي · 📍 وجهة التسليم · 🛵 سائق (أخضر متاح / برتقالي مشغول)</p>

      {data.orders.length === 0 ? (
        <EmptyState icon="✅" title="لا توجد طلبات نشطة الآن" />
      ) : (
        <div className="space-y-2">
          {data.orders.map(o => {
            const m = statusMeta(o.status);
            const personal = isPersonal(o);
            return (
              <div key={o.id} className="card p-3 flex items-center justify-between gap-2" style={{ borderRight: `4px solid ${m.color}` }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900 text-sm">#{o.order_number || o.id}</p>
                    <Badge className={m.cls}>{m.label}</Badge>
                    <span className="text-[10px] text-gray-400 font-bold">{o.order_type === 'pickup' ? '🏃 استلام' : personal ? '📦 توصيل شخصي' : '🛵 توصيل'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {personal ? `📦 ${o.pickup_address || 'توصيل شخصي'}` : `🏪 ${o.restaurant_name || '—'}`} · {o.driver_name ? `🛵 ${o.driver_name}` : 'بلا سائق'}
                  </p>
                </div>
                <p className="font-black text-orange-500 text-sm flex-shrink-0 tabular-nums">{money(num(o.total), 0)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
