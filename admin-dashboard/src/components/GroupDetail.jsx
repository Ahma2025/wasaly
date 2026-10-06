import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiLayers, FiPhone, FiUser, FiTruck, FiFileText, FiMapPin, FiX, FiCheck, FiRefreshCw, FiShoppingBag, FiClock } from 'react-icons/fi';
import api from '../utils/api';
import { Modal, Button, StatusChip, useConfirm } from './ui';
import { Sk } from './Skeleton';
import { groupStatusMeta, fmtDateTime, money, num, paymentLabel, isGroup, TERMS } from '../utils/format';
import { arCount, ofTotal } from '../utils/plural';

const ACTIVE = ['pending', 'confirmed', 'picking_up', 'on_the_way'];
const FLOW = ['pending', 'confirmed', 'picking_up', 'on_the_way', 'delivered'];

const parseOptions = (o) => {
  try { const v = typeof o === 'string' ? JSON.parse(o) : o; return Array.isArray(v) ? v : []; } catch { return []; }
};

/** شارة «مجمّع» صغيرة للقوائم — تُظهر رقم المجمّع وترتيب المحطة */
export function GroupBadge({ o, withNumber = true, className = '' }) {
  if (!isGroup(o)) return null;
  // «3/2» مستحيل: نخفي الترتيب عندما يتجاوز عدد المحطات (انسحاب مطعم قبل قبول سائق) — X-05
  const pos = ofTotal(o.stop_sequence, o.group_stops_count ?? o.stops_total);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-extrabold ring-1 ring-inset bg-teal-50 text-teal-700 ring-teal-200 whitespace-nowrap ${className}`}
      title="طلب مجمّع — عدة مطاعم وسائق واحد">
      <FiLayers className="text-[10px]" />
      مجمّع{withNumber && o.group_number ? <span className="num" dir="ltr">{o.group_number}</span> : null}
      {pos ? <span className="num opacity-80" dir="ltr">· {pos.x}/{pos.n}</span> : null}
    </span>
  );
}

export function GroupStatusChip({ status, label, size = 'md' }) {
  const m = groupStatusMeta(status);
  const live = ACTIVE.includes(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-extrabold ring-1 ring-inset whitespace-nowrap ${m.cls} ${size === 'sm' ? 'px-2 py-[2px] text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}>
      <span className={live ? 'live-dot' : 'w-2 h-2 rounded-full'} style={{ background: m.color, width: 7, height: 7 }} />
      {label || m.label}
    </span>
  );
}

function Row({ k, v, strong, tone }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex justify-between items-start gap-3 py-2.5 border-b border-[#F1F2F6] last:border-0 text-sm">
      <span className="text-ink-3 font-medium flex-shrink-0">{k}</span>
      <span className={`text-left ${strong ? 'font-black text-ink' : 'font-bold'} ${tone || 'text-ink'}`}>{v}</span>
    </div>
  );
}

function SectionCard({ icon, title, children, action }) {
  return (
    <section className="rounded-[18px] border border-surface-line bg-white">
      <h4 className="flex items-center gap-2 px-4 pt-3.5 pb-1 text-[13px] font-black text-ink">
        <span className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center text-sm">{icon}</span>
        <span className="flex-1">{title}</span>{action}
      </h4>
      <div className="px-4 pb-2">{children}</div>
    </section>
  );
}

const tel = (p) => p ? <a href={`tel:${p}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline num" dir="ltr"><FiPhone className="text-xs" />{p}</a> : null;

/**
 * تفاصيل الطلب المجمّع — GET /api/admin/groups/:id
 * groupId: رقم المجمّع (null = مغلق) · onChanged: بعد الإلغاء
 */
export default function GroupDetail({ groupId, onClose, onChanged }) {
  const confirm = useConfirm();
  const [g, setG] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastId = useRef(groupId);
  const reqId = useRef(0);
  if (groupId != null) lastId.current = groupId;
  const id = groupId ?? lastId.current;

  // حارس رقم الطلب: ردّ قديم لمجمّع سابق لا يكتب فوق المجمّع الحالي — A-23
  const load = useCallback(async () => {
    if (groupId == null) return;
    const rid = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const r = await api.get(`/admin/groups/${groupId}`);
      if (rid !== reqId.current) return;
      const d = r.data || null;
      if (d && d.id != null && String(d.id) !== String(groupId)) return;
      setG(d);
    } catch (e) { if (rid === reqId.current) setError(e?.message || 'تعذّر تحميل الطلب المجمّع'); }
    finally { if (rid === reqId.current) setLoading(false); }
  }, [groupId]);

  useEffect(() => { if (groupId != null) { setG(null); load(); } else reqId.current++; }, [groupId, load]);

  const cancelGroup = async () => {
    const ok = await confirm({
      title: 'إلغاء الطلب المجمّع كاملاً',
      message: `سيتم إلغاء ${g?.group_number || 'الطلب'} وكل طلبات المطاعم المفتوحة فيه، وإرجاع رصيد محفظة وصلّي والنقاط للزبون بالكامل، وتحرير السائق.`,
      confirmText: 'إلغاء المجمّع', cancelText: 'تراجع', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.patch(`/orders/groups/${id}/cancel`, { reason: 'إلغاء من الإدارة' });
      const d = r?.data || {};
      const extra = [num(d.refunded_wallet) > 0 && `${TERMS.wallet} ${money(d.refunded_wallet)}`, num(d.refunded_points) > 0 && arCount(d.refunded_points, 'point')].filter(Boolean).join(' · ');
      toast.success(`تم إلغاء الطلب المجمّع${extra ? ` — أُرجع: ${extra}` : ''}`);
      onChanged?.(id);
      load();
    } catch (e) { toast.error(e?.message || 'تعذّر إلغاء الطلب المجمّع'); }
    finally { setBusy(false); }
  };

  const o = g || {};
  const active = ACTIVE.includes(o.status);
  const cancelled = o.status === 'cancelled';
  const flowIdx = FLOW.indexOf(o.status);
  const orders = Array.isArray(o.orders) ? o.orders : [];
  const stopsOrder = Array.isArray(o.stops) ? o.stops : [];
  // السائق «معيّن» فقط بعد قبوله العرض — X-03
  const assigned = !!o.driver_assigned_at;

  // المسار الزمني: أحداث المجمّع + قبول/استلام كل مطعم
  // «انسحاب» فقط لمطعم أُلغي طلبه قبل إلغاء المجمّع كاملاً؛ أبناء ألغاهم إلغاء المجمّع لا تُعرض كانسحاب — A-24
  const groupCancelAt = cancelled && o.cancelled_at ? new Date(o.cancelled_at).getTime() : null;
  const withdrew = (c) => c.cancelled_at && (groupCancelAt == null || new Date(c.cancelled_at).getTime() < groupCancelAt - 3000);
  const stopsCount = parseInt(o.stops_total) || orders.filter(c => c.status !== 'cancelled').length || orders.length;
  const timeline = [
    ['تم إنشاء الطلب', o.created_at],
    ...orders.filter(c => c.restaurant_accepted_at).map(c => [`قبول ${c.restaurant_name || 'المطعم'}`, c.restaurant_accepted_at]),
    ['قبول السائق', o.driver_assigned_at],
    ...orders.filter(c => c.picked_up_at).map(c => [`استلام من ${c.restaurant_name || 'المطعم'}`, c.picked_up_at]),
    ...orders.filter(withdrew).map(c => [`انسحاب ${c.restaurant_name || 'مطعم'}${c.cancel_reason ? ` — ${c.cancel_reason}` : ''}`, c.cancelled_at, 'cancel']),
    ['تم التسليم', o.delivered_at],
    [`أُلغي الطلب${o.cancelled_by ? ` (${o.cancelled_by === 'customer' ? 'الزبون' : o.cancelled_by === 'admin' ? 'الإدارة' : 'المطاعم'})` : ''}`, o.cancelled_at, 'cancel'],
  ].filter(([, t]) => t).sort((a, b) => new Date(a[1]) - new Date(b[1]));

  return (
    <Modal open={groupId != null} onClose={onClose} size="lg" variant="drawer" icon={<FiLayers />}
      title={<span className="flex items-center gap-2 flex-wrap">طلب مجمّع <span className="num" dir="ltr">{o.group_number || `#${id ?? ''}`}</span>{o.status && <GroupStatusChip status={o.status} label={o.status_label} size="sm" />}</span>}
      subtitle={o.created_at ? `${fmtDateTime(o.created_at)} · ${arCount(stopsCount, 'restaurant')} · سائق واحد` : 'عدة مطاعم · سائق واحد'}
      footer={g ? (active ? (
        <Button variant="danger" className="w-full" loading={busy} icon={<FiX />} onClick={cancelGroup}>إلغاء الطلب المجمّع كاملاً (استرجاع كامل)</Button>
      ) : (
        <p className="text-center text-xs text-ink-3 font-bold py-1">الطلب المجمّع في حالة نهائية ({groupStatusMeta(o.status).label}).</p>
      )) : null}>
      {loading && !g ? (
        <div className="space-y-3"><Sk h={80} r={18} /><Sk h={160} r={18} /><Sk h={200} r={18} /></div>
      ) : error && !g ? (
        <div className="text-center py-10">
          <p className="text-sm font-bold text-red-500">{error}</p>
          <Button variant="secondary" className="mt-3" icon={<FiRefreshCw />} onClick={load}>إعادة المحاولة</Button>
        </div>
      ) : g ? (
        <div className="space-y-4">
          {/* Status stepper */}
          <div className={`rounded-[18px] p-4 ${cancelled ? 'bg-red-50/70 border border-red-100' : 'bg-gradient-to-br from-teal-50 to-white border border-teal-100'}`}>
            {cancelled ? (
              <p className="text-sm font-black text-red-600 flex items-center gap-2"><FiX /> الطلب المجمّع ملغي{o.cancel_reason ? ` — ${o.cancel_reason}` : ''}</p>
            ) : (
              <>
                <div className="flex items-center justify-between relative">
                  <div className="absolute top-[13px] right-[14px] left-[14px] h-[3px] rounded-full bg-teal-100" />
                  <div className="absolute top-[13px] right-[14px] h-[3px] rounded-full grad-sunset transition-all duration-700 ease-lux"
                    style={{ width: `calc((100% - 28px) * ${Math.max(0, flowIdx) / (FLOW.length - 1)})` }} />
                  {FLOW.map((s, i) => {
                    const done = i <= flowIdx;
                    return (
                      <span key={s} className={`relative z-[1] w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${done ? 'grad-sunset text-white shadow-brand' : 'bg-white text-ink-4 ring-2 ring-teal-100'} ${i === flowIdx ? 'scale-110' : ''}`}>
                        {done && i < flowIdx ? <FiCheck /> : i + 1}
                      </span>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  {FLOW.map((s, i) => <span key={s} className={`text-[9.5px] font-bold w-14 text-center -mx-3.5 leading-tight ${i === flowIdx ? 'text-teal-700' : 'text-ink-3'}`}>{groupStatusMeta(s).label}</span>)}
                </div>
                <p className="text-[11.5px] text-ink-2 font-bold mt-3 text-center num">
                  {parseInt(o.picked_count) > 0
                    ? <>تم الاستلام من <span dir="ltr">{Math.min(parseInt(o.picked_count), stopsCount)}/{stopsCount}</span> · {arCount(stopsCount, 'restaurant')}</>
                    : `لم يُستلم شيء بعد · ${arCount(stopsCount, 'restaurant')}`}
                </p>
              </>
            )}
          </div>

          {/* المحطات */}
          <SectionCard icon={<FiShoppingBag />} title={`المطاعم · ${arCount(orders.length, 'restaurant')}`}>
            <div className="space-y-2.5 py-2">
              {orders.map(c => {
                const items = Array.isArray(c.items) ? c.items : [];
                const off = c.status === 'cancelled';
                return (
                  <div key={c.id || c.order_id} className={`rounded-2xl border p-3 ${off ? 'border-red-100 bg-red-50/40' : 'border-surface-line bg-surface/60'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center font-black text-sm flex-shrink-0 num ${off ? 'bg-red-100 text-red-500' : 'grad-sunset text-white shadow-brand'}`}>{off ? '×' : (ofTotal(c.stop_sequence, stopsCount)?.x || '•')}</span>
                        <div className="min-w-0">
                          <p className={`font-extrabold text-sm truncate ${off ? 'text-ink-3 line-through' : 'text-ink'}`}>{c.restaurant_name || 'مطعم'}</p>
                          <p className="text-[11px] text-ink-3 num">#{c.order_number || c.order_id}{c.restaurant_phone ? ' · ' : ''}{c.restaurant_phone && <a href={`tel:${c.restaurant_phone}`} className="text-brand-600" dir="ltr">{c.restaurant_phone}</a>}</p>
                        </div>
                      </div>
                      <div className="text-left flex-shrink-0 space-y-1">
                        <StatusChip status={c.status} size="sm" order={c} />
                        <p className="font-black text-sm text-ink num">{money(c.subtotal)}</p>
                      </div>
                    </div>
                    {items.length > 0 && (
                      <ul className="mt-2.5 space-y-1">
                        {items.map((it, i) => {
                          const opts = parseOptions(it.options);
                          return (
                            <li key={it.id || i} className="flex items-start gap-2 text-[12.5px]">
                              <span className="font-black text-brand-600 num flex-shrink-0">×{it.quantity}</span>
                              <span className="flex-1 min-w-0 text-ink-2 font-medium">
                                {it.name_ar || it.name_en || 'صنف'}
                                {opts.length > 0 && <span className="text-ink-3"> ({opts.map(x => x?.name || x?.value || x?.name_ar).filter(Boolean).join('، ')})</span>}
                                {it.notes && <span className="block text-amber-600 text-[11px]">📝 {it.notes}</span>}
                              </span>
                              <span className="font-bold text-ink num flex-shrink-0">{money(it.subtotal ?? num(it.price) * num(it.quantity))}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {(c.picked_up_at || c.cancel_reason || c.notes) && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold">
                        {c.picked_up_at && <span className="text-green-600 flex items-center gap-1"><FiCheck /> استُلم {fmtDateTime(c.picked_up_at)}</span>}
                        {c.cancel_reason && <span className="text-red-500">السبب: {c.cancel_reason}</span>}
                        {c.notes && <span className="text-amber-600">📝 {c.notes}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard icon={<FiUser />} title="الأطراف">
            <Row k="الزبون" v={o.customer_name || 'زبون'} />
            <Row k="هاتف الزبون" v={tel(o.customer_phone)} />
            <Row k="السائق" v={assigned ? o.driver_name : cancelled ? '—' : o.driver_name ? 'بانتظار قبول سائق' : 'لم يُعيَّن بعد'} tone={assigned ? undefined : 'text-amber-600'} />
            {assigned && <Row k="هاتف السائق" v={tel(o.driver_phone)} />}
            {assigned && o.vehicle_type && <Row k="المركبة" v={`${o.vehicle_type}${o.vehicle_plate ? ` · ${o.vehicle_plate}` : ''}`} />}
            {o.driver_assigned_at && <Row k="قبل السائق" v={<span className="num">{fmtDateTime(o.driver_assigned_at)}</span>} />}
          </SectionCard>

          {(o.delivery_address || o.distance_km || o.notes) && (
            <SectionCard icon={<FiMapPin />} title="التوصيل">
              <Row k="عنوان التسليم" v={o.delivery_address} />
              {o.distance_km ? <Row k="أبعد مطعم ← الزبون" v={<span className="num">{num(o.distance_km).toFixed(1)} كم</span>} /> : null}
              {stopsOrder.length > 0 && <Row k="ترتيب الاستلام" v={stopsOrder.map(s => s.name).filter(Boolean).join(' ← ')} />}
              <Row k="ملاحظات" v={o.notes} />
            </SectionCard>
          )}

          <SectionCard icon={<FiFileText />} title="الحساب">
            <Row k="مجموع الأصناف" v={<span className="num">{money(o.subtotal)}</span>} />
            <Row k="رسوم التوصيل" v={o.free_delivery || (num(o.delivery_fee) === 0 && num(o.base_fee) > 0)
              ? <span className="text-green-600">مجاني <span className="text-ink-4 line-through num text-xs">{money(o.base_fee)}</span></span>
              : <span className="num">{money(o.delivery_fee)}</span>} />
            <Row k={`${TERMS.extraStopFee}${num(o.extra_stop_unit) > 0 ? ` (${money(o.extra_stop_unit)} × ${Math.max(0, stopsCount - 1)})` : ''}`} v={<span className="num">{money(o.extra_stops_fee)}</span>} />
            {num(o.coupon_discount) > 0 && <Row k={`كوبون${o.coupon_code ? ` ${o.coupon_code}` : ''}`} v={<span className="text-green-600 num">−{money(o.coupon_discount)}</span>} />}
            {num(o.first_order_discount) > 0 && <Row k="خصم الطلب الأول" v={<span className="text-green-600 num">−{money(o.first_order_discount)}</span>} />}
            {/* إجمالي الخصم فقط عندما يجمع أكثر من مصدر (أو لا تفصيل له) — لتجنّب تكرار نفس السطر */}
            {num(o.discount) > 0 && (num(o.coupon_discount) > 0) === (num(o.first_order_discount) > 0) && <Row k={num(o.coupon_discount) > 0 ? 'إجمالي الخصم' : 'الخصم'} v={<span className="text-green-600 num">−{money(o.discount)}</span>} />}
            {num(o.points_value) > 0 && <Row k={`نقاط مستبدلة${o.points_redeemed ? ` (${arCount(o.points_redeemed, 'point')})` : ''}`} v={<span className="text-green-600 num">−{money(o.points_value)}</span>} />}
            <Row k={TERMS.tip} v={<span className="num">{money(o.tip)}</span>} />
            {num(o.wallet_used) > 0 && <Row k={`من ${TERMS.wallet}`} v={<span className="text-green-600 num">−{money(o.wallet_used)}</span>} />}
            <div className="flex justify-between items-center my-2 rounded-xl bg-ink text-white px-4 py-3">
              <span className="font-bold text-sm text-white/80">الإجمالي</span>
              <span className="font-black text-lg num">{money(o.total)}</span>
            </div>
            <Row k="الدفع" v={`${paymentLabel(o.payment_method)}${o.payment_status ? ` · ${o.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}` : ''}`} />
            {num(o.cash_to_collect) > 0 && <Row k="يحصّله السائق كاش" v={<span className="num">{money(o.cash_to_collect)}</span>} />}
            <div className="grid grid-cols-2 gap-2 my-2">
              <div className="rounded-xl bg-teal-50 px-3 py-2.5">
                <p className="text-[10.5px] font-bold text-teal-700">أجرة السائق</p>
                <p className="font-black text-ink num">{money(o.driver_fee)}</p>
                <p className="text-[10px] text-ink-3 font-medium">الأساسية + رسوم المطاعم الإضافية</p>
              </div>
              <div className="rounded-xl bg-green-50 px-3 py-2.5">
                <p className="text-[10.5px] font-bold text-green-700">ربح السائق</p>
                <p className="font-black text-ink num">{money(o.driver_earning ?? num(o.driver_fee) + num(o.tip))}</p>
                <p className="text-[10px] text-ink-3 font-medium">الأجرة + {TERMS.tip}</p>
              </div>
            </div>
            {(num(o.loyalty_points_earned) > 0 || num(o.cashback_given) > 0) && (
              <Row k="مكافآت الزبون" v={[num(o.loyalty_points_earned) > 0 && arCount(o.loyalty_points_earned, 'point'), num(o.cashback_given) > 0 && `كاش باك ${money(o.cashback_given)}`].filter(Boolean).join(' · ')} />
            )}
          </SectionCard>

          {timeline.length > 0 && (
            <SectionCard icon={<FiClock />} title="المسار الزمني" action={<button onClick={load} aria-label="تحديث" className="w-7 h-7 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-sunken flex items-center justify-center"><FiRefreshCw className={loading ? 'animate-spin' : ''} /></button>}>
              <ol className="relative mr-3 py-3 space-y-4">
                <span className="absolute right-0 top-4 bottom-4 w-[2px] bg-gradient-to-b from-teal-300 to-teal-100 rounded-full" aria-hidden="true" />
                {timeline.map(([k, t, kind], i) => (
                  <li key={`${k}-${i}`} className="pr-6 relative">
                    <span className={`absolute -right-[6px] top-1 w-3.5 h-3.5 rounded-full ring-4 ring-white ${kind === 'cancel' ? 'bg-red-500' : i === timeline.length - 1 ? 'grad-sunset' : 'bg-teal-400'}`} />
                    <p className="text-sm font-bold text-ink">{k}</p>
                    <p className="text-[11px] text-ink-3 num mt-0.5">{fmtDateTime(t)}</p>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
          {o.driver_id && <p className="text-[11px] text-ink-4 text-center flex items-center justify-center gap-1"><FiTruck /> المجمّع يُحسب كتوصيلة واحدة للسائق.</p>}
        </div>
      ) : null}
    </Modal>
  );
}
