// Supabase public RPC client. Disabled unless a reviewed public config is installed.
// No service-role key belongs in a browser bundle.
import { canonicalProvince } from "./provinces.js";
const ALLOWED_NEEDS = new Set(["trapped", "medical", "immobile", "fast_water", "boat", "medicine", "food_water", "other", "dialysis_oxygen", "pregnant", "infant", "elderly", "disabled"]);
const STATUS_TEXT = Object.freeze({
  SENT: "ระบบรับข้อมูลแล้ว ยังไม่มีทีมอาสากดรับเคส",
  ACKNOWLEDGED: "ทีมอาสาแจ้งว่ารับเคสแล้ว",
  EN_ROUTE: "ทีมอาสาแจ้งว่ากำลังเดินทาง",
  RESOLVED: "ทีมอาสาแจ้งว่าปิดเคสแล้ว",
  HANDED_TO_OFFICIAL: "ทีมอาสาแจ้งว่าส่งต่อหน่วยงานแล้ว",
  NEED_INFO: "ทีมอาสาแจ้งว่าต้องการข้อมูลเพิ่ม",
  WITHDRAWN: "คุณยกเลิกเคสนี้แล้ว และขอลบข้อมูลที่ระบุตัวคุณแล้ว"
});
const REJECTED_TEXT = Object.freeze({
  UNKNOWN_PROVINCE: "ชื่อจังหวัดไม่อยู่ในรายการ กรุณาเลือกจังหวัดใหม่ก่อนส่ง",
  NO_TEAM_ON_DUTY: "ตอนนี้ไม่มีทีมอาสาเฝ้าจังหวัดนี้ โทร 1784 หรือส่ง LINE ปภ.",
  TOO_MANY_CASES: "ระบบจำกัดจำนวนเคสที่ส่งจากเครื่องนี้ ถ้าอันตรายโทร 1784",
  SYSTEM_BUSY: "ระบบรับเคสเต็ม ถ้าอันตรายโทร 1784 หรือส่ง LINE ปภ.",
  BAD_NEEDS: "ข้อมูลความช่วยเหลือไม่ถูกต้อง กรุณากรอกใหม่",
  BAD_LOCATION: "ข้อมูลสถานที่ไม่ถูกต้อง กรุณากรอกใหม่",
  CASE_NOT_FOUND: "ไม่พบเคสที่ตรงกับรหัสนี้ กรุณาตรวจรหัสอ้างอิงและรหัสลับ"
});

export function validIntakeConfig(value) {
  if (!value || value.enabled !== true || value.schemaVersion !== 2 ||
      typeof value.publishableKey !== "string" || !value.publishableKey.startsWith("sb_publishable_") ||
      typeof value.consentVersion !== "string" || !/^[a-zA-Z0-9._-]{1,40}$/.test(value.consentVersion) ||
      typeof value.privacyNoticeUrl !== "string" || !/^\/(?!\/)[^\s]*$/.test(value.privacyNoticeUrl)) return false;
  try {
    const url = new URL(value.url);
    return url.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) &&
      url.username === "" && url.password === "" && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

export async function loadIntakeConfig(fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl("./intake-config.json", { cache: "no-store", credentials: "omit" });
    if (!response.ok) return null;
    const config = await response.json();
    return validIntakeConfig(config) ? config : null;
  } catch { return null; }
}

export function makeIntakeClient(config, fetchImpl = globalThis.fetch) {
  if (!validIntakeConfig(config)) throw new Error("ยังไม่ได้เปิดระบบรับเคสทีมอาสา");
  const base = config.url.replace(/\/$/, "");

  async function rpc(name, payload) {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: "POST", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      headers: { "apikey": config.publishableKey, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const code = body?.message;
      if (response.status >= 400 && response.status < 500 && Object.hasOwn(REJECTED_TEXT, code)) {
        const error = new Error(REJECTED_TEXT[code]);
        error.definitive = true;
        throw error;
      }
      throw new Error(`ระบบรับเคสตอบกลับผิดพลาด (${response.status})`);
    }
    const result = await response.json();
    if (!Array.isArray(result) || result.length !== 1 || typeof result[0] !== "object" || !result[0]) {
      throw new Error("คำตอบจากระบบรับเคสไม่ครบ");
    }
    return result[0];
  }

  async function dutyStatus(province) {
    const area = canonicalProvince(province);
    if (!area) return false;
    // Contract v2: the server must check on-duty coverage for this province.
    const result = await rpc("duty_status", { p_province: area });
    return result.on_duty === true;
  }

  async function submitCase(item) {
    const payload = mapCaseForSubmit(item, config.consentVersion);
    if (!await dutyStatus(payload.p_province)) throw new Error("ตอนนี้ยังไม่มีทีมอาสาเฝ้าในพื้นที่นี้ ให้โทร 1784 หรือส่ง LINE ปภ.");
    // Do not retry automatically: a network error after POST may mean the server received it.
    const result = await rpc("submit_case", payload);
    if (!/^[A-Z0-9-]{4,40}$/.test(result.code || "") || !/^[a-f0-9]{32,128}$/.test(result.secret || "")) {
      throw new Error("ระบบรับเคสตอบรหัสกลับไม่ครบ กรุณาโทร 1784 หากเป็นเหตุจริง");
    }
    return { code: result.code, secret: result.secret, submittedAt: new Date().toISOString() };
  }

  async function caseStatus(receipt) {
    if (!receipt?.code || !receipt?.secret) throw new Error("ไม่มีรหัสสำหรับอ่านสถานะ");
    const result = await rpc("case_status", { p_code: receipt.code, p_secret: receipt.secret });
    if (result.code !== receipt.code || !Object.hasOwn(STATUS_TEXT, result.status)) throw new Error("ระบบตอบสถานะไม่ถูกต้อง");
    return result;
  }

  async function withdrawCase(receipt) {
    if (!receipt?.code || !receipt?.secret) throw new Error("ไม่มีรหัสสำหรับยกเลิกเคส");
    // Never retry automatically: a failed network response can follow a successful purge.
    const result = await rpc("withdraw_case", { p_code: receipt.code, p_secret: receipt.secret });
    if (result.code !== receipt.code || !["WITHDRAWN", "RESOLVED", "HANDED_TO_OFFICIAL"].includes(result.status)) {
      throw new Error("ยังยืนยันผลการยกเลิกเคสไม่ได้");
    }
    return result;
  }

  return { dutyStatus, submitCase, caseStatus, withdrawCase, config };
}

export function mapCaseForSubmit(item, consentVersion) {
  if (!item || !item.location || !Array.isArray(item.needs)) throw new Error("ข้อมูลเคสไม่ครบ");
  const location = item.location;
  const province = canonicalProvince(location.province);
  if (!province) throw new Error("จังหวัดไม่อยู่ในรายการ 77 จังหวัด กรุณาเลือกชื่อจังหวัดก่อนส่งเข้าทีม");
  const district = String(location.district ?? "").trim();
  const subdistrict = String(location.subdistrict ?? "").trim();
  const landmark = String(location.landmark ?? "").trim();
  const details = String(item.details ?? "").trim();
  const phone = String(item.contactPhone ?? "").trim();
  const needs = [...new Set(item.needs)];
  if (district.length > 80 || subdistrict.length > 80 ||
      landmark.length > 200 || details.length > 1000 || phone.length > 40 ||
      !Number.isInteger(item.peopleCount) || item.peopleCount < 1 || item.peopleCount > 999 ||
      !needs.length || needs.length > ALLOWED_NEEDS.size || needs.some(value => !ALLOWED_NEEDS.has(value))) {
    throw new Error("ข้อมูลเคสยาวหรือไม่ครบตามที่ระบบรับได้");
  }
  const lat = location.lat == null ? null : Number(location.lat);
  const lon = location.lon == null ? null : Number(location.lon);
  const accuracy = location.accuracyMeters == null ? null : Number(location.accuracyMeters);
  if ((lat === null) !== (lon === null) ||
      (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
      (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) ||
      (accuracy !== null && (!Number.isInteger(accuracy) || accuracy < 0 || accuracy > 100000 || lat === null)) ||
      (!landmark && lat === null)) throw new Error("ตำแหน่งไม่ครบหรือไม่ถูกต้อง");
  return {
    p_province: province, p_district: district || null, p_subdistrict: subdistrict || null,
    p_landmark: landmark || null, p_lat: lat, p_lon: lon, p_accuracy_m: accuracy,
    p_people: item.peopleCount, p_needs: needs, p_details: details || null,
    p_contact_phone: phone || null, p_consent_version: consentVersion
  };
}

export function caseStatusText(result) {
  const label = STATUS_TEXT[result?.status];
  if (!label) return "ยังอ่านสถานะจากระบบไม่ได้";
  const team = result.status !== "WITHDRAWN" && result.team_name ? ` (${String(result.team_name)})` : "";
  const late = result.late === true && result.status === "SENT" ? " เกิน 10 นาทีแล้วยังไม่มีทีมรับ โทร 1784 หรือ 1669 ตามเหตุทันที" : "";
  return `${label}${team}.${late}`;
}

export function stripIntakeSecrets(items) {
  return items.map(item => item.intake ? {
    ...item,
    intake: { code: item.intake.code, submittedAt: item.intake.submittedAt, statusAccessRemoved: true }
  } : item);
}
