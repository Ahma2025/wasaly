import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiCalendar, FiPhone, FiRefreshCw, FiPackage, FiX, FiMapPin, FiUser, FiShoppingBag, FiTruck, FiCheck, FiFileText, FiLayers, FiChevronLeft } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, TableSkeleton, LoadMore, Modal, StatusChip, DataTable, IconButton, Button, useConfirm, useMediaQuery, Avatar } from '../components/ui';
import { Sk } from '../components/Skeleton';
import { STATUS, ORDER_FILTERS, statusMeta, fmtDateTime, money, num, paymentLabel, isPersonal, isGroup } from '../utils/format';
import GroupDetail, { GroupBadge, GroupStatusChip } from '../components/GroupDetail';

const PAGE = 50;
const FINAL = ['delivered', 'cancelled'];
const FLOW = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'];

const parseOptions = (o) => {
  try { const v = typeof o === 'string' ? JSON.parse(o) : o; return Array.isArray(v) ? v : []; } catch { return []; }
};

const dayStart = (s) => (s ? new Date(`${s}T00:00:00`).getTime() : null);
const dayEnd = (s) => (s ? new Date(`${s}T23:59:59.999`).getTime() : null);
const typeLabel = (o) => (o.order_type === 'pickup' ? '🏃 استلام' : isPersonal(o) ? '🛵 شخصي' : '🛵 توصيل');

export default function AdminOrders() {
  const cached = readCache('adm_orders');
  const [orders, setOrders] = useState(cached || []);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showDates, setShowDates] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [onlyGroups, setOnlyGroups] = useState(false);
  const timer = useRef(null);
  const reqId = useRef(0);
  const desktop = useMediaQuery('(min-width: 1024px)');

  const fetchOrders = useCallback(async ({ append = false, offset = 0 } = {}) => {
    const id = ++reqId.current;
    if (append) setLoadingMore(true); else setRefreshing(true);
    try {
      const r = await api.get('/admin/orders', { params: { status: status || undefined, search: search.trim() || undefined, limit: PAGE, offset } });
      if (id !== reqId.current) return;
      const rows = r.data || [];
      setOrders(prev => {
        const next = append ? [...prev, ...rows.filter(x => !prev.some(p => p.id === x.id))] : rows;
        if (!status && !search.trim() && !append) writeCache('adm_orders', next.slice(0, PAGE));
        return next;
      });
      setHasMore(rows.length >= PAGE);
    } catch (e) {
      if (id === reqId.current && e?.status !== 401 && e?.status !== 403) toast.error(e?.message || 'فشل تحميل الطلبات');
    } finally {
      if (id === reqId.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [status, search]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchOrders(), search ? 400 : 0);
    return () => clearTimeout(timer.current);
  }, [fetchOrders]);

  // فلترة التاريخ + بحث محلي إضافي (رقم الهاتف/المطعم) — تعمل حتى لو الخادم لا يدعمها
  const shown = useMemo(() => {
    const a = dayStart(from), b = dayEnd(to);
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      const t = new Date(o.created_at).getTime();
      if (a && !(t >= a)) return false;
      if (b && !(t <= b)) return false;
      if (status && o.status !== status) return false;
      if (onlyGroups && !isGroup(o)) return false;
      if (q) {
        const hay = [o.order_number, o.id, o.customer_name, o.restaurant_name, o.customer_phone, o.driver_name, o.group_number].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, from, to, search, status, onlyGroups]);

  const shownTotal = useMemo(() => shown.reduce((a, o) => a + num(o.total), 0), [shown]);

  const onChanged = (id, patch) => {
    setOrders(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
    setSelected(s => (s && s.id === id ? { ...s, ...patch } : s));
  };

  const dateActive = from || to;

  const columns = [
    { key: 'num', header: 'الطلب', render: o => (
      <div className="flex flex-col items-start gap-1">
        <span className="font-black text-ink num">#{o.order_number || o.id}</span>
        <GroupBadge o={o} />
      </div>
    ) },
    { key: 'cust', header: 'الزبون', render: o => (
      <div className="flex items-center gap-2.5 min-w-[150px]">
        <Avatar name={o.customer_name || 'ز'} size={32} rounded={10} tint="#2E90FA" />
        <div className="min-w-0"><p className="font-bold text-ink truncate">{o.customer_name || 'زبون'}</p>{o.customer_phone && <p className="text-[11px] text-ink-3 num" dir="ltr" style={{ textAlign: 'right' }}>{o.customer_phone}</p>}</div>
      </div>
    ) },
    { key: 'store', header: 'المتجر', render: o => <span className="text-ink-2 font-medium">{isPersonal(o) ? '📦 توصيل شخصي' : (o.restaurant_name || '—')}</span> },
    { key: 'status', header: 'الحالة', render: o => <StatusChip status={o.status} size="sm" /> },
    { key: 'type', header: 'النوع · الدفع', render: o => <span className="text-[12px] text-ink-3 font-bold whitespace-nowrap">{typeLabel(o)} · {paymentLabel(o.payment_method)}</span> },
    { key: 'time', header: 'الوقت', render: o => <span className="text-[12px] text-ink-3 whitespace-nowrap num">{fmtDateTime(o.created_at)}</span> },
    { key: 'total', header: 'الإجمالي', align: 'end', render: o => <span className="font-black text-ink num">{money(o.total)}</span> },
  ];

  return (
    <div className="page">
      <PageHeader icon={<FiPackage />} title="الطلبات" subtitle={`${shown.length} طلب معروض · ${money(shownTotal, 0)}`}
        action={<IconButton label="تحديث" onClick={() => fetchOrders()}><FiRefreshCw className={refreshing ? 'animate-spin' : ''} /></IconButton>} />

      {/* Filters bar */}
      <div className="lg:card lg:p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="رقم الطلب، اسم الزبون، الهاتف أو المتجر…" loading={refreshing && !!search} /></div>
          <button onClick={() => setShowDates(s => !s)} aria-label="فلتر التاريخ" aria-expanded={showDates}
            className={`h-[46px] px-3.5 rounded-[14px] flex items-center justify-center gap-2 text-sm font-extrabold flex-shrink-0 ${dateActive ? 'grad-sunset text-white shadow-brand' : 'bg-white border-[1.5px] border-surface-line text-ink-2 hover:border-[#DDE0EA]'}`}>
            <FiCalendar className="text-lg" /><span className="hidden sm:inline">{dateActive ? 'تاريخ مفعّل' : 'التاريخ'}</span>
          </button>
          <button onClick={() => setOnlyGroups(v => !v)} aria-pressed={onlyGroups} aria-label="الطلبات المجمّعة فقط" title="الطلبات المجمّعة فقط (المحمّلة)"
            className={`h-[46px] px-3.5 rounded-[14px] flex items-center justify-center gap-2 text-sm font-extrabold flex-shrink-0 ${onlyGroups ? 'bg-violet-600 text-white shadow-[0_10px_22px_rgba(139,92,246,.3)]' : 'bg-white border-[1.5px] border-surface-line text-ink-2 hover:border-[#DDE0EA]'}`}>
            <FiLayers className="text-lg" /><span className="hidden sm:inline">مجمّعة</span>
          </button>
        </div>

        {showDates && (
          <div className="card lg:shadow-none lg:bg-surface lg:border-0 p-3 grid grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-2 items-end animate-fade-up">
            <label><span className="lbl">من تاريخ</span><input type="date" className="inp" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label><span className="lbl">إلى تاريخ</span><input type="date" className="inp" value={to} onChange={e => setTo(e.target.value)} /></label>
            {dateActive && <Button variant="ghost" className="col-span-2 lg:col-span-1 text-brand-600" icon={<FiX />} onClick={() => { setFrom(''); setTo(''); }}>مسح</Button>}
            <p className="col-span-2 lg:col-span-3 text-[11px] text-ink-3">الفلترة على الطلبات المحمّلة — اضغط «تحميل المزيد» لجلب طلبات أقدم.</p>
          </div>
        )}

        <Chips value={status} onChange={setStatus}
          options={[['', 'الكل'], ...ORDER_FILTERS.map(s => [s, STATUS[s].label])]} />
      </div>

      {loading && orders.length === 0 ? (desktop ? <TableSkeleton rows={8} /> : <ListSkeleton rows={6} />)
        : shown.length === 0 ? <EmptyState icon={<FiPackage />} title="لا توجد طلبات" hint={dateActive || search ? 'جرّب تغيير البحث أو فلتر التاريخ' : 'ستظهر الطلبات الجديدة هنا'} />
        : desktop ? (
          <DataTable columns={columns} rows={shown} onRowClick={setSelected} dim={refreshing} maxHeight="calc(100vh - 330px)" />
        ) : (
          <div className={`space-y-2.5 ${refreshing ? 'opacity-70' : ''} transition-opacity`}>
            {shown.map(o => {
              const m = statusMeta(o.status);
              const personal = isPersonal(o);
              return (
                <button key={o.id} onClick={() => setSelected(o)}
                  className="w-full text-right card card-hover p-4 relative overflow-hidden">
                  <span className="absolute right-0 top-0 bottom-0 w-1" style={{ background: m.color }} />
                  <div className="flex justify-between items-start gap-2 mb-2.5">
                    <div className="min-w-0">
                      <p className="font-black text-ink text-[15px] truncate">{o.customer_name || 'زبون'} <span className="text-[11px] text-ink-3 font-bold num">#{o.order_number || o.id}</span></p>
                      <p className="text-xs text-ink-2 truncate mt-0.5">{personal ? '📦 توصيل شخصي' : `🏪 ${o.restaurant_name || '—'}`}</p>
                      {isGroup(o) && <GroupBadge o={o} className="mt-1.5" />}
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p className="font-black text-ink num text-[15px]">{money(o.total)}</p>
                      <p className="text-[10.5px] text-ink-3 num">{fmtDateTime(o.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <StatusChip status={o.status} size="sm" />
                    <span className="text-[11px] text-ink-3 font-bold truncate">{typeLabel(o)} · {paymentLabel(o.payment_method)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      {hasMore && <LoadMore shown={0} total={Infinity} loading={loadingMore} onMore={() => fetchOrders({ append: true, offset: orders.length })} />}

      <OrderDetail order={selected} onClose={() => setSelected(null)} onChanged={onChanged} onOpenGroup={setGroupId} />
      <GroupDetail groupId={groupId} onClose={() => setGroupId(null)} onChanged={() => fetchOrders()} />
    </div>
  );
}

function Row({ k, v, strong }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex justify-between items-start gap-3 py-2.5 border-b border-[#F1F2F6] last:border-0 text-sm">
      <span className="text-ink-3 font-medium flex-shrink-0">{k}</span>
      <span className={`text-left ${strong ? 'font-black text-ink' : 'font-bold text-ink'}`}>{v}</span>
    </div>
  );
}

function SectionCard({ icon, title, children, className = '' }) {
  return (
    <section className={`rounded-[18px] border border-surface-line bg-white ${className}`}>
      <h4 className="flex items-center gap-2 px-4 pt-3.5 pb-1 text-[13px] font-black text-ink">
        <span className="w-7 h-7 rounded-lg bg-orange-50 text-brand-600 flex items-center justify-center text-sm">{icon}</span>{title}
      </h4>
      <div className="px-4 pb-2">{children}</div>
    </section>
  );
}

function OrderDetail({ order, onClose, onChanged, onOpenGroup }) {
  const confirm = useConfirm();
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const lastOrder = useRef(order);
  if (order) lastOrder.current = order;

  useEffect(() => {
    if (!order) { setFull(null); return; }
    let alive = true;
    setLoading(true); setFull(null); setNewStatus('');
    api.get(`/orders/${order.id}`)
      .then(r => { if (alive) setFull(r.data || null); })
      .catch(() => { if (alive) setFull(null); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [order?.id]);

  // نُبقي آخر طلب أثناء حركة إغلاق الدرج
  const base = order || lastOrder.current;
  if (!base) return null;
  const o = { ...base, ...(order ? (full || {}) : {}) };
  const m = statusMeta(o.status);
  const personal = isPersonal(o);
  const items = Array.isArray(o.items) ? o.items : [];
  const final = FINAL.includes(o.status);
  const grouped = isGroup(o);
  // الطلب الفرعي في المجمّع: الاستلام والتسليم عبر مسار المجمّع فقط (السيرفر يرفض on_the_way/delivered)
  const statusOptions = ORDER_FILTERS.filter(s => s !== o.status && s !== 'cancelled' && !(grouped && (s === 'on_the_way' || s === 'delivered')));

  const setStatus = async (s) => {
    const meta = statusMeta(s);
    const isCancel = s === 'cancelled';
    const ok = await confirm({
      title: isCancel ? 'إلغاء الطلب' : 'تغيير حالة الطلب',
      message: isCancel && grouped
        ? `سيُلغى طلب «${o.restaurant_name || 'المطعم'}» فقط من الطلب المجمّع ${o.group_number || ''}، ويُعاد حساب المجمّع وإرجاع الفرق للزبون. لإلغاء المجمّع كاملاً افتح تفاصيل المجمّع.`
        : isCancel
        ? `سيتم إلغاء الطلب #${o.order_number || o.id} وإشعار الزبون والمطعم والسائق، وإرجاع الخصومات/النقاط للزبون.`
        : `تغيير حالة الطلب #${o.order_number || o.id} من «${m.label}» إلى «${meta.label}»؟`,
      confirmText: isCancel ? 'إلغاء الطلب' : 'تغيير',
      cancelText: 'تراجع',
      danger: isCancel,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.patch(`/orders/${o.id}/status`, { status: s });
      toast.success(isCancel ? 'تم إلغاء الطلب' : `تم تغيير الحالة إلى «${meta.label}»`);
      onChanged(o.id, { status: s });
      setFull(f => (f ? { ...f, status: s } : f));
      setNewStatus('');
    } catch (e) { toast.error(e?.message || 'تعذّر تحديث الحالة'); }
    finally { setBusy(false); }
  };

  const timeline = [
    ['تم إنشاء الطلب', o.created_at],
    ['قبول المطعم', o.restaurant_accepted_at],
    ['استلام السائق', o.picked_up_at],
    ['تم التسليم', o.delivered_at || o.actual_delivery_time],
    ['أُلغي', o.cancelled_at],
  ].filter(([, t]) => t);

  const flowIdx = FLOW.indexOf(o.status === 'picked_up' ? 'on_the_way' : o.status);
  const cancelled = o.status === 'cancelled';

  const tel = (p) => p ? <a href={`tel:${p}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline num" dir="ltr"><FiPhone className="text-xs" />{p}</a> : null;

  return (
    <Modal open={!!order} onClose={onClose} size="lg" variant="drawer"
      title={<span className="flex items-center gap-2 flex-wrap">طلب <span className="num">#{o.order_number || o.id}</span> <StatusChip status={o.status} size="sm" /></span>}
      subtitle={`${fmtDateTime(o.created_at)} · ${personal ? 'توصيل شخصي' : o.order_type === 'pickup' ? 'استلام من المحل' : 'توصيل'}`}
      footer={final ? (
        <p className="text-center text-xs text-ink-3 font-bold py-1">الطلب في حالة نهائية ({m.label}) — لا يمكن تعديله.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select className="inp flex-1" value={newStatus} onChange={e => setNewStatus(e.target.value)} disabled={busy} aria-label="الحالة الجديدة">
              <option value="">تغيير الحالة إلى…</option>
              {statusOptions.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <Button disabled={!newStatus} loading={busy && !!newStatus} onClick={() => setStatus(newStatus)}>تطبيق</Button>
          </div>
          {grouped && (o.status === 'on_the_way' || o.picked_up_at) ? (
            <Button variant="secondary" className="w-full" icon={<FiLayers />} onClick={() => o.group_id != null && onOpenGroup?.(o.group_id)}>استلمه السائق — للإلغاء افتح الطلب المجمّع</Button>
          ) : (
            <Button variant="danger" className="w-full" disabled={busy} icon={<FiX />} onClick={() => setStatus('cancelled')}>{grouped ? 'إلغاء طلب هذا المطعم فقط' : 'إلغاء الطلب'}</Button>
          )}
        </div>
      )}>
      <div className="space-y-4">
        {grouped && (
          <button type="button" onClick={() => o.group_id != null && onOpenGroup?.(o.group_id)}
            className="w-full text-right rounded-[18px] p-3.5 bg-gradient-to-br from-violet-50 to-white border border-violet-200 flex items-center gap-3 hover:shadow-card transition-shadow">
            <span className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center text-lg flex-shrink-0"><FiLayers /></span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm text-violet-800">طلب مجمّع <span className="num" dir="ltr">{o.group_number || ''}</span></span>
                {o.group_status && <GroupStatusChip status={o.group_status} size="sm" />}
              </span>
              <span className="block text-[11.5px] text-ink-2 font-medium mt-0.5">
                {o.stop_sequence ? <>محطة <span className="num">{o.stop_sequence}</span> من <span className="num">{o.group_stops_count || '?'}</span> · </> : null}
                {o.group_total != null ? <>إجمالي المجمّع <span className="num font-bold">{money(o.group_total)}</span> · </> : null}
                الرسوم والدفع على مستوى المجمّع
              </span>
            </span>
            <FiChevronLeft className="text-violet-500 flex-shrink-0" />
          </button>
        )}
        {/* Status stepper */}
        {!personal || o.status ? (
          <div className={`rounded-[18px] p-4 ${cancelled ? 'bg-red-50/70 border border-red-100' : 'bg-gradient-to-br from-[#FFF7F0] to-white border border-orange-100'}`}>
            {cancelled ? (
              <p className="text-sm font-black text-red-600 flex items-center gap-2"><FiX /> الطلب ملغي</p>
            ) : (
              <>
                <div className="flex items-center justify-between relative">
                  <div className="absolute top-[13px] right-[14px] left-[14px] h-[3px] rounded-full bg-orange-100" />
                  <div className="absolute top-[13px] right-[14px] h-[3px] rounded-full grad-sunset transition-all duration-700 ease-lux"
                    style={{ width: `calc((100% - 28px) * ${Math.max(0, flowIdx) / (FLOW.length - 1)})` }} />
                  {FLOW.map((s, i) => {
                    const done = i <= flowIdx;
                    return (
                      <span key={s} className={`relative z-[1] w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-500 ${done ? 'grad-sunset text-white shadow-brand' : 'bg-white text-ink-4 ring-2 ring-orange-100'} ${i === flowIdx ? 'scale-110' : ''}`}
                        style={{ transitionDelay: `${i * 70}ms` }}>
                        {done && i < flowIdx ? <FiCheck /> : i + 1}
                      </span>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  {FLOW.map((s, i) => <span key={s} className={`text-[9.5px] font-bold w-12 text-center -mx-2.5 leading-tight ${i === flowIdx ? 'text-brand-700' : 'text-ink-3'}`}>{STATUS[s].short}</span>)}
                </div>
              </>
            )}
          </div>
        ) : null}

        <SectionCard icon={<FiUser />} title="الأطراف">
          <Row k="الزبون" v={o.customer_name || 'زبون'} />
          <Row k="هاتف الزبون" v={tel(o.customer_phone)} />
          {personal ? (
            <>
              <Row k="نوع الخدمة" v={o.service_type === 'ride' ? '🚗 توصيل راكب' : '📦 توصيل طرد'} />
              <Row k="نقطة الاستلام" v={o.pickup_address || (o.pickup_lat ? `${num(o.pickup_lat).toFixed(5)}, ${num(o.pickup_lng).toFixed(5)}` : null)} />
              <Row k="المستلم" v={o.recipient_name} />
              <Row k="هاتف المستلم" v={tel(o.recipient_phone)} />
              <Row k="وصف الطرد" v={o.parcel_desc} />
            </>
          ) : (
            <>
              <Row k="المطعم" v={o.restaurant_name} />
              <Row k="هاتف المطعم" v={tel(o.restaurant_phone)} />
            </>
          )}
          <Row k="السائق" v={o.driver_name || (o.order_type === 'pickup' ? '—' : 'لم يُعيَّن بعد')} />
          <Row k="هاتف السائق" v={tel(o.driver_phone)} />
        </SectionCard>

        {(o.delivery_address || o.order_type === 'pickup' || o.distance_km || o.notes) && (
          <SectionCard icon={<FiMapPin />} title="التوصيل">
            <Row k="عنوان التسليم" v={o.delivery_address || (o.order_type === 'pickup' ? 'استلام من المحل' : null)} />
            {o.distance_km ? <Row k="المسافة" v={`${num(o.distance_km).toFixed(1)} كم`} /> : null}
            <Row k="ملاحظات" v={o.notes} />
          </SectionCard>
        )}

        <SectionCard icon={<FiShoppingBag />} title="الأصناف">
          <div className="pt-2 pb-2">
            {loading ? (
              <div className="space-y-2"><Sk h={46} r={12} /><Sk h={46} r={12} /></div>
            ) : items.length === 0 ? (
              <p className="text-xs text-ink-3 bg-surface rounded-xl p-3 text-center font-medium">{personal ? 'طلب توصيل شخصي — بلا أصناف' : 'لا توجد تفاصيل أصناف'}</p>
            ) : (
              <div className="space-y-2">
                {items.map((it, i) => {
                  const opts = parseOptions(it.options);
                  return (
                    <div key={it.id || i} className="flex items-start gap-3 bg-surface rounded-xl p-3">
                      <span className="w-8 h-8 rounded-[10px] bg-white text-brand-600 font-black text-xs flex items-center justify-center flex-shrink-0 shadow-soft num">×{it.quantity}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-ink">{it.name_ar || it.name || it.name_en || 'صنف'}</p>
                        {opts.length > 0 && <p className="text-[11px] text-ink-3 mt-0.5">{opts.map(x => x?.name || x?.value || x?.name_ar).filter(Boolean).join('، ')}</p>}
                        {it.notes && <p className="text-[11px] text-amber-600 mt-0.5">📝 {it.notes}</p>}
                      </div>
                      <span className="font-black text-sm text-ink num">{money(it.subtotal ?? num(it.price) * num(it.quantity))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard icon={<FiFileText />} title="الفاتورة">
          <Row k="المجموع الفرعي" v={<span className="num">{money(o.subtotal)}</span>} />
          <Row k="رسوم التوصيل" v={grouped ? 'ضمن المجمّع' : num(o.delivery_fee) === 0 && o.order_type !== 'pickup' ? 'مجاني' : <span className="num">{money(o.delivery_fee)}</span>} />
          {num(o.discount) > 0 && <Row k="الخصم" v={<span className="text-green-600 num">−{money(o.discount)}</span>} />}
          {o.coupon_code && <Row k="كوبون" v={<span className="font-mono">{o.coupon_code}</span>} />}
          {num(o.points_value) > 0 && <Row k="نقاط مستبدلة" v={<span className="text-green-600 num">−{money(o.points_value)}</span>} />}
          {o.tip != null && <Row k="الإكرامية" v={<span className="num">{money(o.tip)}</span>} />}
          {num(o.wallet_used) > 0 && <Row k="من المحفظة" v={<span className="text-green-600 num">−{money(o.wallet_used)}</span>} />}
          <div className="flex justify-between items-center my-2 rounded-xl bg-ink text-white px-4 py-3">
            <span className="font-bold text-sm text-white/80">الإجمالي</span>
            <span className="font-black text-lg num">{money(o.total)}</span>
          </div>
          <Row k="الدفع" v={`${paymentLabel(o.payment_method)}${o.payment_status ? ` · ${o.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}` : ''}`} />
        </SectionCard>

        {timeline.length > 0 && (
          <SectionCard icon={<FiTruck />} title="المسار الزمني">
            <ol className="relative mr-3 py-3 space-y-4 stagger">
              <span className="absolute right-0 top-4 bottom-4 w-[2px] bg-gradient-to-b from-orange-300 to-orange-100 rounded-full" aria-hidden="true" />
              {timeline.map(([k, t], i) => (
                <li key={k} className="pr-6 relative">
                  <span className={`absolute -right-[6px] top-1 w-3.5 h-3.5 rounded-full ring-4 ring-white ${k === 'أُلغي' ? 'bg-red-500' : i === timeline.length - 1 ? 'grad-sunset' : 'bg-orange-400'}`} />
                  <p className="text-sm font-bold text-ink">{k}</p>
                  <p className="text-[11px] text-ink-3 num mt-0.5">{fmtDateTime(t)}</p>
                </li>
              ))}
            </ol>
          </SectionCard>
        )}
      </div>
    </Modal>
  );
}
