import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

export default function RatingScreen({ route, navigation }) {
  const { orderId, restaurantName, driverName } = route.params || {};
  const [foodRating, setFoodRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const addPhoto = async () => {
    if (images.length >= 3) return Alert.alert('تنبيه', 'حد أقصى 3 صور');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('تنبيه', 'نحتاج إذن الصور');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      if (res.canceled || !res.assets?.[0]) return;
      setUploading(true);
      const form = new FormData();
      form.append('file', { uri: res.assets[0].uri, name: 'review.jpg', type: 'image/jpeg' });
      const up = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (up.url) setImages(arr => [...arr, up.url]);
    } catch { Alert.alert('خطأ', 'فشل رفع الصورة'); }
    finally { setUploading(false); }
  };

  const QUICK_COMMENTS = ['طعام لذيذ', 'خدمة سريعة', 'سائق محترم', 'سيعاد الطلب', 'التغليف ممتاز'];

  const Stars = ({ value, onChange }) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map(i => (
        <TouchableOpacity key={i} onPress={() => onChange(i)}>
          <Text style={[styles.star, i <= value && styles.starActive]}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const submit = async () => {
    if (!foodRating) return Alert.alert('خطأ', 'قيّم الطعام على الأقل');
    setSaving(true);
    try {
      await api.post(`/orders/${orderId}/rate`, { restaurant_rating: foodRating, driver_rating: driverRating, comment, images });
      Alert.alert('شكراً!', 'تم إرسال تقييمك', [{ text: 'حسناً', onPress: () => navigation.navigate('Main', { screen: 'الرئيسية' }) }]);
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>قيّم تجربتك</Text></View>

      <View style={styles.content}>
        <Text style={styles.emoji}>⭐</Text>
        <Text style={styles.title}>كيف كانت تجربتك؟</Text>
        <Text style={styles.subtitle}>{restaurantName}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>جودة الطعام</Text>
          <Stars value={foodRating} onChange={setFoodRating} />
        </View>

        {driverName && (
          <View style={styles.section}>
            <Text style={styles.label}>خدمة التوصيل - {driverName}</Text>
            <Stars value={driverRating} onChange={setDriverRating} />
          </View>
        )}

        <View style={styles.quickWrap}>
          {QUICK_COMMENTS.map(q => (
            <TouchableOpacity key={q} style={[styles.quickTag, comment.includes(q) && styles.quickTagActive]} onPress={() => setComment(c => c.includes(q) ? c.replace(q, '').trim() : (c + ' ' + q).trim())}>
              <Text style={[styles.quickText, comment.includes(q) && { color: '#FFF' }]}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput style={styles.commentInput} placeholder="أضف تعليقاً..." value={comment} onChangeText={setComment} multiline numberOfLines={3} />

        {/* صور المراجعة */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
          {images.map((uri, i) => (
            <View key={i} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} />
              <TouchableOpacity style={styles.photoDel} onPress={() => setImages(arr => arr.filter((_, j) => j !== i))}>
                <Ionicons name="close" size={13} color="#FFF" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < 3 && (
            <TouchableOpacity style={styles.photoAdd} onPress={addPhoto} disabled={uploading}>
              <Ionicons name={uploading ? 'hourglass-outline' : 'camera'} size={22} color={COLORS.primary} />
              <Text style={styles.photoAddTxt}>{uploading ? '...' : 'صورة'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={saving}>
          <Text style={styles.submitText}>{saving ? 'جاري الإرسال...' : 'إرسال التقييم'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'الرئيسية' })} style={styles.skipBtn}>
          <Text style={styles.skipText}>تخطي</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  content: { flex: 1, padding: 24, alignItems: 'center' },
  emoji: { fontSize: 56, marginTop: 20, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  subtitle: { fontSize: 15, color: COLORS.gray, marginTop: 4, marginBottom: 24 },
  section: { width: '100%', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  starsRow: { flexDirection: 'row', gap: 6 },
  star: { fontSize: 32, color: '#E5E5EA' },
  starActive: { color: '#FFD700' },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
  quickTag: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#E5E5EA' },
  quickTagActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  quickText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  commentInput: { width: '100%', borderWidth: 1.5, borderColor: '#E5E5EA', borderRadius: 14, padding: 12, fontSize: 14, color: COLORS.text, backgroundColor: '#FFF', marginBottom: 12 },
  photoRow: { gap: 10, paddingVertical: 4, marginBottom: 12 },
  photoWrap: { position: 'relative' },
  photo: { width: 64, height: 64, borderRadius: 12 },
  photoDel: { position: 'absolute', top: -6, right: -6, backgroundColor: '#FF3B30', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  photoAdd: { width: 64, height: 64, borderRadius: 12, borderWidth: 1.5, borderColor: '#FFE0CC', borderStyle: 'dashed', backgroundColor: '#FFF8F4', alignItems: 'center', justifyContent: 'center' },
  photoAddTxt: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 2 },
  submitBtn: { width: '100%', backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center' },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  skipBtn: { marginTop: 12 },
  skipText: { color: COLORS.gray, fontSize: 14 },
});
