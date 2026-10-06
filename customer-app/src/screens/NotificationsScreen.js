import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { isNetworkError, NETWORK_MESSAGE } from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import EmptyState from '../components/EmptyState';
import { CardRowSkeleton } from '../components/Skeleton';
import { FadeIn } from '../components/Anim';
import { notificationTarget, notificationMeta, targetLabel } from '../utils/notifRoute';
import { clearBadge } from '../utils/pushNotifications';
import { fmtDateTime } from '../utils/format';
import { plural } from '../utils/plural';

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
  const [loadError, setLoadError] = useState('');
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/notifications');
      const list = asList(d?.data);
      setNotifications(list);
      setLoadError(''); setFromCache(false);
      writeCache('notifications', list);
    } catch (e) {
      setLoadError(isNetworkError(e) ? NETWORK_MESSAGE : (e?.message || 'تعذّر تحميل الإشعارات'));
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    clearBadge(); // فتح الإشعارات = الرقم الأحمر على الأيقونة يروح
    (async () => {
      const cached = await readCache('notifications');
      if (cached) { setNotifications(asList(cached)); setFromCache(true); setLoading(false); }
      load();
    })();
  }, [load]);

  const markRead = async (id) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    try { await api.patch(`/notifications/${id}/read`); } catch {}
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    clearBadge();
    try { await api.patch('/notifications/read-all'); } catch {}
  };

  const onPress = (item) => {
    if (!item.is_read) markRead(item.id);
    const t = notificationTarget(parseData(item.data), item.type);
    if (t) navigation.navigate(t.name, t.params);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const renderItem = ({ item, index }) => {
    const data = parseData(item.data);
    const title = item.title_ar || item.title || 'إشعار';
    const body = item.body_ar || item.body || '';
    const target = notificationTarget(data, item.type);
    const meta = notificationMeta(item.type, target);
    const action = targetLabel(target);
    return (
      <FadeIn index={index} from={14}>
        <TouchableOpacity style={[styles.card, !item.is_read && styles.cardUnread]} onPress={() => onPress(item)} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel={`${item.is_read ? '' : 'غير مقروء، '}${title}${body ? `، ${body}` : ''}`}>
          <View style={[styles.iconBox, { backgroundColor: meta.color + '1F' }]}><Ionicons name={meta.icon} size={21} color={meta.color} /></View>
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            {!!body && <Text style={styles.body}>{body}</Text>}
            <View style={styles.metaRow}>
              <Text style={styles.time}>{item.created_at ? fmtDateTime(item.created_at, { month: 'short' }) : ''}</Text>
              {!!action && <View style={styles.openPill}><Text style={styles.openTxt}>{action}</Text><Ionicons name="chevron-back" size={12} color={COLORS.primary} /></View>}
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
        title="الإشعارات"
        subtitle={unreadCount > 0 ? `غير مقروءة: ${plural(unreadCount, 'notification')}` : undefined}
        rightIcon={unreadCount > 0 ? 'checkmark-done' : undefined}
        rightLabel="تحديد الكل كمقروء"
        onRight={markAllRead}
      />

      {loading ? (
        <View style={{ padding: 16 }}>{[0, 1, 2, 3, 4].map(i => <CardRowSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(i, idx) => String(i.id ?? idx)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.card} />}
          ListHeaderComponent={!!loadError && fromCache && notifications.length > 0 ? (
            <View style={styles.stale}><Ionicons name="cloud-offline-outline" size={15} color={COLORS.text} /><Text style={styles.staleTxt}>آخر نسخة محفوظة — {loadError}</Text></View>
          ) : null}
          ListEmptyComponent={loadError
            ? <EmptyState emoji="📡" tone="error" title="تعذّر تحميل الإشعارات" subtitle={loadError} ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); load(); }} />
            : <EmptyState emoji="🔔" title="لا إشعارات جديدة" subtitle="رح نبلغك هون بكل تحديث على طلباتك" />}
        />
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  card: { flexDirection: 'row-reverse', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  cardUnread: { backgroundColor: C.tint, borderWidth: 1, borderColor: C.tintBorder },
  iconBox: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  body: { fontSize: 13, color: C.gray, marginTop: 3, lineHeight: 19, textAlign: 'right' },
  metaRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  time: { fontSize: 11, color: C.gray },
  openTxt: { fontSize: 11.5, color: C.primary, fontWeight: '800' },
  openPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: C.tintBorder },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, alignSelf: 'flex-start', marginTop: 4 },
  stale: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 14, padding: 10, backgroundColor: C.warnBg, borderWidth: 1, borderColor: C.warnBorder },
  staleTxt: { flex: 1, fontSize: 12.5, fontWeight: '700', color: C.text, textAlign: 'right' },
});
