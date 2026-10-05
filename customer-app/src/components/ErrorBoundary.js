import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

// شاشة خطأ ودّية بالعربي — بدون عرض تفاصيل تقنية للزبون
// (مستقلة عن ThemeContext عمداً: لازم تشتغل حتى لو انهار الـ Provider نفسه)
function Fallback({ onRetry }) {
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#0B0B12' : '#F6F7FB';
  const card = dark ? '#16161F' : '#FFFFFF';
  const text = dark ? '#F3F4F8' : '#14142B';
  const sub = dark ? '#B8B9CC' : '#4E4B66';
  const tint = dark ? '#2A1D12' : '#FFF3EA';
  return (
    <View style={[styles.wrap, { backgroundColor: bg }]}>
      <LinearGradient colors={['#FF8A00', '#FF5E3A', '#F53B57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.topGlow} />
      <View style={[styles.card, { backgroundColor: card, borderColor: dark ? '#272734' : '#ECEEF4' }]}>
        <View style={[styles.blob, { backgroundColor: tint }]}>
          <LinearGradient colors={['#FF8A00', '#F53B57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
            <Ionicons name="construct" size={40} color="#FFF" />
          </LinearGradient>
        </View>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">صار خلل بسيط</Text>
        <Text style={[styles.sub, { color: sub }]}>ما تقلق، طلباتك وبياناتك بأمان. جرّب مرة ثانية، ولو تكرّرت المشكلة تواصل مع الدعم.</Text>
        <TouchableOpacity activeOpacity={0.9} onPress={onRetry} accessibilityRole="button" accessibilityLabel="إعادة المحاولة" style={styles.btnWrap}>
          <LinearGradient colors={['#FF8A00', '#FF5E3A', '#F53B57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.btnTxt}>إعادة المحاولة</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(error, info) { try { console.error('App crash:', error?.message, info?.componentStack); } catch {} }
  render() {
    if (this.state.error) return <Fallback onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 260, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, opacity: 0.95 },
  card: { width: '100%', borderRadius: 28, padding: 26, alignItems: 'center', gap: 12, borderWidth: 1, elevation: 8, shadowColor: '#14142B', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  blob: { width: 120, height: 120, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  icon: { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  sub: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 22, marginBottom: 6 },
  btnWrap: { alignSelf: 'stretch', borderRadius: 18, elevation: 10, shadowColor: '#FF6B00', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  btn: { borderRadius: 18, height: 54, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
