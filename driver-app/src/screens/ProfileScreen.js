import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', vehicle_type: '', vehicle_number: '' });

  useEffect(() => {
    api.get('/users/profile').then(d => {
      setProfile(d.data);
      setForm({ name: d.data.name, vehicle_type: d.data.vehicle_type || '', vehicle_number: d.data.vehicle_number || '' });
    });
  }, []);

  const save = async () => {
    try {
      await api.patch('/users/profile', form);
      setProfile(p => ({ ...p, ...form }));
      setEditing(false);
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
  };

  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: logout }
    ]);
  };

  const tier = profile?.loyalty_tier || 'bronze';
  const tierColors = { bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', platinum: '#E5E4E2' };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: tierColors[tier] }]}>
          <Text style={styles.avatarText}>{profile?.name?.[0] || '?'}</Text>
        </View>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.phone}>{profile?.phone}</Text>
        <View style={[styles.tierBadge, { backgroundColor: tierColors[tier] }]}>
          <Text style={styles.tierText}>{tier.toUpperCase()}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'الرصيد', value: `${parseFloat(profile?.wallet_balance || 0).toFixed(2)}₪`, icon: '💰' },
          { label: 'التقييم', value: parseFloat(profile?.rating || 0).toFixed(1), icon: '⭐' },
        ].map((s, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Info Form */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
          <TouchableOpacity onPress={() => editing ? save() : setEditing(true)}>
            <Text style={styles.editBtn}>{editing ? 'حفظ' : 'تعديل'}</Text>
          </TouchableOpacity>
        </View>

        {[
          { label: 'الاسم', key: 'name' },
          { label: 'نوع المركبة', key: 'vehicle_type', placeholder: 'دراجة / سيارة' },
          { label: 'رقم المركبة', key: 'vehicle_number' },
        ].map(f => (
          <View key={f.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            {editing ? (
              <TextInput style={styles.fieldInput} value={form[f.key]} onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} />
            ) : (
              <Text style={styles.fieldValue}>{form[f.key] || '-'}</Text>
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#FFF', borderRadius: 20, marginBottom: 16, elevation: 2 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#FFF' },
  name: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  phone: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  tierBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  tierText: { fontSize: 11, fontWeight: '900', color: '#FFF' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', elevation: 2 },
  statIcon: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  editBtn: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  field: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  fieldLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 4 },
  fieldValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  fieldInput: { fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 8, padding: 8 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF0EE', borderRadius: 16, padding: 16, justifyContent: 'center', elevation: 2 },
  logoutText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
});
