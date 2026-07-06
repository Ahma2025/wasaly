import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

export default function RatingScreen({ route, navigation }) {
  const { orderId, restaurantName, driverName } = route.params || {};
  const [foodRating, setFoodRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

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
      await api.post(`/orders/${orderId}/rate`, { food_rating: foodRating, driver_rating: driverRating, comment });
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
  commentInput: { width: '100%', borderWidth: 1.5, borderColor: '#E5E5EA', borderRadius: 14, padding: 12, fontSize: 14, color: COLORS.text, backgroundColor: '#FFF', marginBottom: 16 },
  submitBtn: { width: '100%', backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center' },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  skipBtn: { marginTop: 12 },
  skipText: { color: COLORS.gray, fontSize: 14 },
});
