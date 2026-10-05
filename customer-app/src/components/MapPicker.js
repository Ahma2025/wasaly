import React, { useMemo, useRef, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';
import { leafletPage, TILE_URL } from '../utils/leaflet';

const DEFAULT_CENTER = { lat: 31.9, lng: 35.2 };

/*
  خريطة اختيار موقع (Leaflet داخل WebView):
  - الـ HTML يُبنى مرة واحدة فقط (بدون إعادة تحميل مع كل تحريك)
  - التواصل عبر postMessage: setView / markers / pin
  - onCenterChange(center, byUser) — byUser=true فقط لما المستخدم يحرّك الخريطة بنفسه (لا تعبئة تلقائية)
  - onTouchStart/onTouchEnd لقفل تمرير الصفحة أثناء لمس الخريطة
*/
function MapPicker({ initial, onCenterChange, markers, showPin = true, height = 220, onTouchStart, onTouchEnd, style }, ref) {
  const { colors: C, isDark } = useTheme();
  const webRef = useRef(null);
  const readyRef = useRef(false);
  const queue = useRef([]);
  const [initialCenter] = useState(() => (initial && initial.lat ? initial : DEFAULT_CENTER));
  const initialZoom = initial && initial.lat ? 16 : 13;

  const send = (msg) => {
    const s = JSON.stringify(msg);
    if (readyRef.current && webRef.current) webRef.current.postMessage(s);
    else queue.current.push(s);
  };

  useImperativeHandle(ref, () => ({
    setView: (lat, lng, zoom = 16) => send({ type: 'setView', lat, lng, zoom }),
  }));

  // يُبنى مرة واحدة فقط ([] عمداً) — كل التحديثات اللاحقة عبر postMessage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => leafletPage({
    dark: isDark,
    style: `#pin{position:fixed;top:50%;left:50%;transform:translate(-50%,-100%);font-size:36px;z-index:999;pointer-events:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
      .mk{width:30px;height:30px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:15px}`,
    body: `<div id="pin" style="display:${showPin ? 'block' : 'none'}">📍</div>`,
    script: `
    var map=L.map('map',{zoomControl:false}).setView([${initialCenter.lat},${initialCenter.lng}],${initialZoom});
    L.tileLayer('${TILE_URL}',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    var userMove=false, mk={};
    map.on('dragstart',function(){userMove=true;});
    map.getContainer().addEventListener('touchstart',function(){userMove=true;},{passive:true});
    map.on('moveend',function(){var c=map.getCenter();post({type:'center',lat:c.lat,lng:c.lng,user:userMove});userMove=false;});
    function icon(bg,emoji){return L.divIcon({html:'<div class="mk" style="background:'+bg+'">'+emoji+'</div>',iconSize:[30,30],iconAnchor:[15,15],className:''});}
    function setMk(key,p,bg,emoji){
      if(mk[key]){map.removeLayer(mk[key]);mk[key]=null;}
      if(p&&p.lat){mk[key]=L.marker([p.lat,p.lng],{icon:icon(bg,emoji),interactive:false}).addTo(map);}
    }
    function handle(raw){
      try{var d=JSON.parse(raw);
        if(d.type==='setView'){userMove=false;map.setView([d.lat,d.lng],d.zoom||16);}
        else if(d.type==='markers'){setMk('a',d.pickup,'#25C26E','🟢');setMk('b',d.dropoff,'#FF3B30','🏁');}
        else if(d.type==='pin'){document.getElementById('pin').style.display=d.show?'block':'none';}
      }catch(e){}
    }
    window.addEventListener('message',function(e){handle(e.data);});
    document.addEventListener('message',function(e){handle(e.data);});
    `,
  }), []);

  useEffect(() => { if (markers) send({ type: 'markers', ...markers }); },
    [markers?.pickup?.lat, markers?.pickup?.lng, markers?.dropoff?.lat, markers?.dropoff?.lng]);
  useEffect(() => { send({ type: 'pin', show: showPin }); }, [showPin]);

  const onMessage = (e) => {
    let d; try { d = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (d.type === 'map_ready') {
      readyRef.current = true;
      queue.current.splice(0).forEach(s => webRef.current?.postMessage(s));
      if (markers) webRef.current?.postMessage(JSON.stringify({ type: 'markers', ...markers }));
    } else if (d.type === 'center' && onCenterChange) {
      onCenterChange({ lat: d.lat, lng: d.lng }, !!d.user);
    }
  };

  return (
    <View
      style={[styles.wrap, { height, borderColor: C.border, backgroundColor: C.inputBg }, style]}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      accessibilityLabel="خريطة لاختيار الموقع — حرّك الخريطة لوضع الدبوس على موقعك">
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        overScrollMode="never"
        setBuiltInZoomControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
});

export default forwardRef(MapPicker);
