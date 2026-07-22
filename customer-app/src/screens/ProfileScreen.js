import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Switch, Share, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const TIER_META = { bronze: { color: '#CD7F32', emoji: '🥉', label: 'برونز' }, silver: { color: '#C0C0C0', emoji: '🥈', label: 'فضي' }, gold: { color: '#FFD700', emoji: '🥇', label: 'ذهبي' }, platinum: { color: '#5856D6', emoji: '💎', label: 'بلاتيني' } };

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { colors, pref, setTheme } = useTheme();
  const COLORS = colors;
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [notifs, setNotifs] = useState(true);

  useEffect(() => {
    api.get('/users/profile').then(d => { setProfile(d.data); setName(d.data.name); });
  }, []);

  const save = async () => {
    try { await api.put('/users/profile', { name, email: profile?.email || null, avatar: profile?.avatar || null }); setProfile(p => ({ ...p, name })); setEditing(false); }
    catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
  };

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('تنبيه', 'نحتاج إذن الصور');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.6 });
      if (res.canceled || !res.assets?.[0]) return;
      setUploadingAvatar(true);
      const asset = res.assets[0];
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: 'avatar.jpg', type: 'image/jpeg' });
      const up = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (up.url) {
        await api.put('/users/profile', { name: profile?.name, email: profile?.email || null, avatar: up.url });
        setProfile(p => ({ ...p, avatar: up.url }));
      }
    } catch { Alert.alert('خطأ', 'فشل رفع الصورة'); }
    finally { setUploadingAvatar(false); }
  };

  const tier = profile?.loyalty_tier || 'bronze';
  const tierMeta = TIER_META[tier];

  const MENU = [
    { icon: 'location-outline', label: 'عناويني', onPress: () => navigation.navigate('AddAddress') },
    { icon: 'receipt-outline', label: 'طلباتي', onPress: () => navigation.navigate('OrdersHistory') },
    { icon: 'notifications-outline', label: 'الإشعارات', onPress: () => navigation.navigate('Notifications') },
    { icon: 'help-circle-outline', label: 'الدعم', onPress: () => Alert.alert('الدعم', 'تواصل معنا على الرقم: 0599039704') },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: tierMeta.color }]}>
        <TouchableOpacity style={styles.avatar} onPress={pickAvatar} activeOpacity={0.8}>
          {profile?.avatar
            ? <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
            : <Text style={styles.avatarText}>{profile?.name?.[0] || '?'}</Text>}
          <View style={styles.avatarCam}><Ionicons name={uploadingAvatar ? 'hourglass' : 'camera'} size={14} color="#FFF" /></View>
        </TouchableOpacity>
        <Text style={styles.headerName}>{profile?.name}</Text>
        <Text style={styles.headerPhone}>{profile?.phone}</Text>
      </View>

      {/* Loyalty Card */}
      <View style={styles.loyaltyCard}>
        <View style={styles.loyaltyLeft}>
          <Text style={styles.tierEmoji}>{tierMeta.emoji}</Text>
          <View>
            <Text style={styles.tierLabel}>مستوى {tierMeta.label}</Text>
            <Text style={styles.points}>{profile?.loyalty_points || 0} نقطة</Text>
            <Text style={styles.pointsValue}>≈ {((profile?.loyalty_points || 0) / 100 * 5).toFixed(1)}₪ خصم</Text>
          </View>
        </View>
        <View style={styles.walletRight}>
          <Text style={styles.walletLabel}>المحفظة</Text>
          <Text style={styles.walletBalance}>{parseFloat(profile?.wallet_balance || 0).toFixed(2)}₪</Text>
        </View>
      </View>

      {/* دعوة الأصدقاء */}
      {!!profile?.referral_code && (
        <TouchableOpacity
          style={styles.referCard}
          onPress={() => Share.share({ message: `حمّل تطبيق وصلّي واستخدم كود الدعوة "${profile.referral_code}" لتحصل على 10₪ هدية! 🎁🛵` })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.referTitle}>🎁 ادعُ أصدقاءك واربح</Text>
            <Text style={styles.referSub}>كودك: <Text style={styles.referCode}>{profile.referral_code}</Text> — أنت وصديقك تاخذوا 10₪</Text>
          </View>
          <Ionicons name="share-social" size={22} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* Edit Name */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
          <TouchableOpacity onPress={() => editing ? save() : setEditing(true)}>
            <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{editing ? 'حفظ' : 'تعديل'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>الاسم</Text>
          {editing ? <TextInput style={styles.fieldInput} value={name} onChangeText={setName} /> : <Text style={styles.fieldValue}>{profile?.name}</Text>}
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>الهاتف</Text>
          <Text style={styles.fieldValue}>{profile?.phone}</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        {MENU.map((item, i) => (
          <TouchableOpacity key={i} style={styles.menuItem} onPress={item.onPress}>
            <View style={styles.menuLeft}>
              <Ionicons name={item.icon} size={22} color={COLORS.primary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-back" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        ))}
      </View>

      {/* المظهر (الوضع الليلي) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>المظهر 🌙</Text>
        <View style={styles.themeRow}>
          {[{ k: 'system', l: 'النظام', i: 'phone-portrait-outline' }, { k: 'light', l: 'فاتح', i: 'sunny-outline' }, { k: 'dark', l: 'داكن', i: 'moon-outline' }].map(o => {
            const active = (pref || 'system') === o.k;
            return (
              <TouchableOpacity key={o.k} style={[styles.themeChip, active && styles.themeChipOn]} onPress={() => setTheme(o.k)}>
                <Ionicons name={o.i} size={18} color={active ? '#FFF' : COLORS.sub} />
                <Text style={[styles.themeChipTxt, active && { color: '#FFF' }]}>{o.l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Notifications Toggle */}
      <View style={styles.section}>
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="notifications" size={22} color={COLORS.primary} />
            <Text style={styles.menuLabel}>الإشعارات</Text>
          </View>
          <Switch value={notifs} onValueChange={setNotifs} trackColor={{ true: COLORS.primary }} />
        </View>
      </View>

      <TouchableOpacity style={styles.rateAppBtn} onPress={() => navigation.navigate('Favorites')}>
        <Ionicons name="heart" size={20} color="#FF3B30" />
        <Text style={styles.rateAppText}>مطاعمي المفضلة</Text>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.rateAppBtn} onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.wasaly.customer')}>
        <Ionicons name="star" size={20} color="#FFB800" />
        <Text style={styles.rateAppText}>قيّم التطبيق ⭐</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [{ text: 'إلغاء', style: 'cancel' }, { text: 'خروج', style: 'destructive', onPress: logout }])}>
        <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteAccBtn}
        onPress={() => Alert.alert('حذف الحساب', 'سيتم حذف حسابك وبياناتك نهائياً. هل أنت متأكد؟', [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'حذف نهائياً', style: 'destructive', onPress: async () => {
            try { await api.delete('/users/me'); logout(); }
            catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
          } }
        ])}
      >
        <Text style={styles.deleteAccText}>حذف الحساب نهائياً</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 60, paddingBottom: 40, alignItems: 'center', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 42 },
  avatarCam: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.card },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#FFF' },
  headerName: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  headerPhone: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  loyaltyCard: { margin: 16, marginTop: -22, backgroundColor: COLORS.card, borderRadius: 20, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  loyaltyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierEmoji: { fontSize: 32 },
  tierLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  points: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  pointsValue: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 1 },
  referCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.primary, borderRadius: 18, padding: 16, elevation: 5, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  referTitle: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  referSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 3 },
  referCode: { fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  walletRight: { alignItems: 'flex-end' },
  walletLabel: { fontSize: 12, color: COLORS.gray },
  walletBalance: { fontSize: 20, fontWeight: '900', color: COLORS.primary },
  section: { backgroundColor: COLORS.card, borderRadius: 18, marginHorizontal: 16, marginBottom: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  field: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  fieldLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 3 },
  fieldValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  fieldInput: { fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, backgroundColor: COLORS.inputBg },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.inputBg },
  themeChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  themeChipTxt: { fontSize: 13, fontWeight: '700', color: COLORS.sub },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, elevation: 1 },
  logoutText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
  rateAppBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, elevation: 1 },
  rateAppText: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  deleteAccBtn: { alignItems: 'center', paddingVertical: 10, marginHorizontal: 16 },
  deleteAccText: { color: COLORS.faint, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
