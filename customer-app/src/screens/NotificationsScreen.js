import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import EmptyState from '../components/EmptyState';
import { CardRowSkeleton } from '../components/Skeleton';
import { FadeIn } from '../components/Anim';

const TYPE_ICONS = { order: '📦', order_status: '📦', promo: '🎁', system: '🔔', driver: '🏍️', payment: '💳', review: '⭐', wallet: '💰' };

const parseData = (d) => {
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d) || {}; } catch { return {}; } }
  return d;
};
const asList = (d) => (Array.isArray(d) ? d : []);

export default function NotificationsScreen({ navigation }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/notifications');
      const list = asList(d?.data);
      setNotifications(list);
      writeCache('notifications', list);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await readCache('notifications');
      if (cached) { setNotifications(asList(cached)); setLoading(false); }
      load();
    })();
  }, [load]);

  const markRead = async (id) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    try { await api.patch(`/notifications/${id}/read`); } catch {}
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try { await api.patch('/notifications/read-all'); } catch {}
  };

  const onPress = (item) => {
    if (!item.is_read) markRead(item.id);
    const data = parseData(item.data);
    if (data.order_id) navigation.navigate('OrderTracking', { orderId: data.order_id });
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const renderItem = ({ item, index }) => {
    const data = parseData(item.data);
    const title = item.title_ar || item.title || 'إشعار';
    const body = item.body_ar || item.body || '';
    const opens = !!data.order_id;
    return (
      <FadeIn delay={Math.min(index, 8) * 45}>
        <TouchableOpacity style={[styles.card, !item.is_read && styles.cardUnread]} onPress={() => onPress(item)} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel={`${item.is_read ? '' : 'غير مقروء، '}${title}`}>
          <View style={styles.iconBox}><Text style={{ fontSize: 22 }}>{TYPE_ICONS[item.type] || (opens ? '📦' : '🔔')}</Text></View>
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            {!!body && <Text style={styles.body}>{body}</Text>}
            <View style={styles.metaRow}>
              <Text style={styles.time}>{item.created_at ? new Date(item.created_at).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
              {opens && <Text style={styles.openTxt}>عرض الطلب ‹</Text>}
            </View>
          </View>
          {!item.is_read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </FadeIn>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title={`الإشعارات${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        right={unreadCount > 0 ? <TouchableOpacity onPress={markAllRead} accessibilityLabel="تحديد الكل كمقروء"><Ionicons name="checkmark-done" size={22} color="#FFF" /></TouchableOpacity> : null}
      />

      {loading ? (
        <View style={{ padding: 8 }}>{[0, 1, 2, 3, 4].map(i => <CardRowSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(i, idx) => String(i.id ?? idx)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          ListEmptyComponent={<EmptyState emoji="🔔" title="لا إشعارات جديدة" subtitle="رح نبلغك هون بكل تحديث على طلباتك" />}
        />
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  card: { flexDirection: 'row-reverse', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 14, ...C.shadow.soft },
  cardUnread: { backgroundColor: C.tint, borderWidth: 1, borderColor: C.tintBorder },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  body: { fontSize: 13, color: C.gray, marginTop: 3, lineHeight: 19, textAlign: 'right' },
  metaRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  time: { fontSize: 11, color: C.gray },
  openTxt: { fontSize: 11.5, color: C.primary, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, alignSelf: 'flex-start', marginTop: 4 },
});
