import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Switch, Share, Linking, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { pickImage } from '../utils/pickImage';
import { FadeIn } from '../components/Anim';
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
    { icon: 'location-outline', label: 'عناويني', onPress: () => navigation.navigate('Addresses') },
    { icon: 'receipt-outline', label: 'طلباتي', onPress: () => navigation.navigate('طلباتي') },
    { icon: 'heart-outline', label: 'مطاعمي المفضلة', onPress: () => navigation.navigate('Favorites') },
    { icon: 'notifications-outline', label: 'الإشعارات', onPress: () => navigation.navigate('Notifications') },
    { icon: 'chatbubbles-outline', label: 'الدعم والمساعدة', onPress: () => navigation.navigate('SupportChat') },
    { icon: 'star-outline', label: 'قيّم التطبيق', onPress: rateApp },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: tabInset + 24 }} keyboardShouldPersistTaps="handled">
      <LinearGradient colors={tierMeta.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: headerTop }]}>
        <LinearGradient colors={COLORS.gradients.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
        <TouchableOpacity style={styles.avatar} onPress={pickAvatar} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="تغيير الصورة الشخصية">
          {profile?.avatar
            ? <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
            : <Text style={styles.avatarText}>{displayName?.[0] || '؟'}</Text>}
          <View style={styles.avatarCam}>
            {uploadingAvatar ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="camera" size={14} color="#FFF" />}
          </View>
        </TouchableOpacity>
        <Text style={styles.headerName}>{displayName}</Text>
        <Text style={styles.headerPhone}>{profile?.phone || user?.phone || ''}</Text>
      </LinearGradient>

      <FadeIn delay={60}>
        <View style={styles.loyaltyCard}>
          <View style={styles.loyaltyRight}>
            <Text style={styles.tierEmoji}>{tierMeta.emoji}</Text>
            <View>
              <Text style={styles.tierLabel}>مستوى {tierMeta.label}</Text>
              <Text style={styles.points}>{profile?.loyalty_points || 0} نقطة</Text>
              <Text style={styles.pointsValue}>≈ {((profile?.loyalty_points || 0) * 0.05).toFixed(1)}₪ خصم</Text>
            </View>
          </View>
          <View style={styles.walletLeft}>
            <Text style={styles.walletLabel}>المحفظة</Text>
            <Text style={styles.walletBalance}>{parseFloat(profile?.wallet_balance || 0).toFixed(2)}₪</Text>
          </View>
        </View>
      </FadeIn>

      {!!profile?.referral_code && (
        <FadeIn delay={120}>
          <TouchableOpacity activeOpacity={0.9}
            onPress={() => Share.share({ message: `حمّل تطبيق وصلّي واستخدم كود الدعوة "${profile.referral_code}" لتحصل على 10₪ هدية! 🎁🛵` }).catch(() => {})}>
            <LinearGradient colors={COLORS.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.referCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.referTitle}>🎁 ادعُ أصدقاءك واربح</Text>
                <Text style={styles.referSub}>كودك: <Text style={styles.referCode}>{profile.referral_code}</Text> — أنت وصديقك تاخذوا 10₪</Text>
              </View>
              <Ionicons name="share-social" size={22} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </FadeIn>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
          {editing ? (
            <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
              <TouchableOpacity onPress={save} disabled={savingName}>
                {savingName ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={styles.linkTxt}>حفظ</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditing(false); setName(profile?.name || ''); }}><Text style={[styles.linkTxt, { color: COLORS.gray }]}>إلغاء</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)}><Text style={styles.linkTxt}>تعديل</Text></TouchableOpacity>
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
      </View>

      <View style={styles.section}>
        {MENU.map((item, i) => (
          <TouchableOpacity key={item.label} style={[styles.menuItem, i === MENU.length - 1 && { borderBottomWidth: 0 }]} onPress={item.onPress} activeOpacity={0.7} accessibilityRole="button">
            <View style={styles.menuRight}>
              <View style={styles.menuIcon}><Ionicons name={item.icon} size={19} color={COLORS.primary} /></View>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-back" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>المظهر 🌙</Text>
        <View style={styles.themeRow}>
          {[{ k: 'system', l: 'النظام', i: 'phone-portrait-outline' }, { k: 'light', l: 'فاتح', i: 'sunny-outline' }, { k: 'dark', l: 'داكن', i: 'moon-outline' }].map(o => {
            const active = (pref || 'system') === o.k;
            return (
              <TouchableOpacity key={o.k} style={[styles.themeChip, active && styles.themeChipOn]} onPress={() => setTheme(o.k)}
                accessibilityRole="radio" accessibilityState={{ selected: active }}>
                <Ionicons name={o.i} size={18} color={active ? '#FFF' : COLORS.sub} />
                <Text style={[styles.themeChipTxt, active && { color: '#FFF' }]}>{o.l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <View style={[styles.menuItem, { borderBottomWidth: 0 }]}>
          <View style={styles.menuRight}>
            <View style={styles.menuIcon}><Ionicons name="notifications" size={19} color={COLORS.primary} /></View>
            <View>
              <Text style={styles.menuLabel}>إشعارات الطلبات</Text>
              <Text style={styles.menuSub}>{notifs ? 'مفعّلة — بنبلغك بكل تحديث' : 'موقوفة — ما رح توصلك إشعارات'}</Text>
            </View>
          </View>
          <Switch value={notifs} onValueChange={toggleNotifs} disabled={notifBusy} trackColor={{ true: COLORS.primary, false: COLORS.border }} thumbColor="#FFF"
            accessibilityLabel="تفعيل إشعارات الطلبات" />
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} accessibilityRole="button"
        onPress={() => Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [{ text: 'إلغاء', style: 'cancel' }, { text: 'خروج', style: 'destructive', onPress: () => logout() }])}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteAccBtn}
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

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingBottom: 44, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 90 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 44 },
  avatarCam: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  avatarText: { fontSize: 34, fontWeight: '900', color: '#FFF' },
  headerName: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  headerPhone: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  loyaltyCard: { margin: 16, marginTop: -26, backgroundColor: C.card, borderRadius: 22, padding: 18, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', ...C.shadow.card },
  loyaltyRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  tierEmoji: { fontSize: 32 },
  tierLabel: { fontSize: 12, color: C.gray, fontWeight: '600', textAlign: 'right' },
  points: { fontSize: 18, fontWeight: '900', color: C.text, textAlign: 'right' },
  pointsValue: { fontSize: 11.5, color: C.primary, fontWeight: '700', marginTop: 1, textAlign: 'right' },
  walletLeft: { alignItems: 'flex-start' },
  walletLabel: { fontSize: 12, color: C.gray },
  walletBalance: { fontSize: 20, fontWeight: '900', color: C.primary },
  referCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 16, ...C.shadow.float },
  referTitle: { color: '#FFF', fontWeight: '900', fontSize: 15, textAlign: 'right' },
  referSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 3, textAlign: 'right' },
  referCode: { fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  section: { backgroundColor: C.card, borderRadius: 20, marginHorizontal: 16, marginBottom: 12, padding: 16, ...C.shadow.soft },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'right' },
  linkTxt: { color: C.primary, fontWeight: '800', fontSize: 14 },
  field: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  fieldLabel: { fontSize: 12, color: C.gray, marginBottom: 4, textAlign: 'right' },
  fieldValue: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'right' },
  fieldInput: { fontSize: 15, color: C.text, borderWidth: 1.5, borderColor: C.primary, borderRadius: 10, padding: 9, backgroundColor: C.inputBg },
  menuItem: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line },
  menuRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flex: 1 },
  menuIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'right' },
  menuSub: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right' },
  themeRow: { flexDirection: 'row-reverse', gap: 8 },
  themeChip: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg },
  themeChipOn: { backgroundColor: C.primary, borderColor: C.primary },
  themeChipTxt: { fontSize: 13, fontWeight: '700', color: C.sub },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 16, justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: C.dangerBorder },
  logoutText: { color: C.red, fontWeight: '800', fontSize: 16 },
  deleteAccBtn: { alignItems: 'center', paddingVertical: 10, marginHorizontal: 16 },
  deleteAccText: { color: C.faint, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  version: { textAlign: 'center', color: C.faint, fontSize: 12, marginTop: 6 },
});
