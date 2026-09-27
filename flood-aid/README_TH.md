# กระดานช่วยกัน — frontend candidate; ตรวจประกาศกับ SQL v2.7 snapshot รุ่น v2.6 r13 + กระดาน r9

สถานะ: **ปิดเริ่มต้น และยังไม่เผยแพร่** หน้าเว็บนี้ไม่ใช่คิวฉุกเฉิน ไม่ตรวจตัวตน เจ้าของดูแลรายงานเพียงคนเดียวโดยไม่มีแจ้งเตือนอัตโนมัติ และไม่รับประกันการตอบทันทีหรือว่ามีใครไปช่วย. เจ้าของยืนยันว่าไม่รับเงินบริจาคและไม่ขอเงินจากใคร

การคุยเป็นการดึงข้อมูลซ้ำเมื่อแท็บเปิดอยู่ ไม่มี push notification หรือ SMS ผู้ใช้ต้องกลับมาเช็กเอง จึงห้ามสื่อสารว่าเป็นระบบตอบทันที

หน้า candidate นี้ไม่มีช่องเฉพาะสำหรับข้อมูลสุขภาพหรือเครื่องหมายบุคคลเปราะบาง และส่ง `p_vulnerable=false` เสมอ SQL กระดาน r9 ที่อ่านใน snapshot นี้มี `sensitive_consent_version` และ `sensitive_consent_at` เมื่อ client อื่นส่งธงพร้อมรุ่นความยินยอมปัจจุบัน บันทึกรุ่น/เวลาไม่ได้พิสูจน์ว่าผู้ใช้ติ๊กเอง ข้อความอิสระและแชตยังอาจมีข้อมูลอ่อนไหวโดยไม่มี consent trail เรื่องสุขภาพ จึงต้องทบทวนก่อนเปิดรับคนจริง

SQL ที่ใช้ตรวจข้อความประกาศรอบนี้เป็น **snapshot ที่ยังเปลี่ยนได้**: `sql_v27/supabase_setup_v27_candidate.sql` SHA-256 `814913ccbd7908e2c23bb51a3e119dc258be6a174336c4dbd62f5fd09b55969b` ซึ่งประกอบจาก v2.6 รุ่นแก้ 13 กับกระดาน r9; aid SQL แยก SHA-256 `14bafaa1ffa79d6fbe6429392ffb98f4fbacfb44e747c0071ee7d57623ee6633`. หน้าเว็บสร้างต้นแบบจาก r6 และยังต้องตรวจสัญญา API/ประกาศกับ **รุ่นที่จะติดตั้งจริง** อีกครั้ง. Codex ตรวจสิทธิ์อาสา r13 บนฐานทิ้งในกรณีที่ระบุไว้บนบอร์ด; ไม่ใช่การทดสอบ aid board ผ่าน PostgREST, มือถือจริง หรือการเปิดใช้งาน. อ่านฐาน production ล่าสุด 27 ก.ย. 17:28 น.ไทย: ทีม/สมาชิก/เคส/เหตุการณ์เป็น 0, สวิตช์ใหม่ `{}`, RPC ใหม่ `[]`; ยังไม่มีรุ่น v2.7 นี้บนฐานจริง

รายงานจากผู้ใช้ทำได้ใน SQL ฉบับร่าง เจ้าของตั้งใจดูแลเองให้เร็วที่สุดเท่าที่ทำได้ แต่ไม่มีแจ้งเตือนอัตโนมัติและไม่มีคนเฝ้าตลอดเวลา โพสต์ถูกติดป้ายเตือนเมื่อมีรายงานครบเกณฑ์ ไม่ซ่อนอัตโนมัติ. ต้องทดสอบช่องทางให้เจ้าของเห็นรายงานและการตอบสนองจริงก่อนเปิดกระดาน

## HOLD: ยังไม่เผยแพร่หน้า PR #50 บนโฮสต์ที่ตรวจแล้ว

- อ่าน https://titanth.com/flood/ และ /flood-team/ วันที่ 27 ก.ย. 2569 ~07:39 น.ไทย: ตอบจาก server: GitHub.com และไม่มี Content-Security-Policy หรือ X-Frame-Options ใน HTTP response. DNS apex ชี้ IP GitHub Pages โดยตรง
- [CSP Level 3 ของ W3C](https://www.w3.org/TR/CSP/#directive-frame-ancestors) กำหนดว่า frame-ancestors ใน HTML meta ถูก browser เพิกเฉย; จึงเอาคำนี้ออกจาก meta ของหน้า
- หน้าใหม่จะเปิดได้ต่อเมื่อ response HTML ของตัวเองมี Content-Security-Policy: frame-ancestors 'none' หรือ X-Frame-Options: DENY เป็น **HTTP header จริง**; การตรวจนี้เป็น gate เพิ่ม ไม่ใช่ตัวแทน header ฝั่งโฮสต์
- 27 ก.ย. ~17:42 น.ไทย `https://help.titanth.com/` ตอบ HTTPS 200 พร้อม HTTP `frame-ancestors 'none'` และ `X-Frame-Options: DENY` จริง แต่ยังเป็นหน้า HOLD ของ Claude ไม่ใช่ไฟล์ PR #50. Claude ทดสอบ iframe ข้ามไซต์บนหน้า HOLD ด้วย Chrome และ WebKit 3/3 ต่อชุด; ยังต้องทดสอบ exact HEAD ของหน้ากระดานและหน้าประกาศบนโฮสต์นี้ รวมถึงมือถือจริง ก่อนเปิด config
- repo นี้ยังไม่มี deployment config ที่พิสูจน์ว่าเพิ่ม header บน GitHub Pages ได้ การใส่ _headers แบบ [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/) ใน repo GitHub Pages นี้ยังไม่ใช่วิธีแก้ที่ตรวจได้ ต้องจัดเส้นทางโฮสต์ให้ทั้ง /flood-aid/ และ /flood-aid/privacy/ ส่ง header จริง แล้วอ่านกลับ response และทดสอบการฝังหน้าซ้ำ

## สัญญาที่ใช้

- Frontend เดิมเริ่มจาก SQL กระดาน r6: `aid_board.sql` SHA-256 `939ab5c2fd50094ac5ca3e5bc63e9e56d6e5db39624761afe734d8fab705f680`; ไม่ใช่สัญญาที่จะใช้เปิดจริง
- Snapshot ที่ทวน notice: SQL v2.7 SHA-256 `814913ccbd7908e2c23bb51a3e119dc258be6a174336c4dbd62f5fd09b55969b` (v2.6 r13 + aid r9); ต้องตรวจ hash ใหม่หาก Claude แก้ source
- ค่ารุ่นข้อตกลงในหน้าเป็น `aid-terms-v1-20260927` ซึ่งยังไม่เคยเปิดให้ผู้ใช้ยอมรับ จึงใช้เป็นรุ่นแรกได้ **ต่อเมื่อ** เจ้าของอนุมัติข้อความสุดท้าย บันทึก hash ของหน้าและประกาศ แล้วตรวจว่าค่า `aid_terms_version` และ `aid_sensitive_consent_version` ในฐานจริง, `privacyNoticeVersion`/`termsVersion` ใน `aid-config.json`, `aid_api.js`, meta และหัวข้อประกาศตรงกันก่อนเปิด; config ปัจจุบันยัง `enabled:false`. หากแก้ข้อความหลังมีผู้ยอมรับจริง ต้องขึ้นรุ่น v2 ทุกจุด
- ฐานจริงล่าสุดที่อ่านกลับยังไม่มี RPC/สวิตช์ของ SQL นี้; snapshot และไฟล์ notice ไม่ใช่การติดตั้งหรืออนุมัติทางกฎหมาย

## เปิดใช้ต้องครบ

1. เลือกและอนุมัติ SQL รุ่นที่จะใช้หลัง audit; ทวน frontend ตาม API รุ่นนั้น แล้วตรวจและติดตั้ง SQL; อ่านกลับ RPC, RLS, aid_enabled=0, cron ลบข้อมูล และ owner stop/suspend บนฐานจริงด้วยข้อมูลสมมติ
2. ตรวจประกาศ privacy/index.html กับพฤติกรรมฐานจริงและตัวผู้ดูแลข้อมูล รวมถึงข้อความเกี่ยวกับข้อมูลสุขภาพ ระยะลบ และผู้เฝ้ารายงาน; ให้เจ้าของอนุมัติข้อความสุดท้ายและตรึง hash/รุ่นให้ตรงกันทุกจุดก่อนเปิด แล้วให้ผู้รู้กฎหมายตรวจส่วนที่จำเป็นก่อนเปิดรับข้อมูลจริง
3. ทดสอบ browser ที่ 320px และมือถือจริง, การสมัคร, ยืนยันอีเมล, การคุย 2 บัญชี, การแชร์ทีละคน, ปิด, รายงาน, ระบบปิด, ถูกระงับ, การกลับจาก offline ด้วยข้อมูลสมมติ
4. ให้โฮสต์ส่ง HTTP anti-frame header จริงและทดสอบ readback/iframe แล้วจึงแก้ aid-config.json: enabled=true, URL ฐานจริง, publishable key เท่านั้น, privacyNoticeVersion เท่ากับ termsVersion, privacyNoticeUrl=/flood-aid/privacy/ และเปิดสวิตช์ฝั่งฐานจริงอย่างเป็นขั้นตอน
5. อ่านกลับ URL production และตรวจว่ากระดานแสดงตามสิทธิ์; แยกหลักฐาน API/UI ออกจากหลักฐานว่ามีคนรับความช่วยเหลือจริง

ห้ามใส่ service key, ข้อมูลจริง หรือรหัสคนจริงใน repo/ทดสอบ หน้าใช้เฉพาะ RPC; session token อยู่ใน sessionStorage ของแท็บนี้ ไม่เก็บข้อมูลโพสต์หรือข้อความลงเครื่อง หน้า render ข้อความจากผู้ใช้ด้วย textContent เท่านั้น และปิดหาก config/notice/RPC ไม่พร้อม

## ทดสอบ

node --test flood-aid/*.test.mjs
node --check flood-aid/aid.js

Tests ของ API และ UI เป็น mock เท่านั้น ไม่ใช่ผลทดสอบบน Supabase จริงหรือมือถือจริง
