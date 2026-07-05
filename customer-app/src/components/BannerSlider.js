import React, { useRef, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';

const W = Dimensions.get('window').width;

const ITEMS = [
  { id: '1', title: 'وصلّي — التوصيل الأسرع 🚀', sub: 'اطلب من أفضل المطاعم في منطقتك', bg: '#FF6B00' },
  { id: '2', title: 'عروض حصرية كل يوم 🔥', sub: 'خصومات تصل إلى 30% على مطاعم مختارة', bg: '#C2185B' },
  { id: '3', title: 'توصيل مجاني على أول طلب 🛵', sub: 'سجّل الآن واستمتع بالخدمة', bg: '#00695C' },
];

export default function BannerSlider({ banners }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const items = (banners && banners.length > 0) ? banners : ITEMS;

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
    <View style={{ marginBottom: 16 }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
      >
        {items.map(item => (
          <View key={item.id} style={[styles.slide, { backgroundColor: item.bg || '#FF6B00' }]}>
            <Text style={styles.title}>{item.title || ''}</Text>
            <Text style={styles.sub}>{item.sub || item.subtitle || ''}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {items.map((_, i) => (
          <View key={i} style={[styles.dot, i === idx && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    width: W,
    height: 160,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: 'flex-end',
  },
  title: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D1D1D6' },
  dotOn: { width: 18, backgroundColor: '#FF6B00' },
});
