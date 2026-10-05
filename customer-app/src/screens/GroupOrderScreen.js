import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Share, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';
import { Skeleton } from '../components/Skeleton';
import GradientHeader from '../components/GradientHeader';
import EmptyState from '../components/EmptyState';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { SOCKET_URL } from '../config';

const lineTotal = (it) => {
  const addons = (it.options || []).reduce((a, o) => a + (parseFloat(o.price) || 0), 0);
  return ((parseFloat(it.price) || 0) + addons) * (parseInt(it.quantity, 10) || 1);
};

export default function GroupOrderScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const { reorder, items: cartItems } = useCart();

  const [code, setCode] = useState(route.params?.code || null);
  const [codeInput, setCodeInput] = useState('');
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(!!route.params?.code);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGroup = useCallback(async (c, { silent } = {}) => {
    if (!c) return;
    try {
      const data = await api.get(`/group-orders/${c}`);
      setGroup(data.data || data);
    } catch (e) {
      if (!silent) {
        Alert.alert('المجموعة غير متاحة', e?.message === 'Network error' ? 'تعذّر الاتصال — تأكد من الإنترنت' : 'المجموعة غير موجودة أو انتهت');
        setCode(null); setGroup(null);
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { if (code) fetchGroup(code, { silent: !!group }); }, [code, fetchGroup]));

  // تحديث لحظي عبر السوكِت
  useEffect(() => {
    if (!code) return;
    let sock;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token) return;
        sock = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
        sock.on('group:updated', (p) => {
          if (!p?.code || String(p.code).toUpperCase() === String(code).toUpperCase()) fetchGroup(code, { silent: true });
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
      message: `🍔 تعال نطلب سوا من ${group.restaurant_name || 'المطعم'} على تطبيق وصلّي!\n\nافتح التطبيق → طلب جماعي → أدخل الكود:\n\n🔑 ${group.code}\n\nكل واحد بيزيد أكله وبيشوف حسابه 😋`,
    }).catch(() => {});
  };

  const addMyItems = () => {
    if (!group) return;
    navigation.navigate('Restaurant', { restaurantId: group.restaurant_id, groupId: group.id, groupCode: group.code });
  };

  const removeItem = (it) => {
    Alert.alert('حذف الصنف', `بدك تحذف «${it.name}» من المجموعة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: async () => {
          try { await api.delete(`/group-orders/${group.id}/items/${it.id}`); fetchGroup(code, { silent: true }); }
          catch (e) { Alert.alert('خطأ', e?.message || 'تعذّر حذف الصنف'); }
        },
      },
    ]);
  };

  // المضيف: نقل الأصناف للسلة — المجموعة تُقفل فقط بعد نجاح الطلب (من السلة)
  const doCheckout = () => {
    const items = group.items.map(it => ({
      id: it.menu_item_id,
      name_ar: it.name,
      image: it.image,
      price: parseFloat(it.price) || 0,
      quantity: parseInt(it.quantity, 10) || 1,
      addons: (it.options || []).map(o => ({ ...o, price: parseFloat(o.price) || 0 })),
      notes: it.notes || '',
    }));
    reorder(items, { id: group.restaurant_id, name_ar: group.restaurant_name }, { groupOrder: { id: group.id, code: group.code } });
    navigation.navigate('Main', { screen: 'سلتي' });
  };

  const checkoutAll = () => {
    if (!group || !group.items?.length) return Alert.alert('المجموعة فارغة', 'ما في أصناف بالمجموعة بعد');
    const hasCart = cartItems.length > 0;
    Alert.alert(
      'اطلب الكل',
      `رح ننقل ${group.items.length} صنف لسلّتك لتكمل الدفع.${hasCart ? '\n\n⚠️ سلتك الحالية فيها أصناف ورح تُستبدل.' : ''}\nالمجموعة بتتقفل بعد ما يتأكد الطلب.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: hasCart ? 'استبدل السلة واطلب' : 'نعم، كمّل', style: hasCart ? 'destructive' : 'default', onPress: doCheckout },
      ]
    );
  };

  // ===== شاشة الانضمام (بدون كود) =====
  if (!code) {
    return (
      <View style={styles.container}>
        <GradientHeader title="طلب جماعي 👥" />
        <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 64, marginTop: 20 }}>🧑‍🤝‍🧑</Text>
          <Text style={styles.bigTitle}>اطلبوا سوا من نفس المطعم</Text>
          <Text style={styles.sub}>واحد يفتح مجموعة من صفحة المطعم، وكل واحد يزيد أكله من موبايله، وكل شخص بيشوف حسابه 😋</Text>

          <View style={styles.joinCard}>
            <Text style={styles.joinLbl}>عندك كود مجموعة؟</Text>
            <TextInput
              value={codeInput}
              onChangeText={t => setCodeInput(t.toUpperCase())}
              placeholder="مثال: A7K9P2"
              placeholderTextColor={COLORS.faint}
              autoCapitalize="characters"
              maxLength={8}
              style={styles.codeInput}
              onSubmitEditing={joinByCode}
            />
            <TouchableOpacity activeOpacity={0.9} onPress={joinByCode}>
              <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.joinBtn}>
                <Text style={styles.joinBtnTxt}>انضم للمجموعة</Text>
              </LinearGradient>
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
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <GradientHeader title="طلب جماعي" />
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton w={'100%'} h={150} r={20} />
        {[0, 1, 2].map(i => <Skeleton key={i} w={'100%'} h={70} r={16} />)}
      </View>
    </View>
  );
  if (!group) return (
    <View style={styles.container}>
      <GradientHeader title="طلب جماعي" />
      <EmptyState emoji="😕" title="تعذّر فتح المجموعة" subtitle="حاول مرة ثانية" ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); fetchGroup(code); }} />
    </View>
  );

  const isOrdered = group.status === 'ordered';
  const isClosed = group.status && group.status !== 'open' && !isOrdered;
  // تجميع الأصناف حسب المشارك + مجموع كل شخص
  const byUser = {};
  (group.items || []).forEach(it => {
    const k = it.user_name || 'مشارك';
    if (!byUser[k]) byUser[k] = { items: [], total: 0, mine: false };
    byUser[k].items.push(it);
    byUser[k].total += lineTotal(it);
    if (it.is_mine) byUser[k].mine = true;
  });
  const people = Object.entries(byUser);
  const itemsTotal = people.reduce((s, [, v]) => s + v.total, 0);
  const groupTotal = parseFloat(group.total) || itemsTotal;

  return (
    <View style={styles.container}>
      <GradientHeader title={group.restaurant_name || 'طلب جماعي'} subtitle="طلب جماعي" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGroup(code, { silent: true }); }} tintColor={COLORS.primary} />}>
        <View style={styles.codeCard}>
          <Text style={styles.codeCardLbl}>🔑 كود المجموعة</Text>
          <Text style={styles.codeBig} selectable>{group.code}</Text>
          {!isOrdered && (
            <TouchableOpacity style={styles.shareBtn} onPress={shareCode}>
              <Ionicons name="share-social" size={18} color="#FFF" />
              <Text style={styles.shareBtnTxt}>شارك الكود مع الشباب</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.partCount}>👥 {group.participant_count || people.length} مشارك · {(group.items || []).length} صنف</Text>
        </View>

        {(isOrdered || isClosed) && (
          <View style={[styles.orderedBanner, { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorder }]}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
            <Text style={[styles.orderedTxt, { color: COLORS.successText }]}>{isOrdered ? 'تم الطلب ✅ — المجموعة مقفلة' : 'المجموعة مقفلة'}</Text>
          </View>
        )}

        {people.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 40 }}>🛒</Text>
            <Text style={styles.sub}>لسه ما حدا أضاف أصناف — ابدأ أنت!</Text>
          </View>
        ) : people.map(([userName, info]) => (
          <View key={userName} style={[styles.userGroup, info.mine && { borderColor: COLORS.primary, borderWidth: 1.5 }]}>
            <View style={styles.userHead}>
              <Text style={styles.userName}>🧑 {userName}{info.mine ? ' (أنت)' : ''}</Text>
              <View style={styles.userTotalPill}>
                <Text style={styles.userTotalTxt}>{info.total.toFixed(2)}₪</Text>
              </View>
            </View>
            {info.items.map(it => (
              <View key={it.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name} × {it.quantity}</Text>
                  {it.options?.length > 0 && <Text style={styles.itemOpts}>{it.options.map(o => o.name).join(' • ')}</Text>}
                </View>
                <Text style={styles.itemPrice}>{lineTotal(it).toFixed(2)}₪</Text>
                {!isOrdered && !isClosed && (it.is_mine || group.is_host) && (
                  <TouchableOpacity onPress={() => removeItem(it)} style={styles.delBtn} accessibilityLabel={`حذف ${it.name}`}>
                    <Ionicons name="close-circle" size={20} color={COLORS.red} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLbl}>مجموع الأصناف</Text>
            <Text style={styles.totalVal}>{groupTotal.toFixed(2)}₪</Text>
          </View>
          {people.length > 1 && (
            <Text style={styles.splitHint}>كل شخص يدفع مجموع أصنافه الظاهر بجانب اسمه. رسوم التوصيل والخصومات تُحسب بالسلة عند الدفع ويمكن تقسيمها بالتساوي (≈ حصة كل شخص من التوصيل = الرسوم ÷ {people.length}).</Text>
          )}
        </View>
      </ScrollView>

      {!isOrdered && !isClosed && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity style={styles.addBtn} onPress={addMyItems}>
            <Ionicons name="add-circle" size={20} color={COLORS.primary} />
            <Text style={styles.addBtnTxt}>أضف أصنافك</Text>
          </TouchableOpacity>
          {group.is_host && (
            <TouchableOpacity activeOpacity={0.9} style={{ flex: 1.2 }} onPress={checkoutAll}>
              <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.payBtn}>
                <Text style={styles.payBtnTxt}>اطلب الكل وادفع 💳</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  bigTitle: { fontSize: 22, fontWeight: '900', color: C.text, marginTop: 14, textAlign: 'center' },
  sub: { fontSize: 13, color: C.gray, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  joinCard: { backgroundColor: C.card, borderRadius: 20, padding: 18, width: '100%', marginTop: 26, gap: 12, ...C.shadow.soft },
  joinLbl: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'center' },
  codeInput: { backgroundColor: C.inputBg, borderRadius: 14, paddingVertical: 14, fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: 4, color: C.text, borderWidth: 1, borderColor: C.border },
  joinBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  joinBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  hintBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.tint, borderRadius: 12, padding: 12, marginTop: 20 },
  hintTxt: { flex: 1, fontSize: 12.5, color: C.primary, fontWeight: '700', textAlign: 'right' },
  codeCard: { backgroundColor: C.card, borderRadius: 22, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: C.tintBorder, ...C.shadow.soft },
  codeCardLbl: { fontSize: 13, color: C.gray, fontWeight: '700' },
  codeBig: { fontSize: 38, fontWeight: '900', color: C.primary, letterSpacing: 8, marginVertical: 6 },
  shareBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, marginTop: 6 },
  shareBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  partCount: { fontSize: 12.5, color: C.gray, marginTop: 12, fontWeight: '600' },
  orderedBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12, marginTop: 14, borderWidth: 1 },
  orderedTxt: { fontSize: 13.5, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  userGroup: { backgroundColor: C.card, borderRadius: 18, padding: 14, marginTop: 12, borderWidth: 1, borderColor: C.border, ...C.shadow.soft },
  userHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  userName: { fontSize: 14.5, fontWeight: '900', color: C.text },
  userTotalPill: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  userTotalTxt: { color: C.primary, fontWeight: '900', fontSize: 14 },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  itemName: { fontSize: 13.5, fontWeight: '700', color: C.text, textAlign: 'right' },
  itemOpts: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right' },
  itemPrice: { fontSize: 13.5, fontWeight: '800', color: C.primary },
  delBtn: { padding: 2 },
  totalCard: { backgroundColor: C.card, borderRadius: 18, padding: 16, marginTop: 14, ...C.shadow.soft },
  totalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  totalLbl: { fontSize: 15, fontWeight: '800', color: C.text },
  totalVal: { fontSize: 20, fontWeight: '900', color: C.primary },
  splitHint: { fontSize: 12, color: C.sub, marginTop: 10, lineHeight: 19, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row-reverse', gap: 10, padding: 14, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  addBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 2, borderColor: C.primary, flex: 1 },
  addBtnTxt: { color: C.primary, fontWeight: '800', fontSize: 15 },
  payBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  payBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
