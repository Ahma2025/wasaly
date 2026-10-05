import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FiSettings, FiPower, FiPrinter, FiImage, FiMapPin, FiNavigation, FiClock, FiInfo, FiSave, FiBluetooth,
  FiWifi, FiLink, FiCheckCircle, FiAlertTriangle, FiX,
} from 'react-icons/fi';
import { FaUsb } from 'react-icons/fa';
import { MdStorefront } from 'react-icons/md';
import api from '../utils/api';
import * as Printer from '../utils/printer';
import L, { TILE_URL, TILE_ATTR } from '../utils/leaflet';
import { useRestaurant } from '../context/RestaurantContext';
import { PageHeader, Spinner } from '../components/ui';

function compressToBase64(file, maxPx = 500, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('فشل تحميل الصورة')); };
    img.src = url;
  });
}

// خريطة تفاعلية (Leaflet مدمج — بدون CDN): اضغط أو اسحب الدبوس
function LocationPicker({ lat, lng, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const startLat = parseFloat(lat) || 32.3130;
    const startLng = parseFloat(lng) || 35.0290;
    const map = L.map(containerRef.current).setView([startLat, startLng], 14);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
    const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
    mapRef.current = map; markerRef.current = marker;
    const commit = (ll) => onPickRef.current(ll.lat.toFixed(6), ll.lng.toFixed(6));
    map.on('click', (e) => { marker.setLatLng(e.latlng); commit(e.latlng); });
    marker.on('dragend', () => commit(marker.getLatLng()));
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const la = parseFloat(lat); const ln = parseFloat(lng);
    if (mapRef.current && markerRef.current && Number.isFinite(la) && Number.isFinite(ln)) {
      markerRef.current.setLatLng([la, ln]);
      mapRef.current.setView([la, ln]);
    }
  }, [lat, lng]);

  return <div ref={containerRef} className="rounded-2xl overflow-hidden border border-gray-200" style={{ width: '100%', height: 240, zIndex: 0 }} />;
}

const toForm = (r) => ({
  name_ar: r.name_ar || '',
  description_ar: r.description_ar || '',
  phone: r.phone || '',
  address: r.address || '',
  min_order: r.min_order ?? '',
  delivery_time_min: r.delivery_time_min ?? '',
  delivery_time_max: r.delivery_time_max ?? '',
  opens_at: (r.opens_at || '').slice(0, 5),
  closes_at: (r.closes_at || '').slice(0, 5),
  logo: r.logo || '',
  lat: r.lat ?? '',
  lng: r.lng ?? '',
});

// قيم فارغة → null (أعمدة الأرقام والوقت في قاعدة البيانات ترفض النص الفارغ)
const sOrNull = (v) => { const s = String(v ?? '').trim(); return s ? s : null; };
const nOrNull = (v) => { const s = String(v ?? '').trim(); if (!s) return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const iOrNull = (v) => { const n = nOrNull(v); return n == null ? null : Math.round(n); };

export default function Settings() {
  const { restaurant, setRestaurant, refresh } = useRestaurant();
  const [form, setForm] = useState(() => toForm(restaurant));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // مزامنة النموذج مع بيانات السيرفر طالما لم يبدأ المستخدم بالتعديل
  useEffect(() => { if (!dirty) setForm(toForm(restaurant)); }, [restaurant]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => { const v = e?.target ? e.target.value : e; setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  const uploadLogo = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('اختر ملف صورة');
    setUploadingLogo(true);
    try {
      let url = null;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
        url = r?.url || null;
      } catch { /* نرجع للضغط المحلي */ }
      if (!url) url = await compressToBase64(file);
      setForm(f => ({ ...f, logo: url })); setDirty(true);
      toast.success('تم رفع الشعار — اضغط «حفظ» لتثبيته');
    } catch { toast.error('فشل رفع الصورة'); }
    finally { setUploadingLogo(false); }
  };

  const save = async () => {
    if (!restaurant.id) return toast.error('لم يتم تحديد المطعم');
    if (!form.name_ar.trim()) return toast.error('اسم المطعم مطلوب');
    const lat = nOrNull(form.lat); const lng = nOrNull(form.lng);
    if (String(form.lat).trim() && (lat == null || lat < -90 || lat > 90)) return toast.error('خط العرض غير صحيح (بين -90 و90)');
    if (String(form.lng).trim() && (lng == null || lng < -180 || lng > 180)) return toast.error('خط الطول غير صحيح (بين -180 و180)');
    const minOrder = nOrNull(form.min_order);
    if (minOrder != null && minOrder < 0) return toast.error('الحد الأدنى للطلب لا يمكن أن يكون سالبًا');
    const tmin = iOrNull(form.delivery_time_min); const tmax = iOrNull(form.delivery_time_max);
    if ((tmin != null && tmin < 0) || (tmax != null && tmax < 0)) return toast.error('مدة التوصيل لا يمكن أن تكون سالبة');
    if (tmin != null && tmax != null && tmin > tmax) return toast.error('مدة التوصيل «من» يجب أن تكون أقل من «إلى»');

    setSaving(true);
    try {
      const payload = {
        name_ar: form.name_ar.trim(),
        description_ar: sOrNull(form.description_ar),
        phone: sOrNull(form.phone),
        address: sOrNull(form.address),
        min_order: minOrder,
        delivery_time_min: tmin,
        delivery_time_max: tmax,
        opens_at: sOrNull(form.opens_at),
        closes_at: sOrNull(form.closes_at),
        logo: form.logo || null,
        lat, lng,
      };
      const r = await api.put(`/restaurants/${restaurant.id}`, payload);
      setRestaurant(prev => ({ ...prev, ...payload, ...(r?.data || {}) }));
      setDirty(false);
      toast.success('تم حفظ الإعدادات');
    } catch (e) { toast.error(e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const toggleOpen = async () => {
    if (!restaurant.id) return;
    setToggling(true);
    try {
      const r = await api.patch(`/restaurants/${restaurant.id}/toggle`);
      const isOpen = r?.is_open ?? r?.data?.is_open ?? !restaurant.is_open;
      setRestaurant({ is_open: isOpen });
      toast.success(isOpen ? 'المطعم الآن مفتوح' : 'المطعم الآن مغلق');
    } catch (e) { toast.error(e.message || 'فشل'); }
    finally { setToggling(false); }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return toast.error('الجهاز لا يدعم تحديد الموقع');
    const t = toast.loading('جاري تحديد موقعك…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })); setDirty(true);
        toast.success('تم تحديد موقعك — اضغط «حفظ»', { id: t });
      },
      (err) => toast.error(err.code === 1 ? 'اسمح للتطبيق بالوصول للموقع من إعدادات الجهاز' : 'فشل تحديد الموقع، حاول مرة أخرى', { id: t }),
      { timeout: 12000, enableHighAccuracy: true }
    );
  };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <PageHeader title="الإعدادات" icon={FiSettings} subtitle="بيانات مطعمك وماكنة الطلبات" />

      {/* فتح / إغلاق */}
      <div className={`rounded-3xl p-5 text-white relative overflow-hidden sheen ${restaurant.is_open ? 'bg-gradient-to-l from-emerald-500 to-emerald-600' : 'bg-gradient-to-l from-gray-600 to-gray-700'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl glass flex items-center justify-center"><FiPower size={20} aria-hidden /></div>
            <div>
              <p className="font-black text-lg leading-tight">{restaurant.is_open ? 'المطعم مفتوح' : 'المطعم مغلق'}</p>
              <p className="text-white/85 text-xs mt-1">{restaurant.is_open ? 'الزبائن يستطيعون الطلب الآن' : 'الطلبات متوقفة حاليًا'}</p>
            </div>
          </div>
          <button onClick={toggleOpen} disabled={toggling} role="switch" aria-checked={!!restaurant.is_open} aria-label="فتح أو إغلاق المطعم"
            className={`relative w-16 h-9 rounded-full transition-colors flex-shrink-0 ${restaurant.is_open ? 'bg-white/35' : 'bg-black/25'}`}>
            <span className={`absolute top-1 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center transition-all ${restaurant.is_open ? 'right-1' : 'right-8'}`}>
              {toggling && <Spinner size={13} className="text-gray-500" />}
            </span>
          </button>
        </div>
      </div>

      <PrinterSetup restaurant={restaurant} />

      {/* معلومات المطعم */}
      <section className="card p-4 space-y-4">
        <h2 className="section-title"><MdStorefront className="text-brand-500" /> معلومات المطعم</h2>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => logoInputRef.current?.click()} aria-label="رفع شعار المطعم"
            className="w-20 h-20 rounded-2xl bg-brand-50 border-2 border-dashed border-brand-200 flex items-center justify-center overflow-hidden flex-shrink-0 text-brand-400">
            {uploadingLogo ? <Spinner size={22} className="text-brand-500" />
              : form.logo ? <img src={form.logo} className="w-full h-full object-cover" alt="شعار المطعم" />
              : <FiImage size={26} />}
          </button>
          <div className="flex-1 space-y-1.5">
            <p className="label mb-0">شعار المطعم</p>
            <div className="flex gap-2">
              <button onClick={() => logoInputRef.current?.click()} className="btn-ghost flex-1 text-xs py-2">{uploadingLogo ? 'جاري الرفع…' : form.logo ? 'تغيير الشعار' : 'رفع الشعار'}</button>
              {form.logo && <button onClick={() => { setForm(f => ({ ...f, logo: '' })); setDirty(true); }} className="btn-danger px-3 py-2" aria-label="إزالة الشعار"><FiX size={14} /></button>}
            </div>
            <p className="text-[11px] text-gray-400">صورة مربعة واضحة — تظهر للزبائن في التطبيق</p>
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { uploadLogo(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div>
          <label className="label" htmlFor="s-name">اسم المطعم *</label>
          <input id="s-name" className="input" value={form.name_ar} onChange={set('name_ar')} />
        </div>
        <div>
          <label className="label" htmlFor="s-desc">وصف المطعم</label>
          <textarea id="s-desc" className="input" rows={3} placeholder="وصف مختصر للمطعم ومميزاته…" value={form.description_ar} onChange={set('description_ar')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="s-phone">رقم الهاتف</label>
            <input id="s-phone" className="input" type="tel" dir="ltr" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="label" htmlFor="s-addr">العنوان</label>
            <input id="s-addr" className="input" value={form.address} onChange={set('address')} />
          </div>
        </div>
      </section>

      {/* الموقع */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title"><FiMapPin className="text-brand-500" /> موقع المطعم</h2>
          <button onClick={detectLocation} className="btn bg-sky-500 text-white text-xs px-3 py-2"><FiNavigation size={13} /> موقعي الآن</button>
        </div>
        <p className="text-xs text-gray-400">اضغط على الخريطة أو اسحب الدبوس لتحديد موقع مطعمك بدقة — يُستخدم لحساب التوصيل وتوجيه السائق</p>
        <LocationPicker lat={form.lat} lng={form.lng} onPick={(la, ln) => { setForm(f => ({ ...f, lat: la, lng: ln })); setDirty(true); }} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block" htmlFor="s-lat">خط العرض (lat)</label>
            <input id="s-lat" className="input" type="number" step="any" dir="ltr" placeholder="32.31300" value={form.lat} onChange={set('lat')} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block" htmlFor="s-lng">خط الطول (lng)</label>
            <input id="s-lng" className="input" type="number" step="any" dir="ltr" placeholder="35.02900" value={form.lng} onChange={set('lng')} />
          </div>
        </div>
      </section>

      {/* التوصيل والأوقات */}
      <section className="card p-4 space-y-4">
        <h2 className="section-title"><FiClock className="text-brand-500" /> الطلبات والأوقات</h2>
        <div>
          <label className="label" htmlFor="s-min">الحد الأدنى للطلب (₪)</label>
          <input id="s-min" className="input" type="number" min="0" inputMode="decimal" placeholder="بدون حد أدنى" value={form.min_order} onChange={set('min_order')} />
        </div>
        <div>
          <p className="label">مدة التوصيل المتوقعة للزبون (بالدقائق)</p>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" min="0" inputMode="numeric" placeholder="من (مثال 25)" aria-label="مدة التوصيل من" value={form.delivery_time_min} onChange={set('delivery_time_min')} />
            <input className="input" type="number" min="0" inputMode="numeric" placeholder="إلى (مثال 40)" aria-label="مدة التوصيل إلى" value={form.delivery_time_max} onChange={set('delivery_time_max')} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">تظهر للزبون كوقت وصول الطلب (التحضير + التوصيل)</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="s-open">ساعة الافتتاح</label>
            <input id="s-open" className="input" type="time" value={form.opens_at} onChange={set('opens_at')} />
          </div>
          <div>
            <label className="label" htmlFor="s-close">ساعة الإغلاق</label>
            <input id="s-close" className="input" type="time" value={form.closes_at} onChange={set('closes_at')} />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 flex items-start gap-1.5"><FiInfo className="mt-0.5 flex-shrink-0" /> ساعات العمل للعرض فقط — افتح أو أغلق المطعم يدويًا من الزر بالأعلى.</p>
      </section>

      {/* الحساب */}
      <section className="card p-4">
        <h2 className="section-title mb-3"><FiInfo className="text-brand-500" /> معلومات الحساب</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-gray-500">المدينة</dt><dd className="font-semibold text-gray-800">{restaurant.city || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">التقييم</dt><dd className="font-semibold text-gray-800">{parseFloat(restaurant.rating || 0).toFixed(1)} ★</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">حالة الحساب</dt>
            <dd className={`font-semibold ${restaurant.is_active === false ? 'text-rose-500' : 'text-emerald-600'}`}>{restaurant.is_active === false ? 'غير مفعّل' : 'مفعّل'}</dd></div>
        </dl>
      </section>

      {/* شريط الحفظ */}
      {/* pl-16: ترك مكان لزر الدعم العائم على اليسار */}
      <div className="sticky z-30 pl-16" style={{ bottom: 'calc(var(--nav-h) + var(--sab) + 12px)' }}>
        <button onClick={save} disabled={saving}
          className={`btn-primary w-full py-4 text-base rounded-2xl ${dirty ? '' : 'opacity-90'}`}>
          {saving ? <><Spinner size={16} /> جاري الحفظ…</> : <><FiSave aria-hidden /> {dirty ? 'حفظ التغييرات' : 'حفظ الإعدادات'}</>}
        </button>
      </div>
    </div>
  );
}

// ═══ ربط ماكنة الطلبات — إعداد ذاتي لكل جهاز ═══
function PrinterSetup({ restaurant }) {
  const supported = Printer.isPrinterSupported();
  const [saved, setSaved] = useState(Printer.getSavedPrinter());
  const [auto, setAuto] = useState(Printer.isAutoPrint());
  const [paper, setPaper] = useState(Printer.getPaperSize());
  const [scanning, setScanning] = useState(null);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tcp, setTcp] = useState(null); // {ip, port}
  const [permIssue, setPermIssue] = useState(false);

  const handleError = (prefix, e) => {
    const err = Printer.printerError(e);
    setPermIssue(!!err.needsSettings);
    toast.error(`${prefix}: ${err.message}`, { duration: 7000 });
  };

  const scan = async (type) => {
    if (type === 'tcp') { setTcp({ ip: '', port: '9100' }); setList([]); return; }
    setTcp(null); setScanning(type); setList([]); setPermIssue(false);
    try {
      const found = await Printer.listPrinters(type);
      if (!found.length) {
        toast(type === 'bluetooth' ? 'لا توجد ماكنات مقترنة — اقرن الماكنة أولًا من إعدادات البلوتوث في الجهاز' : 'لم نجد ماكنة USB — تأكد من توصيل الكابل وتشغيل الماكنة', { icon: 'ℹ️', duration: 6000 });
      }
      setList(found);
    } catch (e) { handleError('فشل البحث', e); }
    finally { setScanning(null); }
  };

  const choose = async (p) => {
    if (p.type === 'usb') {
      const ok = await Printer.ensureUsbPermission(p.address);
      if (!ok) return toast.error('يجب الموافقة على إذن استخدام ماكنة الـ USB');
    }
    Printer.savePrinter(p); setSaved(p); setList([]); setTcp(null);
    toast.success('تم ربط: ' + p.name);
  };

  const saveTcp = () => {
    const ip = (tcp?.ip || '').trim();
    const port = parseInt(tcp?.port) || 9100;
    if (!Printer.isValidIp(ip)) return toast.error('عنوان IP غير صحيح — مثال: 192.168.1.50');
    if (port < 1 || port > 65535) return toast.error('رقم المنفذ غير صحيح');
    choose(Printer.makeNetworkPrinter(ip, port));
  };

  const unlink = () => { Printer.clearPrinter(); setSaved(null); toast('تم فصل الماكنة', { icon: '🔌' }); };
  const toggleAuto = () => { const v = !auto; setAuto(v); Printer.setAutoPrint(v); };
  const changePaper = (v) => { setPaper(v); Printer.setPaperSize(v); };
  const doTest = async () => {
    setBusy(true); setPermIssue(false);
    try { await Printer.testPrint(restaurant); toast.success('تمت الطباعة التجريبية'); }
    catch (e) { handleError('فشلت الطباعة', e); }
    finally { setBusy(false); }
  };

  const typeLabel = (t) => (t === 'bluetooth' ? 'بلوتوث' : t === 'usb' ? 'USB' : 'شبكة');

  return (
    <section className="card p-4 space-y-3">
      <h2 className="section-title"><FiPrinter className="text-brand-500" /> ماكنة الطلبات</h2>

      {!supported ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800 font-semibold leading-relaxed flex gap-2">
          <FiInfo className="mt-1 flex-shrink-0" aria-hidden />
          <span>لربط ماكنة الطلبات افتح <b>تطبيق بوابة المطعم على جهاز أندرويد</b> (تابلت/موبايل) الموصول بالماكنة — الطباعة غير متاحة من المتصفح.</span>
        </div>
      ) : (
        <>
          <div>
            <p className="label">عرض الورق</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(Printer.PAPERS).map(([k, p]) => (
                <button key={k} onClick={() => changePaper(k)} aria-pressed={paper === k}
                  className={`rounded-xl py-2.5 text-sm font-bold border ${paper === k ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}>{p.label}</button>
              ))}
            </div>
          </div>

          {saved ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FiCheckCircle className="text-emerald-600 flex-shrink-0" size={20} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-emerald-800 truncate">{saved.name}</p>
                    <p className="text-xs text-emerald-700 mt-0.5">مربوطة عبر {typeLabel(saved.type)}</p>
                  </div>
                </div>
                <button onClick={unlink} className="btn-danger text-xs px-3 py-1.5">فصل</button>
              </div>
              <label className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-3 cursor-pointer">
                <span className="text-sm font-bold text-gray-700">طباعة كل طلب جديد تلقائيًا</span>
                <input type="checkbox" checked={auto} onChange={toggleAuto} className="w-5 h-5 accent-brand-500" />
              </label>
              <button onClick={doTest} disabled={busy} className="btn-primary w-full py-3">
                {busy ? <><Spinner size={15} /> جاري الطباعة…</> : <><FiPrinter /> طباعة تجريبية</>}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 leading-relaxed">اختر طريقة توصيل الماكنة ثم اخترها من القائمة — مرة واحدة ويتذكرها الجهاز.</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => scan('bluetooth')} disabled={!!scanning} className="btn-ghost flex-col py-3 gap-1 text-xs">
                  {scanning === 'bluetooth' ? <Spinner size={18} /> : <FiBluetooth size={20} className="text-sky-500" />} بلوتوث
                </button>
                <button onClick={() => scan('usb')} disabled={!!scanning} className="btn-ghost flex-col py-3 gap-1 text-xs">
                  {scanning === 'usb' ? <Spinner size={18} /> : <FaUsb size={20} className="text-gray-600" />} USB
                </button>
                <button onClick={() => scan('tcp')} disabled={!!scanning} className="btn-ghost flex-col py-3 gap-1 text-xs">
                  <FiWifi size={20} className="text-emerald-500" /> شبكة
                </button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">للبلوتوث: اقرن الماكنة أولًا من إعدادات الجهاز. في أندرويد 12 وأحدث سيطلب التطبيق إذن «الأجهزة القريبة» — اضغط «سماح».</p>

              {tcp && (
                <div className="bg-gray-50 rounded-2xl p-3 space-y-2 animate-fade-up">
                  <div className="grid grid-cols-3 gap-2">
                    <input className="input col-span-2" dir="ltr" inputMode="decimal" placeholder="192.168.1.50" aria-label="عنوان IP" value={tcp.ip} onChange={e => setTcp({ ...tcp, ip: e.target.value })} />
                    <input className="input" dir="ltr" inputMode="numeric" placeholder="9100" aria-label="المنفذ" value={tcp.port} onChange={e => setTcp({ ...tcp, port: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveTcp} className="btn-primary flex-1"><FiLink size={14} /> ربط</button>
                    <button onClick={() => setTcp(null)} className="btn-ghost px-4">إلغاء</button>
                  </div>
                </div>
              )}

              {list.map((p, i) => (
                <button key={i} onClick={() => choose(p)} className="w-full flex items-center justify-between bg-gray-50 hover:bg-brand-50 border border-gray-200 hover:border-brand-200 rounded-xl px-3 py-3">
                  <span className="text-sm font-bold text-gray-800 flex items-center gap-2">{p.type === 'bluetooth' ? <FiBluetooth className="text-sky-500" /> : <FaUsb />} {p.name}</span>
                  <span className="text-xs font-black text-brand-600">اختيار</span>
                </button>
              ))}
            </>
          )}

          {permIssue && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-bold text-rose-700 flex items-start gap-1.5"><FiAlertTriangle className="mt-0.5 flex-shrink-0" /> التطبيق يحتاج إذن «الأجهزة القريبة» للوصول للماكنة.</p>
              <button onClick={Printer.openAppSettings} className="btn bg-rose-500 text-white w-full text-xs py-2">فتح إعدادات التطبيق</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
