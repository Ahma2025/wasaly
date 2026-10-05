// مرجع تنقّل عام — للتنقّل من خارج الشاشات (إشعارات، إلغاء طلب، ...)
import { createNavigationContainerRef } from '@react-navigation/native';

export const navRef = createNavigationContainerRef();

let readyResolvers = [];
export function markNavReady() {
  readyResolvers.forEach(r => r());
  readyResolvers = [];
}
export function whenNavReady() {
  if (navRef.isReady()) return Promise.resolve();
  return new Promise(r => readyResolvers.push(r));
}

export function currentRoute() {
  try { return navRef.isReady() ? navRef.getCurrentRoute() : null; } catch { return null; }
}

export function navigate(name, params) {
  if (navRef.isReady()) navRef.navigate(name, params);
}

// إغلاق شاشة التوصيل إن كانت مفتوحة لهذا الطلب
export function closeDeliveryFor(orderId) {
  const r = currentRoute();
  if (r?.name === 'Delivery' && (orderId == null || String(r.params?.orderId) === String(orderId))) {
    if (navRef.canGoBack()) navRef.goBack();
    else navRef.navigate('Main');
    return true;
  }
  return false;
}
