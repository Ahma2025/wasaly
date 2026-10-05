import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Switch, Share, Linking, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { pickImage } from '../utils/pickImage';
import { Animated, Easing } from 'react-native';
import { FadeIn, PopIn, Press } from '../components/Anim';
import { AnimatedNumber } from '../components/UI';
import { HeroDecor } from '../components/GradientHeader';
import { useReducedMotion } from '../utils/motion';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useHeaderTop } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';
import { getNotificationsEnabled, setNotificationsEnabled } from '../utils/pushNotifications';
import { storeUrl, storeWebUrl } from '../config';

const TIER_META = {
  bronze:   { grad: ['#E8A15C', '#B5651D'], emoji: '🥉', label: 'برونز' },
  silver:   { grad: ['#B9BEC8', '#7F8696'], emoji: '🥈', label: 'فضي' },
  gold:     { grad: ['#FFCF33', '#FF9A00'], emoji: '🥇', label: 'ذهبي' },
  platinum: { grad: ['#7B79F0', '#4B49C9'], emoji: '💎', label: 'بلاتيني' },
};

export default function ProfileScreen({ navigation }) {
  const { user, logout, updateUser } = useAuth();
  const { colors, pref, setTheme } = useTheme();
  const COLORS = colors;
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const headerTop = useHeaderTop(16);
  const tabInset = useTabBarInset();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [notifs, setNotifs] = useState(true);
  const [notifBusy, setNotifBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => { getNotificationsEnabled().then(setNotifs).catch(() => {}); }, []);

  // المحفظة والنقاط تتغير بعد كل طلب — نحدّث مع كل دخول للتبويب
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const cached = await readCache('profile');
      if (alive && cached && !profile) { setProfile(cached); setName(cached.name || ''); }
      try {
        const d = await api.get('/users/profile');
        if (!alive || !d?.data) return;
        setProfile(d.data);
        if (!editing) setName(d.data.name || '');
        writeCache('profile', d.data);
      } catch {}
    })();
    return () => { alive = false; };
  }, [editing]));

  const save = async () => {
    const n = name.trim();
    if (n.length < 2) return Alert.alert('الاسم', 'أدخل اسمك (حرفين على الأقل)');
    setSavingName(true);
    try {
      await api.put('/users/profile', { name: n });
      setProfile(p => ({ ...p, name: n }));
      updateUser({ name: n }); // تحديث التحية بالرئيسية + التخزين الآمن
      writeCache('profile', { ...(profile || {}), name: n });
      setEditing(false);
    } catch (e) { Alert.alert('خطأ', e?.message || 'حاول مرة أخرى'); }
    finally { setSavingName(false); }
  };

  const pickAvatar = async () => {
    try {
      const asset = await pickImage({ allowsEditing: true, aspect: [1, 1], quality: 0.6 });
      if (!asset) return;
      setUploadingAvatar(true);
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: 'avatar.jpg', type: 'image/jpeg' });
      const up = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (up.url) {
        await api.put('/users/profile', { avatar: up.url });
        setProfile(p => ({ ...p, avatar: up.url }));
        updateUser({ avatar: up.url });
      }
    } catch { Alert.alert('خطأ', 'فشل رفع الصورة'); }
    finally { setUploadingAvatar(false); }
  };

  const toggleNotifs = async (v) => {
    setNotifBusy(true);
    setNotifs(v);
    const ok = await setNotificationsEnabled(v);
    if (v && !ok) {
      setNotifs(false);
      await setNotificationsEnabled(false);
      Alert.alert('الإشعارات', 'ما قدرنا نفعّل الإشعارات. اسمح بالإشعارات لتطبيق وصلّي من إعدادات الهاتف.', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'الإعدادات', onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
    }
    setNotifBusy(false);
  };

  const rateApp = () => {
    Linking.openURL(storeUrl()).catch(() => Linking.openURL(storeWebUrl()).catch(() => {}));
  };

  const tier = String(profile?.loyalty_tier || 'bronze').toLowerCase();
  const tierMeta = TIER_META[tier] || TIER_META.bronze;
  const displayName = profile?.name || user?.name || '';
  const version = Constants.nativeAppVersion || Constants.expoConfig?.version || '';

  const MENU = [
    { icon: 'location', color: '#FF6B00', label: 'عناويني', sub: 'البيت، الشغل وغيرها', onPress: () => navigation.navigate('Addresses') },
    { icon: 'receipt', color: '#2E90FA', label: 'طلباتي', sub: 'تتبّع وأعد الطلب', onPress: () => navigation.navigate('طلباتي') },
    { icon: 'heart', color: '#F04438', label: 'مطاعمي المفضلة', onPress: () => navigation.navigate('Favorites') },
    { icon: 'notifications', color: '#7C5CFA', label: 'الإشعارات', onPress: () => navigation.navigate('Notifications') },
    { icon: 'chatbubbles', color: '#1DB954', label: 'الدعم والمساعدة', sub: 'تشات مباشر مع فريقنا', onPress: () => navigation.navigate('SupportChat') },
    { icon: 'star', color: '#FFB020', label: 'قيّم التطبيق', onPress: rateApp },
  ];
  const points = parseInt(profile?.loyalty_points || 0, 10) || 0;
  const wallet = parseFloat(profile?.wallet_balance || 0) || 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: tabInset + 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: headerTop }]}>
        <HeroDecor />
        <PopIn>
          <TouchableOpacity style={styles.avatar} onPress={pickAvatar} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="تغيير الصورة الشخصية">
            {profile?.avatar
              ? <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
              : <Text style={styles.avatarText}>{displayName?.[0] || '؟'}</Text>}
            <View style={styles.avatarCam}>
              {uploadingAvatar ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="camera" size={14} color="#FFF" />}
            </View>
          </TouchableOpacity>
        </PopIn>
        <FadeIn delay={80} style={{ alignItems: 'center' }}>
          <Text style={styles.headerName}>{displayName}</Text>
          <View style={styles.phonePill}>
            <Ionicons name="call" size={12} color="#FFF" />
            <Text style={styles.headerPhone}>{profile?.phone || user?.phone || ''}</Text>
          </View>
        </FadeIn>
      </LinearGradient>

      {/* بطاقة المستوى (لمعة متحرّكة) */}
      <FadeIn delay={60} from={24}>
        <TierCard tierMeta={tierMeta} points={points} wallet={wallet} C={COLORS} styles={styles} />
      </FadeIn>

      {!!profile?.referral_code && (
        <FadeIn delay={120}>
          <Press scaleTo={0.97} style={{ marginHorizontal: 16, marginBottom: 12 }} accessibilityRole="button" accessibilityLabel="شارك كود الدعوة"
            onPress={() => Share.share({ message: `حمّل تطبيق وصلّي واستخدم كود الدعوة "${profile.referral_code}" لتحصل على 10₪ هدية! 🎁🛵` }).catch(() => {})}>
            <View style={styles.referCard}>
              <LinearGradient colors={COLORS.gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.referIcon}>
                <Ionicons name="gift" size={22} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.referTitle}>ادعُ أصدقاءك واربح</Text>
                <Text style={styles.referSub}>أنت وصديقك تاخذوا 10₪</Text>
              </View>
              <View style={styles.codePill}>
                <Text style={styles.referCode}>{profile.referral_code}</Text>
                <Ionicons name="share-social" size={14} color={COLORS.primary} />
              </View>
            </View>
          </Press>
        </FadeIn>
      )}

      <FadeIn delay={160} style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
          {editing ? (
            <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
              <TouchableOpacity onPress={save} disabled={savingName} accessibilityRole="button">
                {savingName ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={styles.linkTxt}>حفظ</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditing(false); setName(profile?.name || ''); }} accessibilityRole="button"><Text style={[styles.linkTxt, { color: COLORS.gray }]}>إلغاء</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} style={styles.editPill} accessibilityRole="button" accessibilityLabel="تعديل الاسم">
              <Ionicons name="create-outline" size={14} color={COLORS.primary} />
              <Text style={styles.linkTxt}>تعديل</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>الاسم</Text>
          {editing
            ? <TextInput style={styles.fieldInput} value={name} onChangeText={setName} textAlign="right" autoFocus maxLength={50} returnKeyType="done" onSubmitEditing={save} />
            : <Text style={styles.fieldValue}>{displayName || '—'}</Text>}
        </View>
        <View style={[styles.field, { borderBottomWidth: 0 }]}>
          <Text style={styles.fieldLabel}>الهاتف</Text>
          <Text style={styles.fieldValue}>{profile?.phone || user?.phone || '—'}</Text>
        </View>
      </FadeIn>

      <FadeIn delay={200} style={styles.section}>
        {MENU.map((item, i) => (
          <Press key={item.label} haptic={false} scaleTo={0.98} style={[styles.menuItem, i === MENU.length - 1 && { borderBottomWidth: 0 }]} onPress={item.onPress} accessibilityRole="button" accessibilityLabel={item.label}>
            <View style={styles.menuRight}>
              <View style={[styles.menuIcon, { backgroundColor: item.color + '1F' }]}><Ionicons name={item.icon} size={19} color={item.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                {!!item.sub && <Text style={styles.menuSub}>{item.sub}</Text>}
              </View>
            </View>
            <View style={styles.chev}><Ionicons name="chevron-back" size={15} color={COLORS.faint} /></View>
          </Press>
        ))}
      </FadeIn>

      <FadeIn delay={240} style={styles.section}>
        <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
          <Text style={styles.sectionTitle}>المظهر</Text>
          <Ionicons name="color-palette-outline" size={18} color={COLORS.primary} />
        </View>
        <View style={styles.themeRow}>
          {[{ k: 'system', l: 'النظام', i: 'phone-portrait-outline' }, { k: 'light', l: 'فاتح', i: 'sunny-outline' }, { k: 'dark', l: 'داكن', i: 'moon-outline' }].map(o => {
            const active = (pref || 'system') === o.k;
            return (
              <Press key={o.k} scaleTo={0.95} style={[styles.themeChip, active && styles.themeChipOn]} onPress={() => setTheme(o.k)}
                accessibilityRole="radio" accessibilityLabel={o.l}>
                {active && <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                <Ionicons name={o.i} size={20} color={active ? '#FFF' : COLORS.sub} />
                <Text style={[styles.themeChipTxt, active && { color: '#FFF' }]}>{o.l}</Text>
              </Press>
            );
          })}
        </View>
      </FadeIn>

      <FadeIn delay={280} style={styles.section}>
        <View style={[styles.menuItem, { borderBottomWidth: 0, paddingVertical: 4 }]}>
          <View style={styles.menuRight}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.tint }]}><Ionicons name="notifications" size={19} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>إشعارات الطلبات</Text>
              <Text style={styles.menuSub}>{notifs ? 'مفعّلة — بنبلغك بكل تحديث' : 'موقوفة — ما رح توصلك إشعارات'}</Text>
            </View>
          </View>
          <Switch value={notifs} onValueChange={toggleNotifs} disabled={notifBusy} trackColor={{ true: COLORS.primary, false: COLORS.border }} thumbColor="#FFF"
            accessibilityLabel="تفعيل إشعارات الطلبات" />
        </View>
      </FadeIn>

      <TouchableOpacity style={styles.logoutBtn} accessibilityRole="button"
        onPress={() => Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [{ text: 'إلغاء', style: 'cancel' }, { text: 'خروج', style: 'destructive', onPress: () => logout() }])}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteAccBtn}
        accessibilityRole="button"
        onPress={() => Alert.alert('حذف الحساب', 'سيتم حذف حسابك وبياناتك نهائياً. هل أنت متأكد؟', [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'حذف نهائياً', style: 'destructive', onPress: async () => {
              try { await api.delete('/users/me'); logout({ remote: false }); }
              catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
            },
          },
        ])}
      >
        <Text style={styles.deleteAccText}>حذف الحساب نهائياً</Text>
      </TouchableOpacity>
      {!!version && <Text style={styles.version}>وصلّي · الإصدار {version}</Text>}
    </ScrollView>
  );
}

/* بطاقة المستوى: متدرّجة بلون المستوى + لمعة تمرّ كل بضع ثوانٍ */
function TierCard({ tierMeta, points, wallet, C, styles }) {
  const reduce = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const l = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [reduce]);
  const tx = sweep.interpolate({ inputRange: [0, 1], outputRange: [380, -260] });
  return (
    <View style={styles.tierShadow}>
      <LinearGradient colors={tierMeta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tierCard}>
        <View style={styles.tierOrb} />
        {!reduce && (
          <Animated.View pointerEvents="none" style={[styles.sweep, { transform: [{ translateX: tx }, { rotate: '18deg' }] }]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        )}
        <View style={styles.tierTop}>
          <View style={styles.tierBadge}><Text style={{ fontSize: 20 }}>{tierMeta.emoji}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tierCaption}>عضوية وصلّي</Text>
            <Text style={styles.tierLabel}>مستوى {tierMeta.label}</Text>
          </View>
          <Ionicons name="sparkles" size={20} color="rgba(255,255,255,0.85)" />
        </View>
        <View style={styles.tierStats}>
          <View style={styles.tierStat}>
            <Text style={styles.tierStatLbl}>النقاط</Text>
            <AnimatedNumber value={points} decimals={0} style={styles.tierStatVal} />
            <Text style={styles.tierStatSub}>≈ {(points * 0.05).toFixed(1)}₪ خصم</Text>
          </View>
          <View style={styles.tierDivider} />
          <View style={styles.tierStat}>
            <Text style={styles.tierStatLbl}>المحفظة</Text>
            <AnimatedNumber value={wallet} suffix="₪" style={styles.tierStatVal} />
            <Text style={styles.tierStatSub}>رصيد جاهز للاستخدام</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingBottom: 56, alignItems: 'center', borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' },
  avatar: { width: 96, height: 96, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 31 },
  avatarCam: { position: 'absolute', bottom: -4, left: -4, width: 30, height: 30, borderRadius: 15, backgroundColor: '#14142B', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  avatarText: { fontSize: 38, fontWeight: '900', color: '#FFF' },
  headerName: { fontSize: 23, fontWeight: '900', color: '#FFF' },
  phonePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  headerPhone: { fontSize: 13, color: '#FFF', fontWeight: '700' },
  tierShadow: { marginHorizontal: 16, marginTop: -36, marginBottom: 14, borderRadius: 26, ...C.shadow.card },
  tierCard: { borderRadius: 26, padding: 18, overflow: 'hidden' },
  tierOrb: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -70, left: -50, backgroundColor: 'rgba(255,255,255,0.14)' },
  sweep: { position: 'absolute', top: -40, bottom: -40, width: 90 },
  tierTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 16 },
  tierBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  tierCaption: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontWeight: '500', textAlign: 'right' },
  tierLabel: { fontSize: 18, color: '#FFF', fontWeight: '900', textAlign: 'right' },
  tierStats: { flexDirection: 'row-reverse', backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 18, padding: 12 },
  tierStat: { flex: 1, alignItems: 'center' },
  tierStatLbl: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  tierStatVal: { fontSize: 22, color: '#FFF', fontWeight: '900', marginTop: 2 },
  tierStatSub: { fontSize: 10.5, color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginTop: 1 },
  tierDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: 4 },
  referCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  referIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  referTitle: { color: C.text, fontWeight: '900', fontSize: 15, textAlign: 'right' },
  referSub: { color: C.gray, fontSize: 12, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  codePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: C.tint, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: C.tintBorder, borderStyle: 'dashed' },
  referCode: { fontWeight: '900', color: C.primary, fontSize: 13 },
  section: { backgroundColor: C.card, borderRadius: 24, marginHorizontal: 16, marginBottom: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: C.text, textAlign: 'right' },
  editPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  linkTxt: { color: C.primary, fontWeight: '800', fontSize: 13.5 },
  field: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  fieldLabel: { fontSize: 12, color: C.gray, marginBottom: 4, textAlign: 'right', fontWeight: '500' },
  fieldValue: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'right' },
  fieldInput: { fontSize: 15, color: C.text, borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, padding: 10, backgroundColor: C.inputBg },
  menuItem: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  menuRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flex: 1 },
  menuIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'right' },
  menuSub: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  chev: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' },
  themeRow: { flexDirection: 'row-reverse', gap: 8 },
  themeChip: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg, overflow: 'hidden' },
  themeChipOn: { borderColor: 'transparent' },
  themeChipTxt: { fontSize: 13, fontWeight: '800', color: C.sub },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: C.dangerBg, borderRadius: 18, padding: 16, justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: C.dangerBorder },
  logoutText: { color: C.red, fontWeight: '800', fontSize: 16 },
  deleteAccBtn: { alignItems: 'center', paddingVertical: 10, marginHorizontal: 16 },
  deleteAccText: { color: C.faint, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  version: { textAlign: 'center', color: C.faint, fontSize: 12, marginTop: 6 },
});
