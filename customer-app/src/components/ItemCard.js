import React, { useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Press } from './Anim';
import { useTheme } from '../context/ThemeContext';
import { SPRING_POP } from '../utils/motion';

export default function ItemCard({ item, onAdd, onPress }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const price = parseFloat(item.price || 0);
  const disc = parseFloat(item.discount_price || 0);
  const hasDiscount = disc > 0 && disc < price;
  const shown = hasDiscount ? disc : price;
  const addScale = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;

  // زر الإضافة: ارتداد + دوران خفيف للـ "+" (الاهتزاز يجي من شاشة المطعم عند الإضافة الفعلية)
  const tapAdd = () => {
    spin.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(addScale, { toValue: 0.8, ...SPRING_POP, stiffness: 420 }),
        Animated.spring(addScale, { toValue: 1, ...SPRING_POP }),
      ]),
      Animated.timing(spin, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
    onAdd && onAdd();
  };
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  // قارئ الشاشة: الكرت (الاسم والسعر) عنصر، وزر "+" عنصر منفصل ظاهر (مش مخفي داخل عنصر أب)
  const a11yOpen = { accessibilityActions: [{ name: 'activate' }], onAccessibilityAction: (e) => { if (e.nativeEvent.actionName === 'activate') onPress && onPress(); } };
  return (
    <Press style={styles.card} onPress={onPress} scaleTo={0.97} haptic={false} accessible={false}>
      <View style={styles.row}>
        <View style={styles.imageWrap} accessible={false}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.image} />
          ) : (
            <LinearGradient colors={[COLORS.tint, COLORS.sec]} style={[styles.image, { justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="fast-food-outline" size={34} color={COLORS.primary} />
            </LinearGradient>
          )}
          {hasDiscount && (
            <LinearGradient colors={['#FF5E3A', '#F04438']} style={styles.discountBadge}>
              <Text style={styles.discountText}>-{Math.round((1 - disc / price) * 100)}%</Text>
            </LinearGradient>
          )}
          <Pressable style={styles.addBtn} onPress={tapAdd} accessibilityRole="button" accessibilityLabel={`أضف ${item.name_ar}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Animated.View style={{ transform: [{ scale: addScale }] }}>
              <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtnGrad}>
                <Animated.View style={{ transform: [{ rotate }] }}>
                  <Ionicons name="add" size={21} color="#FFF" />
                </Animated.View>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </View>
        <View style={styles.info} accessible accessibilityRole="button" accessibilityLabel={`${item.name_ar}، ${shown.toFixed(2)} شيكل${hasDiscount ? `، بدل ${price.toFixed(2)}` : ''}`}
          accessibilityHint="اضغط مرتين لعرض التفاصيل والإضافات" onAccessibilityTap={onPress} {...a11yOpen}>
          <View style={styles.badges}>
            {(!!item.is_popular || !!item.is_bestseller) && (
              <View style={[styles.badge, styles.badgeHot]}><Ionicons name="flame" size={10} color={COLORS.primary} /><Text style={styles.badgeHotText}>الأكثر طلباً</Text></View>
            )}
            {!!item.is_new && <View style={[styles.badge, styles.badgeNew]}><Ionicons name="sparkles" size={10} color={COLORS.successText} /><Text style={styles.badgeText}>جديد</Text></View>}
            {!!item.is_spicy && <View style={[styles.badge, { backgroundColor: COLORS.dangerBg }]}><Text style={{ fontSize: 10 }}>🌶️</Text></View>}
            {!!item.is_vegetarian && <View style={[styles.badge, styles.badgeNew]}><Ionicons name="leaf" size={10} color={COLORS.successText} /></View>}
          </View>
          <Text style={styles.name} numberOfLines={2}>{item.name_ar}</Text>
          {!!item.description_ar && <Text style={styles.desc} numberOfLines={2}>{item.description_ar}</Text>}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{shown.toFixed(2)}<Text style={styles.cur}> ₪</Text></Text>
            {hasDiscount && <Text style={styles.originalPrice}>{price.toFixed(2)}₪</Text>}
            {!!item.calories && <Text style={styles.calories}>· {item.calories} سعرة</Text>}
          </View>
        </View>
      </View>
    </Press>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 22, marginBottom: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, ...COLORS.shadow.soft },
  row: { flexDirection: 'row-reverse' },
  info: { flex: 1, paddingRight: 12, paddingLeft: 2, justifyContent: 'center' },
  badges: { flexDirection: 'row-reverse', gap: 4, marginBottom: 5, flexWrap: 'wrap' },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeNew: { backgroundColor: COLORS.successBg },
  badgeText: { fontSize: 10, color: COLORS.successText, fontWeight: '800' },
  badgeHot: { backgroundColor: COLORS.tint },
  badgeHotText: { fontSize: 10, color: COLORS.primary, fontWeight: '800' },
  discountBadge: { position: 'absolute', top: 6, right: 6, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  discountText: { color: '#FFF', fontSize: 10.5, fontWeight: '900' },
  name: { fontSize: 15.5, fontWeight: '800', color: COLORS.text, marginBottom: 3, textAlign: 'right', lineHeight: 22 },
  desc: { fontSize: 12.5, color: COLORS.gray, lineHeight: 19, marginBottom: 8, textAlign: 'right', fontWeight: '500' },
  calories: { fontSize: 11.5, color: COLORS.faint, fontWeight: '500' },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  price: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  cur: { fontSize: 13, fontWeight: '800' },
  originalPrice: { fontSize: 12.5, color: COLORS.faint, textDecorationLine: 'line-through', fontWeight: '500' },
  imageWrap: { position: 'relative' },
  image: { width: 104, height: 104, borderRadius: 18, backgroundColor: COLORS.inputBg },
  addBtn: { position: 'absolute', bottom: -6, left: -6, borderRadius: 18, borderWidth: 3, borderColor: COLORS.card, ...COLORS.shadow.float },
  addBtnGrad: { width: 36, height: 36, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
});
