import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FiSettings, FiPower, FiPrinter, FiMapPin, FiNavigation, FiClock, FiInfo, FiSave, FiBluetooth,
  FiWifi, FiLink, FiCheckCircle, FiAlertTriangle, FiX, FiCamera, FiMonitor, FiCheck, FiStar, FiShield, FiMousePointer,
} from 'react-icons/fi';
import { FaUsb } from 'react-icons/fa';
import { MdStorefront } from 'react-icons/md';
import api from '../utils/api';
import * as Printer from '../utils/printer';
import L, { TILE_URL, TILE_ATTR } from '../utils/leaflet';
import { useRestaurant } from '../context/RestaurantContext';
import { PageHeader, Spinner, Toggle, Button, CardHeader, cx } from '../components/ui';

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
function LocationPicker({ lat, lng, onPick, onLocate }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const startLat = parseFloat(lat) || 32.3130;
    const startLng = parseFloat(lng) || 35.0290;
    const map = L.map(containerRef.current, { zoomControl: false }).setView([startLat, startLng], 14);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
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

  const has = Number.isFinite(parseFloat(lat)) && Number.isFinite(parseFloat(lng));
  return (
    <div className="relative isolate rounded-[20px] overflow-hidden border border-surface-line shadow-soft">
      <div ref={containerRef} style={{ width: '100%', height: 280, zIndex: 0 }} />
      {/* واجهة فوق الخريطة */}
      <div className="absolute top-3 inset-x-3 z-[500] flex items-start justify-between gap-2 pointer-events-none">
        <span className="glass-light rounded-full px-3 h-9 text-[12px] font-bold text-ink-2 flex items-center gap-1.5 shadow-soft">
          <FiMousePointer size={13} className="text-brand-600" aria-hidden /> اضغط أو اسحب الدبوس
        </span>
        <button type="button" onClick={onLocate} className="pointer-events-auto h-9 px-3 rounded-full bg-info text-white text-[12px] font-extrabold flex items-center gap-1.5 shadow-[0_8px_18px_rgba(46,144,250,.35)]">
          <FiNavigation size={13} aria-hidden /> موقعي الآن
        </button>
      </div>
      <div className="absolute bottom-7 start-3 z-[500] pointer-events-none">
        <span dir="ltr" className={cx('glass-light rounded-full px-3 h-8 text-[11.5px] font-bold flex items-center gap-1.5 shadow-soft tnum', has ? 'text-ink-2' : 'text-amber-700')}>
          <FiMapPin size={12} className={has ? 'text-brand-600' : ''} aria-hidden />
          {has ? `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}` : 'لم يُحدَّد بعد'}
        </span>
      </div>
    </div>
  );
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

function Suffixed({ suffix, children }) {
  return (
    <div className="relative">
      {children}
      <span className="absolute end-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-ink-3 pointer-events-none">{suffix}</span>
    </div>
  );
}

export default function Settings() {
  const { restaurant, setRestaurant, refresh } = useRestaurant();
  const [form, setForm] = useState(() => toForm(restaurant));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // مزامنة النموذج مع بيانات السيرفر طالما لم يبدأ المستخدم بالتعديل
  useEffect(() => { if (!dirty) setForm(toForm(restaurant)); }, [restaurant]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!justSaved) return; const t = setTimeout(() => setJustSaved(false), 1800); return () => clearTimeout(t); }, [justSaved]);

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
      setJustSaved(true);
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

  const isOpen = !!restaurant.is_open;

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader title="الإعدادات" icon={FiSettings} subtitle="بيانات مطعمك وماكنة الطلبات" />

      {/* ─── فتح / إغلاق ─── */}
      <section className={cx('rounded-[24px] p-5 text-white sheen',
        isOpen ? 'bg-gradient-to-l from-emerald-500 to-[#1DB954] shadow-[0_14px_32px_rgba(29,185,84,.28)]' : 'bg-gradient-to-l from-[#4E4B66] to-[#14142B] shadow-card')}>
        <div className="relative z-[1] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cx('w-12 h-12 rounded-[16px] glass flex items-center justify-center flex-shrink-0', isOpen && 'live-dot')}><FiPower size={22} aria-hidden /></div>
            <div className="min-w-0">
              <p className="font-extrabold text-[19px] leading-tight">{isOpen ? 'المطعم مفتوح' : 'المطعم مغلق'}</p>
              <p className="text-white/85 text-[12.5px] mt-1">{isOpen ? 'الزبائن يستطيعون الطلب الآن' : 'الطلبات متوقفة حاليًا — افتح لاستقبال الطلبات'}</p>
            </div>
          </div>
          <Toggle size="lg" tone="light" checked={isOpen} busy={toggling} onChange={toggleOpen} label="فتح أو إغلاق المطعم" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12 items-start">
        <div className="min-w-0 space-y-4 lg:col-span-7 xl:col-span-8 lg:order-1 order-2">
          {/* معلومات المطعم */}
          <section className="card p-4 lg:p-5">
            <CardHeader icon={MdStorefront} title="معلومات المطعم" hint="تظهر للزبائن في تطبيق وصلّي" />
            <div className="flex items-center gap-4 mb-4">
              <button type="button" onClick={() => logoInputRef.current?.click()} aria-label="رفع شعار المطعم"
                className="no-press relative w-[88px] h-[88px] rounded-[24px] flex-shrink-0 group">
                <span className={cx('absolute inset-0 rounded-[24px] overflow-hidden flex items-center justify-center', form.logo ? 'bg-surface' : 'bg-brand-50 border-2 border-dashed border-brand-200 text-brand-400')}>
                  {uploadingLogo ? <Spinner size={22} className="text-brand-500" />
                    : form.logo ? <img src={form.logo} className="w-full h-full object-cover" alt="شعار المطعم" />
                    : <MdStorefront size={32} />}
                </span>
                <span className="absolute -bottom-1.5 -start-1.5 w-9 h-9 rounded-full grad-brand text-white flex items-center justify-center ring-4 ring-white shadow-brand group-hover:scale-110 transition-transform"><FiCamera size={15} aria-hidden /></span>
              </button>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="font-extrabold text-ink">شعار المطعم</p>
                <p className="text-[12px] text-ink-3 leading-relaxed">صورة مربعة واضحة — تظهر للزبائن في التطبيق</p>
                <div className="flex gap-2">
                  <button onClick={() => logoInputRef.current?.click()} className="btn-soft h-9 px-3 text-xs">{uploadingLogo ? 'جاري الرفع…' : form.logo ? 'تغيير الشعار' : 'رفع الشعار'}</button>
                  {form.logo && <button onClick={() => { setForm(f => ({ ...f, logo: '' })); setDirty(true); }} className="btn-danger h-9 px-3 text-xs" aria-label="إزالة الشعار"><FiX size={14} /> إزالة</button>}
                </div>
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { uploadLogo(e.target.files?.[0]); e.target.value = ''; }} />
            </div>

            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="s-name">اسم المطعم <span className="text-coral">*</span></label>
                <input id="s-name" className="input" value={form.name_ar} onChange={set('name_ar')} />
              </div>
              <div>
                <label className="label" htmlFor="s-desc">وصف المطعم</label>
                <textarea id="s-desc" className="input" rows={3} placeholder="وصف مختصر للمطعم ومميزاته…" value={form.description_ar} onChange={set('description_ar')} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="s-phone">رقم الهاتف</label>
                  <input id="s-phone" className="input tnum" type="tel" dir="ltr" value={form.phone} onChange={set('phone')} />
                </div>
                <div>
                  <label className="label" htmlFor="s-addr">العنوان</label>
                  <input id="s-addr" className="input" value={form.address} onChange={set('address')} />
                </div>
              </div>
            </div>
          </section>

          {/* الموقع */}
          <section className="card p-4 lg:p-5">
            <CardHeader icon={FiMapPin} title="موقع المطعم" hint="لحساب التوصيل وتوجيه السائق" />
            <LocationPicker lat={form.lat} lng={form.lng} onLocate={detectLocation}
              onPick={(la, ln) => { setForm(f => ({ ...f, lat: la, lng: ln })); setDirty(true); }} />
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-[12.5px] font-bold text-ink-3 hover:text-ink flex items-center gap-1.5 select-none">
                <span className="transition-transform group-open:rotate-90">‹</span> إدخال الإحداثيات يدويًا
              </summary>
              <div className="grid grid-cols-2 gap-2 mt-2 animate-fade-up">
                <div>
                  <label className="text-[11px] font-bold text-ink-3 mb-1 block" htmlFor="s-lat">خط العرض (lat)</label>
                  <input id="s-lat" className="input tnum" type="number" step="any" dir="ltr" placeholder="32.31300" value={form.lat} onChange={set('lat')} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-ink-3 mb-1 block" htmlFor="s-lng">خط الطول (lng)</label>
                  <input id="s-lng" className="input tnum" type="number" step="any" dir="ltr" placeholder="35.02900" value={form.lng} onChange={set('lng')} />
                </div>
              </div>
            </details>
          </section>

          {/* التوصيل والأوقات */}
          <section className="card p-4 lg:p-5">
            <CardHeader icon={FiClock} title="الطلبات والأوقات" />
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="s-min">الحد الأدنى للطلب</label>
                <Suffixed suffix="₪"><input id="s-min" className="input pe-10 tnum" type="number" min="0" inputMode="decimal" placeholder="بدون حد أدنى" value={form.min_order} onChange={set('min_order')} /></Suffixed>
              </div>
              <div>
                <p className="label">مدة التوصيل المتوقعة للزبون</p>
                <div className="grid grid-cols-2 gap-3">
                  <Suffixed suffix="دقيقة"><input className="input pe-14 tnum" type="number" min="0" inputMode="numeric" placeholder="من (25)" aria-label="مدة التوصيل من" value={form.delivery_time_min} onChange={set('delivery_time_min')} /></Suffixed>
                  <Suffixed suffix="دقيقة"><input className="input pe-14 tnum" type="number" min="0" inputMode="numeric" placeholder="إلى (40)" aria-label="مدة التوصيل إلى" value={form.delivery_time_max} onChange={set('delivery_time_max')} /></Suffixed>
                </div>
                <p className="text-[11.5px] text-ink-3 mt-1.5">تظهر للزبون كوقت وصول الطلب (التحضير + التوصيل)</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="s-open">ساعة الافتتاح</label>
                  <input id="s-open" className="input tnum" type="time" value={form.opens_at} onChange={set('opens_at')} />
                </div>
                <div>
                  <label className="label" htmlFor="s-close">ساعة الإغلاق</label>
                  <input id="s-close" className="input tnum" type="time" value={form.closes_at} onChange={set('closes_at')} />
                </div>
              </div>
              <p className="text-[12px] text-ink-2 flex items-start gap-2 bg-info-soft rounded-[14px] p-3"><FiInfo className="mt-0.5 flex-shrink-0 text-info" aria-hidden /> ساعات العمل للعرض فقط — افتح أو أغلق المطعم يدويًا من الزر بالأعلى.</p>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-5 xl:col-span-4 lg:order-2 order-1 lg:sticky lg:top-24">
          <PrinterSetup restaurant={restaurant} />

          {/* الحساب */}
          <section className="card p-4 lg:p-5">
            <CardHeader icon={FiShield} title="معلومات الحساب" />
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[14px] bg-surface p-3">
                <dt className="text-[11px] font-bold text-ink-3">المدينة</dt>
                <dd className="font-extrabold text-ink mt-1 truncate">{restaurant.city || '—'}</dd>
              </div>
              <div className="rounded-[14px] bg-surface p-3">
                <dt className="text-[11px] font-bold text-ink-3">التقييم</dt>
                <dd className="font-extrabold text-ink mt-1 flex items-center justify-center gap-1 tnum">{parseFloat(restaurant.rating || 0).toFixed(1)} <FiStar size={12} className="fill-amber-400 text-amber-400" aria-hidden /></dd>
              </div>
              <div className="rounded-[14px] bg-surface p-3">
                <dt className="text-[11px] font-bold text-ink-3">الحساب</dt>
                <dd className={cx('font-extrabold mt-1', restaurant.is_active === false ? 'text-danger' : 'text-emerald-600')}>{restaurant.is_active === false ? 'غير مفعّل' : 'مفعّل'}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {/* ─── شريط الحفظ ─── */}
      {/* pl-16 (جوال): مكان لزر الدعم العائم على اليسار */}
      <div className="sticky z-30 pl-16 lg:pl-0 lg:max-w-md lg:me-auto" style={{ bottom: 'calc(var(--nav-offset) + 12px)' }}>
        <div className={cx('rounded-[20px] p-1.5 transition-all duration-300', dirty ? 'glass-light shadow-lift border border-white' : '')}>
          {dirty && <p className="text-[11.5px] font-bold text-amber-700 px-2 pb-1.5 flex items-center gap-1.5 animate-fade-in"><span className="w-1.5 h-1.5 rounded-full bg-warning" /> لديك تغييرات غير محفوظة</p>}
          <Button size="lg" loading={saving} success={justSaved} icon={FiSave} onClick={save} block className={cx(!dirty && 'opacity-90')}>
            {dirty ? 'حفظ التغييرات' : 'حفظ الإعدادات'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══ ربط ماكنة الطلبات — إعداد ذاتي لكل جهاز ═══
const CONNECTIONS = [
  { type: 'bluetooth', label: 'بلوتوث', hint: 'ماكنة مقترنة', icon: FiBluetooth, tone: 'text-info bg-info-soft' },
  { type: 'usb', label: 'USB', hint: 'كابل مباشر', icon: FaUsb, tone: 'text-ink-2 bg-surface' },
  { type: 'tcp', label: 'شبكة', hint: 'Wi-Fi / LAN', icon: FiWifi, tone: 'text-success bg-success-soft' },
];

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
  const step = saved ? 3 : 2;
  const STEPS = ['الورق', 'الاتصال', 'اختبار'];

  return (
    <section className="card p-4 lg:p-5">
      <CardHeader icon={FiPrinter} title="ماكنة الطلبات" hint="طباعة الإيصالات لكل طلب"
        action={saved && supported ? <span className="chip bg-success-soft text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-success live-dot" /> متصلة</span> : null} />

      {!supported ? (
        <div className="rounded-[18px] bg-gradient-to-br from-warning-soft to-white border border-warning/30 p-4 text-center">
          <div className="relative w-16 h-16 mx-auto mb-3">
            <span className="absolute inset-0 rounded-[20px] bg-white shadow-soft flex items-center justify-center text-amber-600"><FiMonitor size={26} aria-hidden /></span>
            <span className="absolute -bottom-1 -start-1 w-7 h-7 rounded-full bg-warning text-white flex items-center justify-center ring-4 ring-white"><FiPrinter size={13} aria-hidden /></span>
          </div>
          <p className="text-[13.5px] text-amber-900 font-bold leading-relaxed">
            لربط ماكنة الطلبات افتح <b>تطبيق بوابة المطعم على جهاز أندرويد</b> (تابلت/موبايل) الموصول بالماكنة — الطباعة غير متاحة من المتصفح.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* مؤشّر الخطوات */}
          <ol className="flex items-center gap-2" aria-label="خطوات ربط الماكنة">
            {STEPS.map((s, i) => {
              const n = i + 1; const done = n < step; const cur = n === step;
              return (
                <li key={s} className="flex items-center gap-2 flex-1 last:flex-none">
                  <span className={cx('w-7 h-7 rounded-full text-[12px] font-black flex items-center justify-center flex-shrink-0 transition-all',
                    done ? 'bg-success text-white' : cur ? 'grad-brand text-white shadow-brand' : 'bg-surface text-ink-3')} aria-current={cur ? 'step' : undefined}>
                    {done ? <FiCheck size={13} aria-hidden /> : n}
                  </span>
                  <span className={cx('text-[12px] font-bold whitespace-nowrap', cur ? 'text-ink' : 'text-ink-3')}>{s}</span>
                  {n < STEPS.length && <span className={cx('h-0.5 flex-1 rounded-full', done ? 'bg-success' : 'bg-surface-line')} />}
                </li>
              );
            })}
          </ol>

          <div>
            <p className="label">عرض الورق</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(Printer.PAPERS).map(([k, p]) => (
                <button key={k} onClick={() => changePaper(k)} aria-pressed={paper === k}
                  className={cx('relative rounded-[14px] h-14 text-sm font-extrabold border-[1.5px] flex items-center justify-center gap-2',
                    paper === k ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-surface-line text-ink-2 hover:border-gray-300')}>
                  <span className={cx('rounded-sm border-2', paper === k ? 'border-brand-500' : 'border-ink-3')} style={{ width: k === '80' ? 16 : 11, height: 20 }} aria-hidden />
                  {p.label}
                  {paper === k && <FiCheckCircle className="absolute top-1.5 end-1.5 text-brand-500" size={14} aria-hidden />}
                </button>
              ))}
            </div>
          </div>

          {saved ? (
            <>
              <div className="rounded-[18px] bg-gradient-to-l from-success-soft to-white border border-success/20 p-3.5 flex items-center justify-between gap-2 animate-pop">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-11 h-11 rounded-[14px] bg-success text-white flex items-center justify-center flex-shrink-0 shadow-[0_8px_18px_rgba(29,185,84,.3)]"><FiPrinter size={19} aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-extrabold text-ink truncate">{saved.name}</p>
                    <p className="text-[12px] text-emerald-700 font-bold mt-0.5">مربوطة عبر {typeLabel(saved.type)}</p>
                  </div>
                </div>
                <button onClick={unlink} className="btn-danger h-9 px-3 text-xs">فصل</button>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[14px] bg-surface px-3.5 py-3">
                <span>
                  <span className="block text-[14px] font-bold text-ink">طباعة تلقائية</span>
                  <span className="block text-[11.5px] text-ink-3 mt-0.5">اطبع كل طلب جديد فور وصوله</span>
                </span>
                <Toggle checked={auto} onChange={toggleAuto} label="طباعة كل طلب جديد تلقائيًا" />
              </div>
              <Button loading={busy} icon={FiPrinter} onClick={doTest} block className="h-12">طباعة تجريبية</Button>
            </>
          ) : (
            <>
              <div>
                <p className="label">طريقة التوصيل</p>
                <div className="grid grid-cols-3 gap-2">
                  {CONNECTIONS.map(c => {
                    const Icon = c.icon;
                    const active = (c.type === 'tcp' && tcp) || scanning === c.type;
                    return (
                      <button key={c.type} onClick={() => scan(c.type)} disabled={!!scanning}
                        className={cx('rounded-[16px] border-[1.5px] p-3 flex flex-col items-center gap-1.5 text-center hover:border-brand-300 hover:shadow-soft',
                          active ? 'border-brand-400 bg-brand-50/60' : 'border-surface-line bg-white')}>
                        <span className={cx('w-10 h-10 rounded-[12px] flex items-center justify-center', c.tone)}>
                          {scanning === c.type ? <Spinner size={18} /> : <Icon size={19} aria-hidden />}
                        </span>
                        <span className="text-[13px] font-extrabold text-ink">{c.label}</span>
                        <span className="text-[10.5px] font-bold text-ink-3 leading-tight">{c.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11.5px] text-ink-3 leading-relaxed flex gap-1.5"><FiInfo className="mt-0.5 flex-shrink-0" aria-hidden /> للبلوتوث: اقرن الماكنة أولًا من إعدادات الجهاز. في أندرويد 12 وأحدث سيطلب التطبيق إذن «الأجهزة القريبة» — اضغط «سماح».</p>

              {tcp && (
                <div className="rounded-[18px] bg-surface p-3 space-y-2 animate-fade-up">
                  <div className="grid grid-cols-3 gap-2">
                    <input className="input col-span-2 tnum" dir="ltr" inputMode="decimal" placeholder="192.168.1.50" aria-label="عنوان IP" value={tcp.ip} onChange={e => setTcp({ ...tcp, ip: e.target.value })} />
                    <input className="input tnum" dir="ltr" inputMode="numeric" placeholder="9100" aria-label="المنفذ" value={tcp.port} onChange={e => setTcp({ ...tcp, port: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveTcp} className="btn-primary flex-1"><FiLink size={14} /> ربط</button>
                    <button onClick={() => setTcp(null)} className="btn-ghost px-4">إلغاء</button>
                  </div>
                </div>
              )}

              {list.length > 0 && (
                <div className="space-y-2 stagger">
                  {list.map((p, i) => (
                    <button key={i} onClick={() => choose(p)} className="w-full flex items-center justify-between bg-white hover:bg-brand-50 border-[1.5px] border-surface-line hover:border-brand-200 rounded-[14px] px-3.5 h-14">
                      <span className="text-sm font-bold text-ink flex items-center gap-2.5">{p.type === 'bluetooth' ? <FiBluetooth className="text-info" /> : <FaUsb />} {p.name}</span>
                      <span className="text-xs font-extrabold text-brand-600">اختيار</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {permIssue && (
            <div className="bg-danger-soft border border-danger/20 rounded-[18px] p-3 space-y-2">
              <p className="text-xs font-bold text-danger flex items-start gap-1.5"><FiAlertTriangle className="mt-0.5 flex-shrink-0" /> التطبيق يحتاج إذن «الأجهزة القريبة» للوصول للماكنة.</p>
              <button onClick={Printer.openAppSettings} className="btn bg-danger text-white w-full text-xs h-10">فتح إعدادات التطبيق</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
