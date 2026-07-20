import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA', green: '#34C759' };

const TIER_META = { bronze: { color: '#CD7F32', emoji: '🥉', label: 'برونز' }, silver: { color: '#C0C0C0', emoji: '🥈', label: 'فضي' }, gold: { color: '#FFD700', emoji: '🥇', label: 'ذهبي' }, platinum: { color: '#5856D6', emoji: '💎', label: 'بلاتيني' } };

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [notifs, setNotifs] = useState(true);

  useEffect(() => {
    api.get('/users/profile').then(d => { setProfile(d.data); setName(d.data.name); });
  }, []);

  const save = async () => {
    try { await api.put('/users/profile', { name }); setProfile(p => ({ ...p, name })); setEditing(false); }
    catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
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
        <View style={styles.avatar}><Text style={styles.avatarText}>{profile?.name?.[0] || '?'}</Text></View>
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

      <TouchableOpacity style={styles.logoutBtn} onPress={() => Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [{ text: 'إلغاء', style: 'cancel' }, { text: 'خروج', style: 'destructive', onPress: logout }])}>
        <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 60, paddingBottom: 32, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#FFF' },
  headerName: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  headerPhone: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  loyaltyCard: { margin: 16, backgroundColor: '#FFF', borderRadius: 20, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 3 },
  loyaltyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierEmoji: { fontSize: 32 },
  tierLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  points: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  pointsValue: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 1 },
  walletRight: { alignItems: 'flex-end' },
  walletLabel: { fontSize: 12, color: COLORS.gray },
  walletBalance: { fontSize: 20, fontWeight: '900', color: COLORS.primary },
  section: { backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 16, marginBottom: 12, padding: 16, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  field: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  fieldLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 3 },
  fieldValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  fieldInput: { fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 8, padding: 8 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF0EE', borderRadius: 16, padding: 16, justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, elevation: 1 },
  logoutText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
});
