import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, AppState, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import { SUPPORT_PHONE } from '../config';

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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.primary} /></View>
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
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs, item.failed && { backgroundColor: C.dangerBg, borderColor: C.dangerBorder, borderWidth: 1 }]}>
                  <Text style={[styles.msgTxt, mine && !item.failed && { color: '#FFF' }]}>{item.message}</Text>
                </View>
                {item.pending && !item.failed && <Text style={styles.status}>جاري الإرسال…</Text>}
                {item.failed && (
                  <TouchableOpacity onPress={() => sendMsg(item.message, item.id)}>
                    <Text style={[styles.status, { color: C.red, fontWeight: '800' }]}>فشل الإرسال — اضغط لإعادة المحاولة</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50, gap: 8 }}>
              <Text style={{ fontSize: 44 }}>👋</Text>
              <Text style={styles.empty}>ابدأ محادثة مع فريق وصلّي</Text>
              <Text style={styles.emptySub}>اكتب استفسارك أو مشكلتك بطلب معيّن (مع رقم الطلب إن وجد)</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={send} disabled={!text.trim()} activeOpacity={0.8} accessibilityLabel="إرسال">
          <Ionicons name="send" size={19} color="#FFF" style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <TextInput style={styles.input} placeholder="اكتب رسالتك..." placeholderTextColor={C.faint} value={text} onChangeText={setText} multiline textAlign="right" maxLength={1000} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: C.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.line },
  msgTxt: { fontSize: 14.5, color: C.text, lineHeight: 21, textAlign: 'right' },
  status: { fontSize: 11, color: C.faint, marginTop: 3, marginHorizontal: 4 },
  empty: { textAlign: 'center', color: C.text, fontSize: 16, fontWeight: '800' },
  emptySub: { textAlign: 'center', color: C.gray, fontSize: 13, paddingHorizontal: 30, lineHeight: 20 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, backgroundColor: C.inputBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14.5, color: C.text, maxHeight: 110, borderWidth: 1, borderColor: C.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});
