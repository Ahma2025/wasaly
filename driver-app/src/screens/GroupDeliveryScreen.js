// 🧺 شاشة توصيل الطلب المجمّع (عدة مطاعم — سائق واحد)
// خريطة بكل المحطات + الزبون، المسار المقترح، بطاقة لكل مطعم (اتصال/ملاحة/استلام)، ثم التسليم للزبون مرة واحدة
// تُفتح عبر نفس شاشة "Delivery" (بارامتر groupId) — انظر DeliveryScreen
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, RefreshControl, I18nManager } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import GradientHeader from '../components/GradientHeader';
import { CashBadge } from '../components/OrderMoney';
import { Skeleton, SkeletonCard, FadeIn, PopIn, Pulse, Press, GradientButton, EmptyState, Burst } from '../components/Anim';
import { showToast } from '../components/Toast';
import api from '../utils/api';
import { useSocketEvent } from '../utils/socket';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { useDriverCoords } from '../context/LocationContext';
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import { SERVER_URL } from '../config';
import { money, num, km, haversineKm, parseItems, TERMS } from '../utils/format';
import { arCount } from '../utils/plural';
import {
  gid, normalizeGroup, groupNo, groupEarning, allPicked, nextStop, pickedCount, stopState,
  openNavigation, callPhone,
} from '../utils/group';

const POLL_MS = 15000;
// التخطيط الأصلي مثبّت LTR (App.js) فنقلب الصفوف صراحةً؛ يبقى صحيحاً إن فُعّل RTL الأصلي
const ROW = I18nManager.isRTL ? 'row' : 'row-reverse';

// ألوان حالة المحطة من الجدول الموحّد (utils/format STATUS)
const TONE = {
  green: { c: COLORS.greenDeep, bg: COLORS.greenSoft },
  purple: { c: COLORS.purpleDeep, bg: COLORS.purpleSoft },
  amber: { c: COLORS.amberDeep, bg: COLORS.amberSoft },
  brand: { c: COLORS.brandText, bg: COLORS.brandSoft },
  gray: { c: COLORS.gray, bg: COLORS.inputBg },
};

// بيانات الخريطة: الرقم n يُعطى قبل استبعاد المحطات بلا إحداثيات (D-21) فيطابق رقم المحطة في القائمة
function groupMapData(stops, next, drop) {
  return {
    stops: (stops || [])
      .map((s, i) => ({ lat: s.lat, lng: s.lng, n: i + 1, name: s.name || 'مطعم', picked: !!s.picked, next: !!next && gid(next.order_id) === gid(s.order_id) }))
      .filter(s => s.lat && s.lng),
    drop: drop && drop.lat && drop.lng ? { lat: drop.lat, lng: drop.lng } : null,
  };
}

// خريطة Leaflet تُبنى مرة واحدة للمجموعة (D-04)؛ تحديث المحطات وموقع السائق بالرسائل (postMessage)
// فلا تومض ولا يرجع الزوم ولا يقفز السكوتر بعد كل استلام
function buildGroupMapHTML({ stops, drop, driver }) {
  const data = {
    stops: stops || [],
    drop: drop || null,
    driver: driver && driver.lat && driver.lng ? { lat: driver.lat, lng: driver.lng } : null,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const c = data.driver || data.stops[0] || data.drop || { lat: 31.9, lng: 35.2 };
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" onerror="this.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>if(!window.L){document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\\/script>');}</script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#EDE7E1}
  .leaflet-control-zoom a{font-size:18px!important;width:36px!important;height:36px!important;line-height:36px!important}
  #err{display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-family:sans-serif;color:#6B7280;font-size:14px;text-align:center;padding:20px;direction:rtl}
</style>
</head>
<body>
<div id="map"></div>
<div id="err">تعذّر تحميل الخريطة — استخدم أزرار الملاحة</div>
<script>
var D=${json};
if(!window.L){ document.getElementById('err').style.display='flex'; }
else {
var map=L.map('map',{center:[${c.lat},${c.lng}],zoom:14,zoomControl:true,tap:true});
map.zoomControl.setPosition('topleft');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
function pin(html,size,bg){
  return L.divIcon({html:'<div style="width:'+size+'px;height:'+size+'px;background:'+bg+';border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font:900 '+Math.round(size*0.45)+'px sans-serif;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.35)">'+html+'</div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-(size/2)],className:''});
}
function label(t){var el=document.createElement('div');el.style.direction='rtl';el.style.fontWeight='700';el.textContent=t;return el;}
var layer=L.layerGroup().addTo(map),routeLine=null,routeStops=[],pts=[],fitted=false;
var driverMarker=null,curPos=null,animFrame=null,startPos=null,endPos=null,animStart=0,ANIM_MS=4800,followDriver=false;
if(D.driver){curPos=[D.driver.lat,D.driver.lng];driverMarker=L.marker(curPos,{icon:pin('🛵',44,'#FF6B00'),zIndexOffset:1000}).addTo(map).bindPopup(label('موقعك الحالي'));}
function drawRoute(){
  var r=(curPos?[curPos]:[]).concat(routeStops);
  if(routeLine){routeLine.setLatLngs(r.length>1?r:[]);}
  else if(r.length>1){routeLine=L.polyline(r,{color:'#FF6B00',weight:4,dashArray:'10 6',opacity:0.75}).addTo(layer);}
}
function fitAll(){var all=pts.slice(); if(curPos) all.push(curPos); if(all.length>1) map.fitBounds(all,{padding:[46,46]}); else if(all.length) map.setView(all[0],15);}
function render(data){
  layer.clearLayers(); routeLine=null; pts=[]; routeStops=[];
  (data.stops||[]).forEach(function(s){
    var ll=[s.lat,s.lng];
    var bg=s.picked?'#1DB954':(s.next?'#FF6B00':'#8A8FA3');
    L.marker(ll,{icon:pin(s.picked?'✓':String(s.n),s.next?44:36,bg),zIndexOffset:s.next?500:0}).addTo(layer).bindPopup(label(s.n+'. '+s.name+(s.picked?' — تم الاستلام':'')));
    pts.push(ll); if(!s.picked) routeStops.push(ll);
  });
  if(data.drop){var dl=[data.drop.lat,data.drop.lng];L.marker(dl,{icon:pin('📍',40,'#F04438')}).addTo(layer).bindPopup(label('موقع الزبون'));pts.push(dl);routeStops.push(dl);}
  drawRoute();
  if(!fitted){fitted=true;fitAll();} // الزوم الأول فقط — التحديثات اللاحقة لا تحرّك الخريطة
}
render(D);
map.on('dragstart',function(){followDriver=false;});
function animStep(){
  var t=(Date.now()-animStart)/ANIM_MS; if(t>1)t=1;
  curPos=[startPos[0]+(endPos[0]-startPos[0])*t,startPos[1]+(endPos[1]-startPos[1])*t];
  driverMarker.setLatLng(curPos);
  if(followDriver) map.panTo(curPos,{animate:false});
  if(t<1){animFrame=requestAnimationFrame(animStep);} else {drawRoute();}
}
function moveDriver(lat,lng){
  if(isNaN(lat)||isNaN(lng)) return;
  var ll=[lat,lng];
  if(!driverMarker){driverMarker=L.marker(ll,{icon:pin('🛵',44,'#FF6B00'),zIndexOffset:1000}).addTo(map).bindPopup(label('موقعك الحالي'));curPos=ll;drawRoute();return;}
  startPos=curPos?[curPos[0],curPos[1]]:ll; endPos=ll; animStart=Date.now();
  if(animFrame) cancelAnimationFrame(animFrame);
  animStep();
}
function handleMsg(e){
  try{
    var d=JSON.parse(e.data||e);
    if(d.type==='driver_location'){moveDriver(parseFloat(d.lat),parseFloat(d.lng));}
    else if(d.type==='stops'){render(d.data||{});}
    else if(d.type==='recenter'){followDriver=false; fitAll();}
    else if(d.type==='follow'){followDriver=true; if(curPos) map.setView(curPos,16,{animate:true});}
  }catch(err){}
}
window.addEventListener('message',handleMsg);
document.addEventListener('message',function(e){handleMsg(e.data);});
}
</script>
</body>
</html>`;
}

export default function GroupDeliveryScreen({ route, navigation }) {
  const { groupId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeGroup, setActiveGroup, notifyGroupCancelled, markGroupDone } = useDriver();
  const coords = useDriverCoords();
  const [group, setGroup] = useState(() => (activeGroup && gid(activeGroup.id) === gid(groupId) ? activeGroup : null));
  const [loadError, setLoadError] = useState(false);
  const [busyStop, setBusyStop] = useState(null);
  const [delivering, setDelivering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const webViewRef = useRef(null);
  const groupRef = useRef(group);
  groupRef.current = group;
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const leftRef = useRef(false);
  const deliveredRef = useRef(false);

  useEffect(() => () => { mounted.current = false; }, []);

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('Main');
  }, [navigation]);

  // تغييرات المجموعة من السياق (مطعم اعتذر، حالة محطة...) → تنعكس هنا فوراً
  useEffect(() => {
    if (activeGroup && gid(activeGroup.id) === gid(groupId) && !deliveredRef.current) setGroup(activeGroup);
  }, [activeGroup, groupId]);

  const loadOnce = useCallback(async () => {
    if (!groupId) return null;
    try {
      const r = await api.get(`/orders/groups/${groupId}`);
      const v = r?.data || null;
      if (!mounted.current || !v || leftRef.current) return v;
      setLoadError(false);
      if (v.status === 'cancelled') {
        notifyGroupCancelled(v.id, v.cancelled_by, v.cancel_reason);
        if (navigation.isFocused()) leave();
        return v;
      }
      if (v.status === 'delivered') {
        deliveredRef.current = true;
        setGroup(g => normalizeGroup(v, g));
        markGroupDone(v.id);
        return v;
      }
      if (v.driver_id && user?.id && String(v.driver_id) !== String(user.id)) {
        if (!leftRef.current) Alert.alert('الطلب غير متاح', 'لم يعد هذا الطلب مُسنداً إليك.'); // D-23: مرة واحدة فقط
        setActiveGroup(null);
        leave();
        return v;
      }
      if (v.is_offer) { leave(); return v; } // عرض لم يُقبل — لا مكان له هنا
      const g = normalizeGroup(v, groupRef.current);
      setGroup(g);
      setActiveGroup(g);
      return v;
    } catch (e) {
      if (!mounted.current || leftRef.current) return null;
      setLoadError(true);
      if (e?.status === 403 || e?.status === 404) {
        Alert.alert('الطلب غير متاح', e?.message || 'لم يعد بإمكانك عرض هذا الطلب.');
        setActiveGroup(null);
        leave();
      }
      return null;
    }
  }, [groupId, user?.id, notifyGroupCancelled, markGroupDone, setActiveGroup, leave, navigation]);

  // D-20: تحميل واحد في نفس الوقت — الطلبات المتزامنة تُدمج في تحميل لاحق واحد
  const inflight = useRef(null);
  const pending = useRef(false);
  const loadRef = useRef(null);
  const load = useCallback(() => {
    if (inflight.current) { pending.current = true; return inflight.current; }
    const p = loadOnce().finally(() => {
      inflight.current = null;
      if (pending.current && mounted.current && !leftRef.current) { pending.current = false; loadRef.current && loadRef.current(); }
    });
    inflight.current = p;
    return p;
  }, [loadOnce]);
  loadRef.current = load;

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]));

  // أحداث السوكِت للمجموعة (حالة/محطة/اعتذار مطعم) يعالجها DriverContext ويحدّث activeGroup الذي تعكسه الشاشة
  // — لا نكرر جلب نفس البيانات هنا (كان كل استلام يعمل ~٤ طلبات)
  useSocketEvent('__reconnected', () => load());

  useEffect(() => {
    if (!coords || !webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'driver_location', lat: coords.lat, lng: coords.lng }));
  }, [coords]);

  const stops = group?.stops || [];
  const next = nextStop(group);
  const picked = pickedCount(group);
  const done = group?.status === 'delivered';
  const toCustomer = !done && allPicked(group);
  const cash = num(group?.cash_to_collect);
  const earned = groupEarning(group);
  const drop = group?.dropoff || {};

  // D-04: آخر موقع دائماً من ref (لا موقع قديم)، والخريطة تُبنى مرة واحدة لكل مجموعة
  const coordsRef = useRef(coords);
  if (coords) coordsRef.current = coords;
  const mapKey = stops.map(s => `${s.order_id}:${s.picked ? 1 : 0}:${s.lat},${s.lng}`).join(',') + `|${next ? next.order_id : ''}|${drop.lat},${drop.lng}`;
  const mapDataRef = useRef(null);
  mapDataRef.current = groupMapData(stops, next, drop);
  const mapGroupId = group ? gid(group.id) : '';
  const mapHtml = useMemo(() => (mapGroupId ? buildGroupMapHTML({
    ...mapDataRef.current,
    driver: coordsRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }) : null), [mapGroupId]);
  const mapLoaded = useRef(false);
  const postStops = useCallback(() => {
    if (!webViewRef.current || !mapLoaded.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'stops', data: mapDataRef.current }));
  }, []);
  // تغيّر محطة (استلام/اعتذار مطعم) → تحديث الدبابيس والمسار في مكانها بلا إعادة تحميل
  useEffect(() => { postStops(); }, [mapKey, postStops]);

  // ── الاستلام من مطعم ──
  const doPickup = async (stop) => {
    if (busyRef.current || !group) return;
    busyRef.current = true;
    setBusyStop(stop.order_id);
    try {
      const r = await api.post(`/orders/groups/${group.id}/pickup`, { order_id: stop.order_id });
      const d = r?.data || {};
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const nextG = {
        ...groupRef.current,
        status: d.status || groupRef.current.status,
        picked_count: d.picked_count ?? groupRef.current.picked_count,
        stops: groupRef.current.stops.map(s => (gid(s.order_id) === gid(stop.order_id) ? { ...s, picked: true, status: 'on_the_way' } : s)),
      };
      setGroup(nextG);
      setActiveGroup(nextG);
      if (d.all_picked) {
        Alert.alert('استلمت كل الطلبات ✅', `توجّه الآن إلى الزبون${num(nextG.cash_to_collect) > 0 ? ` وحصّل ${money(nextG.cash_to_collect)}` : ''}.`);
      } else if (d.next_stop) {
        showToast(`تم الاستلام من ${stop.name} — التالي: ${d.next_stop.name || 'المطعم التالي'}`, { tone: 'success', icon: 'bag-check' });
      }
      // لا تحميل إضافي هنا (D-20): أحداث السيرفر تحدّث المجموعة عبر DriverContext
    } catch (e) {
      Alert.alert('تعذّر تأكيد الاستلام', e?.message || 'حاول مرة أخرى');
      load();
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusyStop(null);
    }
  };

  const onPickupPress = (stop) => {
    if (busyRef.current) return;
    if (stop.status !== 'ready') {
      Alert.alert('الطلب لسا قيد التحضير', `${stop.name} لم يعلن أن الطلب جاهز بعد. متأكد إنك استلمته؟`, [
        { text: 'لا', style: 'cancel' },
        { text: 'نعم، استلمته', onPress: () => doPickup(stop) },
      ]);
      return;
    }
    doPickup(stop);
  };

  // ── التسليم للزبون (مرة واحدة للمجموعة) ──
  const doDeliver = async () => {
    if (busyRef.current || !group) return;
    busyRef.current = true;
    setDelivering(true);
    try {
      const r = await api.post(`/orders/groups/${group.id}/deliver`);
      const d = r?.data || {};
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      deliveredRef.current = true;
      setGroup(g => ({ ...g, status: 'delivered' }));
      markGroupDone(group.id);
      setCelebrate(true);
      const amount = d.driver_earning != null ? num(d.driver_earning) : earned;
      Alert.alert('رائع! 🎉', `تم تسليم الطلب المجمّع بنجاح\nأُضيف أجرك ${money(amount)} لمحفظتك`, [
        { text: 'حسناً', onPress: leave },
      ], { cancelable: false });
    } catch (e) {
      Alert.alert('تعذّر التسليم', e?.message || 'حاول مرة أخرى');
      load();
    } finally {
      busyRef.current = false;
      if (mounted.current) setDelivering(false);
    }
  };

  const onDeliverPress = () => {
    if (busyRef.current) return;
    if (cash > 0) {
      Alert.alert('تأكيد التحصيل', `هل استلمت ${money(cash)} من الزبون؟`, [
        { text: 'ليس بعد', style: 'cancel' },
        { text: 'نعم، استلمت', onPress: doDeliver },
      ]);
      return;
    }
    doDeliver();
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const target = toCustomer || !next ? { lat: drop.lat, lng: drop.lng, label: 'الزبون' } : { lat: next.lat, lng: next.lng, label: next.name };

  return (
    <View style={styles.container}>
      <GradientHeader
        title={group ? `طلب مجمّع #${groupNo(group)}` : 'طلب مجمّع'}
        subtitle={group ? `${arCount(stops.length, 'restaurant')} • سائق واحد` : undefined}
        rightIcon={group ? 'refresh' : undefined}
        onRightPress={onRefresh}
        rightLabel="تحديث الطلب"
      />

      {/* الخريطة */}
      <View style={[styles.mapShell, SHADOW.card]}>
        <View style={styles.mapWrap}>
          {group && mapHtml ? (
            <WebView
              ref={webViewRef}
              source={{ html: mapHtml, baseUrl: SERVER_URL }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              mixedContentMode="always"
              onMessage={() => {}}
              onLoadEnd={() => {
                mapLoaded.current = true;
                postStops(); // ما تغيّر بين بناء الخريطة واكتمال تحميلها
                const c = coordsRef.current;
                if (c) webViewRef.current?.postMessage(JSON.stringify({ type: 'driver_location', lat: c.lat, lng: c.lng }));
              }}
            />
          ) : <Skeleton height="100%" radius={0} />}
          <LinearGradient colors={['rgba(20,20,43,0.28)', 'rgba(20,20,43,0)']} style={styles.mapScrim} pointerEvents="none" />
          {toCustomer && (
            <View style={styles.liveBadge} accessibilityLabel="تتبّع مباشر">
              <Pulse to={1.6} duration={700}><View style={styles.liveDot} /></Pulse>
              <Text style={styles.liveText}>مباشر</Text>
            </View>
          )}
          <Press style={styles.recenterBtn} onPress={() => webViewRef.current?.postMessage(JSON.stringify({ type: 'recenter' }))} accessibilityLabel="عرض كل المحطات على الخريطة">
            <Ionicons name="scan" size={20} color={COLORS.primary} />
          </Press>
          {group && !done && (
            <Press style={[styles.navBtn, SHADOW.float]} onPress={() => openNavigation(target.lat, target.lng, target.label)} hapticStyle="medium"
              accessibilityLabel={`ملاحة إلى ${target.label}`}>
              <LinearGradient colors={GRADIENTS.sunset} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.navBtnGrad}>
                <Ionicons name="navigate" size={17} color="#FFF" />
                <Text style={styles.navBtnText} numberOfLines={1}>{toCustomer || !next ? 'ملاحة للزبون' : `ملاحة إلى ${next.name}`}</Text>
              </LinearGradient>
            </Press>
          )}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}>
        {!group ? (
          loadError ? (
            <EmptyState icon="cloud-offline-outline" tone="red" title="تعذّر تحميل الطلب" text="تحقّق من الاتصال بالإنترنت ثم أعد المحاولة" actionLabel="إعادة المحاولة" actionIcon="refresh" onAction={load} />
          ) : (<><SkeletonCard lines={2} /><SkeletonCard lines={4} /><SkeletonCard lines={3} /></>)
        ) : (
          <>
            {!done && <FadeIn><CashBadge order={group} /></FadeIn>}

            {/* التقدّم */}
            <FadeIn delay={40}>
              <View style={[styles.card, SHADOW.soft]}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text style={styles.cardTitle}>{done ? 'اكتمل الطلب' : toCustomer ? 'في الطريق للزبون' : 'جمع الطلبات'}</Text>
                  <View style={[styles.row, styles.countChip]}>
                    <Ionicons name="bag-check" size={14} color={COLORS.greenDeep} />
                    <Text style={styles.countText}>استلمت {picked} من {stops.length}</Text>
                  </View>
                </View>
                <View style={[styles.row, styles.segments]}>
                  {stops.map(s => (
                    <View key={String(s.order_id)} style={[styles.segment, s.picked && styles.segmentDone, next && gid(next.order_id) === gid(s.order_id) && !s.picked && styles.segmentNext]} />
                  ))}
                  <View style={[styles.segment, styles.segmentDrop, done && styles.segmentDone, toCustomer && styles.segmentNext]} />
                </View>
                <Text style={[styles.hint, RTL.text, toCustomer && { color: COLORS.greenDeep }]}>
                  {done ? 'تم تسليم الطلب للزبون ✓'
                    : toCustomer ? 'استلمت كل الطلبات — توجّه الآن لموقع الزبون'
                      : next ? `المحطة التالية المقترحة: ${next.name} (يمكنك الاستلام بأي ترتيب حسب الجاهزية)` : 'توجّه للمطاعم لاستلام الطلبات'}
                </Text>
              </View>
            </FadeIn>

            {/* المحطات */}
            {stops.map((s, i) => (
              <FadeIn key={String(s.order_id)} delay={Math.min(i, 6) * 50 + 80}>
                <StopCard
                  stop={s}
                  index={i}
                  isNext={!!next && gid(next.order_id) === gid(s.order_id)}
                  child={(group.orders || []).find(o => gid(o.order_id ?? o.id) === gid(s.order_id))}
                  coords={coords}
                  busy={busyStop != null && gid(busyStop) === gid(s.order_id)}
                  disabled={busyStop != null || delivering || done}
                  onPickup={() => onPickupPress(s)}
                />
              </FadeIn>
            ))}

            {/* الزبون */}
            <FadeIn delay={200}>
              <View style={[styles.card, SHADOW.soft, toCustomer && styles.cardHot]}>
                <View style={[styles.row, { gap: 12 }]}>
                  <View style={[styles.dropIcon, toCustomer && { backgroundColor: COLORS.red }]}>
                    <Ionicons name="location" size={20} color={toCustomer ? '#FFF' : COLORS.red} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stopLabel, RTL.text]}>التسليم للزبون{coords && drop.lat ? ` · ${km(haversineKm(coords.lat, coords.lng, drop.lat, drop.lng))} منك` : ''}</Text>
                    <Text style={[styles.stopName, RTL.text]} numberOfLines={1}>{group.customer_name || 'الزبون'}</Text>
                    <Text style={[styles.stopAddr, RTL.text]} numberOfLines={2}>{drop.address || group.delivery_address || 'محدّد على الخريطة'}</Text>
                  </View>
                </View>
                {!!group.notes && (
                  <View style={[styles.row, styles.noteBox]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color={COLORS.sub} />
                    <Text style={[styles.noteText, RTL.text]}>{group.notes}</Text>
                  </View>
                )}
                {!done && (
                  <View style={[styles.row, styles.stopActions]}>
                    <SmallBtn icon="call" tone="green" label="اتصل بالزبون" onPress={() => callPhone(group.customer_phone)} />
                    <SmallBtn icon="navigate" tone="brand" label="ملاحة" onPress={() => openNavigation(drop.lat, drop.lng, 'الزبون')} />
                  </View>
                )}
              </View>
            </FadeIn>

            {/* المال */}
            <FadeIn delay={260}>
              <View style={[styles.card, SHADOW.soft]}>
                <Text style={[styles.cardTitle, RTL.text, { marginBottom: 6 }]}>الحساب</Text>
                <MoneyRow icon="bicycle-outline" label={`أجرة التوصيل (${arCount(stops.length, 'stop')})`} value={money(group.driver_fee)} />
                {num(group.tip) > 0 && <MoneyRow icon="heart-outline" label={TERMS.tip} value={money(group.tip)} color={COLORS.brandDeep} />}
                <MoneyRow icon="wallet-outline" label="أرباحك" value={money(earned)} color={COLORS.greenDeep} strong last={cash <= 0} />
                {cash > 0 && <MoneyRow icon="cash-outline" label="إجمالي التحصيل من الزبون" value={money(cash)} color={COLORS.amberDeep} strong last />}
              </View>
            </FadeIn>
          </>
        )}
      </ScrollView>

      {group && !done && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12 }]}>
          {toCustomer ? (
            <>
              {cash > 0 && (
                <View style={[styles.row, styles.footerCash]}>
                  <Ionicons name="cash" size={16} color={COLORS.amberDeep} />
                  <Text style={[styles.footerCashText, RTL.text]}>حصّل {money(cash)} من الزبون قبل التأكيد</Text>
                </View>
              )}
              <GradientButton label="تم التسليم للزبون" icon="checkmark-circle" onPress={onDeliverPress} loading={delivering}
                loadingLabel="جاري التأكيد..." colors={GRADIENTS.green} shadow={SHADOW.green} height={62} hapticStyle="medium" />
            </>
          ) : next ? (
            // D-05: الزر الثابت = تأكيد الاستلام من المحطة التالية (الملاحة موجودة على الخريطة وفي البطاقة)
            <GradientButton
              label={`استلمت من ${next.name}`}
              icon="bag-check"
              onPress={() => onPickupPress(next)}
              loading={busyStop != null && gid(busyStop) === gid(next.order_id)}
              loadingLabel="جاري التأكيد..."
              disabled={busyStop != null || delivering}
              colors={next.status === 'ready' ? GRADIENTS.green : GRADIENTS.sunset}
              shadow={next.status === 'ready' ? SHADOW.green : SHADOW.float}
              height={58}
              hapticStyle="medium"
              accessibilityLabel={`تأكيد الاستلام من ${next.name}`}
            />
          ) : null}
        </View>
      )}

      {group && done && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12 }]}>
          <PopIn>
            <LinearGradient colors={GRADIENTS.green} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.row, styles.doneBox]}>
              <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.doneSheen} pointerEvents="none" />
              <View style={styles.doneIcon}><Ionicons name="checkmark-done" size={26} color={COLORS.green} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.doneText, RTL.text]}>تم التوصيل بنجاح!</Text>
                <Text style={[styles.doneSubText, RTL.text]}>أُضيف {money(earned)} لمحفظتك</Text>
              </View>
            </LinearGradient>
          </PopIn>
        </View>
      )}

      <Burst play={celebrate} />
    </View>
  );
}

// بطاقة محطة (مطعم): الحالة، الأصناف، اتصال/ملاحة، "استلمت من هالمطعم"
function StopCard({ stop, index, isNext, child, coords, busy, disabled, onPickup }) {
  const [expanded, setExpanded] = useState(false);
  const st = stopState(stop);
  const tone = TONE[st.tone] || TONE.gray;
  const items = child ? parseItems(child) : [];
  const count = stop.items_count != null ? stop.items_count : items.reduce((s, it) => s + it.qty, 0);
  const dist = coords && stop.lat ? haversineKm(coords.lat, coords.lng, stop.lat, stop.lng) : null;
  // D-06: كل الأصناف قابلة للعرض (+N يوسّع) مع الإضافات والملاحظات — ليراجع السائق الكيس كاملاً
  const shown = expanded ? items : items.slice(0, 4);
  const hidden = items.length - shown.length;
  return (
    <View style={[styles.card, SHADOW.soft, isNext && styles.cardHot, stop.picked && styles.cardDone]}>
      <View style={[styles.row, { gap: 12, alignItems: 'flex-start' }]}>
        {stop.picked ? (
          <View style={[styles.num, { backgroundColor: COLORS.green }]}><Ionicons name="checkmark" size={18} color="#FFF" /></View>
        ) : isNext ? (
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.num, SHADOW.glow]}>
            <Text style={styles.numText}>{index + 1}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.num, styles.numTodo]}><Text style={[styles.numText, { color: COLORS.sub }]}>{index + 1}</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.stopLabel, RTL.text]}>
            {isNext ? 'المحطة التالية' : `المحطة ${index + 1}`}{dist != null ? ` · ${km(dist)} منك` : ''}
          </Text>
          <Text style={[styles.stopName, RTL.text]} numberOfLines={1}>{stop.name}</Text>
          {!!stop.address && <Text style={[styles.stopAddr, RTL.text]} numberOfLines={1}>{stop.address}</Text>}
        </View>
        <View style={[styles.row, styles.stateChip, { backgroundColor: tone.bg }]}>
          <Ionicons name={st.icon} size={12} color={tone.c} />
          <Text style={[styles.stateText, { color: tone.c }]}>{st.label}</Text>
        </View>
      </View>

      <View style={[styles.row, styles.metaRow]}>
        <Ionicons name="receipt-outline" size={14} color={COLORS.gray} />
        <Text style={styles.metaText}>#{stop.order_number || stop.order_id}{count ? ` · ${arCount(count, 'piece')}` : ''}</Text>
      </View>

      {!stop.picked && shown.length > 0 && (
        <View style={styles.itemsBox}>
          {shown.map(it => (
            <View key={it.key}>
              <Text style={[styles.itemLine, RTL.text]} numberOfLines={2}>
                {it.qty} × {it.name}{it.options.length ? ` (${it.options.join('، ')})` : ''}
              </Text>
              {!!it.notes && (
                <View style={[styles.row, { gap: 4, marginTop: 1 }]}>
                  <Ionicons name="create-outline" size={12} color={COLORS.amberDeep} />
                  <Text style={[styles.itemNote, RTL.text]} numberOfLines={2}>{it.notes}</Text>
                </View>
              )}
            </View>
          ))}
          {(hidden > 0 || expanded) && items.length > 4 && (
            <Press onPress={() => setExpanded(e => !e)} hapticStyle="select" style={styles.itemMoreBtn} hitSlop={8}
              accessibilityLabel={expanded ? 'عرض أصناف أقل' : `عرض كل الأصناف، ${arCount(hidden, 'item')} مخفية`} accessibilityState={{ expanded }}>
              <View style={[styles.row, { gap: 4, justifyContent: 'center' }]}>
                <Text style={styles.itemMore}>{expanded ? 'عرض أقل' : `عرض كل الأصناف (+${hidden})`}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primary} />
              </View>
            </Press>
          )}
        </View>
      )}

      {!stop.picked && (
        <>
          <View style={[styles.row, styles.stopActions]}>
            <SmallBtn icon="call" tone="green" label="اتصل بالمطعم" onPress={() => callPhone(stop.phone)} />
            <SmallBtn icon="navigate" tone="brand" label="ملاحة" onPress={() => openNavigation(stop.lat, stop.lng, stop.name)} />
          </View>
          <GradientButton
            label="استلمت من هالمطعم"
            icon="bag-check"
            onPress={onPickup}
            loading={busy}
            loadingLabel="جاري التأكيد..."
            disabled={disabled && !busy}
            colors={stop.status === 'ready' ? GRADIENTS.green : GRADIENTS.sunset}
            shadow={stop.status === 'ready' ? SHADOW.green : SHADOW.float}
            height={52}
            style={{ marginTop: 10 }}
            accessibilityLabel={`تأكيد الاستلام من ${stop.name}`}
          />
        </>
      )}
    </View>
  );
}

const BTN_TONES = {
  green: { bg: COLORS.greenSoft, c: COLORS.greenDeep },
  brand: { bg: COLORS.sec, c: COLORS.primary },
};
function SmallBtn({ icon, label, onPress, tone = 'brand' }) {
  const t = BTN_TONES[tone] || BTN_TONES.brand;
  return (
    <Press style={[styles.smallBtn, { backgroundColor: t.bg }]} onPress={onPress} hapticStyle="light" accessibilityLabel={label}>
      <View style={[styles.row, { gap: 6, justifyContent: 'center' }]}>
        <Ionicons name={icon} size={17} color={t.c} />
        <Text style={[styles.smallBtnText, { color: t.c }]} numberOfLines={1}>{label}</Text>
      </View>
    </Press>
  );
}

function MoneyRow({ icon, label, value, color, strong, last }) {
  return (
    <View style={[styles.row, styles.mRow, !last && styles.mLine]}>
      <View style={[styles.row, { gap: 10, flex: 1 }]}>
        <View style={styles.mIcon}><Ionicons name={icon} size={15} color={color || COLORS.sub} /></View>
        <Text style={[styles.mLabel, RTL.text]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.mValue, color && { color }, strong && { fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: ROW, alignItems: 'center' },
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapShell: { height: 240, marginTop: 12, marginHorizontal: 14, borderRadius: RADIUS.lg, backgroundColor: COLORS.card },
  mapWrap: { flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.skeleton, borderWidth: 1, borderColor: COLORS.line },
  map: { flex: 1 },
  mapScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 56 },
  liveBadge: { position: 'absolute', top: 10, right: 10, flexDirection: ROW, alignItems: 'center', gap: 6, backgroundColor: COLORS.red, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 5, zIndex: 10, ...SHADOW.soft },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  recenterBtn: { position: 'absolute', top: 10, left: 56, width: 46, height: 46, backgroundColor: '#FFF', borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', zIndex: 10, ...SHADOW.card },
  navBtn: { position: 'absolute', bottom: 12, right: 12, maxWidth: '75%', borderRadius: RADIUS.pill, zIndex: 10, backgroundColor: COLORS.primary },
  navBtnGrad: { flexDirection: ROW, alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 16, borderRadius: RADIUS.pill },
  navBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13.5, flexShrink: 1 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 16 },
  cardHot: { borderWidth: 1.5, borderColor: COLORS.tintLine },
  cardDone: { opacity: 0.85 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  countChip: { gap: 5, backgroundColor: COLORS.greenSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  countText: { color: COLORS.greenDeep, fontWeight: '800', fontSize: 12 },
  segments: { gap: 6, marginTop: 14 },
  segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.line },
  segmentDone: { backgroundColor: COLORS.green },
  segmentNext: { backgroundColor: COLORS.primary },
  segmentDrop: { flex: 0.7 },
  hint: { marginTop: 10, fontSize: 13, color: COLORS.primary, fontWeight: '700', lineHeight: 19 },
  num: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  numTodo: { backgroundColor: COLORS.inputBg, borderWidth: 1.5, borderColor: COLORS.line },
  numText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  stopLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '700' },
  stopName: { fontSize: 16, color: COLORS.text, fontWeight: '900', marginTop: 2 },
  stopAddr: { fontSize: 12.5, color: COLORS.sub, fontWeight: '500', marginTop: 2 },
  stateChip: { gap: 4, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 },
  stateText: { fontSize: 11.5, fontWeight: '800' },
  metaRow: { gap: 6, marginTop: 10 },
  metaText: { fontSize: 12.5, color: COLORS.gray, fontWeight: '700' },
  itemsBox: { marginTop: 10, backgroundColor: COLORS.inputBg, borderRadius: RADIUS.xs, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  itemLine: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  itemMore: { fontSize: 12.5, color: COLORS.primary, fontWeight: '800' },
  itemMoreBtn: { marginTop: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.line },
  itemNote: { flex: 1, fontSize: 12, color: COLORS.amberDeep, fontWeight: '600' },
  stopActions: { gap: 8, marginTop: 12 },
  smallBtn: { flex: 1, height: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  smallBtnText: { fontWeight: '800', fontSize: 13 },
  dropIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.redSoft, alignItems: 'center', justifyContent: 'center' },
  noteBox: { gap: 8, marginTop: 10, backgroundColor: COLORS.inputBg, borderRadius: RADIUS.xs, padding: 10, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 13, color: COLORS.sub, fontWeight: '700', lineHeight: 19 },
  mRow: { justifyContent: 'space-between', paddingVertical: 10, gap: 10 },
  mLine: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  mIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  mLabel: { flex: 1, fontSize: 13.5, color: COLORS.sub, fontWeight: '700' },
  mValue: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, ...SHADOW.card },
  footerCash: { gap: 6, alignSelf: 'stretch', backgroundColor: COLORS.amberSoft, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  footerCashText: { flex: 1, color: COLORS.amberDeep, fontWeight: '800', fontSize: 13.5 },
  doneBox: { gap: 14, borderRadius: RADIUS.md + 2, padding: 16, overflow: 'hidden' },
  doneSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  doneIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  doneSubText: { fontSize: 13.5, color: 'rgba(255,255,255,0.95)', marginTop: 3, fontWeight: '700' },
});
