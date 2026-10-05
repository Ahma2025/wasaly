import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useAuth } from '../context/AuthContext';
import { useTabBarOffset } from '../components/FloatingTabBar';
import { COLORS, GRADIENTS, SHADOW, RTL } from '../theme';
import { PopIn, Skeleton } from '../components/Anim';
import { money, num } from '../utils/format';

const TIERS = {
  bronze:   { label: 'برونزي', grad: ['#E8A15C', '#B5651D'] },
  silver:   { label: 'فضّي',   grad: ['#C9CED6', '#8A90A0'] },
  gold:     { label: 'ذهبي',   grad: ['#FFCF33', '#FF9A00'] },
  platinum: { label: 'بلاتيني', grad: ['#7B79F0', '#4B49C9'] },
};

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { contentPadding } = useTabBarOffset();
  const { user, logout, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
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
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(false); setRefreshing(false); };

  const startEdit = () => { setName(profile?.name || user?.name || ''); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setName(''); };

  const save = async () => {
    const n = name.trim();
    if (n.length < 2) return Alert.alert('الاسم قصير', 'أدخل اسماً من حرفين على الأقل');
    setSaving(true);
    try {
      await api.put('/users/profile', { name: n });
      const next = { ...(profile || {}), name: n };
      setProfile(next);
      writeCache('driver_profile', next);
      await updateUser({ name: n }); // ينعكس فوراً في الرئيسية وفي التخزين
      setEditing(false);
    } catch (e) {
      Alert.alert('تعذّر الحفظ', e?.message || 'حاول مرة أخرى');
    } finally { setSaving(false); }
  };

  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'سيتم إيقاف استقبال الطلبات وتسجيل خروجك. متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: async () => { setLoggingOut(true); await logout(); } },
    ]);
  };

  const tierKey = profile?.loyalty_tier;
  const tier = tierKey ? TIERS[tierKey] : null;
  const displayName = profile?.name || user?.name;
  const rating = num(profile?.rating);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: contentPadding }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} progressViewOffset={insets.top} />}>
      <LinearGradient colors={tier ? tier.grad : GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 24 }]}>
        <View style={styles.headerGlow} />
        <View style={styles.avatar}><Text style={styles.avatarText}>{displayName?.[0] || '؟'}</Text></View>
        {displayName ? <Text style={styles.name}>{displayName}</Text> : <Skeleton width={140} height={20} style={{ backgroundColor: 'rgba(255,255,255,0.3)' }} />}
        {!!(profile?.phone || user?.phone) && <Text style={styles.phone}>{profile?.phone || user?.phone}</Text>}
        {tier && (
          <View style={styles.tierChip}>
            <Ionicons name="ribbon" size={14} color="#FFF" />
            <Text style={styles.tierText}>مستوى {tier.label}</Text>
          </View>
        )}
      </LinearGradient>

      <View style={{ paddingHorizontal: 16 }}>
        <View style={styles.statsRow}>
          {[
            { label: 'الرصيد', value: profile ? money(profile.wallet_balance) : null, icon: 'wallet', color: COLORS.green, bg: COLORS.greenSoft },
            { label: 'التقييم', value: profile ? (rating > 0 ? rating.toFixed(1) : '—') : null, icon: 'star', color: COLORS.star, bg: COLORS.amberSoft },
            { label: 'التوصيلات', value: profile ? String(profile.total_deliveries || 0) : null, icon: 'cube', color: COLORS.blue, bg: COLORS.blueSoft },
          ].map((s, i) => (
            <PopIn key={s.label} delay={i * 70} style={{ flex: 1 }}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: s.bg }]}><Ionicons name={s.icon} size={17} color={s.color} /></View>
                {s.value == null ? <Skeleton width={50} height={18} style={{ marginVertical: 2 }} /> : <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>}
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </PopIn>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
            {editing ? (
              <View style={[RTL.row, { gap: 14 }]}>
                <TouchableOpacity onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.editBtn}>حفظ</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelEdit} disabled={saving}><Text style={styles.cancelBtn}>إلغاء</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={startEdit}><Text style={styles.editBtn}>تعديل</Text></TouchableOpacity>
            )}
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, RTL.text]}>الاسم</Text>
            {editing ? (
              <TextInput style={styles.fieldInput} value={name} onChangeText={setName} textAlign="right" autoFocus maxLength={60} returnKeyType="done" onSubmitEditing={save} />
            ) : <Text style={[styles.fieldValue, RTL.text]}>{displayName || '-'}</Text>}
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, RTL.text]}>نوع المركبة</Text>
            <Text style={[styles.fieldValue, RTL.text]}>{profile?.vehicle_type || '-'}</Text>
          </View>
          <View style={[styles.field, { borderBottomWidth: 0 }]}>
            <Text style={[styles.fieldLabel, RTL.text]}>رقم المركبة</Text>
            <Text style={[styles.fieldValue, RTL.text]}>{profile?.vehicle_plate || '-'}</Text>
          </View>
          <Text style={[styles.hint, RTL.text]}>لتعديل بيانات المركبة تواصل مع الإدارة</Text>
        </View>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Reviews')} activeOpacity={0.85}>
          <View style={[styles.linkIcon, { backgroundColor: COLORS.amberSoft }]}><Ionicons name="star" size={18} color={COLORS.star} /></View>
          <Text style={styles.linkText}>تقييماتي</Text>
          <Ionicons name="chevron-back" size={18} color={COLORS.faint} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('SupportChat')} activeOpacity={0.85}>
          <View style={[styles.linkIcon, { backgroundColor: COLORS.greenSoft }]}><Ionicons name="headset" size={18} color={COLORS.green} /></View>
          <Text style={styles.linkText}>الدعم الفني</Text>
          <Ionicons name="chevron-back" size={18} color={COLORS.faint} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.logoutBtn, loggingOut && { opacity: 0.7 }]} onPress={handleLogout} disabled={loggingOut} activeOpacity={0.85}>
          {loggingOut ? <ActivityIndicator color={COLORS.red} /> : <Ionicons name="log-out-outline" size={20} color={COLORS.red} />}
          <Text style={styles.logoutText}>{loggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { alignItems: 'center', paddingBottom: 30, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', marginBottom: 16, ...SHADOW.float },
  headerGlow: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.12)' },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' },
  avatarText: { fontSize: 36, fontWeight: '900', color: '#FFF' },
  name: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  phone: { fontSize: 14, color: 'rgba(255,255,255,0.92)', marginTop: 4, fontWeight: '600' },
  tierChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  tierText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  statsRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 16 },
  statCard: { backgroundColor: COLORS.card, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', ...SHADOW.soft },
  statIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 2, fontWeight: '600' },
  section: { backgroundColor: COLORS.card, borderRadius: 20, padding: 16, marginBottom: 14, ...SHADOW.soft },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  editBtn: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  cancelBtn: { color: COLORS.gray, fontWeight: '700', fontSize: 14 },
  field: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  fieldLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 4, fontWeight: '600' },
  fieldValue: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  fieldInput: { fontSize: 15, color: COLORS.text, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: COLORS.inputBg },
  hint: { fontSize: 11.5, color: COLORS.faint, marginTop: 8 },
  linkBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 18, padding: 14, marginBottom: 10, ...SHADOW.soft },
  linkIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  linkText: { flex: 1, color: COLORS.text, fontWeight: '800', fontSize: 15, textAlign: 'right' },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: COLORS.redSoft, borderRadius: 18, padding: 16, justifyContent: 'center', marginTop: 6 },
  logoutText: { color: COLORS.red, fontWeight: '800', fontSize: 16 },
});
