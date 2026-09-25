import { NEEDS, CHANNELS, STATUS, makeCase, recordHandoffAttempt, isStale,
  possibleDuplicates, shareText, quickLocationText, ddpmLinePrefillUrl, validateTriage,
  quickLocationQrText, caseQrText, casesCsv } from "./model.js";
import { listCases, putCase, deleteCase } from "./storage.js";
import { qrSvg } from "./qr.js";
import { loadIntakeConfig, makeIntakeClient, caseStatusText, stripIntakeSecrets } from "./intake_client.js";
import { PROVINCES, canonicalProvince } from "./provinces.js";
import { NDWC_ALERTS_URL, alertsForProvince, newestAlertTime } from "./official_alerts.js";

const $ = selector => document.querySelector(selector);
const DDPM_LINE_URL = "https://lin.ee/MoS2rXU";
const GPS_HINT = "กดเฉพาะเมื่ออยู่ที่จุดเกิดเหตุ ถ้าแจ้งแทนคนอื่น ให้กรอกจุดสังเกตแทน";
const form = $("#case-form");
const list = $("#case-list");
let cases = [];
let pendingHandoff = null;
let gpsRequestGeneration = 0;
let draftTouched = false;
let updateAvailable = false;
let casesLoaded = false;
let quickLocationInProgress = false;
const intakeClientPromise = loadIntakeConfig().then(config => config ? makeIntakeClient(config) : null).catch(() => null);
intakeClientPromise.then(client => {
  if (!client) return;
  $("#service-ribbon").textContent = "ไม่ใช่เว็บหน่วยงานรัฐ • ข้อมูลจะถึงระบบทีมอาสาเฉพาะเมื่อคุณกดส่งและยินยอม • ถ้าอันตรายโทร 1784 หรือ 1669";
  $("#intro-copy").textContent = "กรอกเท่าที่รู้แล้วบันทึกในเครื่อง คุณยังส่งข้อความเองทาง LINE ปภ. หรือโทร 1784 ได้ ถ้าพื้นที่นี้มีทีมอาสาเฝ้า ระบบจะแสดงปุ่มส่งเข้าทีมแยกต่างหาก";
  $("#storage-scope").textContent = "บันทึกในเครื่องก่อน";
  $("#privacy-copy").textContent = "ข้อมูลเริ่มต้นเก็บในเบราว์เซอร์ของอุปกรณ์นี้ หากกดส่งเข้าทีมอาสาและยินยอม ข้อมูลเคสจะส่งไปยังระบบทีมอาสาด้วย ใครเปิดอุปกรณ์เดียวกันอาจเห็นเคสและรหัสอ่านสถานะ";
  $("#service-footer").textContent = "ไม่มีการส่งข้อมูลอัตโนมัติ • การส่งเข้าทีมอาสาต้องกดยืนยันแยก • การส่งถึงระบบยังไม่เท่ากับมีทีมรับเคส";
});

function clearGpsFields() {
  gpsRequestGeneration += 1;
  for (const name of ["lat", "lon", "accuracyMeters"]) {
    form.elements[name].value = "";
    form.elements[name].defaultValue = "";
  }
}

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content != null) element.textContent = String(content);
  return element;
}

function showQr(panel, message, isCase = false) {
  panel.replaceChildren();
  panel.hidden = false;
  try {
    const markup = qrSvg(message);
    const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
    if (svg.localName !== "svg") throw new Error("สร้าง QR ไม่สำเร็จ ให้คัดลอกข้อความแทน");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR ข้อความขอความช่วยเหลือน้ำท่วม");
    const details = node("details", "");
    details.append(node("summary", "", "อ่านข้อความใน QR"), node("pre", "", message));
    panel.append(node("p", "", "ให้คนที่มีสัญญาณสแกน คัดลอกข้อความ แล้วส่งต่อทาง LINE ปภ. หรืออ่านให้ 1784 ฟัง ข้อความยังไม่ถึงใครจนกว่าจะมีคนส่ง"),
      node("p", "", isCase ? "QR นี้เป็นข้อความย่อ มีพิกัดและเบอร์โทรถ้าระบุไว้ แต่ไม่รวมรายละเอียดเพิ่มเติม กรุณาส่งหรืออ่านฉบับเต็มเมื่อทำได้" : "QR นี้มีตำแหน่งของโทรศัพท์เครื่องนี้ ให้สแกนเฉพาะคนที่คุณไว้ใจ"),
      document.importNode(svg, true), details);
  } catch (error) {
    panel.append(node("p", "qr-error", error.message || "สร้าง QR ไม่สำเร็จ ให้คัดลอกข้อความแทน"));
  }
  panel.scrollIntoView({ block: "nearest" });
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
  if (typeof dialog.showModal !== "function") return Promise.resolve(window.confirm(`${title}\n${message}`));
  return new Promise(resolve => {
    let settled = false;
    const onClose = () => settle(false);
    const onCancel = event => { event.preventDefault(); settle(false); };
    function settle(accepted) {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      resolve(accepted);
    }
    $("#confirm-cancel").onclick = () => settle(false);
    $("#confirm-accept").onclick = () => settle(true);
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
}

function hasUnsavedDraft() {
  if (!casesLoaded || cases.length || draftTouched || quickLocationInProgress || lastQuickLocationText || pendingHandoff ||
      $("#confirm-dialog").open || $("#handoff-dialog").open) return true;
  const manualCopy = $("#manual-copy");
  if (manualCopy && !manualCopy.hidden) return true;
  return Array.from(form.elements).some(element => {
    if (element.type === "checkbox") return element.checked !== element.defaultChecked;
    if ("defaultValue" in element) return element.value !== element.defaultValue;
    return false;
  });
}

function reloadWhenSafe() {
  if (!updateAvailable) return;
  if (hasUnsavedDraft()) {
    if (casesLoaded) toast("มีแอปรุ่นใหม่ เมื่อทำงานกับเคสและบันทึกร่างเสร็จแล้ว กรุณาโหลดหน้านี้ใหม่");
    return;
  }
  location.reload();
}

function renderNeeds() {
  for (const [key, label] of Object.entries(NEEDS)) {
    if (["trapped", "immobile", "medical", "fast_water", "dialysis_oxygen"].includes(key)) continue;
    const wrapper = node("label", "need");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "needs";
    input.value = key;
    wrapper.append(input, node("span", "", label));
    const target = ["pregnant", "infant", "elderly", "disabled"].includes(key) ? "#vulnerable-needs-list" : "#needs-list";
    $(target).append(wrapper);
  }
}

function updateTriage() {
  const urgent = form.elements.urgentNow.value === "yes";
  const panel = $("#urgent-needs");
  panel.hidden = !urgent;
  for (const box of panel.querySelectorAll('input[type="checkbox"]')) {
    if (!urgent) box.checked = false;
    box.disabled = !urgent;
  }
}

function dateText(value) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function safeDateText(value) {
  return value && Number.isFinite(new Date(value).getTime()) ? dateText(value) : "ไม่ทราบเวลา";
}

const ALERT_CACHE_PREFIX = "promjaeng-official-alerts-v1:";

function renderOfficialAlerts(province, result, fromCache = false) {
  const target = $("#official-alerts-list");
  target.replaceChildren();
  const { alerts, fetchedAt, newest } = result;
  const cacheAge = Date.now() - new Date(fetchedAt).getTime();
  const cacheWarning = fromCache && cacheAge > 24 * 60 * 60 * 1000 ? " • สำเนาเก่าเกิน 24 ชั่วโมง ห้ามใช้แทนประกาศปัจจุบัน" : "";
  $("#official-alerts-status").textContent = `${fromCache ? "แสดงข้อมูลที่เคยดึงไว้ในเครื่อง (อาจเก่า)" : "ดึงข้อมูลแล้ว"} สำหรับ ${province} • ดึงเมื่อ ${safeDateText(fetchedAt)} • ประกาศล่าสุดในไฟล์ ${safeDateText(newest)}${cacheWarning}`;
  if (!alerts.length) {
    target.append(node("p", "alert-empty", "ไม่พบประกาศในข้อมูลย้อนหลัง 7 วันสำหรับจังหวัดนี้ ไม่ใช่การยืนยันว่าพื้นที่ปลอดภัย"));
    return;
  }
  for (const alert of alerts) {
    const card = node("article", "official-alert-card");
    card.append(node("h3", "", alert.title || alert.typeLabel), node("p", "alert-meta", `${safeDateText(alert.at)} • ${alert.typeLabel}`));
    if (alert.message) card.append(node("p", "", alert.message));
    target.append(card);
  }
}

$("#load-official-alerts").addEventListener("click", async () => {
  const chosen = $("#alert-province").value || canonicalProvince(form.elements.province.value);
  const province = canonicalProvince(chosen);
  if (!province) { $("#official-alerts-status").textContent = "กรุณาเลือกจังหวัดก่อนดูคำเตือนภัย"; return; }
  $("#alert-province").value = province;
  const button = $("#load-official-alerts");
  button.disabled = true;
  $("#official-alerts-status").textContent = `กำลังดึงข้อมูลจาก ศภช. สำหรับ ${province}…`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(NDWC_ALERTS_URL, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("โหลดข้อมูลไม่ได้");
    const data = await response.json();
    const result = { alerts: alertsForProvince(data, province), newest: newestAlertTime(data), fetchedAt: new Date().toISOString() };
    renderOfficialAlerts(province, result);
    try { localStorage.setItem(ALERT_CACHE_PREFIX + province, JSON.stringify(result)); } catch { /* offline copy is optional */ }
  } catch {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(ALERT_CACHE_PREFIX + province) || "null"); } catch { /* no valid copy */ }
    if (saved?.fetchedAt && Array.isArray(saved.alerts)) renderOfficialAlerts(province, saved, true);
    else {
      $("#official-alerts-list").replaceChildren();
      $("#official-alerts-status").textContent = "ยังดึงข้อมูลคำเตือนไม่ได้ กรุณาเปิดหน้า ศภช. จากลิงก์ด้านล่าง หรือโทร 1784 หากมีอันตราย";
    }
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
  }
});

function button(label, className, onClick) {
  const b = node("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function lineLink() {
  const link = node("a", "secondary-button", "เปิด LINE ปภ. (วางข้อความเอง)");
  link.href = DDPM_LINE_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
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
  badges.append(node("span", `badge ${item.intake ? "attempt" : item.status === STATUS.LOCAL_ONLY ? "local" : "attempt"}`,
    item.intake ? "ระบบทีมอาสารับข้อมูลแล้ว • ยังไม่ยืนยันว่ามีทีมรับเคส" :
      item.status === STATUS.LOCAL_ONLY ? "เก็บในเครื่องเท่านั้น" : "ผู้ใช้ระบุว่าส่งต่อแล้ว • ยังไม่ยืนยันผู้รับ"));
  card.append(badges);
  card.append(node("p", "", `${item.peopleCount} คน · ${item.needs.map(n => NEEDS[n]).join(", ")}`));
  if (isStale(item)) card.append(node("p", "case-warning", "ข้อมูลสถานการณ์นี้บันทึกเกิน 6 ชั่วโมงแล้ว ควรตรวจใหม่ก่อนส่งต่อ"));
  if (item.routingHint === "RED") card.append(node("p", "case-warning", "มีสัญญาณอันตราย โทร 1784 หรือ 1669 ตามเหตุทันที"));
  if (Number.isFinite(item.location.accuracyMeters) && item.location.accuracyMeters > 500) {
    card.append(node("p", "case-warning", `GPS คลาดเคลื่อนประมาณ ${Math.round(item.location.accuracyMeters)} เมตร กรุณาตรวจจุดสังเกตก่อนส่งต่อ`));
  }
  card.append(node("p", "case-warning", item.intake
    ? `รหัสอ้างอิง ${item.intake.code} ส่งถึงระบบแล้ว ตรวจสถานะเพื่อดูคำรายงานของทีม ถ้าอันตรายให้โทร 1784 หรือ 1669 ทันที`
    : item.status === STATUS.LOCAL_ONLY
      ? "เคสนี้ยังอยู่ในอุปกรณ์นี้ ไม่มีผู้รับเคสอัตโนมัติ"
      : "คุณระบุว่าส่งต่อแล้ว แต่ยังไม่มีหลักฐานว่ามีผู้รับเคส ถ้าไม่มีการตอบกลับ ให้โทร 1784 หรือ 1669 ตามเหตุ"));
  card.append(node("p", "shared-device-note", "ถ้าใช้เครื่องร่วมกับผู้อื่น ให้ลบเคสหลังส่งต่อและเก็บหลักฐานการตอบรับไว้ต่างหาก ข้อความที่คัดลอกอาจค้างในคลิปบอร์ดของเครื่อง"));
  const preview = node("details", "message-preview");
  preview.append(node("summary", "", "ดูข้อความที่จะส่ง (อ่านให้เจ้าหน้าที่ 1784 ฟังได้)"), node("pre", "", shareText(item)));
  card.append(preview);
  const actions = node("div", "case-actions");
  actions.append(button("คัดลอกข้อความ", "secondary-button", () => copyCase(item)));
  actions.append(lineLink());
  actions.append(button("แชร์ข้อความ", "secondary-button", () => shareCase(item)));
  const qrPanel = node("div", "qr-panel");
  qrPanel.hidden = true;
  actions.append(button("แสดง QR ส่งต่อออฟไลน์", "secondary-button", () => {
    try { showQr(qrPanel, caseQrText(item), true); }
    catch (error) { qrPanel.replaceChildren(node("p", "qr-error", error.message)); qrPanel.hidden = false; }
  }));
  actions.append(button("บันทึกว่าฉันพยายามส่งต่อแล้ว", "text-button", () => handoffCase(item)));
  if (item.intake?.code && item.intake?.secret) {
    const statusText = node("p", "intake-status", "สถานะล่าสุดยังไม่ได้อ่านจากระบบ");
    actions.append(button("อ่านสถานะจากระบบ", "secondary-button", () => readIntakeStatus(item, statusText)));
    const withdrawButton = button("ยกเลิกเคส/ลบข้อมูลของฉัน", "danger-button", () => withdrawSubmittedCase(item, withdrawButton));
    actions.append(withdrawButton);
    card.append(statusText);
  } else {
    const sendButton = button("ส่งเข้าทีมอาสา", "primary-button", () => sendToTeam(item, sendButton));
    sendButton.hidden = true;
    actions.append(sendButton);
    intakeClientPromise.then(async client => {
      if (!client || !navigator.onLine) return;
      if (!canonicalProvince(item.location.province)) {
        actions.append(node("p", "intake-status", "ชื่อจังหวัดไม่ตรงรายการ 77 จังหวัด เคสนี้ยังส่งเข้าทีมอาสาไม่ได้ กรุณาสร้างเคสใหม่โดยเลือกจังหวัดจากรายการ หรือส่งข้อความเอง"));
        return;
      }
      try {
        const onDuty = await client.dutyStatus(item.location.province);
        if (onDuty && card.isConnected) sendButton.hidden = false;
      } catch { /* A missing or mismatched backend contract keeps intake hidden. */ }
    });
  }
  actions.append(button("ลบเคส", "danger-button", () => removeCase(item)));
  card.append(actions, qrPanel);
  return card;
}

function intakeConsent(client) {
  const dialog = $("#intake-dialog");
  if (typeof dialog.showModal !== "function") return Promise.resolve(false);
  $("#intake-policy").href = client.config.privacyNoticeUrl;
  $("#intake-consent").checked = false;
  return new Promise(resolve => {
    let done = false;
    function finish(accepted) {
      if (done) return;
      done = true;
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      resolve(accepted);
    }
    const onClose = () => finish(false);
    const onCancel = event => { event.preventDefault(); finish(false); };
    $("#intake-cancel").onclick = () => finish(false);
    $("#intake-accept").onclick = () => {
      if (!$("#intake-consent").checked) { $("#intake-consent").focus(); return; }
      finish(true);
    };
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
}

function showReceiptRecovery(receipt) {
  const value = `รหัสเคส: ${receipt.code}\nรหัสลับสำหรับดูสถานะ: ${receipt.secret}`;
  const dialog = $("#receipt-recovery-dialog");
  if (typeof dialog.showModal !== "function") { window.prompt("คัดลอกรหัสนี้เก็บไว้: ระบบรับเคสแล้ว แต่เครื่องบันทึกไม่ได้", value); return; }
  $("#receipt-recovery-text").value = value;
  $("#receipt-recovery-close").onclick = () => { dialog.close(); $("#receipt-recovery-text").value = ""; };
  dialog.showModal();
}

async function sendToTeam(item, sendButton) {
  const client = await intakeClientPromise;
  if (!client || !await intakeConsent(client)) return;
  sendButton.disabled = true;
  try {
    const receipt = await client.submitCase(item);
    try {
      await putCase({ ...item, intake: receipt });
    } catch {
      showReceiptRecovery(receipt);
      return;
    }
    await refresh();
    toast(`ระบบบันทึกเคส ${receipt.code} แล้ว ยังไม่มีหลักฐานว่าทีมรับเคส ถ้าอันตรายโทร 1784 หรือ 1669`);
  } catch (error) {
    showError(error.definitive ? error.message : "ยังยืนยันไม่ได้ว่าระบบรับเคสหรือไม่ อย่ากดส่งซ้ำทันที ถ้าอันตรายโทร 1784 หรือ 1669 หรือส่ง LINE ปภ.");
  } finally { sendButton.disabled = false; }
}

async function readIntakeStatus(item, target) {
  const client = await intakeClientPromise;
  if (!client) { target.textContent = "ยังเชื่อมระบบสถานะไม่ได้ ถ้าอันตรายโทร 1784 หรือ 1669"; return; }
  try {
    const result = await client.caseStatus(item.intake);
    target.textContent = caseStatusText(result);
  } catch { target.textContent = "ยังอ่านสถานะจากระบบไม่ได้ ถ้าอันตรายโทร 1784 หรือ 1669"; }
}

async function withdrawSubmittedCase(item, control) {
  if (!await askConfirm("ระบบจะลบเบอร์ พิกัด จุดสังเกต และรายละเอียดจากฐานข้อมูล เคสที่ยังเปิดอยู่จะเปลี่ยนเป็นยกเลิก แต่ยังเก็บจังหวัด เวลา จำนวนคน ประเภทความต้องการ สถานะ และทีมไว้เพื่อสถิติ ข้อมูลที่ทีมเห็นหรือส่งต่อไปก่อนหน้าอาจยังอยู่กับปลายทางอื่น เมื่อระบบยืนยันแล้วจะลบสำเนาเคสในอุปกรณ์นี้ด้วย", "ยกเลิกเคสและลบข้อมูล")) return;
  const client = await intakeClientPromise;
  if (!client) { toast("ยังเชื่อมระบบไม่ได้ จึงยังยืนยันการลบข้อมูลไม่ได้"); return; }
  control.disabled = true;
  try {
    const result = await client.withdrawCase(item.intake);
    try {
      await deleteCase(item.caseId);
      clearManualCopy();
      await refresh();
      toast(result.status === "WITHDRAWN" ? "ระบบยืนยันยกเลิกเคสและลบข้อมูลละเอียดตามที่แจ้งแล้ว สำเนาในอุปกรณ์นี้ลบแล้ว" : "ระบบยืนยันลบข้อมูลละเอียดตามที่แจ้งแล้ว เคสที่ปิดไว้คงสถานะเดิม สำเนาในอุปกรณ์นี้ลบแล้ว");
    } catch {
      toast("ระบบยืนยันลบข้อมูลละเอียดตามที่แจ้งแล้ว แต่ลบสำเนาในอุปกรณ์นี้ไม่สำเร็จ กรุณาลบเคสในเครื่องอีกครั้ง");
    }
  } catch (error) {
    toast(error.definitive ? error.message : "ยังยืนยันไม่ได้ว่าระบบยกเลิกหรือลบข้อมูลแล้วหรือไม่ กรุณาอ่านสถานะจากระบบก่อนลองอีกครั้ง");
  } finally { control.disabled = false; }
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
  casesLoaded = true;
  render();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  $("#form-error").hidden = true;
  try {
    const values = new FormData(form);
    validateTriage(values.get("urgentNow"), values.getAll("needs"));
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
    updateTriage();
    clearGpsFields();
    draftTouched = false;
    $("#gps-status").textContent = GPS_HINT;
    await refresh();
    $("#case-list").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("บันทึกในเครื่องแล้ว ยังไม่มีการส่งไปยังผู้รับเคส");
  } catch (error) { showError(error.message); }
});

$("#gps-button").addEventListener("click", () => {
  draftTouched = true;
  const status = $("#gps-status");
  if (!navigator.geolocation) { status.textContent = "อุปกรณ์นี้ไม่มี GPS กรุณากรอกจุดสังเกต"; return; }
  const requestGeneration = ++gpsRequestGeneration;
  status.textContent = "กำลังขอพิกัด…";
  navigator.geolocation.getCurrentPosition(position => {
    if (requestGeneration !== gpsRequestGeneration) return;
    form.elements.lat.value = position.coords.latitude;
    form.elements.lon.value = position.coords.longitude;
    form.elements.accuracyMeters.value = Math.round(position.coords.accuracy);
    status.textContent = `ได้ตำแหน่งของโทรศัพท์นี้แล้ว (คลาดเคลื่อนประมาณ ${Math.round(position.coords.accuracy)} เมตร) กรุณากรอกจุดสังเกตด้วย`;
  }, () => { if (requestGeneration === gpsRequestGeneration) status.textContent = "ไม่ได้รับพิกัด กรุณากรอกจุดสังเกตด้วยมือ"; },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});

// KFR-10: find the location, then let the person send it straight into the DDPM LINE chat (one tap on a real link).
let lastQuickLocationText = "";
let lastQuickQrText = "";

function showQuickLocationResult(content, coords) {
  lastQuickLocationText = content;
  try { lastQuickQrText = quickLocationQrText(coords); }
  catch { lastQuickQrText = ""; }
  const line = $("#quick-location-line");
  line.href = ddpmLinePrefillUrl(content);
  line.hidden = false;
  $("#quick-location-more").hidden = false;
  $("#quick-location-qr").hidden = !lastQuickQrText;
  $("#quick-location-qr-panel").hidden = true;
  $("#quick-location-qr-panel").replaceChildren();
  $("#quick-location-row").hidden = false;
  $("#quick-location-status").textContent = `ได้ตำแหน่งแล้ว (คลาดเคลื่อนประมาณ ${Math.round(coords.accuracy)} เมตร) กด "ส่งเข้า LINE ปภ. ทันที" แล้วกดส่งใน LINE ข้อความยังไม่ถึงใครจนกว่าคุณจะกดส่ง ถ้าอันตรายให้โทร 1784 ด้วย`;
}

function showQuickLocationProblem(message) {
  lastQuickLocationText = "";
  lastQuickQrText = "";
  $("#quick-location-line").hidden = true;
  $("#quick-location-more").hidden = true;
  $("#quick-location-qr-panel").hidden = true;
  $("#quick-location-qr-panel").replaceChildren();
  $("#quick-location-row").hidden = false;
  $("#quick-location-status").textContent = message;
}

$("#quick-location").addEventListener("click", () => {
  if (quickLocationInProgress) return;
  const button = $("#quick-location");
  if (!navigator.geolocation) { showQuickLocationProblem("อุปกรณ์นี้ขอตำแหน่งไม่ได้ ให้โทร 1784 หรือ 1669 แล้วบอกจุดสังเกต"); return; }
  quickLocationInProgress = true;
  button.disabled = true;
  showQuickLocationProblem("กำลังขอตำแหน่งจากโทรศัพท์นี้…");
  const done = () => { quickLocationInProgress = false; button.disabled = false; };
  try {
    navigator.geolocation.getCurrentPosition(position => {
      try { showQuickLocationResult(quickLocationText(position.coords), position.coords); }
      catch (error) { showQuickLocationProblem(error.message); }
      finally { done(); }
    }, () => { showQuickLocationProblem("ไม่ได้รับตำแหน่ง ให้โทร 1784 หรือ 1669 แล้วบอกจุดสังเกตที่ใกล้ที่สุด"); done(); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch { showQuickLocationProblem("ขอตำแหน่งไม่ได้ ให้โทร 1784 หรือ 1669 แล้วบอกจุดสังเกตที่ใกล้ที่สุด"); done(); }
});

async function copyQuickLocation() {
  if (!lastQuickLocationText) return;
  if (await copyText(lastQuickLocationText)) {
    $("#quick-location-status").textContent = "คัดลอกข้อความแล้ว วางใน LINE ปภ. หรือส่งให้ญาติ แล้วโทร 1784 ด้วย การคัดลอกยังไม่ใช่การส่ง";
  } else {
    showManualCopy(lastQuickLocationText);
    $("#quick-location-status").textContent = "ข้อความอยู่ในกล่องคัดลอกด้านบน ยังไม่มีข้อมูลส่งจากหน้านี้";
  }
}

$("#quick-location-share").addEventListener("click", async () => {
  if (!lastQuickLocationText) return;
  if (typeof navigator.share !== "function") return copyQuickLocation();
  try {
    await navigator.share({ title: "ขอความช่วยเหลือน้ำท่วม", text: lastQuickLocationText });
    $("#quick-location-status").textContent = "เปิดการแชร์แล้ว หน้านี้ไม่รู้ว่าปลายทางได้รับข้อความหรือยัง โทร 1784 ด้วย";
  } catch (error) {
    if (error?.name !== "AbortError") copyQuickLocation();
  }
});
$("#quick-location-copy").addEventListener("click", () => copyQuickLocation());
$("#quick-location-qr").addEventListener("click", () => {
  if (!lastQuickQrText) return;
  showQr($("#quick-location-qr-panel"), lastQuickQrText);
});
$("#quick-location").hidden = false;

async function copyCase(item) {
  const content = shareText(item);
  if (await copyText(content)) {
    toast("คัดลอกแล้ว เปิด LINE ปภ. เพิ่มเพื่อน วางและกดส่ง แล้วตอบคำถามจนทราบว่ามีผู้รับเรื่อง การคัดลอกยังไม่ใช่การส่งเคส");
  } else {
    showManualCopy(content);
    toast("คัดลอกอัตโนมัติไม่ได้ ข้อความอยู่ในกล่องด้านบน กดค้างเพื่อคัดลอก");
  }
}

async function copyText(content) {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {}
  const area = document.createElement("textarea");
  area.value = content;
  area.readOnly = true;
  area.className = "copy-fallback";
  document.body.append(area);
  try {
    area.select();
    area.setSelectionRange(0, content.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function showManualCopy(content) {
  let box = $("#manual-copy");
  if (!box) {
    box = node("section", "manual-copy");
    box.id = "manual-copy";
    const note = node("p", "", "คัดลอกอัตโนมัติไม่ได้ในแอปนี้ ให้กดค้างที่ข้อความด้านล่าง เลือกทั้งหมด แล้วคัดลอก จากนั้นวางใน LINE ปภ. @1784DDPM หรืออ่านให้เจ้าหน้าที่ 1784 ฟัง");
    const area = document.createElement("textarea");
    area.readOnly = true;
    area.rows = 11;
    const close = button("ปิดกล่องนี้", "text-button", () => clearManualCopy());
    box.append(note, area, close);
    $(".primary").prepend(box);
  }
  const area = box.querySelector("textarea");
  area.value = content;
  box.hidden = false;
  box.scrollIntoView({ block: "start" });
  area.focus();
  area.select();
}

function clearManualCopy() {
  const box = $("#manual-copy");
  if (!box) return;
  box.querySelector("textarea").value = "";
  box.hidden = true;
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
  if (typeof $("#handoff-dialog").showModal !== "function") {
    pendingHandoff = null;
    const answer = window.prompt("ใช้ช่องทางใด? พิมพ์ 1 โทรศัพท์, 2 LINE, 3 SMS หรือ 4 ช่องทางอื่น");
    const channel = { "1": "phone", "2": "line", "3": "sms", "4": "other" }[answer];
    if (answer === null) return;
    if (!channel) { toast("กรุณาเลือกช่องทาง 1 ถึง 4"); return; }
    if (!window.confirm("บันทึกว่าคุณพยายามส่งต่อแล้ว? หน้านี้ยังไม่มีหลักฐานว่าปลายทางได้รับเคส")) return;
    try {
      await putCase(recordHandoffAttempt(item, { channel }));
      await refresh();
      toast("บันทึกคำยืนยันของคุณแล้ว ยังไม่มีหลักฐานว่าปลายทางรับเคส");
    } catch (error) { toast(error.message); }
    return;
  }
  $("#handoff-dialog").showModal();
}

$("#handoff-cancel").addEventListener("click", () => $("#handoff-dialog").close());
$("#handoff-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!pendingHandoff) return;
  const channel = new FormData(event.currentTarget).get("channel");
  if (!Object.prototype.hasOwnProperty.call(CHANNELS, channel)) return;
  try {
    await putCase(recordHandoffAttempt(pendingHandoff, { channel }));
    $("#handoff-dialog").close();
    pendingHandoff = null;
    await refresh();
    toast("บันทึกคำยืนยันของคุณแล้ว ยังไม่มีหลักฐานว่าปลายทางรับเคส");
  } catch (error) { toast(error.message); }
});

async function removeCase(item) {
  if (!await askConfirm(item.intake
    ? "การลบในอุปกรณ์จะลบรหัสลับสำหรับอ่านสถานะ แต่ไม่ลบข้อมูลที่ส่งถึงระบบทีมอาสาแล้ว หากต้องลบข้อมูลในระบบให้กด ‘ยกเลิกเคส/ลบข้อมูลของฉัน’ ก่อน"
    : "หากเคยส่งข้อความไปช่องทางอื่น ข้อมูลปลายทางจะไม่ถูกลบ", "ลบเคสนี้ออกจากอุปกรณ์")) return;
  try { await deleteCase(item.caseId); clearManualCopy(); await refresh(); toast("ลบเคสในอุปกรณ์นี้แล้ว"); }
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
  if (!await askConfirm("ไฟล์นี้มีเบอร์โทรและพิกัดละเอียด ถ้ามี กรุณาเก็บและส่งต่อเฉพาะผู้ที่จำเป็น รหัสลับสำหรับอ่านสถานะจากระบบจะไม่ถูกส่งออก", "ส่งออกข้อมูลส่วนบุคคล")) return;
  const date = new Date().toISOString().slice(0, 10);
  const exportableCases = stripIntakeSecrets(cases);
  if (format === "json") download(`promjaeng-flood-cases-${date}.json`,
    JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), cases: exportableCases }, null, 2), "application/json;charset=utf-8");
  else download(`promjaeng-flood-cases-${date}.csv`, casesCsv(exportableCases), "text/csv;charset=utf-8");
  toast("สร้างไฟล์แล้ว โปรดระวังข้อมูลส่วนบุคคลในไฟล์");
}

$("#export-json").addEventListener("click", () => exportCases("json"));
$("#export-csv").addEventListener("click", () => exportCases("csv"));

for (const province of PROVINCES) {
  const option = document.createElement("option");
  option.value = province;
  $("#province-options").append(option);
  const alertOption = document.createElement("option");
  alertOption.value = province;
  alertOption.textContent = province;
  $("#alert-province").append(alertOption);
}
renderNeeds();
form.addEventListener("change", event => { if (event.target.name === "urgentNow") updateTriage(); });
updateTriage();
form.addEventListener("input", () => { draftTouched = true; });
form.addEventListener("change", () => { draftTouched = true; });
clearGpsFields();
window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  clearGpsFields();
  $("#gps-status").textContent = GPS_HINT;
});
refresh().then(() => { form.hidden = false; if (updateAvailable) reloadWhenSafe(); }).catch(() => { list.replaceChildren(node("div", "error", "เบราว์เซอร์นี้บันทึกเคสไม่ได้ ให้โทร 1784 หรือแจ้ง LINE @1784DDPM โดยตรง หรือเปิดหน้านี้ใน Chrome หรือ Safari")); });
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  if (hadController) navigator.serviceWorker.addEventListener("controllerchange", () => {
    updateAvailable = true;
    reloadWhenSafe();
  });
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
    .then(registration => registration.update())
    .catch(() => toast("ติดตั้งโหมดออฟไลน์ไม่สำเร็จ กรุณาลองโหลดหน้าใหม่ขณะออนไลน์"));
}
