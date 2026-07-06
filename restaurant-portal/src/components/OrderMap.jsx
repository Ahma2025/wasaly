import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../utils/api';

// Fix leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const API_BASE = api.defaults.baseURL?.replace('/api', '') || 'https://burger-app-production.up.railway.app';

export default function OrderMap({ order, token }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const socketRef = useRef(null);
  const [driverLoc, setDriverLoc] = useState(
    order?.driver_lat ? { lat: parseFloat(order.driver_lat), lng: parseFloat(order.driver_lng) } : null
  );

  const restLat = order?.restaurant_lat ? parseFloat(order.restaurant_lat) : null;
  const restLng = order?.restaurant_lng ? parseFloat(order.restaurant_lng) : null;
  const custLat = order?.delivery_lat ? parseFloat(order.delivery_lat) : null;
  const custLng = order?.delivery_lng ? parseFloat(order.delivery_lng) : null;

  const hasMap = (restLat && restLng) || (custLat && custLng);

  // Init map once
  useEffect(() => {
    if (!hasMap || !mapContainerRef.current) return;
    if (mapRef.current) return;

    const centerLat = restLat || custLat || 31.9;
    const centerLng = restLng || custLng || 35.2;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: false,
    });

    // Position zoom control bottom-left so it doesn't overlap the legend
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Restaurant marker
    if (restLat && restLng) {
      const restIcon = L.divIcon({
        html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">🏪</div>',
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30],
      });
      markersRef.current.restaurant = L.marker([restLat, restLng], { icon: restIcon })
        .addTo(map)
        .bindPopup(`<b>🏪 المطعم</b><br/>${order?.restaurant_name || 'المطعم'}`);
    }

    // Customer delivery marker
    if (custLat && custLng) {
      const custIcon = L.divIcon({
        html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">📍</div>',
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30],
      });
      markersRef.current.customer = L.marker([custLat, custLng], { icon: custIcon })
        .addTo(map)
        .bindPopup(`<b>📍 موقع الزبون</b><br/>${order?.customer_name || ''}<br/>${order?.delivery_address || ''}`);
    }

    // Route line between restaurant → customer
    if (restLat && custLat) {
      L.polyline([[restLat, restLng], [custLat, custLng]], {
        color: '#FF6B00', weight: 3, dashArray: '8 4', opacity: 0.75,
      }).addTo(map);
    }

    // Fit bounds to show all markers
    const points = [];
    if (restLat && restLng) points.push([restLat, restLng]);
    if (custLat && custLng) points.push([custLat, custLng]);
    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50] });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, [order?.id]);

  // Socket.io for driver live location
  useEffect(() => {
    if (!token || !order?.id) return;

    const socket = io(API_BASE, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('driver:location', ({ lat, lng, order_id }) => {
      if (order_id && String(order_id) !== String(order.id)) return;
      setDriverLoc({ lat: parseFloat(lat), lng: parseFloat(lng) });
    });

    return () => socket.disconnect();
  }, [token, order?.id]);

  // Update/create driver marker when driverLoc changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverLoc) return;

    if (markersRef.current.driver) {
      markersRef.current.driver.setLatLng([driverLoc.lat, driverLoc.lng]);
    } else {
      const driverIcon = L.divIcon({
        html: `<div style="
          background:#FF6B00;border-radius:50%;width:36px;height:36px;
          display:flex;align-items:center;justify-content:center;
          font-size:18px;border:3px solid #FFF;
          box-shadow:0 3px 10px rgba(0,0,0,0.35);
        ">🛵</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18],
      });
      markersRef.current.driver = L.marker([driverLoc.lat, driverLoc.lng], { icon: driverIcon })
        .addTo(map)
        .bindPopup('<b>🛵 السائق</b><br/>يتحرك الآن');
    }
    map.panTo([driverLoc.lat, driverLoc.lng], { animate: true, duration: 0.8 });
  }, [driverLoc]);

  if (!hasMap) {
    return (
      <div className="flex flex-col items-center justify-center bg-gray-100 rounded-2xl p-6 gap-2">
        <span className="text-3xl">🗺️</span>
        <p className="text-xs text-gray-400 text-center">الخريطة غير متوفرة — لم يتم تحديد إحداثيات للطلب</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      <div ref={mapContainerRef} style={{ height: 340, width: '100%' }} />

      {/* LIVE badge */}
      {driverLoc && order?.status === 'on_the_way' && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-[1000]">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          LIVE
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 right-2 bg-white bg-opacity-95 rounded-xl px-3 py-2 text-xs shadow-md z-[1000] flex flex-col gap-0.5">
        {restLat && <span>🏪 المطعم</span>}
        {custLat && <span>📍 موقع الزبون</span>}
        {driverLoc && <span className="text-orange-500 font-bold">🛵 السائق مباشر</span>}
      </div>
    </div>
  );
}
