import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';

const STATUS = {
  pending:    { l: 'قيد الانتظار', c: 'bg-yellow-100 text-yellow-700' },
  confirmed:  { l: 'مقبول',        c: 'bg-blue-100 text-blue-700' },
  preparing:  { l: 'يُحضَّر',       c: 'bg-orange-100 text-orange-700' },
  ready:      { l: 'جاهز',         c: 'bg-green-100 text-green-700' },
  on_the_way: { l: 'في الطريق',    c: 'bg-purple-100 text-purple-700' },
};

export default function LiveOps() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRef = useRef(false);
  const [data, setData] = useState({ orders: [], drivers: [] });
  const [failed, setFailed] = useState(false);

  const load = () => api.get('/admin/live-ops')
    .then(r => setData({ orders: r.orders || [], drivers: r.drivers || [] }))
    .catch(() => {});

  // init map (Leaflet from CDN)
  useEffect(() => {
    let cancelled = false;
    const loadLeaflet = async () => {
      if (window.L) return window.L;
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css'; link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = res; s.onerror = rej; document.body.appendChild(s);
      });
      return window.L;
    };
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([32.313, 35.029], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 250);
      load();
    }).catch(() => setFailed(true));
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  // poll every 8s
  useEffect(() => { const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  // draw markers
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current || !layerRef.current) return;
    const layer = layerRef.current; layer.clearLayers();
    const icon = (e, bg) => L.divIcon({
      html: `<div style="font-size:18px;background:${bg};border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)">${e}</div>`,
      className: '', iconSize: [32, 32], iconAnchor: [16, 16],
    });
    const pts = [];
    for (const o of data.orders) {
      if (o.restaurant_lat && o.restaurant_lng) {
        L.marker([o.restaurant_lat, o.restaurant_lng], { icon: icon('🏪', '#fff') }).addTo(layer)
          .bindPopup(`🏪 ${o.restaurant_name || 'مطعم'}<br>طلب #${o.order_number || o.id} — ${STATUS[o.status]?.l || o.status}`);
        pts.push([o.restaurant_lat, o.restaurant_lng]);
      }
      if (o.delivery_lat && o.delivery_lng) {
        L.marker([o.delivery_lat, o.delivery_lng], { icon: icon('📍', '#fff') }).addTo(layer)
          .bindPopup(`📍 ${o.customer_name || 'زبون'}<br>طلب #${o.order_number || o.id}`);
        pts.push([o.delivery_lat, o.delivery_lng]);
      }
      if (o.restaurant_lat && o.delivery_lat) {
        L.polyline([[o.restaurant_lat, o.restaurant_lng], [o.delivery_lat, o.delivery_lng]], { color: '#FF6B00', weight: 2, opacity: 0.4, dashArray: '6' }).addTo(layer);
      }
    }
    for (const d of data.drivers) {
      L.marker([d.current_lat, d.current_lng], { icon: icon('🛵', d.is_busy ? '#FFE0CC' : '#D1FADF') }).addTo(layer)
        .bindPopup(`🛵 ${d.name}<br>${d.is_busy ? 'مشغول 🔴' : 'متاح 🟢'}`);
      pts.push([d.current_lat, d.current_lng]);
    }
    if (!fittedRef.current && pts.length) {
      try { mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); fittedRef.current = true; } catch {}
    }
  }, [data]);

  const activeCount = data.orders.length;
  const onlineDrivers = data.drivers.length;
  const availableDrivers = data.drivers.filter(d => !d.is_busy).length;

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">العمليات الحية 🗺️</h1>

      {/* ملخّص */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-3 text-white text-center shadow-card">
          <p className="text-2xl font-black">{activeCount}</p>
          <p className="text-white/80 text-[11px]">طلب نشط</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-3 text-white text-center shadow-card">
          <p className="text-2xl font-black">{availableDrivers}</p>
          <p className="text-white/80 text-[11px]">سائق متاح</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-3 text-white text-center shadow-card">
          <p className="text-2xl font-black">{onlineDrivers}</p>
          <p className="text-white/80 text-[11px]">سائق متصل</p>
        </div>
      </div>

      {/* الخريطة */}
      {failed ? (
        <div className="flex flex-col items-center justify-center h-40 bg-gray-50 rounded-2xl text-gray-400 gap-1">
          <span className="text-3xl">🗺️</span><p className="text-sm">تعذّر تحميل الخريطة</p>
        </div>
      ) : (
        <div ref={containerRef} style={{ width: '100%', height: '340px', borderRadius: '16px', overflow: 'hidden', zIndex: 0 }} className="shadow-soft" />
      )}
      <p className="text-[11px] text-gray-400 text-center">🏪 مطعم · 📍 وجهة التوصيل · 🛵 سائق (أخضر متاح / برتقالي مشغول) — يتحدّث كل 8 ثوانٍ</p>

      {/* قائمة الطلبات النشطة */}
      <div className="space-y-2">
        {data.orders.length === 0 ? (
          <div className="text-center py-10 text-gray-400"><p className="text-4xl mb-2">✅</p><p className="font-semibold">لا توجد طلبات نشطة الآن</p></div>
        ) : data.orders.map(o => (
          <div key={o.id} className="bg-white rounded-2xl p-3 shadow-soft border border-gray-100 flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-black text-gray-900 text-sm">#{o.order_number || o.id}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS[o.status]?.c || 'bg-gray-100 text-gray-500'}`}>{STATUS[o.status]?.l || o.status}</span>
                <span className="text-[10px] text-gray-400">{o.order_type === 'pickup' ? '🏃 استلام' : '🛵 توصيل'}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">🏪 {o.restaurant_name} · {o.driver_name ? `🛵 ${o.driver_name}` : 'بلا سائق'}</p>
            </div>
            <p className="font-black text-orange-500 text-sm flex-shrink-0">{parseFloat(o.total || 0).toFixed(0)}₪</p>
          </div>
        ))}
      </div>
    </div>
  );
}
