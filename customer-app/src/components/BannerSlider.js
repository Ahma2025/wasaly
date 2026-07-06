import React, { useRef, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const W = Dimensions.get('window').width;

const FALLBACK = [
  { id: '1',  title: 'وصلّي — التوصيل الأسرع',    sub: 'اطلب من أفضل المطاعم في منطقتك',         bg: '#FF6B00', icon: 'bicycle',      circle: 'rgba(255,255,255,0.15)' },
  { id: '2',  title: 'عروض حصرية كل يوم 🔥',       sub: 'خصومات تصل إلى 30٪ على مطاعم مختارة',    bg: '#8B0000', icon: 'pricetag',     circle: 'rgba(255,255,255,0.12)' },
  { id: '3',  title: 'توصيل مجاني على أول طلب',    sub: 'سجّل الآن واستمتع بالتوصيل بدون رسوم',   bg: '#005C4B', icon: 'gift',         circle: 'rgba(255,255,255,0.12)' },
  { id: '4',  title: 'برغر يستاهل الانتظار 🍔',     sub: 'أجود أنواع البرغر على بُعد نقرة واحدة',  bg: '#7B3F00', icon: 'fast-food',    circle: 'rgba(255,255,255,0.13)' },
  { id: '5',  title: 'بيتزا ساخنة حتى بابك 🍕',    sub: 'من الفرن لبابك خلال 30 دقيقة',            bg: '#B71C1C', icon: 'restaurant',   circle: 'rgba(255,255,255,0.12)' },
  { id: '6',  title: 'صيدلية 24 ساعة 💊',           sub: 'اطلب دواءك من المنزل في أي وقت',          bg: '#1565C0', icon: 'medical',      circle: 'rgba(255,255,255,0.13)' },
  { id: '7',  title: 'سوبرماركت بضغطة زر 🛒',      sub: 'توصيل احتياجاتك في أسرع وقت',             bg: '#2E7D32', icon: 'cart',         circle: 'rgba(255,255,255,0.12)' },
  { id: '8',  title: 'مطاعم جديدة أضفناها لك ✨',   sub: 'اكتشف خيارات أكثر في منطقتك',             bg: '#6A1B9A', icon: 'star',         circle: 'rgba(255,255,255,0.13)' },
  { id: '9',  title: 'دجاج مقرمش في 20 دقيقة 🍗',  sub: 'الأفضل في المنطقة — جرّب الآن',           bg: '#E65100', icon: 'flame',        circle: 'rgba(255,255,255,0.12)' },
  { id: '10', title: 'قهوتك الصباحية جاهزة ☕',     sub: 'ابدأ يومك بأفضل القهوة في المدينة',        bg: '#3E2723', icon: 'cafe',         circle: 'rgba(255,255,255,0.13)' },
];

export default function BannerSlider({ banners }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  // إذا في إعلانات حقيقية من الإدمن (فيها صورة) = اعرضها فقط، وإلا الـ fallback
  const apiBanners = (banners || []).filter(b => b && b.image);
  const items = apiBanners.length > 0 ? apiBanners : FALLBACK;

  useEffect(() => {
    setIdx(0);
    ref.current?.scrollTo({ x: 0, animated: false });
  }, [items]);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % items.length;
        ref.current?.scrollTo({ x: next * W, animated: true });
        return next;
      });
    }, 3200);
    return () => clearInterval(t);
  }, [items.length]);

  return (
    <View style={s.wrap}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
      >
        {items.map((item, i) => (
          item.image ? (
            /* إعلان برصورة من الإدمن */
            <View key={item.id || i} style={s.slide}>
              <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={s.imgOverlay} />
              <View style={s.textBlock}>
                <Text style={s.title}>{item.title_ar || item.title || ''}</Text>
              </View>
            </View>
          ) : (
            /* إعلان Fallback ملوّن */
            <View key={item.id || i} style={[s.slide, { backgroundColor: item.bg || '#FF6B00' }]}>
              <View style={[s.circle1, { backgroundColor: item.circle || 'rgba(255,255,255,0.12)' }]} />
              <View style={[s.circle2, { backgroundColor: item.circle || 'rgba(255,255,255,0.08)' }]} />
              <View style={[s.circle3, { backgroundColor: item.circle || 'rgba(255,255,255,0.06)' }]} />
              <View style={s.iconWrap}>
                <Ionicons name={item.icon || 'restaurant'} size={70} color="rgba(255,255,255,0.18)" />
              </View>
              <View style={s.textBlock}>
                <Text style={s.title}>{item.title || item.title_ar || ''}</Text>
                <Text style={s.sub} numberOfLines={2}>{item.sub || ''}</Text>
              </View>
              <View style={s.orderBtn}>
                <Text style={s.orderBtnTxt}>اطلب الآن ←</Text>
              </View>
            </View>
          )
        ))}
      </ScrollView>

      {/* نقاط */}
      <View style={s.dots}>
        {items.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => { ref.current?.scrollTo({ x: i * W, animated: true }); setIdx(i); }}>
            <View style={[s.dot, i === idx && s.dotOn]} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 6 },
  slide: {
    width: W,
    height: 210,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  circle1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -70, left: -60 },
  circle2: { position: 'absolute', width: 150, height: 150, borderRadius: 75, bottom: -40, right: -10 },
  circle3: { position: 'absolute', width: 90, height: 90, borderRadius: 45, top: 10, right: 80 },
  imgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.32)' },
  iconWrap: { position: 'absolute', bottom: 8, left: 16 },
  textBlock: { zIndex: 1, marginTop: 'auto' },
  title: { color: '#FFF', fontSize: 21, fontWeight: '900', textAlign: 'right', marginBottom: 6, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 4 },
  sub: { color: 'rgba(255,255,255,0.88)', fontSize: 13.5, textAlign: 'right', fontWeight: '500', lineHeight: 20 },
  orderBtn: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  orderBtnTxt: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 5, flexWrap: 'wrap', paddingHorizontal: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D1D1D6' },
  dotOn: { width: 20, borderRadius: 3, backgroundColor: '#FF6B00' },
});
