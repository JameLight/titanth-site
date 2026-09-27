import { PROVINCES } from "../flood/provinces.js";
import { AidError, loadConfig, makeAidApi } from "./aid_api.js";

const $ = id => document.getElementById(id);
const field = (form, name) => form.elements.namedItem(name);
const CATEGORIES = Object.freeze({
  food_water: "น้ำและอาหาร", medicine: "ยาและเวชภัณฑ์", boat_transport: "เรือหรือการเดินทาง",
  move_goods: "ขนย้ายของ", shelter: "ที่พัก", power_phone: "ไฟฟ้าและโทรศัพท์",
  cleanup: "เก็บกวาด", animals: "สัตว์เลี้ยง", other: "อื่น ๆ"
});
let api = null, config = null, profile = null, selectedThread = null, currentThread = null, currentMessages = [];
let enabled = false, busy = false;
const asRows = data => Array.isArray(data) ? data : data == null ? [] : [data];
const first = data => asRows(data)[0] ?? null;
const dateText = value => value ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "ไม่ทราบเวลา";
const node = (tag, text = "", className = "") => {
  const item = document.createElement(tag);
  item.textContent = String(text ?? "");
  if (className) item.className = className;
  return item;
};
const clear = target => target.replaceChildren();
function status(message, error = false) { $("status").textContent = message; $("status").classList.toggle("error", error); }
function locked(message) {
  enabled = false; api = null; profile = null; selectedThread = null; currentThread = null; currentMessages = [];
  $("active").hidden = true; $("closed").hidden = false;
  $("closed").querySelector("h2").textContent = message;
  status(message, true);
  clear($("board")); clear($("mine")); clear($("threads")); clear($("messages")); clear($("details"));
}
function showError(error) {
  if (["AID_CLOSED", "MISSING_API", "ACCOUNT_SUSPENDED"].includes(error?.code)) {
    locked(error.message);
    return;
  }
  status(error instanceof AidError ? error.message : "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง หากอันตราย โทร 1784 หรือ 1669", true);
}
async function run(action, success) {
  if (busy || !enabled || !api) return;
  busy = true;
  try { await action(); if (success) status(success); }
  catch (error) { showError(error); }
  finally { busy = false; }
}
function fillProvinceSelect(select) {
  for (const name of PROVINCES) {
    const option = document.createElement("option"); option.value = name; option.textContent = name; select.append(option);
  }
}
function fillCategories() {
  for (const [value, label] of Object.entries(CATEGORIES)) {
    const row = node("label", "", "check");
    const input = document.createElement("input"); input.type = "checkbox"; input.name = "category"; input.value = value;
    row.append(input, document.createTextNode(label)); $("categories").append(row);
  }
}
function tag(text, kind = "") { return node("span", text, `tag ${kind}`); }
function button(text, callback, secondary = false) {
  const item = node("button", text, secondary ? "secondary" : "");
  item.type = "button"; item.addEventListener("click", () => run(callback)); return item;
}
function warningPost(row, card) {
  if (!row.reported) return;
  card.classList.add("reported");
  card.append(node("p", "มีผู้ใช้รายงานโพสต์นี้ ยังไม่มีการตรวจตัดสินว่าเป็นโพสต์เท็จ", "help"));
}
function reportControl(card, postId, threadId = null) {
  const open = button("รายงานปัญหา", async () => {
    form.hidden = !form.hidden; if (!form.hidden) form.querySelector("input").focus();
  }, true);
  const form = document.createElement("form"); form.hidden = true;
  const label = node("label", "บอกปัญหาสั้น ๆ");
  const reason = document.createElement("input"); reason.required = true; reason.maxLength = 300; label.append(reason);
  const submit = node("button", "ส่งรายงาน", "danger"); submit.type = "submit";
  form.append(label, submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    run(async () => { await api.report(postId, threadId, reason.value.trim()); reason.value = ""; form.hidden = true; status("ส่งรายงานแล้ว แต่ยังไม่มีเจ้าหน้าที่เฝ้ารายงานตลอดเวลา"); });
  });
  card.append(open, form);
}
function makeBoardCard(row, member) {
  const card = node("article", "", "card");
  const kind = row.kind === "request" ? "ขอความช่วยเหลือ" : "เสนอความช่วยเหลือ";
  const title = node("h3", `${kind} · ${row.province || "ไม่ระบุจังหวัด"}`);
  card.append(title, tag(kind, row.kind), node("p", `หมวด: ${asRows(row.categories).map(x => CATEGORIES[x] || "อื่น ๆ").join(" · ") || "ไม่ทราบ"}`));
  if (row.people != null) card.append(node("p", `จำนวนคน: ${row.people}`));
  card.append(node("p", `ลงเมื่อ ${dateText(row.created_at)} · หมดอายุ ${dateText(row.expires_at)}`, "muted"));
  card.append(node("p", `มีคนเริ่มคุยแล้ว ${Number(row.responses) || 0} คน ไม่ยืนยันว่ามีคนไปช่วย`, "muted"));
  warningPost(row, card);
  if (!member) return card;
  if (row.mine) card.append(node("p", "นี่คือโพสต์ของคุณ", "help"));
  else if (row.my_thread) card.append(button("เปิดห้องคุยของฉัน", async () => { await loadThreads(row.my_thread); }, true));
  else {
    const form = document.createElement("form");
    const label = node("label", "ส่งข้อความเริ่มคุย");
    const text = document.createElement("textarea"); text.required = true; text.maxLength = 1000;
    label.append(text);
    const send = node("button", "ส่งข้อความถึงผู้โพสต์"); send.type = "submit";
    form.append(label, node("p", "อย่าโอนเงินหรือส่งรหัสส่วนตัว ข้อความนี้จะถูกเก็บและคู่สนทนาอ่านย้อนหลังได้", "muted"), send);
    form.addEventListener("submit", event => {
      event.preventDefault();
      run(async () => {
        const id = await api.respond(row.id, text.value.trim());
        text.value = "";
        await loadThreads(id);
        status("ส่งข้อความเข้าห้องคุยแล้ว ยังไม่ทราบว่าอีกฝ่ายเห็นหรือจะตอบเมื่อไร");
      });
    });
    card.append(form);
  }
  reportControl(card, row.id);
  return card;
}
async function loadBoard() {
  const province = $("province-filter").value || null;
  const totals = first(await api.totals());
  if (!totals?.board_open) throw new AidError("AID_CLOSED", "เจ้าของระบบปิดกระดานชั่วคราว หากอันตราย โทร 1784 หรือ 1669");
  $("totals").textContent = `คำขอเปิด ${totals.open_requests || 0} · ข้อเสนอเปิด ${totals.open_offers || 0} (ข้อมูล ณ ${dateText(totals.read_at)}) ตัวเลขนี้ไม่บอกว่ามีใครช่วยสำเร็จ`;
  const member = !!profile?.display_name && profile.terms_version === config.termsVersion;
  const rows = asRows(member ? await api.board(province) : await api.boardPublic(province));
  clear($("board"));
  if (!rows.length) $("board").append(node("p", "ยังไม่มีโพสต์เปิดในจังหวัดที่เลือก"));
  for (const row of rows) $("board").append(makeBoardCard(row, member));
}
async function loadAccount() {
  const member = api.hasSession();
  $("auth-panel").hidden = member;
  $("account-panel").hidden = !member;
  $("member-tools").hidden = true;
  profile = null;
  if (!member) return;
  profile = first(await api.me());
  if (!profile?.board_open) throw new AidError("AID_CLOSED", "เจ้าของระบบปิดกระดานชั่วคราว หากอันตราย โทร 1784 หรือ 1669");
  if (profile.suspended) throw new AidError("ACCOUNT_SUSPENDED", "บัญชีนี้ถูกระงับ หากอันตราย โทร 1784 หรือ 1669");
  $("account-state").textContent = profile.display_name ? `ชื่อที่ใช้คุย: ${profile.display_name}` : "ยังไม่ได้ตั้งชื่อที่ใช้คุย";
  const current = !!profile.display_name && profile.terms_version === config.termsVersion;
  $("profile-needed").hidden = current;
  $("member-tools").hidden = !current;
  if (current) await Promise.all([loadMine(), loadThreads()]);
}
async function loadMine() {
  clear($("mine"));
  const rows = asRows(await api.myPosts());
  if (!rows.length) $("mine").append(node("p", "ยังไม่มีโพสต์"));
  for (const row of rows) {
    const card = node("article", "", "card");
    card.append(node("h3", `${row.kind === "request" ? "ขอ" : "เสนอ"} · ${row.province}`));
    card.append(node("p", row.summary || ""), node("p", `สถานะ: ${row.status} · คนเริ่มคุย ${row.responses || 0} · หมดอายุ ${dateText(row.expires_at)}`, "muted"));
    if (["open", "reported", "expired"].includes(row.status)) {
      const actions = node("div", "", "actions");
      if (row.status !== "expired") actions.append(button("ปิดโพสต์", async () => {
        if (!confirm("ปิดโพสต์นี้? คนใหม่จะเริ่มคุยไม่ได้ แต่ข้อความเก่ายังอ่านย้อนหลังได้")) return;
        await api.close(row.id); await loadMine(); await loadBoard(); status("ปิดโพสต์แล้ว ข้อความในห้องคุยเดิมยังอ่านย้อนหลังได้");
      }, true));
      actions.append(button("ต่ออายุโพสต์", async () => { await api.renew(row.id); await loadMine(); await loadBoard(); status("ต่ออายุโพสต์แล้ว"); }, true));
      card.append(actions);
    }
    $("mine").append(card);
  }
}
async function loadThreads(selectId = selectedThread) {
  const rows = asRows(await api.threads());
  clear($("threads"));
  if (!rows.length) $("threads").append(node("p", "ยังไม่มีห้องคุย"));
  for (const row of rows) {
    const card = node("article", "", "card");
    card.append(node("h3", `คุยกับ ${row.other_name || "ผู้ใช้ที่ไม่ได้ตั้งชื่อ"} · ${row.province || ""}`));
    card.append(node("p", row.post_summary || "คำอธิบายซ่อนไว้จนกว่าผู้โพสต์จะเลือกเปิดให้", "muted"));
    card.append(node("p", `ข้อความ ${row.messages || 0} · ล่าสุด ${dateText(row.last_at || row.created_at)} · สถานะโพสต์ ${row.post_status}`, "muted"));
    card.append(button("เปิดห้องนี้", async () => { selectThread(row); await loadMessages(); }, true));
    $("threads").append(card);
  }
  if (selectId) {
    const found = rows.find(x => x.thread_id === selectId);
    if (found) { selectThread(found); await loadMessages(); }
    else { selectedThread = null; currentThread = null; $("conversation").hidden = true; clear($("details")); }
  }
}
function selectThread(row) {
  const changed = selectedThread !== row.thread_id;
  selectedThread = row.thread_id; currentThread = row;
  if (changed) currentMessages = [];
  $("conversation").hidden = false;
  $("conversation-title").textContent = `ห้องคุยกับ ${row.other_name || "ผู้ใช้"}`;
  $("conversation-state").textContent = `โพสต์ ${row.post_status} · ${row.i_am_poster ? "คุณเป็นผู้โพสต์" : "คุณเป็นผู้ติดต่อ"}`;
  $("share-details").hidden = !row.i_am_poster || row.shared_at != null || row.post_status !== "open";
  $("view-details").hidden = row.i_am_poster || row.shared_at == null || row.post_status !== "open";
  $("message-form").hidden = row.post_status !== "open";
  $("report-thread-form").hidden = false;
  if (changed || row.post_status !== "open") { $("details").hidden = true; clear($("details")); }
  if (changed) clear($("messages"));
}
async function loadMessages() {
  if (!selectedThread) return;
  const selected = selectedThread;
  const collected = [];
  let after = Number(currentMessages.at(-1)?.id ?? 0);
  for (let page = 0; page < 10; page++) {
    const rows = asRows(await api.messages(selected, after));
    collected.push(...rows);
    if (rows.length < 500) break;
    const next = Number(rows.at(-1)?.id ?? 0);
    if (!Number.isFinite(next) || next <= after) break;
    after = next;
  }
  if (selected !== selectedThread) return;
  currentMessages.push(...collected);
  clear($("messages"));
  if (!currentMessages.length) $("messages").append(node("p", "ยังไม่มีข้อความ"));
  for (const row of currentMessages) {
    const item = node("div", "", `message ${row.from_me ? "mine" : ""}`);
    item.append(node("strong", `${row.from_me ? "ฉัน" : row.sender_name || "อีกฝ่าย"} · ${dateText(row.created_at)}`));
    item.append(node("div", row.body || ""));
    $("messages").append(item);
  }
  if (collected.length >= 5000) $("messages").append(node("p", "มีข้อความจำนวนมาก ยังโหลดไม่ครบ กดดูข้อความล่าสุดอีกครั้ง", "help"));
}
async function refreshAll() { await loadAccount(); await loadBoard(); }
function setupEvents() {
  $("refresh-board").addEventListener("click", () => run(loadBoard, "แสดงรายการล่าสุดแล้ว"));
  $("province-filter").addEventListener("change", () => run(loadBoard));
  $("refresh-mine").addEventListener("click", () => run(loadMine, "แสดงโพสต์ล่าสุดแล้ว"));
  $("refresh-threads").addEventListener("click", () => run(loadThreads, "แสดงห้องคุยล่าสุดแล้ว"));
  $("refresh-messages").addEventListener("click", () => run(loadMessages, "แสดงข้อความล่าสุดแล้ว"));
  $("auth-form").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget; const email = field(form, "email").value.trim(), password = field(form, "password").value;
    run(async () => {
      const signed = await api.signUp(email, password);
      field(form, "password").value = "";
      if (signed) { await refreshAll(); status("สมัครแล้ว เข้าสู่ระบบในเครื่องนี้"); }
      else status("ส่งคำขอสมัครแล้ว ตรวจอีเมลเพื่อยืนยันก่อนเข้าสู่ระบบ ระบบยังไม่รับรองตัวตนของคุณ");
    });
  });
  document.querySelector('[data-auth="signin"]').addEventListener("click", () => {
    const form = $("auth-form");
    run(async () => { await api.signIn(field(form, "email").value.trim(), field(form, "password").value); field(form, "password").value = ""; await refreshAll(); status("เข้าสู่ระบบแล้ว"); });
  });
  $("sign-out").addEventListener("click", () => run(async () => {
    await api.signOut(); profile = null; selectedThread = null; currentThread = null;
    clear($("messages")); clear($("details")); clear($("threads")); clear($("mine"));
    await refreshAll(); status("ออกจากระบบบนเครื่องนี้แล้ว");
  }));
  $("profile-form").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!field(form, "accept").checked) return;
    run(async () => { await api.setProfile(field(form, "display_name").value.trim(), config.termsVersion); await refreshAll(); status("บันทึกชื่อและข้อตกลงแล้ว ชื่อนี้ไม่ได้รับการตรวจตัวตน"); });
  });
  $("post-form").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget;
    const categories = [...form.querySelectorAll('input[name="category"]:checked')].map(x => x.value);
    if (!categories.length) { status("เลือกอย่างน้อยหนึ่งหมวด", true); return; }
    if (field(form, "vulnerable").checked && !field(form, "health_consent").checked) { status("โปรดยืนยันความยินยอมข้อมูลสุขภาพก่อน", true); return; }
    if (!confirm("ลงโพสต์นี้? ทุกคนจะเห็นจังหวัด หมวด และจำนวนคน คนที่คุณเลือกเท่านั้นจึงจะเห็นคำอธิบาย อำเภอ ที่อยู่และเบอร์ เจ้าของระบบเข้าถึงได้")) return;
    run(async () => {
      await api.post({
        p_kind: field(form, "kind").value, p_province: field(form, "province").value, p_district: field(form, "district").value.trim() || null,
        p_categories: categories, p_people: field(form, "people").value ? Number(field(form, "people").value) : null,
        p_vulnerable: field(form, "vulnerable").checked, p_summary: field(form, "summary").value.trim(),
        p_place: field(form, "place").value.trim() || null, p_phone: field(form, "phone").value.trim() || null
      });
      form.reset(); await loadMine(); await loadBoard();
      status("โพสต์เข้ากระดานแล้ว ยังไม่ใช่การรับเคสหรือการยืนยันว่ามีคนไปช่วย");
    });
  });
  $("message-form").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget, thread = selectedThread;
    if (!thread) return;
    run(async () => { await api.sendMessage(thread, field(form, "body").value.trim()); field(form, "body").value = ""; await loadMessages(); status("ส่งข้อความในระบบแล้ว ยังไม่ทราบว่าอีกฝ่ายอ่านหรือจะตอบเมื่อไร"); });
  });
  $("share-details").addEventListener("click", () => {
    if (!selectedThread || !currentThread?.i_am_poster) return;
    if (!confirm("เปิดคำอธิบาย อำเภอ เครื่องหมายกลุ่มเปราะบาง ที่อยู่ และเบอร์ให้คนนี้? เขาอาจจดหรือส่งต่อได้ และเรียกคืนสิ่งที่เห็นแล้วไม่ได้")) return;
    run(async () => { await api.share(selectedThread); await loadThreads(selectedThread); status("เปิดข้อมูลให้คนนี้แล้ว ระบบบันทึกการเปิด"); });
  });
  $("view-details").addEventListener("click", () => run(async () => {
    if (!selectedThread || !currentThread?.shared_at) return;
    const detail = first(await api.details(selectedThread));
    clear($("details"));
    if (detail) {
      for (const [label, key] of [["อำเภอหรือเขต", "district"], ["คำอธิบาย", "summary"], ["ที่อยู่หรือจุดนัด", "place"], ["เบอร์", "phone"]]) {
        $("details").append(node("p", `${label}: ${detail[key] || "ไม่ได้ใส่"}`));
      }
      $("details").append(node("p", detail.vulnerable ? "มีการทำเครื่องหมายบุคคลเปราะบาง" : "ไม่ได้ทำเครื่องหมายบุคคลเปราะบาง"));
      $("details").hidden = false;
      status("เปิดดูข้อมูลที่ผู้โพสต์เลือกให้แล้ว ระบบบันทึกการดูข้อมูล");
    }
  }));
  $("report-thread-form").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!currentThread) return;
    run(async () => { await api.report(currentThread.post_id, selectedThread, field(form, "reason").value.trim()); form.reset(); status("ส่งรายงานแล้ว ยังไม่มีเจ้าหน้าที่เฝ้ารายงานตลอดเวลา"); });
  });
}
async function main() {
  fillProvinceSelect($("province-filter"));
  fillProvinceSelect(field($("post-form"), "province"));
  fillCategories();
  setupEvents();
  config = await loadConfig();
  if (!config) { locked("กระดานยังไม่เปิดรับข้อมูล"); return; }
  api = makeAidApi(config);
  $("notice-link").href = config.privacyNoticeUrl;
  $("profile-notice").href = config.privacyNoticeUrl;
  try {
    const totals = first(await api.totals());
    if (!totals?.board_open) { locked("กระดานยังไม่เปิดรับข้อมูล"); return; }
    enabled = true; $("closed").hidden = true; $("active").hidden = false;
    await refreshAll(); status("กระดานเปิดอยู่ขณะตรวจ แต่ไม่มีเจ้าหน้าที่เฝ้า หากอันตราย โทร 1784 หรือ 1669");
  } catch (error) { showError(error); if (enabled) locked("กระดานยังไม่พร้อมใช้งาน"); }
}
main();
setInterval(() => {
  if (!enabled || document.hidden || busy) return;
  run(async () => { await loadBoard(); if (selectedThread) await loadThreads(selectedThread); });
}, 30_000);
