import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', bg: '#F8F9FA' };

export default function EarningsScreen() {
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEarnings(); }, [period]);

  const fetchEarnings = async () => {
    try {
      const res = await api.get(`/drivers/earnings?period=${period}`);
      setData(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  const periods = [{ id: 'today', label: 'اليوم' }, { id: 'week', label: 'الأسبوع' }, { id: 'month', label: 'الشهر' }];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>الأرباح</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
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
          <TouchableOpacity style={styles.withdrawBtn}>
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
  periodBtn: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', borderWidth: 1, borderColor: '#E5E5EA' },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { fontWeight: '700', color: COLORS.text, fontSize: 13 },
  summaryCard: { backgroundColor: COLORS.primary, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  summaryTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  summaryAmount: { color: '#FFF', fontSize: 40, fontWeight: '900', marginVertical: 4 },
  summaryDeliveries: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  walletCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, elevation: 2 },
  walletLabel: { fontSize: 12, color: COLORS.gray },
  walletAmount: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  withdrawBtn: { backgroundColor: '#FFF5EE', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.primary },
  withdrawBtnText: { color: COLORS.primary, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  dayRow: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dayDate: { fontSize: 13, color: COLORS.gray, flex: 1 },
  dayCount: { fontSize: 13, color: COLORS.text, flex: 1, textAlign: 'center' },
  dayEarnings: { fontSize: 14, fontWeight: '800', color: COLORS.primary, flex: 1, textAlign: 'left' }
});
