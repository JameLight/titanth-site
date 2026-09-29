// Kamphaeng Phet water page updater.
// Reads official public data and writes flood/kamphaeng-phet/data.js and data.json.
// Sources:
//   - Royal Irrigation Department (RID) hourly river levels, Ping basin (hyd-app-db.rid.go.th)
//   - DDPM Cell Broadcast open data (academicndwc.github.io/CBS-DashBoard), province code 62
//   - Thai Meteorological Department 7-day province forecast (data.tmd.go.th, open data)
// No dependencies. Node 20+ (global fetch). Run: node .github/kpp/update.mjs
// If a source fails, the previous values for that source are kept, so the page shows them as old.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT_DIR = path.join(ROOT, "flood", "kamphaeng-phet");

const RID_BASE = "https://hyd-app-db.rid.go.th/webservice/";
const RID_PAGE = "https://hyd-app-db.rid.go.th/hydro2hd_admsl.html";
const CB_URL = "https://academicndwc.github.io/CBS-DashBoard/data/data.json";
const TMD_URL = "https://data.tmd.go.th/api/WeatherForecast7Days/V2/?uid=api&ukey=api12345&format=json";
const HOUR = 3600e3;
const TH_OFFSET = 7 * HOUR;
const KEEP_HOURS = 33;

export const STATIONS = {
  "P.2A": { name: "ตาก บ้านท่าแค", place: "ต้นน้ำ แม่น้ำปิง อ.เมืองตาก" },
  "P.7A": { name: "ตัวเมืองกำแพงเพชร", place: "แม่น้ำปิง ต.ในเมือง อ.เมืองกำแพงเพชร" },
  "P.15": { name: "คลองขลุง หน้าวัดศรีภิรมย์", place: "แม่น้ำปิง อ.คลองขลุง" },
  "P.16": { name: "ขาณุฯ บ้านแสนตอ", place: "แม่น้ำปิง อ.ขาณุวรลักษบุรี" },
  "P.47A": { name: "บ้านโป่งน้ำร้อน", place: "คลองสวนหมาก อ.คลองลาน" },
  "P.26B": { name: "คลองสวนหมาก (P.26B)", place: "อ.คลองลาน" },
  "P.78": { name: "บ้านสามเรือน", place: "คลองขลุง ต.วังไทร อ.คลองขลุง" },
  "P.50A": { name: "คลองวังเจ้า", place: "บ้านดงส้ม อ.โกสัมพีนคร" },
};

// ---------- time helpers (Thai time, no locale APIs) ----------
export function thaiParts(ms) {
  const d = new Date(ms + TH_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours() };
}
const pad = (n) => String(n).padStart(2, "0");
export function ridDate(ms) {
  const p = thaiParts(ms);
  return `${pad(p.d)}/${pad(p.m)}/${p.y + 543}`;
}
export function isoThai(y, m, d, h, min = 0) {
  // hour 24 is midnight of the next day
  const ms = Date.UTC(y, m - 1, d, h, min) - TH_OFFSET;
  return new Date(ms).toISOString();
}
export function toThaiIso(isoUtc) {
  const ms = Date.parse(isoUtc) + TH_OFFSET;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+07:00`;
}

// ---------- RID ----------
export function parseColModel(col) {
  const codes = {};
  for (const g of col.groupHeadersStationCode || []) {
    const code = String(g.titleText || "").replace(/<[^>]+>/g, "").trim();
    const m = /^wlvalues(\d+)$/.exec(g.startColumnName || "");
    if (code && m) codes[code] = Number(m[1]);
  }
  const banks = {};
  for (const c of col.colModel || []) {
    const m = /^wlvalues(\d+)$/.exec(c.name || "");
    const b = /ระดับตลิ่ง\s*([\d.]+)/.exec(c.label || "");
    if (m && b) banks[Number(m[1])] = Number(b[1]);
  }
  return { codes, banks };
}

// rows: RID jqGrid rows for one Thai calendar day; dayMs: any instant in that Thai day
export function parseRidDay(colInfo, rows, dayMs) {
  const p = thaiParts(dayMs);
  const out = { _columns: {}, _criteria: {} };
  for (const [code, idx] of Object.entries(colInfo.codes)) if (STATIONS[code]) out._columns[code] = idx;
  for (const row of rows || []) {
    const h = Math.round(Number(String(row.hourlytime).replace(",", ".")));
    if (!Number.isFinite(h) || h < 0 || h > 24) continue;
    const t = isoThai(p.y, p.m, p.d, h);
    for (const [code, idx] of Object.entries(colInfo.codes)) {
      if (!STATIONS[code]) continue;
      const crit = /([\d.]+)\s*-\s*([\d.]+)/.exec(String(row[`WLCriteria${idx}`] || ""));
      if (crit) out._criteria[code] = { watch: Number(crit[1]), bank: colInfo.banks[idx] ?? Number(crit[2]) };
      const raw = row[`wlvalues${idx}`];
      if (raw === "" || raw === null || raw === undefined) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      (out[code] ||= []).push({
        t,
        v: Math.round(v * 100) / 100,
        watch: crit ? Number(crit[1]) : null,
        bank: colInfo.banks[idx] ?? (crit ? Number(crit[2]) : null),
      });
    }
  }
  return out;
}

export function buildRiver(dayParts) {
  // dayParts: array of parseRidDay results (any order); returns hourly series for the last KEEP_HOURS
  const byCode = {};
  const columns = {};
  const criteria = {};
  for (const part of dayParts) for (const [code, pts] of Object.entries(part)) {
    if (code === "_columns") { Object.assign(columns, pts); continue; }
    if (code === "_criteria") { Object.assign(criteria, pts); continue; }
    (byCode[code] ||= []).push(...pts);
  }
  if (!(byCode["P.7A"] || []).length) throw new Error("RID: no readings for P.7A");
  // The window ends at the newest reading of any gauge, so one quiet gauge cannot hold the whole page back.
  const lastMs = Math.max(...Object.values(byCode).flat().map((x) => Date.parse(x.t)));
  const startMs = lastMs - (KEEP_HOURS - 1) * HOUR;
  const stations = {};
  for (const [code, meta] of Object.entries(STATIONS)) {
    const pts = byCode[code] || [];
    const s = Array(KEEP_HOURS).fill(null);
    let watch = criteria[code]?.watch ?? null, bank = criteria[code]?.bank ?? null;
    for (const x of pts) {
      const i = Math.round((Date.parse(x.t) - startMs) / HOUR);
      if (i >= 0 && i < KEEP_HOURS) s[i] = x.v;
      if (x.watch != null) watch = x.watch;
      if (x.bank != null) bank = x.bank;
    }
    // A gauge RID lists but that is silent in the window is kept with empty readings, so the page can say so.
    if (watch == null || bank == null || (!s.some((v) => v != null) && columns[code] == null)) continue;
    stations[code] = { ...meta, watch, bank, col: columns[code] ?? null, s };
  }
  if (!stations["P.7A"]) throw new Error("RID: P.7A missing after build");
  return {
    source: "กรมชลประทาน รายงานระดับน้ำรายชั่วโมง",
    source_url: RID_PAGE,
    start: toThaiIso(new Date(startMs).toISOString()),
    observed_at: toThaiIso(new Date(lastMs).toISOString()),
    stations,
  };
}

async function fetchJson(url, init = {}, tries = 3) {
  let err;
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(40000) });
      if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
      const text = await r.text();
      if (!text || text.trim() === "null") throw new Error(`${url} empty`);
      return JSON.parse(text);
    } catch (e) {
      err = e;
      await new Promise((res) => setTimeout(res, 3000 * (k + 1)));
    }
  }
  throw err;
}

async function fetchRidDay(dayMs) {
  const date = ridDate(dayMs);
  const col = await fetchJson(RID_BASE + "HDService.svc/GetColModelAllHLWLCriteriaAD2", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ hydro: { UtokID: 2, BasinID: 6, TimeCurrent: date } }),
  });
  const body = new URLSearchParams({
    "DW[UtokID]": "2", "DW[BasinID]": "6", "DW[TimeCurrent]": date,
    _search: "false", nd: String(Date.now()), rows: "100", page: "1", sidx: "indexhourly", sord: "asc",
  });
  const data = await fetchJson(RID_BASE + "getGroupHourlyWaterLevelReportAllHLWLCriteriaAD.ashx", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
    body: body.toString(),
  });
  return parseRidDay(parseColModel(col), data.rows, dayMs);
}

// ---------- DDPM Cell Broadcast ----------
export function parseCB(data, nowMs, province = "62", days = 7) {
  const aids = new Set((data.bridge_alert_location || []).filter((x) => String(x.province_code) === province).map((x) => x.alert_id));
  const msg = new Map((data.dim_message || []).map((m) => [m.message_id, m]));
  const items = [];
  for (const x of data.fact_cb || []) {
    if (!aids.has(x.alert_id)) continue;
    const dm = /D-(\d{4})(\d{2})(\d{2})/.exec(String(x.date_id || ""));
    const tm = /(\d{1,2}):(\d{2})/.exec(String(x.time || ""));
    if (!dm || !tm) continue;
    const sentIso = isoThai(+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]);
    const sent = Date.parse(sentIso);
    if (nowMs - sent > days * 24 * HOUR) continue;
    const dur = Number(x.duration_hour) || 0;
    items.push({
      id: x.alert_id,
      sent_at: toThaiIso(sentIso),
      duration_h: dur,
      title: String(x.title || ""),
      text: String(msg.get(x.message_id)?.message_th || "").trim(),
      active: dur > 0 && nowMs < sent + dur * HOUR,
    });
  }
  items.sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  return { source: "ปภ. ข้อความเตือนเข้ามือถือ (Cell Broadcast) ข้อมูลเปิด", source_url: "https://catalog.disaster.go.th/th/dataset/cell-broadcast", checked_at: toThaiIso(new Date(nowMs).toISOString()), items };
}

// ---------- TMD 7-day forecast ----------
export function parseTMD(data, provinceTh = "กำแพงเพชร") {
  const list = data?.Provinces?.Province || [];
  const p = list.find((x) => x.ProvinceNameThai === provinceTh);
  if (!p) throw new Error("TMD: province not found");
  const f = p.SevenDaysForecast;
  const days = f.ForecastDate.map((d, i) => {
    const [dd, mm, yy] = d.split("/").map(Number);
    return {
      date: `${yy}-${pad(mm)}-${pad(dd)}`,
      rain_pct: Number(f.PercentRainCover[i]),
      desc: String(f.DescriptionThai[i] || ""),
      tmin: Number(f.MinimumTemperature[i]),
      tmax: Number(f.MaximumTemperature[i]),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { source: "กรมอุตุนิยมวิทยา พยากรณ์อากาศ 7 วัน (ข้อมูลเปิด)", source_url: "https://www.tmd.go.th/weatherForecast7Days?province=กำแพงเพชร", fetched_at: String(data?.header?.LastBuildDate || ""), days }; // TMD stamps each response with the request time
}

// ---------- main ----------
async function readPrevious() {
  try { return JSON.parse(await readFile(path.join(OUT_DIR, "data.json"), "utf8")); } catch { return null; }
}

// Content used to decide whether anything meaningful changed. Times that change on every run are left out.
export function stable(obj) {
  const c = structuredClone(obj);
  delete c.generated_at;
  if (c.alerts) delete c.alerts.checked_at;
  if (c.forecast) { delete c.forecast.fetched_at; delete c.forecast.build_at; }
  return JSON.stringify(c);
}

// Write when something changed, and otherwise at least every HEARTBEAT_H hours, so the page can show
// when the alerts were last saved without the bot committing on every 30-minute run.
export const HEARTBEAT_H = 3;
export function shouldWrite(prev, data, now) {
  if (!prev || stable(prev) !== stable(data)) return true;
  const last = Date.parse(prev.generated_at || "");
  return !Number.isFinite(last) || now - last >= HEARTBEAT_H * HOUR;
}

export async function main(now = Date.now()) {
  const prev = await readPrevious();
  const log = [];
  let river = prev?.river || null, alerts = prev?.alerts || null, forecast = prev?.forecast || null;
  try {
    // Oldest day first, so the newest thresholds win. Before 10:00 Thai time the 33-hour window reaches back two days.
    const days = (thaiParts(now).h < 10 ? [now - 48 * HOUR] : []).concat([now - 24 * HOUR, now]);
    const parts = [];
    for (const ms of days) parts.push(await fetchRidDay(ms));
    river = buildRiver(parts);
    log.push(`RID ok, observed_at ${river.observed_at}`);
  } catch (e) {
    log.push(`RID failed: ${e.message}${e.cause ? " (" + (e.cause.code || e.cause.message) + ")" : ""}; keeping previous river data`);
    if (process.env.GITHUB_ACTIONS) console.log("::warning::RID could not be reached from this runner; river data was not refreshed here. Browsers in Thailand read RID directly.");
  }
  try { alerts = parseCB(await fetchJson(CB_URL), now); log.push(`CB ok, ${alerts.items.length} item(s) for province 62 in 7 days`); }
  catch (e) { log.push(`CB failed: ${e.message}`); }
  try { forecast = parseTMD(await fetchJson(TMD_URL)); log.push(`TMD ok, ${forecast.days.length} days`); }
  catch (e) { log.push(`TMD failed: ${e.message}`); }
  if (!river) { console.log(log.join("\n")); throw new Error("no river data at all; nothing written"); }
  const data = { version: 1, generated_at: new Date(now).toISOString(), river, alerts, forecast };
  if (!shouldWrite(prev, data, now)) { log.push("no change; files not written"); console.log(log.join("\n")); return { changed: false, data }; }
  const json = JSON.stringify(data);
  await writeFile(path.join(OUT_DIR, "data.json"), json + "\n");
  await writeFile(path.join(OUT_DIR, "data.js"), `window.KPP_DATA=${json};\n`);
  log.push("written data.json and data.js");
  console.log(log.join("\n"));
  return { changed: true, data };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
