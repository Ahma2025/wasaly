import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import PageSkeleton from '../components/Skeleton';
import { statusMeta, fmtToday, num } from '../utils/format';

const StatCard = ({ icon, label, value, tint, onClick }) => (
  <button onClick={onClick} className="sheen relative text-right rounded-2xl p-4 bg-white shadow-card hover-lift border border-gray-100 overflow-hidden">
    <div className="absolute -left-6 -top-6 w-20 h-20 rounded-full opacity-10" style={{ background: tint }} />
    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: `${tint}1a` }}>
      <span>{icon}</span>
    </div>
    <p className="text-gray-400 text-xs font-bold">{label}</p>
    <p className="text-2xl font-black mt-0.5 text-gray-900 tabular-nums">{value ?? '—'}</p>
  </button>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(readCache('adm_dashboard') || null);
  const [loading, setLoading] = useState(!readCache('adm_dashboard'));

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(r => { setData(r.data); writeCache('adm_dashboard', r.data); })
      .catch(e => { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل البيانات'); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4"><PageSkeleton cards={4} rows={6} /></div>;

  const statusRows = data?.ordersByStatus || [];
  const maxStatus = Math.max(1, ...statusRows.map(s => Number(s.count) || 0));

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <div>
        <h1 className="text-xl font-black text-gray-900">لوحة التحكم</h1>
        <p className="text-xs text-gray-400 font-semibold mt-0.5">{fmtToday()}</p>
      </div>

      {/* Hero */}
      <div className="sheen relative grad-sunset rounded-3xl p-5 text-white overflow-hidden shadow-brand">
        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-white/10" />
        <p className="text-white/90 text-sm font-bold">إجمالي مدفوعات اليوم</p>
        <p className="text-4xl font-black mt-1 tabular-nums">
          {num(data?.revenueToday).toFixed(2)}<span className="text-2xl"> ₪</span>
        </p>
        <p className="text-white/70 text-[10px] font-semibold mt-1">طلبات مُسلّمة اليوم · يشمل رسوم التوصيل والإكرامية — ليس عمولة المنصّة (راجع المحاسبة)</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => navigate('/orders')} className="text-white text-xs bg-white/15 rounded-full px-3 py-1 font-bold">📦 {data?.ordersToday ?? 0} طلب اليوم</button>
          {data?.pendingOrders > 0 && (
            <button onClick={() => navigate('/orders')} className="text-white text-xs bg-white/25 rounded-full px-3 py-1 font-bold">⏳ {data.pendingOrders} بالانتظار</button>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 stagger">
        <StatCard icon="👥" label="الزبائن النشطون" value={data?.totalUsers} tint="#3B82F6" onClick={() => navigate('/users')} />
        <StatCard icon="🏪" label="المتاجر النشطة" value={data?.totalRestaurants} tint="#16A34A" onClick={() => navigate('/restaurants')} />
        <StatCard icon="🛵" label="سائقون متصلون" value={data?.activeDrivers} tint="#8B5CF6" onClick={() => navigate('/live')} />
        <StatCard icon="📦" label="طلبات اليوم" value={data?.ordersToday} tint="#FF6B00" onClick={() => navigate('/orders')} />
      </div>

      {/* Weekly chart */}
      {data?.weeklyRevenue?.length > 0 ? (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-gray-900">مدفوعات آخر 7 أيام</h2>
            <span className="text-xs text-gray-400 font-bold">₪ · طلبات مسلّمة</span>
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
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9AA0AE' }} tickFormatter={d => String(d || '').slice(5)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9AA0AE' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={v => [`${num(v).toFixed(2)} ₪`, 'المدفوع']} contentStyle={{ borderRadius: 14, border: '1px solid #eee', fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B00" fill="url(#rev)" strokeWidth={3} dot={{ r: 3, fill: '#FF6B00' }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card p-6 text-center text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm font-semibold">لا توجد بيانات مدفوعات بعد</p>
        </div>
      )}

      {/* Orders by status */}
      {statusRows.length > 0 && (
        <div className="card p-4">
          <h2 className="font-black text-gray-900 mb-3">الطلبات حسب الحالة <span className="text-[11px] text-gray-400 font-bold">آخر 30 يوم</span></h2>
          <div className="space-y-3">
            {statusRows.map((s) => {
              const meta = statusMeta(s.status);
              const pct = Math.round(((Number(s.count) || 0) / maxStatus) * 100);
              return (
                <div key={s.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600 font-semibold flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="font-black text-gray-900 tabular-nums">{s.count}</span>
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
