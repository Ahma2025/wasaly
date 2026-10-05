import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FiHome, FiTrendingUp, FiTrendingDown, FiShoppingBag, FiCheckCircle, FiBarChart2, FiAward, FiPieChart, FiCalendar } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import PageSkeleton from '../components/Skeleton';
import { PageHeader, ErrorState, EmptyState } from '../components/ui';
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

  if (loading) return <div className="p-4"><PageSkeleton cards={4} rows={5} /></div>;
  if (error && !stats) return <div className="p-4"><ErrorState text="تعذّر تحميل الإحصائيات" onRetry={() => load()} /></div>;

  const topItems = stats?.topItems || [];
  const maxSold = Math.max(1, ...topItems.map(t => parseInt(t.sold) || 0));
  const chartData = view === 'week' ? d.last7 : d.days;
  const hasSales = d.total30 > 0;
  const feeNote = !d.feesExcluded || !d.todayFeesExcluded;

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <PageHeader title="الرئيسية" icon={FiHome} subtitle={new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}
        onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}>
        <span className={`chip py-1 px-2.5 ${restaurant.is_open ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${restaurant.is_open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          {restaurant.is_open ? 'مفتوح' : 'مغلق'}
        </span>
      </PageHeader>

      {/* اليوم */}
      <div className="grad-sunset rounded-3xl p-5 text-white shadow-brand relative overflow-hidden sheen">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-xl" />
        <p className="text-white/85 text-xs font-bold mb-1 flex items-center gap-1.5"><FiCalendar size={13} /> مبيعات اليوم</p>
        <p className="text-4xl font-black tracking-tight">{d.todayFood.toFixed(2)}<span className="text-2xl">₪</span></p>
        <p className="text-white/85 text-sm mt-1">{parseInt(stats?.today_orders || 0)} طلب اليوم <span className="text-white/60 text-xs">(كل الطلبات غير الملغاة)</span></p>
      </div>

      {/* الأسبوع مقابل الأسبوع السابق */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title"><FiBarChart2 className="text-brand-500" /> آخر 7 أيام</h2>
          {d.weekGrowth !== null && (
            <span className={`chip py-1 px-2 ${d.weekGrowth >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
              {d.weekGrowth >= 0 ? <FiTrendingUp size={12} /> : <FiTrendingDown size={12} />} {Math.abs(d.weekGrowth)}% عن الأسبوع السابق
            </span>
          )}
        </div>
        <div className="flex gap-6 mb-2">
          <div><p className="text-xs text-gray-400">هذا الأسبوع</p><p className="font-black text-brand-600 text-lg">{d.last7Revenue.toFixed(2)}₪</p></div>
          <div><p className="text-xs text-gray-400">الأسبوع السابق</p><p className="font-black text-gray-500 text-lg">{d.prev7Revenue.toFixed(2)}₪</p></div>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={d.last7} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} reversed />
            <Tooltip cursor={{ fill: '#FFF4EB' }} formatter={v => [`${num(v).toFixed(2)}₪`, 'المبيعات']} labelFormatter={l => `يوم ${l}`} />
            <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
              {d.last7.map((x, i) => <Cell key={x.date} fill={i === d.last7.length - 1 ? '#FF6B00' : '#FFCBA3'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* شبكة الأرقام — آخر 30 يوم */}
      <div className="grid grid-cols-2 gap-3 stagger">
        <StatTile icon={FiTrendingUp} label="مبيعات آخر 30 يوم" value={`${d.total30.toFixed(2)}₪`} />
        <StatTile icon={FiShoppingBag} label="طلبات مُسلّمة (30 يوم)" value={d.orders30} />
        <StatTile icon={FiBarChart2} label="متوسط الطلب (30 يوم)" value={`${d.avgOrder.toFixed(2)}₪`} />
        <StatTile icon={FiCheckCircle} label="إجمالي المُسلّم (كل الأوقات)" value={d.delivered} tone="emerald" />
      </div>

      {/* منحنى المبيعات */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title"><FiTrendingUp className="text-brand-500" /> المبيعات اليومية</h2>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl" role="tablist">
            {[['week', '7 أيام'], ['month', '30 يوم']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold ${view === k ? 'bg-white text-brand-600 shadow-soft' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
        </div>
        {hasSales ? (
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={chartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F2F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} reversed interval={view === 'week' ? 0 : 4} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={shortMoney} orientation="right" />
              <Tooltip formatter={v => [`${num(v).toFixed(2)}₪`, 'المبيعات']} labelFormatter={l => `يوم ${l}`} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B00" fill="url(#rev)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={FiBarChart2} title="لا توجد مبيعات بعد" text="ستظهر المبيعات هنا بعد أول طلب مُسلّم" />
        )}
      </div>

      {topItems.length > 0 && (
        <div className="card p-4">
          <h2 className="section-title mb-3"><FiAward className="text-brand-500" /> الأكثر مبيعاً <span className="text-xs font-semibold text-gray-400">(كل الأوقات)</span></h2>
          <div className="space-y-3">
            {topItems.map((item, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0
                    ${i === 0 ? 'bg-amber-400 text-amber-950' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-brand-200 text-brand-800' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-800 font-bold truncate">{item.name_ar}</span>
                  <span className="text-sm font-black text-brand-600">{item.sold} مباع</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full grad-brand" style={{ width: `${Math.min(100, (parseInt(item.sold) / maxSold) * 100)}%`, opacity: 1 - i * 0.13 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.byStatus.length > 0 && (
        <div className="card p-4">
          <h2 className="section-title mb-3"><FiPieChart className="text-brand-500" /> حالات الطلبات <span className="text-xs font-semibold text-gray-400">(كل الأوقات)</span></h2>
          <div className="space-y-2.5">
            {d.byStatus.map((s) => {
              const pct = d.totalAll > 0 ? Math.round((parseInt(s.count) / d.totalAll) * 100) : 0;
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-600 w-24 flex-shrink-0 flex items-center gap-1.5">
                    <i className="w-2 h-2 rounded-full" style={{ background: STATUS_ACCENT[s.status] || '#CBD5E1' }} />
                    {STATUS_LABELS[s.status] || s.status}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: STATUS_ACCENT[s.status] || '#CBD5E1' }} />
                  </div>
                  <span className="text-xs font-black text-gray-700 w-10 text-left">{s.count}</span>
                </div>
              );
            })}
          </div>
          {d.cancelled > 0 && d.totalAll > 0 && (
            <p className="text-xs text-rose-500 mt-3 font-semibold">{d.cancelled} طلب ملغي ({Math.round(d.cancelled / d.totalAll * 100)}%) — راجع أسباب الإلغاء</p>
          )}
        </div>
      )}

      {feeNote && (
        <p className="text-[11px] text-gray-400 text-center px-4">* بعض المبالغ قد تشمل رسوم التوصيل لأن الخادم لا يرسل المجموع الفرعي بعد. التواريخ حسب توقيت الخادم.</p>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone = 'brand' }) {
  const toneCls = tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600';
  return (
    <div className="card p-4 hover-lift">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${toneCls}`}><Icon size={17} aria-hidden /></div>
      <p className="text-gray-400 text-[11px] font-bold leading-tight">{label}</p>
      <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
    </div>
  );
}
