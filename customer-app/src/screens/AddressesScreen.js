import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import EmptyState from '../components/EmptyState';
import { CardRowSkeleton } from '../components/Skeleton';
import { FadeIn, GradientButton } from '../components/Anim';

export const addressLabel = (a) => a?.label || (a?.title && a.title !== a.address ? a.title : '') || 'عنوان';
const labelIcon = (l) => (String(l).includes('عمل') ? 'briefcase' : String(l).includes('منزل') ? 'home' : 'location');

// إدارة العناوين: عرض، تعيين افتراضي، تعديل، حذف، إضافة
export default function AddressesScreen({ navigation }) {
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/users/addresses');
      const l = d.data || [];
      setList(l); writeCache('addresses', l);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    (async () => {
      const cached = await readCache('addresses');
      if (cached) { setList(cached); setLoading(false); }
      load();
    })();
  }, [load]));

  const setDefault = async (a) => {
    if (a.is_default) return;
    setBusyId(a.id);
    try {
      // PUT يستبدل كل الحقول — نرسل العنوان كاملاً مع is_default
      await api.put(`/users/addresses/${a.id}`, {
        label: a.label, title: a.title, address: a.address, lat: a.lat, lng: a.lng, floor: a.floor, notes: a.notes, is_default: true,
      });
      await load();
    } catch (e) { Alert.alert('خطأ', e?.message || 'تعذّر تعيين العنوان الافتراضي'); }
    finally { setBusyId(null); }
  };

  const remove = (a) => {
    Alert.alert('حذف العنوان', `بدك تحذف «${addressLabel(a)}»؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: async () => {
          setBusyId(a.id);
          try { await api.delete(`/users/addresses/${a.id}`); await load(); }
          catch (e) { Alert.alert('خطأ', e?.message || 'تعذّر حذف العنوان'); }
          finally { setBusyId(null); }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <GradientHeader title="عناويني" subtitle={list.length ? `${list.length} عنوان محفوظ` : undefined}
        right={<TouchableOpacity onPress={() => navigation.navigate('AddAddress')} accessibilityLabel="إضافة عنوان"><Ionicons name="add" size={24} color="#FFF" /></TouchableOpacity>} />

      {loading ? (
        <View style={{ padding: 16 }}>{[0, 1, 2].map(i => <CardRowSkeleton key={i} />)}</View>
      ) : list.length === 0 ? (
        <EmptyState emoji="📍" title="ما في عناوين محفوظة" subtitle="أضف عنوان البيت أو الشغل حتى نوصلك أسرع وبسعر توصيل دقيق"
          ctaLabel="إضافة عنوان" onCta={() => navigation.navigate('AddAddress', { makeDefault: true })} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}>
          {list.map((a, i) => {
            const lbl = addressLabel(a);
            return (
              <FadeIn key={a.id} index={i} from={18}>
                <View style={[styles.card, a.is_default && { borderColor: C.primary }]}>
                  <View style={styles.row}>
                    <LinearGradient colors={a.is_default ? C.gradients.sunset : [C.tint, C.tint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
                      <Ionicons name={labelIcon(lbl)} size={20} color={a.is_default ? '#FFF' : C.primary} />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text style={styles.title}>{lbl}</Text>
                        {a.is_default && <View style={styles.defPill}><Text style={styles.defPillTxt}>افتراضي</Text></View>}
                      </View>
                      <Text style={styles.addr} numberOfLines={2}>{a.address}</Text>
                      {!!(a.floor || a.notes) && <Text style={styles.meta} numberOfLines={1}>{[a.floor && `طابق ${a.floor}`, a.notes].filter(Boolean).join(' · ')}</Text>}
                      {!(a.lat && a.lng) && <Text style={[styles.meta, { color: C.red }]}>بدون موقع على الخريطة — عدّله لدقة سعر التوصيل</Text>}
                    </View>
                    {busyId === a.id && <ActivityIndicator size="small" color={C.primary} />}
                  </View>
                  <View style={styles.actions}>
                    {!a.is_default && (
                      <TouchableOpacity style={styles.action} onPress={() => setDefault(a)} disabled={busyId === a.id}>
                        <Ionicons name="star-outline" size={16} color={C.primary} />
                        <Text style={styles.actionTxt}>اجعله افتراضي</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.action} onPress={() => navigation.navigate('AddAddress', { address: a })} disabled={busyId === a.id}>
                      <Ionicons name="create-outline" size={16} color={C.primary} />
                      <Text style={styles.actionTxt}>تعديل</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action} onPress={() => remove(a)} disabled={busyId === a.id}>
                      <Ionicons name="trash-outline" size={16} color={C.red} />
                      <Text style={[styles.actionTxt, { color: C.red }]}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </FadeIn>
            );
          })}
        </ScrollView>
      )}

      {list.length > 0 && (
        <View style={[styles.fabWrap, { bottom: insets.bottom + 20 }]}>
          <GradientButton title="إضافة عنوان جديد" icon={<Ionicons name="add-circle" size={20} color="#FFF" />} onPress={() => navigation.navigate('AddAddress')} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, borderWidth: 1.5, borderColor: C.border, ...C.shadow.soft },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  title: { fontSize: 15.5, fontWeight: '900', color: C.text, textAlign: 'right' },
  defPill: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  defPillTxt: { fontSize: 11, color: C.primary, fontWeight: '800' },
  addr: { fontSize: 13, color: C.sub, marginTop: 3, textAlign: 'right', lineHeight: 19 },
  meta: { fontSize: 11.5, color: C.faint, marginTop: 3, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, flexWrap: 'wrap' },
  action: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.inputBg },
  actionTxt: { fontSize: 12.5, fontWeight: '800', color: C.primary },
  fabWrap: { position: 'absolute', left: 16, right: 16 },
  fab: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 16, ...C.shadow.float },
  fabTxt: { color: '#FFF', fontWeight: '900', fontSize: 15.5 },
});
