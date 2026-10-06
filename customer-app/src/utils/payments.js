import { Alert } from 'react-native';
import api from './api';
import { writeCache, readCache } from './cache';

/*
  بدء دفع Lahza لطلب موجود — يرجّع { authorization_url, reference }
  أو { already_paid: true } لو تبيّن إنه دفعة سابقة نجحت (السيرفر الجديد بيفحص المراجع القديمة قبل ما يفتح دفعة)
*/
export async function initCardPayment(orderId) {
  const r = await api.post('/payments/lahza/init', { order_id: orderId });
  if (r?.already_paid || (r?.paid && !r?.authorization_url)) return { already_paid: true };
  if (!r?.authorization_url) throw { message: 'تعذّر بدء الدفع الإلكتروني' };
  return r;
}

/** حالة الطلب الحالية من السيرفر (null لو تعذّر) */
export async function fetchOrderState(orderId) {
  try {
    const d = await api.get(`/orders/${orderId}`);
    return d?.data || d || null;
  } catch { return null; }
}

/**
  هل يجوز نفتح عملية دفع جديدة؟ فقط لو الطلب لسا بطاقة وغير مدفوع وغير ملغي.
  (السيرفر بيحوّل الطلب لكاش لما يفشل تجهيز الدفع — دفع بطاقة فوقه = دفع مرتين)
*/
export const canPayByCard = (o) => !!o && o.payment_method === 'card' && o.payment_status !== 'paid'
  && !['cancelled', 'delivered'].includes(o.status) && (parseFloat(o.total) || 0) > 0;

/**
  الزبون اختار «كاش عند الاستلام» بدل البطاقة → نبلغ السيرفر يطلق الطلب للمطعم فوراً
  (بدل ما يضل مخفي ~10 دقائق). السيرفر يتأكد من Lahza إنه ما في دفعة ناجحة قبل التحويل.
  يرجّع: 'released' | 'paid' | 'unsupported' (سيرفر قديم) | 'failed'
*/
export async function abandonCardPayment(orderId) {
  try {
    const r = await api.post('/payments/lahza/abandon', { order_id: orderId }, { timeout: 20000 });
    if (r?.paid) return 'paid';
    return 'released';
  } catch (e) {
    // 404 = سيرفر قديم ما فيه المسار (السويب بيطلق الطلب خلال دقائق)
    if (e?.status === 404) return 'unsupported';
    // 503 VERIFY_FAILED: ما قدر يتأكد من Lahza → نعيد المحاولة (ممكن يكون دفع)
    return 'failed';
  }
}

/**
  «كاش عند الاستلام» مع معالجة كل النتائج: يرجّع true لو منكمّل للتتبع
  (failed → نسأل الزبون يعيد المحاولة بدل ما نتركه يظن إن الطلب وصل للمطعم)
*/
export function confirmCashResult(res, { onRetry, onTrack }) {
  if (res === 'paid') {
    Alert.alert('تم الدفع ✅', 'لقينا دفعتك بالبطاقة مكتملة — طلبك بالطريق للمطعم.', [{ text: 'تتبّع الطلب', onPress: onTrack }], { cancelable: false });
    return false;
  }
  if (res === 'failed') {
    Alert.alert('الدفع كاش عند الاستلام', 'تعذّر التأكد من حالة الدفع الآن — حاول مرة ثانية بعد لحظات.', [
      { text: 'تتبّع الطلب', onPress: onTrack },
      { text: 'حاول مرة ثانية', onPress: onRetry },
    ]);
    return false;
  }
  return true;
}

// البطاقة غير مفعّلة بالسيرفر (503) → نخفيها من خيارات الدفع بالسلة لساعة
const CARD_OFF_KEY = 'card_unavailable';
export const markCardUnavailable = () => writeCache(CARD_OFF_KEY, { at: Date.now() });
export async function isCardUnavailable() {
  const c = await readCache(CARD_OFF_KEY);
  return !!(c && Date.now() - (c.at || 0) < 60 * 60 * 1000);
}

/**
  ينتقل لتتبع الطلب بعد اختيار الكاش: يطلق الطلب أولاً (abandon) ثم يفتح التتبع.
*/
export async function payCashInstead(navigation, orderId, { mode = 'navigate' } = {}) {
  const go = (name, params) => (mode === 'replace' ? navigation.replace(name, params) : navigation.navigate(name, params));
  const res = await abandonCardPayment(orderId);
  const track = () => go('OrderTracking', { orderId, fromCheckout: true, cashChosen: res !== 'paid' });
  if (confirmCashResult(res, { onTrack: track, onRetry: () => payCashInstead(navigation, orderId, { mode }) })) track();
}

let inFlight = null; // منع فتح أكثر من عملية دفع/صفحة دفع بنفس الوقت

/*
  يفتح صفحة الدفع، ولو فشل البدء:
  - نرجع نقرأ الطلب من السيرفر: لو تحوّل لكاش/انلغى/اندفع → ما منعرض «ادفع مرة ثانية» أبداً
  - وإلا خياران: «ادفع مرة ثانية» أو «الدفع كاش عند الاستلام»
  navigation: كائن الملاحة؛ mode: 'navigate' | 'replace'
*/
export async function startCardPayment(navigation, orderId, { mode = 'navigate' } = {}) {
  if (inFlight) return inFlight;
  const go = (name, params) => (mode === 'replace' ? navigation.replace(name, params) : navigation.navigate(name, params));
  inFlight = (async () => {
    try {
      const init = await initCardPayment(orderId);
      if (init.already_paid) {
        Alert.alert('تم الدفع ✅', 'دفعتك السابقة بالبطاقة مكتملة — طلبك بالطريق للمطعم.', [{ text: 'تتبّع الطلب', onPress: () => go('OrderTracking', { orderId, fromCheckout: true }) }], { cancelable: false });
        return;
      }
      go('PaymentWebView', { authorizationUrl: init.authorization_url, reference: init.reference, orderId });
    } catch (e) {
      if (e?.status === 503 && e?.code !== 'VERIFY_FAILED') markCardUnavailable();
      // السيرفر الجديد بيرجّع حالة الطلب مع الخطأ؛ القديم → نقرأها
      const o = e?.payment_method ? { ...e, id: orderId, total: e.total ?? 1 } : await fetchOrderState(orderId);
      if (o && !canPayByCard(o)) {
        const paid = o.payment_status === 'paid';
        Alert.alert(
          paid ? 'تم الدفع ✅' : 'الدفع بالبطاقة',
          paid ? 'طلبك مدفوع بالبطاقة وبالطريق للمطعم.'
            : o.status === 'cancelled' ? 'الطلب ملغي.'
              : 'الدفع الإلكتروني ما زبط هالمرة — تحوّل طلبك للدفع كاش عند الاستلام ووصل للمطعم، ما في داعي تدفع بالبطاقة.',
          [{ text: 'تتبّع الطلب', onPress: () => go('OrderTracking', { orderId, fromCheckout: true }) }],
          { cancelable: false }
        );
        return;
      }
      Alert.alert(
        'الدفع بالبطاقة',
        `${e?.message || 'الدفع الإلكتروني غير متاح حالياً'}\nطلبك محفوظ — تقدر تحاول مرة ثانية أو تدفع كاش عند الاستلام.`,
        [
          { text: 'الدفع كاش عند الاستلام', onPress: () => payCashInstead(navigation, orderId, { mode }) },
          { text: 'ادفع مرة ثانية', onPress: () => startCardPayment(navigation, orderId, { mode }) },
        ],
        { cancelable: false }
      );
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export const isCardPaymentStarting = () => !!inFlight;
