import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Keyboard, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import GradientHeader from '../components/GradientHeader';
import { COLORS, SHADOW, RTL, KAV_BEHAVIOR } from '../theme';
import { fmtTime, fmtDate } from '../utils/format';

const POLL_MS = 4000;

export default function SupportChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const atBottom = useRef(true);
  const forceScroll = useRef(true);
  const sigRef = useRef('');

  const load = useCallback(async () => {
    try {
      const r = await api.get('/support/chat');
      const list = Array.isArray(r?.data) ? r.data : [];
      const last = list[list.length - 1];
      const sig = `${list.length}:${last?.id}:${last?.message}`;
      if (sig !== sigRef.current) { sigRef.current = sig; setMessages(list); } // لا إعادة رسم بلا داعٍ
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (AppState.currentState === 'active') load(); }, POLL_MS);
    const kb = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      if (atBottom.current) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    });
    return () => { clearInterval(t); kb.remove(); };
  }, [load]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await api.post('/support/chat', { message: msg });
      setText(''); // نمسح النص فقط بعد نجاح الإرسال
      forceScroll.current = true;
      await load();
    } catch (e) {
      Alert.alert('لم تُرسل الرسالة', e?.message || 'تحقق من الاتصال وحاول مرة أخرى');
    } finally { setSending(false); }
  };

  const onScroll = (e) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    atBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 60;
  };

  const renderItem = ({ item, index }) => {
    const mine = item.sender === 'user';
    const prev = messages[index - 1];
    const day = item.created_at ? fmtDate(item.created_at, false) : '';
    const showDay = day && (!prev || fmtDate(prev.created_at, false) !== day);
    return (
      <View>
        {showDay && <Text style={styles.day}>{day}</Text>}
        <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
          {!mine && <Text style={styles.sender}>فريق وصلّي</Text>}
          <Text style={[styles.msgTxt, RTL.text, mine && { color: '#FFF' }]}>{item.message}</Text>
          {!!item.created_at && <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.8)' }]}>{fmtTime(item.created_at)}</Text>}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={KAV_BEHAVIOR}>
      <GradientHeader title="وصلّي - الإدارة" subtitle="الدعم الفني" />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m, i) => String(m.id ?? i)}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          onScroll={onScroll}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            // لا نقفز للأسفل مع كل استطلاع إلا إن كان المستخدم أصلاً في الأسفل
            if (forceScroll.current || atBottom.current) {
              listRef.current?.scrollToEnd({ animated: !forceScroll.current });
              forceScroll.current = false;
            }
          }}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 44 }}>💬</Text>
              <Text style={styles.empty}>ابدأ محادثة مع فريق وصلّي 👋</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
        <TextInput style={styles.input} placeholder="اكتب رسالتك..." placeholderTextColor={COLORS.faint}
          value={text} onChangeText={setText} multiline textAlign="right" maxLength={1000} />
        <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]} onPress={send} disabled={sending || !text.trim()} activeOpacity={0.8}>
          {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="send" size={19} color="#FFF" style={{ transform: [{ scaleX: -1 }] }} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  day: { alignSelf: 'center', fontSize: 11.5, color: COLORS.gray, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginVertical: 6, overflow: 'hidden' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  // RTL: رسائلي على اليمين (بداية السطر)، رسائل الإدارة على اليسار
  mine: { backgroundColor: COLORS.primary, alignSelf: 'flex-end', borderBottomRightRadius: 5, ...SHADOW.soft },
  theirs: { backgroundColor: COLORS.card, alignSelf: 'flex-start', borderBottomLeftRadius: 5, borderWidth: 1, borderColor: COLORS.line },
  sender: { fontSize: 11, color: COLORS.primary, fontWeight: '800', marginBottom: 2, textAlign: 'right' },
  msgTxt: { fontSize: 14.5, color: COLORS.text, lineHeight: 21 },
  time: { fontSize: 10, color: COLORS.faint, marginTop: 3, textAlign: 'left' },
  empty: { textAlign: 'center', color: COLORS.gray, fontSize: 15, fontWeight: '600' },
  inputBar: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  input: { flex: 1, backgroundColor: COLORS.inputBg, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14.5, color: COLORS.text, maxHeight: 110, borderWidth: 1, borderColor: COLORS.line },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...SHADOW.glow },
});
