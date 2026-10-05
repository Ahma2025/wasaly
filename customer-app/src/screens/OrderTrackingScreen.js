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
import { FadeIn } from '../components/Anim';
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
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { clearInterval(t); loop.stop(); };
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const data = await api.get(`/orders/${id}`);
      const o = data.data || data;
      setOrder(o);
      setLoadError('');
      if (o.driver_lat && o.driver_lng) setDriverLoc({ lat: parseFloat(o.driver_lat), lng: parseFloat(o.driver_lng) });
    } catch (e) {
      setLoadError(e?.message === 'Network error' ? 'تعذّر الاتصال — تأكد من الإنترنت' : (e?.message || 'تعذّر تحميل الطلب'));
    } finally { setLoading(false); }
  }, [id]);

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
      <Skeleton w={'100%'} h={240} r={0} />
      <View style={{ padding: 16, gap: 14 }}>
        <Skeleton w={'40%'} h={16} style={{ alignSelf: 'flex-end' }} />
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
      <View style={styles.loadingWrap}>
        <Text style={{ fontSize: 48 }}>😕</Text>
        <Text style={styles.loadingText}>{loadError || 'لم يُعثر على الطلب'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchOrder(); }}>
          <Text style={styles.retryTxt}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
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

  return (
    <View style={styles.container}>
      <GradientHeader title={personal ? 'تتبع الطلب الشخصي' : 'تتبع الطلب'} subtitle={`#${order.order_number || id}`} onBack={goBack}
        right={<TouchableOpacity onPress={() => navigation.navigate('SupportChat')} accessibilityLabel="الدعم"><Ionicons name="headset-outline" size={20} color="#FFF" /></TouchableOpacity>} />

      {showMap && mapHtml && !mapFailed ? (
        <View style={styles.mapWrap}>
          <WebView
            ref={webViewRef}
            source={{ html: mapHtml }}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
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
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>مباشر</Text>
            </View>
          )}
          <TouchableOpacity style={styles.recenterBtn} onPress={() => webViewRef.current?.postMessage(JSON.stringify({ type: 'recenter' }))} accessibilityLabel="توسيط الخريطة">
            <Ionicons name="locate" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.noMapStatus}>
          <Animated.Text style={[styles.bigEmoji, { transform: [{ scale: pulseAnim }] }]}>
            {isCancelled ? '❌' : status === 'preparing' ? '👨‍🍳' : status === 'on_the_way' ? '🛵' : isDelivered ? '🎉' : status === 'ready' ? '🛍️' : '⏳'}
          </Animated.Text>
          {mapFailed && <Text style={styles.mapFailTxt}>تعذّر تحميل الخريطة — التتبع مستمر</Text>}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>

        {/* بطاقة الحالة */}
        <FadeIn>
          <View style={[styles.statusCard, isCancelled && { borderColor: COLORS.red }, isDelivered && { borderColor: COLORS.green }]}>
            <Text style={[styles.statusTitle, isCancelled && { color: COLORS.red }, isDelivered && { color: COLORS.green }]}>
              {isCancelled ? '❌ تم إلغاء الطلب' : (currentStep?.label || statusLabel(status, order))}
            </Text>
            <Text style={styles.statusDesc}>
              {isCancelled
                ? (order.cancel_reason ? `السبب: ${order.cancel_reason}` : 'للاستفسار تواصل مع الدعم')
                : !knownStatus ? 'نحدّث حالة طلبك — اسحب للتحديث أو تواصل مع الدعم'
                  : personalWaiting ? 'عم نبحث عن أقرب سائق متاح، رح نبلغك فور القبول'
                    : currentStep?.desc}
            </Text>
            {!isCancelled && !isDelivered && order.estimated_delivery_time && !personal && (() => {
              const mins = Math.round((new Date(order.estimated_delivery_time).getTime() - now) / 60000);
              return (
                <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.etaBox}>
                  <Ionicons name="time" size={16} color="#FFF" />
                  <Text style={styles.etaText}>
                    {mins > 0 ? `${orderType === 'pickup' ? 'الجاهزية' : 'الوصول'} المتوقّع خلال ~${mins} دقيقة` : 'قرّب كثير، شكراً لصبرك 🙏'}
                  </Text>
                </LinearGradient>
              );
            })()}
          </View>
        </FadeIn>

        {paymentPending && (
          <View style={[styles.payCard, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]}>
            <Ionicons name="card-outline" size={22} color={COLORS.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.payTitle}>الدفع بالبطاقة لم يكتمل</Text>
              <Text style={styles.paySub}>تقدر تدفع الآن، أو تدفع للسائق/المطعم عند الاستلام.</Text>
            </View>
            <TouchableOpacity style={styles.payBtn} onPress={() => startCardPayment(navigation, id)}>
              <Text style={styles.payBtnTxt}>ادفع الآن</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* خطوات التقدّم */}
        {!isCancelled && (
          <FadeIn delay={80}>
            <View style={styles.card}>
              {steps.map((step, idx) => {
                const done = effIdx >= 0 && idx <= effIdx;
                const active = idx === effIdx;
                const last = idx === steps.length - 1;
                return (
                  <View key={step.key} style={styles.stepRow}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={[styles.stepCircle, done && { backgroundColor: COLORS.primary }, isDelivered && last && { backgroundColor: COLORS.green }]}>
                        <Ionicons name={step.icon} size={14} color={done ? '#FFF' : COLORS.gray} />
                      </View>
                      {!last && <View style={[styles.stepLine, effIdx >= 0 && idx < effIdx && { backgroundColor: COLORS.primary }]} />}
                    </View>
                    <Text style={[styles.stepLabel, active && { color: COLORS.primary, fontWeight: '900' }, done && !active && { color: COLORS.green }]}>
                      {step.label}
                    </Text>
                    {active && !isDelivered && <View style={styles.activeDot} />}
                  </View>
                );
              })}
            </View>
          </FadeIn>
        )}

        {/* السائق */}
        {!!order.driver_name && !isCancelled && (
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}><Text style={{ fontSize: 26 }}>🛵</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{order.driver_name}</Text>
              <Text style={styles.driverSub}>{[order.vehicle_type, order.vehicle_plate].filter(Boolean).join(' · ') || 'سائق وصلّي'}</Text>
              {driverLoc && status === 'on_the_way' && <Text style={styles.driverLive}>🟢 يتحرك الآن</Text>}
            </View>
            {!!order.driver_phone && (
              <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.driver_phone}`).catch(() => {})} accessibilityLabel="اتصل بالسائق">
                <Ionicons name="call" size={20} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* التفاصيل */}
        <View style={styles.card}>
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
        </View>

        {order.items?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🧾 تفاصيل الطلب</Text>
            {order.items.map((item, i) => {
              let opts = item.options;
              if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = []; } }
              return (
                <View key={item.id || i} style={styles.orderItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderItemName}>{item.name_ar || item.name} × {item.quantity}</Text>
                    {Array.isArray(opts) && opts.length > 0 && <Text style={styles.orderItemOpts}>{opts.map(o => o.name).join(' • ')}</Text>}
                  </View>
                  <Text style={styles.orderItemPrice}>{(parseFloat(item.subtotal) || parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}₪</Text>
                </View>
              );
            })}
          </View>
        )}

        {canCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setCancelOpen(true)} accessibilityRole="button">
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
          <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Rating', {
            orderId: id,
            restaurantName: personal ? 'طلب شخصي' : order.restaurant_name,
            driverName: order.driver_name,
            isPersonal: personal,
          })}>
            <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rateBtn}>
              <Text style={styles.rateBtnText}>⭐ قيّم تجربتك</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.helpRow} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {})}>
          <Text style={styles.helpTxt}>محتاج مساعدة؟ اتصل بالدعم</Text>
          <Ionicons name="call-outline" size={15} color={COLORS.gray} />
        </TouchableOpacity>
      </ScrollView>

      {/* نافذة تأكيد الإلغاء */}
      <Modal visible={cancelOpen} transparent animationType="fade" onRequestClose={() => setCancelOpen(false)} statusBarTranslucent>
        <Pressable style={styles.modalOverlay} onPress={() => !cancelling && setCancelOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}><Ionicons name="alert-circle" size={36} color={COLORS.red} /></View>
            <Text style={styles.modalTitle}>إلغاء الطلب؟</Text>
            <Text style={styles.modalSub}>متأكد بدك تلغي الطلب #{order.order_number || id}؟ ما بنقدر نرجّعه بعد الإلغاء.</Text>
            <View style={styles.reasonsWrap}>
              {CANCEL_REASONS.map(r => (
                <TouchableOpacity key={r} onPress={() => setCancelReason(cancelReason === r ? '' : r)} style={[styles.reasonChip, cancelReason === r && styles.reasonChipOn]}>
                  <Text style={[styles.reasonTxt, cancelReason === r && { color: '#FFF' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.reasonInput} placeholder="سبب آخر (اختياري)" placeholderTextColor={COLORS.faint}
              value={CANCEL_REASONS.includes(cancelReason) ? '' : cancelReason} onChangeText={setCancelReason} textAlign="right" maxLength={150} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.red }]} onPress={cancelOrder} disabled={cancelling}>
                {cancelling ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTxt}>نعم، ألغِ الطلب</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.inputBg }]} onPress={() => setCancelOpen(false)} disabled={cancelling}>
                <Text style={[styles.modalBtnTxt, { color: COLORS.text }]}>تراجع</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function InfoRow({ styles, icon, color, label, value, strong, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoVal, strong && styles.infoValStrong]} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 15, color: C.gray, fontWeight: '600', textAlign: 'center' },
  retryBtn: { backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 6 },
  retryTxt: { color: '#FFF', fontWeight: '800' },
  mapWrap: { height: 260, position: 'relative', marginTop: -16, zIndex: -1 },
  map: { flex: 1, backgroundColor: C.inputBg },
  liveBadge: { position: 'absolute', top: 26, right: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, zIndex: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  recenterBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: C.card, borderRadius: 12, padding: 9, elevation: 4, zIndex: 10 },
  noMapStatus: { height: 140, justifyContent: 'center', alignItems: 'center', backgroundColor: C.tint, marginTop: -16, paddingTop: 16, zIndex: -1 },
  mapFailTxt: { fontSize: 12, color: C.gray, fontWeight: '600', marginTop: 4 },
  bigEmoji: { fontSize: 60 },
  statusCard: { backgroundColor: C.card, borderRadius: 20, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: C.tintBorder, ...C.shadow.soft },
  statusTitle: { fontSize: 20, fontWeight: '900', color: C.primary, marginBottom: 6, textAlign: 'center' },
  statusDesc: { fontSize: 13, color: C.gray, textAlign: 'center', lineHeight: 20 },
  etaBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 12, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 13 },
  etaText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  payCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14, borderWidth: 1 },
  payTitle: { fontSize: 14, fontWeight: '900', color: C.text, textAlign: 'right' },
  paySub: { fontSize: 12, color: C.sub, marginTop: 2, textAlign: 'right' },
  payBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  payBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, ...C.shadow.soft },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: C.text, marginBottom: 10, textAlign: 'right' },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.border, justifyContent: 'center', alignItems: 'center' },
  stepLine: { width: 2, height: 16, backgroundColor: C.border, marginVertical: 2 },
  stepLabel: { flex: 1, fontSize: 14, color: C.gray, fontWeight: '700', textAlign: 'right', paddingTop: 6 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginTop: 11 },
  driverCard: { backgroundColor: C.card, borderRadius: 20, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, ...C.shadow.soft },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'right' },
  driverSub: { fontSize: 12, color: C.gray, marginTop: 2, textAlign: 'right' },
  driverLive: { fontSize: 11.5, color: C.green, fontWeight: '700', marginTop: 3, textAlign: 'right' },
  callBtn: { backgroundColor: C.green, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  infoLabel: { fontSize: 12.5, color: C.gray, width: 70, textAlign: 'right' },
  infoVal: { flex: 1, fontSize: 13.5, fontWeight: '700', color: C.text, textAlign: 'left' },
  infoValStrong: { color: C.primary, fontWeight: '900', fontSize: 16 },
  orderItem: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  orderItemName: { fontSize: 13.5, color: C.text, fontWeight: '700', textAlign: 'right' },
  orderItemOpts: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right' },
  orderItemPrice: { fontSize: 13.5, fontWeight: '800', color: C.primary },
  cancelBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 14, borderWidth: 1.5, borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  cancelBtnTxt: { color: C.red, fontWeight: '900', fontSize: 15 },
  ratedBox: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 14, borderWidth: 1 },
  ratedTxt: { fontWeight: '800', fontSize: 14 },
  rateBtn: { borderRadius: 18, padding: 16, alignItems: 'center', ...C.shadow.float },
  rateBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  helpRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  helpTxt: { color: C.gray, fontSize: 13, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: C.card, borderRadius: 26, padding: 22, alignItems: 'center', ...C.shadow.card },
  modalIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.text },
  modalSub: { fontSize: 13.5, color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 21 },
  reasonsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 },
  reasonChip: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  reasonChipOn: { backgroundColor: C.primary, borderColor: C.primary },
  reasonTxt: { fontSize: 12.5, fontWeight: '700', color: C.text },
  reasonInput: { alignSelf: 'stretch', marginTop: 12, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 11, fontSize: 14, color: C.text, backgroundColor: C.inputBg },
  modalBtns: { alignSelf: 'stretch', gap: 10, marginTop: 16 },
  modalBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  modalBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
