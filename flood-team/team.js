// พร้อมแจ้งน้ำท่วม · team page UI. Every value from the database is shown with textContent, never as HTML,
// because case details are typed by the public.
import { loadTeamConfig, makeTeamApi, accountCodeOf, formatAccountCode, ApiError } from "./team_api.js";

const $ = selector => document.querySelector(selector);
const REFRESH_MS = 15_000;
// The database treats a team as on duty only if a member had this page on screen in the last 5 minutes.
const HEARTBEAT_MS = 60_000;
const LATE_MS = 10 * 60 * 1000;
const SCREENS = ["#loading", "#screen-unconfigured", "#screen-auth", "#screen-waiting", "#screen-team"];
const NEEDS = Object.freeze({
  trapped: "มีคนติดอยู่", medical: "ต้องการแพทย์/บาดเจ็บ", immobile: "ผู้ป่วยติดเตียง/เคลื่อนย้ายเองไม่ได้",
  fast_water: "น้ำขึ้นเร็ว", boat: "ต้องการเรือ/อพยพ", medicine: "ขาดยาจำเป็น", food_water: "ต้องการอาหาร/น้ำดื่ม",
  other: "ความช่วยเหลืออื่น"
});
const URGENT = new Set(["trapped", "medical", "immobile", "fast_water"]);
const STATUS = Object.freeze({
  SENT: "รอทีมรับ", ACKNOWLEDGED: "ทีมเรารับแล้ว", EN_ROUTE: "ทีมเรากำลังเดินทาง", NEED_INFO: "ต้องการข้อมูลเพิ่ม",
  RESOLVED: "ช่วยเสร็จแล้ว", HANDED_TO_OFFICIAL: "ส่งต่อหน่วยงานแล้ว"
});
const EVENT = Object.freeze({
  SENT: "ผู้แจ้งส่งเคส", ACKNOWLEDGED: "รับเคส", EN_ROUTE: "กำลังเดินทาง", NEED_INFO: "ต้องการข้อมูลเพิ่ม",
  RESOLVED: "ช่วยเสร็จแล้ว", HANDED_TO_OFFICIAL: "ส่งต่อหน่วยงาน", VIEWED_CONTACT: "เปิดดูเบอร์โทร", RELEASED: "คืนเคส"
});
const NEXT = Object.freeze({
  ACKNOWLEDGED: ["EN_ROUTE", "NEED_INFO", "HANDED_TO_OFFICIAL", "RESOLVED"],
  EN_ROUTE: ["NEED_INFO", "HANDED_TO_OFFICIAL", "RESOLVED"],
  NEED_INFO: ["EN_ROUTE", "HANDED_TO_OFFICIAL", "RESOLVED"]
});
const ACTION = Object.freeze({
  EN_ROUTE: "กำลังเดินทาง", NEED_INFO: "ต้องการข้อมูลเพิ่ม", HANDED_TO_OFFICIAL: "ส่งต่อหน่วยงานแล้ว", RESOLVED: "ช่วยเสร็จแล้ว"
});
const CLOSED = new Set(["RESOLVED", "HANDED_TO_OFFICIAL"]);

let api = null;
let timer = null;
let heartbeatTimer = null;
let lastBeat = 0;
// One refresh at a time; a user action waits for it instead of being dropped.
let refreshInFlight = null;
let acting = false;
let state = freshState();

function freshState() {
  return { account: null, team: null, areas: [], members: [], cases: [], seenOpen: null, phones: new Map(), openHistory: new Set() };
}

const clock = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const clockSeconds = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" });
const thaiTime = iso => clock.format(new Date(iso));
const minutesSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const ago = iso => {
  const m = minutesSince(iso);
  if (m < 1) return "เมื่อสักครู่";
  return m < 60 ? `${m} นาทีที่แล้ว` : `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`;
};
const urgent = item => (item.needs ?? []).some(need => URGENT.has(need));

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = String(text);
  return element;
}

function button(label, className, onClick) {
  const element = el("button", className, label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function show(id) {
  for (const screen of SCREENS) $(screen).hidden = screen !== id;
  $("#sign-out").hidden = !(id === "#screen-waiting" || id === "#screen-team");
}

let toastTimer = null;
function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 7000);
}

// Resolves with the typed text ("" when there is no text box) or null when cancelled.
// The buttons settle the promise directly, so it never waits for a dialog "close" event.
function ask({ title, text, ok, input = null, required = false }) {
  const dialog = $("#ask-dialog");
  $("#ask-title").textContent = title;
  $("#ask-text").textContent = text;
  $("#ask-ok").textContent = ok;
  $("#ask-input-label").hidden = !input;
  $("#ask-input-caption").textContent = input ?? "";
  $("#ask-input").value = "";
  $("#ask-error").hidden = true;
  return new Promise(resolve => {
    const done = value => {
      $("#ask-ok").onclick = null;
      $("#ask-cancel").onclick = null;
      dialog.oncancel = null;
      if (dialog.open) dialog.close();
      resolve(value);
    };
    $("#ask-ok").onclick = () => {
      const value = $("#ask-input").value.trim();
      if (input && required && !value) {
        $("#ask-error").textContent = "ต้องเขียนก่อนกดยืนยัน";
        $("#ask-error").hidden = false;
        return;
      }
      done(input ? value : "");
    };
    $("#ask-cancel").onclick = () => done(null);
    dialog.oncancel = event => { event.preventDefault(); done(null); };
    dialog.showModal();
    (input ? $("#ask-input") : $("#ask-cancel")).focus();
  });
}

function handleError(error) {
  if (error?.code === "SIGNED_OUT" || (error instanceof ApiError && !api?.session())) {
    stopTimer();
    show("#screen-auth");
    toast("หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");
    return;
  }
  if (error instanceof TypeError) {
    $("#updated-line").classList.add("stale");
    toast("เชื่อมต่อไม่ได้ ตรวจสัญญาณอินเทอร์เน็ต แล้วลองใหม่");
    return;
  }
  toast(error?.message || "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
}

function refreshNow() {
  refreshInFlight ??= refreshAll().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function act(work, success) {
  if (acting) { toast("กำลังทำรายการก่อนหน้า รอสักครู่"); return; }
  acting = true;
  try {
    if (refreshInFlight) { try { await refreshInFlight; } catch { /* reported by the refresh itself */ } }
    await work();
    if (success) toast(success);
    await refreshNow();
  } catch (error) {
    handleError(error);
  } finally {
    acting = false;
  }
}

async function refreshAll() {
  const account = await api.myAccount();
  state.account = account;
  if (!account) { show("#screen-auth"); return; }
  if (!account.team_name) {
    $("#account-code").textContent = formatAccountCode(account.account_code);
    show("#screen-waiting");
    return;
  }
  const [team, areas, members, cases] = await Promise.all([api.team(), api.areas(), api.members(), api.cases()]);
  Object.assign(state, { team, areas, members, cases });
  await beat();
  renderTeam();
  show("#screen-team");
  $("#updated-line").textContent = `อัปเดตล่าสุด ${clockSeconds.format(new Date())} น. (อัปเดตเองทุก 15 วินาที)`;
  $("#updated-line").classList.remove("stale");
}

function renderTeam() {
  const { account, team, areas, members, cases } = state;
  const coordinator = account.role === "coordinator";
  $("#team-name").textContent = team?.name ?? account.team_name;
  $("#me-line").textContent = `คุณ: ${account.display_name} (${coordinator ? "ผู้ประสานงาน" : "สมาชิก"})`;
  $("#areas-line").textContent = areas.length
    ? `จังหวัดที่ทีมดูแล: ${areas.map(area => area.province).join(", ")}`
    : "ทีมยังไม่มีจังหวัดที่ดูแล แจ้งเจ้าของระบบ";
  const onDuty = Boolean(team?.on_duty_until) && new Date(team.on_duty_until) > new Date();
  const seen = team?.last_seen_at ? `มีสมาชิกเปิดหน้านี้ล่าสุด ${thaiTime(team.last_seen_at)} น.` : "";
  $("#duty-line").textContent = onDuty
    ? `● ทีมกำลังเฝ้า ถึง ${thaiTime(team.on_duty_until)} น. — ประชาชนในจังหวัดที่ทีมดูแลส่งเคสเข้ามาได้ ตราบใดที่มีสมาชิกเปิดหน้านี้ค้างไว้บนจอ (ถ้าไม่มีใครเปิดเกิน 5 นาที ระบบจะให้ประชาชนโทร 1784 แทน) ${seen}`
    : "○ ทีมไม่ได้เฝ้า — ถ้าไม่มีทีมอื่นเฝ้าจังหวัดเดียวกัน ประชาชนจะส่งเคสเข้ามาไม่ได้ และหน้าเว็บจะให้โทร 1784 แทน";
  $("#duty-box").classList.toggle("on", onDuty);
  $("#duty-actions").hidden = !coordinator;
  $("#add-member").hidden = !coordinator;

  const ours = item => item.team_id && item.team_id === team?.id;
  const open = cases.filter(item => item.status === "SENT" && !item.team_id)
    .sort((a, b) => (urgent(b) - urgent(a)) || (new Date(a.created_at) - new Date(b.created_at)));
  const mine = cases.filter(item => ours(item) && !CLOSED.has(item.status))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const closed = cases.filter(item => ours(item) && CLOSED.has(item.status));

  renderList("#list-open", open, openCard, "ตอนนี้ไม่มีเคสรอรับในจังหวัดที่ทีมดูแล");
  renderList("#list-mine", mine, mineCard, "ทีมยังไม่มีเคสที่กำลังดูแล");
  renderList("#list-closed", closed, closedCard, "ยังไม่มีเคสที่ปิด");
  $("#count-open").textContent = `(${open.length})`;
  $("#count-mine").textContent = `(${mine.length})`;
  $("#count-closed").textContent = `(${closed.length})`;
  alertNewCases(open);
  renderMembers(members, coordinator, account);
}

function renderList(selector, items, makeCard, emptyText) {
  $(selector).replaceChildren(...(items.length ? items.map(makeCard) : [el("p", "empty", emptyText)]));
}

function caseBody(item) {
  const box = el("div", "case-body");
  const needs = (item.needs ?? []).map(need => NEEDS[need] ?? "ความช่วยเหลืออื่น").join(" · ");
  box.append(el("p", urgent(item) ? "needs urgent" : "needs", `${urgent(item) ? "ด่วน: " : ""}${needs}`));
  const place = [item.province, item.district, item.subdistrict].filter(Boolean).join(" · ");
  box.append(el("p", "", `${item.people} คน · ${place}`));
  if (item.landmark) box.append(el("p", "", `จุดสังเกต: ${item.landmark}`));
  if (item.details) box.append(el("p", "details", `รายละเอียดจากผู้แจ้ง: ${item.details}`));
  if (item.lat != null && item.lon != null && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))) {
    const accuracy = Number.isFinite(Number(item.accuracy_m)) && item.accuracy_m != null ? ` (คลาดเคลื่อนประมาณ ${item.accuracy_m} ม.)` : "";
    const link = el("a", "map-link", `เปิดแผนที่ตำแหน่งจากโทรศัพท์ผู้แจ้ง${accuracy}`);
    link.href = `https://maps.google.com/?q=${Number(item.lat).toFixed(6)},${Number(item.lon).toFixed(6)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    box.append(link);
  }
  if (item.outcome) box.append(el("p", "", `ผลที่ทีมรายงาน: ${item.outcome}`));
  if (item.personal_data_purged) {
    box.append(el("p", "note", "ลบข้อมูลที่ระบุตัวคนได้ของเคสนี้ตามกำหนดแล้ว (เบอร์ รายละเอียด จุดสังเกต ตำบล อำเภอ พิกัด ผลการช่วย และข้อความกับชื่อในประวัติ) เหลือเฉพาะจังหวัด จำนวนคน ประเภทความต้องการ และสถานะ"));
  }
  return box;
}

function openCard(item) {
  const card = el("article", `case open${urgent(item) ? " urgent" : ""}`);
  const late = Date.now() - new Date(item.created_at).getTime() > LATE_MS;
  const head = el("div", "case-head");
  head.append(el("strong", "", item.code),
    el("span", late ? "wait late" : "wait", `รอ ${minutesSince(item.created_at)} นาที (ส่งเมื่อ ${thaiTime(item.created_at)} น.)`));
  const actions = el("div", "row");
  actions.append(button("รับเคสนี้", "primary", () => claim(item)));
  card.append(head, caseBody(item), actions);
  return card;
}

function mineCard(item) {
  const card = el("article", "case mine");
  const head = el("div", "case-head");
  head.append(el("strong", "", item.code), el("span", "status", `${STATUS[item.status] ?? item.status} · ${ago(item.status_at)}`));
  card.append(head, caseBody(item));
  if (state.phones.has(item.id)) card.append(phoneLine(state.phones.get(item.id)));
  const actions = el("div", "row wrap");
  actions.append(button("ดูเบอร์โทรผู้แจ้ง", "secondary", () => viewPhone(item)));
  for (const next of NEXT[item.status] ?? []) {
    actions.append(button(ACTION[next], next === "RESOLVED" ? "primary" : "secondary", () => changeStatus(item, next)));
  }
  actions.append(button("คืนเคส", "danger", () => release(item)));
  card.append(actions, historyBox(item));
  return card;
}

function closedCard(item) {
  const card = el("article", "case closed");
  const head = el("div", "case-head");
  head.append(el("strong", "", item.code),
    el("span", "status", `${STATUS[item.status] ?? item.status}${item.closed_at ? ` · ${thaiTime(item.closed_at)} น.` : ""}`));
  card.append(head, caseBody(item), historyBox(item));
  return card;
}

function phoneLine(phone) {
  const line = el("p", "phone");
  if (!phone) {
    line.textContent = "ผู้แจ้งไม่ได้ให้เบอร์โทร";
    return line;
  }
  line.append("เบอร์ผู้แจ้ง: ");
  const link = el("a", "", phone);
  link.href = `tel:${String(phone).replace(/[^0-9+]/g, "")}`;
  line.append(link);
  return line;
}

function historyBox(item) {
  const box = el("details", "history");
  box.append(el("summary", "", "ประวัติเคส"));
  const list = el("ol", "");
  box.append(list);
  const load = async () => {
    try {
      const events = await api.events(item.id);
      list.replaceChildren(...events.map(event => el("li", "",
        `${thaiTime(event.at)} น. · ${EVENT[event.type] ?? event.type}${event.actor_name ? ` · ${event.actor_name}` : ""}${event.note ? ` · ${event.note}` : ""}`)));
    } catch (error) {
      list.replaceChildren(el("li", "error", error?.message || "โหลดประวัติไม่ได้"));
    }
  };
  box.addEventListener("toggle", () => {
    if (box.open) { state.openHistory.add(item.id); load(); }
    else state.openHistory.delete(item.id);
  });
  if (state.openHistory.has(item.id)) box.open = true;
  return box;
}

function alertNewCases(open) {
  const ids = new Set(open.map(item => item.id));
  if (state.seenOpen) {
    const fresh = open.filter(item => !state.seenOpen.has(item.id));
    if (fresh.length) {
      $("#new-banner").textContent = `มีเคสใหม่รอรับ ${fresh.length} เคส (แตะเพื่อซ่อน)`;
      $("#new-banner").hidden = false;
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
    }
  }
  state.seenOpen = ids;
  document.title = open.length ? `(${open.length}) หน้าทีมอาสา — พร้อมแจ้งน้ำท่วม` : "หน้าทีมอาสา — พร้อมแจ้งน้ำท่วม";
}

function renderMembers(members, coordinator, account) {
  const myCode = account.account_code;
  $("#members-list").replaceChildren(...members.map(member => {
    const row = el("div", "member");
    const code = accountCodeOf(member.user_id);
    row.append(el("span", "", `${member.display_name} · ${member.role === "coordinator" ? "ผู้ประสานงาน" : "สมาชิก"} · รหัส ${formatAccountCode(code)}`));
    if (coordinator && code !== myCode && member.role !== "coordinator") {
      row.append(button("เอาออกจากทีม", "quiet danger-text", () => removeMember(member, code)));
    }
    return row;
  }));
}

async function claim(item) {
  const answer = await ask({
    title: `รับเคส ${item.code}?`,
    text: `ทีมของคุณจะรับผิดชอบเคสนี้ ผู้แจ้งจะเห็นว่า "${state.team?.name ?? "ทีมของคุณ"} แจ้งว่ารับเคสแล้ว" และคุณจะเห็นเบอร์โทรผู้แจ้ง (ระบบบันทึกทุกครั้งที่เปิดดูเบอร์) ถ้ารับแล้วไปไม่ได้ ให้กด "คืนเคส" ทันที`,
    ok: "รับเคส"
  });
  if (answer === null) return;
  await act(async () => { state.phones.set(item.id, await api.claim(item.id)); }, `รับเคส ${item.code} แล้ว โทรหาผู้แจ้งได้เลย`);
}

async function viewPhone(item) {
  await act(async () => { state.phones.set(item.id, await api.contact(item.id)); }, "เปิดดูเบอร์แล้ว (ระบบบันทึกไว้)");
}

async function changeStatus(item, next) {
  let note = null;
  if (next === "RESOLVED") {
    note = await ask({
      title: `ปิดเคส ${item.code}: ช่วยเสร็จแล้ว`, text: "เขียนผลสั้นๆ ตามที่เกิดขึ้นจริง ผู้แจ้งจะเห็นข้อความนี้",
      ok: "ปิดเคส", input: "ผลการช่วย (เช่น อพยพ 3 คนถึงศูนย์พักพิงแล้ว)", required: true
    });
  } else if (next === "HANDED_TO_OFFICIAL") {
    note = await ask({
      title: `ส่งต่อหน่วยงานแล้ว (${item.code})`, text: "กดเมื่อส่งต่อให้หน่วยงานจริงแล้วเท่านั้น เคสจะย้ายไปอยู่ในรายการปิดแล้ว",
      ok: "ยืนยัน", input: "ส่งต่อให้ใคร (ไม่บังคับ)"
    });
  } else {
    note = await ask({
      title: `${ACTION[next]} (${item.code})`,
      text: `ผู้แจ้งจะเห็นว่า "${state.team?.name ?? "ทีมของคุณ"} แจ้งว่า${ACTION[next]}" กดเมื่อเป็นจริงเท่านั้น`, ok: "ยืนยัน"
    });
  }
  if (note === null) return;
  await act(() => api.setStatus(item.id, next, note || null), `บันทึก "${ACTION[next]}" แล้ว`);
}

async function release(item) {
  const reason = await ask({
    title: `คืนเคส ${item.code}`, text: "เคสจะกลับไปเป็น \"รอทีมรับ\" ให้ทีมอื่นเห็น และผู้แจ้งจะเห็นว่ายังไม่มีทีมรับ",
    ok: "คืนเคส", input: "เหตุผล (เช่น เรือเข้าไม่ถึง)", required: true
  });
  if (reason === null) return;
  await act(async () => { await api.release(item.id, reason); state.phones.delete(item.id); }, `คืนเคส ${item.code} แล้ว`);
}

async function removeMember(member, code) {
  const answer = await ask({ title: "เอาออกจากทีม", text: `เอา ${member.display_name} ออกจากทีม? เขาจะไม่เห็นเคสอีก`, ok: "เอาออก" });
  if (answer === null) return;
  await act(() => api.removeMember(code), "เอาออกจากทีมแล้ว");
}

function startTimer() {
  stopTimer();
  timer = setInterval(tick, REFRESH_MS);
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  timer = null;
  heartbeatTimer = null;
}

// Tells the database someone in the team has this page on screen. Only while visible and in a team.
async function beat() {
  if (document.hidden || !state.account?.team_name || !api?.session()) return;
  if (Date.now() - lastBeat < HEARTBEAT_MS - 5_000) return;
  try {
    await api.heartbeat();
    lastBeat = Date.now();
  } catch { /* the next refresh shows the error if the connection is down */ }
}

async function tick() {
  if (acting || document.hidden || $("#ask-dialog").open || !api?.session()) return;
  try { await refreshNow(); } catch (error) { handleError(error); }
}

async function enter() {
  try {
    await refreshNow();
    startTimer();
  } catch (error) {
    handleError(error);
    if (!api.session()) show("#screen-auth");
  }
}

async function authAction(kind) {
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  if (!email || password.length < 8) { toast("ใส่อีเมล และรหัสผ่านอย่างน้อย 8 ตัว"); return; }
  if (acting) return;
  acting = true;
  try {
    await (kind === "signUp" ? api.signUp(email, password) : api.signIn(email, password));
    $("#auth-password").value = "";
    await enter();
  } catch (error) {
    toast(error?.message || "เข้าสู่ระบบไม่สำเร็จ");
  } finally {
    acting = false;
  }
}

function wire() {
  $("#sign-in").addEventListener("click", () => authAction("signIn"));
  $("#sign-up").addEventListener("click", () => authAction("signUp"));
  $("#sign-out").addEventListener("click", async () => {
    stopTimer();
    await api.signOut();
    state = freshState();
    lastBeat = 0;
    document.title = "หน้าทีมอาสา — พร้อมแจ้งน้ำท่วม";
    show("#screen-auth");
  });
  $("#refresh").addEventListener("click", () => tick());
  $("#new-banner").addEventListener("click", () => { $("#new-banner").hidden = true; });
  for (const dutyButton of document.querySelectorAll("[data-duty]")) {
    dutyButton.addEventListener("click", async () => {
      const hours = Number(dutyButton.dataset.duty);
      const answer = await ask({
        title: hours ? `เริ่มเฝ้า ${hours} ชั่วโมง` : "หยุดเฝ้า",
        text: hours
          ? "ระหว่างนี้ประชาชนในจังหวัดที่ทีมดูแลจะส่งเคสเข้ามาหาทีมได้ ต้องมีคนดูหน้านี้ตลอด และรับเคสภายใน 10 นาที"
          : "หลังหยุดเฝ้า ถ้าไม่มีทีมอื่นเฝ้าจังหวัดเดียวกัน ประชาชนจะส่งเคสใหม่เข้ามาไม่ได้ (เคสที่ทีมรับไว้แล้วยังอยู่)",
        ok: hours ? "เริ่มเฝ้า" : "หยุดเฝ้า"
      });
      if (answer === null) return;
      await act(() => api.setDuty(hours), hours ? `เริ่มเฝ้า ${hours} ชม. แล้ว` : "หยุดเฝ้าแล้ว");
    });
  }
  $("#add-button").addEventListener("click", () => act(async () => {
    await api.addMember($("#add-code").value, $("#add-name").value.trim());
    $("#add-code").value = "";
    $("#add-name").value = "";
  }, "เพิ่มสมาชิกแล้ว"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { lastBeat = 0; tick(); } });
}

async function start() {
  const config = await loadTeamConfig();
  if (!config) { show("#screen-unconfigured"); return; }
  api = makeTeamApi(config);
  wire();
  if (!api.session()) { show("#screen-auth"); return; }
  await enter();
}

start();
