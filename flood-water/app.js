// /flood-water/: fetch one province's live water levels and 24-hour rain from HII's ThaiWater API and show a short summary.
// It loads on a tap or from a shared link (?p=21), then reloads by itself every REFRESH_MINUTES while the page is open and
// visible, and shows how old every reading is. If a reload fails, the last answers are drawn again with the current time,
// so ages keep growing and readings older than 3 hours drop out. Everything from the API is shown with textContent.
// Nothing is stored on the device.
import { PROVINCES } from "../flood/provinces.js";
import { PROVINCE_CODES } from "./province_codes.js";
import { waterUrl, rainUrl, waterSummary, rainSummary, stationLine, rainLine, ageText, newestTime, provinceFromQuery, REFRESH_MINUTES } from "./water_model.js";

const $ = id => document.getElementById(id);
const HIGH_SHOWN = 8;
const REFRESH_MS = REFRESH_MINUTES * 60 * 1000;

for (const name of PROVINCES) {
  if (!PROVINCE_CODES[name]) continue;
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  $("province").append(option);
}

function fillList(list, lines) {
  list.replaceChildren(...lines.map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
}

function clockText(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
}

async function getJson(url, signal) {
  const response = await fetch(url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Draws one province from HII's raw answers (`view` = { province, code, waterAnswer, rainAnswer, loadedAt }).
// `now` sets every age and the 3-hour limit; `loadedAt` is when the answers arrived. `failed` means the latest reload
// did not work, so the warning says which time the data is from. Summaries are made first, so a broken answer throws
// before anything on the page changes.
function show(view, now, failed) {
  const water = waterSummary(view.waterAnswer, view.code, now);
  const rain = rainSummary(view.rainAnswer, view.code, now);
  const loadedClock = clockText(view.loadedAt.toISOString());
  $("result-title").textContent = `จังหวัด${view.province}`;
  const latest = newestTime(water.latest, rain.latest);
  $("result-time").textContent = `ข้อมูลใหม่ที่สุดวัดเมื่อ ${latest ? `${clockText(latest)} น. (${ageText(latest, now)})` : "ไม่ทราบ"} · อัปเดตหน้าเมื่อ ${loadedClock} น. · สถานีวัดระดับน้ำที่มีข้อมูล ${water.total} แห่ง`;

  $("over-box").hidden = water.over.length === 0;
  fillList($("over-list"), water.over.map(item => stationLine(item, now)));
  $("high-box").hidden = water.high.length === 0;
  fillList($("high-list"), water.high.slice(0, HIGH_SHOWN).map(item => stationLine(item, now)));
  $("high-more").hidden = water.high.length <= HIGH_SHOWN;
  $("high-more").textContent = `และอีก ${water.high.length - HIGH_SHOWN} แห่ง ดูทั้งหมดที่ thaiwater.net`;
  $("act-box").hidden = water.over.length === 0;

  const calm = water.over.length === 0 && water.high.length === 0;
  $("calm").hidden = !calm;
  $("calm").textContent = water.total === 0
    ? "ตอนนี้ไม่มีข้อมูลสถานีวัดระดับน้ำที่ใหม่กว่า 3 ชั่วโมงในจังหวัดนี้ ดูที่ thaiwater.net หรือติดตามประกาศในพื้นที่"
    : "ตอนนี้ไม่มีสถานีในจังหวัดนี้ที่น้ำเกิน 70% ของตลิ่ง แต่ถ้าน้ำขึ้นเร็วใกล้บ้าน ให้เชื่อสิ่งที่เห็นและไปที่ปลอดภัยก่อน";

  $("rain-box").hidden = rain.total === 0;
  $("rain-count").textContent = `สถานีวัดฝน ${rain.total} แห่ง · ฝนมากกว่า 90 มม. ${rain.over90} แห่ง · มากกว่า 35 มม. ${rain.over35} แห่ง`;
  fillList($("rain-list"), rain.top.map(item => rainLine(item, now)));

  $("stale-warning").textContent = failed ? `อัปเดตล่าสุดไม่สำเร็จ ข้อมูลด้านล่างเป็นของเวลา ${loadedClock} น. ระบบจะลองใหม่เอง หรือเปิด thaiwater.net โดยตรง` : "";
  $("stale-warning").hidden = !failed;
  $("result").hidden = false;
}

let busy = false;
let lastGood = null; // the last answers HII gave that could be shown: { province, code, waterAnswer, rainAnswer, loadedAt }
let timer = null;

function scheduleRefresh() {
  clearTimeout(timer);
  timer = setTimeout(() => { if (document.visibilityState === "visible") load(false); else timer = null; }, REFRESH_MS);
}

async function load(byTap) {
  if (busy) return;
  const province = $("province").value;
  const code = PROVINCE_CODES[province];
  if (!code) { $("status").textContent = "กรุณาเลือกจังหวัดก่อน"; $("province").focus(); return; }
  busy = true;
  $("look").disabled = true;
  $("status").textContent = "กำลังขอข้อมูลล่าสุดจาก สสน.…";
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), 20000);
  try {
    const [waterAnswer, rainAnswer] = await Promise.all([getJson(waterUrl(code), controller.signal), getJson(rainUrl(code), controller.signal)]);
    const now = new Date();
    const view = { province, code, waterAnswer, rainAnswer, loadedAt: now };
    show(view, now, false);
    lastGood = view;
    history.replaceState(null, "", `?p=${code}`);
    $("share-link").href = location.href;
    $("share-link").textContent = location.href;
    $("share-line").hidden = false;
    $("status").textContent = `อัปเดตแล้วเมื่อ ${clockText(now.toISOString())} น. หน้านี้จะอัปเดตเองทุก ${REFRESH_MINUTES} นาทีขณะเปิดอยู่`;
    if (byTap) $("result").scrollIntoView({ block: "start" });
    scheduleRefresh();
  } catch {
    if (lastGood?.code === code && !$("result").hidden) {
      // Draw the last good answers again with the current time, so every age grows and readings older than 3 hours
      // drop out, and say plainly which time the data is from.
      show(lastGood, new Date(), true);
      $("status").textContent = "อัปเดตไม่สำเร็จ จะลองใหม่อีกครั้งเอง";
      scheduleRefresh();
    } else {
      $("result").hidden = true;
      $("share-line").hidden = true;
      $("status").textContent = "ดึงข้อมูลจาก สสน. ไม่สำเร็จ ลองใหม่อีกครั้ง หรือเปิด thaiwater.net โดยตรง · ถ้าอันตรายโทร 1784 หรือ 1669";
    }
  } finally {
    clearTimeout(abort);
    busy = false;
    $("look").disabled = false;
  }
}

$("look").addEventListener("click", () => load(true));
$("province").addEventListener("change", () => { clearTimeout(timer); timer = null; });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && lastGood && Date.now() - lastGood.loadedAt.getTime() >= REFRESH_MS) load(false);
});

const fromLink = provinceFromQuery(location.search, PROVINCE_CODES);
if (fromLink) {
  $("province").value = fromLink;
  load(false);
}
