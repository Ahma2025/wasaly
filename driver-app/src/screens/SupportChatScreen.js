import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Alert, Keyboard, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { useSocketEvent } from '../utils/socket';
import { useDriver } from '../context/DriverContext';
import GradientHeader from '../components/GradientHeader';
import { FadeIn, Skeleton, Press, LoadingDots, EmptyState, haptic } from '../components/Anim';
import { COLORS, GRADIENTS, SHADOW, RTL, KAV_BEHAVIOR, RADIUS } from '../theme';
import { fmtTime, fmtDate } from '../utils/format';

// D-11: الرسائل الجديدة تصل فوراً عبر السوكِت (support_message)؛ الاستطلاع احتياط بطيء فقط
const POLL_MS = 20000;

// هيكل تحميل على شكل فقاعات محادثة
function ChatSkeleton() {
  const rows = [{ mine: false, w: '62%' }, { mine: true, w: '48%' }, { mine: false, w: '70%' }, { mine: true, w: '40%' }];
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {rows.map((r, i) => (
        <Skeleton key={i} width={r.w} height={i % 2 ? 44 : 58} radius={18} style={{ alignSelf: r.mine ? 'flex-end' : 'flex-start' }} />
      ))}
    </View>
  );
}

export default function SupportChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { markSupportRead } = useDriver();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const listRef = useRef(null);
  const atBottom = useRef(true);
  const forceScroll = useRef(true);
  const sigRef = useRef('');
  const seenIds = useRef(null); // رسائل التحميل الأول تظهر بلا حركة؛ الجديدة فقط تنزلق للداخل

  const load = useCallback(async () => {
    try {
      const r = await api.get('/support/chat');
      const list = Array.isArray(r?.data) ? r.data : [];
      const last = list[list.length - 1];
      const sig = `${list.length}:${last?.id}:${last?.message}`;
      if (!seenIds.current) seenIds.current = new Set(list.map((m, i) => String(m.id ?? i)));
      if (sig !== sigRef.current) { sigRef.current = sig; setMessages(list); } // لا إعادة رسم بلا داعٍ
      setError(false);
    } catch { setError(true); } finally { setLoading(false); } // D-25
  }, []);

  // المحادثة مفتوحة = مقروءة (نقطة التنبيه في الرئيسية/حسابي تختفي)
  useFocusEffect(useCallback(() => { markSupportRead && markSupportRead(); }, [markSupportRead]));
  useSocketEvent('support_message', () => { load(); markSupportRead && markSupportRead(); });
  useSocketEvent('__reconnected', () => load());

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
      haptic.success();
      forceScroll.current = true;
      await load();
    } catch (e) {
      haptic.warn();
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
    const grouped = prev && prev.sender === item.sender && !showDay;
    const body = (
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs, grouped && { marginTop: -4 }]}>
        {mine && <LinearGradient colors={GRADIENTS.sunset} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 18, borderBottomRightRadius: 6 }]} />}
        {!mine && !grouped && (
          <View style={[RTL.row, { gap: 5, marginBottom: 3 }]}>
            <View style={styles.teamDot} />
            <Text style={styles.sender}>فريق وصلّي</Text>
          </View>
        )}
        <Text style={[styles.msgTxt, RTL.text, mine && { color: '#FFF' }]}>{item.message}</Text>
        {!!item.created_at && <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.85)' }]}>{fmtTime(item.created_at)}</Text>}
      </View>
    );
    return (
      <View>
        {showDay && (
          <View style={styles.dayWrap}><Text style={styles.day}>{day}</Text></View>
        )}
        {(!seenIds.current || seenIds.current.has(String(item.id ?? index))) ? body : <FadeIn from={10} duration={260}>{body}</FadeIn>}
      </View>
    );
  };

  const canSend = !!text.trim() && !sending;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={KAV_BEHAVIOR}>
      <GradientHeader title="وصلّي - الإدارة" subtitle="الدعم الفني · نرد عادةً خلال دقائق" />

      {error && messages.length > 0 && (
        <View style={[RTL.row, styles.offline]}>
          <Ionicons name="cloud-offline-outline" size={16} color={COLORS.redDeep} />
          <Text style={[styles.offlineText, RTL.text]}>تعذّر التحديث — تعرض آخر رسائل محمّلة</Text>
        </View>
      )}
      {loading ? (
        <View style={{ flex: 1 }}><ChatSkeleton /></View>
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
            <View style={{ flex: 1, justifyContent: 'center' }}>
              {error ? (
                <EmptyState icon="cloud-offline-outline" tone="red" title="تعذّر تحميل المحادثة" text="تحقّق من الاتصال ثم أعد المحاولة" actionLabel="إعادة المحاولة" actionIcon="refresh" onAction={() => { setLoading(true); load(); }} />
              ) : (
                <EmptyState icon="chatbubbles-outline" title="ابدأ محادثة مع فريق وصلّي" text="اكتب سؤالك أو مشكلتك وسنرد عليك بأسرع وقت — طلبات السحب أيضاً من هنا" />
              )}
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
        <View style={[styles.inputWrap, focused && styles.inputWrapFocus]}>
          <TextInput style={styles.input} placeholder="اكتب رسالتك..." placeholderTextColor={COLORS.faint}
            value={text} onChangeText={setText} multiline textAlign="right" maxLength={1000}
            selectionColor={COLORS.primary} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityLabel="نص الرسالة" />
        </View>
        <Press style={[styles.sendBtn, !canSend && { opacity: 0.45 }]} onPress={send} disabled={!canSend} hapticStyle="light" accessibilityLabel="إرسال">
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendGrad}>
            {sending ? <LoadingDots size={5} /> : <Ionicons name="send" size={19} color="#FFF" style={{ transform: [{ scaleX: -1 }] }} />}
          </LinearGradient>
        </Press>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  dayWrap: { alignItems: 'center', marginVertical: 8 },
  offline: { gap: 6, marginHorizontal: 16, marginTop: 10, backgroundColor: COLORS.redSoft, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8 },
  offlineText: { flex: 1, color: COLORS.redDeep, fontWeight: '700', fontSize: 12.5 },
  day: { fontSize: 11.5, color: COLORS.sub, backgroundColor: COLORS.card, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, fontWeight: '500' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  // RTL: رسائلي على اليمين (بداية السطر)، رسائل الإدارة على اليسار
  mine: { backgroundColor: COLORS.primary, alignSelf: 'flex-end', borderBottomRightRadius: 6, ...SHADOW.soft },
  theirs: { backgroundColor: COLORS.card, alignSelf: 'flex-start', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: COLORS.line },
  teamDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  sender: { fontSize: 11.5, color: COLORS.primary, fontWeight: '800', textAlign: 'right' },
  msgTxt: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  time: { fontSize: 10.5, color: COLORS.faint, marginTop: 4, textAlign: 'left' },
  inputBar: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  inputWrap: { flex: 1, backgroundColor: COLORS.inputBg, borderRadius: 24, borderWidth: 1.5, borderColor: COLORS.line, minHeight: 48, justifyContent: 'center' },
  inputWrapFocus: { borderColor: COLORS.primary, backgroundColor: COLORS.card },
  input: { paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, color: COLORS.text, maxHeight: 120 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, ...SHADOW.glow },
  sendGrad: { flex: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
