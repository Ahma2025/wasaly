import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FiHome, FiTrendingUp, FiShoppingBag, FiCheckCircle, FiBarChart2, FiAward, FiPieChart, FiCalendar, FiAlertCircle, FiActivity } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import PageSkeleton from '../components/Skeleton';
import { PageHeader, ErrorState, EmptyState, KpiTile, CountUp, Trend, Tabs, CardHeader, prefersReducedMotion, cx } from '../components/ui';
import { useRestaurant } from '../context/RestaurantContext';
import { useLiveOrders } from '../context/LiveOrdersContext';
import { STATUS_LABELS, STATUS_ACCENT, num, dayKey } from '../utils/format';

const hasAny = (o, keys) => o && keys.some(k => o[k] != null);
const FEE_KEYS = ['subtotal', 'food_revenue', 'delivery_fees', 'delivery_fee'];

// مبيعات الطعام = المجموع الفرعي (بدون رسوم التوصيل التي تذهب للسائق)
function foodRevenue(row) {
  if (!row) return 0;
  if (row.subtotal != null) return num(row.subtotal);
  if (row.food_revenue != null) return num(row.food_revenue);
  return Math.max(0, num(row.revenue) - num(row.delivery_fees ?? row.delivery_fee));
}

const shortMoney = (v) => {
  const n = num(v);
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k₪` : `${Math.round(n)}₪`;
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="bg-ink text-white rounded-xl px-3 py-2 shadow-lift text-right" dir="rtl">
      <p className="text-[11px] text-white/60 font-bold">يوم {label}</p>
      <p className="font-extrabold tnum">{num(payload[0].value).toFixed(2)}₪</p>
      {p.count != null && <p className="text-[11px] text-white/70 tnum">{p.count} طلب</p>}
    </div>
  );
}

export default function Dashboard() {
  const { restaurant } = useRestaurant();
  const { tick } = useLiveOrders();
  const cacheKey = 'rest_stats_' + restaurant.id;
  const cachedStats = readCache(cacheKey);
  const [stats, setStats] = useState(cachedStats || null);
  const [loading, setLoading] = useState(!cachedStats);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('week');
  const animate = !prefersReducedMotion();

  const load = useCallback(async (silent = false) => {
    if (!restaurant.id) { setLoading(false); return; }
    try {
      const r = await api.get(`/restaurants/${restaurant.id}/stats`);
      setStats(r.data); writeCache(cacheKey, r.data); setError(false);
    } catch (e) {
      if (!readCache(cacheKey)) setError(true);
      else if (!silent) toast.error(e.message || 'فشل تحديث الإحصائيات');
    } finally { setLoading(false); setRefreshing(false); }
  }, [restaurant.id, cacheKey]);

  useEffect(() => { load(); }, [load]);
  // تحديث خفيف كل عدة أحداث/دقائق (tick يتغير مع الطلبات والتحديث الدوري)
  useEffect(() => { if (tick && tick % 3 === 0) load(true); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = useMemo(() => {
    const sales = stats?.sales || [];
    const byDate = new Map(sales.map(s => [String(s.date).slice(0, 10), s]));
    // سلسلة أيام تقويمية كاملة (آخر 30 يوم) — الأيام بدون طلبات = صفر
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(); dt.setHours(12, 0, 0, 0); dt.setDate(dt.getDate() - i);
      const row = byDate.get(dayKey(dt));
      days.push({ date: dayKey(dt), label: `${dt.getDate()}/${dt.getMonth() + 1}`, revenue: +foodRevenue(row).toFixed(2), count: row ? parseInt(row.count) || 0 : 0 });
    }
    const last7 = days.slice(-7);
    const prev7 = days.slice(-14, -7);
    const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
    const last7Revenue = sum(last7, 'revenue');
    const prev7Revenue = sum(prev7, 'revenue');
    const total30 = sum(days, 'revenue');
    const orders30 = sum(days, 'count');
    const feesExcluded = sales.length === 0 || sales.some(s => hasAny(s, FEE_KEYS));
    const todayFood = stats?.today_subtotal != null ? num(stats.today_subtotal)
      : Math.max(0, num(stats?.today_revenue) - num(stats?.today_delivery_fees));
    const todayFeesExcluded = stats?.today_subtotal != null || stats?.today_delivery_fees != null;
    const byStatus = stats?.ordersByStatus || [];
    const totalAll = byStatus.reduce((s, x) => s + (parseInt(x.count) || 0), 0);
    return {
      days, last7, prev7, last7Revenue, prev7Revenue, total30, orders30, feesExcluded, todayFood, todayFeesExcluded,
      weekGrowth: prev7Revenue > 0 ? Math.round((last7Revenue - prev7Revenue) / prev7Revenue * 100) : null,
      avgOrder: orders30 > 0 ? total30 / orders30 : 0,
      delivered: parseInt(byStatus.find(s => s.status === 'delivered')?.count || 0),
      cancelled: parseInt(byStatus.find(s => s.status === 'cancelled')?.count || 0),
      byStatus, totalAll,
    };
  }, [stats]);

  if (loading) return <PageSkeleton cards={4} rows={5} />;
  if (error && !stats) return <ErrorState text="تعذّر تحميل الإحصائيات" onRetry={() => load()} />;

  const topItems = stats?.topItems || [];
  const maxSold = Math.max(1, ...topItems.map(t => parseInt(t.sold) || 0));
  const chartData = view === 'week' ? d.last7 : d.days;
  const hasSales = d.total30 > 0;
  const feeNote = !d.feesExcluded || !d.todayFeesExcluded;
  const todayOrders = parseInt(stats?.today_orders || 0);

  return (
    <div className="space-y-4 lg:space-y-5" dir="rtl">
      <PageHeader title="الرئيسية" icon={FiHome} subtitle={new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}
        onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing} />

      <div className="grid gap-3 lg:gap-4 lg:grid-cols-12">
        {/* ─── اليوم ─── */}
        <section className="lg:col-span-5 grad-mesh rounded-[24px] p-5 lg:p-6 text-white shadow-brand sheen animate-pop">
          <div className="absolute -bottom-16 -left-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="relative z-[1] flex items-start justify-between gap-3">
            <div>
              <p className="text-white/85 text-[12.5px] font-bold flex items-center gap-1.5"><FiCalendar size={13} aria-hidden /> مبيعات اليوم</p>
              <p className="text-[40px] lg:text-[46px] font-black leading-none mt-2 tnum">
                <CountUp value={d.todayFood} decimals={2} /><span className="text-2xl font-extrabold ms-1">₪</span>
              </p>
            </div>
            <span className="glass rounded-[16px] px-3 py-2 text-center flex-shrink-0">
              <span className="block text-[22px] font-black leading-none tnum"><CountUp value={todayOrders} /></span>
              <span className="block text-[10.5px] text-white/85 font-bold mt-1">طلب اليوم</span>
            </span>
          </div>
          {/* منحنى صغير لآخر 7 أيام */}
          <div className="relative z-[1] mt-4 -mx-1 h-[64px]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.last7} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" hide reversed />
                <YAxis hide domain={[(min) => Math.max(0, min * 0.75), (max) => max * 1.05 || 1]} />
                <Area type="monotone" dataKey="revenue" stroke="#fff" strokeWidth={2.2} fill="url(#spark)" dot={false} isAnimationActive={animate} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="relative z-[1] text-white/75 text-[11px] font-bold mt-1 flex items-center justify-between">
            <span>كل الطلبات غير الملغاة</span>
            <span>آخر 7 أيام</span>
          </p>
        </section>

        {/* ─── مؤشرات ─── */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-3 lg:gap-4 stagger">
          <KpiTile icon={FiActivity} label="مبيعات آخر 7 أيام" value={d.last7Revenue} decimals={2} suffix="₪" trend={d.weekGrowth} hint={d.weekGrowth != null ? 'مقارنة بالأسبوع السابق' : undefined} />
          <KpiTile icon={FiTrendingUp} label="مبيعات آخر 30 يوم" value={d.total30} decimals={2} suffix="₪" tone="violet" />
          <KpiTile icon={FiShoppingBag} label="طلبات مُسلّمة (30 يوم)" value={d.orders30} tone="sky" />
          <KpiTile icon={FiBarChart2} label="متوسط الطلب (30 يوم)" value={d.avgOrder} decimals={2} suffix="₪" tone="amber" />
        </div>
      </div>

      <div className="grid gap-3 lg:gap-4 lg:grid-cols-12">
        {/* ─── منحنى المبيعات ─── */}
        <section className="card p-4 lg:p-5 lg:col-span-8">
          <CardHeader icon={FiTrendingUp} title="المبيعات اليومية" hint="مبيعات الطعام بدون رسوم التوصيل"
            action={<Tabs size="sm" value={view} onChange={setView} ariaLabel="فترة المخطط" className="!shadow-none !bg-surface !border-0"
              tabs={[{ key: 'week', label: '7 أيام' }, { key: 'month', label: '30 يوم' }]} />} />
          {hasSales ? (
            <div className="h-[200px] lg:h-[240px] -ms-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#F53B57" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#F53B57" />
                      <stop offset="100%" stopColor="#FF8A00" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#ECEEF4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#8A8FA3' }} axisLine={false} tickLine={false} reversed interval={view === 'week' ? 0 : 4} />
                  <YAxis tick={{ fontSize: 10.5, fill: '#8A8FA3' }} axisLine={false} tickLine={false} tickFormatter={shortMoney} orientation="right" width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#FFCBA3', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="revenue" stroke="url(#revStroke)" fill="url(#revFill)" strokeWidth={3} dot={false}
                    activeDot={{ r: 6, fill: '#FF6B00', stroke: '#fff', strokeWidth: 3 }} isAnimationActive={animate} animationDuration={900} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState compact icon={FiBarChart2} title="لا توجد مبيعات بعد" text="ستظهر المبيعات هنا بعد أول طلب مُسلّم" />
          )}
        </section>

        {/* ─── الأسبوع مقابل السابق ─── */}
        <section className="card p-4 lg:p-5 lg:col-span-4 flex flex-col">
          <CardHeader icon={FiBarChart2} title="آخر 7 أيام" action={d.weekGrowth !== null ? <Trend value={d.weekGrowth} /> : null} />
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[14px] bg-brand-50 p-3">
              <p className="text-[11px] font-bold text-brand-700/80">هذا الأسبوع</p>
              <p className="font-extrabold text-brand-700 text-lg tnum mt-0.5"><CountUp value={d.last7Revenue} decimals={2} />₪</p>
            </div>
            <div className="rounded-[14px] bg-surface p-3">
              <p className="text-[11px] font-bold text-ink-3">الأسبوع السابق</p>
              <p className="font-extrabold text-ink-2 text-lg tnum mt-0.5">{d.prev7Revenue.toFixed(2)}₪</p>
            </div>
          </div>
          <div className="flex-1 min-h-[120px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.last7} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="barToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF8A00" />
                    <stop offset="100%" stopColor="#F53B57" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8A8FA3' }} axisLine={false} tickLine={false} reversed />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#FFF3EA', radius: 8 }} />
                <Bar dataKey="revenue" radius={[8, 8, 4, 4]} maxBarSize={28} isAnimationActive={animate}>
                  {d.last7.map((x, i) => <Cell key={x.date} fill={i === d.last7.length - 1 ? 'url(#barToday)' : '#FFE6D1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-3 lg:gap-4 lg:grid-cols-12">
        {/* ─── الأكثر مبيعًا ─── */}
        <section className="card p-4 lg:p-5 lg:col-span-7">
          <CardHeader icon={FiAward} title="الأكثر مبيعاً" hint="كل الأوقات" />
          {topItems.length === 0 ? (
            <EmptyState compact icon={FiAward} title="لا بيانات بعد" text="ستظهر أصنافك الأكثر طلبًا هنا" />
          ) : (
            <ol className="space-y-3.5">
              {topItems.map((item, i) => {
                const sold = parseInt(item.sold) || 0;
                return (
                  <li key={i} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 7) * 50}ms` }}>
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className={cx('w-7 h-7 rounded-[10px] flex items-center justify-center text-[12px] font-black flex-shrink-0 tnum',
                        i === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_6px_14px_rgba(245,158,11,.35)]'
                          : i === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700'
                            : i === 2 ? 'bg-gradient-to-br from-brand-200 to-brand-300 text-brand-800' : 'bg-surface text-ink-3')}>{i + 1}</span>
                      <span className="flex-1 text-[14px] text-ink font-bold truncate">{item.name_ar}</span>
                      <span className="text-[13px] font-extrabold text-ink tnum">{sold} <span className="text-ink-3 font-bold text-[11px]">مباع</span></span>
                    </div>
                    <div className="h-2 bg-surface rounded-full overflow-hidden">
                      <div className="h-full rounded-full grad-brand grow-x" style={{ width: `${Math.min(100, (sold / maxSold) * 100)}%`, opacity: Math.max(0.45, 1 - i * 0.1), animationDelay: `${Math.min(i, 7) * 60}ms` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ─── حالات الطلبات ─── */}
        <section className="card p-4 lg:p-5 lg:col-span-5">
          <CardHeader icon={FiPieChart} title="حالات الطلبات" hint="كل الأوقات"
            action={d.totalAll > 0 ? <span className="text-right"><span className="block text-xl font-black text-ink leading-none tnum"><CountUp value={d.totalAll} /></span><span className="text-[10.5px] font-bold text-ink-3">طلب</span></span> : null} />
          {d.byStatus.length === 0 ? (
            <EmptyState compact icon={FiPieChart} title="لا طلبات بعد" />
          ) : (
            <>
              {/* شريط مقسّم */}
              <div className="flex h-3 rounded-full overflow-hidden bg-surface gap-[2px]" role="img" aria-label="توزيع حالات الطلبات">
                {d.byStatus.map(s => {
                  const pct = d.totalAll > 0 ? (parseInt(s.count) / d.totalAll) * 100 : 0;
                  return pct > 0 ? <span key={s.status} className="h-full grow-x" style={{ width: `${pct}%`, background: STATUS_ACCENT[s.status] || '#CBD5E1' }} /> : null;
                })}
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 mt-4">
                {d.byStatus.map(s => {
                  const pct = d.totalAll > 0 ? Math.round((parseInt(s.count) / d.totalAll) * 100) : 0;
                  return (
                    <li key={s.status} className="flex items-center gap-2 rounded-[12px] bg-surface/70 px-2.5 py-2">
                      <i className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_ACCENT[s.status] || '#CBD5E1' }} aria-hidden />
                      <span className="flex-1 min-w-0 text-[12px] font-bold text-ink-2 truncate">{STATUS_LABELS[s.status] || s.status}</span>
                      <span className="text-[12px] font-extrabold text-ink tnum">{s.count}</span>
                      <span className="text-[10.5px] font-bold text-ink-3 tnum w-8 text-left">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-2 mt-3 text-[12px] font-bold text-emerald-700 bg-success-soft rounded-[12px] px-3 py-2">
                <FiCheckCircle aria-hidden /> <span className="tnum">{d.delivered}</span> طلب مُسلّم منذ البداية
              </div>
              {d.cancelled > 0 && d.totalAll > 0 && (
                <p className="text-[12px] text-danger mt-2 font-bold flex items-center gap-1.5"><FiAlertCircle aria-hidden /> {d.cancelled} طلب ملغي ({Math.round(d.cancelled / d.totalAll * 100)}%) — راجع أسباب الإلغاء</p>
              )}
            </>
          )}
        </section>
      </div>

      {feeNote && (
        <p className="text-[11px] text-ink-3 text-center px-4">* بعض المبالغ قد تشمل رسوم التوصيل لأن الخادم لا يرسل المجموع الفرعي بعد. التواريخ حسب توقيت الخادم.</p>
      )}
    </div>
  );
}
