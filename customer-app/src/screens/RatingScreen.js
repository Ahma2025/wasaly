import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickImage } from '../utils/pickImage';
import GradientHeader from '../components/GradientHeader';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { Animated } from 'react-native';
import { FadeIn, PopIn, Press, GradientButton } from '../components/Anim';
import { Chip } from '../components/UI';
import { haptic, SPRING_POP, isReducedMotion } from '../utils/motion';
import { readCache } from '../utils/cache';
import { normStoreType } from '../utils/storeTypes';
import { markRated } from '../utils/rated';
import { KB_TOOLBAR_H } from '../config';

const FACES = ['', '😞', '😐', '🙂', '😋', '🤩'];

/* نجمة واحدة: ترتد عند الاختيار مع تأخير متتابع */
function Star({ i, value, onChange, label, C }) {
  const v = React.useRef(new Animated.Value(i <= value ? 1 : 0)).current;
  React.useEffect(() => {
    if (isReducedMotion()) { v.setValue(i <= value ? 1 : 0); return; }
    Animated.sequence([
      Animated.delay(i <= value ? i * 45 : 0),
      Animated.spring(v, { toValue: i <= value ? 1 : 0, ...SPRING_POP }),
    ]).start();
  }, [value]);
  const scale = v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1.35, 1.12] });
  const rot = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '72deg'] });
  return (
    <TouchableOpacity onPress={() => { haptic.select(); onChange(i); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button" accessibilityLabel={label + ': ' + i + ' من 5'} accessibilityState={{ selected: i <= value }}>
      <Animated.View style={{ transform: [{ scale }, { rotate: rot }] }}>
        <Ionicons name={i <= value ? 'star' : 'star-outline'} size={38} color={i <= value ? C.star : C.border} />
      </Animated.View>
    </TouchableOpacity>
  );
}

function AnimatedStars({ value, onChange, label, C, styles }) {
  return (
    <View>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map(i => <Star key={i} i={i} value={value} onChange={onChange} label={label} C={C} />)}
      </View>
      {value > 0 && (
        <PopIn key={value} from={0.8} style={styles.starLabelWrap}>
          <Text style={{ fontSize: 18 }}>{FACES[value]}</Text>
          <Text style={styles.starLabel}>{LABELS[value]}</Text>
        </PopIn>
      )}
    </View>
  );
}

const LABELS = ['', 'سيء', 'مقبول', 'جيد', 'ممتاز', 'رائع 🤩'];

// المتاجر اللي تقييمها "أكل": مطاعم وحلويات ومخابز — الباقي (صيدلية، اتصالات، ورد…) منتجات وخدمة
const FOOD_TYPES = ['restaurant', 'sweets'];

export default function RatingScreen({ route, navigation }) {
  const { orderId, groupId, restaurantName, restaurantId, driverName, isPersonal } = route.params || {};
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const [foodRating, setFoodRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storeType, setStoreType] = useState(route.params?.storeType || null);

  // نوع المتجر (من الطلب، وإلا من كاش صفحة المطعم)
  useEffect(() => {
    if (storeType || isPersonal || restaurantId == null) return;
    readCache('rest_' + restaurantId).then(c => { if (c?.restaurant?.store_type) setStoreType(c.restaurant.store_type); }).catch(() => {});
  }, [restaurantId]);
  const isFood = !storeType || FOOD_TYPES.includes(normStoreType(storeType));

  const addPhoto = async () => {
    if (images.length >= 3) return Alert.alert('تنبيه', 'حد أقصى 3 صور');
    try {
      const asset = await pickImage({ quality: 0.6 });
      if (!asset) return;
      setUploading(true);
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: 'review.jpg', type: 'image/jpeg' });
      const up = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (up.url) setImages(arr => [...arr, up.url]);
    } catch { Alert.alert('خطأ', 'فشل رفع الصورة'); }
    finally { setUploading(false); }
  };

  const QUICK_COMMENTS = isPersonal
    ? ['سائق محترم', 'وصل بسرعة', 'تعامل ممتاز', 'رح أطلب مرة ثانية']
    : isFood
      ? ['طعام لذيذ', 'خدمة سريعة', 'سائق محترم', 'رح أطلب مرة ثانية', 'التغليف ممتاز']
      : ['منتجات ممتازة', 'خدمة سريعة', 'سائق محترم', 'رح أطلب مرة ثانية', 'التغليف ممتاز'];

  // للطلب الشخصي: التقييم الأساسي = تقييم الخدمة/السائق
  const mainLabel = isPersonal ? 'تقييم الخدمة' : isFood ? 'جودة الطعام' : 'جودة المنتجات والخدمة';
  const leave = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'الرئيسية' }));

  const submit = async () => {
    if (!foodRating) return Alert.alert('التقييم', `قيّم ${isPersonal ? 'الخدمة' : isFood ? 'الطعام' : 'المنتجات والخدمة'} على الأقل`);
    setSaving(true);
    try {
      const driverValue = isPersonal ? (driverRating || foodRating) : (driverRating > 0 ? driverRating : null);
      const r = await api.post(`/orders/${orderId}/rate`, {
        restaurant_rating: foodRating,
        // بدون تقييم للسائق = null (حتى ما ينزل معدله بصفر)
        driver_rating: driverValue,
        comment: comment.trim(),
        images,
      });
      markRated({ orderId, groupId, driver: !!driverValue || !!r?.already }).catch(() => {});
      if (r?.already) {
        Alert.alert('قيّمت هذا الطلب من قبل', 'تقييمك السابق محفوظ — شكراً إلك 💛', [{ text: 'حسناً', onPress: leave }]);
        return;
      }
      Alert.alert('شكراً! 💛', r?.driver_rating_ignored ? 'تم إرسال تقييمك — السائق انقيّم من قبل ضمن هالطلب المجمّع' : 'تم إرسال تقييمك', [{ text: 'حسناً', onPress: leave }]);
    } catch (e) { Alert.alert('خطأ', e?.message || 'حاول مرة أخرى'); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? KB_TOOLBAR_H : 0}>
      <GradientHeader title="قيّم تجربتك" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <PopIn>
          <LinearGradient colors={COLORS.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBadge}>
            <Ionicons name="star" size={40} color="#FFF" />
          </LinearGradient>
        </PopIn>
        <FadeIn delay={80} style={{ alignItems: 'center' }}>
          <Text style={styles.title}>كيف كانت تجربتك؟</Text>
          {!!restaurantName && <Text style={styles.subtitle}>{restaurantName}</Text>}
        </FadeIn>

        <FadeIn delay={120} style={styles.section}>
          <Text style={styles.label}>{mainLabel}</Text>
          <AnimatedStars value={foodRating} onChange={setFoodRating} label={mainLabel} C={COLORS} styles={styles} />
        </FadeIn>

        {!!driverName && !isPersonal && (
          <View style={styles.section}>
            <Text style={styles.label}>خدمة التوصيل — {driverName} <Text style={styles.optional}>(اختياري)</Text></Text>
            <AnimatedStars value={driverRating} onChange={setDriverRating} label={"تقييم السائق"} C={COLORS} styles={styles} />
          </View>
        )}

        <View style={styles.quickWrap}>
          {QUICK_COMMENTS.map(q => {
            const on = comment.includes(q);
            return (
              <Chip key={q} size="sm" label={q} selected={on} onPress={() => setComment(c => (c.includes(q) ? c.replace(q, '').replace(/\s+/g, ' ').trim() : (c + ' ' + q).trim()))} />
            );
          })}
        </View>

        <TextInput style={styles.commentInput} placeholder="أضف تعليقاً..." placeholderTextColor={COLORS.faint} value={comment} onChangeText={setComment}
          multiline numberOfLines={3} textAlign="right" maxLength={500} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow} style={{ alignSelf: 'stretch' }}>
          {images.length < 3 && (
            <TouchableOpacity style={styles.photoAdd} onPress={addPhoto} disabled={uploading} accessibilityLabel="إضافة صورة">
              {uploading ? <ActivityIndicator color={COLORS.primary} /> : <Ionicons name="camera" size={22} color={COLORS.primary} />}
              <Text style={styles.photoAddTxt}>{uploading ? '...' : 'صورة'}</Text>
            </TouchableOpacity>
          )}
          {images.map((uri, i) => (
            <View key={uri} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} />
              <TouchableOpacity style={styles.photoDel} onPress={() => setImages(arr => arr.filter((_, j) => j !== i))} accessibilityLabel="حذف الصورة">
                <Ionicons name="close" size={13} color="#FFF" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <GradientButton title="إرسال التقييم" onPress={submit} loading={saving} style={{ alignSelf: 'stretch' }} icon={<Ionicons name="send" size={17} color="#FFF" />} />

        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'الرئيسية' }))} style={styles.skipBtn}>
          <Text style={styles.skipText}>لاحقاً</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, alignItems: 'center' },
  heroBadge: { width: 84, height: 84, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 12, elevation: 10, shadowColor: '#FFB020', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  starLabelWrap: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  title: { fontSize: 22, fontWeight: '900', color: C.text },
  subtitle: { fontSize: 15, color: C.gray, marginTop: 4, marginBottom: 18 },
  section: { width: '100%', backgroundColor: C.card, borderRadius: 24, padding: 18, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  label: { fontSize: 14.5, fontWeight: '800', color: C.text, marginBottom: 10, textAlign: 'right' },
  optional: { fontSize: 12, color: C.faint, fontWeight: '600' },
  starsRow: { flexDirection: 'row-reverse', gap: 10, justifyContent: 'center', paddingVertical: 4 },
  starLabel: { textAlign: 'center', color: C.primary, fontWeight: '900', fontSize: 15 },
  quickWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 14, marginTop: 4 },
  quickTag: { backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  quickTagActive: { backgroundColor: C.primary, borderColor: C.primary },
  quickText: { fontSize: 13, fontWeight: '700', color: C.text },
  commentInput: { width: '100%', minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 12, fontSize: 14, color: C.text, backgroundColor: C.inputBg, marginBottom: 12 },
  photoRow: { gap: 10, paddingVertical: 6, marginBottom: 14, flexDirection: 'row-reverse' },
  photoWrap: { position: 'relative' },
  photo: { width: 72, height: 72, borderRadius: 18 },
  photoDel: { position: 'absolute', top: -6, right: -6, backgroundColor: '#FF3B30', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.card },
  photoAdd: { width: 72, height: 72, borderRadius: 18, borderWidth: 1.5, borderColor: C.tintBorder, borderStyle: 'dashed', backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  photoAddTxt: { fontSize: 11, color: C.primary, fontWeight: '700', marginTop: 2 },
  submitBtn: { borderRadius: 18, padding: 16, alignItems: 'center', ...C.shadow.float },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  skipBtn: { marginTop: 14, padding: 6 },
  skipText: { color: C.gray, fontSize: 14, fontWeight: '600' },
});
