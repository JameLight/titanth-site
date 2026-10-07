'use strict';
const RETIRED_HTML = "<!doctype html>\n<html lang=\"th\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><meta name=\"color-scheme\" content=\"light\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'\"><title>พร้อมแจ้งน้ำท่วม — ยุติการให้บริการแล้ว</title><style>body{margin:0;background:#f3f5f6;color:#172a35;font:18px/1.8 Thonburi,Tahoma,sans-serif}main{max-width:660px;margin:9vh auto;padding:28px}h1{font-size:clamp(28px,5vw,42px);line-height:1.4}a{color:#165879}small{color:#4d606a}nav{display:flex;flex-wrap:wrap;gap:14px;margin:28px 0}nav a{background:#fff;padding:12px 20px;border:1px solid #becdd5;border-radius:8px}footer{margin-top:38px;border-top:1px solid #ccd6db;padding-top:18px}</style></head><body><main><small>พร้อมแจ้งน้ำท่วม · ประกาศ 7 ตุลาคม 2569</small><h1>ยุติการให้บริการแล้ว</h1><p>บริการพร้อมแจ้งน้ำท่วม รวมหน้าทีมอาสา เพื่อนบ้าน สถานะระบบ และข้อมูลน้ำกำแพงเพชร ยุติการให้บริการแล้ว</p><p>หน้านี้ไม่รับแจ้งเหตุ ไม่รับสมัคร ไม่อัปเดตสถานการณ์ และไม่มีทีมรับเรื่องหรือประสานความช่วยเหลือผ่านบริการนี้</p><p>หากต้องการความช่วยเหลือ ให้ติดต่อหน่วยงานโดยตรง:</p><nav aria-label=\"ติดต่อหน่วยงาน\"><a href=\"tel:1784\">ปภ. 1784</a><a href=\"tel:1669\">เจ็บป่วยฉุกเฉิน 1669</a></nav><p><a href=\"https://www.disaster.go.th/\" rel=\"noopener\">กรมป้องกันและบรรเทาสาธารณภัย</a> · <a href=\"https://www.niems.go.th/\" rel=\"noopener\">สถาบันการแพทย์ฉุกเฉินแห่งชาติ</a></p><footer><p>ไม่มีการส่งข้อมูลจากหน้านี้เข้าระบบเดิม ข้อมูลที่เคยเก็บในเครื่องของคุณไม่ได้ถูกลบโดยประกาศนี้</p><a href=\"/\">กลับเว็บไซต์ TITANTH</a></footer></main></body></html>";
const LEGACY_FAMILIES = ['promjaeng-flood-public-v','khem-flood-rescue-pilot-shell-v','khem-flood-rescue-public-v'];
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(n => LEGACY_FAMILIES.some(p => n.startsWith(p))).map(n => caches.delete(n)));
  await self.clients.claim();
  const clients = await self.clients.matchAll({type:'window'});
  for (const client of clients) {
    const url = new URL(client.url);
    if (url.origin === self.location.origin && url.pathname.startsWith('/flood/')) await client.navigate(client.url);
  }
})()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/flood/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(Promise.resolve(new Response(RETIRED_HTML, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
  } else {
    e.respondWith(Promise.resolve(new Response('SERVICE_RETIRED', {status:410,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}})));
  }
});
