// /flood-water/: on a tap, fetch one province's live water levels and 24-hour rain from HII's ThaiWater API and show a short
// summary. Everything from the API is shown with textContent. Nothing is stored on the device.
import { PROVINCES } from "../flood/provinces.js";
import { PROVINCE_CODES } from "./province_codes.js";
import { waterUrl, rainUrl, waterSummary, rainSummary, stationLine, rainLine } from "./water_model.js";

const $ = id => document.getElementById(id);
const HIGH_SHOWN = 8;

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

function show(province, water, rain, now) {
  $("result-title").textContent = `จังหวัด${province}`;
  const latest = water.latest || rain.latest;
  $("result-time").textContent = `ข้อมูลล่าสุดเวลา ${latest ? clockText(latest) + " น." : "ไม่ทราบ"} · อ่านเมื่อ ${clockText(now.toISOString())} น. · สถานีวัดระดับน้ำที่มีข้อมูล ${water.total} แห่ง`;

  $("over-box").hidden = water.over.length === 0;
  fillList($("over-list"), water.over.map(stationLine));
  $("high-box").hidden = water.high.length === 0;
  fillList($("high-list"), water.high.slice(0, HIGH_SHOWN).map(stationLine));
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
  fillList($("rain-list"), rain.top.map(rainLine));

  $("result").hidden = false;
}

let busy = false;
$("look").addEventListener("click", async () => {
  if (busy) return;
  const province = $("province").value;
  const code = PROVINCE_CODES[province];
  if (!code) { $("status").textContent = "กรุณาเลือกจังหวัดก่อน"; $("province").focus(); return; }
  busy = true;
  $("look").disabled = true;
  $("status").textContent = "กำลังขอข้อมูลจาก สสน.…";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const [waterAnswer, rainAnswer] = await Promise.all([getJson(waterUrl(code), controller.signal), getJson(rainUrl(code), controller.signal)]);
    const now = new Date();
    show(province, waterSummary(waterAnswer, code, now), rainSummary(rainAnswer, code, now), now);
    $("status").textContent = "แสดงข้อมูลล่าสุดแล้ว กดอีกครั้งเพื่ออัปเดต";
    $("result").scrollIntoView({ block: "start" });
  } catch {
    $("result").hidden = true;
    $("status").textContent = "ดึงข้อมูลจาก สสน. ไม่สำเร็จ ลองใหม่อีกครั้ง หรือเปิด thaiwater.net โดยตรง · ถ้าอันตรายโทร 1784 หรือ 1669";
  } finally {
    clearTimeout(timer);
    busy = false;
    $("look").disabled = false;
  }
});
