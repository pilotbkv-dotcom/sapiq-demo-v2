/* Sapiq r39: offline shell + opt-in Web Push. No hidden quote polling.
   The backend is responsible for event verification, filtering and rate limiting. */
'use strict';
const VERSION='sapiq-r41-gh-pages-v1';
const APP_SHELL=['./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(APP_SHELL)));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sapiq-')&&k!==VERSION).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  // Real-time API endpoints must NEVER be cached by the PWA.
  if(url.pathname.includes('/api/'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{
      if(res.ok){const copy=res.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put('./index.html',copy)))}
      return res;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
const SHORT={ru:{prefix:'Sapiq · Уведомление',demo:'Тест push · без реальных котировок'},en:{prefix:'Sapiq · Alert',demo:'Test push · no live quotes'},es:{prefix:'Sapiq · Aviso',demo:'Push de prueba · sin cotizaciones reales'},zh:{prefix:'Sapiq · 通知',demo:'测试推送 · 非实时行情'}};
function safeRoute(route,language){
  const l=['ru','en','es','zh'].includes(language)?language:'ru';
  const base=l==='en'?'':'/'+l;
  // Only permit safe, bundled Sapiq terminal destinations. Never use external URLs from a push payload.
  const isLimit=typeof route==='string' && /^(?:\/)?(?:ru|en|es|zh)?\/?terminal\/limits\.html$/.test(route);
  return './index.html#'+base+(isLimit?'/terminal/limits.html':'/terminal/index.html');
}
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch{}
  const lang=['ru','en','es','zh'].includes(data.lang)?data.lang:'ru';
  const title=String(data.title||SHORT[lang].prefix).slice(0,90);
  const body=String(data.body||(data.kind==='test'?SHORT[lang].demo:'Sapiq · Check your terminal')).slice(0,220);
  const url=safeRoute(data.route,lang);
  const tag='sapiq-'+String(data.tag||data.kind||'alert').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);
  // Safari requires user-visible notification for every received push.
  event.waitUntil(self.registration.showNotification(title,{
    body,tag,renotify:false,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',
    data:{url,kind:String(data.kind||'alert')} // OS controls sound, vibration and Focus mode
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'./index.html#/ru/terminal/index.html';
  event.waitUntil((async()=>{
    const url=new URL(target,self.registration.scope);
    if(url.origin!==self.location.origin)return;
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin===url.origin){
        try{await client.navigate(url.href);await client.focus();return}catch{}
      }
    }
    return clients.openWindow(url.href);
  })());
});
