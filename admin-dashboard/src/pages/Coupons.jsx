import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiTrash2, FiTag, FiTruck } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { fmtDate, num, truthy } from '../utils/format';
import { PageHeader, EmptyState, ListSkeleton, Modal, Field, Badge, PrimaryBtn, useConfirm } from '../components/ui';

const EMPTY = { code: '', type: 'percentage', value: '', max_discount: '', min_order: '', max_uses: '', expires_at: '' };
const typeLabel = { percentage: 'نسبة مئوية', fixed: 'مبلغ ثابت', free_delivery: 'توصيل مجاني' };
const isActive = (c) => c.is_active == null || truthy(c.is_active);
const isExpired = (c) => c.expires_at && new Date(c.expires_at).getTime() < Date.now();

export default function Coupons() {
  const confirm = useConfirm();
  const cached = readCache('adm_coupons');
  const [coupons, setCoupons] = useState(cached || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(!cached);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    try {
      const data = await api.get('/coupons');
      setCoupons(data.data || []); writeCache('adm_coupons', data.data || []);
    } catch (e) { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل الكوبونات'); }
    finally { setLoading(false); }
  };

  // الكوبونات المحذوفة (المعطّلة) لا تظهر — حتى لو أرجعها خادم قديم
  const visible = useMemo(() => coupons.filter(isActive), [coupons]);

  const validate = () => {
    const code = form.code.trim();
    if (!code) return 'أدخل كود الكوبون';
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return 'الكود: 3–30 حرفاً إنجليزياً أو رقماً بدون مسافات';
    if (form.type !== 'free_delivery') {
      const v = parseFloat(form.value);
      if (isNaN(v) || v <= 0) return 'أدخل قيمة خصم أكبر من صفر';
      if (form.type === 'percentage' && v > 100) return 'النسبة لا يمكن أن تتجاوز 100%';
    }
    if (form.max_discount !== '' && (isNaN(parseFloat(form.max_discount)) || parseFloat(form.max_discount) <= 0)) return 'الحد الأقصى للخصم يجب أن يكون أكبر من صفر';
    if (form.min_order !== '' && (isNaN(parseFloat(form.min_order)) || parseFloat(form.min_order) < 0)) return 'الحد الأدنى للطلب لا يمكن أن يكون سالباً';
    if (form.max_uses !== '' && (!/^\d+$/.test(String(form.max_uses)) || parseInt(form.max_uses) < 1)) return 'عدد الاستخدامات رقم صحيح ≥ 1 (أو اتركه فارغاً لغير محدود)';
    if (form.expires_at && new Date(form.expires_at).getTime() < Date.now()) return 'تاريخ الانتهاء في الماضي';
    if (visible.some(c => String(c.code).toUpperCase() === code)) return 'يوجد كوبون فعّال بنفس الكود';
    return null;
  };

  const create = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(), type: form.type,
        value: form.type === 'free_delivery' ? 0 : parseFloat(form.value),
        max_discount: form.type === 'percentage' && form.max_discount !== '' ? parseFloat(form.max_discount) : null,
        min_order: form.min_order === '' ? 0 : parseFloat(form.min_order),
        max_uses: form.max_uses === '' ? null : parseInt(form.max_uses),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      const data = await api.post('/coupons', payload);
      if (data?.data) setCoupons(prev => [data.data, ...prev]); else fetchCoupons();
      setShowForm(false);
      setForm(EMPTY);
      toast.success('تم إنشاء الكوبون');
    } catch (e) { toast.error(e?.message || 'فشل إنشاء الكوبون'); }
    finally { setSaving(false); }
  };

  const deleteCoupon = async (c) => {
    const ok = await confirm({ title: 'حذف الكوبون', message: `سيتم تعطيل الكوبون «${c.code}» نهائياً ولن يقبله التطبيق بعد الآن.`, confirmText: 'حذف' });
    if (!ok) return;
    try {
      await api.delete(`/coupons/${c.id}`);
      setCoupons(prev => prev.map(x => (x.id === c.id ? { ...x, is_active: false } : x)));
      toast.success('تم حذف الكوبون');
    } catch (e) { toast.error(e?.message || 'فشل الحذف'); }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: k === 'code' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value }));

  return (
    <div className="page">
      <PageHeader icon={<FiTag />} title="الكوبونات" subtitle={`${visible.length} كوبون فعّال`}
        action={<PrimaryBtn onClick={() => setShowForm(true)}><FiPlus /> <span>كوبون<span className="hidden sm:inline"> جديد</span></span></PrimaryBtn>} />

      {loading && coupons.length === 0 ? <ListSkeleton rows={4} grid />
        : visible.length === 0 ? <EmptyState icon={<FiTag />} title="لا توجد كوبونات فعّالة" hint="أنشئ كوبون خصم لجذب الزبائن"
            action={<PrimaryBtn onClick={() => setShowForm(true)}><FiPlus /> إنشاء كوبون</PrimaryBtn>} />
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {visible.map(c => {
              const used = parseInt(c.usage_count || c.used_count || 0) || 0;
              const limit = c.usage_limit != null && c.usage_limit !== '' ? parseInt(c.usage_limit) : null;
              const pct = limit ? Math.min(100, (used / Math.max(1, limit)) * 100) : 0;
              const expired = isExpired(c);
              const exhausted = limit != null && used >= limit;
              const dead = expired || exhausted;
              const big = c.type === 'free_delivery' ? <FiTruck /> : `${num(c.value)}${c.type === 'percentage' ? '%' : '₪'}`;
              return (
                <article key={c.id} className={`relative flex rounded-[20px] shadow-card hover:shadow-lift transition-shadow duration-300 ${dead ? 'grayscale-[.7] opacity-80' : ''}`}>
                  {/* Stub */}
                  <div className={`relative w-[104px] flex-shrink-0 rounded-r-[20px] text-white flex flex-col items-center justify-center p-3 overflow-hidden ${dead ? 'bg-gradient-to-br from-gray-400 to-gray-500' : 'mesh-sunset'}`}>
                    <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full bg-white/15" />
                    <span className="text-[28px] font-black leading-none num relative">{big}</span>
                    <span className="text-[10.5px] font-extrabold mt-1.5 text-white/85 relative text-center leading-tight">{c.type === 'free_delivery' ? 'توصيل مجاني' : 'خصم'}</span>
                  </div>
                  {/* Perforation */}
                  <div className="relative w-0 border-l-2 border-dashed border-surface-line">
                    <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-surface" />
                    <span className="absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-surface" />
                  </div>
                  {/* Body */}
                  <div className="flex-1 min-w-0 bg-white rounded-l-[20px] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-black text-ink text-[17px] tracking-wider truncate" dir="ltr" style={{ textAlign: 'right' }}>{c.code}</p>
                        <div className="flex gap-1 flex-wrap mt-1.5">
                          <Badge className="bg-orange-50 text-orange-700 ring-orange-200">{typeLabel[c.type] || c.type}</Badge>
                          {expired && <Badge className="bg-gray-100 text-gray-500 ring-gray-200">منتهي</Badge>}
                          {exhausted && !expired && <Badge className="bg-gray-100 text-gray-500 ring-gray-200">نفدت الاستخدامات</Badge>}
                        </div>
                      </div>
                      <button onClick={() => deleteCoupon(c)} aria-label="حذف" title="حذف" className="w-9 h-9 rounded-xl text-ink-4 hover:bg-red-50 hover:text-red-500 flex items-center justify-center flex-shrink-0"><FiTrash2 /></button>
                    </div>
                    <div className="text-[12px] text-ink-2 space-y-0.5 mt-2.5 font-medium">
                      {c.type === 'percentage' && num(c.max_discount) > 0 && <p>حتى <b className="num">{num(c.max_discount)}₪</b></p>}
                      {num(c.min_order) > 0 && <p>الحد الأدنى: <b className="num">{num(c.min_order)}₪</b></p>}
                      {c.expires_at && <p className="text-ink-3">ينتهي: {fmtDate(c.expires_at)}</p>}
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-[10.5px] font-bold text-ink-3 mb-1"><span>الاستخدامات</span><span className="num">{used} / {limit ?? '∞'}</span></div>
                      {limit ? (
                        <div className="bg-surface-sunken rounded-full h-1.5 overflow-hidden"><div className="grad-sunset h-1.5 rounded-full grow-x" style={{ width: `${pct}%` }} /></div>
                      ) : (
                        <div className="h-1.5 rounded-full bg-[repeating-linear-gradient(90deg,#FFE4CC_0_6px,transparent_6px_10px)]" title="غير محدود" />
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="كوبون جديد" icon={<FiTag />}
        footer={<button onClick={create} disabled={saving} className="w-full btn-lux py-3 disabled:opacity-60">{saving ? 'جاري الإنشاء…' : 'إنشاء الكوبون'}</button>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="كود الكوبون *"><input className="inp font-mono tracking-wider" dir="ltr" placeholder="WASALY10" value={form.code} onChange={set('code')} /></Field></div>
          <div className="col-span-2">
            <Field label="نوع الخصم">
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(typeLabel).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setForm(f => ({ ...f, type: k }))}
                    className={`py-2.5 rounded-xl text-xs font-bold ${form.type === k ? 'chip-on' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>{l}</button>
                ))}
              </div>
            </Field>
          </div>
          {form.type !== 'free_delivery' && (
            <Field label={form.type === 'percentage' ? 'النسبة % *' : 'المبلغ ₪ *'}>
              <input type="number" min="0" max={form.type === 'percentage' ? 100 : undefined} step="0.5" className="inp" placeholder={form.type === 'percentage' ? '10' : '5'} value={form.value} onChange={set('value')} />
            </Field>
          )}
          {form.type === 'percentage' && (
            <Field label="أقصى خصم ₪" hint="(اختياري)"><input type="number" min="0" step="0.5" className="inp" placeholder="مثال: 15" value={form.max_discount} onChange={set('max_discount')} /></Field>
          )}
          <Field label="الحد الأدنى للطلب ₪"><input type="number" min="0" step="0.5" className="inp" placeholder="0" value={form.min_order} onChange={set('min_order')} /></Field>
          <Field label="عدد الاستخدامات" hint="(فارغ = غير محدود)"><input type="number" min="1" step="1" className="inp" placeholder="∞" value={form.max_uses} onChange={set('max_uses')} /></Field>
          <div className="col-span-2"><Field label="تاريخ الانتهاء" hint="(اختياري)"><input type="datetime-local" className="inp" value={form.expires_at} onChange={set('expires_at')} /></Field></div>
          {form.type === 'free_delivery' && <p className="col-span-2 text-[11px] text-gray-400">يُلغي رسوم التوصيل عند استخدامه (يتطلب نسخة الخادم الجديدة).</p>}
        </div>
      </Modal>
    </div>
  );
}
