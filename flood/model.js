export const SCHEMA_VERSION = 1;
export const NEEDS = Object.freeze({
  trapped: "มีคนติดอยู่",
  medical: "ต้องการความช่วยเหลือทางการแพทย์",
  immobile: "มีผู้ป่วยติดเตียงหรือคนที่เคลื่อนย้ายเองไม่ได้ (ต้องใช้เปลหรือเรือ)",
  fast_water: "ระดับน้ำเพิ่มเร็ว",
  boat: "ต้องการเรือหรืออพยพ",
  medicine: "ขาดยาจำเป็น",
  food_water: "ต้องการอาหารหรือน้ำดื่ม",
  other: "ความช่วยเหลืออื่น",
  dialysis_oxygen: "ต้องฟอกไตหรือใช้ออกซิเจน",
  pregnant: "มีหญิงตั้งครรภ์",
  infant: "มีเด็กเล็ก",
  elderly: "มีผู้สูงอายุ",
  disabled: "มีผู้พิการ"
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
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function createCaseId(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource?.randomUUID === "function") return cryptoSource.randomUUID();
  if (typeof cryptoSource?.getRandomValues !== "function") return null;
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function routingHint(needs) {
  if (needs.some(n => ["trapped", "medical", "immobile", "fast_water", "dialysis_oxygen"].includes(n))) return "RED";
  if (needs.some(n => ["boat", "medicine", "pregnant", "infant", "elderly", "disabled"].includes(n))) return "ORANGE";
  return "YELLOW";
}

export function validateTriage(urgentNow, needs) {
  if (urgentNow !== "yes" && urgentNow !== "no") throw new Error("กรุณาเลือกว่าตอนนี้ต้องอพยพด่วนหรือมีผู้ป่วยไหม");
  if (urgentNow === "yes" && !needs.some(need => ["trapped", "immobile", "medical", "fast_water", "dialysis_oxygen"].includes(need))) {
    throw new Error("กรุณาเลือกเหตุเร่งด่วนที่ตรงกับสถานการณ์อย่างน้อยหนึ่งข้อ");
  }
}

export function makeCase(input, { now = new Date(), id = createCaseId() } = {}) {
  const needs = [...new Set((input.needs || []).filter(n => has(NEEDS, n)))];
  const peopleCount = Number(input.peopleCount);
  const location = {
    province: clean(input.province),
    district: clean(input.district),
    subdistrict: clean(input.subdistrict),
    landmark: clean(input.landmark),
    lat: input.lat === "" || input.lat == null ? null : Number(input.lat),
    lon: input.lon === "" || input.lon == null ? null : Number(input.lon),
    accuracyMeters: input.accuracyMeters === "" || input.accuracyMeters == null ? null : Number(input.accuracyMeters)
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
  if (location.accuracyMeters !== null && (!Number.isFinite(location.accuracyMeters) || location.accuracyMeters < 0 || location.accuracyMeters > 100000)) {
    throw new Error("ค่าความคลาดเคลื่อน GPS ไม่ถูกต้อง");
  }
  if (location.accuracyMeters !== null && location.lat === null) throw new Error("ค่าความคลาดเคลื่อน GPS ต้องมีพิกัดด้วย");
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
  if (!has(CHANNELS, channel)) throw new Error("กรุณาเลือกช่องทางที่ใช้ส่งต่อ");
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
  return now.getTime() - new Date(item.createdAt).getTime() > STALE_AFTER_MS;
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
  const accuracy = Number.isFinite(item.location.accuracyMeters) && item.location.accuracyMeters >= 0
    ? ` (คลาดเคลื่อนประมาณ ${Math.round(item.location.accuracyMeters)} เมตร)` : "";
  const coords = item.location.lat === null ? "" : `\nพิกัดจากโทรศัพท์ผู้แจ้ง: ${item.location.lat}, ${item.location.lon}${accuracy}`;
  const map = Number.isFinite(item.location.lat) && Number.isFinite(item.location.lon)
    ? `\nแผนที่: https://maps.google.com/?q=${item.location.lat},${item.location.lon}` : "";
  const thaiTime = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok"
  }).format(new Date(item.createdAt));
  return `ขอความช่วยเหลือน้ำท่วม (ข้อมูลจากผู้แจ้ง ยังไม่ยืนยัน)\nรหัสเคส: ${item.caseId}\nข้อมูล ณ (เวลาไทย): ${thaiTime}\nพื้นที่: ${loc}${coords}${map}\nจำนวนคน: ${item.peopleCount}\nต้องการ: ${item.needs.map(n => NEEDS[n]).join(", ")}\nรายละเอียด: ${item.details || "ไม่มี"}\nโทรกลับ: ${item.contactPhone || "ไม่ได้ระบุ"}\nกรุณาตอบกลับเพื่อยืนยันว่าได้รับข้อมูลแล้ว`;
}

export function quickLocationText({ latitude, longitude, accuracy }, now = new Date()) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000) {
    throw new Error("พิกัดจากโทรศัพท์ไม่ถูกต้อง กรุณาบอกจุดสังเกตทางโทรศัพท์แทน");
  }
  const lat = latitude.toFixed(6);
  const lon = longitude.toFixed(6);
  const thaiTime = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok"
  }).format(now);
  return `ขอความช่วยเหลือด่วน น้ำท่วม (ข้อมูลจากผู้แจ้ง ยังไม่ยืนยัน)\nตำแหน่งจากโทรศัพท์ผู้แจ้ง: ${lat}, ${lon} (คลาดเคลื่อนประมาณ ${Math.round(accuracy)} เมตร)\nแผนที่: https://maps.google.com/?q=${lat},${lon}\nข้อมูล ณ (เวลาไทย): ${thaiTime}\nกรุณาตอบกลับเพื่อยืนยันว่าได้รับข้อมูลแล้ว`;
}

export function ddpmLinePrefillUrl(message) {
  if (typeof message !== "string" || !message.trim()) throw new Error("ไม่มีข้อความตำแหน่งให้ส่ง");
  const url = `https://line.me/R/oaMessage/%40155zwaue/?${encodeURIComponent(message)}`;
  if (url.length > 4000) throw new Error("ข้อความยาวเกินกว่าจะเปิดใน LINE ได้");
  return url;
}

// QR เป็นข้อความสั้นสำหรับให้คนที่มีสัญญาณส่งต่อเอง ไม่ใช่หลักฐานการส่งหรือ ACK.
export const QR_MAX_BYTES = 350;
const QR_NEEDS = Object.freeze({
  trapped: "ติดอยู่", medical: "ป่วย/บาดเจ็บ", immobile: "เคลื่อนย้ายไม่ได้",
  fast_water: "น้ำขึ้นเร็ว", boat: "เรือ/อพยพ", medicine: "ขาดยา",
  food_water: "อาหาร/น้ำ", other: "อื่นๆ", dialysis_oxygen: "ฟอกไต/ออกซิเจน",
  pregnant: "ตั้งครรภ์", infant: "เด็กเล็ก", elderly: "สูงอายุ", disabled: "พิการ"
});
const qrBounded = message => {
  if (new TextEncoder().encode(message).length > QR_MAX_BYTES) {
    throw new Error("ข้อมูลยาวเกินสำหรับ QR ที่สแกนง่าย ให้คัดลอกหรือแชร์ข้อความเต็มแทน");
  }
  return message;
};

export function quickLocationQrText(coords, now = new Date()) {
  quickLocationText(coords, now); // ใช้การตรวจช่วงพิกัดเดียวกับข้อความส่งหลัก
  const lat = coords.latitude.toFixed(6);
  const lon = coords.longitude.toFixed(6);
  const time = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok"
  }).format(now);
  return qrBounded(`น้ำท่วม ขอช่วย (ยังไม่ยืนยัน)\n${lat},${lon} ±${Math.round(coords.accuracy)}ม.\nhttps://maps.google.com/?q=${lat},${lon}\n${time} เวลาไทย\nโปรดตอบรับ`);
}

export function caseQrText(item) {
  const loc = item?.location;
  if (!loc || !item?.createdAt || !Number.isInteger(item.peopleCount) || item.peopleCount < 1 || item.peopleCount > 999 ||
      !Array.isArray(item.needs) || !item.needs.length || !item.needs.every(n => has(NEEDS, n)) ||
      ((loc.lat == null) !== (loc.lon == null)) ||
      (loc.lat !== null && loc.lat !== undefined && (!Number.isFinite(loc.lat) || loc.lat < -90 || loc.lat > 90)) ||
      (loc.lon !== null && loc.lon !== undefined && (!Number.isFinite(loc.lon) || loc.lon < -180 || loc.lon > 180))) {
    throw new Error("ข้อมูลเคสไม่ครบสำหรับ QR ให้คัดลอกข้อความเต็มแทน");
  }
  const place = [loc.province, loc.district, loc.subdistrict, loc.landmark].filter(Boolean).join("/");
  const coords = Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
    ? `\nพิกัด ${loc.lat},${loc.lon}${Number.isFinite(loc.accuracyMeters) ? ` ±${Math.round(loc.accuracyMeters)}ม.` : ""}` : "";
  const needs = item.needs.map(n => QR_NEEDS[n] || "อื่นๆ").join(",");
  const time = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok"
  }).format(new Date(item.createdAt));
  if (!place || !needs || !Number.isFinite(new Date(item.createdAt).getTime())) {
    throw new Error("ข้อมูลเคสไม่ครบสำหรับ QR ให้คัดลอกข้อความเต็มแทน");
  }
  const message = placeText => `น้ำท่วม ขอช่วย (ยังไม่ยืนยัน)\n${placeText}${coords}\n${item.peopleCount}คน ${needs}\nโทร ${item.contactPhone || "-"}\n${time} เวลาไทย\nโปรดตอบรับ`;
  const full = message(place);
  if (new TextEncoder().encode(full).length <= QR_MAX_BYTES) return full;
  // Keep coordinates, province, headcount, all needs, phone and time. Show that place text was shortened.
  // Without GPS, shortening the place could remove the only usable location, so use the full-copy fallback.
  if (!coords || !loc.province) return qrBounded(full);
  const compactMessage = placeText => `น้ำท่วม(ยังไม่ยืนยัน)\n${placeText}${coords}\n${item.peopleCount}คน ${needs}\nโทร ${item.contactPhone || "-"}\n${time} ไทย\nโปรดตอบรับ`;
  const compactFull = compactMessage(place);
  if (new TextEncoder().encode(compactFull).length <= QR_MAX_BYTES) return compactFull;
  const landmarkChars = Array.from(String(loc.landmark || ""));
  const alternatives = [
    [loc.province, loc.district, "…", loc.landmark],
    [loc.province, "…", loc.landmark],
    ...[24, 16, 12, 8, 4].filter(length => landmarkChars.length > length)
      .map(length => [loc.province, "…", `${landmarkChars.slice(0, length).join("")}…`]),
    [loc.province, "…"]
  ];
  for (const segments of alternatives) {
    const candidate = compactMessage(segments.filter(Boolean).join("/"));
    if (new TextEncoder().encode(candidate).length <= QR_MAX_BYTES) return candidate;
  }
  return qrBounded(full);
}

const csvCell = value => {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function casesCsv(items) {
  const headers = ["case_id", "created_at", "status", "routing_hint", "province", "district", "subdistrict", "landmark", "latitude", "longitude", "accuracy_meters", "people_count", "needs", "details", "contact_phone"];
  const rows = items.map(item => [item.caseId, item.createdAt, item.status, item.routingHint,
    item.location.province, item.location.district, item.location.subdistrict, item.location.landmark,
    item.location.lat ?? "", item.location.lon ?? "", item.location.accuracyMeters ?? "", item.peopleCount, item.needs.join(";"),
    item.details, item.contactPhone].map(csvCell).join(","));
  return "\uFEFF" + headers.map(csvCell).join(",") + "\r\n" + rows.join("\r\n") + "\r\n";
}

export function validateImport(data) {
  const items = Array.isArray(data) ? data : data?.cases;
  if (!Array.isArray(items) || items.length > 10000) throw new Error("ไฟล์ต้องมีรายการ cases ที่ถูกต้อง");
  for (const item of items) {
    if (item.schemaVersion !== SCHEMA_VERSION || typeof item.caseId !== "string" ||
        !has(STATUS, item.status) || !item.location || !Array.isArray(item.needs)) {
      throw new Error("พบเคสที่ไม่ตรงกับรูปแบบข้อมูลของต้นแบบ");
    }
  }
  return items;
}
