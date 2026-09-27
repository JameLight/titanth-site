// Pure functions for /flood-water/: turn answers from HII's ThaiWater API (the live data behind thaiwater.net, run by the
// Hydro-Informatics Institute, สสน.) into a short summary for one province. No DOM and no network here.
// The API is the one thaiwater.net itself uses; it has no published documentation, so every field is read defensively
// and the page always links to thaiwater.net. Station readings are points on a river, not the whole province.

export const API_BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/";
export const THAIWATER_LEVEL_PAGE = "https://www.thaiwater.net/water/wl";
export const THAIWATER_HOME = "https://www.thaiwater.net/";
export const FRESH_HOURS = 3;
export const REFRESH_MINUTES = 10;
export const SLOW_MINUTES = 90;

export function waterUrl(provinceCode) {
  return `${API_BASE}waterlevel_load?province_code=${encodeURIComponent(provinceCode)}`;
}
export function rainUrl(provinceCode) {
  return `${API_BASE}rain_24h?province_code=${encodeURIComponent(provinceCode)}`;
}

// "2026-09-27 19:30" in the API is Thailand time.
export function thaiTime(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(text ?? ""));
  if (!m) return null;
  const at = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00`);
  return Number.isFinite(at.getTime()) ? at : null;
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// A reading counts only if it is from the last FRESH_HOURS (and not more than an hour in the future).
function isFresh(at, now) {
  const age = now.getTime() - at.getTime();
  return age >= -60 * 60 * 1000 && age <= FRESH_HOURS * 60 * 60 * 1000;
}

function trendOf(row) {
  const current = num(row?.waterlevel_msl);
  const previous = num(row?.waterlevel_msl_previous);
  if (current === null || previous === null) return "unknown";
  const change = current - previous;
  if (change > 0.005) return "up";
  if (change < -0.005) return "down";
  return "steady";
}

// Bangkok's districts are "เขต"; everywhere else they are "อำเภอ" (อ.).
function districtLabel(row) {
  const name = String(row?.geocode?.amphoe_name?.th ?? "").trim();
  if (!name) return "";
  return String(row?.geocode?.province_code ?? "") === "10" ? `เขต${name}` : `อ.${name}`;
}

function latestOf(items) {
  return items.reduce((latest, item) => (latest && latest > item.at ? latest : item.at), null);
}

// situation_level in the API matches the share of the channel filled up to the bank (storage_percent):
// 5 = over 100% (over the bank), 4 = 70-100%. Checked on 789 live stations on 2026-09-27.
export function waterSummary(answer, provinceCode, now = new Date()) {
  const rows = answer?.waterlevel_data?.data;
  if (!Array.isArray(rows)) throw new Error("FORMAT");
  const fresh = [];
  let stale = 0;
  for (const row of rows) {
    if (String(row?.geocode?.province_code ?? "") !== String(provinceCode)) continue;
    const at = thaiTime(row?.waterlevel_datetime);
    if (!at) continue;
    if (!isFresh(at, now)) { stale += 1; continue; }
    fresh.push({
      name: String(row?.station?.tele_station_name?.th ?? "").trim() || "สถานีไม่ระบุชื่อ",
      river: String(row?.river_name ?? "").trim(),
      district: districtLabel(row),
      percent: num(row?.storage_percent),
      level: Number.isInteger(row?.situation_level) ? row.situation_level : null,
      trend: trendOf(row),
      at: at.toISOString(),
      time: String(row.waterlevel_datetime).slice(11, 16)
    });
  }
  const byPercent = (a, b) => (b.percent ?? -Infinity) - (a.percent ?? -Infinity);
  return {
    total: fresh.length,
    stale,
    over: fresh.filter(item => item.level === 5).sort(byPercent),
    high: fresh.filter(item => item.level === 4).sort(byPercent),
    latest: latestOf(fresh)
  };
}

export function rainSummary(answer, provinceCode, now = new Date(), limit = 5) {
  const rows = answer?.data;
  if (!Array.isArray(rows)) throw new Error("FORMAT");
  const fresh = [];
  for (const row of rows) {
    if (String(row?.geocode?.province_code ?? "") !== String(provinceCode)) continue;
    const at = thaiTime(row?.rainfall_datetime);
    const mm = num(row?.rain_24h);
    if (!at || mm === null || !isFresh(at, now)) continue;
    fresh.push({
      name: String(row?.station?.tele_station_name?.th ?? "").trim() || "สถานีไม่ระบุชื่อ",
      district: districtLabel(row),
      mm,
      at: at.toISOString(),
      time: String(row.rainfall_datetime).slice(11, 16)
    });
  }
  fresh.sort((a, b) => b.mm - a.mm);
  return {
    total: fresh.length,
    over90: fresh.filter(item => item.mm > 90).length,
    over35: fresh.filter(item => item.mm > 35).length,
    top: fresh.slice(0, limit),
    latest: latestOf(fresh)
  };
}

export const TREND_TH = Object.freeze({ up: "น้ำกำลังขึ้น", down: "น้ำกำลังลง", steady: "ทรงตัว", unknown: "ไม่ทราบแนวโน้ม" });

// How old a reading is, in words, so people can judge how fresh it is. Readings older than SLOW_MINUTES are marked.
export function ageText(iso, now = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  const words = minutes < 1 ? "เมื่อสักครู่" : minutes < 60 ? `${minutes} นาทีที่แล้ว`
    : `${Math.floor(minutes / 60)} ชม.${minutes % 60 ? ` ${minutes % 60} นาที` : ""}ที่แล้ว`;
  return minutes > SLOW_MINUTES ? `${words} · ข้อมูลช้า` : words;
}

export function stationLine(item, now = new Date()) {
  const place = [item.river ? `(${item.river})` : "", item.district].filter(Boolean).join(" ");
  const percent = item.percent === null ? "ไม่ทราบระดับ" : `${Math.round(item.percent)}% ของตลิ่ง`;
  return `${item.name}${place ? " " + place : ""} — ${percent} · ${TREND_TH[item.trend] ?? TREND_TH.unknown} · วัดเมื่อ ${item.time} น. (${ageText(item.at, now)})`;
}

export function rainLine(item, now = new Date()) {
  return `${Math.round(item.mm)} มม. — ${item.name}${item.district ? " " + item.district : ""} · ถึง ${item.time} น. (${ageText(item.at, now)})`;
}

// ?p= in the address picks a province, by code ("21") or by Thai name, so a shared link opens straight to that province.
export function provinceFromQuery(search, codes) {
  const value = new URLSearchParams(String(search ?? "")).get("p");
  if (!value) return null;
  const trimmed = value.trim();
  for (const [name, code] of Object.entries(codes)) if (trimmed === code || trimmed === name) return name;
  return null;
}
