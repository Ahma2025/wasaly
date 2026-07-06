import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, RefreshControl, Dimensions, StatusBar, Animated, Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import BannerSlider from '../components/BannerSlider';

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;
const C = { primary: '#FF6B00', bg: '#F2F2F7', white: '#FFF', text: '#1A1A2E', gray: '#6B6B6B', light: '#F8F8F8', sec: '#FFF8F4' };

/* ── كرت مع موشن ── */
function AnimCard({ children, style, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50 }).start();
  const release = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={press} onPressOut={release}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ── كرت الشبكة (grid) ── */
function RCard({ r, onPress }) {
  return (
    <AnimCard style={rc.wrap} onPress={onPress}>
      <View style={rc.imgBox}>
        <Image source={{ uri: r.cover_image || r.logo }} style={rc.img} resizeMode="cover" />
        {(r.discount_percent > 0 || r.discount > 0) && (
          <View style={rc.badge}><Text style={rc.badgeTxt}>خصم {r.discount_percent || r.discount}%</Text></View>
        )}
        {!r.is_open && (
          <View style={rc.overlay}><Text style={rc.overlayTxt}>مغلق</Text></View>
        )}
        <View style={rc.logoCircle}>
          <Image source={{ uri: r.logo }} style={rc.logoImg} resizeMode="cover" />
        </View>
      </View>
      <View style={rc.body}>
        <Text style={rc.name} numberOfLines={1}>{r.name_ar}</Text>
        <Text style={rc.addr} numberOfLines={1}>{r.address || r.city || ''}</Text>
        <View style={rc.meta}>
          <Ionicons name="star" size={12} color="#FFB800" />
          <Text style={rc.metaTxt}>{parseFloat(r.rating || 0).toFixed(1)}</Text>
          <Text style={rc.sep}>·</Text>
          <Ionicons name="time-outline" size={12} color={C.gray} />
          <Text style={rc.metaTxt}>{r.delivery_time_min}-{r.delivery_time_max} د</Text>
        </View>
      </View>
    </AnimCard>
  );
}

/* ── كرت أفقي (مقترحة) ── */
function HCard({ r, onPress }) {
  return (
    <AnimCard style={hc.wrap} onPress={onPress}>
      <Image source={{ uri: r.logo || r.cover_image }} style={hc.img} resizeMode="cover" />
      {!r.is_open && <View style={hc.closed}><Text style={hc.closedTxt}>مغلق</Text></View>}
      <Text style={hc.name} numberOfLines={2}>{r.name_ar}</Text>
      <View style={hc.row}>
        <Ionicons name="star" size={12} color="#FFB800" />
        <Text style={hc.rating}>{parseFloat(r.rating || 0).toFixed(1)}</Text>
      </View>
    </AnimCard>
  );
}

/* ── رأس القسم: النص يمين، الأيقونة يسار ── */
function SectionHead({ title, icon, onSeeAll }) {
  return (
    <View style={s.secHead}>
      {onSeeAll ? (
        <TouchableOpacity onPress={onSeeAll} style={s.seeAllRow}>
          <Text style={s.seeAll}>عرض الكل</Text>
          <Ionicons name="chevron-back" size={14} color={C.primary} />
        </TouchableOpacity>
      ) : <View />}
      <View style={s.secTitleRow}>
        <Text style={s.secTitle}>{title}</Text>
        {icon ? <Ionicons name={icon} size={20} color={C.primary} style={{ marginLeft: 6 }} /> : null}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [r, c, b] = await Promise.all([
        api.get('/restaurants?limit=60'),
        api.get('/categories'),
        api.get('/banners'),
      ]);
      setRestaurants(r.data || []);
      setCategories(c.data || []);
      setBanners(b.data || []);
    } catch (e) { console.error(e); }
  };

  const onRefresh = useCallback(() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }, []);
  const go = (id) => navigation.navigate('Restaurant', { restaurantId: id });
  const byCat = (id) => restaurants.filter(r => r.category_id === id);
  const toggle = (k) => setExpanded(p => ({ ...p, [k]: !p[k] }));

  const topRated = [...restaurants].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const suggested = restaurants.slice(0, 8);

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={s.iconBtn}>
          <Ionicons name="notifications-outline" size={24} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.locBtn} onPress={() => navigation.navigate('AddAddress')}>
          <Ionicons name="chevron-down" size={16} color={C.gray} />
          <Text style={s.locTxt} numberOfLines={1}>حدد موقعك</Text>
          <Ionicons name="location" size={18} color={C.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('بحث')} style={s.iconBtn}>
          <Ionicons name="search-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>

        {/* Banner */}
        <BannerSlider banners={banners} />

        {/* ── تصنيفات سريعة ── */}
        <View style={[s.section, { backgroundColor: C.white, paddingVertical: 16 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 12 }}>
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} style={s.quickCat} onPress={() => go(byCat(cat.id)[0]?.id)}>
                <View style={s.quickCircle}>
                  <Text style={{ fontSize: 28 }}>{cat.icon || '🍽️'}</Text>
                </View>
                <Text style={s.quickLbl}>{cat.name_ar}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={s.divider} />

        {/* ── مطاعم مقترحة ── */}
        {suggested.length > 0 && (
          <View style={[s.section, { backgroundColor: C.sec, paddingTop: 4, paddingBottom: 16 }]}>
            <SectionHead title="مطاعم مقترحة" icon="sparkles" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingVertical: 4 }}>
              {suggested.map(r => <HCard key={r.id} r={r} onPress={() => go(r.id)} />)}
            </ScrollView>
          </View>
        )}

        <View style={s.divider} />

        {/* ── الأعلى تقييماً ── */}
        {topRated.length > 0 && (
          <View style={[s.section, { backgroundColor: C.white, paddingTop: 4, paddingBottom: 16 }]}>
            <SectionHead title="الأعلى تقييماً" icon="star" onSeeAll={() => {}} />
            <View style={s.grid}>
              {topRated.slice(0, expanded['top'] ? topRated.length : 4).map(r => (
                <RCard key={r.id} r={r} onPress={() => go(r.id)} />
              ))}
            </View>
            {topRated.length > 4 && (
              <TouchableOpacity style={s.moreBtn} onPress={() => toggle('top')}>
                <Text style={s.moreTxt}>{expanded['top'] ? 'عرض أقل ▲' : 'اعرض المزيد ▼'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── أقسام التصنيفات ── */}
        {categories.map((cat, ci) => {
          const list = byCat(cat.id);
          if (list.length === 0) return null;
          const isExp = expanded[cat.id];
          const bg = ci % 2 === 0 ? C.sec : C.white;
          return (
            <React.Fragment key={cat.id}>
              <View style={s.divider} />
              <View style={[s.section, { backgroundColor: bg, paddingTop: 4, paddingBottom: 16 }]}>
                <SectionHead title={cat.name_ar} icon={null} onSeeAll={() => {}} />
                <View style={s.grid}>
                  {list.slice(0, isExp ? list.length : 4).map(r => (
                    <RCard key={r.id} r={r} onPress={() => go(r.id)} />
                  ))}
                </View>
                {list.length > 4 && (
                  <TouchableOpacity style={s.moreBtn} onPress={() => toggle(cat.id)}>
                    <Text style={s.moreTxt}>{isExp ? 'عرض أقل ▲' : 'اعرض المزيد ▼'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </React.Fragment>
          );
        })}

        {restaurants.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 52 }}>🍽️</Text>
            <Text style={{ color: C.gray, marginTop: 12, fontSize: 17, fontWeight: '600' }}>لا توجد مطاعم حالياً</Text>
          </View>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const rc = StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.white, borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  imgBox: { width: '100%', height: 115, position: 'relative' },
  img: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 8, right: 8, backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'center', alignItems: 'center' },
  overlayTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  logoCircle: { position: 'absolute', bottom: -14, left: 10, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#FFF', overflow: 'hidden', backgroundColor: '#FFF', elevation: 4 },
  logoImg: { width: '100%', height: '100%' },
  body: { paddingHorizontal: 10, paddingTop: 18, paddingBottom: 10 },
  name: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  addr: { fontSize: 12, color: C.gray, marginTop: 2, textAlign: 'right' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, gap: 3 },
  metaTxt: { fontSize: 12, color: C.text, fontWeight: '600' },
  sep: { color: C.gray },
});

const hc = StyleSheet.create({
  wrap: { width: 105, alignItems: 'center' },
  img: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#EEE' },
  closed: { position: 'absolute', top: 0, left: 11, right: 11, height: 82, borderRadius: 41, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', alignItems: 'center' },
  closedTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center', marginTop: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rating: { fontSize: 12, color: C.text, fontWeight: '600' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: '#EBEBF0' },
  iconBtn: { padding: 4 },
  locBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  locTxt: { fontSize: 15, fontWeight: '800', color: C.text },
  section: { width: '100%' },
  divider: { height: 8, backgroundColor: '#EBEBF0' },
  secHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, marginBottom: 14 },
  secTitleRow: { flexDirection: 'row', alignItems: 'center' },
  secTitle: { fontSize: 18, fontWeight: '900', color: C.text },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAll: { fontSize: 14, color: C.primary, fontWeight: '700' },
  quickCat: { alignItems: 'center', gap: 7 },
  quickCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  quickLbl: { fontSize: 13, fontWeight: '700', color: C.text },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  moreBtn: { marginTop: 14, marginHorizontal: 16, borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  moreTxt: { color: C.primary, fontWeight: '800', fontSize: 15 },
});
