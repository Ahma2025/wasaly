import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import PageSkeleton from '../components/Skeleton';
import toast from 'react-hot-toast';

const StatCard = ({ icon, label, value, tint }) => (
  <div className="sheen relative rounded-2xl p-4 bg-white shadow-card hover-lift border border-gray-100 overflow-hidden">
    <div className="absolute -left-6 -top-6 w-20 h-20 rounded-full opacity-10" style={{ background: tint }} />
    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: `${tint}1a` }}>
      <span>{icon}</span>
    </div>
    <p className="text-gray-400 text-xs font-bold">{label}</p>
    <p className="text-2xl font-black mt-0.5 text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</p>
  </div>
);

const STATUS = {
  pending:    { label: 'قيد الانتظار', color: '#F59E0B' },
  confirmed:  { label: 'مقبول',        color: '#3B82F6' },
  preparing:  { label: 'يُحضَّر',       color: '#8B5CF6' },
  on_the_way: { label: 'في الطريق',    color: '#06B6D4' },
  delivered:  { label: 'تم التوصيل',   color: '#16A34A' },
  cancelled:  { label: 'ملغي',          color: '#EF4444' },
};

export default function Dashboard() {
  const [data, setData] = useState(readCache('adm_dashboard') || null);
  const [loading, setLoading] = useState(!readCache('adm_dashboard'));

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(r => { setData(r.data); writeCache('adm_dashboard', r.data); })
      .catch(e => { console.error(e); toast.error('فشل تحميل البيانات'); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton cards={4} rows={6} />;

  const today = new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
  const statusRows = data?.ordersByStatus || [];
  const maxStatus = Math.max(1, ...statusRows.map(s => Number(s.count) || 0));

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <div>
        <h1 className="text-xl font-black text-gray-900">لوحة التحكم</h1>
        <p className="text-xs text-gray-400 mt-0.5">{today}</p>
      </div>

      {/* Revenue hero */}
      <div className="sheen relative grad-sunset rounded-3xl p-5 text-white overflow-hidden shadow-brand">
        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-white/10" />
        <p className="text-white/85 text-sm font-semibold">إيرادات اليوم</p>
        <p className="text-4xl font-black mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {parseFloat(data?.revenueToday || 0).toFixed(2)}<span className="text-2xl"> ₪</span>
        </p>
        <div className="flex gap-4 mt-3">
          <span className="text-white/90 text-xs bg-white/15 rounded-full px-3 py-1 font-bold">📦 {data?.ordersToday ?? 0} طلب اليوم</span>
          {data?.pendingOrders > 0 && (
            <span className="text-white/90 text-xs bg-white/15 rounded-full px-3 py-1 font-bold">⏳ {data.pendingOrders} بالانتظار</span>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 stagger">
        <StatCard icon="👥" label="المستخدمون"      value={data?.totalUsers}        tint="#3B82F6" />
        <StatCard icon="🏪" label="المطاعم"          value={data?.totalRestaurants}  tint="#16A34A" />
        <StatCard icon="🛵" label="سائقون متصلون"    value={data?.activeDrivers}     tint="#8B5CF6" />
        <StatCard icon="📦" label="طلبات اليوم"       value={data?.ordersToday}       tint="#FF6B00" />
      </div>

      {/* Weekly Revenue Chart */}
      {data?.weeklyRevenue?.length > 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-gray-900">إيرادات آخر 7 أيام</h2>
            <span className="text-xs text-gray-400 font-bold">₪</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={data.weeklyRevenue} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#FF6B00" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9AA0AE' }} tickFormatter={d => d?.slice(5)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9AA0AE' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={v => [`${parseFloat(v).toFixed(2)} ₪`, 'الإيراد']} contentStyle={{ borderRadius: 14, border: '1px solid #eee', fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B00" fill="url(#rev)" strokeWidth={3} dot={{ r: 3, fill: '#FF6B00' }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 text-center text-gray-400 border border-gray-100">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">لا توجد بيانات إيرادات بعد</p>
        </div>
      )}

      {/* Orders by status — colored bars */}
      {statusRows.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
          <h2 className="font-black text-gray-900 mb-3">الطلبات حسب الحالة</h2>
          <div className="space-y-3">
            {statusRows.map((s, i) => {
              const meta = STATUS[s.status] || { label: s.status, color: '#9AA0AE' };
              const pct = Math.round(((Number(s.count) || 0) / maxStatus) * 100);
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600 font-semibold flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="font-black text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
