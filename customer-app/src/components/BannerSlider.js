import React, { useRef, useState, useEffect } from 'react';
import { View, Image, FlatList, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const BANNER_WIDTH = width - 32;

export default function BannerSlider({ banners }) {
  const router = useRouter();
  const flatRef = useRef(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (banners.length < 2) return;
    const interval = setInterval(() => {
      const next = (current + 1) % banners.length;
      flatRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrent(next);
    }, 3000);
    return () => clearInterval(interval);
  }, [current, banners]);

  const handleBannerPress = (banner) => {
    if (banner.link_type === 'restaurant') router.push(`/restaurant/${banner.link_value}`);
    else if (banner.link_type === 'category') router.push(`/?category=${banner.link_value}`);
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatRef}
        data={banners}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.95} onPress={() => handleBannerPress(item)}>
            <Image source={{ uri: item.image }} style={styles.banner} resizeMode="cover" />
          </TouchableOpacity>
        )}
        onMomentumScrollEnd={e => setCurrent(Math.round(e.nativeEvent.contentOffset.x / BANNER_WIDTH))}
        snapToInterval={BANNER_WIDTH + 12}
        decelerationRate="fast"
        contentContainerStyle={{ gap: 12 }}
      />
      <View style={styles.dots}>
        {banners.map((_, i) => (
          <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 16 },
  banner: { width: BANNER_WIDTH, height: 160, borderRadius: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D1D1D6' },
  dotActive: { width: 18, backgroundColor: '#FF6B00' }
});
