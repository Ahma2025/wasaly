import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Keyboard } from 'react-native';
import DismissKeyboard from '../components/DismissKeyboard';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', bg: '#F8F9FA', card: '#FFF', text: '#1A1A2E', gray: '#8E8E93', red: '#FF3B30', green: '#34C759' };

export default function CartScreen() {
  const navigation = useNavigation();
  const { items, total, count, removeItem, addItem, clearCart, restaurantId, restaurantName, updateItemNote } = useCart();
  const { user } = useAuth();

  const [deliveryType, setDeliveryType] = useState('delivery'); // 'delivery' | 'pickup'
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [tip, setTip] = useState(0);
  const [leaveAtDoor, setLeaveAtDoor] = useState(false);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [calculatingFee, setCalculatingFee] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [restaurantInfo, setRestaurantInfo] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMsg, setCouponMsg] = useState('');

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    Keyboard.dismiss();
    setCouponLoading(true); setCouponMsg('');
    try {
      const res = await api.post('/coupons/validate', { code, subtotal: total });
      const d = parseFloat(res.data?.discount || 0);
      setCouponCode(code); setCouponDiscount(d);
      setCouponMsg(`✅ تم تطبيق خصم ${d.toFixed(2)}₪`);
    } catch (e) {
      setCouponCode(null); setCouponDiscount(0);
      setCouponMsg('❌ ' + (e.message || 'الكوبون غير صالح'));
    } finally { setCouponLoading(false); }
  };
  const removeCoupon = () => { setCouponCode(null); setCouponDiscount(0); setCouponInput(''); setCouponMsg(''); };

  useEffect(() => { getUserLocation(); fetchRestaurantInfo(); }, []);
  useFocusEffect(useCallback(() => { fetchAddresses(); }, []));

  useEffect(() => {
    if (deliveryType === 'delivery' && userLocation && restaurantInfo) {
      calculateDeliveryFee();
    } else if (deliveryType === 'pickup') {
      setDeliveryFee(0);
    }
  }, [deliveryType, userLocation, restaurantInfo]);

  const fetchRestaurantInfo = async () => {
    if (!restaurantId) return;
    try {
      const data = await api.get(`/restaurants/${restaurantId}`);
      setRestaurantInfo(data.data);
    } catch {}
  };

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation(loc.coords);
      }
    } catch {}
  };

  const calculateDeliveryFee = async () => {
    if (!userLocation || !restaurantInfo?.lat) return;
    setCalculatingFee(true);
    try {
      const data = await api.get(`/delivery-zones/calculate?lat1=${restaurantInfo.lat}&lng1=${restaurantInfo.lng}&lat2=${userLocation.latitude}&lng2=${userLocation.longitude}`);
      setDeliveryFee(parseFloat(data.data?.fee || 5));
    } catch {
      setDeliveryFee(5);
    } finally {
      setCalculatingFee(false);
    }
  };

  const fetchAddresses = async () => {
    try {
      const data = await api.get('/users/addresses');
      const list = data.data || [];
      setAddresses(list);
      const def = list.find(a => a.is_default) || list[0];
      if (def) setSelectedAddress(def);
    } catch {}
  };

  const placeOrder = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (deliveryType === 'delivery' && !selectedAddress) {
      submittingRef.current = false;
      return Alert.alert('خطأ', 'الرجاء تحديد عنوان التوصيل');
    }
    if (items.length === 0) { submittingRef.current = false; return; }

    setLoading(true);
    try {
      const orderItems = items.map(i => ({
        id: i.id,
        quantity: i.quantity,
        price: parseFloat(i.discount_price || i.price),
        options: i.addons || i.selectedOptions || [],
        notes: i.notes || ''
      }));

      const body = {
        restaurant_id: restaurantId,
        items: orderItems,
        payment_method: paymentMethod,
        coupon_code: couponCode || undefined,
        notes: [notes, leaveAtDoor ? '🚪 اترك الطلب على الباب' : ''].filter(Boolean).join(' — '),
        tip: parseFloat(tip) || 0,
        total_amount: finalTotal,
        order_type: deliveryType,
      };

      if (deliveryType === 'delivery' && selectedAddress) {
        body.address_id = selectedAddress.id;
        body.delivery_address = selectedAddress.address;
        body.delivery_lat = selectedAddress.lat;
        body.delivery_lng = selectedAddress.lng;
        body.delivery_fee = deliveryFee;
      }

      const data = await api.post('/orders', body);
      const orderId = data.data?.id || data.id;
      clearCart();

      // الدفع بالبطاقة → افتح صفحة Lahza الآمنة
      if (paymentMethod === 'card') {
        try {
          const initRes = await api.post('/payments/lahza/init', { order_id: orderId });
          if (initRes.authorization_url) {
            navigation.replace('PaymentWebView', {
              authorizationUrl: initRes.authorization_url,
              reference: initRes.reference,
              orderId,
            });
            return;
          }
          Alert.alert('الدفع بالبطاقة', 'تعذّر بدء الدفع الإلكتروني. طلبك محفوظ ويمكنك الدفع عند الاستلام.');
        } catch (err) {
          Alert.alert('الدفع بالبطاقة', err.message || 'الدفع الإلكتروني غير متاح حالياً. طلبك محفوظ للدفع عند الاستلام.');
        }
      }

      navigation.replace('OrderTracking', { orderId });
    } catch (e) {
      Alert.alert('خطأ', e.message || 'فشل في إتمام الطلب');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const finalTotal = Math.max(0, (deliveryType === 'delivery' ? total + deliveryFee : total) - couponDiscount) + (parseFloat(tip) || 0);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 60 }}>🛒</Text>
        <Text style={styles.emptyTitle}>السلة فارغة</Text>
        <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('Main', { screen: 'الرئيسية' })}>
          <Text style={styles.shopBtnText}>تصفح المطاعم</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <DismissKeyboard>
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.title}>سلة الطلبات ({count})</Text>
        <TouchableOpacity onPress={clearCart}><Text style={{ color: COLORS.red, fontWeight: '600' }}>إفراغ</Text></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🧾 طلباتك</Text>
          {items.map(item => (
            <View key={item._key} style={styles.itemRow}>
              <View style={styles.qtyControl}>
                <TouchableOpacity onPress={() => removeItem(item._key)} style={styles.qtyBtn}><Text style={[styles.qtyBtnText, { color: COLORS.primary }]}>−</Text></TouchableOpacity>
                <Text style={styles.qty}>{item.quantity}</Text>
                <TouchableOpacity onPress={() => addItem(item, { id: restaurantId })} style={[styles.qtyBtn, { backgroundColor: COLORS.primary }]}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name_ar || item.name}</Text>
                {item.addons?.length > 0 && (
                  <Text style={styles.itemOptions}>{item.addons.map(a => a.name).join(' • ')}</Text>
                )}
                <Text style={styles.itemPrice}>{
                  ((parseFloat(item.discount_price || item.price) + (item.addons || []).reduce((s,a) => s + parseFloat(a.price||0), 0)) * item.quantity).toFixed(2)
                }₪</Text>
                <TextInput
                  style={styles.itemNoteInput}
                  placeholder="ملاحظة (بدون بصل، حار زيادة...)"
                  placeholderTextColor={COLORS.gray}
                  value={item.notes || ''}
                  onChangeText={(t) => updateItemNote(item._key, t)}
                />
              </View>
            </View>
          ))}
        </View>

        {/* شريط الحد الأدنى للطلب */}
        {!!restaurantInfo?.min_order && total < restaurantInfo.min_order && (
          <View style={[styles.freeDelivCard, { backgroundColor: '#FFF9E6', borderColor: '#FFE9A8' }]}>
            <Text style={styles.freeDelivText}>الحد الأدنى للطلب <Text style={{ fontWeight: '900' }}>{restaurantInfo.min_order}₪</Text> — أضف <Text style={{ fontWeight: '900', color: COLORS.primary }}>{(restaurantInfo.min_order - total).toFixed(2)}₪</Text> للمتابعة</Text>
            <View style={styles.freeDelivBar}>
              <View style={[styles.freeDelivFill, { backgroundColor: '#FFB800', width: `${Math.min(100, (total / restaurantInfo.min_order) * 100)}%` }]} />
            </View>
          </View>
        )}

        {/* شريط تقدّم التوصيل المجاني */}
        {deliveryType === 'delivery' && (
          <View style={styles.freeDelivCard}>
            {total >= 50 ? (
              <Text style={styles.freeDelivDone}>🎉 مبروك! حصلت على توصيل مجاني</Text>
            ) : (
              <>
                <Text style={styles.freeDelivText}>أضف <Text style={{ fontWeight: '900', color: COLORS.primary }}>{(50 - total).toFixed(2)}₪</Text> واحصل على توصيل مجاني 🚚</Text>
                <View style={styles.freeDelivBar}>
                  <View style={[styles.freeDelivFill, { width: `${Math.min(100, (total / 50) * 100)}%` }]} />
                </View>
              </>
            )}
          </View>
        )}

        {/* Delivery Type */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚚 طريقة الاستلام</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, deliveryType === 'delivery' && styles.toggleBtnActive]}
              onPress={() => setDeliveryType('delivery')}
            >
              <Ionicons name="bicycle-outline" size={20} color={deliveryType === 'delivery' ? '#FFF' : COLORS.gray} />
              <Text style={[styles.toggleText, deliveryType === 'delivery' && { color: '#FFF' }]}>توصيل لموقعي</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, deliveryType === 'pickup' && styles.toggleBtnActive]}
              onPress={() => setDeliveryType('pickup')}
            >
              <Ionicons name="storefront-outline" size={20} color={deliveryType === 'pickup' ? '#FFF' : COLORS.gray} />
              <Text style={[styles.toggleText, deliveryType === 'pickup' && { color: '#FFF' }]}>استلام من المحل</Text>
            </TouchableOpacity>
          </View>

          {deliveryType === 'delivery' && (
            <View style={styles.feeBox}>
              <Ionicons name="location-outline" size={16} color={COLORS.primary} />
              <Text style={styles.feeLabel}>رسوم التوصيل لموقعك:</Text>
              {calculatingFee
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Text style={styles.feeValue}>{deliveryFee}₪</Text>
              }
            </View>
          )}

          {deliveryType === 'pickup' && (
            <View style={styles.pickupBox}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
              <Text style={styles.pickupText}>ستستلم طلبك من المطعم — توصيل مجاني</Text>
            </View>
          )}
        </View>

        {/* Address (only for delivery) */}
        {deliveryType === 'delivery' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📍 عنوان التوصيل</Text>
            {addresses.map(addr => (
              <TouchableOpacity
                key={addr.id}
                style={[styles.addrOption, selectedAddress?.id === addr.id && styles.addrOptionActive]}
                onPress={() => setSelectedAddress(addr)}
              >
                <Ionicons name="location" size={18} color={selectedAddress?.id === addr.id ? COLORS.primary : COLORS.gray} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.addrTitle}>{addr.title || addr.label || 'عنوان'}</Text>
                  <Text style={styles.addrText} numberOfLines={1}>{addr.address}</Text>
                </View>
                {selectedAddress?.id === addr.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addAddrBtn} onPress={() => navigation.navigate('AddAddress')}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.addAddrText}>إضافة عنوان جديد</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Payment */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💳 طريقة الدفع</Text>
          {[
            { id: 'cash', label: 'كاش عند الاستلام', icon: 'cash-outline' },
            { id: 'card', label: 'بطاقة ائتمان', icon: 'card-outline' }
          ].map(pm => (
            <TouchableOpacity
              key={pm.id}
              style={[styles.payOption, paymentMethod === pm.id && styles.payOptionActive]}
              onPress={() => setPaymentMethod(pm.id)}
            >
              <Ionicons name={pm.icon} size={20} color={paymentMethod === pm.id ? COLORS.primary : COLORS.gray} />
              <Text style={[styles.payLabel, paymentMethod === pm.id && { color: COLORS.primary, fontWeight: '700' }]}>{pm.label}</Text>
              <Ionicons name={paymentMethod === pm.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={paymentMethod === pm.id ? COLORS.primary : COLORS.gray} />
            </TouchableOpacity>
          ))}
        </View>

        {/* بقشيش السائق + اترك على الباب */}
        {deliveryType === 'delivery' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🛵 خيارات التوصيل</Text>
            <Text style={styles.tipLabel}>بقشيش للسائق (اختياري)</Text>
            <View style={styles.tipRow}>
              {[0, 2, 5, 10].map(v => (
                <TouchableOpacity key={v} onPress={() => setTip(v)} style={[styles.tipChip, tip === v && styles.tipChipOn]}>
                  <Text style={[styles.tipChipTxt, tip === v && { color: '#FFF' }]}>{v === 0 ? 'بدون' : `${v}₪`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.doorRow} onPress={() => setLeaveAtDoor(v => !v)}>
              <Ionicons name={leaveAtDoor ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
              <Text style={styles.doorText}>اترك الطلب على الباب 🚪</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 ملاحظات للمطعم</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="أي طلبات خاصة..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholderTextColor={COLORS.gray}
          />
        </View>

        {/* Coupon */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎟️ كود الخصم</Text>
          {couponCode ? (
            <View style={styles.couponApplied}>
              <Ionicons name="pricetag" size={18} color={COLORS.green} />
              <Text style={styles.couponAppliedTxt}>{couponCode} — خصم {couponDiscount.toFixed(2)}₪</Text>
              <TouchableOpacity onPress={removeCoupon}><Ionicons name="close-circle" size={22} color={COLORS.gray} /></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.couponRow}>
              <TextInput
                style={styles.couponInput}
                placeholder="أدخل كود الخصم"
                value={couponInput}
                onChangeText={setCouponInput}
                autoCapitalize="characters"
                placeholderTextColor={COLORS.gray}
              />
              <TouchableOpacity style={styles.couponBtn} onPress={applyCoupon} disabled={couponLoading}>
                {couponLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.couponBtnTxt}>تطبيق</Text>}
              </TouchableOpacity>
            </View>
          )}
          {!!couponMsg && <Text style={[styles.couponMsg, { color: couponCode ? COLORS.green : COLORS.red }]}>{couponMsg}</Text>}
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🧮 ملخص الطلب</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>المجموع الفرعي</Text>
            <Text style={styles.summaryVal}>{total.toFixed(2)}₪</Text>
          </View>
          {couponDiscount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: COLORS.green }]}>خصم الكوبون</Text>
              <Text style={[styles.summaryVal, { color: COLORS.green }]}>-{couponDiscount.toFixed(2)}₪</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>رسوم التوصيل</Text>
            <Text style={[styles.summaryVal, deliveryType === 'pickup' && { color: COLORS.green }]}>
              {deliveryType === 'pickup' ? 'مجاني' : `${deliveryFee}₪`}
            </Text>
          </View>
          {parseFloat(tip) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>بقشيش السائق</Text>
              <Text style={styles.summaryVal}>{parseFloat(tip).toFixed(2)}₪</Text>
            </View>
          )}
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10, marginTop: 4 }]}>
            <Text style={[styles.summaryLabel, { fontWeight: '800', fontSize: 16, color: COLORS.text }]}>الإجمالي</Text>
            <Text style={[styles.summaryVal, { fontWeight: '900', fontSize: 18, color: COLORS.primary }]}>{finalTotal.toFixed(2)}₪</Text>
          </View>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>

      <TouchableOpacity style={[styles.orderBtn, loading && { opacity: 0.7 }]} onPress={placeOrder} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.orderBtnText}>تأكيد الطلب • {finalTotal.toFixed(2)}₪</Text>
        }
      </TouchableOpacity>
    </View>
    </DismissKeyboard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: COLORS.bg },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  shopBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, elevation: 5, shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  shopBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  card: { backgroundColor: '#FFF', margin: 12, marginBottom: 0, borderRadius: 18, padding: 16, elevation: 2, shadowColor: '#1A1A2E', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8F8F8', gap: 12 },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFF0E8', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFE0CC' },
  qtyBtnText: { color: '#FFF', fontWeight: '900', fontSize: 17, lineHeight: 21 },
  qty: { fontSize: 15, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemOptions: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  itemNoteInput: { marginTop: 6, borderWidth: 1, borderColor: '#EEE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: COLORS.text, backgroundColor: '#FAFAFA' },
  freeDelivCard: { backgroundColor: '#FFF7F2', margin: 12, marginBottom: 0, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#FFE0CC' },
  freeDelivText: { fontSize: 13, color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  freeDelivDone: { fontSize: 13, color: COLORS.green, fontWeight: '800', textAlign: 'center' },
  freeDelivBar: { height: 8, backgroundColor: '#FFE0CC', borderRadius: 4, overflow: 'hidden' },
  freeDelivFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  tipLabel: { fontSize: 13, color: COLORS.gray, marginBottom: 8 },
  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tipChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA', backgroundColor: '#FAFAFA' },
  tipChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tipChipTxt: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  doorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  doorText: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  itemPrice: { fontSize: 13, color: COLORS.primary, fontWeight: '700', marginTop: 2 },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA', backgroundColor: '#F8F8F8' },
  toggleBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { fontSize: 13, fontWeight: '700', color: COLORS.gray },
  feeBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF5EE', borderRadius: 10, padding: 10 },
  feeLabel: { flex: 1, fontSize: 13, color: COLORS.text },
  feeValue: { fontSize: 16, fontWeight: '900', color: COLORS.primary },
  pickupBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FFF4', borderRadius: 10, padding: 10 },
  pickupText: { fontSize: 13, color: COLORS.green, fontWeight: '600', flex: 1 },
  addrOption: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA', marginBottom: 8 },
  addrOptionActive: { borderColor: COLORS.primary, backgroundColor: '#FFF5EE' },
  addrTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  addrText: { fontSize: 12, color: COLORS.gray, marginTop: 1 },
  addAddrBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8 },
  addAddrText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  payOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA', marginBottom: 8 },
  payOptionActive: { borderColor: COLORS.primary, backgroundColor: '#FFF5EE' },
  payLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  notesInput: { borderWidth: 1.5, borderColor: '#E5E5EA', borderRadius: 12, padding: 12, minHeight: 75, textAlignVertical: 'top', fontSize: 14, color: COLORS.text },
  couponRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  couponInput: { flex: 1, borderWidth: 1.5, borderColor: '#E5E5EA', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.text, backgroundColor: '#FAFAFB', letterSpacing: 1 },
  couponBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 78 },
  couponBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  couponApplied: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EDFFF3', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#C3F5D8' },
  couponAppliedTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1A5C33' },
  couponMsg: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: COLORS.gray },
  summaryVal: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  orderBtn: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: COLORS.primary, borderRadius: 18, padding: 18, alignItems: 'center', elevation: 10, shadowColor: COLORS.primary, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  orderBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 0.3 },
});
