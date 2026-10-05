import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
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
    <div className="space-y-4 p-4 animate-fade-up">
      <PageHeader icon="🎟️" title="الكوبونات" subtitle={`${visible.length} كوبون فعّال`}
        action={<PrimaryBtn onClick={() => setShowForm(true)} className="flex items-center gap-1.5"><FiPlus /> كوبون</PrimaryBtn>} />

      {loading && coupons.length === 0 ? <ListSkeleton rows={4} />
        : visible.length === 0 ? <EmptyState icon="🎟️" title="لا توجد كوبونات فعّالة" hint="أنشئ كوبون خصم لجذب الزبائن" />
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map(c => {
              const used = parseInt(c.usage_count || c.used_count || 0) || 0;
              const limit = c.usage_limit != null && c.usage_limit !== '' ? parseInt(c.usage_limit) : null;
              const pct = limit ? Math.min(100, (used / Math.max(1, limit)) * 100) : 0;
              const expired = isExpired(c);
              const exhausted = limit != null && used >= limit;
              return (
                <div key={c.id} className={`card p-4 relative overflow-hidden ${expired || exhausted ? 'opacity-75' : ''}`}>
                  <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#F5F6F8]" />
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-mono font-black text-orange-600 text-lg tracking-wider" dir="ltr" style={{ textAlign: 'right' }}>{c.code}</p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        <Badge className="bg-orange-50 text-orange-700 ring-orange-200">{typeLabel[c.type] || c.type}</Badge>
                        {expired && <Badge className="bg-gray-100 text-gray-500 ring-gray-200">منتهي</Badge>}
                        {exhausted && !expired && <Badge className="bg-gray-100 text-gray-500 ring-gray-200">نفدت الاستخدامات</Badge>}
                      </div>
                    </div>
                    <button onClick={() => deleteCoupon(c)} aria-label="حذف" className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0"><FiTrash2 /></button>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>الخصم: <strong>{c.type === 'free_delivery' ? 'توصيل مجاني' : `${num(c.value)}${c.type === 'percentage' ? '%' : '₪'}`}</strong>
                      {c.type === 'percentage' && num(c.max_discount) > 0 && <span className="text-xs text-gray-400"> (حتى {num(c.max_discount)}₪)</span>}</p>
                    {num(c.min_order) > 0 && <p>الحد الأدنى: <strong>{num(c.min_order)}₪</strong></p>}
                    <p>الاستخدامات: <strong className="tabular-nums">{used} / {limit ?? '∞'}</strong></p>
                    {c.expires_at && <p className="text-gray-400 text-xs">ينتهي: {fmtDate(c.expires_at)}</p>}
                  </div>
                  {limit ? (
                    <div className="mt-2 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="grad-brand h-1.5 rounded-full" style={{ width: `${pct}%` }} /></div>
                  ) : (
                    <p className="mt-2 text-[10px] text-gray-400 font-bold">♾️ استخدام غير محدود</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="كوبون جديد"
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
