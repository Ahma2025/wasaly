import React, { useRef, useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const BANNER_WIDTH = width - 32;
const BANNER_HEIGHT = 160;

const FALLBACK = [
  { id: 'f1', title: 'وصلّي — التوصيل الأسرع 🚀', sub: 'اطلب من أفضل المطاعم في منطقتك', bg: '#FF6B00', circle: '#FF8C42' },
  { id: 'f2', title: 'عروض حصرية كل يوم 🔥', sub: 'خصومات تصل إلى 30% على مطاعم مختارة', bg: '#E91E63', circle: '#FF5252' },
  { id: 'f3', title: 'توصيل مجاني على أول طلب 🛵', sub: 'سجّل الآن واستمتع بالخدمة', bg: '#00897B', circle: '#26A69A' },
];

export default function BannerSlider({ banners }) {
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const isFallback = !(banners && banners.length > 0);
  const items = isFallback ? FALLBACK : banners;

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      const next = (current + 1) % items.length;
      try {
        scrollRef.current?.scrollTo({ x: next * (BANNER_WIDTH + 12), animated: true });
      } catch {}
      setCurrent(next);
    }, 3500);
    return () => clearInterval(t);
  }, [current, items.length]);

  const onScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (BANNER_WIDTH + 12));
    setCurrent(idx);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={BANNER_WIDTH + 12}
        decelerationRate="fast"
        onMomentumScrollEnd={onScroll}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        style={{ marginHorizontal: -16 }}
      >
        {items.map((item, i) => isFallback ? (
          <View key={item.id} style={[styles.fallback, { backgroundColor: item.bg }]}>
            <View style={[styles.circle, { backgroundColor: item.circle }]} />
            <Text style={styles.fallbackTitle}>{item.title}</Text>
            <Text style={styles.fallbackSub}>{item.sub}</Text>
          </View>
        ) : (
          <TouchableOpacity key={item.id} activeOpacity={0.95} onPress={() => item.link_type === 'restaurant' && navigation.navigate('Restaurant', { restaurantId: item.link_value })}>
            <Image source={{ uri: item.image }} style={styles.img} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {items.map((_, i) => <View key={i} style={[styles.dot, i === current && styles.dotActive]} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 16 },
  img: { width: BANNER_WIDTH, height: BANNER_HEIGHT, borderRadius: 16 },
  fallback: {
    width: BANNER_WIDTH, height: BANNER_HEIGHT,
    borderRadius: 16, padding: 20,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  circle: {
    position: 'absolute', width: 200, height: 200,
    borderRadius: 100, top: -50, right: -50, opacity: 0.35,
  },
  fallbackTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  fallbackSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D1D1D6' },
  dotActive: { width: 18, backgroundColor: '#FF6B00' },
});
