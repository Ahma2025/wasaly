import { readCache, writeCache } from './cache';

/*
  سجل محلي للتقييمات (احتياط لو السيرفر ما رجّع rating_* بتفاصيل الطلب المجمّع):
  orders: طلبات انقيّمت · groups: مجموعات انقيّم سائقها (السائق واحد للمجموعة → مرة وحدة)
  مفتاح cache_* → ينمسح مع تسجيل الخروج
*/
const KEY = 'rated_v1';

export async function readRated() {
  const c = await readCache(KEY);
  return {
    orders: Array.isArray(c?.orders) ? c.orders.map(String) : [],
    groups: Array.isArray(c?.groups) ? c.groups.map(String) : [],
  };
}

export async function markRated({ orderId, groupId, driver } = {}) {
  const cur = await readRated();
  if (orderId != null && !cur.orders.includes(String(orderId))) cur.orders = [...cur.orders, String(orderId)].slice(-200);
  if (driver && groupId != null && !cur.groups.includes(String(groupId))) cur.groups = [...cur.groups, String(groupId)].slice(-100);
  writeCache(KEY, cur);
  return cur;
}
