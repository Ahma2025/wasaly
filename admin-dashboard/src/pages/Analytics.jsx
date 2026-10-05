import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import PageSkeleton from '../components/Skeleton';
import { PageHeader, EmptyState, Badge } from '../components/ui';
import { statusMeta, num, truthy } from '../utils/format';

const rankCls = (i) => (i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-gray-100 text-gray-500');

export default function Analytics() {
  const [data, setData] = useState(readCache('adm_analytics') || null);
  const [loading, setLoading] = useState(!readCache('adm_analytics'));

  useEffect(() => {
    api.get('/admin/analytics')
      .then(r => { setData(r.data); writeCache('adm_analytics', r.data); })
      .catch(e => { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل التحليلات'); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4"><PageSkeleton cards={4} rows={5} /></div>;

  const byStatus = (data?.ordersByStatus || []).map(s => ({ ...s, label: statusMeta(s.status).label, color: statusMeta(s.status).color, count: Number(s.count) || 0 }));
  const hasAny = data?.monthlyRevenue?.length || data?.topRestaurants?.length || data?.topDrivers?.length || byStatus.length;

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="📈" title="التحليلات" subtitle="أداء المنصّة على المدى الطويل" />

      {!hasAny && <EmptyState icon="📊" title="لا توجد بيانات تحليلية بعد" hint="ستظهر البيانات بعد اكتمال أول طلب" />}

      {data?.monthlyRevenue?.length > 0 && (
        <div className="card p-4">
          <h2 className="font-black text-gray-900">المدفوعات الشهرية</h2>
          <p className="text-[11px] text-gray-400 mb-3">إجمالي ما دفعه الزبائن على الطلبات المسلّمة (آخر 6 أشهر)</p>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={data.monthlyRevenue} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9AA0AE' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9AA0AE' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={v => [`${num(v).toFixed(2)}₪`, 'المدفوع']} contentStyle={{ borderRadius: 14, border: '1px solid #eee', fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" stroke="#FF6B00" strokeWidth={3} dot={{ fill: '#FF6B00', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data?.topRestaurants?.length > 0 && (
        <div className="card p-4">
          <h2 className="font-black text-gray-900 mb-3">🏆 أفضل المتاجر</h2>
          <div className="space-y-1">
            {data.topRestaurants.map((r, i) => (
              <div key={r.id ?? i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${rankCls(i)}`}>{i + 1}</span>
                <span className="flex-1 text-sm font-bold text-gray-800 truncate">{r.name_ar}
                  {r.is_active != null && !truthy(r.is_active) && <Badge className="bg-gray-100 text-gray-500 ring-gray-200 mr-1">مخفي</Badge>}
                </span>
                <div className="text-left">
                  <p className="text-xs font-black text-orange-500 tabular-nums">{r.orders} طلب</p>
                  <p className="text-xs text-green-600 font-bold tabular-nums">{num(r.revenue).toFixed(0)}₪</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.topDrivers?.length > 0 && (
        <div className="card p-4">
          <h2 className="font-black text-gray-900 mb-3">🛵 أفضل السائقين</h2>
          <div className="space-y-1">
            {data.topDrivers.map((d, i) => (
              <div key={d.id ?? i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${rankCls(i)}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{d.name}</p>
                  <p className="text-xs text-gray-400" dir="ltr" style={{ textAlign: 'right' }}>{d.phone}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-orange-500 tabular-nums">{d.orders} توصيلة</p>
                  <p className="text-xs text-green-600 font-bold tabular-nums">{num(d.earnings).toFixed(0)}₪</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {byStatus.length > 0 && (
        <div className="card p-4">
          <h2 className="font-black text-gray-900 mb-3">📦 الطلبات حسب الحالة <span className="text-[11px] text-gray-400">كل الأوقات</span></h2>
          <ResponsiveContainer width="100%" height={Math.max(150, byStatus.length * 34)}>
            <BarChart data={byStatus} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9AA0AE' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fill: '#4B5160', fontWeight: 700 }} width={92} axisLine={false} tickLine={false} orientation="right" />
              <Tooltip formatter={v => [v, 'طلب']} contentStyle={{ borderRadius: 14, border: '1px solid #eee', fontSize: 12 }} />
              <Bar dataKey="count" radius={[6, 0, 0, 6]}>
                {byStatus.map(s => <Cell key={s.status} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
