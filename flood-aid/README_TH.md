# กระดานช่วยกัน — frontend candidate v2.7 r6

สถานะ: **ปิดเริ่มต้น และยังไม่เผยแพร่** หน้าเว็บนี้ไม่ใช่คิวฉุกเฉิน ไม่ตรวจตัวตน ไม่มีเจ้าหน้าที่เฝ้า และไม่รับประกันว่ามีใครไปช่วย

## สัญญาที่ใช้

- SQL sql_v27/aid_board.sql SHA-256 939ab5c2fd50094ac5ca3e5bc63e9e56d6e5db39624761afe734d8fab705f680
- Full SQL candidate SHA-256 7dc997f6f6ec2bb974c02fe4f38c001a2920ef1f1d4e64dc0246b16d71560bc4
- RPC contract sql_v27/AID_RPC_CONTRACT.md ที่ Claude สร้างจาก pg_proc ในฐานทิ้ง เวลา 2026-09-27T00:07Z
- ยังไม่มีหลักฐานว่า SQL นี้อยู่ในฐาน production หรือว่าค่าปิดเปิดจริงตรงกัน

## เปิดใช้ต้องครบ

1. ตรวจและติดตั้ง SQL รุ่นที่ตรง hash; อ่านกลับ RPC, RLS, aid_enabled=0, cron ลบข้อมูล และ owner stop/suspend บนฐานจริงด้วยข้อมูลสมมติ
2. ตรวจประกาศ privacy/index.html กับพฤติกรรมฐานจริงและตัวผู้ดูแลข้อมูล รวมถึงข้อความเกี่ยวกับข้อมูลสุขภาพและระยะลบ; รับการยืนยันจากเจ้าของก่อนเผยแพร่
3. ทดสอบ browser ที่ 320px และมือถือจริง, การสมัคร, ยืนยันอีเมล, การคุย 2 บัญชี, การแชร์ทีละคน, ปิด, รายงาน, ระบบปิด, ถูกระงับ, การกลับจาก offline ด้วยข้อมูลสมมติ
4. แก้ aid-config.json เฉพาะหลังงานข้างบนผ่าน: enabled=true, URL ฐานจริง, publishable key เท่านั้น, privacyNoticeVersion เท่ากับ termsVersion, privacyNoticeUrl=/flood-aid/privacy/ และเปิดสวิตช์ฝั่งฐานจริงอย่างเป็นขั้นตอน
5. อ่านกลับ URL production และตรวจว่ากระดานแสดงตามสิทธิ์; แยกหลักฐาน API/UI ออกจากหลักฐานว่ามีคนรับความช่วยเหลือจริง

ห้ามใส่ service key, ข้อมูลจริง หรือรหัสคนจริงใน repo/ทดสอบ หน้าใช้เฉพาะ RPC; session token อยู่ใน sessionStorage ของแท็บนี้ ไม่เก็บข้อมูลโพสต์หรือข้อความลงเครื่อง หน้า render ข้อความจากผู้ใช้ด้วย textContent เท่านั้น และปิดหาก config/notice/RPC ไม่พร้อม

## ทดสอบ

node --test flood-aid/aid_api.test.mjs
node --check flood-aid/aid.js

Tests ของ API เป็น mock เท่านั้น ไม่ใช่ผลทดสอบบน Supabase จริงหรือมือถือจริง
