import React, { useRef, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

const W = Dimensions.get('window').width;

// شرائح هوية محايدة (بدون عروض وهمية) — كل شريحة تفتح ميزة حقيقية بالتطبيق
const FALLBACK = [
  { id: 'f1', title: 'وصلّي — اطلب من مطاعم منطقتك', sub: 'تصفّح المطاعم المفتوحة الآن واطلب بضغطة', colors: ['#FF8A1E', '#F53B57'], icon: 'bicycle', action: { type: 'tab', screen: 'بحث' } },
  { id: 'f2', title: 'ماركت وصيدليات ومخابز', sub: 'احتياجات البيت بتوصلك لعندك', colors: ['#2E7D32', '#1B5E20'], icon: 'storefront', action: { type: 'tab', screen: 'ماركت' } },
  { id: 'f3', title: 'طلب شخصي — طرد أو راكب', sub: 'السعر حسب المسافة، والدفع كاش', colors: ['#1565C0', '#0D47A1'], icon: 'cube', action: { type: 'screen', screen: 'PersonalDelivery' } },
  { id: 'f4', title: 'اطلبوا سوا من نفس المطعم', sub: 'افتح مجموعة وكل واحد يضيف أكله', colors: ['#6A1B9A', '#4A148C'], icon: 'people', action: { type: 'screen', screen: 'GroupOrder' } },
];

// تحويل رابط البانر من السيرفر (link_type / link_value) لوجهة داخل التطبيق
export const bannerAction = (b) => {
  if (!b) return null;
  if (b.action) return b.action;
  const t = String(b.link_type || '').toLowerCase();
  const v = b.link_value;
  if (!t || (!v && t !== 'market')) return null;
  if (t === 'restaurant' || t === 'store') return { type: 'screen', screen: 'Restaurant', params: { restaurantId: v } };
  if (t === 'category') return { type: 'screen', screen: 'Category', params: { categoryId: v, categoryName: b.title_ar || b.title || '' } };
  if (t === 'market') return { type: 'tab', screen: 'ماركت' };
  if (t === 'url' || t === 'link') return { type: 'url', url: v };
  return null;
};

export default function BannerSlider({ banners, onPressBanner }) {
  const { colors: C } = useTheme();
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const touching = useRef(false);

  const apiBanners = (banners || []).filter(b => b && b.image);
  const hasApi = apiBanners.length > 0;
  const items = hasApi ? apiBanners : FALLBACK;

  useEffect(() => {
    setIdx(0);
    ref.current?.scrollTo({ x: 0, animated: false });
  }, [hasApi]);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      if (touching.current) return;
      setIdx(prev => {
        const next = (prev + 1) % items.length;
        ref.current?.scrollTo({ x: next * W, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(t);
  }, [items.length]);

  const press = (item) => { const a = bannerAction(item); if (a && onPressBanner) onPressBanner(a); };

  return (
    <View style={s.wrap}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { touching.current = true; }}
        onMomentumScrollEnd={e => { touching.current = false; setIdx(Math.round(e.nativeEvent.contentOffset.x / W)); }}
      >
        {items.map((item, i) => {
          const tappable = !!bannerAction(item);
          return (
            <Pressable key={item.id || i} onPress={() => press(item)} disabled={!tappable}
              accessibilityRole={tappable ? 'button' : 'image'} accessibilityLabel={item.title_ar || item.title || 'إعلان'}>
              {item.image ? (
                <View style={s.slide}>
                  <View style={s.card}>
                    <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} />
                    <View style={s.textBlock}>
                      {!!(item.title_ar || item.title) && <Text style={s.title} numberOfLines={2}>{item.title_ar || item.title}</Text>}
                      {tappable && <View style={s.cta}><Text style={s.ctaTxt}>اكتشف</Text><Ionicons name="arrow-back" size={14} color="#FFF" /></View>}
                    </View>
                  </View>
                </View>
              ) : (
                <View style={s.slide}>
                  <LinearGradient colors={item.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
                    <LinearGradient colors={['rgba(255,255,255,0.16)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                    <View style={s.circle1} />
                    <View style={s.circle2} />
                    <View style={s.iconWrap}><Ionicons name={item.icon} size={84} color="rgba(255,255,255,0.18)" /></View>
                    <View style={s.textBlock}>
                      <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                      <Text style={s.sub} numberOfLines={2}>{item.sub}</Text>
                      <View style={s.cta}><Text style={s.ctaTxt}>جرّب الآن</Text><Ionicons name="arrow-back" size={14} color="#FFF" /></View>
                    </View>
                  </LinearGradient>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {items.length > 1 && (
        <View style={s.dots}>
          {items.map((_, i) => (
            <TouchableOpacity key={i} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} accessibilityLabel={`الشريحة ${i + 1}`}
              onPress={() => { ref.current?.scrollTo({ x: i * W, animated: true }); setIdx(i); }}>
              <View style={[s.dot, { backgroundColor: C.border }, i === idx && { width: 20, backgroundColor: C.primary }]} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 14, marginBottom: 6 },
  slide: { width: W, paddingHorizontal: 16 },
  card: { height: 176, borderRadius: 24, overflow: 'hidden', padding: 18, justifyContent: 'flex-end' },
  circle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: -70, left: -50, backgroundColor: 'rgba(255,255,255,0.10)' },
  circle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -40, right: 40, backgroundColor: 'rgba(255,255,255,0.08)' },
  iconWrap: { position: 'absolute', top: 14, left: 16 },
  textBlock: { alignItems: 'flex-end' },
  title: { color: '#FFF', fontSize: 19, fontWeight: '900', textAlign: 'right', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'right', fontWeight: '600', marginTop: 4, lineHeight: 19 },
  cta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  ctaTxt: { color: '#FFF', fontSize: 12.5, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 5, flexWrap: 'wrap', paddingHorizontal: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
