import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import { FiUsers, FiShoppingBag, FiTruck, FiPackage, FiClock, FiPlus, FiBell, FiMap, FiArrowLeft, FiBarChart2, FiActivity } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import PageSkeleton from '../components/Skeleton';
import { statusMeta, fmtToday, num, fmtDate, lastDays, hebronHour } from '../utils/format';
import { arCount } from '../utils/plural';
import { AnimatedNumber, KpiTile, SectionHeader, EmptyState, ErrorState, ChartTooltip, useVisiblePolling } from '../components/ui';

// «مساء النور» ردّ على التحية لا تحية — A-42
const hello = () => { const h = hebronHour(); return h < 12 ? 'صباح الخير' : 'مساء الخير'; };
const POLL_MS = 45000;

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(readCache('adm_dashboard') || null);
  const [loading, setLoading] = useState(!readCache('adm_dashboard'));
  const [stale, setStale] = useState(false);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(l => l || !data);
    return api.get('/admin/dashboard')
      .then(r => { setData(r.data); writeCache('adm_dashboard', r.data); setStale(false); })
      .catch(e => { setStale(true); if (!silent && e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل البيانات', { id: 'dash' }); })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  // «مباشر» حقيقي: تحديث صامت كل 45 ثانية أثناء ظهور الصفحة — A-36
  useVisiblePolling(() => load(true), POLL_MS);

  if (loading) return <div className="page"><PageSkeleton cards={4} rows={6} /></div>;
  if (!data) return <div className="page"><ErrorState onRetry={() => load()} /></div>;

  // picked_up و on_the_way نفس التسمية → صف واحد
  const statusRows = Object.values((data?.ordersByStatus || []).reduce((acc, s) => {
    const k = s.status === 'picked_up' ? 'on_the_way' : s.status;
    acc[k] = { status: k, count: (acc[k]?.count || 0) + (Number(s.count) || 0) };
    return acc;
  }, {}));
  const statusTotal = statusRows.reduce((a, s) => a + (Number(s.count) || 0), 0);
  const maxStatus = Math.max(1, ...statusRows.map(s => Number(s.count) || 0));
  // آخر 7 أيام بتوقيت فلسطين مع أصفار للأيام بلا مبيعات، والمتوسط ÷ 7 — A-19
  const byDay = Object.fromEntries((data?.weeklyRevenue || []).map(w => [String(w.date).slice(0, 10), w]));
  const weekly = lastDays(7).map(d => ({ date: d, revenue: num(byDay[d]?.revenue), orders: parseInt(byDay[d]?.orders) || 0 }));
  const weekTotal = weekly.reduce((a, w) => a + w.revenue, 0);
  const weekAvg = weekTotal / 7;
  const hasWeek = weekTotal > 0;

  return (
    <div className="page">
      <div className="flex items-end justify-between gap-3 lg:hidden">
        <div>
          <p className="text-xs text-ink-3 font-bold">{fmtToday()}</p>
          <h1 className="text-[22px] font-black text-ink mt-0.5">{hello()} 👋</h1>
        </div>
      </div>

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
        {/* Hero revenue */}
        <section className="lg:col-span-2 relative mesh-sunset noise rounded-[28px] p-5 sm:p-7 text-white overflow-hidden shadow-brand">
          <div className="absolute -left-16 -bottom-20 w-64 h-64 rounded-full bg-white/10 blur-sm" />
          <div className="absolute left-24 -top-16 w-40 h-40 rounded-full bg-white/10" />
          <div className="relative flex flex-col sm:flex-row sm:items-end gap-5">
            <div className="flex-1 min-w-0">
              <p className="hidden lg:block text-white/80 text-xs font-bold mb-3">{hello()} · {fmtToday()}</p>
              <p className="text-white/90 text-sm font-bold flex items-center gap-2">إجمالي مدفوعات اليوم {stale
                ? <span className="glass rounded-full px-2 py-0.5 text-[10px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white/60" /> غير محدّث</span>
                : <span className="glass rounded-full px-2 py-0.5 text-[10px] flex items-center gap-1" title="يتحدّث كل 45 ثانية"><span className="live-dot !bg-white" /> مباشر</span>}</p>
              <p className="text-[44px] sm:text-[56px] leading-none font-black mt-2 tracking-tight">
                <AnimatedNumber value={num(data?.revenueToday)} decimals={2} duration={1200} /><span className="text-2xl sm:text-3xl font-extrabold mr-1 opacity-90">₪</span>
              </p>
              <p className="text-white/70 text-[11px] font-medium mt-2 leading-relaxed max-w-md">طلبات مُسلّمة اليوم · يشمل رسوم التوصيل وإكرامية السائق — ليس عمولة المنصّة (راجع المحاسبة)</p>
              <div className="flex gap-2 mt-4 flex-wrap">
                <button onClick={() => navigate('/orders')} className="glass rounded-full px-3.5 py-1.5 text-xs font-extrabold flex items-center gap-1.5 hover:bg-white/25">
                  <FiPackage /> {arCount(data?.ordersToday ?? 0, 'order', { zero: 'لا طلبات' })} اليوم
                </button>
                {data?.pendingOrders > 0 && (
                  <button onClick={() => navigate('/orders?status=pending')} className="bg-white text-brand-700 rounded-full px-3.5 py-1.5 text-xs font-extrabold flex items-center gap-1.5 shadow-lg">
                    <FiClock /> <span className="num">{data.pendingOrders}</span> بالانتظار
                  </button>
                )}
              </div>
            </div>
            {hasWeek && (
              <div className="sm:w-[46%] h-[110px] sm:h-[130px] -mx-2 sm:mx-0" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekly} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <Area type="monotone" dataKey="revenue" stroke="#fff" strokeWidth={2.5} fill="url(#heroFill)" dot={false} animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          {hasWeek && (
            <div className="relative grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/20">
              <div><p className="text-white/70 text-[11px] font-bold">مدفوعات 7 أيام</p><p className="text-lg font-black"><AnimatedNumber value={weekTotal} decimals={0} /> ₪</p></div>
              <div><p className="text-white/70 text-[11px] font-bold">المتوسط اليومي (÷ 7)</p><p className="text-lg font-black"><AnimatedNumber value={weekAvg} decimals={0} /> ₪</p></div>
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section className="card p-5 flex flex-col">
          <SectionHeader title="إجراءات سريعة" hint="أكثر المهام استخداماً" />
          <div className="grid grid-cols-2 gap-2.5 mt-4 flex-1">
            {[
              { icon: <FiMap />, label: 'العمليات الحية', to: '/live', tint: '#FF6B00' },
              { icon: <FiPlus />, label: 'متجر جديد', to: '/restaurants?new=1', tint: '#16A34A' },
              { icon: <FiTruck />, label: 'سائق جديد', to: '/drivers?new=1', tint: '#8B5CF6' },
              { icon: <FiBell />, label: 'إرسال إشعار', to: '/notifications', tint: '#E11D48' },
            ].map(a => (
              <button key={a.to} onClick={() => navigate(a.to)}
                className="group rounded-2xl border border-surface-line p-3.5 text-right hover:border-transparent hover:shadow-card bg-white flex flex-col justify-between min-h-[96px]">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-transform duration-300 ease-spring group-hover:scale-110 group-hover:-rotate-6" style={{ background: `${a.tint}14`, color: a.tint }}>{a.icon}</span>
                <span className="flex items-center justify-between gap-1 mt-3">
                  <span className="text-[13px] font-extrabold text-ink">{a.label}</span>
                  <FiArrowLeft className="text-ink-4 group-hover:text-ink-2 transition-all group-hover:-translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 stagger">
        <KpiTile icon={<FiUsers />} label="الزبائن النشطون" value={data?.totalUsers} tint="#2E90FA" onClick={() => navigate('/users')} />
        <KpiTile icon={<FiShoppingBag />} label="المتاجر النشطة" value={data?.totalRestaurants} tint="#16A34A" onClick={() => navigate('/restaurants')} />
        <KpiTile icon={<FiTruck />} label="سائقون متصلون" value={data?.activeDrivers} tint="#8B5CF6" onClick={() => navigate('/live')} />
        <KpiTile icon={<FiPackage />} label="طلبات اليوم" value={data?.ordersToday} tint="#FF6B00" onClick={() => navigate('/orders')}
          hint={data?.pendingOrders > 0 ? `${arCount(data.pendingOrders, 'order')} بانتظار المطعم` : undefined} />
      </div>

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
        {/* Weekly chart */}
        {hasWeek ? (
          <section className="card p-4 sm:p-5 lg:col-span-2">
            <SectionHeader title="مدفوعات آخر 7 أيام" hint="₪ · الطلبات المسلّمة فقط"
              action={<span className="text-[11px] font-extrabold text-ink-3 bg-surface-sunken rounded-full px-2.5 py-1 num">{weekTotal.toFixed(0)} ₪</span>} />
            <div className="h-[220px] sm:h-[260px] mt-4 -mx-2" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly} margin={{ top: 8, right: 12, left: 14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#F53B57" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#FF8A00" /><stop offset="100%" stopColor="#F53B57" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#EEF0F5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8A8FA3', fontWeight: 700 }} tickFormatter={d => fmtDate(d, { weekday: 'short' })} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tick={{ fontSize: 11, fill: '#8A8FA3' }} axisLine={false} tickLine={false} width={44} orientation="right" />
                  <Tooltip cursor={{ stroke: '#FFC999', strokeDasharray: '4 4' }}
                    content={<ChartTooltip name="المدفوع" fmt={v => `${num(v).toFixed(2)} ₪`} labelFmt={d => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })} />} />
                  <Area type="monotone" dataKey="revenue" stroke="url(#revStroke)" fill="url(#rev)" strokeWidth={3}
                    dot={{ r: 3.5, fill: '#fff', stroke: '#FF6B00', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#FF6B00', stroke: '#fff', strokeWidth: 3 }} animationDuration={1100} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : (
          <div className="lg:col-span-2"><EmptyState icon={<FiBarChart2 />} title="لا توجد بيانات مدفوعات بعد" hint="سيظهر الرسم البياني بعد أول طلب مُسلّم" compact /></div>
        )}

        {/* Orders by status */}
        <section className="card p-4 sm:p-5">
          <SectionHeader title="الطلبات حسب الحالة" hint="آخر 30 يوم"
            action={statusTotal > 0 && <span className="text-[11px] font-extrabold text-ink-3 bg-surface-sunken rounded-full px-2.5 py-1 num">{statusTotal}</span>} />
          {statusRows.length === 0 ? (
            <div className="text-center py-10 animate-fade-up">
              <div className="w-14 h-14 mx-auto mb-3 rounded-[18px] bg-gradient-to-br from-[#FFF3EA] to-white ring-1 ring-orange-100 flex items-center justify-center text-2xl text-brand-500 shadow-soft"><FiActivity /></div>
              <p className="text-sm font-black text-ink">لا توجد طلبات في آخر 30 يوم</p>
              <p className="text-[12px] text-ink-3 font-medium mt-1">سيظهر توزيع الحالات هنا مع أول طلب</p>
            </div>
          ) : (
            <>
              {/* شريط مكدّس */}
              <div className="flex h-2.5 rounded-full overflow-hidden mt-4 bg-surface-sunken gap-[2px]">
                {statusRows.map(s => (
                  <span key={s.status} className="h-full grow-x" title={statusMeta(s.status).label}
                    style={{ width: `${((Number(s.count) || 0) / Math.max(1, statusTotal)) * 100}%`, background: statusMeta(s.status).color }} />
                ))}
              </div>
              <div className="space-y-3.5 mt-5">
                {statusRows.map((s, i) => {
                  const meta = statusMeta(s.status);
                  const pct = Math.round(((Number(s.count) || 0) / maxStatus) * 100);
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] text-ink-2 font-bold flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                        <span className="font-black text-ink num text-sm">{s.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                        <div className="h-full rounded-full grow-x" style={{ width: `${pct}%`, background: meta.color, animationDelay: `${i * 60}ms` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
