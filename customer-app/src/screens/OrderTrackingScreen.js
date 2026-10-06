import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Animated, ActivityIndicator, Modal, Pressable, TextInput, Alert, BackHandler } from 'react-native';
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
import { BottomSheet, Chip, Burst, ProgressRing } from '../components/UI';
import EmptyState from '../components/EmptyState';
import { haptic, isReducedMotion, EASE_OUT, SPRING_POP } from '../utils/motion';
import { useTheme } from '../context/ThemeContext';
import { SOCKET_URL, SUPPORT_PHONE } from '../config';
import { leafletPage, TILE_URL } from '../utils/leaflet';
import { statusLabel, CANCELLABLE_STATUSES, isPersonalOrder } from '../utils/status';
import { startCardPayment } from '../utils/payments';

// خطوات حسب نوع الطلب
const STEPS = {
  delivery: [
    { key: 'pending',    label: 'بانتظار المطعم', icon: 'time-outline',            desc: 'طلبك وصل للمطعم وبانتظار التأكيد' },
    { key: 'confirmed',  label: 'مؤكد',          icon: 'checkmark-circle-outline', desc: 'المطعم أكّد طلبك' },
    { key: 'preparing',  label: 'قيد التحضير',   icon: 'flame-outline',            desc: 'يتم تحضير طلبك الآن' },
    { key: 'ready',      label: 'جاهز',          icon: 'bag-check-outline',        desc: 'طلبك جاهز وبانتظار السائق' },
    { key: 'on_the_way', label: 'في الطريق',     icon: 'bicycle-outline',          desc: 'السائق في طريقه إليك' },
    { key: 'delivered',  label: 'تم التوصيل',    icon: 'gift-outline',             desc: 'بالهنا والعافية! 🎉' },
  ],
  pickup: [
    { key: 'pending',    label: 'بانتظار المطعم', icon: 'time-outline',            desc: 'طلبك وصل للمطعم وبانتظار التأكيد' },
    { key: 'confirmed',  label: 'مؤكد',          icon: 'checkmark-circle-outline', desc: 'المطعم أكّد طلبك' },
    { key: 'preparing',  label: 'قيد التحضير',   icon: 'flame-outline',            desc: 'يتم تحضير طلبك الآن' },
    { key: 'ready',      label: 'جاهز للاستلام', icon: 'storefront-outline',       desc: 'طلبك جاهز — تفضّل استلمه من المطعم' },
    { key: 'delivered',  label: 'تم الاستلام',   icon: 'gift-outline',             desc: 'بالهنا والعافية! 🎉' },
  ],
  personal: [
    { key: 'confirmed',  label: 'البحث عن سائق', icon: 'search-outline',           desc: 'عم نبحث عن أقرب سائق متاح' },
    { key: 'on_the_way', label: 'في الطريق',     icon: 'bicycle-outline',          desc: 'السائق في الطريق' },
    { key: 'delivered',  label: 'تم التوصيل',    icon: 'flag-outline',             desc: 'تم التوصيل بنجاح 🎉' },
  ],
};

const CANCEL_REASONS = ['تأخر الطلب', 'غيّرت رأيي', 'طلبت بالغلط', 'بدي أعدّل الطلب'];

function buildMapHTML({ startLat, startLng, startEmoji, startLabel, destLat, destLng, driverLat, driverLng, dark }) {
  const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) && x !== 0 ? x : null; };
  const sLat = n(startLat), sLng = n(startLng), dLat = n(destLat), dLng = n(destLng), vLat = n(driverLat), vLng = n(driverLng);
  const cLat = vLat || sLat || dLat || 31.9;
  const cLng = vLng || sLng || dLng || 35.2;
  return leafletPage({
    dark,
    style: `.leaflet-control-zoom a{font-size:18px!important;width:34px!important;height:34px!important;line-height:34px!important}
  .pop .leaflet-popup-content{font-family:system-ui;font-size:13px;font-weight:700;direction:rtl;text-align:right}
  @keyframes pulseRing{0%{transform:scale(.55);opacity:.75}80%,100%{transform:scale(2.3);opacity:0}}
  .drv-wrap{position:relative;width:44px;height:44px}
  .drv-ring{position:absolute;inset:0;border-radius:50%;background:rgba(255,107,0,.45);animation:pulseRing 1.6s ease-out infinite}
  .drv-badge{position:absolute;inset:0;background:#FF6B00;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.35)}`,
    script: `
var map=L.map('map',{center:[${cLat},${cLng}],zoom:14,zoomControl:true});
L.tileLayer('${TILE_URL}',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
map.zoomControl.setPosition('topleft');
function mkIcon(emoji,size,bg){size=size||32;return L.divIcon({html:'<div style="width:'+size+'px;height:'+size+'px;background:'+(bg||'#fff')+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+(size*0.55)+'px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.35)">'+emoji+'</div>',iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-(size/2)],className:''});}
function mkDriverIcon(){return L.divIcon({html:'<div class="drv-wrap"><div class="drv-ring"></div><div class="drv-badge">🛵</div></div>',iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-22],className:''});}
var pts=[],driverMarker=null,curPos=null,animFrame=null,startPos=null,endPos=null,animStart=0,ANIM_MS=5000,lastMoveAt=0,followDriver=true;
${sLat && sLng ? `L.marker([${sLat},${sLng}],{icon:mkIcon('${startEmoji}',40,'#FF6B00')}).addTo(map).bindPopup('${startLabel}',{className:'pop'});pts.push([${sLat},${sLng}]);` : ''}
${dLat && dLng ? `L.marker([${dLat},${dLng}],{icon:mkIcon('📍',40,'#FF3B30')}).addTo(map).bindPopup('موقع التوصيل',{className:'pop'});pts.push([${dLat},${dLng}]);` : ''}
${vLat && vLng ? `driverMarker=L.marker([${vLat},${vLng}],{icon:mkDriverIcon()}).addTo(map).bindPopup('السائق',{className:'pop'});curPos=[${vLat},${vLng}];pts.push([${vLat},${vLng}]);` : ''}
${sLat && dLat ? `L.polyline([[${sLat},${sLng}],[${dLat},${dLng}]],{color:'#FF6B00',weight:4,dashArray:'10 6',opacity:0.7}).addTo(map);` : ''}
if(pts.length===1){map.setView(pts[0],15);}else if(pts.length>1){map.fitBounds(pts,{padding:[50,50]});}
map.on('dragstart',function(){followDriver=false;});
function animStep(){var t=(Date.now()-animStart)/ANIM_MS;if(t>1)t=1;var lat=startPos[0]+(endPos[0]-startPos[0])*t;var lng=startPos[1]+(endPos[1]-startPos[1])*t;curPos=[lat,lng];driverMarker.setLatLng(curPos);if(followDriver)map.panTo(curPos,{animate:false});if(t<1){animFrame=requestAnimationFrame(animStep);}}
function moveDriver(lat,lng){if(isNaN(lat)||isNaN(lng))return;var ll=[lat,lng];
  if(!driverMarker){driverMarker=L.marker(ll,{icon:mkDriverIcon()}).addTo(map).bindPopup('السائق',{className:'pop'});curPos=ll;lastMoveAt=Date.now();if(followDriver)map.setView(ll,16,{animate:true});return;}
  var nowT=Date.now();var interval=lastMoveAt?(nowT-lastMoveAt):5000;lastMoveAt=nowT;ANIM_MS=Math.max(1500,Math.min(interval*1.2,14000));
  startPos=curPos?[curPos[0],curPos[1]]:[lat,lng];endPos=[lat,lng];animStart=Date.now();if(animFrame)cancelAnimationFrame(animFrame);animStep();}
function handleMsg(raw){try{var d=JSON.parse(raw);if(d.type==='driver_location'){moveDriver(parseFloat(d.lat),parseFloat(d.lng));}else if(d.type==='recenter'){followDriver=true;if(curPos)map.setView(curPos,16,{animate:true});else if(pts.length>1)map.fitBounds(pts,{padding:[50,50]});else if(pts.length)map.setView(pts[0],15);}}catch(err){}}
window.addEventListener('message',function(e){handleMsg(e.data);});
document.addEventListener('message',function(e){handleMsg(e.data);});
`,
  });
}

export default function OrderTrackingScreen() {
  const route = useRoute();
  const id = route.params?.orderId;
  const fromCheckout = !!route.params?.fromCheckout;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: COLORS, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);

  const [order, setOrder] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [celebrate, setCelebrate] = useState(fromCheckout);
  const webViewRef = useRef(null);
  const socketRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const goBack = useCallback(() => {
    if (!fromCheckout && navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main', { screen: 'الرئيسية' });
    return true;
  }, [fromCheckout, navigation]);

  // زر الرجوع بأندرويد: بعد الطلب يرجع للرئيسية (مش للسلة الفاضية)
  useFocusEffect(useCallback(() => {
    if (!fromCheckout) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [fromCheckout, goBack]));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    if (isReducedMotion()) return () => clearInterval(t);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { clearInterval(t); loop.stop(); };
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const data = await api.get(`/orders/${id}`);
      const o = data.data || data;
      // جزء من طلب مجمّع → شاشة تتبّع الطلب المجمّع (التتبّع والإلغاء والدفع على مستوى المجموعة)
      if (o?.group_id) { navigation.replace('GroupTracking', { groupId: o.group_id, fromCheckout }); return; }
      setOrder(o);
      setLoadError('');
      if (o.driver_lat && o.driver_lng) setDriverLoc({ lat: parseFloat(o.driver_lat), lng: parseFloat(o.driver_lng) });
    } catch (e) {
      setLoadError(e?.message === 'Network error' ? 'تعذّر الاتصال — تأكد من الإنترنت' : (e?.message || 'تعذّر تحميل الطلب'));
    } finally { setLoading(false); }
  }, [id, navigation, fromCheckout]);

  // تحديث عند كل رجوع للشاشة (مثلاً بعد التقييم) + كل 30 ثانية احتياطاً
  useFocusEffect(useCallback(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 30000);
    return () => clearInterval(interval);
  }, [fetchOrder]));

  useEffect(() => {
    let socket;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token) return;
        socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
        socketRef.current = socket;
        socket.on('driver:location', ({ lat, lng, orderId, order_id }) => {
          const oid = orderId ?? order_id;
          if (!oid || String(oid) === String(id)) setDriverLoc({ lat: parseFloat(lat), lng: parseFloat(lng) });
        });
        socket.on('order_status', ({ order_id, status }) => {
          if (String(order_id) === String(id)) {
            setOrder(prev => (prev ? { ...prev, status } : prev));
            fetchOrder(); // بيانات السائق/الوقت قد تتغير مع الحالة
          }
        });
        socket.on('order_cancelled', ({ order_id }) => {
          if (String(order_id) === String(id)) { setOrder(prev => (prev ? { ...prev, status: 'cancelled' } : prev)); fetchOrder(); }
        });
      } catch {}
    })();
    return () => { socket?.disconnect(); socketRef.current = null; };
  }, [id, fetchOrder]);

  useEffect(() => {
    if (!driverLoc || !webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'driver_location', lat: driverLoc.lat, lng: driverLoc.lng }));
  }, [driverLoc]);

  const personal = isPersonalOrder(order);
  const orderType = personal ? 'personal' : (order?.order_type === 'pickup' ? 'pickup' : 'delivery');
  const steps = STEPS[orderType];
  const status = order?.status;
  const isCancelled = status === 'cancelled';
  const isDelivered = status === 'delivered';
  const showMap = !!order && !isCancelled && orderType !== 'pickup' && status !== 'pending';

  // تُبنى الخريطة مرة واحدة لكل طلب؛ حركة السائق عبر postMessage
  const startLat = personal ? order?.pickup_lat : order?.restaurant_lat;
  const startLng = personal ? order?.pickup_lng : order?.restaurant_lng;
  const mapHtml = React.useMemo(
    () => (showMap ? buildMapHTML({
      startLat, startLng,
      startEmoji: personal ? '🟢' : '🏪', startLabel: personal ? 'نقطة الاستلام' : 'المطعم',
      destLat: order.delivery_lat, destLng: order.delivery_lng,
      driverLat: order.driver_lat, driverLng: order.driver_lng, dark: isDark,
    }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showMap, order?.id, startLat, startLng, order?.delivery_lat, order?.delivery_lng, isDark]
  );

  const cancelOrder = async () => {
    setCancelling(true);
    try {
      await api.patch(`/orders/${id}/cancel`, { reason: cancelReason.trim() || undefined });
      setCancelOpen(false);
      setOrder(prev => (prev ? { ...prev, status: 'cancelled' } : prev));
      fetchOrder();
      Alert.alert('تم إلغاء الطلب', 'تم إلغاء طلبك، وأي مبلغ من المحفظة أو نقاط مستخدمة رجعت لحسابك.');
    } catch (e) {
      Alert.alert('تعذّر الإلغاء', e?.message || 'حاول مرة أخرى');
      fetchOrder();
    } finally { setCancelling(false); }
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <GradientHeader title="تتبع الطلب" onBack={goBack} />
      <View style={{ padding: 16, gap: 14 }}>
        <Skeleton w={'100%'} h={150} r={26} />
        <Skeleton w={'100%'} h={220} r={24} />
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            <Skeleton w={40} h={40} r={20} />
            <View style={{ flex: 1, gap: 6, alignItems: 'flex-end' }}><Skeleton w={'50%'} h={13} /><Skeleton w={'70%'} h={10} /></View>
          </View>
        ))}
      </View>
    </View>
  );

  if (!order) return (
    <View style={styles.container}>
      <GradientHeader title="تتبع الطلب" onBack={goBack} />
      <EmptyState emoji="😕" title="تعذّر فتح الطلب" subtitle={loadError || 'لم يُعثر على الطلب'} ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); fetchOrder(); }} />
    </View>
  );

  const currentIdx = steps.findIndex(s => s.key === status);
  const knownStatus = currentIdx >= 0 || isCancelled;
  // طلب شخصي بحالة "pending" أو أي حالة قبل التأكيد → أول خطوة
  const effIdx = currentIdx >= 0 ? currentIdx : (personal && status === 'pending' ? 0 : -1);
  const currentStep = effIdx >= 0 ? steps[effIdx] : null;
  const canCancel = CANCELLABLE_STATUSES.includes(status);
  const rated = order.rating_restaurant != null || order.rating_driver != null;
  const paymentPending = order.payment_method === 'card' && order.payment_status !== 'paid' && !isCancelled && !isDelivered;
  const personalWaiting = personal && status === 'confirmed' && !order.driver_name;

  const hero = isCancelled ? HERO.cancelled : (HERO[status] || HERO.pending);
  const heroColors = COLORS.gradients[hero.g] || COLORS.gradients.sunset;
  const etaMs = order.estimated_delivery_time ? new Date(order.estimated_delivery_time).getTime() : null;
  const createdMs = order.created_at ? new Date(order.created_at).getTime() : null;
  const mins = etaMs ? Math.round((etaMs - now) / 60000) : null;
  const showEta = !isCancelled && !isDelivered && etaMs && !personal;
  const etaProgress = showEta && createdMs && etaMs > createdMs ? (now - createdMs) / (etaMs - createdMs) : (effIdx >= 0 ? (effIdx + 1) / steps.length : 0);

  return (
    <View style={styles.container}>
      <GradientHeader title={personal ? 'تتبع الطلب الشخصي' : 'تتبع الطلب'} subtitle={`#${order.order_number || id}`} onBack={goBack}
        right={<TouchableOpacity onPress={() => navigation.navigate('SupportChat')} accessibilityLabel="الدعم" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="headset-outline" size={20} color="#FFF" /></TouchableOpacity>} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>

        {/* بطاقة الحالة (تتحوّل لونياً وأيقونةً حسب الحالة) */}
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
                <Text style={styles.heroTitle}>{isCancelled ? 'تم إلغاء الطلب' : (currentStep?.label || statusLabel(status, order))}</Text>
                <Text style={styles.heroDesc}>
                  {isCancelled
                    ? (order.cancel_reason ? `السبب: ${order.cancel_reason}` : 'للاستفسار تواصل مع الدعم')
                    : !knownStatus ? 'نحدّث حالة طلبك — اسحب للتحديث أو تواصل مع الدعم'
                      : personalWaiting ? 'عم نبحث عن أقرب سائق متاح، رح نبلغك فور القبول'
                        : currentStep?.desc}
                </Text>
              </View>
              {showEta && (
                <ProgressRing progress={etaProgress} size={68} stroke={5}>
                  <View style={{ position: 'absolute', alignItems: 'center' }}>
                    <Text style={styles.ringNum}>{mins > 0 ? mins : '✓'}</Text>
                    <Text style={styles.ringLbl}>{mins > 0 ? 'دقيقة' : 'قرّب'}</Text>
                  </View>
                </ProgressRing>
              )}
            </View>
            {showEta && (
              <View style={styles.etaBox}>
                <Ionicons name="time" size={14} color="#FFF" />
                <Text style={styles.etaText}>
                  {mins > 0 ? `${orderType === 'pickup' ? 'الجاهزية' : 'الوصول'} المتوقّع خلال ~${mins} دقيقة` : 'قرّب كثير، شكراً لصبرك 🙏'}
                </Text>
              </View>
            )}
          </LinearGradient>
        </PopIn>

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
            {status === 'on_the_way' && (
              <View style={styles.liveBadge}>
                <Pulse to={1.5}><View style={styles.liveDot} /></Pulse>
                <Text style={styles.liveText}>مباشر</Text>
              </View>
            )}
            <TouchableOpacity style={styles.recenterBtn} onPress={() => webViewRef.current?.postMessage(JSON.stringify({ type: 'recenter' }))} accessibilityLabel="توسيط الخريطة">
              <Ionicons name="locate" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </FadeIn>
        ) : mapFailed ? (
          <View style={styles.mapFail}>
            <Ionicons name="map-outline" size={18} color={COLORS.gray} />
            <Text style={styles.mapFailTxt}>تعذّر تحميل الخريطة — التتبع مستمر</Text>
          </View>
        ) : null}

        {paymentPending && (
          <FadeIn style={[styles.payCard, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]}>
            <View style={[styles.payIcon, { backgroundColor: COLORS.warnFill }]}><Ionicons name="card" size={18} color="#FFF" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payTitle}>الدفع بالبطاقة لم يكتمل</Text>
              <Text style={styles.paySub}>تقدر تدفع الآن، أو تدفع للسائق/المطعم عند الاستلام.</Text>
            </View>
            <Press style={styles.payBtn} onPress={() => startCardPayment(navigation, id)} accessibilityRole="button">
              <LinearGradient colors={COLORS.gradients.sunset} style={StyleSheet.absoluteFill} />
              <Text style={styles.payBtnTxt}>ادفع الآن</Text>
            </Press>
          </FadeIn>
        )}

        {/* السائق */}
        {!!order.driver_name && !isCancelled && (
          <FadeIn delay={80} style={styles.driverCard}>
            <View>
              <LinearGradient colors={COLORS.gradients.sunset} style={styles.driverAvatar}>
                <Text style={styles.driverInitial}>{String(order.driver_name).trim().charAt(0) || '؟'}</Text>
              </LinearGradient>
              <View style={[styles.driverBadge, { borderColor: COLORS.card }]}><Ionicons name="bicycle" size={11} color="#FFF" /></View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{order.driver_name}</Text>
              <Text style={styles.driverSub}>{[order.vehicle_type, order.vehicle_plate].filter(Boolean).join(' · ') || 'سائق وصلّي'}</Text>
              {driverLoc && status === 'on_the_way' && (
                <View style={styles.driverLiveRow}><View style={styles.driverLiveDot} /><Text style={styles.driverLive}>يتحرك الآن</Text></View>
              )}
            </View>
            {!!order.driver_phone && (
              <Press style={styles.callBtn} scaleTo={0.9} onPress={() => Linking.openURL(`tel:${order.driver_phone}`).catch(() => {})} accessibilityRole="button" accessibilityLabel="اتصل بالسائق">
                <Ionicons name="call" size={20} color="#FFF" />
              </Press>
            )}
          </FadeIn>
        )}

        {/* خطوات التقدّم */}
        {!isCancelled && (
          <FadeIn delay={100} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIcon}><Ionicons name="git-commit" size={15} color={COLORS.primary} /></View>
              <Text style={styles.cardTitle}>مراحل الطلب</Text>
            </View>
            {steps.map((step, idx) => (
              <TimelineStep key={step.key} step={step} idx={idx} effIdx={effIdx} last={idx === steps.length - 1}
                isDelivered={isDelivered} C={COLORS} styles={styles} />
            ))}
          </FadeIn>
        )}

        {/* التفاصيل */}
        <FadeIn delay={140} style={styles.card}>
          {personal ? (
            <>
              <InfoRow styles={styles} icon={order.service_type === 'ride' ? 'person-outline' : 'cube-outline'} color={COLORS.primary}
                label="الخدمة" value={order.service_type === 'ride' ? `توصيل راكب${order.passengers ? ` · ${order.passengers} راكب` : ''}` : 'توصيل طرد'} />
              {!!order.pickup_address && <InfoRow styles={styles} icon="radio-button-on-outline" color={COLORS.green} label="الاستلام" value={order.pickup_address} />}
              {!!order.recipient_name && <InfoRow styles={styles} icon="person-circle-outline" color={COLORS.primary} label="المستلم" value={`${order.recipient_name}${order.recipient_phone ? ` · ${order.recipient_phone}` : ''}`} />}
            </>
          ) : (
            <>
              <InfoRow styles={styles} icon="restaurant-outline" color={COLORS.primary} label="المطعم" value={order.restaurant_name} />
              <InfoRow styles={styles} icon={orderType === 'pickup' ? 'storefront-outline' : 'bicycle-outline'} color={COLORS.primary} label="الاستلام" value={orderType === 'pickup' ? 'استلام من المطعم' : 'توصيل'} />
            </>
          )}
          {!!order.delivery_address && <InfoRow styles={styles} icon="location-outline" color={COLORS.red} label={personal ? 'التسليم' : 'العنوان'} value={order.delivery_address} />}
          <InfoRow styles={styles} icon="wallet-outline" color={COLORS.primary} label="الدفع"
            value={order.payment_method === 'card' ? (order.payment_status === 'paid' ? 'بطاقة — مدفوع ✅' : 'بطاقة — غير مدفوع') : 'كاش عند الاستلام'} />
          <InfoRow styles={styles} icon="cash-outline" color={COLORS.green} label="الإجمالي" value={`${parseFloat(order.total || 0).toFixed(2)}₪`} strong last />
        </FadeIn>

        {order.items?.length > 0 && (
          <FadeIn delay={180} style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIcon}><Ionicons name="receipt" size={15} color={COLORS.primary} /></View>
              <Text style={styles.cardTitle}>تفاصيل الطلب</Text>
            </View>
            {order.items.map((item, i) => {
              let opts = item.options;
              if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = []; } }
              return (
                <View key={item.id || i} style={[styles.orderItem, i === order.items.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.qtyBadge}><Text style={styles.qtyBadgeTxt}>{item.quantity}×</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderItemName}>{item.name_ar || item.name}</Text>
                    {Array.isArray(opts) && opts.length > 0 && <Text style={styles.orderItemOpts}>{opts.map(o => o.name).join(' • ')}</Text>}
                  </View>
                  <Text style={styles.orderItemPrice}>{(parseFloat(item.subtotal) || parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}₪</Text>
                </View>
              );
            })}
          </FadeIn>
        )}

        {canCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { haptic.warning(); setCancelOpen(true); }} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={19} color={COLORS.red} />
            <Text style={styles.cancelBtnTxt}>إلغاء الطلب</Text>
          </TouchableOpacity>
        )}

        {isDelivered && (rated ? (
          <View style={[styles.ratedBox, { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorder }]}>
            <Ionicons name="star" size={18} color={COLORS.star} />
            <Text style={[styles.ratedTxt, { color: COLORS.successText }]}>شكراً على تقييمك{order.rating_restaurant ? ` (${order.rating_restaurant}/5)` : ''} 💛</Text>
          </View>
        ) : (
          <GradientButton title="قيّم تجربتك" icon={<Ionicons name="star" size={18} color="#FFF" />} onPress={() => navigation.navigate('Rating', {
            orderId: id,
            restaurantName: personal ? 'طلب شخصي' : order.restaurant_name,
            driverName: order.driver_name,
            isPersonal: personal,
          })} />
        ))}

        <TouchableOpacity style={styles.helpRow} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {})} accessibilityRole="button">
          <Ionicons name="call-outline" size={15} color={COLORS.gray} />
          <Text style={styles.helpTxt}>محتاج مساعدة؟ اتصل بالدعم</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* شيت تأكيد الإلغاء */}
      <BottomSheet visible={cancelOpen} onClose={() => !cancelling && setCancelOpen(false)}>
        <View style={{ paddingHorizontal: 20, alignItems: 'center' }}>
          <View style={styles.modalIcon}><Ionicons name="alert-circle" size={36} color={COLORS.red} /></View>
          <Text style={styles.modalTitle}>إلغاء الطلب؟</Text>
          <Text style={styles.modalSub}>متأكد بدك تلغي الطلب #{order.order_number || id}؟ ما بنقدر نرجّعه بعد الإلغاء.</Text>
          <View style={styles.reasonsWrap}>
            {CANCEL_REASONS.map(r => (
              <Chip key={r} size="sm" label={r} selected={cancelReason === r} onPress={() => setCancelReason(cancelReason === r ? '' : r)} />
            ))}
          </View>
          <TextInput style={styles.reasonInput} placeholder="سبب آخر (اختياري)" placeholderTextColor={COLORS.faint}
            value={CANCEL_REASONS.includes(cancelReason) ? '' : cancelReason} onChangeText={setCancelReason} textAlign="right" maxLength={150} />
          <View style={styles.modalBtns}>
            <GradientButton title="نعم، ألغِ الطلب" onPress={cancelOrder} loading={cancelling} colors={['#FF6B5E', '#F04438', '#C8281C']} height={52} />
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.inputBg }]} onPress={() => setCancelOpen(false)} disabled={cancelling} accessibilityRole="button">
              <Text style={[styles.modalBtnTxt, { color: COLORS.text }]}>تراجع</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* لحظة نجاح الطلب (بعد الدفع/التأكيد مباشرة) */}
      {celebrate && <CheckoutSuccess onDone={() => setCelebrate(false)} C={COLORS} orderNo={order.order_number || id} />}
    </View>
  );
}

// ألوان وأيقونات بطاقة الحالة
const HERO = {
  pending:    { g: 'gold',    icon: 'hourglass' },
  confirmed:  { g: 'info',    icon: 'checkmark-done' },
  preparing:  { g: 'violet',  icon: 'flame' },
  ready:      { g: 'success', icon: 'bag-check' },
  on_the_way: { g: 'sunset',  icon: 'bicycle' },
  delivered:  { g: 'success', icon: 'gift' },
  cancelled:  { g: 'danger',  icon: 'close-circle' },
};

/* خطوة بالخط الزمني: الخط يمتلئ بحركة + الدائرة النشطة تنبض */
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

/* شاشة احتفال قصيرة بعد إتمام الطلب */
export function CheckoutSuccess({ onDone, C, orderNo }) {
  const v = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    haptic.success();
    if (isReducedMotion()) { v.setValue(1); check.setValue(1); }
    else {
      Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      Animated.spring(check, { toValue: 1, damping: 10, stiffness: 160, mass: 0.9, delay: 120, useNativeDriver: true }).start();
    }
    const t = setTimeout(() => {
      Animated.timing(v, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => onDone());
    }, 2300);
    return () => clearTimeout(t);
  }, []);
  const sc = check.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const ty = check.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: v, zIndex: 100 }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="متابعة لتتبع الطلب">
        <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <LinearGradient colors={C.gradients.sheen} style={[StyleSheet.absoluteFill, { height: 200 }]} />
          <Burst count={22} radius={150} />
          <Animated.View style={[successStyles.circle, { transform: [{ scale: sc }] }]}>
            <Ionicons name="checkmark" size={64} color={C.primary} />
          </Animated.View>
          <Animated.Text style={[successStyles.title, { opacity: check, transform: [{ translateY: ty }] }]}>تم استلام طلبك!</Animated.Text>
          <Animated.Text style={[successStyles.sub, { opacity: check, transform: [{ translateY: ty }] }]}>طلب #{orderNo} · رح نبلّشه حالاً 🎉</Animated.Text>
          <Text style={successStyles.hint}>اضغط للمتابعة</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
const successStyles = StyleSheet.create({
  circle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  title: { color: '#FFF', fontSize: 28, fontWeight: '900', marginTop: 26, textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '500', marginTop: 6, textAlign: 'center' },
  hint: { position: 'absolute', bottom: 60, color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: '700' },
});

function InfoRow({ styles, icon, color, label, value, strong, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={[styles.infoIcon, { backgroundColor: color + '1A' }]}><Ionicons name={icon} size={15} color={color} /></View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoVal, strong && styles.infoValStrong]} numberOfLines={2}>{value || '—'}</Text>
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
  ringNum: { color: '#FFF', fontSize: 19, fontWeight: '900', lineHeight: 22 },
  ringLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },
  etaBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 14, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.14)', alignSelf: 'flex-end' },
  etaText: { fontSize: 12.5, fontWeight: '800', color: '#FFF' },
  mapWrap: { height: 250, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg, ...C.shadow.card },
  map: { flex: 1, backgroundColor: C.inputBg },
  mapFail: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.border },
  liveBadge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, zIndex: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  recenterBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: C.card, borderRadius: 14, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', zIndex: 10, ...C.shadow.card },
  mapFailTxt: { fontSize: 12.5, color: C.gray, fontWeight: '600' },
  payCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: 20, padding: 14, borderWidth: 1 },
  payIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  payTitle: { fontSize: 14, fontWeight: '900', color: C.text, textAlign: 'right' },
  paySub: { fontSize: 12, color: C.sub, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  payBtn: { borderRadius: 14, paddingHorizontal: 14, height: 40, justifyContent: 'center', overflow: 'hidden' },
  payBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  cardTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '900', color: C.text, textAlign: 'right' },
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
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  infoIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 12.5, color: C.gray, width: 62, textAlign: 'right', fontWeight: '500' },
  infoVal: { flex: 1, fontSize: 13.5, fontWeight: '700', color: C.text, textAlign: 'left' },
  infoValStrong: { color: C.primary, fontWeight: '900', fontSize: 17 },
  orderItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  qtyBadge: { backgroundColor: C.tint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  qtyBadgeTxt: { color: C.primary, fontWeight: '900', fontSize: 12.5 },
  orderItemName: { fontSize: 14, color: C.text, fontWeight: '700', textAlign: 'right' },
  orderItemOpts: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  orderItemPrice: { fontSize: 14, fontWeight: '900', color: C.primary },
  cancelBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 14, borderWidth: 1.5, borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  cancelBtnTxt: { color: C.red, fontWeight: '900', fontSize: 15 },
  ratedBox: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, padding: 14, borderWidth: 1 },
  ratedTxt: { fontWeight: '800', fontSize: 14 },
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
