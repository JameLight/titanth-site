// KFR-17 proposal (Claude): recent official Cell Broadcast alerts for one province.
// Source: open data of Thailand's National Disaster Warning Center (DDPM catalog dataset "cell-broadcast",
// licence "Open Data Common"). The file is the data behind the NDWC dashboard, not a documented API,
// so the page must fall back to the dashboard link whenever this throws.
// Pure functions: the page fetches (on a tap, not on load), caches the last copy, and renders with textContent.

export const NDWC_ALERTS_URL = "https://academicndwc.github.io/CBS-DashBoard/data/data.json";
export const NDWC_DASHBOARD_URL = "https://academicndwc.github.io/CBS-DashBoard/";

const TYPE_TH = Object.freeze({
  PRA: "การแจ้งเตือนระดับชาติ",
  EXA: "การแจ้งเตือนภัยขั้นรุนแรง",
  ASA: "การแจ้งเตือนเหตุกราดยิง",
  ACI: "การแจ้งเตือนเพื่อให้ข้อมูล",
  ALL: "การแจ้งเตือนการสิ้นสุดภัย"
});

function table(data, name) {
  const rows = data?.[name];
  if (!Array.isArray(rows)) throw new Error(`ข้อมูลคำเตือนไม่ครบ (${name})`);
  return rows;
}

// date_id "D-20260926" + time "02:02" are Thailand time.
export function alertTime(dateId, time) {
  const d = /^D-(\d{4})(\d{2})(\d{2})$/.exec(String(dateId ?? ""));
  const t = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  if (!d || !t) return null;
  const at = new Date(`${d[1]}-${d[2]}-${d[3]}T${t[1]}:${t[2]}:00+07:00`);
  return Number.isFinite(at.getTime()) ? at : null;
}

export function alertsForProvince(data, provinceName, { now = new Date(), days = 7, limit = 5 } = {}) {
  const facts = table(data, "fact_cb");
  const messages = table(data, "dim_message");
  const places = table(data, "bridge_alert_location");
  const provinces = table(data, "dim_province");
  const events = Array.isArray(data.dim_event) ? data.dim_event : [];
  const name = String(provinceName ?? "").trim();
  const province = provinces.find(p => p?.province_name_th === name);
  if (!province) return [];
  const code = String(province.province_code);
  const inProvince = new Set(places.filter(p => String(p?.province_code) === code).map(p => p.alert_id));
  const text = new Map(messages.map(m => [m?.message_id, m?.message_th]));
  const label = new Map(events.map(e => [e?.event_id, e?.event_th]));
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  return facts
    .filter(f => inProvince.has(f?.alert_id))
    .map(f => ({ fact: f, at: alertTime(f.date_id, f.time) }))
    .filter(({ at }) => at && at.getTime() >= since && at.getTime() <= now.getTime() + 60 * 60 * 1000)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ fact, at }) => ({
      id: String(fact.alert_id),
      at: at.toISOString(),
      type: String(fact.event_id ?? ""),
      typeLabel: label.get(fact.event_id) ?? TYPE_TH[fact.event_id] ?? "การแจ้งเตือน",
      title: String(fact.title ?? ""),
      message: String(text.get(fact.message_id) ?? ""),
      hours: Number.isFinite(fact.duration_hour) ? fact.duration_hour : null
    }));
}

// Newest alert time in the whole file: shows how fresh the copy is ("ข้อมูลล่าสุดของ ศภช. เวลา …").
export function newestAlertTime(data) {
  let newest = null;
  for (const f of table(data, "fact_cb")) {
    const at = alertTime(f?.date_id, f?.time);
    if (at && (!newest || at > newest)) newest = at;
  }
  return newest ? newest.toISOString() : null;
}
