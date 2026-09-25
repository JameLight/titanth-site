export const SCHEMA_VERSION = 1;
export const NEEDS = Object.freeze({
  trapped: "มีคนติดอยู่",
  medical: "ต้องการความช่วยเหลือทางการแพทย์",
  fast_water: "ระดับน้ำเพิ่มเร็ว",
  boat: "ต้องการเรือหรืออพยพ",
  medicine: "ขาดยาจำเป็น",
  food_water: "ต้องการอาหารหรือน้ำดื่ม",
  other: "ความช่วยเหลืออื่น"
});
export const CHANNELS = Object.freeze({
  phone: "โทรศัพท์",
  line: "LINE",
  sms: "SMS",
  other: "ช่องทางอื่น"
});
export const STATUS = Object.freeze({
  LOCAL_ONLY: "LOCAL_ONLY",
  HANDOFF_ATTEMPTED: "HANDOFF_ATTEMPTED"
});
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // เกณฑ์เตือนของต้นแบบ ไม่ใช่ SLA

const clean = value => String(value ?? "").trim().replace(/\s+/g, " ");

export function routingHint(needs) {
  if (needs.some(n => ["trapped", "medical", "fast_water"].includes(n))) return "RED";
  if (needs.some(n => ["boat", "medicine"].includes(n))) return "ORANGE";
  return "YELLOW";
}

export function makeCase(input, { now = new Date(), id = globalThis.crypto?.randomUUID?.() } = {}) {
  const needs = [...new Set((input.needs || []).filter(n => Object.hasOwn(NEEDS, n)))];
  const peopleCount = Number(input.peopleCount);
  const location = {
    province: clean(input.province),
    district: clean(input.district),
    subdistrict: clean(input.subdistrict),
    landmark: clean(input.landmark),
    lat: input.lat === "" || input.lat == null ? null : Number(input.lat),
    lon: input.lon === "" || input.lon == null ? null : Number(input.lon),
    accuracyMeters: input.accuracyMeters == null ? null : Number(input.accuracyMeters)
  };
  if (!id) throw new Error("อุปกรณ์ไม่สามารถสร้างรหัสเคสที่ปลอดภัยได้");
  if (!location.province) throw new Error("กรุณาระบุจังหวัด");
  if (!location.landmark && !(Number.isFinite(location.lat) && Number.isFinite(location.lon))) {
    throw new Error("กรุณาระบุจุดสังเกตหรือพิกัด");
  }
  if (!Number.isInteger(peopleCount) || peopleCount < 1 || peopleCount > 999) {
    throw new Error("จำนวนคนต้องอยู่ระหว่าง 1 ถึง 999");
  }
  if (!needs.length) throw new Error("กรุณาเลือกความช่วยเหลืออย่างน้อยหนึ่งข้อ");
  if (location.lat !== null && (!Number.isFinite(location.lat) || location.lat < -90 || location.lat > 90)) {
    throw new Error("ละติจูดไม่ถูกต้อง");
  }
  if (location.lon !== null && (!Number.isFinite(location.lon) || location.lon < -180 || location.lon > 180)) {
    throw new Error("ลองจิจูดไม่ถูกต้อง");
  }
  if ((location.lat === null) !== (location.lon === null)) throw new Error("พิกัดต้องมีทั้งละติจูดและลองจิจูด");
  const at = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    caseId: id,
    createdAt: at,
    updatedAt: at,
    status: STATUS.LOCAL_ONLY,
    routingHint: routingHint(needs),
    reporterClaim: "UNVERIFIED",
    contactPhone: clean(input.contactPhone),
    peopleCount,
    needs,
    details: clean(input.details),
    location,
    handoff: null,
    events: [{ type: "SAVED_LOCALLY", at, actor: "device" }]
  };
}

export function recordHandoffAttempt(item, { channel, now = new Date() } = {}) {
  if (!Object.hasOwn(CHANNELS, channel)) throw new Error("กรุณาเลือกช่องทางที่ใช้ส่งต่อ");
  const at = now.toISOString();
  return {
    ...item,
    updatedAt: at,
    status: STATUS.HANDOFF_ATTEMPTED,
    handoff: { channel, userReportedAt: at, receiverAcknowledged: false },
    events: [...item.events, { type: "USER_REPORTED_HANDOFF", at, actor: "reporter", channel }]
  };
}

export function isStale(item, now = new Date()) {
  return now.getTime() - new Date(item.updatedAt).getTime() > STALE_AFTER_MS;
}

export function possibleDuplicates(item, others) {
  return others.filter(other => {
    if (other.caseId === item.caseId) return false;
    if (Math.abs(new Date(other.createdAt) - new Date(item.createdAt)) > 2 * 60 * 60 * 1000) return false;
    const samePhone = item.contactPhone && other.contactPhone && item.contactPhone === other.contactPhone;
    const samePlace = item.location.province === other.location.province &&
      item.location.landmark && other.location.landmark &&
      item.location.landmark.toLocaleLowerCase("th") === other.location.landmark.toLocaleLowerCase("th");
    return Boolean(samePhone || samePlace);
  });
}

export function shareText(item) {
  const loc = [item.location.subdistrict && `ต.${item.location.subdistrict}`,
    item.location.district && `อ.${item.location.district}`, `จ.${item.location.province}`,
    item.location.landmark && `จุดสังเกต: ${item.location.landmark}`].filter(Boolean).join(" ");
  const accuracy = Number.isFinite(item.location.accuracyMeters) && item.location.accuracyMeters > 0
    ? ` (คลาดเคลื่อนประมาณ ${Math.round(item.location.accuracyMeters)} เมตร)` : "";
  const coords = item.location.lat === null ? "" : `\nพิกัด: ${item.location.lat}, ${item.location.lon}${accuracy}`;
  const map = Number.isFinite(item.location.lat) && Number.isFinite(item.location.lon)
    ? `\nแผนที่: https://maps.google.com/?q=${item.location.lat},${item.location.lon}` : "";
  const thaiTime = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok"
  }).format(new Date(item.createdAt));
  return `ขอความช่วยเหลือน้ำท่วม (ข้อมูลจากผู้แจ้ง ยังไม่ยืนยัน)\nรหัสเคส: ${item.caseId}\nเวลาแจ้ง (ไทย): ${thaiTime}\nพื้นที่: ${loc}${coords}${map}\nจำนวนคน: ${item.peopleCount}\nต้องการ: ${item.needs.map(n => NEEDS[n]).join(", ")}\nรายละเอียด: ${item.details || "ไม่มี"}\nโทรกลับ: ${item.contactPhone || "ไม่ได้ระบุ"}\nกรุณาตอบกลับเพื่อยืนยันว่าได้รับข้อมูลแล้ว`;
}

const csvCell = value => {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function casesCsv(items) {
  const headers = ["case_id", "created_at", "status", "routing_hint", "province", "district", "subdistrict", "landmark", "latitude", "longitude", "people_count", "needs", "details", "contact_phone"];
  const rows = items.map(item => [item.caseId, item.createdAt, item.status, item.routingHint,
    item.location.province, item.location.district, item.location.subdistrict, item.location.landmark,
    item.location.lat ?? "", item.location.lon ?? "", item.peopleCount, item.needs.join(";"),
    item.details, item.contactPhone].map(csvCell).join(","));
  return "\uFEFF" + headers.map(csvCell).join(",") + "\r\n" + rows.join("\r\n") + "\r\n";
}

export function validateImport(data) {
  const items = Array.isArray(data) ? data : data?.cases;
  if (!Array.isArray(items) || items.length > 10000) throw new Error("ไฟล์ต้องมีรายการ cases ที่ถูกต้อง");
  for (const item of items) {
    if (item.schemaVersion !== SCHEMA_VERSION || typeof item.caseId !== "string" ||
        !Object.hasOwn(STATUS, item.status) || !item.location || !Array.isArray(item.needs)) {
      throw new Error("พบเคสที่ไม่ตรงกับรูปแบบข้อมูลของต้นแบบ");
    }
  }
  return items;
}
