import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';

export default function SupportChatScreen({ navigation }) {
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const load = async () => { try { const r = await api.get('/support/chat'); setMessages(r.data || []); } catch {} };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setText(''); setSending(true);
    try { await api.post('/support/chat', { message: msg }); await load(); } catch {} finally { setSending(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>وصلي إدارة</Text>
          <Text style={styles.sub}>الدعم الفني</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => String(m.id)}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.sender === 'user' ? styles.mine : styles.theirs]}>
            <Text style={[styles.msgTxt, item.sender === 'user' && { color: '#FFF' }]}>{item.message}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>ابدأ محادثة مع فريق وصلي 👋</Text>}
      />

      <View style={styles.inputBar}>
        <TextInput style={styles.input} placeholder="اكتب رسالتك..." placeholderTextColor={C.gray} value={text} onChangeText={setText} multiline />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending} activeOpacity={0.8}>
          <Ionicons name="send" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: C.text },
  sub: { fontSize: 11, color: '#34C759', fontWeight: '600', marginTop: 1 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: C.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { backgroundColor: C.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.line },
  msgTxt: { fontSize: 14, color: C.text, lineHeight: 20 },
  empty: { textAlign: 'center', color: C.gray, marginTop: 40, fontSize: 15 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, backgroundColor: C.inputBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.text, maxHeight: 100, borderWidth: 1, borderColor: C.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});
