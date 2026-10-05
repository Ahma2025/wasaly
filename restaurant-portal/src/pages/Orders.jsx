import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  FiPackage, FiCheck, FiClock, FiPhone, FiMapPin, FiPrinter, FiXCircle, FiUser, FiChevronLeft,
  FiStar, FiInbox, FiCreditCard, FiFileText, FiPlay, FiCheckCircle, FiTruck, FiRefreshCw, FiShoppingBag,
} from 'react-icons/fi';
import { MdDeliveryDining, MdOutlineDirectionsWalk, MdOutlineSoupKitchen } from 'react-icons/md';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import OrderMap from '../components/OrderMap';
import * as Printer from '../utils/printer';
import { useRestaurant } from '../context/RestaurantContext';
import { useLiveOrders } from '../context/LiveOrdersContext';
import { PageHeader, EmptyState, ErrorState, ListSkeleton, Spinner, useConfirm, Tabs, Sheet, Button, useMediaQuery, cx } from '../components/ui';
import {
  statusLabel, STATUS_ACCENT, paymentLabel, money, num, orderNo, formatDateTime,
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

// أعمدة اللوحة (الشاشات العريضة) لتبويب «نشطة»
const COLUMNS = [
  { key: 'new', title: 'طلبات جديدة', statuses: ['pending'], accent: STATUS_ACCENT.pending, icon: FiClock, empty: 'لا طلبات جديدة — سننبّهك فور وصول طلب' },
  { key: 'kitchen', title: 'في المطبخ', statuses: ['confirmed', 'preparing'], accent: STATUS_ACCENT.preparing, icon: MdOutlineSoupKitchen, empty: 'لا طلبات قيد التحضير' },
  { key: 'ready', title: 'جاهزة', statuses: ['ready'], accent: STATUS_ACCENT.ready, icon: FiCheckCircle, empty: 'لا طلبات جاهزة' },
];

const STATUS_ICON = {
  pending: FiClock, confirmed: FiCheck, preparing: MdOutlineSoupKitchen, ready: FiCheckCircle,
  on_the_way: MdDeliveryDining, delivered: FiCheckCircle, cancelled: FiXCircle,
};
const STATUS_CHIP = {
  pending: 'bg-amber-50 text-amber-700', confirmed: 'bg-sky-50 text-sky-700', preparing: 'bg-brand-50 text-brand-700',
  ready: 'bg-teal-50 text-teal-700', on_the_way: 'bg-violet-50 text-violet-700', delivered: 'bg-success-soft text-emerald-700',
  cancelled: 'bg-danger-soft text-danger',
};

const dedupe = (list) => {
  const seen = new Set();
  return list.filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true)));
};

// أزرار المطعم حسب الحالة — المطعم لا يضع «في الطريق» أبدًا (هذه مهمة السائق)
function nextAction(order) {
  const isDelivery = order.order_type === 'delivery';
  if (order.status === 'pending') return { label: 'قبول الطلب', icon: FiCheck, variant: 'primary', kind: 'accept' };
  if (order.status === 'confirmed') return { label: 'بدء التحضير', icon: FiPlay, variant: 'sky', kind: 'status', to: 'preparing' };
  if (order.status === 'preparing') return { label: 'جاهز للاستلام', icon: FiCheckCircle, variant: 'teal', kind: 'status', to: 'ready' };
  if (order.status === 'ready' && !isDelivery) return { label: 'تم التسليم للزبون', icon: FiCheckCircle, variant: 'success', kind: 'status', to: 'delivered' };
  return null;
}

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
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [fresh, setFresh] = useState(() => new Set());
  const [vipIds, setVipIds] = useState(() => new Set(readCache('rest_vips_' + restaurant.id) || []));
  const [dialog, confirm] = useConfirm();
  const wide = useMediaQuery('(min-width: 1024px)');

  // مراجع لتجنّب الإغلاقات القديمة (stale closures) عند وصول أحداث الـ socket
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const countRef = useRef(0);
  countRef.current = orders.length;
  const reqId = useRef(0);
  const seenIds = useRef(null);

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

  useEffect(() => { setOpenId(null); setHasMore(false); seenIds.current = null; fetchOrders(); }, [filter, fetchOrders]);

  // كل حدث (طلب جديد/تغيير حالة/إلغاء/تحديث دوري) يرفع tick → تحديث صامت للتبويب الحالي
  const firstTick = useRef(true);
  useEffect(() => {
    if (firstTick.current) { firstTick.current = false; return; }
    fetchOrders({ silent: true });
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // تمييز الطلبات التي ظهرت للتو (حركة دخول + توهّج)
  useEffect(() => {
    if (loading) return;
    if (seenIds.current === null) { seenIds.current = new Set(orders.map(o => o.id)); return; }
    const added = orders.filter(o => !seenIds.current.has(o.id)).map(o => o.id);
    if (!added.length) return;
    added.forEach(id => seenIds.current.add(id));
    setFresh(s => new Set([...s, ...added]));
    const t = setTimeout(() => setFresh(s => { const n = new Set(s); added.forEach(id => n.delete(id)); return n; }), 4000);
    return () => clearTimeout(t);
  }, [orders, loading]);

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
      setOpenId(null);
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

  const runAction = (order, a) => (a.kind === 'accept' ? acceptOrder(order) : updateStatus(order, a.to));
  const onRefresh = () => { setRefreshing(true); refreshNow(); fetchOrders({ silent: true }); };

  // الطلب المفتوح في نافذة التفاصيل (نحتفظ بآخر نسخة أثناء حركة الإغلاق)
  const openOrder = orders.find(o => o.id === openId) || null;
  const lastOpen = useRef(null);
  if (openOrder) lastOpen.current = openOrder;
  const sheetOrder = openOrder || lastOpen.current;

  const card = (order) => (
    <div key={order.id} className={fresh.has(order.id) ? 'animate-new-order' : ''}>
      <OrderCard order={order} busy={busy === order.id} fresh={fresh.has(order.id)}
        onOpen={() => setOpenId(order.id)} onAction={(a) => runAction(order, a)} />
    </div>
  );

  const kanban = wide && filter === 'active';
  const activeCount = (k) => (k === 'active' ? pendingCount : 0);

  return (
    <div className="space-y-4" dir="rtl">
      {dialog}
      <PageHeader title="الطلبات" icon={FiPackage}
        subtitle={pendingCount > 0 ? `${pendingCount} بانتظار القبول` : 'تتحدث تلقائيًا'}
        onRefresh={onRefresh} refreshing={refreshing} />

      <Tabs ariaLabel="تصفية الطلبات" value={filter} onChange={setFilter} className="lg:max-w-md"
        tabs={FILTERS.map(f => ({ ...f, badge: activeCount(f.key) }))} />

      {loading ? <ListSkeleton rows={5} />
        : error ? <ErrorState text="تعذّر تحميل الطلبات" onRetry={() => fetchOrders()} />
        : orders.length === 0 && !kanban ? (
          <EmptyState icon={filter === 'past' ? FiInbox : FiPackage}
            title={filter === 'active' ? 'لا توجد طلبات نشطة' : filter === 'on_the_way' ? 'لا طلبات في الطريق' : 'لا توجد طلبات سابقة'}
            text={filter === 'active' ? 'سنُنبّهك بصوت وإشعار فور وصول طلب جديد' : undefined} />
        ) : kanban ? (
          <div className="grid grid-cols-3 gap-4 items-start">
            {COLUMNS.map(col => {
              const list = orders.filter(o => col.statuses.includes(o.status));
              const Icon = col.icon;
              return (
                <section key={col.key} className="rounded-[24px] bg-white/60 border border-surface-line p-3 min-h-[60vh]" aria-label={col.title}>
                  <header className="flex items-center gap-2 px-1.5 pb-3 mb-1">
                    <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white" style={{ background: col.accent }}><Icon size={16} aria-hidden /></span>
                    <h2 className="font-extrabold text-ink flex-1">{col.title}</h2>
                    <span className="min-w-[26px] h-[26px] px-2 rounded-full bg-white border border-surface-line text-[12px] font-black text-ink-2 flex items-center justify-center tnum">{list.length}</span>
                  </header>
                  <div className="space-y-3">
                    {list.length === 0
                      ? <p className="text-center text-[12.5px] text-ink-3 py-10 px-4 leading-relaxed">{col.empty}</p>
                      : list.map(card)}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 stagger">
            {orders.map(card)}
          </div>
        )}

      {!loading && !error && hasMore && (
        <button onClick={() => { setLoadingMore(true); fetchOrders({ append: true }); }} disabled={loadingMore}
          className="btn-ghost w-full h-12 lg:max-w-sm lg:mx-auto lg:flex">
          {loadingMore ? <><Spinner size={15} /> جاري التحميل…</> : 'تحميل المزيد'}
        </button>
      )}

      {sheetOrder && (
        <OrderDetailsSheet key={sheetOrder.id}
          open={!!openOrder}
          order={sheetOrder}
          restaurant={restaurant}
          busy={busy === sheetOrder.id}
          isVip={vipIds.has(String(sheetOrder.customer_id))}
          onClose={() => setOpenId(null)}
          onAction={(a) => runAction(sheetOrder, a)}
          onCancel={cancelOrder}
          onVip={makeVip}
        />
      )}
    </div>
  );
}

// ─── تفاصيل الطلب: طلب واحد مشترك (الأصناف + الملخص + الطباعة + السائق) ───
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

function StatusChip({ order, className = '' }) {
  const Icon = STATUS_ICON[order.status] || FiClock;
  return (
    <span className={cx('inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap', STATUS_CHIP[order.status] || 'bg-gray-100 text-ink-2', className)}>
      <Icon size={12} aria-hidden /> {statusLabel(order.status, order.order_type)}
    </span>
  );
}

function TypeChip({ order }) {
  const isDelivery = order.order_type === 'delivery';
  return (
    <span className={cx('chip', isDelivery ? 'bg-brand-50 text-brand-700' : 'bg-info-soft text-sky-700')}>
      {isDelivery ? <><MdDeliveryDining size={13} aria-hidden /> توصيل</> : <><MdOutlineDirectionsWalk size={13} aria-hidden /> استلام</>}
    </span>
  );
}

function DriverChip({ order }) {
  if (order.order_type !== 'delivery') return null;
  if (order.status === 'on_the_way') return <span className="chip bg-violet-50 text-violet-700"><MdDeliveryDining size={13} /> السائق في الطريق</span>;
  if (!['confirmed', 'preparing', 'ready'].includes(order.status)) return null;
  return order.driver_id
    ? <span className="chip bg-success-soft text-emerald-700"><FiCheck size={12} /> تم تعيين سائق</span>
    : <span className="chip bg-warning-soft text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> جاري البحث عن سائق</span>;
}

// ─── بطاقة طلب مختصرة ───
function OrderCard({ order, busy, fresh, onOpen, onAction }) {
  const isPending = order.status === 'pending';
  const action = nextAction(order);
  const ago = isPending ? minutesAgo(order.created_at) : '';

  return (
    <article className={cx('bg-white rounded-[20px] border overflow-hidden flex transition-shadow',
      isPending ? 'border-brand-200 animate-highlight' : 'border-surface-line shadow-soft hover:shadow-card',
      fresh && !isPending && 'ring-2 ring-brand-200')}>
      <div className="w-1.5 flex-shrink-0" style={{ background: STATUS_ACCENT[order.status] || '#CBD5E1' }} aria-hidden />
      <div className="flex-1 min-w-0">
        <button type="button" onClick={onOpen} className="no-press w-full text-right p-4 pb-3 hover:bg-surface/50" aria-label={`تفاصيل الطلب ${orderNo(order)}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="font-black text-ink text-[17px] tnum">#{orderNo(order)}</span>
              <TypeChip order={order} />
              {isPending && <span className="chip bg-coral text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> جديد{ago ? ` · ${ago}` : ''}</span>}
            </div>
            <StatusChip order={order} />
          </div>
          <div className="flex items-end justify-between gap-2 mt-3">
            <div className="min-w-0 space-y-1.5">
              <p className="text-[14px] font-bold text-ink truncate flex items-center gap-1.5"><FiUser size={13} className="text-ink-3 flex-shrink-0" aria-hidden /> {order.customer_name || 'زبون'}</p>
              <p className="text-[12px] text-ink-3 flex items-center gap-1.5"><FiClock size={12} aria-hidden /> {formatDateTime(order.created_at)}</p>
              <DriverChip order={order} />
            </div>
            <div className="text-left flex-shrink-0">
              <p className="text-[10.5px] text-ink-3 font-bold leading-none mb-1">الإجمالي</p>
              <p className="font-black text-ink text-[19px] leading-none tnum">{money(order.total)}</p>
            </div>
          </div>
        </button>
        <div className="px-4 pb-4 flex gap-2">
          {action && (
            <Button variant={action.variant} icon={action.icon} loading={busy} onClick={() => onAction(action)} className="flex-1 h-11">
              {action.label}
            </Button>
          )}
          <button onClick={onOpen} className={cx('btn-ghost h-11', action ? 'px-3' : 'flex-1')} aria-label="عرض التفاصيل">
            {!action && 'التفاصيل'} <FiChevronLeft aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── الخط الزمني للحالة ───
function Timeline({ order }) {
  const isDelivery = order.order_type === 'delivery';
  const steps = isDelivery
    ? [['pending', 'وصل الطلب'], ['confirmed', 'تم القبول'], ['preparing', 'التحضير'], ['ready', 'جاهز'], ['on_the_way', 'في الطريق'], ['delivered', 'تم التوصيل']]
    : [['pending', 'وصل الطلب'], ['confirmed', 'تم القبول'], ['preparing', 'التحضير'], ['ready', 'جاهز للاستلام'], ['delivered', 'تم التسليم']];

  if (order.status === 'cancelled') {
    return (
      <div className="rounded-[18px] bg-danger-soft border border-danger/15 p-3.5 flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-danger text-white flex items-center justify-center flex-shrink-0"><FiXCircle aria-hidden /></span>
        <div>
          <p className="font-extrabold text-danger">تم إلغاء الطلب</p>
          {order.cancel_reason && <p className="text-[12.5px] text-danger/80 mt-0.5">السبب: {order.cancel_reason}</p>}
        </div>
      </div>
    );
  }
  const idx = Math.max(0, steps.findIndex(s => s[0] === order.status));
  const pct = (idx / (steps.length - 1)) * 100;
  return (
    <div className="rounded-[18px] bg-surface/70 p-3.5 pt-4" aria-label={`حالة الطلب: ${statusLabel(order.status, order.order_type)}`}>
      <div className="relative">
        <div className="absolute top-[13px] h-[3px] bg-gray-200 rounded-full" style={{ insetInlineStart: `${50 / steps.length}%`, insetInlineEnd: `${50 / steps.length}%` }} aria-hidden>
          <div className="h-full rounded-full grad-brand transition-[width] duration-700 ease-out2" style={{ width: `${pct}%` }} />
        </div>
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
          {steps.map(([k, label], i) => {
            const done = i < idx; const cur = i === idx;
            return (
              <li key={k} className="flex flex-col items-center text-center gap-1.5">
                <span className={cx('w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black border-[3px] transition-all duration-300',
                  done ? 'grad-brand text-white border-white shadow-soft' : cur ? 'bg-white text-brand-600 border-brand-500 pulse-dot' : 'bg-white text-ink-3 border-gray-200')}>
                  {done ? <FiCheck size={13} aria-hidden /> : i + 1}
                </span>
                <span className={cx('text-[10.5px] leading-tight px-0.5', cur ? 'font-extrabold text-ink' : done ? 'font-bold text-ink-2' : 'font-bold text-ink-3')}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function Section({ title, children, className = '', action }) {
  return (
    <section className={cx('rounded-[18px] border border-surface-line bg-white p-3.5', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-2.5">
          <p className="eyebrow">{title}</p>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function OrderDetailsSheet({ open, order, restaurant, busy, isVip, onClose, onAction, onCancel, onVip }) {
  const isDelivery = order.order_type === 'delivery';
  const { details, loading: detailsLoading, failed, reload } = useOrderDetails(order.id, open, `${order.status}-${order.driver_id || ''}`);
  const [printing, setPrinting] = useState(false);
  const [vipBusy, setVipBusy] = useState(false);
  const full = details ? { ...order, ...details } : order;
  const action = nextAction(order);
  const canCancel = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
  const canPrint = Printer.isPrinterSupported() && Printer.getSavedPrinter();

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

  const footer = (action || canPrint || canCancel) ? (
    <div className="space-y-2">
      {action && (
        <Button variant={action.variant} size="lg" icon={action.icon} loading={busy} block onClick={() => onAction(action)}>{action.label}</Button>
      )}
      {(canPrint || canCancel) && (
        <div className="flex gap-2">
          {canPrint && (
            <Button variant="ghost" icon={FiPrinter} loading={printing} onClick={print} className="flex-1">طباعة</Button>
          )}
          {canCancel && (
            <button onClick={() => onCancel(order)} disabled={busy} className="btn-danger flex-1"><FiXCircle aria-hidden /> إلغاء الطلب</button>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <Sheet open={open} onClose={onClose} variant="drawer"
      title={<span className="flex items-center gap-2"><span className="tnum">طلب #{orderNo(order)}</span> <TypeChip order={order} /></span>}
      subtitle={<span className="flex items-center gap-2 flex-wrap"><StatusChip order={order} /> <span className="flex items-center gap-1"><FiClock size={12} aria-hidden /> {formatDateTime(order.created_at)}</span></span>}
      footer={footer}>
      <div className="space-y-3">
        <Timeline order={full} />

        {isDelivery && (
          <OrderMap key={full.delivery_lat ? "with-customer" : "no-customer"} order={{ ...full, restaurant_lat: full.restaurant_lat || restaurant.lat, restaurant_lng: full.restaurant_lng || restaurant.lng, restaurant_name: restaurant.name_ar }} />
        )}

        {/* الزبون */}
        <Section title="الزبون">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 font-black flex items-center justify-center flex-shrink-0">{(full.customer_name || 'ز')[0]}</span>
              <p className="text-[15px] font-extrabold text-ink truncate">{full.customer_name || 'زبون'}</p>
            </div>
            {full.customer_phone && (
              <a href={`tel:${full.customer_phone}`} className="pressable btn-soft h-10 px-3 text-xs" aria-label={`اتصال بالزبون ${full.customer_phone}`}>
                <FiPhone size={14} aria-hidden /> <span dir="ltr" className="tnum">{full.customer_phone}</span>
              </a>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {isDelivery && full.delivery_address && (
              <p className="text-[13px] text-ink-2 flex items-start gap-2"><FiMapPin size={14} className="mt-0.5 flex-shrink-0 text-ink-3" aria-hidden /> {full.delivery_address}</p>
            )}
            <p className="text-[13px] text-ink-2 flex items-center gap-2 flex-wrap">
              <FiCreditCard size={14} className="text-ink-3" aria-hidden /> {paymentLabel(full.payment_method)}
              {full.payment_status === 'paid' && <span className="chip bg-success-soft text-emerald-700"><FiCheck size={11} /> مدفوع</span>}
            </p>
          </div>
          {order.customer_id && (
            <button onClick={vip} disabled={isVip || vipBusy}
              className={cx('w-full btn h-10 text-xs mt-3', isVip ? 'bg-warning-soft text-amber-700 border border-warning/30' : 'bg-white border-[1.5px] border-brand-200 text-brand-600 hover:bg-brand-50')}>
              {vipBusy ? <Spinner size={13} /> : <FiStar size={14} className={isVip ? 'fill-amber-400 text-amber-500' : ''} aria-hidden />}
              {isVip ? 'زبون مميز' : 'اجعله زبوناً مميزاً'}
            </button>
          )}
        </Section>

        {/* السائق */}
        {isDelivery && !['delivered', 'cancelled', 'pending'].includes(order.status) && (
          <Section title="السائق">
            {full.driver_id ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-[12px] bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><FiTruck aria-hidden /></div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-extrabold text-ink truncate">{full.driver_name || 'تم تعيين سائق'}</p>
                    <p className="text-[11.5px] text-ink-3">
                      {order.status === 'on_the_way' ? 'استلم الطلب وهو في الطريق للزبون' : 'في الطريق إلى المطعم لاستلام الطلب'}
                      {full.vehicle_plate ? ` · ${full.vehicle_plate}` : ''}
                    </p>
                  </div>
                </div>
                {full.driver_phone && (
                  <a href={`tel:${full.driver_phone}`} className="pressable w-10 h-10 rounded-[12px] bg-violet-500 text-white flex items-center justify-center flex-shrink-0 shadow-[0_8px_18px_rgba(139,92,246,.3)]" aria-label="اتصال بالسائق"><FiPhone size={15} /></a>
                )}
              </div>
            ) : (
              <p className="text-[13px] font-bold text-amber-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                {order.status === 'confirmed' ? 'جاري البحث عن سائق — يمكنك بدء التحضير الآن' : 'جاري البحث عن سائق…'}
              </p>
            )}
          </Section>
        )}

        {/* الأصناف والملخص */}
        {detailsLoading && !details ? (
          <Section title="الأصناف"><div className="space-y-2.5"><div className="sk h-4 w-1/2 rounded" /><div className="sk h-4 w-2/3 rounded" /><div className="sk h-4 w-1/3 rounded" /></div></Section>
        ) : failed && !details ? (
          <button onClick={reload} className="btn-ghost w-full"><FiRefreshCw size={14} /> تعذّر تحميل الأصناف — إعادة المحاولة</button>
        ) : details ? (
          <>
            <OrderItems items={details.items || []} />
            <OrderSummary order={full} items={details.items || []} />
          </>
        ) : null}

        {full.notes && (
          <section className="bg-warning-soft border border-warning/30 rounded-[18px] p-3.5">
            <p className="text-xs font-extrabold text-amber-700 flex items-center gap-1.5"><FiFileText size={13} aria-hidden /> ملاحظات الزبون</p>
            <p className="text-sm text-amber-900 mt-1 leading-relaxed">{full.notes}</p>
          </section>
        )}

        {order.status === 'ready' && isDelivery && (
          <p className="text-[13px] font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-[14px] p-3 text-center">الطلب جاهز — بانتظار السائق لاستلامه</p>
        )}
      </div>
    </Sheet>
  );
}

function OrderItems({ items }) {
  if (!items.length) return null;
  return (
    <Section title={<span className="flex items-center gap-1.5"><FiShoppingBag size={12} aria-hidden /> الأصناف ({items.length})</span>}>
      <div className="divide-y divide-surface-line">
        {items.map((item, i) => {
          const opts = parseOptions(item);
          const qty = parseInt(item.quantity) || 1;
          const line = num(item.subtotal) || num(item.price) * qty;
          return (
            <div key={item.id || i} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex justify-between items-start gap-2">
                <span className="text-[14px] text-ink font-bold flex items-start gap-2">
                  <span className="min-w-[26px] h-[22px] px-1.5 rounded-md bg-brand-50 text-brand-700 text-[12px] font-black flex items-center justify-center tnum">{qty}×</span>
                  {item.name_ar || item.name}
                </span>
                <span className="text-[14px] font-extrabold text-ink flex-shrink-0 tnum">{money(line)}</span>
              </div>
              {opts.length > 0 && (
                <div className="mt-1.5 space-y-0.5 ps-9">
                  {opts.map((opt, j) => (
                    <div key={j} className="flex justify-between items-center text-xs">
                      <span className="text-ink-2">+ {optionName(opt)}</span>
                      {optionPrice(opt) > 0 && <span className="text-ink-3 tnum">+{money(optionPrice(opt))}</span>}
                    </div>
                  ))}
                </div>
              )}
              {item.notes && <p className="text-xs text-amber-700 mt-1 ps-9">ملاحظة: {item.notes}</p>}
            </div>
          );
        })}
      </div>
    </Section>
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
    <section className="rounded-[18px] bg-surface/70 p-3.5 space-y-1.5">
      {rows.map(([label, value, kind]) => (
        <div key={label} className={cx('flex justify-between text-[13.5px]', kind === 'discount' && 'text-emerald-600')}>
          <span className={kind === 'discount' ? '' : 'text-ink-2'}>{label}</span>
          <span className="font-bold tnum">{kind === 'discount' ? '-' : ''}{money(value)}</span>
        </div>
      ))}
      <div className="flex justify-between items-center font-black text-base border-t border-dashed border-gray-300 pt-2.5 mt-1.5">
        <span>الإجمالي</span>
        <span className="text-brand-600 text-lg tnum">{money(order.total)}</span>
      </div>
    </section>
  );
}
