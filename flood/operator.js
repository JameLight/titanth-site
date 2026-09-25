import { NEEDS, STATUS, validateImport } from "./model.js";
const $ = selector => document.querySelector(selector);
function element(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = String(text ?? "");
  if (className) node.className = className;
  return node;
}
function row(dl, label, value) { dl.append(element("dt", label), element("dd", value)); }
$("#file-input").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 10 MB สำหรับหน้าดูไฟล์นี้");
    const items = validateImport(JSON.parse(await file.text()));
    const list = $("#operator-list");
    list.replaceChildren();
    for (const item of items) {
      const card = element("article", "", "operator-card");
      card.append(element("h2", item.caseId));
      const dl = document.createElement("dl");
      row(dl, "เวลาแจ้ง", new Date(item.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }));
      row(dl, "สถานะ", item.status === STATUS.LOCAL_ONLY ? "เก็บในเครื่อง" : "ผู้ใช้ระบุว่าส่งต่อแล้ว ยังไม่ยืนยันผู้รับ");
      row(dl, "สัญญาณส่งต่อ", `${item.routingHint} (ไม่ใช่คำวินิจฉัย)`);
      row(dl, "พื้นที่", [item.location.landmark, item.location.subdistrict, item.location.district, item.location.province].filter(Boolean).join(" "));
      row(dl, "พิกัด", item.location.lat == null ? "ไม่มี" : `${item.location.lat}, ${item.location.lon}`);
      row(dl, "จำนวนคน", item.peopleCount);
      row(dl, "ต้องการ", item.needs.map(n => NEEDS[n] || n).join(", "));
      row(dl, "รายละเอียด", item.details || "ไม่มี");
      row(dl, "โทรกลับ", item.contactPhone || "ไม่ได้ระบุ");
      card.append(dl);
      list.append(card);
    }
    if (!items.length) list.append(element("div", "ไฟล์นี้ไม่มีเคส", "empty"));
    $("#import-count").textContent = `${items.length} เคส`;
    $("#file-status").textContent = `อ่านไฟล์ ${file.name} แล้ว (ดูในเครื่องเท่านั้น)`;
  } catch (error) {
    $("#operator-list").replaceChildren(element("div", "เปิดไฟล์ไม่ได้: " + error.message, "error"));
    $("#import-count").textContent = "0 เคส";
    $("#file-status").textContent = "ไฟล์ไม่ถูกต้อง";
  }
});
