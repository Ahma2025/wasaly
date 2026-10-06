import React, { useEffect, useRef, useState } from 'react';
import { FiMap } from 'react-icons/fi';
import L, { TILE_URL, TILE_ATTR, pinIcon, ICON_PATHS } from '../utils/leaflet';
import { useLiveOrders } from '../context/LiveOrdersContext';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function OrderMap({ order }) {
  const { socket } = useLiveOrders();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const [driverLoc, setDriverLoc] = useState(
    order?.driver_lat ? { lat: parseFloat(order.driver_lat), lng: parseFloat(order.driver_lng) } : null
  );

  const restLat = order?.restaurant_lat ? parseFloat(order.restaurant_lat) : null;
  const restLng = order?.restaurant_lng ? parseFloat(order.restaurant_lng) : null;
  const custLat = order?.delivery_lat ? parseFloat(order.delivery_lat) : null;
  const custLng = order?.delivery_lng ? parseFloat(order.delivery_lng) : null;
  const hasMap = (restLat && restLng) || (custLat && custLng);

  useEffect(() => {
    if (order?.driver_lat) setDriverLoc({ lat: parseFloat(order.driver_lat), lng: parseFloat(order.driver_lng) });
  }, [order?.driver_lat, order?.driver_lng]);

  // إنشاء الخريطة مرة واحدة لكل طلب
  useEffect(() => {
    if (!hasMap || !mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [restLat || custLat || 31.9, restLng || custLng || 35.2],
      zoom: 14, zoomControl: false, attributionControl: true,
    });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    if (restLat && restLng) {
      markersRef.current.restaurant = L.marker([restLat, restLng], { icon: pinIcon('#FF6B00', ICON_PATHS.store) })
        .addTo(map).bindPopup(`<b>المطعم</b><br/>${esc(order?.restaurant_name || '')}`);
    }
    if (custLat && custLng) {
      markersRef.current.customer = L.marker([custLat, custLng], { icon: pinIcon('#0EA5E9', ICON_PATHS.home) })
        .addTo(map).bindPopup(`<b>موقع الزبون</b><br/>${esc(order?.customer_name || '')}<br/>${esc(order?.delivery_address || '')}`);
    }
    if (restLat && custLat) {
      L.polyline([[restLat, restLng], [custLat, custLng]], { color: '#FF6B00', weight: 3, dashArray: '8 6', opacity: 0.7 }).addTo(map);
    }
    const points = [];
    if (restLat && restLng) points.push([restLat, restLng]);
    if (custLat && custLng) points.push([custLat, custLng]);
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
    setTimeout(() => map.invalidateSize(), 200);
    // داخل نافذة متحركة: أعد حساب الحجم عند تغيّر أبعاد الحاوية
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(mapContainerRef.current); }

    return () => { ro && ro.disconnect(); map.remove(); mapRef.current = null; markersRef.current = {}; };
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // موقع السائق المباشر عبر اتصال Socket المشترك
  useEffect(() => {
    if (!socket || !order?.id) return;
    const onLoc = ({ lat, lng, order_id, group_id } = {}) => {
      // طلب مجمّع: السيرفر يرسل موقع السائق مع group_id (و order_id لأي طلب فرعي)
      const sameGroup = order.group_id != null && group_id != null && String(group_id) === String(order.group_id);
      if (!sameGroup) {
        if (order_id && String(order_id) !== String(order.id)) return;
        if (!order_id && !order.driver_id) return;
      }
      setDriverLoc({ lat: parseFloat(lat), lng: parseFloat(lng) });
    };
    socket.on('driver:location', onLoc);
    return () => socket.off('driver:location', onLoc);
  }, [socket, order?.id, order?.driver_id, order?.group_id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverLoc || !Number.isFinite(driverLoc.lat)) return;
    if (markersRef.current.driver) {
      markersRef.current.driver.setLatLng([driverLoc.lat, driverLoc.lng]);
    } else {
      markersRef.current.driver = L.marker([driverLoc.lat, driverLoc.lng], { icon: pinIcon('#8B5CF6', ICON_PATHS.bike, 38) })
        .addTo(map).bindPopup('<b>السائق</b>');
    }
    map.panTo([driverLoc.lat, driverLoc.lng], { animate: true, duration: 0.8 });
  }, [driverLoc]);

  if (!hasMap) {
    return (
      <div className="flex items-center gap-3 bg-surface rounded-[18px] p-4 text-ink-3">
        <FiMap size={22} aria-hidden />
        <p className="text-xs">الخريطة غير متوفرة — لا توجد إحداثيات لهذا الطلب</p>
      </div>
    );
  }

  return (
    <div className="relative isolate rounded-[18px] overflow-hidden border border-surface-line bg-white shadow-soft">
      <div ref={mapContainerRef} style={{ height: 240, width: '100%', zIndex: 0 }} />
      {driverLoc && (order?.status === 'on_the_way' || order?.group_id != null) && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-coral text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-[1000]">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" /> مباشر
        </div>
      )}
      <div className="absolute bottom-2 right-2 glass-light rounded-xl px-3 py-2 text-[11px] font-bold shadow-soft z-[1000] flex flex-col gap-1 text-ink-2">
        {restLat && <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-brand-500" /> المطعم</span>}
        {custLat && <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-sky-500" /> الزبون</span>}
        {driverLoc && <span className="flex items-center gap-1.5 text-violet-600"><i className="w-2.5 h-2.5 rounded-full bg-violet-500" /> السائق</span>}
      </div>
    </div>
  );
}
