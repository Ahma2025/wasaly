import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// شاشة خطأ ودّية بالعربي — بدون عرض تفاصيل تقنية للزبون
function Fallback({ onRetry }) {
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#0B0B12' : '#F4F5F9';
  const card = dark ? '#16161F' : '#FFFFFF';
  const text = dark ? '#F3F4F8' : '#14142B';
  const sub = dark ? '#A4A8B6' : '#6B7280';
  return (
    <View style={[styles.wrap, { backgroundColor: bg }]}>
      <View style={[styles.card, { backgroundColor: card }]}>
        <View style={[styles.icon, { backgroundColor: dark ? '#2A1D12' : '#FFEDE2' }]}><Text style={{ fontSize: 46 }}>😕</Text></View>
        <Text style={[styles.title, { color: text }]}>صار خلل بسيط</Text>
        <Text style={[styles.sub, { color: sub }]}>ما تقلق، طلباتك وبياناتك بأمان. جرّب مرة ثانية، ولو تكرّرت المشكلة تواصل مع الدعم.</Text>
        <TouchableOpacity activeOpacity={0.9} onPress={onRetry} accessibilityRole="button" accessibilityLabel="إعادة المحاولة" style={{ alignSelf: 'stretch' }}>
          <LinearGradient colors={['#FF8A1E', '#FB5A3C', '#F53B57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
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
  card: { width: '100%', borderRadius: 28, padding: 26, alignItems: 'center', gap: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  icon: { width: 100, height: 100, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  sub: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 22, marginBottom: 6 },
  btn: { borderRadius: 18, paddingVertical: 15, alignItems: 'center' },
  btnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
