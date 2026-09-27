# กระดานช่วยกัน — frontend candidate ที่ตรวจเทียบ SQL v2.7 r6

สถานะ: **ปิดเริ่มต้น และยังไม่เผยแพร่** หน้าเว็บนี้ไม่ใช่คิวฉุกเฉิน ไม่ตรวจตัวตน ไม่มีเจ้าหน้าที่เฝ้า และไม่รับประกันว่ามีใครไปช่วย

การคุยเป็นการดึงข้อมูลซ้ำเมื่อแท็บเปิดอยู่ ไม่มี push notification หรือ SMS ผู้ใช้ต้องกลับมาเช็กเอง จึงห้ามสื่อสารว่าเป็นระบบตอบทันที

หน้า candidate นี้ไม่มีช่องเฉพาะสำหรับข้อมูลสุขภาพหรือเครื่องหมายบุคคลเปราะบาง และส่ง p_vulnerable=false เสมอ แต่ RPC aid_post ฝั่ง SQL v2.7 r6 ยังรับค่า p_vulnerable ได้จาก client อื่น และข้อความอิสระยังรับข้อมูลอ่อนไหวได้ จึงเป็นความเสี่ยงฝั่ง server ที่ต้องแก้/ทบทวนก่อนเปิดรับคนจริง

SQL r8 ที่ Claude กำลังตรวจเป็นคนละ candidate; ยังไม่ยืนยันว่า frontend นี้เข้ากันได้ หรือจะใช้ r6 เปิดจริง ต้องทวนสัญญา API, notice, การยินยอม และผลทดสอบหลังตกลงรุ่นฐานที่จะใช้

## HOLD: โฮสต์ยังไม่ส่ง header ห้ามฝังหน้า

- อ่าน https://titanth.com/flood/ และ /flood-team/ วันที่ 27 ก.ย. 2569 ~07:39 น.ไทย: ตอบจาก server: GitHub.com และไม่มี Content-Security-Policy หรือ X-Frame-Options ใน HTTP response. DNS apex ชี้ IP GitHub Pages โดยตรง
- [CSP Level 3 ของ W3C](https://www.w3.org/TR/CSP/#directive-frame-ancestors) กำหนดว่า frame-ancestors ใน HTML meta ถูก browser เพิกเฉย; จึงเอาคำนี้ออกจาก meta ของหน้า
- หน้าใหม่จะเปิดได้ต่อเมื่อ response HTML ของตัวเองมี Content-Security-Policy: frame-ancestors 'none' หรือ X-Frame-Options: DENY เป็น **HTTP header จริง**; การตรวจนี้เป็น gate เพิ่ม ไม่ใช่ตัวแทน header ฝั่งโฮสต์
- repo นี้ยังไม่มี deployment config ที่พิสูจน์ว่าเพิ่ม header บน GitHub Pages ได้ การใส่ _headers แบบ [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/) ใน repo GitHub Pages นี้ยังไม่ใช่วิธีแก้ที่ตรวจได้ ต้องเลือกโฮสต์/proxy ที่ส่ง header ให้ทั้ง /flood-aid/ และ /flood-aid/privacy/ ได้ แล้วอ่านกลับ response และทดสอบว่า iframe ข้ามโดเมนถูกปฏิเสธก่อนเปิด config

## สัญญาที่ใช้

- SQL sql_v27/aid_board.sql SHA-256 939ab5c2fd50094ac5ca3e5bc63e9e56d6e5db39624761afe734d8fab705f680
- Full SQL candidate SHA-256 7dc997f6f6ec2bb974c02fe4f38c001a2920ef1f1d4e64dc0246b16d71560bc4
- RPC contract sql_v27/AID_RPC_CONTRACT.md ที่ Claude สร้างจาก pg_proc ในฐานทิ้ง เวลา 2026-09-27T00:07Z
- ยังไม่มีหลักฐานว่า SQL นี้อยู่ในฐาน production หรือว่าค่าปิดเปิดจริงตรงกัน

## เปิดใช้ต้องครบ

1. เลือกและอนุมัติ SQL รุ่นที่จะใช้หลัง audit; ทวน frontend ตาม API รุ่นนั้น แล้วตรวจและติดตั้ง SQL; อ่านกลับ RPC, RLS, aid_enabled=0, cron ลบข้อมูล และ owner stop/suspend บนฐานจริงด้วยข้อมูลสมมติ
2. ตรวจประกาศ privacy/index.html กับพฤติกรรมฐานจริงและตัวผู้ดูแลข้อมูล รวมถึงข้อความเกี่ยวกับข้อมูลสุขภาพและระยะลบ; รับการยืนยันจากเจ้าของก่อนเผยแพร่
3. ทดสอบ browser ที่ 320px และมือถือจริง, การสมัคร, ยืนยันอีเมล, การคุย 2 บัญชี, การแชร์ทีละคน, ปิด, รายงาน, ระบบปิด, ถูกระงับ, การกลับจาก offline ด้วยข้อมูลสมมติ
4. ให้โฮสต์ส่ง HTTP anti-frame header จริงและทดสอบ readback/iframe แล้วจึงแก้ aid-config.json: enabled=true, URL ฐานจริง, publishable key เท่านั้น, privacyNoticeVersion เท่ากับ termsVersion, privacyNoticeUrl=/flood-aid/privacy/ และเปิดสวิตช์ฝั่งฐานจริงอย่างเป็นขั้นตอน
5. อ่านกลับ URL production และตรวจว่ากระดานแสดงตามสิทธิ์; แยกหลักฐาน API/UI ออกจากหลักฐานว่ามีคนรับความช่วยเหลือจริง

ห้ามใส่ service key, ข้อมูลจริง หรือรหัสคนจริงใน repo/ทดสอบ หน้าใช้เฉพาะ RPC; session token อยู่ใน sessionStorage ของแท็บนี้ ไม่เก็บข้อมูลโพสต์หรือข้อความลงเครื่อง หน้า render ข้อความจากผู้ใช้ด้วย textContent เท่านั้น และปิดหาก config/notice/RPC ไม่พร้อม

## ทดสอบ

node --test flood-aid/*.test.mjs
node --check flood-aid/aid.js

Tests ของ API และ UI เป็น mock เท่านั้น ไม่ใช่ผลทดสอบบน Supabase จริงหรือมือถือจริง
