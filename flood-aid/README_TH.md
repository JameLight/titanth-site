# กระดานช่วยกัน — frontend candidate; ตรวจประกาศกับ SQL v2.7 snapshot รุ่น v2.6 r12 + กระดาน r9

สถานะ: **ปิดเริ่มต้น และยังไม่เผยแพร่** หน้าเว็บนี้ไม่ใช่คิวฉุกเฉิน ไม่ตรวจตัวตน ไม่มีเจ้าหน้าที่เฝ้า และไม่รับประกันว่ามีใครไปช่วย

การคุยเป็นการดึงข้อมูลซ้ำเมื่อแท็บเปิดอยู่ ไม่มี push notification หรือ SMS ผู้ใช้ต้องกลับมาเช็กเอง จึงห้ามสื่อสารว่าเป็นระบบตอบทันที

หน้า candidate นี้ไม่มีช่องเฉพาะสำหรับข้อมูลสุขภาพหรือเครื่องหมายบุคคลเปราะบาง และส่ง `p_vulnerable=false` เสมอ SQL กระดาน r9 ที่อ่านใน snapshot นี้มี `sensitive_consent_version` และ `sensitive_consent_at` เมื่อ client อื่นส่งธงพร้อมรุ่นความยินยอมปัจจุบัน บันทึกรุ่น/เวลาไม่ได้พิสูจน์ว่าผู้ใช้ติ๊กเอง ข้อความอิสระและแชตยังอาจมีข้อมูลอ่อนไหวโดยไม่มี consent trail เรื่องสุขภาพ จึงต้องทบทวนก่อนเปิดรับคนจริง

SQL ที่ใช้ตรวจข้อความประกาศรอบนี้เป็น **snapshot ที่ยังเปลี่ยนได้**: `sql_v27/supabase_setup_v27_candidate.sql` SHA-256 `f077cf4dbcc3689964782ce2d908a358935f13ed235ce68f8d28ed1b2b2adcce` ซึ่งประกอบจาก v2.6 รุ่นแก้ 12 กับกระดาน r9; aid SQL แยก SHA-256 `14bafaa1ffa79d6fbe6429392ffb98f4fbacfb44e747c0071ee7d57623ee6633`. หน้าเว็บสร้างต้นแบบจาก r6 และยังต้องตรวจสัญญา API/ประกาศกับ **รุ่นที่จะติดตั้งจริง** อีกครั้ง. ผลฐานทิ้งและ emulator ก่อนหน้านี้ไม่ยืนยัน PostgREST, มือถือจริง หรือการเปิดใช้งาน. SQL r12/r13 กำลังถูกตรวจเพิ่มเติม; ไม่มีรุ่นใหม่นี้บนฐาน production ณ การอ่านกลับล่าสุด 27 ก.ย. 10:10 น.ไทย

รายงานจากผู้ใช้ทำได้ใน SQL ฉบับร่าง แต่ยังไม่มีผู้รับผิดชอบเฝ้าหรือตอบรายงานที่ยืนยันได้ โพสต์ถูกติดป้ายเตือนเมื่อมีรายงานครบเกณฑ์ ไม่ซ่อนอัตโนมัติ. ต้องกำหนดคนและช่องทางดูแลจริงก่อนเปิดกระดาน

## HOLD: โฮสต์ยังไม่ส่ง header ห้ามฝังหน้า

- อ่าน https://titanth.com/flood/ และ /flood-team/ วันที่ 27 ก.ย. 2569 ~07:39 น.ไทย: ตอบจาก server: GitHub.com และไม่มี Content-Security-Policy หรือ X-Frame-Options ใน HTTP response. DNS apex ชี้ IP GitHub Pages โดยตรง
- [CSP Level 3 ของ W3C](https://www.w3.org/TR/CSP/#directive-frame-ancestors) กำหนดว่า frame-ancestors ใน HTML meta ถูก browser เพิกเฉย; จึงเอาคำนี้ออกจาก meta ของหน้า
- หน้าใหม่จะเปิดได้ต่อเมื่อ response HTML ของตัวเองมี Content-Security-Policy: frame-ancestors 'none' หรือ X-Frame-Options: DENY เป็น **HTTP header จริง**; การตรวจนี้เป็น gate เพิ่ม ไม่ใช่ตัวแทน header ฝั่งโฮสต์
- repo นี้ยังไม่มี deployment config ที่พิสูจน์ว่าเพิ่ม header บน GitHub Pages ได้ การใส่ _headers แบบ [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/) ใน repo GitHub Pages นี้ยังไม่ใช่วิธีแก้ที่ตรวจได้ ต้องเลือกโฮสต์/proxy ที่ส่ง header ให้ทั้ง /flood-aid/ และ /flood-aid/privacy/ ได้ แล้วอ่านกลับ response และทดสอบว่า iframe ข้ามโดเมนถูกปฏิเสธก่อนเปิด config

## สัญญาที่ใช้

- Frontend เดิมเริ่มจาก SQL กระดาน r6: `aid_board.sql` SHA-256 `939ab5c2fd50094ac5ca3e5bc63e9e56d6e5db39624761afe734d8fab705f680`; ไม่ใช่สัญญาที่จะใช้เปิดจริง
- Snapshot ที่ทวน notice: SQL v2.7 SHA-256 `f077cf4dbcc3689964782ce2d908a358935f13ed235ce68f8d28ed1b2b2adcce` (v2.6 r12 + aid r9); ต้องตรวจ hash ใหม่หาก Claude แก้ source
- ค่ารุ่นข้อตกลงในหน้าเป็น `aid-terms-v1-20260927` แต่ข้อความเปลี่ยนจากร่าง r6 ต้องตัดสินรุ่นใหม่และตั้ง SQL, `aid-config.json`, หน้า notice ให้ตรงกันก่อนเปิดจริง; config ปัจจุบันยัง `enabled:false`
- ฐานจริงล่าสุดที่อ่านกลับยังไม่มี RPC/สวิตช์ของ SQL นี้; snapshot และไฟล์ notice ไม่ใช่การติดตั้งหรืออนุมัติทางกฎหมาย

## เปิดใช้ต้องครบ

1. เลือกและอนุมัติ SQL รุ่นที่จะใช้หลัง audit; ทวน frontend ตาม API รุ่นนั้น แล้วตรวจและติดตั้ง SQL; อ่านกลับ RPC, RLS, aid_enabled=0, cron ลบข้อมูล และ owner stop/suspend บนฐานจริงด้วยข้อมูลสมมติ
2. ตรวจประกาศ privacy/index.html กับพฤติกรรมฐานจริงและตัวผู้ดูแลข้อมูล รวมถึงข้อความเกี่ยวกับข้อมูลสุขภาพ ระยะลบ และผู้เฝ้ารายงาน; ตั้งรุ่นข้อตกลงใหม่พร้อมกันทุกจุดถ้าอนุมัติข้อความใหม่ แล้วให้ผู้รู้กฎหมายตรวจส่วนที่จำเป็นก่อนเปิดรับข้อมูลจริง
3. ทดสอบ browser ที่ 320px และมือถือจริง, การสมัคร, ยืนยันอีเมล, การคุย 2 บัญชี, การแชร์ทีละคน, ปิด, รายงาน, ระบบปิด, ถูกระงับ, การกลับจาก offline ด้วยข้อมูลสมมติ
4. ให้โฮสต์ส่ง HTTP anti-frame header จริงและทดสอบ readback/iframe แล้วจึงแก้ aid-config.json: enabled=true, URL ฐานจริง, publishable key เท่านั้น, privacyNoticeVersion เท่ากับ termsVersion, privacyNoticeUrl=/flood-aid/privacy/ และเปิดสวิตช์ฝั่งฐานจริงอย่างเป็นขั้นตอน
5. อ่านกลับ URL production และตรวจว่ากระดานแสดงตามสิทธิ์; แยกหลักฐาน API/UI ออกจากหลักฐานว่ามีคนรับความช่วยเหลือจริง

ห้ามใส่ service key, ข้อมูลจริง หรือรหัสคนจริงใน repo/ทดสอบ หน้าใช้เฉพาะ RPC; session token อยู่ใน sessionStorage ของแท็บนี้ ไม่เก็บข้อมูลโพสต์หรือข้อความลงเครื่อง หน้า render ข้อความจากผู้ใช้ด้วย textContent เท่านั้น และปิดหาก config/notice/RPC ไม่พร้อม

## ทดสอบ

node --test flood-aid/*.test.mjs
node --check flood-aid/aid.js

Tests ของ API และ UI เป็น mock เท่านั้น ไม่ใช่ผลทดสอบบน Supabase จริงหรือมือถือจริง
