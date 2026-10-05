import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  FiPackage, FiCheck, FiClock, FiPhone, FiMapPin, FiPrinter, FiXCircle, FiChevronDown, FiUser,
  FiStar, FiInbox, FiCreditCard, FiFileText, FiPlay, FiCheckCircle, FiTruck, FiRefreshCw,
} from 'react-icons/fi';
import { MdDeliveryDining, MdOutlineDirectionsWalk } from 'react-icons/md';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import OrderMap from '../components/OrderMap';
import * as Printer from '../utils/printer';
import { useRestaurant } from '../context/RestaurantContext';
import { useLiveOrders } from '../context/LiveOrdersContext';
import { PageHeader, EmptyState, ErrorState, ListSkeleton, Spinner, useConfirm } from '../components/ui';
import {
  statusLabel, STATUS_BADGE, STATUS_ACCENT, paymentLabel, money, num, orderNo, formatDateTime,
  parseOptions, optionName, optionPrice,
} from '../utils/format';

const PAGE = 20;
const STATUS_MAP = {
  active: 'pending,confirmed,preparing,ready',
  on_the_way: 'on_the_way',
  past: 'delivered,cancelled',
};
const FILTERS = [
  { key: 'active', label: 'نشطة', icon: FiClock },
  { key: 'on_the_way', label: 'في الطريق', icon: MdDeliveryDining },
  { key: 'past', label: 'السابقة', icon: FiInbox },
];
const CANCEL_REASONS = ['صنف غير متوفر', 'المطعم مزدحم', 'المطعم سيغلق', 'بطلب من الزبون', 'سبب آخر'];

const dedupe = (list) => {
  const seen = new Set();
  return list.filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true)));
};

export default function Orders() {
  const { restaurant } = useRestaurant();
  const { tick, refreshNow, pendingCount } = useLiveOrders();
  const [filter, setFilter] = useState('active');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);
  const [vipIds, setVipIds] = useState(() => new Set(readCache('rest_vips_' + restaurant.id) || []));
  const [dialog, confirm] = useConfirm();

  // مراجع لتجنّب الإغلاقات القديمة (stale closures) عند وصول أحداث الـ socket
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const countRef = useRef(0);
  countRef.current = orders.length;
  const reqId = useRef(0);

  const fetchOrders = useCallback(async ({ silent = false, append = false } = {}) => {
    const rid = restaurant.id;
    if (!rid) { setLoading(false); return; }
    const f = filterRef.current;
    const myReq = ++reqId.current;
    const ckey = `rest_orders_${rid}_${f}`;
    const cached = readCache(ckey);
    if (!silent && !append) {
      if (cached) { setOrders(cached); setLoading(false); } else setLoading(true);
    }
    const limit = append ? PAGE : Math.min(100, Math.max(PAGE, silent ? countRef.current : PAGE));
    const offset = append ? countRef.current : 0;
    try {
      const r = await api.get(`/restaurants/${rid}/orders`, { params: { status: STATUS_MAP[f], limit, offset } });
      if (filterRef.current !== f || (!append && myReq !== reqId.current)) return;
      const list = Array.isArray(r?.data) ? r.data : [];
      setOrders(prev => (append ? dedupe([...prev, ...list]) : list));
      setHasMore(list.length >= limit);
      if (!append) writeCache(ckey, list.slice(0, PAGE));
      setError(false);
    } catch (e) {
      if (filterRef.current !== f) return;
      if (!silent && !append && !cached) setError(true);
      else if (!silent) toast.error(e.message || 'فشل تحميل الطلبات');
    } finally {
      setLoading(false); setLoadingMore(false); setRefreshing(false);
    }
  }, [restaurant.id]);

  useEffect(() => { setExpanded(null); setHasMore(false); fetchOrders(); }, [filter, fetchOrders]);

  // كل حدث (طلب جديد/تغيير حالة/إلغاء/تحديث دوري) يرفع tick → تحديث صامت للتبويب الحالي
  const firstTick = useRef(true);
  useEffect(() => {
    if (firstTick.current) { firstTick.current = false; return; }
    fetchOrders({ silent: true });
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // الزبائن المميزون (VIP) — لإظهار الحالة الصحيحة على الزر
  useEffect(() => {
    if (!restaurant.id) return;
    api.get(`/restaurants/${restaurant.id}/customers`).then(r => {
      const ids = (r?.data || []).filter(c => c.is_vip).map(c => String(c.id));
      setVipIds(new Set(ids));
      writeCache('rest_vips_' + restaurant.id, ids);
    }).catch(() => {});
  }, [restaurant.id]);

  const patchLocal = (id, patch) => setOrders(list => list.map(o => (o.id === id ? { ...o, ...patch } : o)));

  const acceptOrder = async (order) => {
    setBusy(order.id);
    try {
      await api.patch(`/orders/${order.id}/confirm`);
      patchLocal(order.id, { status: 'confirmed' });
      toast.success(order.order_type === 'delivery' ? 'تم قبول الطلب — جاري البحث عن سائق' : 'تم قبول الطلب');
      refreshNow();
    } catch (e) { toast.error(e.message || 'فشل قبول الطلب'); }
    finally { setBusy(null); }
  };

  const updateStatus = async (order, status) => {
    setBusy(order.id);
    try {
      await api.patch(`/orders/${order.id}/status`, { status });
      patchLocal(order.id, { status });
      const msgs = {
        preparing: 'بدأ تحضير الطلب',
        ready: order.order_type === 'delivery' ? 'الطلب جاهز — بانتظار السائق' : 'الطلب جاهز للاستلام',
        delivered: 'تم تسليم الطلب للزبون',
      };
      toast.success(msgs[status] || 'تم تحديث الحالة');
      refreshNow();
    } catch (e) { toast.error(e.message || 'تعذّر تحديث الحالة'); }
    finally { setBusy(null); }
  };

  const cancelOrder = async (order) => {
    const res = await confirm({
      title: `إلغاء الطلب #${orderNo(order)}؟`,
      message: order.driver_id
        ? 'تم تعيين سائق لهذا الطلب — سيتم إبلاغ السائق والزبون بالإلغاء.'
        : 'سيتم إبلاغ الزبون بإلغاء الطلب. لا يمكن التراجع عن هذه الخطوة.',
      confirmText: 'نعم، إلغاء الطلب', cancelText: 'تراجع', danger: true, reasons: CANCEL_REASONS,
    });
    if (!res || !res.ok) return;
    setBusy(order.id);
    try {
      await api.patch(`/orders/${order.id}/status`, { status: 'cancelled', cancel_reason: res.reason || undefined });
      toast.success('تم إلغاء الطلب');
      setExpanded(null);
      refreshNow();
    } catch (e) { toast.error(e.message || 'فشل الإلغاء'); }
    finally { setBusy(null); }
  };

  const makeVip = async (order) => {
    if (!order.customer_id) return;
    try {
      await api.post(`/restaurants/${restaurant.id}/vip`, { customer_id: order.customer_id });
      setVipIds(s => { const n = new Set(s); n.add(String(order.customer_id)); writeCache('rest_vips_' + restaurant.id, [...n]); return n; });
      toast.success('صار زبوناً مميزاً — وصله إشعار');
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const onRefresh = () => { setRefreshing(true); refreshNow(); fetchOrders({ silent: true }); };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {dialog}
      <PageHeader title="الطلبات" icon={FiPackage}
        subtitle={pendingCount > 0 ? `${pendingCount} بانتظار القبول` : 'تتحدث تلقائيًا'}
        onRefresh={onRefresh} refreshing={refreshing} />

      <div className="grid grid-cols-3 gap-1.5 bg-white p-1.5 rounded-2xl shadow-soft" role="tablist">
        {FILTERS.map(f => {
          const Icon = f.icon;
          const active = filter === f.key;
          return (
            <button key={f.key} role="tab" aria-selected={active} onClick={() => setFilter(f.key)}
              className={`relative flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold ${active ? 'grad-brand text-white shadow-brand' : 'text-gray-500 hover:bg-gray-50'}`}>
              <Icon size={16} aria-hidden /> {f.label}
              {f.key === 'active' && pendingCount > 0 && (
                <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${active ? 'bg-white text-brand-600' : 'bg-rose-500 text-white'}`}>{pendingCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? <ListSkeleton rows={5} />
        : error ? <ErrorState text="تعذّر تحميل الطلبات" onRetry={() => fetchOrders()} />
        : orders.length === 0 ? (
          <EmptyState icon={filter === 'past' ? FiInbox : FiPackage}
            title={filter === 'active' ? 'لا توجد طلبات نشطة' : filter === 'on_the_way' ? 'لا طلبات في الطريق' : 'لا توجد طلبات سابقة'}
            text={filter === 'active' ? 'سنُنبّهك بصوت وإشعار فور وصول طلب جديد' : undefined} />
        ) : (
          <div className="space-y-3 stagger">
            {orders.map(order => (
              <OrderCard key={order.id}
                order={order}
                restaurant={restaurant}
                isExpanded={expanded === order.id}
                busy={busy === order.id}
                isVip={vipIds.has(String(order.customer_id))}
                onToggle={() => setExpanded(expanded === order.id ? null : order.id)}
                onAccept={acceptOrder}
                onStatus={updateStatus}
                onCancel={cancelOrder}
                onVip={makeVip}
              />
            ))}
            {hasMore && (
              <button onClick={() => { setLoadingMore(true); fetchOrders({ append: true }); }} disabled={loadingMore}
                className="btn-ghost w-full py-3">
                {loadingMore ? <><Spinner size={15} /> جاري التحميل…</> : 'تحميل المزيد'}
              </button>
            )}
          </div>
        )}
    </div>
  );
}

// ─── تفاصيل الطلب: طلب واحد مشترك لكل بطاقة (الأصناف + الملخص + الطباعة + السائق) ───
function useOrderDetails(orderId, enabled, refreshKey) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const r = await api.get(`/orders/${orderId}`);
      setDetails(r?.data || null);
      return r?.data || null;
    } catch { setFailed(true); return null; }
    finally { setLoading(false); }
  }, [orderId]);
  useEffect(() => { if (enabled) load(); }, [enabled, refreshKey, load]);
  return { details, loading, failed, reload: load };
}

function minutesAgo(v) {
  const m = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} د`;
  return '';
}

function DriverChip({ order }) {
  if (order.order_type !== 'delivery') return null;
  if (order.status === 'on_the_way') return <span className="chip bg-violet-50 text-violet-700"><MdDeliveryDining size={13} /> السائق في الطريق</span>;
  if (!['confirmed', 'preparing', 'ready'].includes(order.status)) return null;
  return order.driver_id
    ? <span className="chip bg-emerald-50 text-emerald-700"><FiCheck size={12} /> تم تعيين سائق</span>
    : <span className="chip bg-amber-50 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> جاري البحث عن سائق</span>;
}

function OrderCard({ order, restaurant, isExpanded, busy, isVip, onToggle, onAccept, onStatus, onCancel, onVip }) {
  const isDelivery = order.order_type === 'delivery';
  const { details, loading: detailsLoading, failed, reload } = useOrderDetails(order.id, isExpanded, `${order.status}-${order.driver_id || ''}`);
  const [printing, setPrinting] = useState(false);
  const [vipBusy, setVipBusy] = useState(false);
  const full = details ? { ...order, ...details } : order;
  const isPending = order.status === 'pending';

  // أزرار المطعم حسب الحالة — المطعم لا يضع «في الطريق» أبدًا (هذه مهمة السائق)
  const actions = [];
  if (order.status === 'pending') {
    actions.push({ label: 'قبول الطلب', icon: FiCheck, cls: 'btn-primary', onClick: () => onAccept(order) });
  } else if (order.status === 'confirmed') {
    actions.push({ label: 'بدء التحضير', icon: FiPlay, cls: 'btn bg-sky-500 text-white', onClick: () => onStatus(order, 'preparing') });
  } else if (order.status === 'preparing') {
    actions.push({ label: 'جاهز للاستلام', icon: FiCheckCircle, cls: 'btn bg-teal-500 text-white', onClick: () => onStatus(order, 'ready') });
  } else if (order.status === 'ready' && !isDelivery) {
    actions.push({ label: 'تم التسليم للزبون', icon: FiCheckCircle, cls: 'btn bg-emerald-500 text-white', onClick: () => onStatus(order, 'delivered') });
  }
  const canCancel = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);

  const print = async () => {
    setPrinting(true);
    try {
      const d = details || await reload();
      if (!d) throw new Error('تعذّر تحميل تفاصيل الطلب');
      await Printer.printOrder({ ...order, ...d }, restaurant, d.items || []);
      toast.success('تمت الطباعة');
    } catch (e) {
      const err = Printer.printerError(e);
      toast.error(`فشلت الطباعة: ${err.message}`, { duration: 6000 });
    } finally { setPrinting(false); }
  };

  const vip = async () => { setVipBusy(true); await onVip(order); setVipBusy(false); };

  return (
    <article className={`bg-white rounded-2xl shadow-soft overflow-hidden flex transition-shadow ${isPending ? 'ring-2 ring-brand-300' : ''} ${isExpanded ? 'shadow-card' : ''}`}>
      <div className="w-1.5 flex-shrink-0" style={{ background: STATUS_ACCENT[order.status] || '#CBD5E1' }} aria-hidden />
      <div className="flex-1 min-w-0">
        <button type="button" onClick={onToggle} aria-expanded={isExpanded} className="no-press w-full text-right p-4 hover:bg-gray-50/60">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-gray-900 text-base">#{orderNo(order)}</span>
              <span className={`chip ${isDelivery ? 'bg-brand-50 text-brand-700' : 'bg-sky-50 text-sky-700'}`}>
                {isDelivery ? <><MdDeliveryDining size={13} /> توصيل</> : <><MdOutlineDirectionsWalk size={13} /> استلام</>}
              </span>
              {isPending && <span className="chip bg-rose-500 text-white">جديد {minutesAgo(order.created_at)}</span>}
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full ring-1 font-bold ${STATUS_BADGE[order.status] || 'bg-gray-100 text-gray-500 ring-gray-200'}`}>
              {statusLabel(order.status, order.order_type)}
            </span>
          </div>
          <div className="flex items-end justify-between gap-2 mt-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-bold text-gray-800 truncate flex items-center gap-1.5"><FiUser size={13} className="text-gray-400" aria-hidden /> {order.customer_name || 'زبون'}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1.5"><FiClock size={12} aria-hidden /> {formatDateTime(order.created_at)}</p>
              <DriverChip order={order} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-left">
                <p className="text-[10px] text-gray-400 leading-none mb-1">الإجمالي</p>
                <p className="font-black text-brand-600 text-lg leading-none">{money(order.total)}</p>
              </div>
              <span className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                <FiChevronDown aria-hidden />
              </span>
            </div>
          </div>
        </button>

        {/* إجراء سريع للطلب الجديد بدون فتح البطاقة */}
        {!isExpanded && isPending && (
          <div className="px-4 pb-4 -mt-1">
            <button onClick={() => onAccept(order)} disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Spinner size={15} /> : <FiCheck aria-hidden />} قبول الطلب
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="border-t border-gray-100 bg-gray-50/70 p-3 space-y-3 animate-fade-up">
            <OrderMap order={{ ...full, restaurant_lat: full.restaurant_lat || restaurant.lat, restaurant_lng: full.restaurant_lng || restaurant.lng, restaurant_name: restaurant.name_ar }} />

            {/* الزبون */}
            <section className="bg-white rounded-2xl p-3.5 space-y-2">
              <p className="text-[11px] font-black text-gray-400">الزبون</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-gray-900 truncate">{full.customer_name || 'زبون'}</p>
                {full.customer_phone && (
                  <a href={`tel:${full.customer_phone}`} className="btn-ghost px-3 py-1.5 text-xs" aria-label={`اتصال بالزبون ${full.customer_phone}`}>
                    <FiPhone size={13} aria-hidden /> <span dir="ltr">{full.customer_phone}</span>
                  </a>
                )}
              </div>
              {isDelivery && full.delivery_address && (
                <p className="text-xs text-gray-600 flex items-start gap-1.5"><FiMapPin size={13} className="mt-0.5 flex-shrink-0 text-gray-400" aria-hidden /> {full.delivery_address}</p>
              )}
              <p className="text-xs text-gray-600 flex items-center gap-1.5">
                <FiCreditCard size={13} className="text-gray-400" aria-hidden /> {paymentLabel(full.payment_method)}
                {full.payment_status === 'paid' && <span className="chip bg-emerald-50 text-emerald-700">مدفوع</span>}
              </p>
              {order.customer_id && (
                <button onClick={vip} disabled={isVip || vipBusy}
                  className={`w-full btn py-2 text-xs ${isVip ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-white border border-brand-200 text-brand-600 hover:bg-brand-50'}`}>
                  {vipBusy ? <Spinner size={13} /> : <FiStar size={13} className={isVip ? 'fill-amber-400 text-amber-500' : ''} aria-hidden />}
                  {isVip ? 'زبون مميز' : 'اجعله زبوناً مميزاً'}
                </button>
              )}
            </section>

            {/* السائق */}
            {isDelivery && !['delivered', 'cancelled', 'pending'].includes(order.status) && (
              <section className="bg-white rounded-2xl p-3.5">
                <p className="text-[11px] font-black text-gray-400 mb-2">السائق</p>
                {full.driver_id ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><FiTruck aria-hidden /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{full.driver_name || 'تم تعيين سائق'}</p>
                        <p className="text-[11px] text-gray-400">
                          {order.status === 'on_the_way' ? 'استلم الطلب وهو في الطريق للزبون' : 'في الطريق إلى المطعم لاستلام الطلب'}
                          {full.vehicle_plate ? ` · ${full.vehicle_plate}` : ''}
                        </p>
                      </div>
                    </div>
                    {full.driver_phone && (
                      <a href={`tel:${full.driver_phone}`} className="w-9 h-9 rounded-xl bg-violet-500 text-white flex items-center justify-center flex-shrink-0" aria-label="اتصال بالسائق"><FiPhone size={15} /></a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-amber-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    {order.status === 'confirmed' ? 'جاري البحث عن سائق — يمكنك بدء التحضير الآن' : 'جاري البحث عن سائق…'}
                  </p>
                )}
              </section>
            )}

            {/* الأصناف والملخص */}
            {detailsLoading && !details ? (
              <div className="bg-white rounded-2xl p-4 space-y-2"><div className="sk h-4 w-1/2 rounded" /><div className="sk h-4 w-2/3 rounded" /><div className="sk h-4 w-1/3 rounded" /></div>
            ) : failed && !details ? (
              <button onClick={reload} className="btn-ghost w-full"><FiRefreshCw size={14} /> تعذّر تحميل الأصناف — إعادة المحاولة</button>
            ) : details ? (
              <>
                <OrderItems items={details.items || []} />
                <OrderSummary order={full} items={details.items || []} />
              </>
            ) : null}

            {full.notes && (
              <section className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
                <p className="text-xs font-black text-amber-700 flex items-center gap-1.5"><FiFileText size={13} aria-hidden /> ملاحظات الزبون</p>
                <p className="text-sm text-amber-900 mt-1 leading-relaxed">{full.notes}</p>
              </section>
            )}

            {order.status === 'ready' && isDelivery && (
              <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-xl p-3 text-center">الطلب جاهز — بانتظار السائق لاستلامه</p>
            )}

            <div className="space-y-2 pt-1">
              {actions.map((a, i) => {
                const Icon = a.icon;
                return (
                  <button key={i} onClick={a.onClick} disabled={busy} className={`${a.cls} w-full py-3 text-[15px]`}>
                    {busy ? <Spinner size={15} /> : <Icon aria-hidden />} {a.label}
                  </button>
                );
              })}
              <div className="flex gap-2">
                {Printer.isPrinterSupported() && Printer.getSavedPrinter() && (
                  <button onClick={print} disabled={printing} className="btn-ghost flex-1">
                    {printing ? <Spinner size={14} /> : <FiPrinter aria-hidden />} طباعة
                  </button>
                )}
                {canCancel && (
                  <button onClick={() => onCancel(order)} disabled={busy} className="btn-danger flex-1">
                    <FiXCircle aria-hidden /> إلغاء الطلب
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function OrderItems({ items }) {
  if (!items.length) return null;
  return (
    <section className="bg-white rounded-2xl p-3.5">
      <p className="text-[11px] font-black text-gray-400 mb-2">الأصناف ({items.length})</p>
      <div className="divide-y divide-gray-50">
        {items.map((item, i) => {
          const opts = parseOptions(item);
          const qty = parseInt(item.quantity) || 1;
          const line = num(item.subtotal) || num(item.price) * qty;
          return (
            <div key={item.id || i} className="py-2 first:pt-0 last:pb-0">
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-gray-900 font-bold"><span className="text-brand-600">{qty}×</span> {item.name_ar || item.name}</span>
                <span className="text-sm font-bold text-gray-700 flex-shrink-0">{money(line)}</span>
              </div>
              {opts.length > 0 && (
                <div className="mt-1 space-y-0.5 pr-4">
                  {opts.map((opt, j) => (
                    <div key={j} className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">+ {optionName(opt)}</span>
                      {optionPrice(opt) > 0 && <span className="text-gray-400">+{money(optionPrice(opt))}</span>}
                    </div>
                  ))}
                </div>
              )}
              {item.notes && <p className="text-xs text-amber-700 mt-1 pr-4">ملاحظة: {item.notes}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// الملخص من أرقام السيرفر مباشرة (لا إعادة حساب — الأسعار المخفّضة والمحفظة والنقاط محسوبة هناك)
function OrderSummary({ order, items }) {
  const isDelivery = order.order_type === 'delivery';
  const subtotal = order.subtotal != null
    ? num(order.subtotal)
    : items.reduce((s, it) => s + (num(it.subtotal) || num(it.price) * (parseInt(it.quantity) || 1)), 0);
  const rows = [['المجموع الفرعي', subtotal, '']];
  if (isDelivery) rows.push(['رسوم التوصيل', num(order.delivery_fee), '']);
  [['الخصم', order.discount], ['خصم الكوبون', order.coupon_discount], ['خصم الطلب الأول', order.first_order_discount],
    ['نقاط الولاء', order.points_value], ['من المحفظة', order.wallet_used]]
    .forEach(([l, v]) => { if (num(v) > 0) rows.push([l, num(v), 'discount']); });
  if (num(order.tip) > 0) rows.push(['إكرامية السائق', num(order.tip), '']);

  return (
    <section className="bg-white rounded-2xl p-3.5 space-y-1.5">
      {rows.map(([label, value, kind]) => (
        <div key={label} className={`flex justify-between text-sm ${kind === 'discount' ? 'text-emerald-600' : ''}`}>
          <span className={kind === 'discount' ? '' : 'text-gray-500'}>{label}</span>
          <span className="font-semibold">{kind === 'discount' ? '-' : ''}{money(value)}</span>
        </div>
      ))}
      <div className="flex justify-between font-black text-base border-t border-dashed border-gray-200 pt-2 mt-1">
        <span>الإجمالي</span>
        <span className="text-brand-600">{money(order.total)}</span>
      </div>
    </section>
  );
}
