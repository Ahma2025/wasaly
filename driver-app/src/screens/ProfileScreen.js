import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert, RefreshControl } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { NAV_APPS, getNavPref, setNavPref } from '../utils/group';
import { useTabBarOffset } from '../components/FloatingTabBar';
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import { PopIn, FadeIn, Skeleton, Press, CountUp, LoadingDots, haptic } from '../components/Anim';
import { money, num, formatPhone } from '../utils/format';

const TIERS = {
  bronze:   { label: 'برونزي', grad: ['#E8A15C', '#B5651D'] },
  silver:   { label: 'فضّي',   grad: ['#B9BFCB', '#7D8494'] },
  gold:     { label: 'ذهبي',   grad: ['#FFCF33', '#FF9A00'] },
  platinum: { label: 'بلاتيني', grad: ['#7B79F0', '#4B49C9'] },
};

function LinkRow({ icon, iconColor, bg, label, sub, onPress, delay, dot }) {
  return (
    <FadeIn delay={delay}>
      <Press style={styles.linkBtn} onPress={onPress} accessibilityLabel={dot ? `${label}، رسالة جديدة` : label}>
        <View style={[styles.linkIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={19} color={iconColor} />
          {dot && <View style={styles.dot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.linkText, RTL.text]}>{label}</Text>
          {!!sub && <Text style={[styles.linkSub, RTL.text]}>{sub}</Text>}
        </View>
        <View style={styles.chev}><Ionicons name="chevron-back" size={16} color={COLORS.gray} /></View>
      </Press>
    </FadeIn>
  );
}

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { contentPadding } = useTabBarOffset();
  const { user, logout, updateUser } = useAuth();
  const { activeOrder, activeGroup, supportUnread } = useDriver();
  const [profile, setProfile] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [navApp, setNavApp] = useState(null);
  useEffect(() => { getNavPref().then(setNavApp).catch(() => {}); }, []);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameErr, setNameErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async (withCache) => {
    if (withCache) {
      const cached = await readCache('driver_profile');
      if (cached) setProfile(p => p || cached);
    }
    try {
      const d = await api.get('/drivers/me');
      if (d?.data) { setProfile(d.data); writeCache('driver_profile', d.data); }
      setLoadFailed(false);
    } catch { setLoadFailed(true); } // D-25: لا هيكل تحميل للأبد
  }, []);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(false); setRefreshing(false); };

  const startEdit = () => { setName(profile?.name || user?.name || ''); setNameErr(''); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setName(''); setNameErr(''); };

  const save = async () => {
    if (saving) return;
    const n = name.trim();
    if (n.length < 2) { haptic.warn(); setNameErr('أدخل اسماً من حرفين على الأقل'); return; }
    setNameErr('');
    setSaving(true);
    try {
      await api.put('/users/profile', { name: n });
      const next = { ...(profile || {}), name: n };
      setProfile(next);
      writeCache('driver_profile', next);
      await updateUser({ name: n }); // ينعكس فوراً في الرئيسية وفي التخزين
      haptic.success();
      setEditing(false);
    } catch (e) {
      haptic.warn();
      Alert.alert('تعذّر الحفظ', e?.message || 'حاول مرة أخرى');
    } finally { setSaving(false); }
  };

  // D-08: لا خروج أثناء توصيل جارٍ (يتوقف التتبّع ويبقى الطلب مسجّلاً عليك)
  const handleLogout = () => {
    if (activeOrder || activeGroup) {
      Alert.alert('عندك طلب نشط', 'أكمل التوصيل الحالي قبل تسجيل الخروج.');
      return;
    }
    Alert.alert('تسجيل الخروج', 'سيتم إيقاف استقبال الطلبات وتسجيل خروجك. متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: async () => {
        setLoggingOut(true);
        const r = await logout();
        if (r?.blocked) { setLoggingOut(false); Alert.alert('عندك طلب نشط', r.blocked); }
      } },
    ]);
  };

  const chooseNav = () => {
    const buttons = Object.keys(NAV_APPS).map(k => ({ text: NAV_APPS[k] + (navApp === k ? ' ✓' : ''), onPress: () => { setNavPref(k); setNavApp(k); haptic.select(); } }));
    buttons.push({ text: 'إلغاء', style: 'cancel' });
    Alert.alert('تطبيق الملاحة', 'اختر التطبيق الذي يُفتح عند الضغط على "ملاحة"', buttons, { cancelable: true });
  };

  const tierKey = profile?.loyalty_tier;
  const tier = tierKey ? TIERS[tierKey] : null;
  const displayName = profile?.name || user?.name;
  const rating = num(profile?.rating);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: contentPadding }} showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} progressViewOffset={insets.top} />}>
      <LinearGradient colors={tier ? tier.grad : GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 22 }]}>
        <View style={styles.orbA} />
        <View style={styles.orbB} />
        <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
        <PopIn>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{displayName?.[0] || '؟'}</Text></View>
            <View style={styles.verified}><MaterialCommunityIcons name="moped" size={14} color="#FFF" /></View>
          </View>
        </PopIn>
        <FadeIn delay={80} style={{ alignItems: 'center' }}>
          {displayName ? <Text style={styles.name}>{displayName}</Text> : <Skeleton width={150} height={22} tone="dark" />}
          {!!(profile?.phone || user?.phone) && (
            <View style={[RTL.row, { gap: 5, marginTop: 4 }]}>
              <Ionicons name="call-outline" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.phone}>{formatPhone(profile?.phone || user?.phone)}</Text>
            </View>
          )}
          {tier && (
            <View style={styles.tierChip}>
              <Ionicons name="ribbon" size={14} color="#FFF" />
              <Text style={styles.tierText}>مستوى {tier.label}</Text>
            </View>
          )}
        </FadeIn>
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, marginTop: -30 }}>
        <View style={[styles.statsCard, SHADOW.card]}>
          {[
            { label: 'الرصيد', value: profile ? num(profile.wallet_balance) : null, fmt: money, icon: 'wallet', color: COLORS.greenDeep, bg: COLORS.greenSoft },
            { label: 'التقييم', value: profile ? rating : null, fmt: (n) => (rating > 0 ? n.toFixed(1) : '—'), icon: 'star', color: COLORS.star, bg: COLORS.amberSoft },
            { label: 'التوصيلات', value: profile ? (parseInt(profile.total_deliveries, 10) || 0) : null, fmt: (n) => String(Math.round(n)), icon: 'cube', color: COLORS.blue, bg: COLORS.blueSoft },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={styles.statSep} />}
              <PopIn delay={i * 70} style={{ flex: 1 }}>
                <View style={styles.statCell}>
                  <View style={[styles.statIcon, { backgroundColor: s.bg }]}><Ionicons name={s.icon} size={17} color={s.color} /></View>
                  {s.value == null ? (loadFailed ? <Text style={[styles.statValue, { color: COLORS.faint }]}>—</Text> : <Skeleton width={50} height={18} style={{ marginVertical: 2 }} />)
                    : <CountUp value={s.value} format={s.fmt} style={styles.statValue} adjustsFontSizeToFit />}
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              </PopIn>
            </React.Fragment>
          ))}
        </View>

        {loadFailed && !profile && (
          <FadeIn>
            <View style={styles.errBox}>
              <Ionicons name="cloud-offline-outline" size={20} color={COLORS.red} />
              <Text style={[styles.errText, RTL.text]}>تعذّر تحميل بيانات حسابك</Text>
              <Press style={styles.errBtn} onPress={() => load(false)} accessibilityLabel="إعادة المحاولة">
                <Ionicons name="refresh" size={14} color="#FFF" />
                <Text style={styles.errBtnText}>إعادة</Text>
              </Press>
            </View>
          </FadeIn>
        )}

        <FadeIn delay={120}>
          <View style={[styles.section, SHADOW.soft]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
              {editing ? (
                <View style={[RTL.row, { gap: 8 }]}>
                  <Press onPress={save} disabled={saving} style={[styles.pillBtn, styles.pillPrimary]} hitSlop={6} accessibilityLabel="حفظ الاسم">
                    {saving ? <LoadingDots size={5} /> : <Text style={styles.pillPrimaryText}>حفظ</Text>}
                  </Press>
                  <Press onPress={cancelEdit} disabled={saving} style={styles.pillBtn} hitSlop={6} accessibilityLabel="إلغاء التعديل">
                    <Text style={styles.pillText}>إلغاء</Text>
                  </Press>
                </View>
              ) : (
                <Press onPress={startEdit} style={styles.pillBtn} hitSlop={6} accessibilityLabel="تعديل الاسم">
                  <Ionicons name="create-outline" size={15} color={COLORS.primary} />
                  <Text style={[styles.pillText, { color: COLORS.primary }]}>تعديل</Text>
                </Press>
              )}
            </View>

            <View style={styles.field}>
              <View style={styles.fieldIcon}><Ionicons name="person-outline" size={17} color={COLORS.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, RTL.text]}>الاسم</Text>
                {editing ? (
                  <>
                    <TextInput style={[styles.fieldInput, !!nameErr && styles.fieldInputErr]} value={name}
                      onChangeText={(t) => { setName(t); if (nameErr) setNameErr(''); }}
                      textAlign="right" autoFocus maxLength={60} returnKeyType="done" onSubmitEditing={save}
                      autoComplete="name" textContentType="name" selectionColor={COLORS.primary} editable={!saving}
                      accessibilityLabel="الاسم" accessibilityHint={nameErr || undefined} />
                    {!!nameErr && (
                      <View style={[RTL.row, { gap: 4, marginTop: 6 }]} accessibilityLiveRegion="polite">
                        <Ionicons name="alert-circle" size={14} color={COLORS.red} />
                        <Text style={[styles.fieldErr, RTL.text]}>{nameErr}</Text>
                      </View>
                    )}
                  </>
                ) :<Text style={[styles.fieldValue, RTL.text]}>{displayName || '-'}</Text>}
              </View>
            </View>
            <View style={styles.field}>
              <View style={styles.fieldIcon}><MaterialCommunityIcons name="moped-outline" size={18} color={COLORS.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, RTL.text]}>نوع المركبة</Text>
                <Text style={[styles.fieldValue, RTL.text]}>{profile?.vehicle_type || '-'}</Text>
              </View>
            </View>
            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <View style={styles.fieldIcon}><Ionicons name="card-outline" size={17} color={COLORS.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, RTL.text]}>رقم المركبة</Text>
                <Text style={[styles.fieldValue, RTL.text]}>{profile?.vehicle_plate || '-'}</Text>
              </View>
            </View>
            <View style={[RTL.row, styles.hintRow]}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.gray} />
              <Text style={[styles.hint, RTL.text]}>لتعديل بيانات المركبة تواصل مع الإدارة</Text>
            </View>
          </View>
        </FadeIn>

        <LinkRow icon="star" iconColor={COLORS.star} bg={COLORS.amberSoft} label="تقييماتي" sub="آراء الزبائن في خدمتك" onPress={() => navigation.navigate('Reviews')} delay={170} />
        <LinkRow icon="headset" iconColor={COLORS.greenDeep} bg={COLORS.greenSoft} label="الدعم الفني" sub={supportUnread ? 'لديك رد جديد من فريق وصلّي' : 'تحدث مع فريق وصلّي'} dot={supportUnread} onPress={() => navigation.navigate('SupportChat')} delay={210} />
        {/* D-17: تطبيق الملاحة المحفوظ (يُختار أول مرة ويمكن تغييره هنا) */}
        <LinkRow icon="navigate" iconColor={COLORS.blue} bg={COLORS.blueSoft} label="تطبيق الملاحة"
          sub={navApp ? `${NAV_APPS[navApp]} — اضغط للتغيير` : 'يُسأل عنه عند أول ملاحة'} onPress={chooseNav} delay={230} />

        <FadeIn delay={250}>
          <Press style={[styles.logoutBtn, loggingOut && { opacity: 0.7 }]} onPress={handleLogout} disabled={loggingOut} hapticStyle="medium" accessibilityLabel="تسجيل الخروج">
            {loggingOut ? <LoadingDots color={COLORS.red} /> : <Ionicons name="log-out-outline" size={20} color={COLORS.red} />}
            <Text style={styles.logoutText}>{loggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</Text>
          </Press>
        </FadeIn>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { alignItems: 'center', paddingBottom: 50, borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: '#FF5E3A' },
  orbA: { position: 'absolute', top: -60, right: -40, width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.12)' },
  orbB: { position: 'absolute', bottom: -50, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.07)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  avatarRing: { width: 100, height: 100, borderRadius: 50, padding: 4, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 10 },
  avatar: { flex: 1, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.65)' },
  avatarText: { fontSize: 38, fontWeight: '900', color: '#FFF' },
  verified: { position: 'absolute', bottom: 2, left: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.green, borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 23, fontWeight: '900', color: '#FFF' },
  phone: { fontSize: 14, color: 'rgba(255,255,255,0.92)', fontWeight: '500' },
  tierChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  tierText: { color: '#FFF', fontWeight: '800', fontSize: 12.5 },
  statsCard: { flexDirection: 'row-reverse', backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 2, paddingVertical: 14, marginBottom: 14 },
  statSep: { width: 1, backgroundColor: COLORS.line, marginVertical: 8 },
  statCell: { alignItems: 'center', paddingHorizontal: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11.5, color: COLORS.gray, marginTop: 2, fontWeight: '500' },
  section: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  pillBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 44, minWidth: 64, justifyContent: 'center', paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.line },
  pillPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { color: COLORS.sub, fontWeight: '800', fontSize: 13.5 },
  pillPrimaryText: { color: '#FFF', fontWeight: '800', fontSize: 13.5 },
  field: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  fieldIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 3, fontWeight: '500' },
  fieldValue: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  fieldInput: { fontSize: 15.5, color: COLORS.text, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.sm - 2, paddingHorizontal: 12, height: 46, backgroundColor: COLORS.card },
  fieldInputErr: { borderColor: COLORS.red, backgroundColor: COLORS.redSoft },
  fieldErr: { color: COLORS.red, fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  hintRow: { gap: 5, marginTop: 10 },
  hint: { flex: 1, fontSize: 12, color: COLORS.gray, fontWeight: '500' },
  linkBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, minHeight: 68, ...SHADOW.soft },
  linkIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.red, borderWidth: 2, borderColor: COLORS.card },
  errBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: COLORS.redSoft, borderRadius: RADIUS.md, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FBC9C4' },
  errText: { flex: 1, color: COLORS.redDeep, fontWeight: '800', fontSize: 13 },
  errBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: COLORS.red, borderRadius: RADIUS.xs, paddingHorizontal: 14, height: 44 },
  errBtnText: { color: '#FFF', fontWeight: '800' },
  linkText: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  linkSub: { color: COLORS.gray, fontWeight: '500', fontSize: 12, marginTop: 2 },
  chev: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: COLORS.redSoft, borderRadius: RADIUS.md, height: 58, justifyContent: 'center', marginTop: 6, borderWidth: 1, borderColor: '#FBC9C4' },
  logoutText: { color: COLORS.red, fontWeight: '800', fontSize: 16 },
});
