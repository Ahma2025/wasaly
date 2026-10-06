import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiUserPlus, FiTruck, FiShoppingBag, FiUsers, FiCheck, FiSlash, FiArrowLeft, FiRotateCcw, FiFilter, FiX } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { currentAdmin } from '../utils/session';
import { normalizePhone } from '../utils/format';
import { arCount } from '../utils/plural';
import { isInactive, duplicatePhoneMessage, reactivateUser } from '../utils/accounts';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, TableSkeleton, LoadMore, Modal, Field, PasswordInput, Badge, PrimaryBtn, Button, DataTable, Avatar, Segmented, useConfirm, useMediaQuery } from '../components/ui';

const PAGE = 50;
const roleLabel = { customer: 'زبون', restaurant: 'مطعم', restaurant_owner: 'صاحب مطعم', driver: 'سائق', admin: 'مدير' };
const roleColor = {
  customer: 'bg-blue-50 text-blue-700 ring-blue-200',
  restaurant: 'bg-green-50 text-green-700 ring-green-200',
  restaurant_owner: 'bg-green-50 text-green-700 ring-green-200',
  driver: 'bg-orange-50 text-orange-700 ring-orange-200',
  admin: 'bg-violet-50 text-violet-700 ring-violet-200',
};
const ROLE_TINT = { customer: '#2E90FA', restaurant: '#16A34A', restaurant_owner: '#16A34A', driver: '#FF6B00', admin: '#7C3AED' };
const isBlocked =(u) => u.is_blocked === true || u.is_blocked === 1 || u.is_blocked === '1';
const EMPTY_FORM = { name: '', phone: '', password: '', role: 'customer', city: '' };

/** شارة الحالة: معطّل (محذوف) ≠ محظور ≠ نشط — A-07 */
function StateBadge({ u, dot }) {
  if (isInactive(u)) return <Badge className="bg-gray-100 text-gray-600 ring-gray-200">{dot ? '● ' : ''}معطّل</Badge>;
  if (isBlocked(u)) return <Badge className="bg-red-50 text-red-600 ring-red-200">{dot ? '● ' : ''}محظور</Badge>;
  return <Badge className="bg-green-50 text-green-700 ring-green-200">{dot ? '● ' : ''}نشط</Badge>;
}

export default function Users() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const me = currentAdmin();
  const cached = readCache('adm_users');
  const [users, setUsers] = useState(cached || []);
  const [total, setTotal] = useState(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [state, setState] = useState('');
  const [reactivating, setReactivating] = useState(null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const timer = useRef(null);
  const reqId = useRef(0);
  const desktop = useMediaQuery('(min-width: 1024px)');

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

  const reactivate = async (u) => {
    const ok = await confirm({
      title: 'إعادة تفعيل الحساب',
      message: `سيعود حساب ${u.name || 'المستخدم'} (${u.phone}) نشطاً ويستطيع تسجيل الدخول.${u.role === 'customer' ? '' : '\nملاحظة: السائق/المتجر المحذوف يحتاج إعادة إضافة ملفه من صفحته.'}`,
      confirmText: 'إعادة التفعيل', danger: false, icon: <FiRotateCcw />,
    });
    if (!ok) return;
    setReactivating(u.id);
    try {
      const r = await reactivateUser(u.id);
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_active: r?.data?.is_active ?? r?.is_active ?? true } : x)));
      toast.success('تمت إعادة تفعيل الحساب');
    } catch (e) {
      toast.error(e?.missingRoute ? 'إعادة التفعيل غير متاحة حالياً — تتطلب تحديث الخادم' : (e?.message || 'تعذّرت إعادة التفعيل'));
    } finally { setReactivating(null); }
  };

  // فلتر الحالة محلياً على المحمّل (الخادم لا يفلتر بالحالة)
  const shownUsers = users.filter(u => !state
    || (state === 'inactive' && isInactive(u))
    || (state === 'blocked' && !isInactive(u) && isBlocked(u))
    || (state === 'active' && !isInactive(u) && !isBlocked(u)));
  const filtersActive = !!(search.trim() || role || state);

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
    } catch (err) {
      // رقم مكرر: نوضح إن كان لحساب معطّل يمكن إعادة تفعيله — A-07
      if (err?.status === 409 || /مسجل مسبقاً|مسجّل مسبقاً/.test(err?.message || '')) toast.error(await duplicatePhoneMessage(form.phone), { duration: 6000 });
      else toast.error(err?.message || 'حدث خطأ');
    }
    finally { setCreating(false); }
  };

  const canBlock = (u) => u.role !== 'admin' && String(u.id) !== String(me?.id) && !isInactive(u);
  const actionFor = (u, compact) => {
    if (isInactive(u)) {
      return (
        <button onClick={() => reactivate(u)} disabled={reactivating === u.id}
          className="btn btn-sm flex-shrink-0 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
          <FiRotateCcw className={reactivating === u.id ? 'animate-spin' : ''} /> {compact ? 'تفعيل' : 'إعادة التفعيل'}
        </button>
      );
    }
    if (!canBlock(u)) return null;
    return (
      <button onClick={() => toggleBlock(u)} className={`btn btn-sm flex-shrink-0 ${isBlocked(u) ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'btn-danger'}`}>
        {isBlocked(u) ? <><FiCheck /> رفع الحظر</> : <><FiSlash /> حظر</>}
      </button>
    );
  };

  return (
    <div className="page">
      <PageHeader icon={<FiUsers />} title="المستخدمون" subtitle={total != null ? `${arCount(total, 'account')} مسجّلة` : 'إدارة الحسابات'}
        action={<PrimaryBtn onClick={() => setShowCreate(true)}><FiUserPlus /> <span>حساب<span className="hidden sm:inline"> جديد</span></span></PrimaryBtn>} />

      <div className="lg:card lg:p-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف…" loading={refreshing && !!search} />
        <Chips value={role} onChange={setRole} options={[
          ['', 'الكل'], ['customer', 'زبائن'], ['restaurant', 'مطاعم'], ['driver', 'سائقون'], ['admin', 'مدراء'],
        ]} />
        <Chips brand value={state} onChange={setState} options={[
          ['', 'كل الحالات'], ['active', 'نشط'], ['blocked', 'محظور'], ['inactive', 'معطّل'],
        ]} />
      </div>

      {loading && users.length === 0 ? (desktop ? <TableSkeleton rows={8} /> : <ListSkeleton rows={5} />)
        : shownUsers.length === 0 ? (filtersActive
          ? <EmptyState icon={<FiFilter />} title="لا نتائج لهذا الفلتر" hint={state ? 'فلتر الحالة يطبّق على الحسابات المحمّلة — حمّل المزيد أو امسح الفلاتر' : 'جرّب بحثاً آخر'}
              action={<Button variant="secondary" icon={<FiX />} onClick={() => { setSearch(''); setRole(''); setState(''); }}>مسح الفلاتر</Button>} />
          : <EmptyState icon={<FiUsers />} title="لا يوجد مستخدمون بعد" />)
        : desktop ? (
          <DataTable dim={refreshing} rows={shownUsers} maxHeight="calc(100vh - 320px)" columns={[
            { key: 'name', header: 'المستخدم', render: u => {
              const self = String(u.id) === String(me?.id);
              return (
                <div className="flex items-center gap-3 min-w-[180px]">
                  <Avatar name={u.name} size={36} rounded={12} tint={ROLE_TINT[u.role] || '#FF6B00'} />
                  <p className="font-bold text-ink truncate">{u.name || 'بدون اسم'} {self && <span className="text-[10.5px] text-brand-600 font-extrabold">(أنت)</span>}</p>
                </div>
              );
            } },
            { key: 'phone', header: 'الهاتف', render: u => <bdi className="num text-ink-2" dir="ltr">{u.phone}</bdi> },
            { key: 'role', header: 'الدور', render: u => <Badge className={roleColor[u.role] || 'bg-gray-100 text-gray-700 ring-gray-200'}>{roleLabel[u.role] || u.role}</Badge> },
            { key: 'state', header: 'الحالة', render: u => <StateBadge u={u} dot /> },
            { key: 'act', header: '', align: 'end', render: u => actionFor(u) },
          ]} />
        ) : (
          <div className={`space-y-2 ${refreshing ? 'opacity-70' : ''} transition-opacity`}>
            {shownUsers.map(u => {
              const self = String(u.id) === String(me?.id);
              return (
                <div key={u.id} className="card p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={u.name} size={46} rounded={15} tint={ROLE_TINT[u.role] || '#FF6B00'} />
                    <div className="min-w-0">
                      <p className="font-bold text-ink text-sm truncate">{u.name || 'بدون اسم'} {self && <span className="text-[10.5px] text-brand-600 font-extrabold">(أنت)</span>}</p>
                      <p className="text-xs text-ink-3 num" dir="ltr" style={{ textAlign: 'right' }}>{u.phone}</p>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        <Badge className={roleColor[u.role] || 'bg-gray-100 text-gray-700 ring-gray-200'}>{roleLabel[u.role] || u.role}</Badge>
                        <StateBadge u={u} />
                      </div>
                    </div>
                  </div>
                  {actionFor(u, true)}
                </div>
              );
            })}
          </div>
        )}

      {hasMore && <LoadMore shown={users.length} total={total && !search && !role ? total : Infinity} loading={loadingMore}
        onMore={() => fetchUsers({ append: true, offset: users.length })} />}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إنشاء حساب جديد" subtitle="زبون أو مدير" icon={<FiUserPlus />}>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <button onClick={() => { setShowCreate(false); navigate('/drivers?new=1'); }} className="group rounded-2xl bg-gradient-to-br from-violet-50 to-white ring-1 ring-violet-100 text-violet-700 p-3.5 text-right hover:ring-violet-200 hover:shadow-soft">
            <span className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center mb-2"><FiTruck /></span>
            <p className="font-black text-sm flex items-center justify-between">سائق جديد <FiArrowLeft className="opacity-50 group-hover:-translate-x-0.5 transition-transform" /></p>
            <p className="text-[10.5px] text-violet-500 leading-snug mt-0.5">من صفحة السائقين (مع بيانات المركبة)</p>
          </button>
          <button onClick={() => { setShowCreate(false); navigate('/restaurants?new=1'); }} className="group rounded-2xl bg-gradient-to-br from-green-50 to-white ring-1 ring-green-100 text-green-700 p-3.5 text-right hover:ring-green-200 hover:shadow-soft">
            <span className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center mb-2"><FiShoppingBag /></span>
            <p className="font-black text-sm flex items-center justify-between">مطعم / متجر <FiArrowLeft className="opacity-50 group-hover:-translate-x-0.5 transition-transform" /></p>
            <p className="text-[10.5px] text-green-600 leading-snug mt-0.5">من صفحة المطاعم (ينشئ المتجر وحساب صاحبه)</p>
          </button>
        </div>
        <form onSubmit={createUser} className="space-y-3.5">
          <Field label="نوع الحساب" as="group">
            <Segmented full value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} options={[['customer', 'زبون'], ['admin', 'مدير']]} />
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
