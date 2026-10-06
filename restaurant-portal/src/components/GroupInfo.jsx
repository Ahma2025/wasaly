import React, { useCallback, useEffect, useState } from 'react';
import { FiLayers, FiPhone, FiTruck, FiClock, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import api from '../utils/api';
import { useLiveOrders } from '../context/LiveOrdersContext';
import { cx } from './ui';
import { isGroupOrder, groupLabel, groupStops, GROUP_STATUS_LABELS, statusLabel, distanceKm } from '../utils/format';

// متوسط سرعة السائق داخل المدينة (كم/س) لتقدير وقت الوصول
const AVG_KMH = 25;

// ─── شارة «طلب مجمّع (مطعم X من N)» ───
export function GroupBadge({ order, className = '' }) {
  if (!isGroupOrder(order)) return null;
  return (
    <span className={cx('chip bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200', className)} title="سائق واحد يجمع الطلب من عدة مطاعم">
      <FiLayers size={12} aria-hidden /> {groupLabel(order)}
    </span>
  );
}

// ─── تنبيه مختصر داخل البطاقة ───
export function GroupHint({ order }) {
  if (!isGroupOrder(order) || ['delivered', 'cancelled'].includes(order.status)) return null;
  return (
    <p className="text-[11.5px] font-bold text-violet-700 flex items-center gap-1.5">
      <FiClock size={12} aria-hidden /> سائق واحد يجمع من عدة مطاعم — كن جاهزًا في الوقت
    </p>
  );
}

// ─── قسم الطلب المجمّع داخل تفاصيل الطلب: السائق + الوقت المتوقع + باقي المطاعم ───
export function GroupSection({ order, restaurant, open }) {
  const { socket, tick } = useLiveOrders();
  const groupId = order?.group_id;
  const [group, setGroup] = useState(null);
  const [failed, setFailed] = useState(false);
  const [driverLoc, setDriverLoc] = useState(null);

  const load = useCallback(async () => {
    if (groupId == null) return;
    try {
      const r = await api.get(`/orders/groups/${groupId}`);
      const g = r?.data || null;
      setGroup(g); setFailed(false);
      if (g?.driver_lat != null && g?.driver_lng != null) setDriverLoc(l => l || { lat: parseFloat(g.driver_lat), lng: parseFloat(g.driver_lng) });
    } catch { setFailed(true); }
  }, [groupId]);

  // تحميل عند الفتح + مع كل تحديث حي (tick يرتفع عند group_status / group_updated / order_status)
  useEffect(() => { if (open) load(); }, [open, load, tick]);

  // موقع السائق المباشر للطلب المجمّع
  useEffect(() => {
    if (!socket || groupId == null || !open) return;
    const onLoc = ({ lat, lng, group_id } = {}) => {
      if (group_id == null || String(group_id) !== String(groupId)) return;
      const a = parseFloat(lat), b = parseFloat(lng);
      if (Number.isFinite(a) && Number.isFinite(b)) setDriverLoc({ lat: a, lng: b });
    };
    socket.on('driver:location', onLoc);
    return () => socket.off('driver:location', onLoc);
  }, [socket, groupId, open]);

  if (!isGroupOrder(order)) return null;

  const n = groupStops(order) || group?.stops_total || 0;
  const gStatus = group?.status;
  const mine = (group?.orders || []).find(o => String(o.order_id ?? o.id) === String(order.id));
  const myPicked = ['on_the_way', 'delivered'].includes(order.status) || !!mine?.picked_up_at;
  const hasDriver = !!(group?.driver_id || order.driver_id);
  const others = Array.isArray(group?.other_stops) ? [...group.other_stops].sort((a, b) => (a.stop_sequence || 0) - (b.stop_sequence || 0)) : [];
  const closed = ['delivered', 'cancelled'].includes(order.status);

  // تقدير وصول السائق للمطعم (قبل الاستلام فقط)
  const rLat = restaurant?.lat ?? order.restaurant_lat;
  const rLng = restaurant?.lng ?? order.restaurant_lng;
  let eta = null;
  if (hasDriver && !myPicked && driverLoc) {
    const d = distanceKm(driverLoc.lat, driverLoc.lng, rLat, rLng);
    if (d != null) eta = { km: d, min: Math.max(1, Math.round((d / AVG_KMH) * 60)) };
  }

  return (
    <section className="rounded-[18px] border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3.5 space-y-3" aria-label="الطلب المجمّع">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-[12px] bg-violet-500 text-white flex items-center justify-center flex-shrink-0 shadow-[0_8px_18px_rgba(139,92,246,.3)]"><FiLayers aria-hidden /></span>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-violet-800 text-[14.5px]">{groupLabel(order)}</p>
          <p className="text-[12px] text-violet-900/75 leading-relaxed mt-0.5">
            سائق واحد يجمع هذا الطلب من {n ? `${n} مطاعم` : 'عدة مطاعم'} ثم يوصله للزبون — التزم بوقت التحضير حتى لا يتأخر الطلب كله.
            {order.group_number ? <> رقم المجمّع <span className="tnum font-bold" dir="ltr">{order.group_number}</span>.</> : null}
          </p>
        </div>
      </div>

      {!closed && (
        <div className="flex flex-wrap gap-1.5">
          {gStatus && <span className="chip bg-white text-violet-700 ring-1 ring-inset ring-violet-200">{group?.status_label || GROUP_STATUS_LABELS[gStatus] || gStatus}</span>}
          {group?.stops_total ? <span className="chip bg-white text-ink-2 ring-1 ring-inset ring-surface-line tnum">تم الاستلام من {group.picked_count || 0} / {group.stops_total}</span> : null}
          {myPicked && <span className="chip bg-success-soft text-emerald-700"><FiCheck size={12} aria-hidden /> استلم السائق طلبك</span>}
        </div>
      )}

      {/* السائق */}
      {!closed && (
        hasDriver ? (
          <div className="flex items-center justify-between gap-2 bg-white rounded-[14px] border border-surface-line p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-[11px] bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><FiTruck aria-hidden /></div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-extrabold text-ink truncate">{group?.driver_name || order.driver_name || 'تم تعيين سائق'}</p>
                <p className="text-[11.5px] text-ink-3">
                  {myPicked ? 'استلم طلبك ويكمل الجمع/التوصيل'
                    : eta ? <>يصل إليك خلال ~<span className="tnum font-bold text-violet-700">{eta.min}</span> د <span className="tnum">({eta.km.toFixed(1)} كم)</span></>
                    : 'في الطريق لجمع الطلبات'}
                </p>
              </div>
            </div>
            {(group?.driver_phone || order.driver_phone) && (
              <a href={`tel:${group?.driver_phone || order.driver_phone}`} className="pressable w-9 h-9 rounded-[11px] bg-violet-500 text-white flex items-center justify-center flex-shrink-0" aria-label="اتصال بالسائق"><FiPhone size={14} /></a>
            )}
          </div>
        ) : (
          <p className="text-[12.5px] font-bold text-amber-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            {gStatus === 'pending' ? 'بانتظار قبول باقي المطاعم — بعدها نبحث عن سائق' : 'جاري البحث عن سائق للطلب المجمّع'}
          </p>
        )
      )}

      {/* باقي المطاعم في نفس الطلب */}
      {others.length > 0 && (
        <div>
          <p className="text-[11px] font-extrabold text-ink-3 mb-1.5">باقي المطاعم في هذا الطلب</p>
          <ul className="space-y-1">
            {others.map((s) => (
              <li key={s.order_id} className="flex items-center justify-between gap-2 text-[12.5px] bg-white/70 rounded-[10px] px-2.5 py-1.5">
                <span className="font-bold text-ink-2 truncate"><span className="tnum text-ink-3">{s.stop_sequence}.</span> {s.restaurant_name || 'مطعم'}</span>
                <span className={cx('text-[11px] font-bold flex-shrink-0', s.status === 'cancelled' ? 'text-danger' : 'text-ink-3')}>{statusLabel(s.status, 'delivery')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {failed && !group && (
        <p className="text-[11.5px] text-ink-3 flex items-center gap-1.5"><FiAlertTriangle size={12} aria-hidden /> تعذّر تحميل تفاصيل الطلب المجمّع — <button onClick={load} className="underline font-bold">إعادة المحاولة</button></p>
      )}
    </section>
  );
}
