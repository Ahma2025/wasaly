import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;
const C = { primary: '#FF6B00', bg: '#F2F2F7', white: '#FFF', text: '#1A1A2E', gray: '#6B6B6B', sec: '#F0F7FF' };

const TYPES = [
  { id: 'supermarket', label: 'سوبرماركت', icon: 'cart', color: '#2E7D32', bg: '#E8F5E9' },
  { id: 'pharmacy',    label: 'صيدلية',    icon: 'medical', color: '#1565C0', bg: '#E3F2FD' },
  { id: 'bakery',      label: 'مخبز',      icon: 'restaurant', color: '#F57F17', bg: '#FFF8E1' },
  { id: 'grocery',     label: 'بقالة',     icon: 'storefront', color: '#6A1B9A', bg: '#F3E5F5' },
];

function StoreCard({ r, onPress }) {
  return (
    <TouchableOpacity style={sc.wrap} onPress={onPress} activeOpacity={0.88}>
      <View style={sc.imgBox}>
        <Image source={{ uri: r.cover_image || r.logo }} style={sc.img} resizeMode="cover" />
        {!r.is_open && <View style={sc.overlay}><Text style={sc.overlayTxt}>مغلق</Text></View>}
        <View style={sc.logoCircle}>
          <Image source={{ uri: r.logo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      </View>
      <View style={sc.body}>
        <Text style={sc.name} numberOfLines={1}>{r.name_ar}</Text>
        <Text style={sc.addr} numberOfLines={1}>{r.address || r.city || ''}</Text>
        <View style={sc.meta}>
          <Ionicons name="time-outline" size={12} color={C.gray} />
          <Text style={sc.metaTxt}>{r.delivery_time_min}-{r.delivery_time_max} د</Text>
          <Text style={sc.sep}>·</Text>
          <Ionicons name="bicycle-outline" size={12} color={C.gray} />
          <Text style={sc.metaTxt}>{r.delivery_fee === 0 ? 'مجاني' : `${r.delivery_fee}₪`}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MarketScreen() {
  const navigation = useNavigation();
  const [stores, setStores] = useState([]);
  const [selected, setSelected] = useState('supermarket');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const r = await api.get('/restaurants?limit=60');
      setStores(r.data || []);
    } catch (e) { console.error(e); }
  };

  const filtered = stores.filter(r =>
    r.type === selected || r.store_type === selected || (selected === 'supermarket' && r.name_ar?.includes('ماركت'))
      || (selected === 'pharmacy' && (r.name_ar?.includes('صيدل') || r.name_ar?.includes('دواء')))
  );
  const displayList = filtered.length > 0 ? filtered : stores.slice(0, 6);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>الماركت</Text>
          <Ionicons name="cart" size={24} color={C.primary} />
        </View>
        <Text style={s.headerSub}>سوبرماركت · صيدليات · بقاليات</Text>
      </View>

      {/* تصنيف النوع */}
      <View style={s.typesRow}>
        {TYPES.map(t => (
          <TouchableOpacity key={t.id} style={[s.typeBtn, selected === t.id && { backgroundColor: t.bg, borderColor: t.color }]}
            onPress={() => setSelected(t.id)}>
            <Ionicons name={t.icon} size={20} color={selected === t.id ? t.color : C.gray} />
            <Text style={[s.typeLabel, selected === t.id && { color: t.color, fontWeight: '800' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={C.primary} />}>

        {/* بنر علوي */}
        <View style={s.banner}>
          <View style={s.bannerCircle1} />
          <View style={s.bannerCircle2} />
          <Ionicons name="cart" size={60} color="rgba(255,255,255,0.15)" style={{ position: 'absolute', left: 16, bottom: 8 }} />
          <View>
            <Text style={s.bannerTitle}>توصيل سريع لكل احتياجاتك 🛒</Text>
            <Text style={s.bannerSub}>سوبرماركت، صيدليات، بقاليات — كلها بضغطة واحدة</Text>
          </View>
        </View>

        <Text style={s.listTitle}>{TYPES.find(t => t.id === selected)?.label || 'المتاجر'} المتاحة</Text>

        <View style={s.grid}>
          {displayList.map(r => (
            <StoreCard key={r.id} r={r} onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} />
          ))}
        </View>

        {displayList.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 48 }}>🏪</Text>
            <Text style={{ color: C.gray, marginTop: 12, fontSize: 16, fontWeight: '600' }}>لا توجد متاجر متاحة حالياً</Text>
          </View>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const sc = StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.white, borderRadius: 18, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  imgBox: { width: '100%', height: 110, position: 'relative' },
  img: { width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'center', alignItems: 'center' },
  overlayTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  logoCircle: { position: 'absolute', bottom: -13, left: 10, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#FFF', overflow: 'hidden', backgroundColor: '#FFF' },
  body: { paddingHorizontal: 10, paddingTop: 16, paddingBottom: 10 },
  name: { fontSize: 13, fontWeight: '800', color: C.text, textAlign: 'right' },
  addr: { fontSize: 11, color: C.gray, marginTop: 2, textAlign: 'right' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, gap: 3 },
  metaTxt: { fontSize: 11, color: C.text, fontWeight: '600' },
  sep: { color: C.gray },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.white, paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#EBEBF0' },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.text },
  headerSub: { fontSize: 12, color: C.gray, textAlign: 'right', marginTop: 3 },
  typesRow: { flexDirection: 'row-reverse', paddingHorizontal: 12, paddingVertical: 12, gap: 8, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: '#EBEBF0' },
  typeBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 14, backgroundColor: C.bg, borderWidth: 1.5, borderColor: 'transparent' },
  typeLabel: { fontSize: 11, fontWeight: '600', color: C.gray },
  banner: { margin: 16, borderRadius: 20, backgroundColor: '#1565C0', padding: 20, overflow: 'hidden', justifyContent: 'flex-end' },
  bannerCircle1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.1)', top: -50, left: -30 },
  bannerCircle2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -20, right: 20 },
  bannerTitle: { color: '#FFF', fontSize: 17, fontWeight: '900', textAlign: 'right' },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'right', marginTop: 5 },
  listTitle: { fontSize: 17, fontWeight: '900', color: C.text, textAlign: 'right', paddingHorizontal: 16, marginBottom: 12 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
});
