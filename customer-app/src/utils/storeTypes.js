// أقسام المتاجر — نسخة محلية مطابقة لـ backend/utils/storeTypes.js
// تُدمج مع GET /store-types (العدد + أي قسم جديد يضيفه الخادم لاحقاً)
import api from './api';
import { readCache, writeCache } from './cache';

export const LOCAL_STORE_TYPES = [
  { key: 'restaurant',  name: 'مطاعم',             emoji: '🍽️', icon: 'restaurant',     color: '#FF6B00' },
  { key: 'supermarket', name: 'سوبرماركت',         emoji: '🛒', icon: 'cart',           color: '#2E9E44' },
  { key: 'grocery',     name: 'بقالة',             emoji: '🧺', icon: 'basket',         color: '#7A9A12' },
  { key: 'pharmacy',    name: 'صيدليات',           emoji: '💊', icon: 'medkit',         color: '#2F7FE0' },
  { key: 'telecom',     name: 'اتصالات وموبايلات', emoji: '📱', icon: 'phone-portrait', color: '#5B5BD6' },
  { key: 'pets',        name: 'حيوانات أليفة',      emoji: '🐾', icon: 'paw',            color: '#C77A12' },
  { key: 'sweets',      name: 'حلويات ومخابز',      emoji: '🧁', icon: 'ice-cream',      color: '#E0457B' },
  { key: 'flowers',     name: 'ورد وهدايا',         emoji: '💐', icon: 'flower',         color: '#D63A5E' },
  { key: 'beauty',      name: 'عطور وتجميل',        emoji: '💄', icon: 'sparkles',       color: '#A240C9' },
];
const LOCAL_BY_KEY = Object.fromEntries(LOCAL_STORE_TYPES.map(t => [t.key, t]));
const FALLBACK_COLOR = '#8E44C9';

/** يطبّع store_type إلى مفتاح (market القديمة = supermarket؛ الفارغ = restaurant) */
export const normStoreType = (v) => {
  const k = String(v || '').trim().toLowerCase();
  if (!k) return 'restaurant';
  return k === 'market' ? 'supermarket' : k;
};

/** بيانات العرض لقسم (من القائمة المدمجة أو المحلية، أو افتراضي عام لقسم غير معروف) */
export const storeTypeMeta = (key, list) => {
  const k = normStoreType(key);
  return (list || []).find(t => t.key === k) || LOCAL_BY_KEY[k] || { key: k, name: 'متجر', emoji: '🏪', icon: null, color: FALLBACK_COLOR };
};

// يدمج رد الخادم مع المحلي: الاسم/الإيموجي من الخادم، الأيقونة/اللون محلياً، count من الخادم (null = غير معروف)
export const mergeStoreTypes = (server) => {
  if (!Array.isArray(server) || !server.length) return LOCAL_STORE_TYPES.map(t => ({ ...t, count: null }));
  const out = server.filter(s => s && s.key).map(s => {
    const l = LOCAL_BY_KEY[s.key] || {};
    return {
      key: s.key, name: s.name_ar || l.name || s.key, emoji: s.emoji || l.emoji || '🏪',
      icon: l.icon || null, color: l.color || FALLBACK_COLOR, count: Number.isFinite(Number(s.count)) ? Number(s.count) : null,
    };
  });
  return out.length ? out : LOCAL_STORE_TYPES.map(t => ({ ...t, count: null }));
};

export const readStoreTypesCache = async () => {
  const c = await readCache('store_types');
  return c ? mergeStoreTypes(c) : null;
};

/** يجلب الأقسام من الخادم (ويخزّنها)؛ عند الفشل يرجّع الكاش أو المحلي */
export const fetchStoreTypes = async () => {
  try {
    const r = await api.get('/store-types');
    if (Array.isArray(r?.data) && r.data.length) { writeCache('store_types', r.data); return mergeStoreTypes(r.data); }
  } catch { /* fallback */ }
  return (await readStoreTypesCache()) || mergeStoreTypes(null);
};
