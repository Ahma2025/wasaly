import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiCalendar, FiPhone, FiRefreshCw } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, LoadMore, Modal, Badge, useConfirm } from '../components/ui';
import { Sk } from '../components/Skeleton';
import { STATUS, ORDER_FILTERS, statusMeta, fmtDateTime, money, num, paymentLabel, isPersonal } from '../utils/format';

const PAGE = 50;
const FINAL = ['delivered', 'cancelled'];

const parseOptions = (o) => {
  try { const v = typeof o === 'string' ? JSON.parse(o) : o; return Array.isArray(v) ? v : []; } catch { return []; }
};

const dayStart = (s) => (s ? new Date(`${s}T00:00:00`).getTime() : null);
const dayEnd = (s) => (s ? new Date(`${s}T23:59:59.999`).getTime() : null);

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
  const timer = useRef(null);
  const reqId = useRef(0);

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
      if (q) {
        const hay = [o.order_number, o.id, o.customer_name, o.restaurant_name, o.customer_phone, o.driver_name].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, from, to, search, status]);

  const onChanged = (id, patch) => {
    setOrders(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
    setSelected(s => (s && s.id === id ? { ...s, ...patch } : s));
  };

  const dateActive = from || to;

  return (
    <div className="space-y-4 p-4 animate-fade-up">
      <PageHeader icon="📦" title="الطلبات" subtitle={`${shown.length} طلب معروض`}
        action={
          <button onClick={() => fetchOrders()} aria-label="تحديث" className="w-10 h-10 rounded-2xl bg-white shadow-soft border border-gray-100 flex items-center justify-center text-gray-500">
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
          </button>
        } />

      <div className="flex gap-2">
        <div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="رقم الطلب أو اسم الزبون…" loading={refreshing && !!search} /></div>
        <button onClick={() => setShowDates(s => !s)} aria-label="فلتر التاريخ"
          className={`w-12 rounded-2xl flex items-center justify-center text-lg ${dateActive ? 'grad-sunset text-white shadow-brand' : 'bg-white border border-gray-100 shadow-soft text-gray-500'}`}>
          <FiCalendar />
        </button>
      </div>

      {showDates && (
        <div className="card p-3 grid grid-cols-2 gap-2 animate-fade-up">
          <label><span className="lbl">من تاريخ</span><input type="date" className="inp" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label><span className="lbl">إلى تاريخ</span><input type="date" className="inp" value={to} onChange={e => setTo(e.target.value)} /></label>
          {dateActive && <button onClick={() => { setFrom(''); setTo(''); }} className="col-span-2 text-xs font-bold text-orange-600 py-1">مسح فلتر التاريخ</button>}
          <p className="col-span-2 text-[10px] text-gray-400">الفلترة على الطلبات المحمّلة — اضغط «تحميل المزيد» لجلب طلبات أقدم.</p>
        </div>
      )}

      <Chips value={status} onChange={setStatus}
        options={[['', 'الكل'], ...ORDER_FILTERS.map(s => [s, STATUS[s].label])]} />

      {loading && orders.length === 0 ? <ListSkeleton rows={6} />
        : shown.length === 0 ? <EmptyState icon="📦" title="لا توجد طلبات" hint={dateActive || search ? 'جرّب تغيير البحث أو فلتر التاريخ' : undefined} />
        : (
          <div className={`space-y-3 ${refreshing ? 'opacity-70' : ''} transition-opacity`}>
            {shown.map(o => {
              const m = statusMeta(o.status);
              const personal = isPersonal(o);
              return (
                <button key={o.id} onClick={() => setSelected(o)}
                  className="w-full text-right card hover-lift p-4" style={{ borderRight: `4px solid ${m.color}` }}>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 text-sm truncate">{o.customer_name || 'زبون'} <span className="text-[11px] text-gray-400 font-bold">#{o.order_number || o.id}</span></p>
                      <p className="text-xs text-gray-500 truncate">{personal ? '📦 توصيل شخصي' : `🏪 ${o.restaurant_name || '—'}`}</p>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p className="font-black text-orange-600 tabular-nums">{money(o.total)}</p>
                      <p className="text-[10px] text-gray-400">{fmtDateTime(o.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className={m.cls}>{m.label}</Badge>
                    <span className="text-[11px] text-gray-400 font-semibold">{o.order_type === 'pickup' ? '🏃 استلام' : personal ? '🛵 شخصي' : '🛵 توصيل'} · {paymentLabel(o.payment_method)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      {hasMore && <LoadMore shown={0} total={Infinity} loading={loadingMore} onMore={() => fetchOrders({ append: true, offset: orders.length })} />}

      <OrderDetail order={selected} onClose={() => setSelected(null)} onChanged={onChanged} />
    </div>
  );
}

function Row({ k, v, strong }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex justify-between items-start gap-3 py-2 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-500 flex-shrink-0">{k}</span>
      <span className={`text-left ${strong ? 'font-black text-gray-900' : 'font-semibold text-gray-800'}`}>{v}</span>
    </div>
  );
}

function OrderDetail({ order, onClose, onChanged }) {
  const confirm = useConfirm();
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [busy, setBusy] = useState(false);

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

  if (!order) return null;
  const o = { ...order, ...(full || {}) };
  const m = statusMeta(o.status);
  const personal = isPersonal(o);
  const items = Array.isArray(o.items) ? o.items : [];
  const final = FINAL.includes(o.status);

  const setStatus = async (s) => {
    const meta = statusMeta(s);
    const isCancel = s === 'cancelled';
    const ok = await confirm({
      title: isCancel ? 'إلغاء الطلب' : 'تغيير حالة الطلب',
      message: isCancel
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

  const tel = (p) => p ? <a href={`tel:${p}`} className="inline-flex items-center gap-1 text-orange-600" dir="ltr"><FiPhone className="text-xs" />{p}</a> : null;

  return (
    <Modal open={!!order} onClose={onClose} size="lg"
      title={<span className="flex items-center gap-2">طلب #{o.order_number || o.id} <Badge className={m.cls}>{m.label}</Badge></span>}
      subtitle={`${fmtDateTime(o.created_at)} · ${personal ? 'توصيل شخصي' : o.order_type === 'pickup' ? 'استلام من المحل' : 'توصيل'}`}
      footer={final ? (
        <p className="text-center text-xs text-gray-400 font-semibold">الطلب في حالة نهائية ({m.label}) — لا يمكن تعديله.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select className="inp flex-1" value={newStatus} onChange={e => setNewStatus(e.target.value)} disabled={busy}>
              <option value="">تغيير الحالة إلى…</option>
              {ORDER_FILTERS.filter(s => s !== o.status && s !== 'cancelled').map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <button disabled={!newStatus || busy} onClick={() => setStatus(newStatus)} className="btn-lux px-4 text-sm disabled:opacity-50">تطبيق</button>
          </div>
          <button disabled={busy} onClick={() => setStatus('cancelled')} className="w-full py-3 rounded-2xl bg-red-50 text-red-600 font-black text-sm disabled:opacity-50">
            ✕ إلغاء الطلب
          </button>
        </div>
      )}>
      <div className="space-y-4">
        <section className="rounded-2xl bg-gray-50 p-3">
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
          <Row k="عنوان التسليم" v={o.delivery_address || (o.order_type === 'pickup' ? 'استلام من المحل' : null)} />
          <Row k="السائق" v={o.driver_name || (o.order_type === 'pickup' ? '—' : 'لم يُعيَّن بعد')} />
          <Row k="هاتف السائق" v={tel(o.driver_phone)} />
          {o.distance_km ? <Row k="المسافة" v={`${num(o.distance_km).toFixed(1)} كم`} /> : null}
          <Row k="ملاحظات" v={o.notes} />
        </section>

        <section>
          <h4 className="font-black text-gray-900 text-sm mb-2">الأصناف</h4>
          {loading ? (
            <div className="space-y-2"><Sk h={38} r={12} /><Sk h={38} r={12} /></div>
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 text-center">{personal ? 'طلب توصيل شخصي — بلا أصناف' : 'لا توجد تفاصيل أصناف'}</p>
          ) : (
            <div className="space-y-2">
              {items.map((it, i) => {
                const opts = parseOptions(it.options);
                return (
                  <div key={it.id || i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                    <span className="w-7 h-7 rounded-lg bg-white text-orange-600 font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm">×{it.quantity}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-900">{it.name_ar || it.name || it.name_en || 'صنف'}</p>
                      {opts.length > 0 && <p className="text-[11px] text-gray-500">{opts.map(x => x?.name || x?.value || x?.name_ar).filter(Boolean).join('، ')}</p>}
                      {it.notes && <p className="text-[11px] text-amber-600">📝 {it.notes}</p>}
                    </div>
                    <span className="font-black text-sm text-gray-800 tabular-nums">{money(it.subtotal ?? num(it.price) * num(it.quantity))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-100 p-3">
          <Row k="المجموع الفرعي" v={money(o.subtotal)} />
          <Row k="رسوم التوصيل" v={num(o.delivery_fee) === 0 && o.order_type !== 'pickup' ? 'مجاني' : money(o.delivery_fee)} />
          {num(o.discount) > 0 && <Row k="الخصم" v={<span className="text-green-600">−{money(o.discount)}</span>} />}
          {o.coupon_code && <Row k="كوبون" v={o.coupon_code} />}
          {num(o.points_value) > 0 && <Row k="نقاط مستبدلة" v={<span className="text-green-600">−{money(o.points_value)}</span>} />}
          {o.tip != null && <Row k="الإكرامية" v={money(o.tip)} />}
          {num(o.wallet_used) > 0 && <Row k="من المحفظة" v={<span className="text-green-600">−{money(o.wallet_used)}</span>} />}
          <Row k="الإجمالي" v={<span className="text-orange-600 text-base">{money(o.total)}</span>} strong />
          <Row k="الدفع" v={`${paymentLabel(o.payment_method)}${o.payment_status ? ` · ${o.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}` : ''}`} />
        </section>

        {timeline.length > 0 && (
          <section>
            <h4 className="font-black text-gray-900 text-sm mb-2">المسار الزمني</h4>
            <ol className="relative border-r-2 border-orange-100 mr-2 space-y-3">
              {timeline.map(([k, t]) => (
                <li key={k} className="mr-4 relative">
                  <span className={`absolute -right-[23px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${k === 'أُلغي' ? 'bg-red-500' : 'bg-orange-500'}`} />
                  <p className="text-sm font-bold text-gray-800">{k}</p>
                  <p className="text-[11px] text-gray-400">{fmtDateTime(t)}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  );
}
