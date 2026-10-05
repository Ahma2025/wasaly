import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { money, num, truthy } from '../utils/format';
import { FiDollarSign, FiPercent, FiBarChart2, FiShoppingBag, FiTruck, FiInfo } from 'react-icons/fi';
import { PageHeader, ListSkeleton, TableSkeleton, SearchInput, LoadMore, AnimatedNumber, Spinner, DataTable, SectionHeader, EmptyState, Avatar, useMediaQuery } from '../components/ui';
import { Sk } from '../components/Skeleton';

const PAGE = 30;

function Tile({ label, hint, value, cls, icon }) {
  return (
    <div className={`sheen relative overflow-hidden rounded-[20px] p-4 sm:p-5 text-white shadow-card bg-gradient-to-br ${cls}`}>
      <div className="absolute -left-6 -bottom-8 w-24 h-24 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-[15px]">{icon}</span>
        <p className="text-white/90 text-xs font-bold truncate">{label}</p>
      </div>
      <p className="relative text-[24px] sm:text-[28px] font-black mt-3 leading-none"><AnimatedNumber value={num(value)} decimals={2} /><span className="text-base mr-0.5 opacity-85">₪</span></p>
      {hint && <p className="relative text-white/70 text-[10.5px] font-medium mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function RateEditor({ r, rates, setRates, savingId, saveRate }) {
  const changed = num(rates[r.id]) !== num(r.commission_rate ?? 15);
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="relative">
        <input type="number" min="0" max="100" step="0.5" inputMode="decimal" aria-label={`نسبة عمولة ${r.name}`}
          className={`inp !min-h-0 w-[84px] py-1.5 pl-6 text-center num ${changed ? '!border-brand-400 !bg-orange-50/50' : ''}`}
          value={rates[r.id] ?? ''} onChange={e => setRates(p => ({ ...p, [r.id]: e.target.value }))} />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-xs font-bold pointer-events-none">%</span>
      </div>
      <button onClick={() => saveRate(r)} disabled={!changed || savingId === r.id}
        className={`btn btn-sm ${changed ? 'btn-primary' : 'btn-secondary'} disabled:opacity-40 min-w-[56px]`}>{savingId === r.id ? <Spinner light /> : 'حفظ'}</button>
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
  const restTotals = useMemo(() => rests.reduce((a, r) => ({
    orders: a.orders + (Number(r.orders) || 0), sales: a.sales + num(r.sales), commission: a.commission + num(r.commission), net: a.net + num(r.net),
  }), { orders: 0, sales: 0, commission: 0, net: 0 }), [rests]);
  const desktop = useMediaQuery('(min-width: 1024px)');

  return (
    <div className="page">
      <PageHeader icon={<FiDollarSign />} title="المحاسبة والعمولات" subtitle={`محسوبة من الطلبات المسلّمة · ${t.orders || 0} طلب`} />

      {loading ? <><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">{[0, 1, 2, 3].map(i => <Sk key={i} h={128} r={20} />)}</div>{desktop ? <TableSkeleton rows={6} /> : <ListSkeleton rows={4} />}</> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 stagger">
            <Tile icon={<FiPercent />} label="عمولة المنصّة" hint="المبيعات × نسبة عمولة كل متجر" value={t.commission} cls="from-[#FF8A00] via-[#FF5E3A] to-[#F53B57]" />
            <Tile icon={<FiBarChart2 />} label="مبيعات المتاجر" hint="مجموع الأصناف (قبل التوصيل والخصم)" value={t.sales} cls="from-sky-500 to-blue-600" />
            <Tile icon={<FiShoppingBag />} label="صافي مستحق للمتاجر" hint="المبيعات − العمولة" value={t.restaurant_net} cls="from-emerald-500 to-green-600" />
            <Tile icon={<FiTruck />} label="أرباح السائقين" hint={t.tips != null ? 'رسوم التوصيل + الإكراميات' : 'رسوم التوصيل'} value={t.driver_earnings} cls="from-violet-500 to-purple-600" />
          </div>

          {(t.delivery_fees != null || t.tips != null || t.discounts != null) && (
            <div className="card p-4 grid grid-cols-3 text-center divide-x divide-x-reverse divide-surface-line lg:max-w-3xl">
              <div><p className="text-[11px] text-ink-3 font-bold">رسوم التوصيل</p><p className="font-black text-ink num text-[15px] mt-0.5">{money(t.delivery_fees)}</p></div>
              <div><p className="text-[11px] text-ink-3 font-bold">الإكراميات</p><p className="font-black text-ink num text-[15px] mt-0.5">{money(t.tips)}</p></div>
              <div><p className="text-[11px] text-ink-3 font-bold">الخصومات</p><p className="font-black text-green-600 num text-[15px] mt-0.5">{money(t.discounts)}</p></div>
            </div>
          )}
          <p className="text-[11.5px] text-ink-3 leading-relaxed flex items-start gap-1.5"><FiInfo className="mt-0.5 flex-shrink-0" /> تُطبَّق نسبة العمولة الحالية على كامل مبيعات المتجر المسلّمة؛ تغيير النسبة يغيّر الأرقام التاريخية المعروضة.</p>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2">
            <SectionHeader title={<>المتاجر <span className="text-xs text-ink-3 num">({data.restaurants.length})</span></>} hint="المبيعات والعمولة والصافي لكل متجر" />
            <SearchInput className="sm:w-72" value={search} onChange={(v) => { setSearch(v); setVisible(PAGE); }} placeholder="ابحث عن متجر…" />
          </div>
          {rests.length === 0 ? (
            <EmptyState compact icon={<FiShoppingBag />} title="لا توجد متاجر" />
          ) : desktop ? (
            <DataTable rows={rests.slice(0, visible)} maxHeight="70vh" columns={[
              { key: 'name', header: 'المتجر', render: r => <span className="font-bold text-ink">{r.name}</span> },
              { key: 'orders', header: 'الطلبات', align: 'center', render: r => <span className="num text-ink-2 font-bold">{r.orders || 0}</span> },
              { key: 'sales', header: 'المبيعات', align: 'end', render: r => <span className="num font-bold">{money(r.sales)}</span> },
              { key: 'commission', header: 'العمولة', align: 'end', render: r => <span className="num font-black text-brand-600">{money(r.commission)}</span> },
              { key: 'net', header: 'الصافي', align: 'end', render: r => <span className="num font-black text-green-600">{money(r.net)}</span> },
              { key: 'rate', header: 'نسبة العمولة', align: 'end', render: r => <RateEditor r={r} rates={rates} setRates={setRates} savingId={savingId} saveRate={saveRate} /> },
            ]}
              footer={<>
                <td>الإجمالي <span className="text-ink-3 font-bold text-xs">({rests.length})</span></td>
                <td style={{ textAlign: 'center' }} className="num">{restTotals.orders}</td>
                <td style={{ textAlign: 'left' }} className="num">{money(restTotals.sales)}</td>
                <td style={{ textAlign: 'left' }} className="num text-brand-600">{money(restTotals.commission)}</td>
                <td style={{ textAlign: 'left' }} className="num text-green-600">{money(restTotals.net)}</td>
                <td />
              </>} />
          ) : <div className="space-y-3">{rests.slice(0, visible).map(r => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="font-black text-ink text-sm truncate">{r.name}</p>
                  <span className="text-[11px] text-ink-3 font-bold flex-shrink-0 num bg-surface-sunken rounded-full px-2 py-0.5">{r.orders || 0} طلب</span>
                </div>
                <div className="grid grid-cols-3 text-center text-xs bg-surface rounded-xl py-2.5 divide-x divide-x-reverse divide-surface-line">
                  <div><p className="text-ink-3 font-bold">المبيعات</p><p className="font-black text-ink num mt-0.5">{money(r.sales)}</p></div>
                  <div><p className="text-ink-3 font-bold">العمولة</p><p className="font-black text-brand-600 num mt-0.5">{money(r.commission)}</p></div>
                  <div><p className="text-ink-3 font-bold">الصافي</p><p className="font-black text-green-600 num mt-0.5">{money(r.net)}</p></div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-ink-2 font-bold flex-1">نسبة العمولة</span>
                  <RateEditor r={r} rates={rates} setRates={setRates} savingId={savingId} saveRate={saveRate} />
                </div>
              </div>
            ))}</div>}
          <LoadMore shown={Math.min(visible, rests.length)} total={rests.length} onMore={() => setVisible(v => v + PAGE)} />

          <SectionHeader className="pt-2" title={<>السائقون <span className="text-xs text-ink-3 num">({data.drivers.length})</span></>} hint="أرباح التوصيل لكل سائق" />
          {data.drivers.length === 0 ? (
            <EmptyState compact icon={<FiTruck />} title="لا توجد توصيلات بعد" />
          ) : desktop ? (
            <DataTable rows={data.drivers} rowKey={(d, i) => d.id ?? d.user_id ?? `${d.name}-${i}`} columns={[
              { key: 'name', header: 'السائق', render: d => <div className="flex items-center gap-2.5"><Avatar name={d.name} size={32} rounded={10} tint="#8B5CF6" /><span className="font-bold">{d.name || 'سائق'}</span></div> },
              { key: 'deliveries', header: 'التوصيلات', align: 'center', render: d => <span className="num font-bold text-ink-2">{d.deliveries || 0}</span> },
              ...(data.drivers.some(d => d.tips != null) ? [{ key: 'tips', header: 'الإكراميات', align: 'end', render: d => <span className="num">{d.tips != null ? money(d.tips) : '—'}</span> }] : []),
              { key: 'earnings', header: 'الأرباح', align: 'end', render: d => <span className="num font-black text-violet-600">{money(d.earnings)}</span> },
            ]}
              footer={<>
                <td>الإجمالي</td>
                <td style={{ textAlign: 'center' }} className="num">{data.drivers.reduce((a, d) => a + (Number(d.deliveries) || 0), 0)}</td>
                {data.drivers.some(d => d.tips != null) && <td style={{ textAlign: 'left' }} className="num">{money(data.drivers.reduce((a, d) => a + num(d.tips), 0))}</td>}
                <td style={{ textAlign: 'left' }} className="num text-violet-600">{money(data.drivers.reduce((a, d) => a + num(d.earnings), 0))}</td>
              </>} />
          ) : (
            <div className="card overflow-hidden divide-y divide-[#F3F4F8]">
              {data.drivers.map((d, i) => (
                <div key={d.id ?? d.user_id ?? `${d.name}-${i}`} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={d.name} size={38} rounded={12} tint="#8B5CF6" />
                    <div className="min-w-0">
                      <p className="font-bold text-ink text-sm leading-none truncate">{d.name || 'سائق'}</p>
                      <p className="text-[10.5px] text-ink-3 mt-1 num">{d.deliveries || 0} توصيلة{d.tips != null ? ` · إكراميات ${money(d.tips)}` : ''}</p>
                    </div>
                  </div>
                  <p className="font-black text-violet-600 text-sm num">{money(d.earnings)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
