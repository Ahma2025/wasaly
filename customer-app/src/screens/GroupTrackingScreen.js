import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Animated, Image, TextInput, Alert, BackHandler, RefreshControl } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../utils/api';
import { Skeleton } from '../components/Skeleton';
import GradientHeader from '../components/GradientHeader';
import { FadeIn, PopIn, Press, Pulse, Ripple, GradientButton } from '../components/Anim';
import { BottomSheet, Chip, ProgressRing } from '../components/UI';
import EmptyState from '../components/EmptyState';
import { haptic, isReducedMotion, EASE_OUT, SPRING_POP, stagger } from '../utils/motion';
import { useTheme } from '../context/ThemeContext';
import { SOCKET_URL, SUPPORT_PHONE } from '../config';
import { leafletPage, TILE_URL } from '../utils/leaflet';
import { statusLabel, statusMeta, softBg, groupStatusLabel } from '../utils/status';
import { CheckoutSuccess } from './OrderTrackingScreen';

/*
  تتبّع الطلب المجمّع (عدة مطاعم + سائق واحد) — GET /api/orders/groups/:id
  أحداث السوكيت: group_status / group_updated / group_cancelled / order_status / driver_assigned / driver:location
*/

const money = (v) => `${(parseFloat(v) || 0).toFixed(2)}₪`;
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const GROUP_STEPS = [
  { key: 'pending',    label: 'بانتظار المطاعم',      icon: 'time-outline',             desc: 'طلبك وصل لكل المطاعم وبانتظار موافقتهم' },
  { key: 'confirmed',  label: 'نبحث عن سائق',         icon: 'search-outline',           desc: 'كل المطاعم قبلت — عم ندوّر على سائق يجمع طلبك' },
  { key: 'picking_up', label: 'السائق يجمع الطلبات',  icon: 'git-network-outline',      desc: 'السائق بيمرّ على المطاعم وبيستلم طلباتك' },
  { key: 'on_the_way', label: 'في الطريق',            icon: 'bicycle-outline',          desc: 'استلم كل الطلبات وهو بالطريق إليك' },
  { key: 'delivered',  label: 'تم التوصيل',           icon: 'gift-outline',             desc: 'بالهنا والعافية! 🎉' },
];

// مراحل كل مطعم (محطة)
const STOP_STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'picked'];
const STOP_LABELS = { pending: 'بانتظار المطعم', confirmed: 'قبل طلبك', preparing: 'قيد التحضير', ready: 'جاهز للاستلام', picked: 'السائق استلمه' };

const HERO = {
  pending:    { g: 'gold',    icon: 'hourglass' },
  confirmed:  { g: 'info',    icon: 'search' },
  picking_up: { g: 'violet',  icon: 'git-network' },
  on_the_way: { g: 'sunset',  icon: 'bicycle' },
  delivered:  { g: 'success', icon: 'gift' },
  cancelled:  { g: 'danger',  icon: 'close-circle' },
};

const CANCEL_REASONS = ['تأخر الطلب', 'غيّرت رأيي', 'طلبت بالغلط', 'بدي أعدّل الطلب'];
const BLOCKING_CHILD = ['preparing', 'ready', 'on_the_way', 'delivered'];

const isPicked = (o) => !!o?.picked_up_at || o?.picked === true || ['on_the_way', 'delivered'].includes(o?.status);
const stopStepIdx = (o) => (isPicked(o) ? 4 : Math.max(0, STOP_STEPS.indexOf(o?.status)));

function buildGroupMapHTML({ stops, destLat, destLng, driverLat, driverLng, dark }) {
  const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) && x !== 0 ? x : null; };
  const pts = (stops || []).map(s => ({ lat: n(s.lat), lng: n(s.lng), seq: s.seq, picked: !!s.picked, name: String(s.name || '').replace(/[<>'"\\]/g, '') }))
    .filter(s => s.lat && s.lng);
  const dLat = n(destLat), dLng = n(destLng), vLat = n(driverLat), vLng = n(driverLng);
  const cLat = vLat || pts[0]?.lat || dLat || 31.9;
  const cLng = vLng || pts[0]?.lng || dLng || 35.2;
  return leafletPage({
    dark,
    style: `.leaflet-control-zoom a{font-size:18px!important;width:34px!important;height:34px!important;line-height:34px!important}
  .pop .leaflet-popup-content{font-family:system-ui;font-size:13px;font-weight:700;direction:rtl;text-align:right}
  @keyframes pulseRing{0%{transform:scale(.55);opacity:.75}80%,100%{transform:scale(2.3);opacity:0}}
  .drv-wrap{position:relative;width:44px;height:44px}
  .drv-ring{position:absolute;inset:0;border-radius:50%;background:rgba(255,107,0,.45);animation:pulseRing 1.6s ease-out infinite}
  .drv-badge{position:absolute;inset:0;background:#FF6B00;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.35)}
  .stop{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font:900 15px system-ui;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.3)}`,
    script: `
var map=L.map('map',{center:[${cLat},${cLng}],zoom:14,zoomControl:true});
L.tileLayer('${TILE_URL}',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
map.zoomControl.setPosition('topleft');
function mkIcon(emoji,size,bg){size=size||32;return L.divIcon({html:'<div style="width:'+size+'px;height:'+size+'px;background:'+(bg||'#fff')+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+(size*0.55)+'px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.35)">'+emoji+'</div>',iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-(size/2)],className:''});}
function mkStop(seq,picked){return L.divIcon({html:'<div class="stop" style="background:'+(picked?'#1DB954':'#FF6B00')+'">'+(picked?'✓':seq)+'</div>',iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-17],className:''});}
function mkDriverIcon(){return L.divIcon({html:'<div class="drv-wrap"><div class="drv-ring"></div><div class="drv-badge">🛵</div></div>',iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-22],className:''});}
var pts=[],route=[],driverMarker=null,curPos=null,animFrame=null,startPos=null,endPos=null,animStart=0,ANIM_MS=5000,lastMoveAt=0,followDriver=false;
var STOPS=${JSON.stringify(pts)};
STOPS.forEach(function(s){L.marker([s.lat,s.lng],{icon:mkStop(s.seq,s.picked)}).addTo(map).bindPopup(s.name||'مطعم',{className:'pop'});pts.push([s.lat,s.lng]);route.push([s.lat,s.lng]);});
${dLat && dLng ? `L.marker([${dLat},${dLng}],{icon:mkIcon('📍',40,'#FF3B30')}).addTo(map).bindPopup('موقع التوصيل',{className:'pop'});pts.push([${dLat},${dLng}]);route.push([${dLat},${dLng}]);` : ''}
${vLat && vLng ? `driverMarker=L.marker([${vLat},${vLng}],{icon:mkDriverIcon()}).addTo(map).bindPopup('السائق',{className:'pop'});curPos=[${vLat},${vLng}];pts.push([${vLat},${vLng}]);` : ''}
if(route.length>1){L.polyline(route,{color:'#FF6B00',weight:4,dashArray:'10 6',opacity:0.7}).addTo(map);}
if(pts.length===1){map.setView(pts[0],15);}else if(pts.length>1){map.fitBounds(pts,{padding:[50,50]});}
map.on('dragstart',function(){followDriver=false;});
function animStep(){var t=(Date.now()-animStart)/ANIM_MS;if(t>1)t=1;var lat=startPos[0]+(endPos[0]-startPos[0])*t;var lng=startPos[1]+(endPos[1]-startPos[1])*t;curPos=[lat,lng];driverMarker.setLatLng(curPos);if(followDriver)map.panTo(curPos,{animate:false});if(t<1){animFrame=requestAnimationFrame(animStep);}}
function moveDriver(lat,lng){if(isNaN(lat)||isNaN(lng))return;var ll=[lat,lng];
  if(!driverMarker){driverMarker=L.marker(ll,{icon:mkDriverIcon()}).addTo(map).bindPopup('السائق',{className:'pop'});curPos=ll;lastMoveAt=Date.now();pts.push(ll);if(pts.length>1)map.fitBounds(pts,{padding:[50,50]});return;}
  var nowT=Date.now();var interval=lastMoveAt?(nowT-lastMoveAt):5000;lastMoveAt=nowT;ANIM_MS=Math.max(1500,Math.min(interval*1.2,14000));
  startPos=curPos?[curPos[0],curPos[1]]:[lat,lng];endPos=[lat,lng];animStart=Date.now();if(animFrame)cancelAnimationFrame(animFrame);animStep();}
function handleMsg(raw){try{var d=JSON.parse(raw);if(d.type==='driver_location'){moveDriver(parseFloat(d.lat),parseFloat(d.lng));}else if(d.type==='recenter'){if(d.follow&&curPos){followDriver=true;map.setView(curPos,16,{animate:true});}else{followDriver=false;var all=pts.slice();if(curPos)all.push(curPos);if(all.length>1)map.fitBounds(all,{padding:[50,50]});else if(all.length)map.setView(all[0],15);}}}catch(err){}}
window.addEventListener('message',function(e){handleMsg(e.data);});
document.addEventListener('message',function(e){handleMsg(e.data);});
`,
  });
}

export default function GroupTrackingScreen() {
  const route = useRoute();
  const id = route.params?.groupId;
  const fromCheckout = !!route.params?.fromCheckout;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: COLORS, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);

  const [group, setGroup] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null); // آخر تحديث group_updated (اعتذار مطعم + استرجاع)
  const [expanded, setExpanded] = useState({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [celebrate, setCelebrate] = useState(fromCheckout);
  const [followDriver, setFollowDriver] = useState(false);
  const webViewRef = useRef(null);
  const childIds = useRef(new Set());
  const soonTimer = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const goBack = useCallback(() => {
    if (!fromCheckout && navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main', { screen: 'طلباتي' });
    return true;
  }, [fromCheckout, navigation]);

  // زر الرجوع بأندرويد بعد الطلب: لطلباتي (مش للسلة الفاضية)
  useFocusEffect(useCallback(() => {
    if (!fromCheckout) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [fromCheckout, goBack]));

  useEffect(() => {
    if (isReducedMotion()) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const fetchGroup = useCallback(async () => {
    if (id == null) { setLoading(false); setLoadError('الطلب غير موجود'); return; }
    try {
      const r = await api.get(`/orders/groups/${id}`);
      const g = r?.data || null;
      if (!g || typeof g !== 'object') throw { message: 'تعذّر تحميل الطلب' };
      setGroup(g);
      setLoadError('');
      childIds.current = new Set((g.orders || []).map(o => String(o.id ?? o.order_id)));
      if (g.driver_lat && g.driver_lng) setDriverLoc(prev => prev || { lat: parseFloat(g.driver_lat), lng: parseFloat(g.driver_lng) });
    } catch (e) {
      setLoadError(e?.message === 'Network error' ? 'تعذّر الاتصال — تأكد من الإنترنت' : (e?.message || 'تعذّر تحميل الطلب'));
    } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  const fetchSoon = useCallback(() => {
    clearTimeout(soonTimer.current);
    soonTimer.current = setTimeout(fetchGroup, 600);
  }, [fetchGroup]);
  useEffect(() => () => clearTimeout(soonTimer.current), []);

  // تحديث عند كل رجوع للشاشة + كل 30 ثانية احتياطاً
  useFocusEffect(useCallback(() => {
    fetchGroup();
    const interval = setInterval(fetchGroup, 30000);
    return () => clearInterval(interval);
  }, [fetchGroup]));

  useEffect(() => {
    let socket;
    let alive = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token || !alive) return;
        socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
        const mine = (p) => sameId(p?.group_id, id);
        const myChild = (oid) => oid != null && childIds.current.has(String(oid));
        socket.on('group_status', (p) => {
          if (!mine(p)) return;
          setGroup(prev => (prev ? { ...prev, status: p.status || prev.status, status_label: p.status_label || prev.status_label,
            picked_count: p.picked_count ?? prev.picked_count, stops_total: p.stops_total ?? prev.stops_total } : prev));
          if (p.status === 'delivered') haptic.success();
          fetchSoon();
        });
        socket.on('group_updated', (p) => {
          if (!mine(p)) return;
          haptic.warning();
          setNotice({
            name: p.restaurant_name, refundedWallet: num(p.refunded_wallet), refundedPoints: num(p.refunded_points),
            couponDropped: !!p.coupon_dropped, total: p.totals?.total,
          });
          if (p.totals) setGroup(prev => (prev ? { ...prev, ...p.totals, stops_total: p.stops_total ?? prev.stops_total } : prev));
          fetchSoon();
        });
        socket.on('group_cancelled', (p) => {
          if (!mine(p)) return;
          setGroup(prev => (prev ? { ...prev, status: 'cancelled', cancelled_by: p.by || prev.cancelled_by, cancel_reason: p.reason || prev.cancel_reason } : prev));
          fetchSoon();
        });
        socket.on('order_status', ({ order_id, status }) => {
          if (!myChild(order_id)) return;
          const patch = (list) => (list || []).map(o => (sameId(o.id ?? o.order_id, order_id) ? { ...o, status } : o));
          setGroup(prev => (prev ? { ...prev, orders: patch(prev.orders), stops: patch(prev.stops) } : prev));
          fetchSoon();
        });
        socket.on('order_cancelled', (p) => { if (mine(p) || myChild(p?.order_id)) fetchSoon(); });
        socket.on('driver_assigned', (p) => { if (mine(p) || myChild(p?.order_id)) { haptic.success(); fetchSoon(); } });
        socket.on('driver:location', ({ lat, lng, group_id, orderId, order_id }) => {
          if (sameId(group_id, id) || myChild(orderId ?? order_id)) setDriverLoc({ lat: parseFloat(lat), lng: parseFloat(lng) });
        });
      } catch {}
    })();
    return () => { alive = false; socket?.disconnect(); };
  }, [id, fetchSoon]);

  useEffect(() => {
    if (!driverLoc || !webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'driver_location', lat: driverLoc.lat, lng: driverLoc.lng }));
  }, [driverLoc]);

  const status = group?.status;
  const isCancelled = status === 'cancelled';
  const isDelivered = status === 'delivered';
  const orders = useMemo(() => (Array.isArray(group?.orders) ? group.orders : []), [group?.orders]);
  const activeOrders = orders.filter(o => o.status !== 'cancelled');
  const cancelledOrders = isCancelled ? [] : orders.filter(o => o.status === 'cancelled');
  const stopsSorted = useMemo(() => [...orders].sort((a, b) => {
    const ca = a.status === 'cancelled' ? 1 : 0, cb = b.status === 'cancelled' ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return num(a.stop_sequence, 99) - num(b.stop_sequence, 99);
  }), [orders]);

  // الخريطة تُبنى مرة واحدة لكل تغيير بالمحطات؛ حركة السائق عبر postMessage
  const showMap = !!group && !isCancelled && status !== 'pending';
  const mapStopsKey = activeOrders.map(o => `${o.id}:${o.stop_sequence}:${isPicked(o) ? 1 : 0}`).join('|');
  const mapHtml = useMemo(() => (showMap ? buildGroupMapHTML({
    stops: activeOrders.map(o => ({ lat: o.restaurant_lat, lng: o.restaurant_lng, seq: o.stop_sequence, picked: isPicked(o), name: o.restaurant_name })),
    destLat: group.delivery_lat ?? group.dropoff?.lat, destLng: group.delivery_lng ?? group.dropoff?.lng,
    driverLat: group.driver_lat, driverLng: group.driver_lng, dark: isDark,
  }) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [showMap, group?.id, mapStopsKey, group?.delivery_lat, group?.delivery_lng, isDark]);

  const cancelGroup = async () => {
    setCancelling(true);
    try {
      const r = await api.patch(`/orders/groups/${id}/cancel`, { reason: cancelReason.trim() || undefined });
      const d = r?.data || {};
      setCancelOpen(false);
      setGroup(prev => (prev ? { ...prev, status: 'cancelled', cancelled_by: 'customer' } : prev));
      fetchGroup();
      const parts = [];
      if (num(d.refunded_wallet) > 0) parts.push(`${money(d.refunded_wallet)} رجعت لمحفظتك`);
      if (num(d.refunded_points) > 0) parts.push(`${parseInt(d.refunded_points, 10)} نقطة رجعت لحسابك`);
      Alert.alert('تم إلغاء الطلب', `تم إلغاء طلبك المجمّع من كل المطاعم.${parts.length ? '\n' + parts.join(' · ') : ''}`);
    } catch (e) {
      Alert.alert('تعذّر الإلغاء', e?.message || 'حاول مرة أخرى');
      fetchGroup();
    } finally { setCancelling(false); }
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <GradientHeader title="تتبع الطلب المجمّع" onBack={goBack} />
      <View style={{ padding: 16, gap: 14 }}>
        <Skeleton w={'100%'} h={150} r={26} />
        <Skeleton w={'100%'} h={220} r={24} />
        {[0, 1, 2].map(i => (
          <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            <Skeleton w={48} h={48} r={15} />
            <View style={{ flex: 1, gap: 6, alignItems: 'flex-end' }}><Skeleton w={'50%'} h={13} /><Skeleton w={'80%'} h={8} /></View>
          </View>
        ))}
      </View>
    </View>
  );

  if (!group) return (
    <View style={styles.container}>
      <GradientHeader title="تتبع الطلب المجمّع" onBack={goBack} />
      <EmptyState emoji="😕" title="تعذّر فتح الطلب" subtitle={loadError || 'لم يُعثر على الطلب'} ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); fetchGroup(); }} />
    </View>
  );

  const stepIdx = GROUP_STEPS.findIndex(s => s.key === status);
  const currentStep = stepIdx >= 0 ? GROUP_STEPS[stepIdx] : null;
  const stopsTotal = num(group.stops_total, activeOrders.length) || activeOrders.length;
  const pickedCount = num(group.picked_count, activeOrders.filter(isPicked).length);
  const acceptedCount = activeOrders.filter(o => o.status !== 'pending').length;
  const canCancel = ['pending', 'confirmed'].includes(status) && !activeOrders.some(o => BLOCKING_CHILD.includes(o.status));
  const hero = isCancelled ? HERO.cancelled : (HERO[status] || HERO.pending);
  const heroColors = COLORS.gradients[hero.g] || COLORS.gradients.sunset;
  const allDeclined = isCancelled && group.cancelled_by === 'restaurant';

  const heroDesc = isCancelled
    ? (allDeclined ? 'اعتذرت كل المطاعم عن طلبك — تم استرجاع ما دفعته من المحفظة والنقاط'
      : group.cancel_reason ? `السبب: ${group.cancel_reason}` : 'تم استرجاع أي مبلغ من المحفظة أو نقاط مستخدمة')
    : status === 'pending' ? `وافق ${acceptedCount} من ${activeOrders.length} مطاعم — بنستنى الباقي`
      : status === 'picking_up' ? `${group.driver_name || 'السائق'} استلم من ${pickedCount} من ${stopsTotal} مطاعم`
        : currentStep?.desc || 'نحدّث حالة طلبك — اسحب للتحديث';
  const ringProgress = status === 'pending' ? (activeOrders.length ? acceptedCount / activeOrders.length : 0)
    : status === 'picking_up' ? (stopsTotal ? pickedCount / stopsTotal : 0) : null;

  const discount = num(group.discount);
  const recenter = () => {
    const next = !followDriver && !!driverLoc;
    setFollowDriver(next);
    webViewRef.current?.postMessage(JSON.stringify({ type: 'recenter', follow: next }));
  };

  return (
    <View style={styles.container}>
      <GradientHeader title="تتبع الطلب المجمّع" subtitle={`#${group.group_number || id} · ${stopsTotal} مطاعم`} onBack={goBack}
        right={<TouchableOpacity onPress={() => navigation.navigate('SupportChat')} accessibilityLabel="الدعم" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="headset-outline" size={20} color="#FFF" /></TouchableOpacity>} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGroup(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.card} />}>

        {/* بطاقة الحالة */}
        <PopIn key={isCancelled ? 'cancelled' : status} from={0.94}>
          <LinearGradient colors={heroColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { shadowColor: heroColors[1] }]}>
            <LinearGradient colors={COLORS.gradients.sheen} style={styles.heroSheen} pointerEvents="none" />
            <View style={styles.heroOrb} />
            <View style={styles.heroRow}>
              <View style={styles.heroIconWrap}>
                {!isCancelled && !isDelivered && <Ripple size={64} color="#FFFFFF" />}
                <Animated.View style={[styles.heroIcon, { transform: [{ scale: pulseAnim }] }]}>
                  <Ionicons name={hero.icon} size={30} color="#FFF" />
                </Animated.View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>{isCancelled ? 'تم إلغاء الطلب' : groupStatusLabel(status, group)}</Text>
                <Text style={styles.heroDesc}>{heroDesc}</Text>
              </View>
              {ringProgress != null && !isCancelled && (
                <ProgressRing progress={ringProgress} size={68} stroke={5}>
                  <View style={{ position: 'absolute', alignItems: 'center' }}>
                    <Text style={styles.ringNum}>{status === 'pending' ? acceptedCount : pickedCount}/{status === 'pending' ? activeOrders.length : stopsTotal}</Text>
                    <Text style={styles.ringLbl}>{status === 'pending' ? 'وافقوا' : 'استلم'}</Text>
                  </View>
                </ProgressRing>
              )}
            </View>
            {!isCancelled && !isDelivered && (
              <View style={styles.oneDriver}>
                <Ionicons name="bicycle" size={14} color="#FFF" />
                <Text style={styles.oneDriverTxt}>سائق واحد بيستلم من كل المطاعم وبيوصلك مرة وحدة</Text>
              </View>
            )}
          </LinearGradient>
        </PopIn>

        {/* اعتذار مطعم (إلغاء جزئي) */}
        {cancelledOrders.length > 0 && (
          <FadeIn style={[styles.noticeCard, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]}>
            <View style={[styles.noticeIcon, { backgroundColor: COLORS.warnFill }]}><Ionicons name="information" size={18} color="#FFF" /></View>
            <View style={{ flex: 1, gap: 3 }}>
              {cancelledOrders.map(o => (
                <Text key={String(o.id)} style={styles.noticeTitle}>مطعم {o.restaurant_name || ''} اعتذر، كمّلنا طلبك من باقي المطاعم</Text>
              ))}
              <Text style={styles.noticeSub}>
                {notice && (notice.refundedWallet > 0 || notice.refundedPoints > 0)
                  ? `رجعنالك ${[notice.refundedWallet > 0 ? `${money(notice.refundedWallet)} للمحفظة` : '', notice.refundedPoints > 0 ? `${parseInt(notice.refundedPoints, 10)} نقطة` : ''].filter(Boolean).join(' و ')} — والحساب الجديد تحت`
                  : 'عدّلنا حسابك تلقائياً — ما بتدفع إلا على اللي رح يوصلك'}
                {notice?.couponDropped ? ' · الكوبون ما عاد ينطبق على المبلغ الجديد' : ''}
              </Text>
            </View>
          </FadeIn>
        )}

        {/* الخريطة */}
        {showMap && mapHtml && !mapFailed ? (
          <FadeIn delay={60} style={styles.mapWrap}>
            <WebView
              ref={webViewRef}
              source={{ html: mapHtml }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              mixedContentMode="always"
              nestedScrollEnabled
              onMessage={(e) => {
                try {
                  const d = JSON.parse(e.nativeEvent.data);
                  if (d.type === 'map_ready' && driverLoc) webViewRef.current?.postMessage(JSON.stringify({ type: 'driver_location', lat: driverLoc.lat, lng: driverLoc.lng }));
                } catch {}
              }}
              onError={() => setMapFailed(true)}
            />
            {['picking_up', 'on_the_way'].includes(status) && (
              <View style={styles.liveBadge}>
                <Pulse to={1.5}><View style={styles.liveDot} /></Pulse>
                <Text style={styles.liveText}>مباشر</Text>
              </View>
            )}
            <TouchableOpacity style={styles.recenterBtn} onPress={recenter} accessibilityLabel={followDriver ? 'عرض كل المحطات' : 'تتبّع السائق'}>
              <Ionicons name={followDriver ? 'scan-outline' : 'locate'} size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </FadeIn>
        ) : mapFailed ? (
          <View style={styles.mapFail}>
            <Ionicons name="map-outline" size={18} color={COLORS.gray} />
            <Text style={styles.mapFailTxt}>تعذّر تحميل الخريطة — التتبع مستمر</Text>
          </View>
        ) : null}

        {/* السائق */}
        {!!group.driver_name && !isCancelled && (
          <FadeIn delay={80} style={styles.driverCard}>
            <View>
              <LinearGradient colors={COLORS.gradients.sunset} style={styles.driverAvatar}>
                <Text style={styles.driverInitial}>{String(group.driver_name).trim().charAt(0) || '؟'}</Text>
              </LinearGradient>
              <View style={[styles.driverBadge, { borderColor: COLORS.card }]}><Ionicons name="bicycle" size={11} color="#FFF" /></View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{group.driver_name}</Text>
              <Text style={styles.driverSub}>{[group.vehicle_type, group.vehicle_plate].filter(Boolean).join(' · ') || 'سائق وصلّي'}</Text>
              {driverLoc && ['picking_up', 'on_the_way'].includes(status) && (
                <View style={styles.driverLiveRow}><View style={styles.driverLiveDot} /><Text style={styles.driverLive}>يتحرك الآن</Text></View>
              )}
            </View>
            {!!group.driver_phone && (
              <Press style={styles.callBtn} scaleTo={0.9} onPress={() => Linking.openURL(`tel:${group.driver_phone}`).catch(() => {})} accessibilityRole="button" accessibilityLabel="اتصل بالسائق">
                <Ionicons name="call" size={20} color="#FFF" />
              </Press>
            )}
          </FadeIn>
        )}

        {/* المحطات: حالة كل مطعم */}
        <FadeIn delay={100} style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardIcon}><Ionicons name="storefront" size={15} color={COLORS.primary} /></View>
            <Text style={[styles.cardTitle, { flex: 1 }]}>المطاعم</Text>
            {!isCancelled && <View style={styles.countPill}><Text style={styles.countPillTxt}>{pickedCount}/{stopsTotal} استلم</Text></View>}
          </View>
          {stopsSorted.map((o, i) => (
            <StopRow key={String(o.id ?? o.order_id)} order={o} index={i} last={i === stopsSorted.length - 1} C={COLORS} styles={styles}
              groupCancelled={isCancelled} open={!!expanded[o.id]} onToggle={() => setExpanded(p => ({ ...p, [o.id]: !p[o.id] }))} />
          ))}
        </FadeIn>

        {/* مراحل الطلب المجمّع */}
        {!isCancelled && (
          <FadeIn delay={120} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIcon}><Ionicons name="git-commit" size={15} color={COLORS.primary} /></View>
              <Text style={styles.cardTitle}>مراحل الطلب</Text>
            </View>
            {GROUP_STEPS.map((step, idx) => (
              <TimelineStep key={step.key} step={step} idx={idx} effIdx={stepIdx} last={idx === GROUP_STEPS.length - 1}
                isDelivered={isDelivered} C={COLORS} styles={styles} />
            ))}
          </FadeIn>
        )}

        {/* الحساب */}
        <FadeIn delay={140} style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardIcon}><Ionicons name="calculator" size={15} color={COLORS.primary} /></View>
            <Text style={styles.cardTitle}>الحساب</Text>
          </View>
          <SumRow styles={styles} C={COLORS} label="المجموع الفرعي" value={money(group.subtotal)} />
          <SumRow styles={styles} C={COLORS} label="رسوم التوصيل" value={group.free_delivery || num(group.delivery_fee) === 0 ? 'مجاني' : money(group.delivery_fee)} green={group.free_delivery || num(group.delivery_fee) === 0} />
          {num(group.extra_stops_fee) > 0 && (
            <SumRow styles={styles} C={COLORS} label={`رسوم توقف إضافي${num(group.extra_stop_unit) > 0 ? ` (${Math.round(num(group.extra_stops_fee) / num(group.extra_stop_unit))} × ${money(group.extra_stop_unit)})` : ''}`} value={money(group.extra_stops_fee)} />
          )}
          {num(group.first_order_discount) > 0 && <SumRow styles={styles} C={COLORS} label="🎁 خصم أول طلب" value={`-${money(group.first_order_discount)}`} green />}
          {num(group.coupon_discount) > 0 && <SumRow styles={styles} C={COLORS} label={`خصم الكوبون${group.coupon_code ? ` (${group.coupon_code})` : ''}`} value={`-${money(group.coupon_discount)}`} green />}
          {discount > 0 && num(group.first_order_discount) === 0 && num(group.coupon_discount) === 0 && <SumRow styles={styles} C={COLORS} label="الخصم" value={`-${money(discount)}`} green />}
          {num(group.points_value) > 0 && <SumRow styles={styles} C={COLORS} label="خصم النقاط" value={`-${money(group.points_value)}`} green />}
          {num(group.tip) > 0 && <SumRow styles={styles} C={COLORS} label="بقشيش السائق" value={money(group.tip)} />}
          {num(group.wallet_used) > 0 && <SumRow styles={styles} C={COLORS} label="من المحفظة" value={`-${money(group.wallet_used)}`} green />}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>الإجمالي</Text>
            <Text style={styles.totalVal}>{money(group.total)}</Text>
          </View>
          {!isCancelled && (
            <View style={styles.cashBox}>
              <Ionicons name="cash-outline" size={15} color={COLORS.primary} />
              <Text style={styles.cashTxt}>
                {group.payment_status === 'paid' ? 'تم الدفع ✅'
                  : num(group.cash_to_collect, num(group.total)) > 0 ? `بتدفع للسائق كاش ${money(group.cash_to_collect ?? group.total)} مرة وحدة`
                    : 'مدفوع بالكامل من محفظتك 💛'}
              </Text>
            </View>
          )}
          {!!group.delivery_address && (
            <View style={styles.addrRow}>
              <Ionicons name="location-outline" size={15} color={COLORS.red} />
              <Text style={styles.addrTxt} numberOfLines={2}>{group.delivery_address}</Text>
            </View>
          )}
        </FadeIn>

        {canCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { haptic.warning(); setCancelOpen(true); }} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={19} color={COLORS.red} />
            <Text style={styles.cancelBtnTxt}>إلغاء الطلب كاملاً</Text>
          </TouchableOpacity>
        )}
        {!canCancel && ['pending', 'confirmed'].includes(status) && (
          <Text style={styles.cantCancel}>ما بنقدر نلغي الطلب لأن أحد المطاعم بلّش يحضّره</Text>
        )}

        {isDelivered && activeOrders.length > 0 && (
          <FadeIn style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIcon}><Ionicons name="star" size={15} color={COLORS.primary} /></View>
              <Text style={styles.cardTitle}>قيّم تجربتك</Text>
            </View>
            {activeOrders.map(o => (
              <View key={String(o.id)} style={styles.rateRow}>
                <Text style={styles.rateName} numberOfLines={1}>{o.restaurant_name}</Text>
                <TouchableOpacity style={styles.rateBtn} accessibilityRole="button"
                  onPress={() => navigation.navigate('Rating', { orderId: o.id ?? o.order_id, restaurantName: o.restaurant_name, driverName: group.driver_name })}>
                  <Ionicons name="star" size={13} color="#FFF" />
                  <Text style={styles.rateBtnTxt}>قيّم</Text>
                </TouchableOpacity>
              </View>
            ))}
          </FadeIn>
        )}

        <TouchableOpacity style={styles.helpRow} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {})} accessibilityRole="button">
          <Ionicons name="call-outline" size={15} color={COLORS.gray} />
          <Text style={styles.helpTxt}>محتاج مساعدة؟ اتصل بالدعم</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* شيت تأكيد الإلغاء */}
      <BottomSheet visible={cancelOpen} onClose={() => !cancelling && setCancelOpen(false)}>
        <View style={{ paddingHorizontal: 20, alignItems: 'center' }}>
          <View style={styles.modalIcon}><Ionicons name="alert-circle" size={36} color={COLORS.red} /></View>
          <Text style={styles.modalTitle}>إلغاء الطلب المجمّع؟</Text>
          <Text style={styles.modalSub}>رح ينلغي طلبك من كل المطاعم ({activeOrders.length}) وبيرجعلك أي مبلغ من المحفظة أو نقاط مستخدمة.</Text>
          <View style={styles.reasonsWrap}>
            {CANCEL_REASONS.map(r => (
              <Chip key={r} size="sm" label={r} selected={cancelReason === r} onPress={() => setCancelReason(cancelReason === r ? '' : r)} />
            ))}
          </View>
          <TextInput style={styles.reasonInput} placeholder="سبب آخر (اختياري)" placeholderTextColor={COLORS.faint}
            value={CANCEL_REASONS.includes(cancelReason) ? '' : cancelReason} onChangeText={setCancelReason} textAlign="right" maxLength={150} />
          <View style={styles.modalBtns}>
            <GradientButton title="نعم، ألغِ الطلب كاملاً" onPress={cancelGroup} loading={cancelling} colors={['#FF6B5E', '#F04438', '#C8281C']} height={52} />
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.inputBg }]} onPress={() => setCancelOpen(false)} disabled={cancelling} accessibilityRole="button">
              <Text style={[styles.modalBtnTxt, { color: COLORS.text }]}>تراجع</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {celebrate && <CheckoutSuccess onDone={() => setCelebrate(false)} C={COLORS} orderNo={group.group_number || id} />}
    </View>
  );
}

/* محطة (مطعم): رقم الترتيب + لوجو + حالة + شريط مراحل مصغّر + أصناف عند الضغط */
function StopRow({ order, index, last, C, styles, groupCancelled, open, onToggle }) {
  const cancelled = order.status === 'cancelled';
  const picked = isPicked(order);
  const idx = stopStepIdx(order);
  const label = cancelled ? 'اعتذر المطعم' : picked ? STOP_LABELS.picked : (STOP_LABELS[order.status] || statusLabel(order.status));
  const meta = cancelled ? statusMeta('cancelled') : picked ? { color: C.green, icon: 'checkmark-done' } : statusMeta(order.status);
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <FadeIn delay={stagger(index, 50)} from={10}>
      <TouchableOpacity activeOpacity={0.85} onPress={onToggle} accessibilityRole="button"
        accessibilityLabel={`${order.restaurant_name}، ${label}، اضغط لعرض الأصناف`}
        style={[styles.stopRow, !last && styles.stopRowBorder, (cancelled || groupCancelled) && { opacity: 0.6 }]}>
        <View style={styles.stopHead}>
          <View style={styles.stopLogoWrap}>
            {order.restaurant_logo
              ? <Image source={{ uri: order.restaurant_logo }} style={styles.stopLogo} />
              : <View style={[styles.stopLogo, { alignItems: 'center', justifyContent: 'center', backgroundColor: C.tint }]}><Ionicons name="storefront" size={18} color={C.primary} /></View>}
            {!cancelled && order.stop_sequence != null && (
              <View style={[styles.stopSeq, { borderColor: C.card, backgroundColor: picked ? C.green : C.primary }]}>
                {picked ? <Ionicons name="checkmark" size={11} color="#FFF" /> : <Text style={styles.stopSeqTxt}>{order.stop_sequence}</Text>}
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stopName, cancelled && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{order.restaurant_name || 'مطعم'}</Text>
            <Text style={styles.stopSub} numberOfLines={1}>
              {order.order_number ? `#${order.order_number}` : ''}{num(order.subtotal) > 0 ? ` · ${money(order.subtotal)}` : ''}
            </Text>
          </View>
          <View style={[styles.stopBadge, { backgroundColor: softBg(meta.color) }]}>
            <Ionicons name={meta.icon} size={12} color={meta.color} />
            <Text style={[styles.stopBadgeTxt, { color: meta.color }]}>{label}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.faint} />
        </View>
        {!cancelled && !groupCancelled && (
          <View style={styles.stopBars}>
            {STOP_STEPS.map((s, i) => (
              <View key={s} style={[styles.stopBar, { backgroundColor: i <= idx ? (picked ? C.green : C.primary) : C.border }]} />
            ))}
          </View>
        )}
        {cancelled && !!order.cancel_reason && <Text style={styles.stopReason}>السبب: {order.cancel_reason}</Text>}
        {open && items.length > 0 && (
          <View style={styles.stopItems}>
            {items.map((it, i) => {
              let opts = it.options;
              if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = []; } }
              return (
                <View key={String(it.id ?? i)} style={styles.orderItem}>
                  <View style={styles.qtyBadge}><Text style={styles.qtyBadgeTxt}>{it.quantity}×</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderItemName}>{it.name_ar || it.name}</Text>
                    {Array.isArray(opts) && opts.length > 0 && <Text style={styles.orderItemOpts}>{opts.map(o => o?.name).filter(Boolean).join(' • ')}</Text>}
                  </View>
                  <Text style={styles.orderItemPrice}>{(num(it.subtotal) || num(it.price) * (it.quantity || 1)).toFixed(2)}₪</Text>
                </View>
              );
            })}
          </View>
        )}
      </TouchableOpacity>
    </FadeIn>
  );
}

/* خطوة بالخط الزمني (نفس أسلوب تتبّع الطلب العادي) */
function TimelineStep({ step, idx, effIdx, last, isDelivered, C, styles }) {
  const done = effIdx >= 0 && idx <= effIdx;
  const active = idx === effIdx;
  const lineDone = effIdx >= 0 && idx < effIdx;
  const fill = useRef(new Animated.Value(lineDone ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(done ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: lineDone ? 1 : 0, duration: isReducedMotion() ? 0 : 500, delay: idx * 80, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [lineDone]);
  useEffect(() => {
    Animated.spring(pop, { toValue: done ? 1 : 0, ...SPRING_POP, delay: idx * 80 }).start();
  }, [done]);
  const h = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const sc = pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const finalGreen = isDelivered && last;
  return (
    <View style={styles.stepRow}>
      <View style={{ alignItems: 'center', width: 34 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {active && !isDelivered && <Ripple size={34} color={C.primary} />}
          <Animated.View style={[styles.stepCircle, done && { backgroundColor: finalGreen ? C.green : C.primary }, { transform: [{ scale: sc }] }]}>
            <Ionicons name={done && !active ? 'checkmark' : step.icon} size={15} color={done ? '#FFF' : C.faint} />
          </Animated.View>
        </View>
        {!last && (
          <View style={styles.stepLine}>
            <Animated.View style={{ width: '100%', height: h, backgroundColor: C.primary, borderRadius: 2 }} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, paddingTop: 5 }}>
        <Text style={[styles.stepLabel, done && { color: C.text }, active && { color: C.primary, fontWeight: '900' }]}>{step.label}</Text>
        {active && !isDelivered && <Text style={styles.stepDesc}>{step.desc}</Text>}
      </View>
      {active && !isDelivered && <View style={styles.nowPill}><Text style={styles.nowTxt}>الآن</Text></View>}
    </View>
  );
}

function SumRow({ label, value, green, styles, C }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, green && { color: C.green }]}>{label}</Text>
      <Text style={[styles.summaryVal, green && { color: C.green }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  hero: { borderRadius: 26, padding: 18, overflow: 'hidden', elevation: 10, shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  heroSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 60 },
  heroOrb: { position: 'absolute', width: 160, height: 160, borderRadius: 80, bottom: -80, left: -40, backgroundColor: 'rgba(255,255,255,0.1)' },
  heroRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  heroIconWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  heroIcon: { width: 60, height: 60, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 21, fontWeight: '900', color: '#FFF', textAlign: 'right' },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.92)', textAlign: 'right', lineHeight: 20, marginTop: 3, fontWeight: '500' },
  ringNum: { color: '#FFF', fontSize: 17, fontWeight: '900', lineHeight: 21 },
  ringLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },
  oneDriver: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 14, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.14)', alignSelf: 'flex-end' },
  oneDriverTxt: { fontSize: 12, fontWeight: '800', color: '#FFF', textAlign: 'right', flexShrink: 1 },
  noticeCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, borderRadius: 20, padding: 14, borderWidth: 1 },
  noticeIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noticeTitle: { fontSize: 13.5, fontWeight: '900', color: C.text, textAlign: 'right', lineHeight: 20 },
  noticeSub: { fontSize: 12, color: C.sub, fontWeight: '500', textAlign: 'right', lineHeight: 18, marginTop: 2 },
  mapWrap: { height: 260, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg, ...C.shadow.card },
  map: { flex: 1, backgroundColor: C.inputBg },
  mapFail: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.border },
  mapFailTxt: { fontSize: 12.5, color: C.gray, fontWeight: '600' },
  liveBadge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, zIndex: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  recenterBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: C.card, borderRadius: 14, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', zIndex: 10, ...C.shadow.card },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  cardTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '900', color: C.text, textAlign: 'right' },
  countPill: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  countPillTxt: { color: C.primary, fontWeight: '800', fontSize: 11.5 },
  stopRow: { paddingVertical: 12 },
  stopRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  stopHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  stopLogoWrap: { width: 46, height: 46 },
  stopLogo: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.inputBg },
  stopSeq: { position: 'absolute', bottom: -4, left: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stopSeqTxt: { color: '#FFF', fontSize: 10.5, fontWeight: '900' },
  stopName: { fontSize: 14.5, fontWeight: '900', color: C.text, textAlign: 'right' },
  stopSub: { fontSize: 11.5, color: C.gray, fontWeight: '500', textAlign: 'right', marginTop: 2 },
  stopBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  stopBadgeTxt: { fontSize: 11, fontWeight: '800' },
  stopBars: { flexDirection: 'row-reverse', gap: 4, marginTop: 10 },
  stopBar: { flex: 1, height: 5, borderRadius: 3 },
  stopReason: { fontSize: 12, color: C.red, fontWeight: '600', textAlign: 'right', marginTop: 6 },
  stopItems: { marginTop: 8, backgroundColor: C.inputBg, borderRadius: 14, paddingHorizontal: 10 },
  orderItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 9 },
  qtyBadge: { backgroundColor: C.tint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  qtyBadgeTxt: { color: C.primary, fontWeight: '900', fontSize: 12.5 },
  orderItemName: { fontSize: 13.5, color: C.text, fontWeight: '700', textAlign: 'right' },
  orderItemOpts: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  orderItemPrice: { fontSize: 13.5, fontWeight: '900', color: C.primary },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  stepCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  stepLine: { width: 3, height: 22, backgroundColor: C.border, marginVertical: 3, borderRadius: 2, overflow: 'hidden' },
  stepLabel: { fontSize: 14, color: C.faint, fontWeight: '700', textAlign: 'right' },
  stepDesc: { fontSize: 12, color: C.gray, fontWeight: '500', textAlign: 'right', marginTop: 2 },
  nowPill: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  nowTxt: { color: C.primary, fontSize: 11, fontWeight: '800' },
  driverCard: { backgroundColor: C.card, borderRadius: 24, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  driverAvatar: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  driverInitial: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  driverBadge: { position: 'absolute', bottom: -4, left: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 16, fontWeight: '900', color: C.text, textAlign: 'right' },
  driverSub: { fontSize: 12.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  driverLiveRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 4 },
  driverLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  driverLive: { fontSize: 11.5, color: C.green, fontWeight: '800', textAlign: 'right' },
  callBtn: { backgroundColor: C.green, borderRadius: 18, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: C.green, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  summaryRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9, gap: 10 },
  summaryLabel: { fontSize: 13.5, color: C.gray, fontWeight: '500', textAlign: 'right', flexShrink: 1 },
  summaryVal: { fontSize: 14, fontWeight: '800', color: C.text },
  divider: { height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.border, marginVertical: 10 },
  totalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontWeight: '900', fontSize: 17, color: C.text },
  totalVal: { fontWeight: '900', fontSize: 22, color: C.primary },
  cashBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: C.tint, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  cashTxt: { flex: 1, fontSize: 12.5, color: C.primary, fontWeight: '800', textAlign: 'right' },
  addrRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 10 },
  addrTxt: { flex: 1, fontSize: 12.5, color: C.sub, fontWeight: '500', textAlign: 'right' },
  cancelBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 14, borderWidth: 1.5, borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  cancelBtnTxt: { color: C.red, fontWeight: '900', fontSize: 15 },
  cantCancel: { fontSize: 12, color: C.gray, fontWeight: '600', textAlign: 'center' },
  rateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rateName: { flex: 1, fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  rateBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  rateBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 12.5 },
  helpRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  helpTxt: { color: C.gray, fontSize: 13, fontWeight: '600' },
  modalIcon: { width: 72, height: 72, borderRadius: 26, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center', marginBottom: 10, marginTop: 6 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.text },
  modalSub: { fontSize: 13.5, color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 21, fontWeight: '500' },
  reasonsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 },
  reasonInput: { alignSelf: 'stretch', marginTop: 12, borderRadius: 14, padding: 12, fontSize: 14, color: C.text, backgroundColor: C.inputBg, fontWeight: '500' },
  modalBtns: { alignSelf: 'stretch', gap: 10, marginTop: 16, marginBottom: 6 },
  modalBtn: { borderRadius: 16, height: 50, alignItems: 'center', justifyContent: 'center' },
  modalBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
