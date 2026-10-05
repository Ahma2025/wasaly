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

    return () => { map.remove(); mapRef.current = null; markersRef.current = {}; };
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // موقع السائق المباشر عبر اتصال Socket المشترك
  useEffect(() => {
    if (!socket || !order?.id) return;
    const onLoc = ({ lat, lng, order_id } = {}) => {
      if (order_id && String(order_id) !== String(order.id)) return;
      if (!order_id && !order.driver_id) return;
      setDriverLoc({ lat: parseFloat(lat), lng: parseFloat(lng) });
    };
    socket.on('driver:location', onLoc);
    return () => socket.off('driver:location', onLoc);
  }, [socket, order?.id, order?.driver_id]);

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
      <div className="flex items-center gap-3 bg-white rounded-2xl p-4 text-gray-400">
        <FiMap size={22} aria-hidden />
        <p className="text-xs">الخريطة غير متوفرة — لا توجد إحداثيات لهذا الطلب</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-white">
      <div ref={mapContainerRef} style={{ height: 260, width: '100%' }} />
      {driverLoc && order?.status === 'on_the_way' && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-[1000]">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" /> مباشر
        </div>
      )}
      <div className="absolute bottom-2 right-2 bg-white/95 rounded-xl px-3 py-2 text-[11px] font-bold shadow-md z-[1000] flex flex-col gap-1 text-gray-700">
        {restLat && <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-brand-500" /> المطعم</span>}
        {custLat && <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-sky-500" /> الزبون</span>}
        {driverLoc && <span className="flex items-center gap-1.5 text-violet-600"><i className="w-2.5 h-2.5 rounded-full bg-violet-500" /> السائق</span>}
      </div>
    </div>
  );
}
