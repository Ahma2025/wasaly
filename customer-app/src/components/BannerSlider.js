import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Pressable, Animated, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { haptic } from '../utils/motion';

const W = Dimensions.get('window').width;

// شرائح هوية محايدة (بدون عروض وهمية) — كل شريحة تفتح ميزة حقيقية بالتطبيق
const FALLBACK = [
  { id: 'f1', title: 'وصلّي — اطلب من مطاعم منطقتك', sub: 'تصفّح المطاعم المفتوحة الآن واطلب بضغطة', colors: ['#FF8A00', '#FF5E3A', '#F53B57'], icon: 'bicycle', action: { type: 'tab', screen: 'بحث' } },
  { id: 'f2', title: 'ماركت وصيدليات ومخابز', sub: 'احتياجات البيت بتوصلك لعندك', colors: ['#3BD17A', '#1DB954', '#0E7A3A'], icon: 'storefront', action: { type: 'tab', screen: 'ماركت' } },
  { id: 'f3', title: 'طلب شخصي — طرد أو راكب', sub: 'السعر حسب المسافة، والدفع كاش', colors: ['#5AAEFF', '#2E90FA', '#1849A9'], icon: 'cube', action: { type: 'screen', screen: 'PersonalDelivery' } },
  { id: 'f4', title: 'اطلب مع أصحابك — سلة مشتركة', sub: 'افتح سلة مشتركة وكل واحد يضيف طلبه', colors: ['#A78BFA', '#7C5CFA', '#4A2FB8'], icon: 'people', action: { type: 'screen', screen: 'GroupOrder' } },
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

const CARD_W = W - 32;

// إعلان ضمن فترة عرضه (starts_at / ends_at) — لو السيرفر ما فلترها
const inWindow = (b, now) => {
  const st = b.starts_at ? new Date(b.starts_at).getTime() : null;
  const en = b.ends_at ? new Date(b.ends_at).getTime() : null;
  if (st && !isNaN(st) && now < st) return false;
  if (en && !isNaN(en) && now > en) return false;
  return true;
};

/*
  RTL: الشرائح بترتيب معكوس فيزيائياً (الأولى على اليمين)، والبداية من آخر إزاحة،
  والتقدّم التلقائي يمشي من اليمين لليسار — مثل باقي التطبيق. يتوقف لما الشاشة مش ظاهرة أو التطبيق بالخلفية.
*/
export default function BannerSlider({ banners, onPressBanner }) {
  const { colors: C } = useTheme();
  const focused = useIsFocused();
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);          // ترتيب منطقي (0 = أول شريحة)
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const touching = useRef(false);
  const scrollX = useRef(new Animated.Value(0)).current;

  const now = Date.now();
  const apiBanners = (banners || []).filter(b => b && b.image && b.is_active !== false && inWindow(b, now));
  // إعلانات الإدارة أولاً، وبعدها شرائح الميزات (ما بتختفي أول ما ينرفع إعلان واحد)
  const items = apiBanners.length ? [...apiBanners, ...FALLBACK] : FALLBACK;
  const n = items.length;
  const physOf = (logical) => n - 1 - logical; // موقع الشريحة الفيزيائي
  const itemsKey = items.map(x => x.id).join('|');

  // البداية: أول شريحة منطقية = آخر إزاحة (يمين)
  const goTo = (logical, animated) => ref.current?.scrollTo({ x: physOf(logical) * W, animated });
  useEffect(() => {
    setIdx(0);
    const t = setTimeout(() => goTo(0, false), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (n < 2 || !focused || !appActive) return undefined;
    const t = setInterval(() => {
      if (touching.current) return;
      setIdx(prev => {
        const next = (prev + 1) % n;
        goTo(next, true);
        return next;
      });
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, focused, appActive]);

  const press = (item) => { const a = bannerAction(item); if (a && onPressBanner) { haptic.light(); onPressBanner(a); } };
  const physical = [...items].reverse();

  return (
    <View style={s.wrap}>
      <Animated.ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onContentSizeChange={() => { if (!touching.current) goTo(idx, false); }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onScrollBeginDrag={() => { touching.current = true; }}
        onMomentumScrollEnd={e => { touching.current = false; setIdx(Math.max(0, Math.min(n - 1, physOf(Math.round(e.nativeEvent.contentOffset.x / W))))); }}
      >
        {physical.map((item, i) => {
          const tappable = !!bannerAction(item);
          const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
          // بارالاكس: الخلفية تتحرك أبطأ من البطاقة + تكبير بسيط للبطاقة النشطة
          const parallax = scrollX.interpolate({ inputRange, outputRange: [-W * 0.25, 0, W * 0.25], extrapolate: 'clamp' });
          const cardScale = scrollX.interpolate({ inputRange, outputRange: [0.94, 1, 0.94], extrapolate: 'clamp' });
          const textShift = scrollX.interpolate({ inputRange, outputRange: [60, 0, -60], extrapolate: 'clamp' });
          const textOpacity = scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <Pressable key={item.id || i} onPress={() => press(item)} disabled={!tappable}
              accessibilityRole={tappable ? 'button' : 'image'} accessibilityLabel={item.title_ar || item.title || 'إعلان'}>
              <View style={s.slide}>
                <Animated.View style={[s.card, C.shadow.card, { transform: [{ scale: cardScale }] }]}>
                  {item.image ? (
                    <>
                      <Animated.Image source={{ uri: item.image }} resizeMode="cover"
                        style={[s.parallaxImg, { transform: [{ translateX: parallax }] }]} />
                      <LinearGradient colors={['transparent', 'rgba(11,11,18,0.7)']} style={StyleSheet.absoluteFill} />
                    </>
                  ) : (
                    <>
                      <LinearGradient colors={item.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <LinearGradient colors={['rgba(255,255,255,0.20)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.7 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: parallax }] }]} pointerEvents="none">
                        <View style={s.circle1} />
                        <View style={s.circle2} />
                        <View style={s.iconWrap}><Ionicons name={item.icon} size={96} color="rgba(255,255,255,0.2)" /></View>
                      </Animated.View>
                    </>
                  )}
                  <Animated.View style={[s.textBlock, { opacity: textOpacity, transform: [{ translateX: textShift }] }]}>
                    {!!(item.title_ar || item.title) && <Text style={s.title} numberOfLines={2}>{item.title_ar || item.title}</Text>}
                    {!!item.sub && <Text style={s.sub} numberOfLines={2}>{item.sub}</Text>}
                    {tappable && (
                      <View style={s.cta}>
                        <Text style={s.ctaTxt}>{item.image ? 'اكتشف' : 'جرّب الآن'}</Text>
                        <View style={s.ctaArrow}><Ionicons name="arrow-back" size={12} color={C.primary} /></View>
                      </View>
                    )}
                  </Animated.View>
                </Animated.View>
              </View>
            </Pressable>
          );
        })}
      </Animated.ScrollView>

      {n > 1 && (
        // النقاط بالترتيب المنطقي من اليمين لليسار (row-reverse)
        <View style={s.dots}>
          {items.map((_, i) => {
            const p = physOf(i);
            const inputRange = [(p - 1) * W, p * W, (p + 1) * W];
            const scaleX = scrollX.interpolate({ inputRange, outputRange: [1, 3.2, 1], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
            return (
              <TouchableOpacity key={i} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }} accessibilityLabel={`الشريحة ${i + 1} من ${n}`}
                accessibilityState={{ selected: i === idx }}
                onPress={() => { goTo(i, true); setIdx(i); }} style={s.dotHit}>
                <Animated.View style={[s.dot, { backgroundColor: C.primary, opacity, transform: [{ scaleX }] }]} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 14, marginBottom: 4 },
  slide: { width: W, paddingHorizontal: 16, paddingVertical: 6 },
  card: { height: 180, borderRadius: 26, overflow: 'hidden', padding: 18, justifyContent: 'flex-end' },
  parallaxImg: { position: 'absolute', top: 0, bottom: 0, left: -W * 0.15, width: CARD_W + W * 0.3 },
  circle1: { position: 'absolute', width: 210, height: 210, borderRadius: 105, top: -80, left: -50, backgroundColor: 'rgba(255,255,255,0.10)' },
  circle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -40, right: 40, backgroundColor: 'rgba(255,255,255,0.08)' },
  iconWrap: { position: 'absolute', top: 14, left: 18 },
  textBlock: { alignItems: 'flex-end' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900', textAlign: 'right', lineHeight: 28, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  sub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, textAlign: 'right', fontWeight: '500', marginTop: 3, lineHeight: 19 },
  cta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: '#FFF', borderRadius: 999, paddingLeft: 5, paddingRight: 14, paddingVertical: 5 },
  ctaTxt: { color: '#14142B', fontSize: 12.5, fontWeight: '800' },
  ctaArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF3EA', alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', paddingHorizontal: 20 },
  dotHit: { width: 22, height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
