import { Alert } from 'react-native';
import api from './api';

// بدء دفع Lahza لطلب موجود — يرجّع { authorization_url, reference }
export async function initCardPayment(orderId) {
  const r = await api.post('/payments/lahza/init', { order_id: orderId });
  if (!r?.authorization_url) throw { message: 'تعذّر بدء الدفع الإلكتروني' };
  return r;
}

/*
  يفتح صفحة الدفع، ولو فشل البدء يعرض خيارين واضحين: "ادفع مرة ثانية" أو "الدفع كاش عند الاستلام".
  navigation: كائن الملاحة؛ mode: 'navigate' | 'replace'
*/
export async function startCardPayment(navigation, orderId, { mode = 'navigate' } = {}) {
  const go = (name, params) => (mode === 'replace' ? navigation.replace(name, params) : navigation.navigate(name, params));
  try {
    const init = await initCardPayment(orderId);
    go('PaymentWebView', { authorizationUrl: init.authorization_url, reference: init.reference, orderId });
  } catch (e) {
    Alert.alert(
      'الدفع بالبطاقة',
      `${e?.message || 'الدفع الإلكتروني غير متاح حالياً'}\nطلبك محفوظ — تقدر تحاول مرة ثانية أو تدفع كاش عند الاستلام.`,
      [
        { text: 'الدفع كاش عند الاستلام', onPress: () => go('OrderTracking', { orderId, fromCheckout: true }) },
        { text: 'ادفع مرة ثانية', onPress: () => startCardPayment(navigation, orderId, { mode }) },
      ],
      { cancelable: false }
    );
  }
}
