import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Share, Alert, RefreshControl, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import api, { isNetworkError, NETWORK_MESSAGE } from '../utils/api';
import { plural } from '../utils/plural';
import { shareDownloadText } from '../config';
import { Skeleton } from '../components/Skeleton';
import GradientHeader from '../components/GradientHeader';
import EmptyState from '../components/EmptyState';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { SOCKET_URL } from '../config';
import { FadeIn, PopIn, Press, GradientButton } from '../components/Anim';
import { AnimatedNumber } from '../components/UI';
import { stagger } from '../utils/motion';

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
  const [loadError, setLoadError] = useState('');
  const [excludedIds, setExcludedIds] = useState([]);
  const groupRef = useRef(null);
  const inFlight = useRef(null);

  /*
    جلب المجموعة: قطعة نت لحظة الرجوع للشاشة ما بتطلّع الزبون من المجموعة —
    منمسح الكود فقط لو السيرفر قال صراحة إنها مش موجودة (404)
  */
  const fetchGroup = useCallback(async (c, { silent } = {}) => {
    if (!c) return;
    if (inFlight.current === c) return; // طلب لنفس الكود شغّال (يمنع رسالتين خطأ ورا بعض)
    inFlight.current = c;
    const quiet = silent ?? !!groupRef.current;
    try {
      const data = await api.get(`/group-orders/${c}`);
      const g = data.data || data;
      groupRef.current = g;
      setGroup(g);
      setLoadError('');
    } catch (e) {
      if (e?.status === 404) {
        Alert.alert('السلة المشتركة غير متاحة', 'الكود غير موجود أو السلة انتهت — تأكد من الكود.');
        groupRef.current = null;
        setCode(null); setGroup(null);
      } else {
        setLoadError(isNetworkError(e) ? NETWORK_MESSAGE : (e?.message || 'تعذّر تحميل السلة المشتركة'));
        if (!quiet) Alert.alert('تعذّر التحميل', isNetworkError(e) ? NETWORK_MESSAGE : (e?.message || 'حاول مرة ثانية'));
      }
    } finally { inFlight.current = null; setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { if (code) fetchGroup(code, { silent: !!groupRef.current }); }, [code, fetchGroup]));

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
          if (!p?.code || String(p.code).toUpperCase() === String(code).toUpperCase()) {
            // المضيف طلب: أصناف ما دخلت بالطلب (السيرفر الأحدث يبعتها مع الإغلاق)
            if (Array.isArray(p?.excluded)) setExcludedIds(p.excluded.map(x => String(x.item_id ?? x.id)));
            fetchGroup(code, { silent: true });
          }
        });
      } catch {}
    })();
    return () => { sock?.disconnect(); };
  }, [code, fetchGroup]);

  // الجلب يصير من useFocusEffect لما يتغيّر الكود (بدون طلب مكرر)
  const joinByCode = () => {
    const c = codeInput.trim().toUpperCase();
    if (c.length < 4) return Alert.alert('كود غير صحيح', 'اكتب كود السلة المشتركة الصحيح');
    Keyboard.dismiss();
    groupRef.current = null;
    setLoading(true); setCode(c);
  };

  const shareCode = () => {
    if (!group) return;
    Share.share({
      message: `🛒 تعال نطلب سوا من ${group.restaurant_name || 'المحل'} على تطبيق وصلّي!\n\nافتح التطبيق → اطلب مع أصحابك (سلة مشتركة) → أدخل الكود:\n\n🔑 ${group.code}\n\nكل واحد بيضيف طلبه وبيشوف حسابه 😋\n\n${shareDownloadText()}`,
    }).catch(() => {});
  };

  const addMyItems = () => {
    if (!group) return;
    navigation.navigate('Restaurant', { restaurantId: group.restaurant_id, groupId: group.id, groupCode: group.code });
  };

  const removeItem = (it) => {
    Alert.alert('حذف الصنف', `بدك تحذف «${it.name}» من السلة المشتركة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: async () => {
          try { await api.delete(`/group-orders/${group.id}/items/${it.id}`); fetchGroup(code, { silent: true }); }
          catch (e) { Alert.alert('خطأ', e?.message || 'تعذّر حذف الصنف'); }
        },
      },
    ]);
  };

  /*
    المضيف: نقل الأصناف للسلة. نقفل السلة المشتركة للإضافة (lock) حتى ما ينضاف شي ما بيدخل بالطلب،
    ونحفظ أرقام الأصناف المنقولة لنقارنها بعد الطلب. القفل النهائي (ordered) بعد نجاح الطلب من السلة.
  */
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
    api.post(`/group-orders/${group.id}/lock`).catch(() => {}); // سيرفر قديم بلا قفل → نعتمد على المقارنة بعد الطلب
    reorder(items, { id: group.restaurant_id, name_ar: group.restaurant_name },
      { groupOrder: { id: group.id, code: group.code, itemIds: group.items.map(it => String(it.id)) } });
    navigation.navigate('Main', { screen: 'سلتي' });
  };

  const checkoutAll = () => {
    if (!group || !group.items?.length) return Alert.alert('السلة المشتركة فاضية', 'ما في أصناف بالسلة المشتركة بعد');
    const hasCart = cartItems.length > 0;
    Alert.alert(
      'اطلب الكل',
      `رح ننقل ${plural(group.items.length, 'item')} لسلّتك لتكمل الدفع.${hasCart ? '\n\n⚠️ سلتك الحالية فيها أصناف ورح تُستبدل.' : ''}\nالإضافة بتوقف هلّق، والسلة المشتركة بتتقفل بعد ما يتأكد الطلب.`,
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
        <GradientHeader title="اطلب مع أصحابك" subtitle="سلة مشتركة" colors={COLORS.gradients.violet} />
        <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
          <PopIn>
            <LinearGradient colors={COLORS.gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroIcon}>
              <Ionicons name="people" size={46} color="#FFF" />
            </LinearGradient>
          </PopIn>
          <FadeIn delay={80} style={{ alignItems: 'center' }}>
            <Text style={styles.bigTitle}>سلة مشتركة من نفس المحل</Text>
            <Text style={styles.sub}>واحد يفتح سلة مشتركة من صفحة المطعم أو المتجر، وكل واحد يضيف طلبه من موبايله، وكل شخص بيشوف حسابه 😋</Text>
          </FadeIn>
          <FadeIn delay={140} style={styles.steps}>
            {[['storefront', 'افتح مطعم'], ['share-social', 'شارك الكود'], ['bag-add', 'كل واحد يضيف']].map(([ic, l], i) => (
              <View key={l} style={styles.step}>
                <View style={styles.stepIcon}><Ionicons name={ic} size={18} color={COLORS.primary} /></View>
                <Text style={styles.stepTxt}>{i + 1}. {l}</Text>
              </View>
            ))}
          </FadeIn>

          <FadeIn delay={200} style={styles.joinCard}>
            <Text style={styles.joinLbl}>عندك كود سلة مشتركة؟</Text>
            <TextInput
              value={codeInput}
              onChangeText={t => setCodeInput(t.toUpperCase())}
              placeholder="A7K9P2"
              placeholderTextColor={COLORS.faint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              // المسافات بين الحروف للكود اللاتيني فقط (ما بتقطّع النص العربي)
              style={[styles.codeInput, !!codeInput && styles.codeInputFilled]}
              onSubmitEditing={joinByCode}
              accessibilityLabel="كود السلة المشتركة"
            />
            <GradientButton title="انضم للسلة" onPress={joinByCode} disabled={!codeInput.trim()} icon={<Ionicons name="enter-outline" size={19} color="#FFF" />} />
          </FadeIn>

          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.hintTxt}>لبدء سلة مشتركة جديدة: افتح أي مطعم واضغط "اطلب مع أصحابك 👥"</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <GradientHeader title="سلة مشتركة" colors={COLORS.gradients.violet} />
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton w={'100%'} h={150} r={20} />
        {[0, 1, 2].map(i => <Skeleton key={i} w={'100%'} h={70} r={16} />)}
      </View>
    </View>
  );
  if (!group) return (
    <View style={styles.container}>
      <GradientHeader title="سلة مشتركة" colors={COLORS.gradients.violet} />
      <EmptyState emoji="📡" title="تعذّر فتح السلة المشتركة" subtitle={loadError || 'حاول مرة ثانية'} ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); fetchGroup(code, { silent: false }); }} />
    </View>
  );

  const isOrdered = group.status === 'ordered';
  // المضيف عم يكمّل الطلب (قفل مؤقت من السيرفر) → الإضافة موقفة
  const isLocked = group.is_locked === true || ['locked', 'checkout'].includes(group.status);
  const isClosed = group.status && group.status !== 'open' && !isOrdered && !isLocked;
  // تجميع الأصناف حسب المشارك (برقم المستخدم — شخصين بنفس الاسم ما بيندمجوا) + مجموع كل شخص
  const byUser = {};
  (group.items || []).forEach(it => {
    const k = it.user_id != null ? String(it.user_id) : `name:${it.user_name || 'مشارك'}`;
    if (!byUser[k]) byUser[k] = { name: it.user_name || 'مشارك', items: [], total: 0, mine: false };
    byUser[k].items.push(it);
    byUser[k].total += lineTotal(it);
    if (it.is_mine) byUser[k].mine = true;
  });
  const people = Object.entries(byUser);
  const itemsTotal = people.reduce((s, [, v]) => s + v.total, 0);
  const groupTotal = parseFloat(group.total) || itemsTotal;
  // أصناف ما دخلت بالطلب (من حدث الإغلاق المباشر أو من رد السيرفر لو بيرجّعها)
  const excluded = new Set([...(group.excluded_item_ids || []), ...((group.excluded || []).map(x => x?.item_id ?? x)), ...excludedIds].map(String));

  return (
    <View style={styles.container}>
      <GradientHeader title={group.restaurant_name || 'سلة مشتركة'} subtitle="سلة مشتركة" colors={COLORS.gradients.violet} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGroup(code, { silent: true }); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.card} />}>
        <PopIn from={0.94} style={styles.codeCard}>
          <View style={styles.codeLblRow}><Ionicons name="key" size={14} color={COLORS.primary} /><Text style={styles.codeCardLbl}>كود السلة المشتركة</Text></View>
          <View style={styles.codeBox}><Text style={styles.codeBig} selectable>{group.code}</Text></View>
          {!isOrdered && !isLocked && (
            <Press style={styles.shareBtn} onPress={shareCode} accessibilityRole="button" accessibilityLabel="شارك الكود">
              <LinearGradient colors={COLORS.gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Ionicons name="share-social" size={18} color="#FFF" />
              <Text style={styles.shareBtnTxt}>شارك الكود مع أصحابك</Text>
            </Press>
          )}
          <View style={styles.partRow}>
            <View style={styles.partChip}><Ionicons name="people" size={13} color={COLORS.primary} /><Text style={styles.partCount}>{plural(group.participant_count || people.length, 'participant')}</Text></View>
            <View style={styles.partChip}><Ionicons name="fast-food" size={13} color={COLORS.primary} /><Text style={styles.partCount}>{plural((group.items || []).length, 'item')}</Text></View>
          </View>
        </PopIn>

        {isLocked && (
          <View style={[styles.orderedBanner, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]}>
            <Ionicons name="lock-closed" size={18} color={COLORS.warnFill} />
            <Text style={[styles.orderedTxt, { color: COLORS.text, flex: 1 }]}>المضيف عم يكمّل الطلب — الإضافة موقفة هلّق</Text>
          </View>
        )}
        {(isOrdered || isClosed) && (
          <View style={[styles.orderedBanner, { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorder }]}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
            <Text style={[styles.orderedTxt, { color: COLORS.successText, flex: 1 }]}>{isOrdered ? 'تم الطلب ✅ — السلة المشتركة مقفلة' : 'السلة المشتركة مقفلة'}</Text>
          </View>
        )}
        {isOrdered && excluded.size > 0 && (
          <View style={[styles.orderedBanner, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder }]}>
            <Ionicons name="alert-circle" size={18} color={COLORS.red} />
            <Text style={[styles.orderedTxt, { color: COLORS.red, flex: 1 }]}>{plural(excluded.size, 'item')} انضافت بعد ما المضيف طلب وما دخلت بالطلب</Text>
          </View>
        )}

        {people.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}><Ionicons name="bag-handle-outline" size={30} color={COLORS.primary} /></View>
            <Text style={styles.sub}>لسه ما حدا أضاف أصناف — ابدأ أنت!</Text>
          </View>
        ) : people.map(([key, info], pi) => (
          <FadeIn key={key} delay={stagger(pi)} from={14} style={[styles.userGroup, info.mine && { borderColor: COLORS.primary, borderWidth: 1.5 }]}>
            <View style={styles.userHead}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1 }}>
                <LinearGradient colors={info.mine ? COLORS.gradients.sunset : COLORS.gradients.violet} style={styles.userAvatar}>
                  <Text style={styles.userInitial}>{String(info.name).trim().charAt(0) || '؟'}</Text>
                </LinearGradient>
                <Text style={styles.userName} numberOfLines={1}>{info.name}{info.mine ? ' (أنت)' : ''}</Text>
              </View>
              <View style={styles.userTotalPill}>
                <Text style={styles.userTotalTxt}>{info.total.toFixed(2)}₪</Text>
              </View>
            </View>
            {info.items.map(it => (
              <View key={it.id} style={[styles.itemRow, excluded.has(String(it.id)) && { opacity: 0.55 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name} × {it.quantity}</Text>
                  {it.options?.length > 0 && <Text style={styles.itemOpts}>{it.options.map(o => o.name).join(' • ')}</Text>}
                  {excluded.has(String(it.id)) && <Text style={[styles.itemOpts, { color: COLORS.red }]}>ما دخل بالطلب</Text>}
                </View>
                <Text style={styles.itemPrice}>{lineTotal(it).toFixed(2)}₪</Text>
                {!isOrdered && !isClosed && !isLocked && (it.is_mine || group.is_host) && (
                  <TouchableOpacity onPress={() => removeItem(it)} style={styles.delBtn} accessibilityRole="button" accessibilityLabel={`حذف ${it.name}`}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={22} color={COLORS.red} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </FadeIn>
        ))}

        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLbl}>مجموع الأصناف</Text>
            <AnimatedNumber value={groupTotal} suffix="₪" style={styles.totalVal} />
          </View>
          {people.length > 1 && (
            <Text style={styles.splitHint}>كل شخص يدفع مجموع أصنافه الظاهر بجانب اسمه. رسوم التوصيل والخصومات تُحسب بالسلة عند الدفع ويمكن تقسيمها بالتساوي (≈ حصة كل شخص من التوصيل = الرسوم ÷ {people.length}).</Text>
          )}
        </View>
      </ScrollView>

      {!isOrdered && !isClosed && (!isLocked || group.is_host) && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          {!isLocked && (
            <TouchableOpacity style={styles.addBtn} onPress={addMyItems} accessibilityRole="button">
              <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              <Text style={styles.addBtnTxt}>أضف أصنافك</Text>
            </TouchableOpacity>
          )}
          {group.is_host && (
            <GradientButton title="اطلب الكل وادفع" onPress={checkoutAll} style={{ flex: 1.2 }} icon={<Ionicons name="card" size={18} color="#FFF" />} />
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  bigTitle: { fontSize: 22, fontWeight: '900', color: C.text, marginTop: 14, textAlign: 'center' },
  heroIcon: { width: 96, height: 96, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginTop: 16, elevation: 10, shadowColor: '#7C5CFA', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  steps: { flexDirection: 'row-reverse', gap: 8, marginTop: 20, alignSelf: 'stretch' },
  step: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 18, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  stepIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 11.5, fontWeight: '800', color: C.text },
  codeLblRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  codeBox: { backgroundColor: C.tint, borderRadius: 18, paddingHorizontal: 22, marginVertical: 10, borderWidth: 1.5, borderColor: C.tintBorder, borderStyle: 'dashed' },
  partRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },
  partChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: C.inputBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  userAvatar: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  userInitial: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  sub: { fontSize: 13, color: C.gray, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  joinCard: { backgroundColor: C.card, borderRadius: 24, padding: 18, width: '100%', marginTop: 20, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  joinLbl: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'center' },
  codeInput: { backgroundColor: C.inputBg, borderRadius: 14, paddingVertical: 14, fontSize: 22, fontWeight: '900', textAlign: 'center', color: C.text, borderWidth: 1, borderColor: C.border },
  codeInputFilled: { letterSpacing: 4 },
  joinBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  joinBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  hintBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.tint, borderRadius: 12, padding: 12, marginTop: 20 },
  hintTxt: { flex: 1, fontSize: 12.5, color: C.primary, fontWeight: '700', textAlign: 'right' },
  codeCard: { backgroundColor: C.card, borderRadius: 26, padding: 18, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  codeCardLbl: { fontSize: 13, color: C.gray, fontWeight: '700' },
  codeBig: { fontSize: 38, fontWeight: '900', color: C.primary, letterSpacing: 8, marginVertical: 6 },
  shareBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 20, marginTop: 2, overflow: 'hidden' },
  shareBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  partCount: { fontSize: 12.5, color: C.sub, fontWeight: '700' },
  orderedBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12, marginTop: 14, borderWidth: 1 },
  orderedTxt: { fontSize: 13.5, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  userGroup: { backgroundColor: C.card, borderRadius: 22, padding: 14, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  userHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  userName: { fontSize: 14.5, fontWeight: '900', color: C.text },
  userTotalPill: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  userTotalTxt: { color: C.primary, fontWeight: '900', fontSize: 14 },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  itemName: { fontSize: 13.5, fontWeight: '700', color: C.text, textAlign: 'right' },
  itemOpts: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right' },
  itemPrice: { fontSize: 13.5, fontWeight: '800', color: C.primary },
  delBtn: { padding: 6, minWidth: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  totalCard: { backgroundColor: C.card, borderRadius: 22, padding: 16, marginTop: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  totalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  totalLbl: { fontSize: 15, fontWeight: '800', color: C.text },
  totalVal: { fontSize: 20, fontWeight: '900', color: C.primary },
  splitHint: { fontSize: 12, color: C.sub, marginTop: 10, lineHeight: 19, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 14, backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, ...C.shadow.card },
  addBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 18, height: 54, paddingHorizontal: 16, borderWidth: 1.5, borderColor: C.tintBorder, backgroundColor: C.tint, flex: 1 },
  addBtnTxt: { color: C.primary, fontWeight: '800', fontSize: 15 },
  payBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  payBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
