import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', bg: '#F8F9FA' };

export default function EarningsScreen() {
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => { fetchEarnings(); }, [period]);

  const fetchEarnings = async () => {
    setHasError(false);
    try {
      const res = await api.get(`/drivers/earnings?period=${period}`);
      setData(res.data);
    } catch (e) {
      console.error('fetchEarnings error:', e);
      setHasError(true);
    } finally { setLoading(false); }
  };

  const periods = [{ id: 'today', label: 'اليوم' }, { id: 'week', label: 'الأسبوع' }, { id: 'month', label: 'الشهر' }];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>الأرباح</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Error Banner */}
        {hasError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>فشل تحميل البيانات</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchEarnings}>
              <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodRow}>
          {periods.map(p => (
            <TouchableOpacity key={p.id} style={[styles.periodBtn, period === p.id && styles.periodBtnActive]} onPress={() => setPeriod(p.id)}>
              <Text style={[styles.periodText, period === p.id && { color: '#FFF' }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>إجمالي الأرباح</Text>
          <Text style={styles.summaryAmount}>{parseFloat(data?.stats?.earnings || 0).toFixed(2)}₪</Text>
          <Text style={styles.summaryDeliveries}>{data?.stats?.deliveries || 0} توصيلة</Text>
        </View>

        {/* Wallet */}
        <View style={styles.walletCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="wallet" size={24} color={COLORS.primary} />
            <View>
              <Text style={styles.walletLabel}>رصيد المحفظة</Text>
              <Text style={styles.walletAmount}>{parseFloat(data?.wallet_balance || 0).toFixed(2)}₪</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.withdrawBtn} onPress={() => Alert.alert('قريباً', 'ميزة السحب قيد التطوير')}>
            <Text style={styles.withdrawBtnText}>سحب</Text>
          </TouchableOpacity>
        </View>

        {/* Daily breakdown */}
        <Text style={styles.sectionTitle}>التفاصيل اليومية</Text>
        {data?.daily?.map((day, i) => (
          <View key={i} style={styles.dayRow}>
            <Text style={styles.dayDate}>{day.date}</Text>
            <Text style={styles.dayCount}>{day.count} توصيلة</Text>
            <Text style={styles.dayEarnings}>{parseFloat(day.earnings).toFixed(2)}₪</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { flex: 1, padding: 11, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center', borderWidth: 1.5, borderColor: '#EDEDF0' },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, elevation: 3, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } },
  periodText: { fontWeight: '700', color: COLORS.text, fontSize: 13 },
  summaryCard: { backgroundColor: COLORS.primary, borderRadius: 24, padding: 26, alignItems: 'center', marginBottom: 16, elevation: 8, shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  summaryTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  summaryAmount: { color: '#FFF', fontSize: 42, fontWeight: '900', marginVertical: 4 },
  summaryDeliveries: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  walletCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, elevation: 3, shadowColor: '#1A1A2E', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  walletLabel: { fontSize: 12, color: COLORS.gray },
  walletAmount: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  withdrawBtn: { backgroundColor: '#FFF5EE', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1.5, borderColor: COLORS.primary },
  withdrawBtnText: { color: COLORS.primary, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  dayRow: { backgroundColor: '#FFF', borderRadius: 14, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, elevation: 1, shadowColor: '#1A1A2E', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  dayDate: { fontSize: 13, color: COLORS.gray, flex: 1 },
  dayCount: { fontSize: 13, color: COLORS.text, flex: 1, textAlign: 'center' },
  dayEarnings: { fontSize: 14, fontWeight: '800', color: COLORS.primary, flex: 1, textAlign: 'left' },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FFD0D0' },
  errorText: { color: '#D00', fontWeight: '700', marginBottom: 10 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
});
