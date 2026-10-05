import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiUserPlus, FiTruck, FiShoppingBag } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { currentAdmin } from '../utils/session';
import { normalizePhone } from '../utils/format';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, LoadMore, Modal, Field, PasswordInput, Badge, PrimaryBtn, useConfirm } from '../components/ui';

const PAGE = 50;
const roleLabel = { customer: 'زبون', restaurant: 'مطعم', restaurant_owner: 'صاحب مطعم', driver: 'سائق', admin: 'مدير' };
const roleColor = {
  customer: 'bg-blue-50 text-blue-700 ring-blue-200',
  restaurant: 'bg-green-50 text-green-700 ring-green-200',
  restaurant_owner: 'bg-green-50 text-green-700 ring-green-200',
  driver: 'bg-orange-50 text-orange-700 ring-orange-200',
  admin: 'bg-violet-50 text-violet-700 ring-violet-200',
};
const isBlocked = (u) => u.is_blocked === true || u.is_blocked === 1 || u.is_blocked === '1';
const EMPTY_FORM = { name: '', phone: '', password: '', role: 'customer', city: '' };

export default function Users() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const me = currentAdmin();
  const cached = readCache('adm_users');
  const [users, setUsers] = useState(cached || []);
  const [total, setTotal] = useState(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const timer = useRef(null);
  const reqId = useRef(0);

  const fetchUsers = useCallback(async ({ append = false, offset = 0 } = {}) => {
    const id = ++reqId.current;
    if (append) setLoadingMore(true); else setRefreshing(true);
    try {
      const params = { search: search || undefined, role: role || undefined, limit: PAGE, offset };
      const r = await api.get('/admin/users', { params });
      let rows = r.data || [];
      // توافق مع الخادم القديم: «مطاعم» تشمل restaurant + restaurant_owner
      if (role === 'restaurant' && !rows.some(u => u.role === 'restaurant_owner')) {
        try {
          const r2 = await api.get('/admin/users', { params: { ...params, role: 'restaurant_owner' } });
          const extra = (r2.data || []).filter(x => !rows.some(u => u.id === x.id));
          rows = [...rows, ...extra];
        } catch { /* ignore */ }
      }
      if (id !== reqId.current) return;
      setUsers(prev => {
        const next = append ? [...prev, ...rows.filter(x => !prev.some(p => p.id === x.id))] : rows;
        if (!search && !role && !append) writeCache('adm_users', next);
        return next;
      });
      setHasMore(rows.length >= PAGE);
      if (!search && !role && r.total != null) setTotal(parseInt(r.total));
    } catch (e) { if (id === reqId.current && e?.status !== 401 && e?.status !== 403) toast.error('خطأ في تحميل المستخدمين'); }
    finally { if (id === reqId.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); } }
  }, [search, role]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchUsers(), 350);
    return () => clearTimeout(timer.current);
  }, [fetchUsers]);

  const toggleBlock = async (u) => {
    const blocked = isBlocked(u);
    const ok = await confirm({
      title: blocked ? 'رفع الحظر' : 'حظر المستخدم',
      message: blocked ? `سيتمكّن ${u.name || 'المستخدم'} من استخدام التطبيق مجدداً.` : `لن يتمكّن ${u.name || 'المستخدم'} (${u.phone}) من تسجيل الدخول أو الطلب.`,
      confirmText: blocked ? 'رفع الحظر' : 'حظر',
      danger: !blocked,
    });
    if (!ok) return;
    try {
      const data = await api.patch(`/admin/users/${u.id}/block`);
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_blocked: data.is_blocked ?? !blocked } : x)));
      toast.success(blocked ? 'تم رفع الحظر' : 'تم الحظر');
    } catch (e) { toast.error(e?.message || 'خطأ'); }
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return toast.error('أدخل الاسم ورقم الهاتف');
    if (!form.password || form.password.length < 6) return toast.error('كلمة المرور 6 أحرف على الأقل');
    if (form.role === 'admin') {
      const ok = await confirm({ title: 'إنشاء حساب مدير', message: 'حساب المدير يملك صلاحيات كاملة على المنصّة. متأكد؟', confirmText: 'إنشاء مدير' });
      if (!ok) return;
    }
    setCreating(true);
    try {
      await api.post('/auth/admin/create-user', { ...form, phone: normalizePhone(form.phone) });
      toast.success('تم إنشاء الحساب بنجاح');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchUsers();
    } catch (err) { toast.error(err?.message || 'حدث خطأ'); }
    finally { setCreating(false); }
  };

  const canBlock = (u) => u.role !== 'admin' && String(u.id) !== String(me?.id);

  return (
    <div className="space-y-4 p-4 animate-fade-up">
      <PageHeader icon="👥" title="المستخدمون" subtitle={total != null ? `${total} مستخدم مسجّل` : 'إدارة الحسابات'}
        action={<PrimaryBtn onClick={() => setShowCreate(true)} className="flex items-center gap-1.5"><FiUserPlus /> حساب</PrimaryBtn>} />

      <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف…" loading={refreshing && !!search} />
      <Chips value={role} onChange={setRole} options={[
        ['', 'الكل'], ['customer', 'زبائن'], ['restaurant', 'مطاعم'], ['driver', 'سائقون'], ['admin', 'مدراء'],
      ]} />

      {loading && users.length === 0 ? <ListSkeleton rows={5} />
        : users.length === 0 ? <EmptyState icon="👥" title="لا يوجد مستخدمون" hint={search ? 'جرّب بحثاً آخر' : undefined} />
        : (
          <div className={`space-y-2 ${refreshing ? 'opacity-70' : ''}`}>
            {users.map(u => {
              const blocked = isBlocked(u);
              const self = String(u.id) === String(me?.id);
              return (
                <div key={u.id} className="card p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-orange-50 flex items-center justify-center font-black text-orange-600 text-lg flex-shrink-0">
                      {u.name?.[0] || '؟'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{u.name || 'بدون اسم'} {self && <span className="text-[10px] text-orange-500">(أنت)</span>}</p>
                      <p className="text-xs text-gray-400 tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>{u.phone}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge className={roleColor[u.role] || 'bg-gray-100 text-gray-700 ring-gray-200'}>{roleLabel[u.role] || u.role}</Badge>
                        <Badge className={blocked ? 'bg-red-50 text-red-600 ring-red-200' : 'bg-green-50 text-green-600 ring-green-200'}>{blocked ? 'محظور' : 'نشط'}</Badge>
                      </div>
                    </div>
                  </div>
                  {canBlock(u) && (
                    <button onClick={() => toggleBlock(u)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0 ${blocked ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {blocked ? 'رفع الحظر' : 'حظر'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {hasMore && <LoadMore shown={users.length} total={total && !search && !role ? total : Infinity} loading={loadingMore}
        onMore={() => fetchUsers({ append: true, offset: users.length })} />}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إنشاء حساب جديد" subtitle="زبون أو مدير">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => { setShowCreate(false); navigate('/drivers?new=1'); }} className="rounded-2xl bg-violet-50 text-violet-700 p-3 text-right">
            <FiTruck className="text-lg mb-1" />
            <p className="font-black text-sm">سائق جديد</p>
            <p className="text-[10px] text-violet-500 leading-snug">من صفحة السائقين (مع بيانات المركبة)</p>
          </button>
          <button onClick={() => { setShowCreate(false); navigate('/restaurants?new=1'); }} className="rounded-2xl bg-green-50 text-green-700 p-3 text-right">
            <FiShoppingBag className="text-lg mb-1" />
            <p className="font-black text-sm">مطعم / متجر جديد</p>
            <p className="text-[10px] text-green-600 leading-snug">من صفحة المطاعم (ينشئ المتجر وحساب صاحبه)</p>
          </button>
        </div>
        <form onSubmit={createUser} className="space-y-3">
          <Field label="نوع الحساب">
            <select className="inp" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="customer">زبون</option>
              <option value="admin">مدير</option>
            </select>
          </Field>
          <Field label="الاسم الكامل *"><input className="inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
          <Field label="رقم الهاتف *"><input className="inp" inputMode="tel" dir="ltr" style={{ textAlign: 'right' }} placeholder="05XXXXXXXX" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></Field>
          <Field label="كلمة المرور *" hint="(6 أحرف على الأقل)"><PasswordInput value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></Field>
          <Field label="المدينة"><input className="inp" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></Field>
          <button type="submit" disabled={creating} className="w-full btn-lux py-3 disabled:opacity-60">{creating ? 'جاري الإنشاء…' : 'إنشاء الحساب'}</button>
        </form>
      </Modal>
    </div>
  );
}
