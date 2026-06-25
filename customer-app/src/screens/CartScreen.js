import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', bg: '#F8F9FA', card: '#FFF', text: '#1A1A2E', gray: '#8E8E93', red: '#FF3B30' };

export default function CartScreen() {
  const router = useRouter();
  const { items, total, count, removeItem, addItem, clearCart, restaurantId } = useCart();
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [couponCode, setCouponCode] = useState('');
  const [couponData, setCouponData] = useState(null);
  const [notes, setNotes] = useState('');
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(2);

  useEffect(() => { fetchAddresses(); }, []);

  const fetchAddresses = async () => {
    try {
      const data = await api.get('/users/addresses');
      setAddresses(data.data || []);
      const def = data.data?.find(a => a.is_default) || data.data?.[0];
      if (def) setSelectedAddress(def);
    } catch {}
  };

  const validateCoupon = async () => {
    try {
      const data = await api.post('/coupons/validate', { code: couponCode, subtotal: total, restaurant_id: restaurantId });
      setCouponData(data.data);
      Alert.alert('✅', `تم تطبيق الكوبون! خصم ${data.data.discount}₪`);
    } catch (e) {
      Alert.alert('خطأ', e.message || 'كوبون غير صالح');
    }
  };

  const placeOrder = async () => {
    if (!selectedAddress) return Alert.alert('خطأ', 'الرجاء تحديد عنوان التوصيل');
    if (items.length === 0) return;

    setLoading(true);
    try {
      const orderItems = items.map(i => ({ id: i.id, quantity: i.quantity, options: i.selectedOptions || [], notes: i.notes }));
      const data = await api.post('/orders', {
        restaurant_id: restaurantId,
        address_id: selectedAddress.id,
        delivery_address: selectedAddress.address,
        delivery_lat: selectedAddress.lat,
        delivery_lng: selectedAddress.lng,
        items: orderItems,
        payment_method: paymentMethod,
        notes,
        coupon_code: couponCode || undefined,
        loyalty_points_to_use: loyaltyPoints
      });
      clearCart();
      router.replace(`/order/${data.data.id}`);
    } catch (e) {
      Alert.alert('خطأ', e.message || 'فشل في إتمام الطلب');
    } finally {
      setLoading(false);
    }
  };

  const discount = couponData?.discount || 0;
  const finalTotal = Math.max(0, total + deliveryFee - discount);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 60 }}>🛒</Text>
        <Text style={styles.emptyTitle}>السلة فارغة</Text>
        <TouchableOpacity style={styles.shopBtn} onPress={() => router.push('/')}>
          <Text style={styles.shopBtnText}>تصفح المطاعم</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.title}>سلة الطلبات ({count})</Text>
        <TouchableOpacity onPress={clearCart}><Text style={{ color: COLORS.red, fontWeight: '600' }}>إفراغ</Text></TouchableOpacity>
      </View>

      <ScrollView>
        {/* Items */}
        <View style={styles.card}>
          {items.map(item => (
            <View key={item._key} style={styles.itemRow}>
              <View style={styles.qtyControl}>
                <TouchableOpacity onPress={() => removeItem(item._key)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                <Text style={styles.qty}>{item.quantity}</Text>
                <TouchableOpacity onPress={() => addItem(item, { id: restaurantId })} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name_ar}</Text>
                <Text style={styles.itemPrice}>{((item.discount_price || item.price) * item.quantity).toFixed(2)}₪</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Address */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>عنوان التوصيل</Text>
          {addresses.map(addr => (
            <TouchableOpacity key={addr.id} style={[styles.addrOption, selectedAddress?.id === addr.id && styles.addrOptionActive]} onPress={() => setSelectedAddress(addr)}>
              <Ionicons name={addr.label === 'home' ? 'home' : addr.label === 'work' ? 'briefcase' : 'location'} size={18} color={selectedAddress?.id === addr.id ? COLORS.primary : COLORS.gray} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.addrTitle}>{addr.title || addr.label}</Text>
                <Text style={styles.addrText} numberOfLines={1}>{addr.address}</Text>
              </View>
              {selectedAddress?.id === addr.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addAddrBtn} onPress={() => router.push('/add-address')}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.addAddrText}>إضافة عنوان جديد</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Method */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>طريقة الدفع</Text>
          {[{ id: 'cash', label: 'كاش عند الاستلام', icon: 'cash-outline' }, { id: 'wallet', label: 'المحفظة الإلكترونية', icon: 'wallet-outline' }, { id: 'card', label: 'بطاقة ائتمان', icon: 'card-outline' }].map(pm => (
            <TouchableOpacity key={pm.id} style={[styles.payOption, paymentMethod === pm.id && styles.payOptionActive]} onPress={() => setPaymentMethod(pm.id)}>
              <Ionicons name={pm.icon} size={20} color={paymentMethod === pm.id ? COLORS.primary : COLORS.gray} />
              <Text style={[styles.payLabel, paymentMethod === pm.id && { color: COLORS.primary }]}>{pm.label}</Text>
              {paymentMethod === pm.id && <Ionicons name="radio-button-on" size={20} color={COLORS.primary} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Coupon */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>كوبون الخصم</Text>
          <View style={styles.couponRow}>
            <TextInput style={styles.couponInput} placeholder="أدخل كود الخصم" value={couponCode} onChangeText={setCouponCode} />
            <TouchableOpacity style={styles.couponBtn} onPress={validateCoupon}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>تطبيق</Text>
            </TouchableOpacity>
          </View>
          {couponData && <Text style={{ color: 'green', marginTop: 6 }}>✅ خصم {couponData.discount}₪</Text>}
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ملاحظات للمطعم</Text>
          <TextInput style={styles.notesInput} placeholder="أي طلبات خاصة..." value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ملخص الطلب</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>المجموع الفرعي</Text><Text style={styles.summaryVal}>{total.toFixed(2)}₪</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>رسوم التوصيل</Text><Text style={styles.summaryVal}>{deliveryFee}₪</Text></View>
          {discount > 0 && <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: 'green' }]}>خصم الكوبون</Text><Text style={[styles.summaryVal, { color: 'green' }]}>-{discount}₪</Text></View>}
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12, marginTop: 8 }]}>
            <Text style={[styles.summaryLabel, { fontWeight: '800', fontSize: 16 }]}>الإجمالي</Text>
            <Text style={[styles.summaryVal, { fontWeight: '800', fontSize: 18, color: COLORS.primary }]}>{finalTotal.toFixed(2)}₪</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={[styles.orderBtn, loading && { opacity: 0.7 }]} onPress={placeOrder} disabled={loading}>
        <Text style={styles.orderBtnText}>{loading ? 'جاري الطلب...' : `تأكيد الطلب • ${finalTotal.toFixed(2)}₪`}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: '#FFF' },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  shopBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  shopBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: '#FFF', margin: 12, borderRadius: 16, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 12 },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  qty: { fontSize: 15, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemPrice: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  addrOption: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E5EA', marginBottom: 8 },
  addrOptionActive: { borderColor: COLORS.primary, backgroundColor: '#FFF5EE' },
  addrTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  addrText: { fontSize: 12, color: COLORS.gray },
  addAddrBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8 },
  addAddrText: { color: COLORS.primary, fontWeight: '600' },
  payOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E5EA', marginBottom: 8 },
  payOptionActive: { borderColor: COLORS.primary, backgroundColor: '#FFF5EE' },
  payLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: { flex: 1, borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 10, padding: 10, fontSize: 14 },
  couponBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center' },
  notesInput: { borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 10, padding: 10, minHeight: 70, textAlignVertical: 'top' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: COLORS.gray },
  summaryVal: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  orderBtn: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center' },
  orderBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 }
});
