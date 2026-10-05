import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, AppState, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import { SUPPORT_PHONE } from '../config';
import { Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeIn, Press } from '../components/Anim';
import { Chip } from '../components/UI';
import { Skeleton } from '../components/Skeleton';
import { haptic, useReducedMotion } from '../utils/motion';

const QUICK = ['وين طلبي؟', 'بدي ألغي طلب', 'مشكلة بالدفع', 'اقتراح أو ملاحظة'];

/* ثلاث نقاط تنبض (إحساس الكتابة/الإرسال) */
function TypingDots({ color }) {
  const reduce = useReducedMotion();
  const vals = React.useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  React.useEffect(() => {
    if (reduce) return;
    const loops = vals.map((v, i) => {
      const l = Animated.loop(Animated.sequence([
        Animated.delay(i * 150),
        Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay((2 - i) * 150),
      ]));
      l.start();
      return l;
    });
    return () => loops.forEach(l => l.stop());
  }, [reduce]);
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', height: 10 }}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }} />
      ))}
    </View>
  );
}

const timeOf = (m) => { try { return m.created_at ? new Date(m.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : ''; } catch { return ''; } };

export default function SupportChatScreen() {
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]); // رسائل قيد الإرسال/فشلت (ما بتضيع)
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
  const lastCount = useRef(0);
  const nearBottom = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/support/chat');
      const list = Array.isArray(r.data) ? r.data : [];
      setMessages(prev => {
        // تحديث فقط لو تغيّرت الرسائل — يمنع قفز القائمة مع كل استطلاع
        const same = prev.length === list.length && prev[prev.length - 1]?.id === list[list.length - 1]?.id;
        return same ? prev : list;
      });
    } catch {}
    finally { setLoading(false); }
  }, []);

  // استطلاع فقط والشاشة ظاهرة والتطبيق بالمقدمة
  useFocusEffect(useCallback(() => {
    load();
    let t = setInterval(load, 5000);
    const sub = AppState.addEventListener('change', (s) => {
      clearInterval(t);
      if (s === 'active') { load(); t = setInterval(load, 5000); }
    });
    return () => { clearInterval(t); sub.remove(); };
  }, [load]));

  const all = [...messages, ...pending];

  useEffect(() => {
    if (all.length !== lastCount.current) {
      const grew = all.length > lastCount.current;
      lastCount.current = all.length;
      if (grew && nearBottom.current) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [all.length]);

  const sendMsg = async (msg, tempId) => {
    setPending(p => p.map(m => (m.id === tempId ? { ...m, failed: false } : m)));
    try {
      await api.post('/support/chat', { message: msg });
      await load();
      setPending(p => p.filter(m => m.id !== tempId));
    } catch {
      setPending(p => p.map(m => (m.id === tempId ? { ...m, failed: true } : m)));
    }
  };

  const send = () => {
    const msg = text.trim();
    if (!msg) return;
    const tempId = `tmp-${Date.now()}`;
    setPending(p => [...p, { id: tempId, sender: 'user', message: msg, pending: true }]);
    setText('');
    nearBottom.current = true;
    sendMsg(msg, tempId);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader title="الدعم الفني" subtitle="فريق وصلّي — نرد بأسرع وقت"
        right={<TouchableOpacity onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {})} accessibilityLabel="اتصال بالدعم"><Ionicons name="call" size={20} color="#FFF" /></TouchableOpacity>} />

      {loading ? (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <Skeleton w={'60%'} h={44} r={18} />
          <Skeleton w={'45%'} h={44} r={18} style={{ alignSelf: 'flex-end' }} />
          <Skeleton w={'70%'} h={60} r={18} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={all}
          keyExtractor={(m, i) => String(m.id ?? i)}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            nearBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 120;
          }}
          scrollEventThrottle={100}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.sender === 'user';
            const t = timeOf(item);
            return (
              <FadeIn from={10} duration={260} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '86%' }}>
                  {!mine && <LinearGradient colors={C.gradients.sunset} style={styles.agent}><Ionicons name="headset" size={13} color="#FFF" /></LinearGradient>}
                  {mine && !item.failed ? (
                    <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mine]}>
                      <Text style={[styles.msgTxt, { color: '#FFF' }]}>{item.message}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.bubble, mine ? styles.mine : styles.theirs, item.failed && { backgroundColor: C.dangerBg, borderColor: C.dangerBorder, borderWidth: 1 }]}>
                      <Text style={styles.msgTxt}>{item.message}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.metaRow, { alignSelf: mine ? 'flex-end' : 'flex-start' }, !mine && { marginLeft: 34 }]}>
                  {item.pending && !item.failed ? (<><TypingDots color={C.faint} /><Text style={styles.status}>جاري الإرسال</Text></>)
                    : !item.failed && !!t ? <Text style={styles.status}>{t}</Text> : null}
                  {mine && !item.pending && !item.failed && <Ionicons name="checkmark-done" size={13} color={C.primary} />}
                </View>
                {item.failed && (
                  <TouchableOpacity onPress={() => { haptic.light(); sendMsg(item.message, item.id); }} accessibilityRole="button" style={styles.retry}>
                    <Ionicons name="refresh" size={13} color={C.red} />
                    <Text style={[styles.status, { color: C.red, fontWeight: '800' }]}>فشل الإرسال — اضغط لإعادة المحاولة</Text>
                  </TouchableOpacity>
                )}
              </FadeIn>
            );
          }}
          ListEmptyComponent={
            <FadeIn style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
              <LinearGradient colors={C.gradients.sunset} style={styles.emptyIcon}><Ionicons name="chatbubbles" size={36} color="#FFF" /></LinearGradient>
              <Text style={styles.empty}>ابدأ محادثة مع فريق وصلّي 👋</Text>
              <Text style={styles.emptySub}>اكتب استفسارك أو مشكلتك بطلب معيّن (مع رقم الطلب إن وجد)</Text>
              <View style={styles.quickWrap}>{QUICK.map(q => <Chip key={q} size="sm" label={q} onPress={() => setText(q)} />)}</View>
            </FadeIn>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Press style={[styles.sendBtn, !text.trim() && { opacity: 0.45 }]} onPress={send} disabled={!text.trim()} scaleTo={0.88} accessibilityRole="button" accessibilityLabel="إرسال">
          <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="send" size={18} color="#FFF" style={{ transform: [{ scaleX: -1 }] }} />
        </Press>
        <TextInput style={styles.input} placeholder="اكتب رسالتك..." placeholderTextColor={C.faint} value={text} onChangeText={setText} multiline textAlign="right" maxLength={1000} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  bubble: { flexShrink: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: C.primary, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: C.card, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  agent: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 4 },
  retry: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 2 },
  emptyIcon: { width: 80, height: 80, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 10, paddingHorizontal: 16 },
  msgTxt: { fontSize: 14.5, color: C.text, lineHeight: 21, textAlign: 'right' },
  status: { fontSize: 11, color: C.faint, fontWeight: '500' },
  empty: { textAlign: 'center', color: C.text, fontSize: 16, fontWeight: '800' },
  emptySub: { textAlign: 'center', color: C.gray, fontSize: 13, paddingHorizontal: 30, lineHeight: 20 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, backgroundColor: C.inputBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14.5, color: C.text, maxHeight: 110, borderWidth: 1, borderColor: C.border },
  sendBtn: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...C.shadow.float },
});
