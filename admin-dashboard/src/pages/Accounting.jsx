import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { money, num, truthy } from '../utils/format';
import { PageHeader, ListSkeleton, SearchInput, LoadMore } from '../components/ui';

const PAGE = 30;

function Tile({ label, hint, value, cls }) {
  return (
    <div className={`sheen relative overflow-hidden rounded-2xl p-4 text-white shadow-card bg-gradient-to-br ${cls}`}>
      <p className="text-white/90 text-xs font-bold">{label}</p>
      <p className="text-2xl font-black mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-white/70 text-[10px] font-semibold mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}

export default function Accounting() {
  const cached = readCache('adm_accounting');
  const [data, setData] = useState(cached || { totals: {}, restaurants: [], drivers: [] });
  const [loading, setLoading] = useState(!cached);
  const [rates, setRates] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);

  const load = async () => {
    try {
      const r = await api.get('/admin/accounting');
      let restaurants = r.restaurants || [];
      // توافق مع الخادم القديم: إظهار كل المتاجر النشطة حتى بدون مبيعات لتعديل عمولتها مسبقاً
      try {
        const all = await api.get('/admin/restaurants', { params: { limit: 1000 } });
        const missing = (all.data || [])
          .filter(x => truthy(x.is_active) && !restaurants.some(y => String(y.id) === String(x.id)))
          .map(x => ({ id: x.id, name: x.name_ar, orders: 0, sales: 0, commission: 0, net: 0, commission_rate: x.commission_rate ?? 15 }));
        restaurants = [...restaurants, ...missing];
      } catch { /* اختياري */ }
      const d = { totals: r.totals || {}, restaurants, drivers: r.drivers || [] };
      setData(d); writeCache('adm_accounting', d);
      const rt = {}; restaurants.forEach(x => { rt[x.id] = x.commission_rate ?? 15; });
      setRates(rt);
    } catch (e) { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل المحاسبة'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (cached) { const rt = {}; (cached.restaurants || []).forEach(x => { rt[x.id] = x.commission_rate ?? 15; }); setRates(rt); } }, []);

  const saveRate = async (r) => {
    const rate = parseFloat(rates[r.id]);
    if (isNaN(rate) || rate < 0 || rate > 100) return toast.error('النسبة يجب أن تكون بين 0 و 100');
    setSavingId(r.id);
    try { await api.patch(`/admin/restaurants/${r.id}/commission`, { rate }); toast.success(`تم تحديث عمولة «${r.name}» إلى ${rate}%`); load(); }
    catch (e) { toast.error(e?.message || 'فشل'); }
    finally { setSavingId(null); }
  };

  const t = data.totals || {};
  const rests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.restaurants.filter(r => !q || String(r.name || '').toLowerCase().includes(q));
  }, [data.restaurants, search]);

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="💰" title="المحاسبة والعمولات" subtitle={`محسوبة من الطلبات المسلّمة · ${t.orders || 0} طلب`} />

      {loading ? <ListSkeleton rows={6} /> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="💰 عمولة المنصّة" hint="المبيعات × نسبة عمولة كل متجر" value={money(t.commission)} cls="from-[#FF8A1E] to-[#F53B57]" />
            <Tile label="📊 مبيعات المتاجر" hint="مجموع الأصناف (قبل التوصيل والخصم)" value={money(t.sales)} cls="from-sky-500 to-blue-600" />
            <Tile label="🏪 صافي مستحق للمتاجر" hint="المبيعات − العمولة" value={money(t.restaurant_net)} cls="from-emerald-500 to-green-600" />
            <Tile label="🛵 أرباح السائقين" hint={t.tips != null ? 'رسوم التوصيل + الإكراميات' : 'رسوم التوصيل'} value={money(t.driver_earnings)} cls="from-violet-500 to-purple-600" />
          </div>

          {(t.delivery_fees != null || t.tips != null || t.discounts != null) && (
            <div className="card p-3 grid grid-cols-3 text-center divide-x divide-x-reverse divide-gray-100">
              <div><p className="text-[10px] text-gray-400 font-bold">رسوم التوصيل</p><p className="font-black text-gray-800 tabular-nums">{money(t.delivery_fees)}</p></div>
              <div><p className="text-[10px] text-gray-400 font-bold">الإكراميات</p><p className="font-black text-gray-800 tabular-nums">{money(t.tips)}</p></div>
              <div><p className="text-[10px] text-gray-400 font-bold">الخصومات</p><p className="font-black text-green-600 tabular-nums">{money(t.discounts)}</p></div>
            </div>
          )}
          <p className="text-[11px] text-gray-400 leading-relaxed">ℹ️ تُطبَّق نسبة العمولة الحالية على كامل مبيعات المتجر المسلّمة؛ تغيير النسبة يغيّر الأرقام التاريخية المعروضة.</p>

          <div className="flex items-center justify-between mt-2">
            <h2 className="font-black text-gray-900">المتاجر <span className="text-xs text-gray-400">({data.restaurants.length})</span></h2>
          </div>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setVisible(PAGE); }} placeholder="ابحث عن متجر…" />
          {rests.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">لا توجد متاجر</p>
          ) : <div className="space-y-3">{rests.slice(0, visible).map(r => {
            const changed = num(rates[r.id]) !== num(r.commission_rate ?? 15);
            return (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-black text-gray-900 text-sm truncate">{r.name}</p>
                  <span className="text-xs text-gray-400 font-bold flex-shrink-0">{r.orders || 0} طلب</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs bg-gray-50 rounded-xl p-2">
                  <div><p className="text-gray-400 font-bold">المبيعات</p><p className="font-black text-gray-800 tabular-nums">{money(r.sales)}</p></div>
                  <div><p className="text-gray-400 font-bold">العمولة</p><p className="font-black text-orange-500 tabular-nums">{money(r.commission)}</p></div>
                  <div><p className="text-gray-400 font-bold">الصافي</p><p className="font-black text-green-600 tabular-nums">{money(r.net)}</p></div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <label className="text-xs text-gray-500 font-bold flex-1">نسبة العمولة %</label>
                  <input type="number" min="0" max="100" step="0.5" inputMode="decimal"
                    className="inp w-24 py-1.5 text-center"
                    value={rates[r.id] ?? ''} onChange={e => setRates(p => ({ ...p, [r.id]: e.target.value }))} />
                  <button onClick={() => saveRate(r)} disabled={!changed || savingId === r.id}
                    className="btn-lux text-xs px-4 py-2 disabled:opacity-40">{savingId === r.id ? '…' : 'حفظ'}</button>
                </div>
              </div>
            );
          })}</div>}
          <LoadMore shown={Math.min(visible, rests.length)} total={rests.length} onMore={() => setVisible(v => v + PAGE)} />

          <h2 className="font-black text-gray-900 mt-2">السائقون <span className="text-xs text-gray-400">({data.drivers.length})</span></h2>
          {data.drivers.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">لا توجد توصيلات بعد</p>
          ) : (
            <div className="card overflow-hidden">
              {data.drivers.map((d, i) => (
                <div key={d.id ?? d.user_id ?? `${d.name}-${i}`} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center text-sm flex-shrink-0">🛵</div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm leading-none truncate">{d.name || 'سائق'}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{d.deliveries || 0} توصيلة{d.tips != null ? ` · إكراميات ${money(d.tips)}` : ''}</p>
                    </div>
                  </div>
                  <p className="font-black text-violet-600 text-sm tabular-nums">{money(d.earnings)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
