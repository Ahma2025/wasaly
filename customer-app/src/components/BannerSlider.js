import React, { useRef, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const W = Dimensions.get('window').width;

const FALLBACK = [
  { id: '1', title: 'وصلّي — التوصيل الأسرع 🚀', sub: 'اطلب من أفضل المطاعم في منطقتك', bg: '#FF6B00', icon: 'bicycle', circle: 'rgba(255,255,255,0.15)' },
  { id: '2', title: 'عروض حصرية كل يوم 🔥', sub: 'خصومات تصل إلى 30٪ على مطاعم مختارة', bg: '#8B0000', icon: 'pricetag', circle: 'rgba(255,255,255,0.12)' },
  { id: '3', title: 'توصيل مجاني على أول طلب 🛵', sub: 'سجّل الآن واستمتع بالخدمة', bg: '#005C4B', icon: 'gift', circle: 'rgba(255,255,255,0.12)' },
];

export default function BannerSlider({ banners }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const items = (banners && banners.length > 0) ? banners : FALLBACK;

  useEffect(() => {
    const t = setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % items.length;
        ref.current?.scrollTo({ x: next * W, animated: true });
        return next;
      });
    }, 3500);
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
          <View key={item.id || i} style={[s.slide, { backgroundColor: item.bg || item.color || '#FF6B00' }]}>
            {/* دائرة زخرفية */}
            <View style={[s.circle1, { backgroundColor: item.circle || 'rgba(255,255,255,0.12)' }]} />
            <View style={[s.circle2, { backgroundColor: item.circle || 'rgba(255,255,255,0.08)' }]} />
            {/* أيقونة */}
            <View style={s.iconWrap}>
              <Ionicons name={item.icon || 'restaurant'} size={40} color="rgba(255,255,255,0.9)" />
            </View>
            {/* نص */}
            <View style={s.textBlock}>
              <Text style={s.title}>{item.title || item.title_ar || ''}</Text>
              <Text style={s.sub} numberOfLines={2}>{item.sub || item.subtitle_ar || item.description || ''}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* نقاط التنقل */}
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
  wrap: { marginBottom: 8 },
  slide: {
    width: W,
    height: 170,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  circle1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -50, left: -40 },
  circle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -30, right: 20 },
  iconWrap: { position: 'absolute', top: 20, left: 24, opacity: 0.85 },
  textBlock: { zIndex: 1 },
  title: { color: '#FFF', fontSize: 19, fontWeight: '900', textAlign: 'right', marginBottom: 5, textShadowColor: 'rgba(0,0,0,0.2)', textShadowRadius: 4 },
  sub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, textAlign: 'right', fontWeight: '500' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#D1D1D6' },
  dotOn: { width: 22, borderRadius: 4, backgroundColor: '#FF6B00' },
});
