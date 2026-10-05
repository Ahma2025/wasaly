import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickImage } from '../utils/pickImage';
import GradientHeader from '../components/GradientHeader';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';

const LABELS = ['', 'سيء', 'مقبول', 'جيد', 'ممتاز', 'رائع 🤩'];

export default function RatingScreen({ route, navigation }) {
  const { orderId, restaurantName, driverName, isPersonal } = route.params || {};
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const [foodRating, setFoodRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

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
    : ['طعام لذيذ', 'خدمة سريعة', 'سائق محترم', 'سيعاد الطلب', 'التغليف ممتاز'];

  const Stars = ({ value, onChange, label }) => (
    <View>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map(i => (
          <TouchableOpacity key={i} onPress={() => onChange(i)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button" accessibilityLabel={`${label}: ${i} من 5`}>
            <Ionicons name={i <= value ? 'star' : 'star-outline'} size={34} color={i <= value ? COLORS.star : COLORS.border} />
          </TouchableOpacity>
        ))}
      </View>
      {value > 0 && <Text style={styles.starLabel}>{LABELS[value]}</Text>}
    </View>
  );

  // للطلب الشخصي: التقييم الأساسي = تقييم الخدمة/السائق
  const mainLabel = isPersonal ? 'تقييم الخدمة' : 'جودة الطعام';

  const submit = async () => {
    if (!foodRating) return Alert.alert('التقييم', `قيّم ${isPersonal ? 'الخدمة' : 'الطعام'} على الأقل`);
    setSaving(true);
    try {
      await api.post(`/orders/${orderId}/rate`, {
        restaurant_rating: foodRating,
        // بدون تقييم للسائق = null (حتى ما ينزل معدله بصفر)
        driver_rating: isPersonal ? (driverRating || foodRating) : (driverRating > 0 ? driverRating : null),
        comment: comment.trim(),
        images,
      });
      Alert.alert('شكراً! 💛', 'تم إرسال تقييمك', [{ text: 'حسناً', onPress: () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'الرئيسية' })) }]);
    } catch (e) { Alert.alert('خطأ', e?.message || 'حاول مرة أخرى'); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientHeader title="قيّم تجربتك" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.emoji}>⭐</Text>
        <Text style={styles.title}>كيف كانت تجربتك؟</Text>
        {!!restaurantName && <Text style={styles.subtitle}>{restaurantName}</Text>}

        <View style={styles.section}>
          <Text style={styles.label}>{mainLabel}</Text>
          <Stars value={foodRating} onChange={setFoodRating} label={mainLabel} />
        </View>

        {!!driverName && !isPersonal && (
          <View style={styles.section}>
            <Text style={styles.label}>خدمة التوصيل — {driverName} <Text style={styles.optional}>(اختياري)</Text></Text>
            <Stars value={driverRating} onChange={setDriverRating} label="تقييم السائق" />
          </View>
        )}

        <View style={styles.quickWrap}>
          {QUICK_COMMENTS.map(q => {
            const on = comment.includes(q);
            return (
              <TouchableOpacity key={q} style={[styles.quickTag, on && styles.quickTagActive]} onPress={() => setComment(c => (c.includes(q) ? c.replace(q, '').replace(/\s+/g, ' ').trim() : (c + ' ' + q).trim()))}>
                <Text style={[styles.quickText, on && { color: '#FFF' }]}>{q}</Text>
              </TouchableOpacity>
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

        <TouchableOpacity activeOpacity={0.9} onPress={submit} disabled={saving} style={{ alignSelf: 'stretch' }}>
          <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.submitBtn, saving && { opacity: 0.7 }]}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>إرسال التقييم</Text>}
          </LinearGradient>
        </TouchableOpacity>

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
  emoji: { fontSize: 52, marginTop: 6, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: C.text },
  subtitle: { fontSize: 15, color: C.gray, marginTop: 4, marginBottom: 18 },
  section: { width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 12, ...C.shadow.soft },
  label: { fontSize: 14.5, fontWeight: '800', color: C.text, marginBottom: 10, textAlign: 'right' },
  optional: { fontSize: 12, color: C.faint, fontWeight: '600' },
  starsRow: { flexDirection: 'row-reverse', gap: 8, justifyContent: 'center' },
  starLabel: { textAlign: 'center', marginTop: 6, color: C.primary, fontWeight: '800', fontSize: 13 },
  quickWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 14, marginTop: 4 },
  quickTag: { backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  quickTagActive: { backgroundColor: C.primary, borderColor: C.primary },
  quickText: { fontSize: 13, fontWeight: '700', color: C.text },
  commentInput: { width: '100%', minHeight: 90, textAlignVertical: 'top', borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 12, fontSize: 14, color: C.text, backgroundColor: C.inputBg, marginBottom: 12 },
  photoRow: { gap: 10, paddingVertical: 6, marginBottom: 14, flexDirection: 'row-reverse' },
  photoWrap: { position: 'relative' },
  photo: { width: 64, height: 64, borderRadius: 12 },
  photoDel: { position: 'absolute', top: -6, right: -6, backgroundColor: '#FF3B30', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.card },
  photoAdd: { width: 64, height: 64, borderRadius: 12, borderWidth: 1.5, borderColor: C.tintBorder, borderStyle: 'dashed', backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  photoAddTxt: { fontSize: 11, color: C.primary, fontWeight: '700', marginTop: 2 },
  submitBtn: { borderRadius: 18, padding: 16, alignItems: 'center', ...C.shadow.float },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  skipBtn: { marginTop: 14, padding: 6 },
  skipText: { color: C.gray, fontSize: 14, fontWeight: '600' },
});
