import { PROVINCES } from "../flood/provinces.js";

export const KIND_LABELS = Object.freeze({ relay: "ช่วยโทรหรือส่งต่อข้อมูล", supplies: "แบ่งปันน้ำดื่มหรืออาหาร" });

export function checkOffer({ province, kind, contactKind, contactValue }) {
  const value = String(contactValue ?? "").trim();
  if (!PROVINCES.includes(province)) throw new Error("กรุณาเลือกจังหวัด");
  if (!(kind in KIND_LABELS)) throw new Error("กรุณาเลือกวิธีช่วย");
  if (contactKind === "reply_in_app") {
    if (value) throw new Error("ไม่ต้องใส่เบอร์หรือ LINE ID หากให้ตอบกลับในแอป");
  } else if (contactKind === "phone") {
    if (!/^0[0-9]{8,9}$/.test(value)) throw new Error("เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก เริ่มด้วย 0");
  } else if (contactKind === "line_id") {
    if (!/^[A-Za-z0-9._-]{4,32}$/.test(value)) throw new Error("LINE ID ต้องมี 4–32 ตัว ใช้ตัวอังกฤษ ตัวเลข จุด ขีด หรือขีดล่าง");
  } else throw new Error("กรุณาเลือกช่องทางติดต่อ");
  return { province, kind, contactKind, contactValue: value };
}

export function shareOfferText(value) {
  const v = checkOffer(value);
  const contact = v.contactKind === "reply_in_app"
    ? "ติดต่อ: ตอบกลับโพสต์หรือแชตต้นทางที่ฉันส่งเอง (ถ้าถูกส่งต่อ อาจติดต่อฉันไม่ได้)"
    : `${v.contactKind === "phone" ? "โทร" : "LINE ID"}: ${v.contactValue}`;
  return `ฉันเสนอตัว${KIND_LABELS[v.kind]}ในจังหวัด${v.province}\n` +
    `${contact}\n` +
    "ฉันลงข้อความนี้เอง ยังไม่มีการตรวจตัวตนหรือรับรองความพร้อม อย่าส่งเงิน\n" +
    "ถ้าติดน้ำท่วมหรืออันตราย โทร 1784; เจ็บป่วยหรือบาดเจ็บฉุกเฉิน โทร 1669\n" +
    "เว็บช่วยเรียงข้อมูล: https://titanth.com/flood/";
}
