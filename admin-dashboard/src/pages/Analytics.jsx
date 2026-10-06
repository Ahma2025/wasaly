import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from 'recharts';
import toast from 'react-hot-toast';
import { FiTrendingUp, FiAward, FiTruck, FiPackage, FiBarChart2 } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import PageSkeleton from '../components/Skeleton';
import { PageHeader, EmptyState, ErrorState, Badge, SectionHeader, ChartTooltip, KpiTile } from '../components/ui';
import { statusMeta, num, truthy, lastMonths, fmtMonth } from '../utils/format';
import { arUnit } from '../utils/plural';

const MEDAL = ['linear-gradient(135deg,#FFD66B,#F5A700)', 'linear-gradient(135deg,#E5E7EB,#9CA3AF)', 'linear-gradient(135deg,#FFB38A,#D9692F)'];

function Leaderboard({ rows: raw, valueKey, countKey, icon, title, sub }) {
  // الترتيب حسب المبلغ فعلاً (الخادم القديم يرتّب حسب العدد) — A-17
  const rows = [...raw].sort((a, b) => num(b[valueKey]) - num(a[valueKey]));
  const max = Math.max(1, ...rows.map(r => num(r[valueKey])));
  return (
    <section className="card p-4 sm:p-5">
      <SectionHeader title={<span className="flex items-center gap-2"><span className="w-8 h-8 rounded-xl bg-orange-50 text-brand-600 flex items-center justify-center">{icon}</span>{title}</span>} hint={sub} />
      <ol className="mt-4 space-y-1 stagger">
        {rows.map((r, i) => (
          <li key={r.id ?? i} className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-xl hover:bg-surface">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i < 3 ? 'text-white shadow-soft' : 'bg-surface-sunken text-ink-3'}`}
              style={i < 3 ? { background: MEDAL[i] } : undefined}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-ink truncate">{r.name_ar || r.name}
                  {r.is_active != null && !truthy(r.is_active) && <Badge className="bg-gray-100 text-gray-500 ring-gray-200 mr-1.5">مخفي</Badge>}
                </p>
                <p className="text-sm font-black text-ink num flex-shrink-0">{num(r[valueKey]).toFixed(0)}<span className="text-[11px] text-ink-3">₪</span></p>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                  <div className="h-full rounded-full grad-sunset grow-x" style={{ width: `${(num(r[valueKey]) / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
                </div>
                <span className="text-[10.5px] text-ink-3 font-bold num whitespace-nowrap">{num(r.orders)} {arUnit(r.orders, countKey)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Analytics() {
  const [data, setData] = useState(readCache('adm_analytics') || null);
  const [loading, setLoading] = useState(!readCache('adm_analytics'));
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    return api.get('/admin/analytics')
      .then(r => { setData(r.data); writeCache('adm_analytics', r.data); })
      .catch(e => {
        setFailed(true);
        if (e?.status !== 401 && e?.status !== 403 && data) toast.error('تعذّر تحديث التحليلات — المعروض آخر نسخة محفوظة', { id: 'an' });
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="page"><PageSkeleton cards={4} rows={5} /></div>;
  // فشل بلا نسخة محفوظة: خطأ واضح مع إعادة المحاولة (لا «لا توجد بيانات») — A-15
  if (failed && !data) return <div className="page"><PageHeader icon={<FiTrendingUp />} title="التحليلات" /><ErrorState title="تعذّر تحميل التحليلات" onRetry={() => { setLoading(true); load(); }} /></div>;

  // حالات متطابقة التسمية (picked_up = on_the_way) تُدمج في شريط واحد
  const statusAgg = {};
  (data?.ordersByStatus || []).forEach(s => {
    const k = s.status === 'picked_up' ? 'on_the_way' : s.status;
    statusAgg[k] = (statusAgg[k] || 0) + (Number(s.count) || 0);
  });
  const byStatus = Object.entries(statusAgg).map(([status, count]) => ({ status, count, label: statusMeta(status).label, color: statusMeta(status).color }));

  // 6 أشهر بالضبط (الأقدم أولاً) مع أصفار للأشهر الفارغة — A-18
  const byMonth = Object.fromEntries((data?.monthlyRevenue || []).map(m => [String(m.month).slice(0, 7), m]));
  const months = lastMonths(6);
  const monthly = months.map((k, i) => ({
    month: k, label: `${fmtMonth(k)}${i === months.length - 1 ? ' (حتى الآن)' : ''}`,
    revenue: num(byMonth[k]?.revenue), orders: parseInt(byMonth[k]?.orders) || 0,
  }));
  const hasMonthly = monthly.some(m => m.revenue > 0);
  const hasAny = hasMonthly || data?.topRestaurants?.length || data?.topDrivers?.length || byStatus.length;
  const totalOrders = byStatus.reduce((a, s) => a + s.count, 0);
  const delivered = statusAgg.delivered || 0;
  const cancelled = statusAgg.cancelled || 0;
  const sixMonth = monthly.reduce((a, m) => a + m.revenue, 0);
  // المقارنة بين آخر شهرين مكتملين (لا نقارن شهراً لم ينتهِ بشهر كامل)
  const last = monthly[4].revenue, prev = monthly[3].revenue;
  const mom = prev > 0 ? ((last - prev) / prev) * 100 : null;

  return (
    <div className="page">
      <PageHeader icon={<FiTrendingUp />} title="التحليلات" subtitle="أداء المنصّة على المدى الطويل" />

      {!hasAny && <EmptyState icon={<FiBarChart2 />} title="لا توجد بيانات تحليلية بعد" hint="ستظهر البيانات بعد اكتمال أول طلب" />}

      {hasAny ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 stagger">
          <KpiTile icon={<FiTrendingUp />} label="مدفوعات 6 أشهر" value={sixMonth} suffix=" ₪" tint="#FF6B00" trend={mom} spark={monthly.map(m => m.revenue)}
            hint={mom != null ? `الاتجاه: ${fmtMonth(monthly[4].month, { month: 'long' })} مقابل ${fmtMonth(monthly[3].month, { month: 'long' })}` : undefined} />
          <KpiTile icon={<FiPackage />} label="كل الطلبات" value={totalOrders} tint="#2E90FA" />
          <KpiTile icon={<FiAward />} label="نسبة التسليم" value={totalOrders ? (delivered / totalOrders) * 100 : 0} decimals={1} suffix="%" tint="#16A34A" />
          <KpiTile icon={<FiPackage />} label="نسبة الإلغاء" value={totalOrders ? (cancelled / totalOrders) * 100 : 0} decimals={1} suffix="%" tint="#F04438" />
        </div>
      ) : null}

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
        {hasMonthly && (
          <section className="card p-4 sm:p-5 lg:col-span-2">
            <SectionHeader title="المدفوعات الشهرية" hint="إجمالي ما دفعه الزبائن على الطلبات المسلّمة (آخر 6 أشهر — الشهر الحالي حتى اليوم)" />
            <div className="h-[240px] sm:h-[280px] mt-4 -mx-2" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 8, right: 12, left: 14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.3} /><stop offset="100%" stopColor="#F53B57" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#FF8A00" /><stop offset="100%" stopColor="#F53B57" /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#EEF0F5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A8FA3', fontWeight: 700 }} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tick={{ fontSize: 11, fill: '#8A8FA3' }} axisLine={false} tickLine={false} width={48} orientation="right" />
                  <Tooltip cursor={{ stroke: '#FFC999', strokeDasharray: '4 4' }} content={<ChartTooltip name="المدفوع" fmt={v => `${num(v).toFixed(2)}₪`} />} />
                  <Area type="monotone" dataKey="revenue" stroke="url(#mStroke)" strokeWidth={3} fill="url(#mFill)"
                    dot={{ r: 3.5, fill: '#fff', stroke: '#FF6B00', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#FF6B00', stroke: '#fff', strokeWidth: 3 }} animationDuration={1100} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {byStatus.length > 0 && (
          <section className={`card p-4 sm:p-5 ${hasMonthly ? '' : 'lg:col-span-3'}`}>
            <SectionHeader title="الطلبات حسب الحالة" hint="كل الأوقات" />
            <div className="mt-3" style={{ height: Math.max(180, byStatus.length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byStatus} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barCategoryGap={8}>
                  <defs>
                    {byStatus.map(s => (
                      <linearGradient key={s.status} id={`b-${s.status}`} x1="1" y1="0" x2="0" y2="0">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.95} /><stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis type="number" hide reversed allowDecimals={false} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11.5, fill: '#4E4B66', fontWeight: 700 }} width={92} axisLine={false} tickLine={false} orientation="right" />
                  <Tooltip cursor={{ fill: '#F6F7FB' }} content={<ChartTooltip name="طلب" fmt={v => v} />} />
                  <Bar dataKey="count" radius={[8, 0, 0, 8]} animationDuration={900} label={{ position: 'left', fontSize: 11, fontWeight: 800, fill: '#14142B' }}>
                    {byStatus.map(s => <Cell key={s.status} fill={`url(#b-${s.status})`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-2">
        {data?.topRestaurants?.length > 0 && (
          <Leaderboard rows={data.topRestaurants} valueKey="revenue" countKey="order" icon={<FiAward />} title="أفضل المتاجر" sub="مرتّبة حسب المدفوعات على الطلبات المسلّمة" />
        )}
        {data?.topDrivers?.length > 0 && (
          <Leaderboard rows={data.topDrivers} valueKey="earnings" countKey="delivery" icon={<FiTruck />} title="أفضل السائقين" sub="مرتّبون حسب الأرباح (الأجرة + إكرامية السائق)" />
        )}
      </div>
    </div>
  );
}
