// صفحة Leaflet موحّدة لكل الخرائط داخل WebView:
// - تحميل المكتبة من أكثر من CDN (احتياط لو واحد وقع)
// - رسالة واضحة بالعربي لو فشل التحميل بدل شاشة فاضية
// - كود الخريطة يشتغل داخل boot() بعد ما تتحمّل المكتبة
const CDNS = [
  { css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' },
  { css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' },
  { css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' },
];

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function leafletPage({ style = '', body = '', script = '', dark = false }) {
  const bg = dark ? '#1b1b24' : '#e8e0d8';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:${bg}}
#mapErr{display:none;position:fixed;inset:0;align-items:center;justify-content:center;flex-direction:column;gap:8px;font-family:system-ui;direction:rtl;text-align:center;color:${dark ? '#c9cbd6' : '#555'};font-size:14px;font-weight:600;padding:20px;background:${bg};z-index:9999}
${dark ? '.leaflet-tile-pane{filter:brightness(.72) contrast(1.1) saturate(.8)}' : ''}
${style}
</style>
</head><body>
<div id="map"></div>
<div id="mapErr"><div style="font-size:34px">🗺️</div><div>تعذّر تحميل الخريطة</div><div style="font-size:12px;opacity:.8">تأكد من الإنترنت — باقي تفاصيل الطلب تعمل بشكل طبيعي</div></div>
${body}
<script>
var CDNS=${JSON.stringify(CDNS)};
function post(o){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}
function showErr(){document.getElementById('mapErr').style.display='flex';post({type:'map_error'});}
function boot(){
  try{
${script}
    post({type:'map_ready'});
  }catch(e){showErr();}
}
function load(i){
  if(i>=CDNS.length){showErr();return;}
  var l=document.createElement('link');l.rel='stylesheet';l.href=CDNS[i].css;document.head.appendChild(l);
  var s=document.createElement('script');s.src=CDNS[i].js;
  var done=false;
  var t=setTimeout(function(){if(!done){done=true;load(i+1);}},9000);
  s.onload=function(){if(done)return;done=true;clearTimeout(t);if(window.L){boot();}else{load(i+1);}};
  s.onerror=function(){if(done)return;done=true;clearTimeout(t);load(i+1);};
  document.head.appendChild(s);
}
load(0);
</script>
</body></html>`;
}
