import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

const TYPE_ICONS = { order: '📦', promo: '🎁', system: '🔔', driver: '🏍️', payment: '💳' };

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/users/notifications').then(d => setNotifications(d.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/users/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.patch('/users/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const renderItem = ({ item }) => (
    <TouchableOpacity style={[styles.card, !item.is_read && styles.cardUnread]} onPress={() => !item.is_read && markRead(item.id)}>
      <View style={styles.iconBox}><Text style={{ fontSize: 22 }}>{TYPE_ICONS[item.type] || '🔔'}</Text></View>
      <View style={styles.content}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
        <Text style={styles.time}>{new Date(item.created_at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الإشعارات {unreadCount > 0 ? `(${unreadCount})` : ''}</Text>
        {unreadCount > 0 && <TouchableOpacity onPress={markAllRead}><Text style={styles.markAll}>قراءة الكل</Text></TouchableOpacity>}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onRefresh={() => api.get('/users/notifications').then(d => setNotifications(d.data))}
        refreshing={loading}
        ListEmptyComponent={!loading && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔔</Text>
            <Text style={styles.emptyText}>لا إشعارات جديدة</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  markAll: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 14, elevation: 1 },
  cardUnread: { backgroundColor: '#FFF9F5', borderWidth: 1, borderColor: '#FFE0CC' },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center', shrink: 0 },
  content: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  body: { fontSize: 13, color: COLORS.gray, marginTop: 3, lineHeight: 18 },
  time: { fontSize: 11, color: COLORS.gray, marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, alignSelf: 'flex-start', marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: COLORS.gray },
});
