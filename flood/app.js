import { NEEDS, CHANNELS, STATUS, makeCase, recordHandoffAttempt, isStale,
  possibleDuplicates, shareText, casesCsv } from "./model.js";
import { listCases, putCase, deleteCase } from "./storage.js";

const $ = selector => document.querySelector(selector);
const form = $("#case-form");
const list = $("#case-list");
let cases = [];
let pendingHandoff = null;

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content != null) element.textContent = String(content);
  return element;
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 6500);
}

function showError(message) {
  const box = $("#form-error");
  box.textContent = message;
  box.hidden = false;
  box.scrollIntoView({ block: "nearest" });
}

function askConfirm(message, title = "ยืนยันการทำรายการ") {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  return new Promise(resolve => {
    let accepted = false;
    $("#confirm-cancel").onclick = () => dialog.close();
    $("#confirm-accept").onclick = () => { accepted = true; dialog.close(); };
    dialog.addEventListener("close", () => resolve(accepted), { once: true });
    dialog.showModal();
  });
}

function renderNeeds() {
  for (const [key, label] of Object.entries(NEEDS)) {
    const wrapper = node("label", "need");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "needs";
    input.value = key;
    wrapper.append(input, node("span", "", label));
    $("#needs-list").append(wrapper);
  }
}

function dateText(value) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function button(label, className, onClick) {
  const b = node("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function renderCase(item) {
  const card = node("article", `case-card ${item.routingHint === "RED" ? "urgent" : ""}`);
  const head = node("div", "case-head");
  head.append(node("h3", "", `${item.location.landmark || "พิกัดที่บันทึก"} · ${item.location.province}`));
  const time = node("time", "", dateText(item.createdAt));
  time.dateTime = item.createdAt;
  head.append(time);
  card.append(head);
  const badges = node("div", "badges");
  const hint = node("span", `badge ${item.routingHint === "RED" ? "red" : item.routingHint === "ORANGE" ? "orange" : ""}`,
    `สัญญาณ ${item.routingHint} • ไม่ใช่คำวินิจฉัย`);
  badges.append(hint);
  badges.append(node("span", `badge ${item.status === STATUS.LOCAL_ONLY ? "local" : "attempt"}`,
    item.status === STATUS.LOCAL_ONLY ? "เก็บในเครื่องเท่านั้น" : "ผู้ใช้ระบุว่าส่งต่อแล้ว • ยังไม่ยืนยันผู้รับ"));
  card.append(badges);
  card.append(node("p", "", `${item.peopleCount} คน · ${item.needs.map(n => NEEDS[n]).join(", ")}`));
  if (isStale(item)) card.append(node("p", "case-warning", "ข้อมูลนี้บันทึกเกิน 6 ชั่วโมงแล้ว ควรตรวจสถานการณ์ใหม่ก่อนส่งต่อ"));
  if (item.routingHint === "RED") card.append(node("p", "case-warning", "มีสัญญาณอันตราย โทร 1784 หรือ 1669 ตามเหตุทันที"));
  if (item.status === STATUS.LOCAL_ONLY) card.append(node("p", "case-warning", "เคสนี้ยังอยู่ในอุปกรณ์นี้ ไม่มีผู้รับเคสอัตโนมัติ"));
  const actions = node("div", "case-actions");
  actions.append(button("คัดลอกแล้วเปิด LINE ปภ.", "secondary-button", () => copyThenLine(item)));
  actions.append(button("คัดลอกข้อความ", "secondary-button", () => copyCase(item)));
  actions.append(button("แชร์ข้อความ", "secondary-button", () => shareCase(item)));
  actions.append(button("บันทึกว่าฉันพยายามส่งต่อแล้ว", "text-button", () => handoffCase(item)));
  actions.append(button("ลบเคส", "danger-button", () => removeCase(item)));
  card.append(actions);
  return card;
}

function render() {
  cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("#case-count").textContent = `${cases.length} เคส`;
  list.replaceChildren();
  if (!cases.length) {
    list.append(node("div", "empty", "ยังไม่มีเคสในอุปกรณ์นี้ เริ่มจากแบบฟอร์มด้านบน"));
    return;
  }
  for (const item of cases) list.append(renderCase(item));
}

async function refresh() {
  cases = await listCases();
  render();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  $("#form-error").hidden = true;
  try {
    const values = new FormData(form);
    const item = makeCase({
      province: values.get("province"), district: values.get("district"),
      subdistrict: values.get("subdistrict"), landmark: values.get("landmark"),
      lat: values.get("lat"), lon: values.get("lon"), accuracyMeters: values.get("accuracyMeters") || null,
      peopleCount: values.get("peopleCount"), contactPhone: values.get("contactPhone"),
      needs: values.getAll("needs"), details: values.get("details")
    });
    const duplicates = possibleDuplicates(item, cases);
    if (duplicates.length && !await askConfirm(`พบเคสคล้ายกัน ${duplicates.length} เคสในช่วง 2 ชั่วโมงที่ผ่านมา ต้องการบันทึกอีกเคสหรือไม่`, "พบเคสคล้ายกัน")) return;
    await putCase(item);
    form.reset();
    $("#gps-status").textContent = "ใช้จุดสังเกตแทน GPS ได้";
    await refresh();
    $("#case-list").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("บันทึกในเครื่องแล้ว ยังไม่มีการส่งไปยังผู้รับเคส");
  } catch (error) { showError(error.message); }
});

$("#gps-button").addEventListener("click", () => {
  const status = $("#gps-status");
  if (!navigator.geolocation) { status.textContent = "อุปกรณ์นี้ไม่มี GPS กรุณากรอกจุดสังเกต"; return; }
  status.textContent = "กำลังขอพิกัด…";
  navigator.geolocation.getCurrentPosition(position => {
    form.elements.lat.value = position.coords.latitude;
    form.elements.lon.value = position.coords.longitude;
    form.elements.accuracyMeters.value = Math.round(position.coords.accuracy);
    status.textContent = `ได้พิกัดแล้ว (คลาดเคลื่อนประมาณ ${Math.round(position.coords.accuracy)} เมตร) กรุณาตรวจจุดสังเกตด้วย`;
  }, () => { status.textContent = "ไม่ได้รับพิกัด กรุณากรอกจุดสังเกตด้วยมือ"; },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});

async function copyCase(item) {
  try {
    await navigator.clipboard.writeText(shareText(item));
    toast("คัดลอกข้อความแล้ว นำไปวางใน LINE @1784DDPM หรืออ่านให้เจ้าหน้าที่ 1784 ฟัง ยังไม่มีใครได้รับข้อมูลจนกว่าคุณจะส่ง");
  } catch { toast("คัดลอกไม่สำเร็จ ลองใช้ปุ่มแชร์หรือเปิดผ่าน HTTPS/localhost"); }
}

async function copyThenLine(item) {
  try {
    await navigator.clipboard.writeText(shareText(item));
    toast("คัดลอกแล้ว กำลังเปิด LINE ปภ. ให้วางข้อความในแชท แล้วกดส่งตำแหน่ง (Location) ด้วย ยังไม่มีใครได้รับข้อมูลจนกว่าคุณจะกดส่ง");
  } catch { toast("คัดลอกไม่สำเร็จ จะเปิด LINE ปภ. ให้ กรุณาพิมพ์ข้อมูลตามเคส หรือกดปุ่มแชร์แทน"); }
  setTimeout(() => { location.href = "https://line.me/R/ti/p/%401784DDPM"; }, 900);
}

async function shareCase(item) {
  if (!navigator.share) return copyCase(item);
  try {
    await navigator.share({ title: "ขอความช่วยเหลือน้ำท่วม", text: shareText(item) });
    toast("เปิดการแชร์แล้ว ระบบยังไม่มีหลักฐานว่าปลายทางได้รับข้อมูล");
  } catch (error) {
    if (error.name !== "AbortError") toast("แชร์ไม่สำเร็จ ลองคัดลอกข้อความแทน");
  }
}

async function handoffCase(item) {
  pendingHandoff = item;
  $("#handoff-form").reset();
  $("#handoff-dialog").showModal();
}

$("#handoff-cancel").addEventListener("click", () => $("#handoff-dialog").close());
$("#handoff-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!pendingHandoff) return;
  const channel = new FormData(event.currentTarget).get("channel");
  if (!Object.hasOwn(CHANNELS, channel)) return;
  try {
    await putCase(recordHandoffAttempt(pendingHandoff, { channel }));
    $("#handoff-dialog").close();
    pendingHandoff = null;
    await refresh();
    toast("บันทึกคำยืนยันของคุณแล้ว ยังไม่มีหลักฐานว่าปลายทางรับเคส");
  } catch (error) { toast(error.message); }
});

async function removeCase(item) {
  if (!await askConfirm("หากเคยส่งข้อความไปช่องทางอื่น ข้อมูลปลายทางจะไม่ถูกลบ", "ลบเคสนี้ออกจากอุปกรณ์")) return;
  try { await deleteCase(item.caseId); await refresh(); toast("ลบเคสในอุปกรณ์นี้แล้ว"); }
  catch (error) { toast(error.message); }
}

function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportCases(format) {
  if (!cases.length) { toast("ยังไม่มีเคสให้ส่งออก"); return; }
  if (!await askConfirm("ไฟล์นี้มีเบอร์โทรและพิกัดละเอียด ถ้ามี กรุณาเก็บและส่งต่อเฉพาะผู้ที่จำเป็น", "ส่งออกข้อมูลส่วนบุคคล")) return;
  const date = new Date().toISOString().slice(0, 10);
  if (format === "json") download(`khem-flood-cases-${date}.json`,
    JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), cases }, null, 2), "application/json;charset=utf-8");
  else download(`khem-flood-cases-${date}.csv`, casesCsv(cases), "text/csv;charset=utf-8");
  toast("สร้างไฟล์แล้ว โปรดระวังข้อมูลส่วนบุคคลในไฟล์");
}

$("#export-json").addEventListener("click", () => exportCases("json"));
$("#export-csv").addEventListener("click", () => exportCases("csv"));

renderNeeds();
refresh().catch(error => { list.replaceChildren(node("div", "error", `${error.message} กรุณาใช้เบราว์เซอร์ปกติและเปิดพื้นที่จัดเก็บข้อมูล`)); });
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
    .then(registration => registration.update())
    .catch(() => toast("ติดตั้งโหมดออฟไลน์ไม่สำเร็จ กรุณาลองโหลดหน้าใหม่ขณะออนไลน์"));
}
