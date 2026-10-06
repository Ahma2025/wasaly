// مصدر واحد لعناوين السيرفر (كانت مكرّرة في ٥ ملفات)
export const SERVER_URL = 'https://burger-app-production.up.railway.app';
export const API_BASE = `${SERVER_URL}/api`;
export const SOCKET_URL = SERVER_URL;

// مدة عرض الطلب الافتراضية إن لم يرسل السيرفر expires_at / offer_seconds
export const DEFAULT_OFFER_SECONDS = 45;
// أقل فاصل بين رفعات الموقع أثناء التوصيل (سوكِت + REST)
export const LOCATION_UPLOAD_MS = 5000;
export const ADMIN_PHONE = '0599039704';
// واتساب الإدارة (صيغة دولية بدون + أو أصفار) — مشتق من رقم الدعم
export const ADMIN_WHATSAPP = `970${ADMIN_PHONE.replace(/^0/, '')}`;

// تتبّع الموقع بالخلفية على أندرويد (خدمة أمامية) — موقوف مؤقتاً لحين تقديم إقرار Google Play (فيديو).
// لإعادة تفعيله: true + إرجاع إذن FOREGROUND_SERVICE_LOCATION في AndroidManifest.
export const ANDROID_BACKGROUND_TRACKING = false;
