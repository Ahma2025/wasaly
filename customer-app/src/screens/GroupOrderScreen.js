import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Share, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';

const SOCKET_URL = 'https://burger-app-production.up.railway.app';

export default function GroupOrderScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const { reorder } = useCart();

  const [code, setCode] = useState(route.params?.code || null);
  const [codeInput, setCodeInput] = useState('');
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(!!route.params?.code);
  const socketRef = useRef(null);

  // تحميل المجموعة بالكود
  const fetchGroup = useCallback(async (c) => {
    if (!c) return;
    try {
      const data = await api.get(`/group-orders/${c}`);
      setGroup(data.data || data);
    } catch (e) {
      Alert.alert('خطأ', 'المجموعة غير موجودة أو انتهت');
      setCode(null); setGroup(null);
    } finally { setLoading(false); }
  }, []);

  // كل ما نرجع للشاشة نعيد التحميل (مثلاً بعد إضافة أصناف من المطعم)
  useFocusEffect(useCallback(() => { if (code) fetchGroup(code); }, [code, fetchGroup]));

  // تحديث لحظي عبر السوكِت
  useEffect(() => {
    if (!code) return;
    let sock;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token) return;
        sock = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
        socketRef.current = sock;
        sock.on('group:updated', (p) => {
          if (!p?.code || String(p.code).toUpperCase() === String(code).toUpperCase()) fetchGroup(code);
        });
      } catch {}
    })();
    return () => { sock?.disconnect(); };
  }, [code, fetchGroup]);

  const joinByCode = () => {
    const c = codeInput.trim().toUpperCase();
    if (c.length < 4) return Alert.alert('كود غير صحيح', 'اكتب كود المجموعة الصحيح');
    setLoading(true); setCode(c); fetchGroup(c);
  };

  const shareCode = () => {
    if (!group) return;
    Share.share({
      message: `🍔 تعال نطلب سوا من ${group.restaurant_name || 'المطعم'} على تطبيق وصلّي!\n\nافتح التطبيق → طلب جماعي → أدخل الكود:\n\n🔑 ${group.code}\n\nكل واحد بيزيد أكله والحساب بينقسم 😋`,
    });
  };

  const addMyItems = () => {
    if (!group) return;
    navigation.navigate('Restaurant', { restaurantId: group.restaurant_id, groupId: group.id, groupCode: group.code });
  };

  const removeItem = async (itemId) => {
    try { await api.delete(`/group-orders/${group.id}/items/${itemId}`); fetchGroup(code); }
    catch { Alert.alert('خطأ', 'تعذّر حذف الصنف'); }
  };

  // المضيف: استيراد كل أصناف المجموعة للسلّة ثم إكمال الدفع العادي
  const checkoutAll = () => {
    if (!group || !group.items?.length) return Alert.alert('السلّة فارغة', 'ما في أصناف بالمجموعة بعد');
    Alert.alert('اطلب الكل', `رح تنقل ${group.items.length} صنف لسلّتك وتكمّل الدفع. متأكد؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'نعم، اطلب', onPress: async () => {
          const cartItems = group.items.map(it => ({
            id: it.menu_item_id,
            name_ar: it.name,
            image: it.image,
            price: parseFloat(it.price) || 0,
            discount_price: parseFloat(it.price) || 0,
            quantity: parseInt(it.quantity) || 1,
            addons: it.options || [],
            notes: it.notes || '',
          }));
          reorder(cartItems, { id: group.restaurant_id, name_ar: group.restaurant_name });
          try { await api.post(`/group-orders/${group.id}/close`, { status: 'ordered' }); } catch {}
          navigation.navigate('Main', { screen: 'سلتي' });
        },
      },
    ]);
  };

  // ===== شاشة الانضمام (بدون كود) =====
  if (!code) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>طلب جماعي 👥</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 64, marginTop: 20 }}>🧑‍🤝‍🧑</Text>
          <Text style={styles.bigTitle}>اطلبوا سوا — كسر الحساب</Text>
          <Text style={styles.sub}>واحد يفتح مجموعة من صفحة المطعم، وكل واحد يزيد أكله من موبايله، والحساب بينقسم 😋</Text>

          <View style={styles.joinCard}>
            <Text style={styles.joinLbl}>عندك كود مجموعة؟</Text>
            <TextInput
              value={codeInput}
              onChangeText={t => setCodeInput(t.toUpperCase())}
              placeholder="مثال: A7K9P2"
              placeholderTextColor={COLORS.gray}
              autoCapitalize="characters"
              maxLength={8}
              style={styles.codeInput}
            />
            <TouchableOpacity style={styles.joinBtn} onPress={joinByCode}>
              <Text style={styles.joinBtnTxt}>انضم للمجموعة</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.hintTxt}>لبدء مجموعة جديدة: افتح أي مطعم واضغط "اطلبوا سوا 👥"</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (loading) return (
    <View style={styles.loadingWrap}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.sub}>جاري التحميل...</Text></View>
  );
  if (!group) return null;

  const isOrdered = group.status === 'ordered';
  // تجميع الأصناف حسب المشارك
  const byUser = {};
  (group.items || []).forEach(it => { (byUser[it.user_name] = byUser[it.user_name] || []).push(it); });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{group.restaurant_name || 'طلب جماعي'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* كود المشاركة */}
        <View style={styles.codeCard}>
          <Text style={styles.codeCardLbl}>🔑 كود المجموعة</Text>
          <Text style={styles.codeBig}>{group.code}</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={shareCode}>
            <Ionicons name="share-social" size={18} color="#FFF" />
            <Text style={styles.shareBtnTxt}>شارك الكود مع الشباب</Text>
          </TouchableOpacity>
          <Text style={styles.partCount}>👥 {group.participant_count || 0} مشارك · {(group.items || []).length} صنف</Text>
        </View>

        {isOrdered && (
          <View style={styles.orderedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
            <Text style={styles.orderedTxt}>تم إرسال الطلب ✅ — المجموعة مقفلة</Text>
          </View>
        )}

        {/* الأصناف حسب المشارك */}
        {(group.items || []).length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 40 }}>🛒</Text>
            <Text style={styles.sub}>لسه ما حدا أضاف أصناف</Text>
          </View>
        ) : (
          Object.entries(byUser).map(([userName, items]) => (
            <View key={userName} style={styles.userGroup}>
              <Text style={styles.userName}>🧑 {userName}</Text>
              {items.map(it => {
                const addons = (it.options || []).reduce((a, o) => a + parseFloat(o.price || 0), 0);
                const line = (parseFloat(it.price || 0) + addons) * (parseInt(it.quantity) || 1);
                return (
                  <View key={it.id} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{it.name} × {it.quantity}</Text>
                      {it.options?.length > 0 && <Text style={styles.itemOpts}>{it.options.map(o => o.name).join(' • ')}</Text>}
                    </View>
                    <Text style={styles.itemPrice}>{line.toFixed(2)}₪</Text>
                    {!isOrdered && (it.is_mine || group.is_host) && (
                      <TouchableOpacity onPress={() => removeItem(it.id)} style={styles.delBtn}>
                        <Ionicons name="close-circle" size={20} color={COLORS.red} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))
        )}

        {/* الإجمالي */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLbl}>الإجمالي</Text>
          <Text style={styles.totalVal}>{parseFloat(group.total || 0).toFixed(2)}₪</Text>
        </View>
      </ScrollView>

      {/* أزرار أسفل */}
      {!isOrdered && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.addBtn} onPress={addMyItems}>
            <Ionicons name="add-circle" size={20} color={COLORS.primary} />
            <Text style={styles.addBtnTxt}>أضف أصنافك</Text>
          </TouchableOpacity>
          {group.is_host && (
            <TouchableOpacity style={styles.payBtn} onPress={checkoutAll}>
              <Text style={styles.payBtnTxt}>اطلب الكل وادفع 💳</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.inputBg },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, flex: 1, textAlign: 'center' },
  bigTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginTop: 14, textAlign: 'center' },
  sub: { fontSize: 13, color: COLORS.gray, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  joinCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 18, width: '100%', marginTop: 26, elevation: 2 },
  joinLbl: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 10, textAlign: 'center' },
  codeInput: { backgroundColor: COLORS.inputBg, borderRadius: 12, paddingVertical: 14, fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: 4, color: COLORS.text, borderWidth: 1, borderColor: COLORS.line },
  joinBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  joinBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  hintBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.tint, borderRadius: 12, padding: 12, marginTop: 20 },
  hintTxt: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  codeCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 18, alignItems: 'center', elevation: 2, borderWidth: 2, borderColor: '#FFE0CC' },
  codeCardLbl: { fontSize: 13, color: COLORS.gray, fontWeight: '700' },
  codeBig: { fontSize: 40, fontWeight: '900', color: COLORS.primary, letterSpacing: 8, marginVertical: 6 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, marginTop: 6 },
  shareBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  partCount: { fontSize: 12, color: COLORS.gray, marginTop: 12, fontWeight: '600' },
  orderedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.tint, borderRadius: 12, padding: 12, marginTop: 14 },
  orderedTxt: { fontSize: 13, fontWeight: '800', color: COLORS.green },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  userGroup: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginTop: 12, elevation: 1 },
  userName: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: COLORS.line },
  itemName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  itemOpts: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  itemPrice: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  delBtn: { padding: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 14, elevation: 1 },
  totalLbl: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  totalVal: { fontSize: 20, fontWeight: '900', color: COLORS.primary },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 24, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 2, borderColor: COLORS.primary, flex: 1 },
  addBtnTxt: { color: COLORS.primary, fontWeight: '800', fontSize: 15 },
  payBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flex: 1.2 },
  payBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
