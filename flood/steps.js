// Step-by-step layer for the help-message form (#case-form), added over the page as progressive enhancement.
// Without this file the form is one long page, exactly as before. With it, the same fields are shown one group at a
// time with one main button at the bottom of the screen, as in a bank transfer. Nothing here saves or sends anything:
// the case is still checked and saved by app.js and model.js (the form's own Save button is pressed through
// requestSubmit), so the field names, the saved case and the prepared message stay the same.
import { validateTriage } from "./model.js";

const form = document.getElementById("case-form");
if (form && typeof form.requestSubmit === "function" && form.querySelectorAll(":scope > fieldset").length === 3) setup();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function setup() {
  const [triage, place, people] = form.querySelectorAll(":scope > fieldset");
  const needsList = form.querySelector("#needs-list");
  const vulnerableList = form.querySelector("#vulnerable-needs-list");
  const [needsLabel, vulnerableLabel] = people.querySelectorAll(":scope > .choice-label");
  const privacy = form.querySelector("#privacy-copy");
  const errorBox = form.querySelector("#form-error");
  const save = form.querySelector('button[type="submit"]');
  if (!needsList || !vulnerableList || !needsLabel || !vulnerableLabel || !errorBox || !save) return;

  // Step 2 gets its own group: what help is needed, and who needs special care.
  const needs = el("fieldset", "step-needs");
  const legend = el("legend", "", "ต้องการอะไร ");
  legend.append(el("span", "required", "*"));
  needs.append(legend, el("p", "step-hint", "เลือกอย่างน้อย 1 อย่าง แตะได้หลายอัน"), needsList);
  needsLabel.hidden = true;
  // Who needs special care is about the people, so it sits with the head count in step 4.
  vulnerableLabel.textContent = "มีใครต้องดูแลเป็นพิเศษไหม (ไม่บังคับ)";

  const steps = [triage, needs, place, people].map((group, index) => {
    const section = el("section", "step");
    section.dataset.step = String(index + 1);
    section.append(group);
    return section;
  });
  if (privacy) steps[3].append(privacy);

  // Top of every step: where you are, and both emergency numbers one tap away.
  const head = el("div", "steps-head");
  const calls = el("div", "steps-calls");
  for (const [number, label] of [["1784", "ติดน้ำ ขอกู้ภัย"], ["1669", "เจ็บป่วยฉุกเฉิน"]]) {
    const call = el("a", `steps-call${number === "1669" ? " alt" : ""}`);
    call.href = `tel:${number}`;
    call.append(el("b", "", `โทร ${number}`), el("span", "", label));
    calls.append(call);
  }
  const bar = el("div", "steps-progress");
  bar.setAttribute("aria-hidden", "true");
  for (let i = 0; i < steps.length; i += 1) bar.append(el("span"));
  const count = el("p", "steps-count");
  count.setAttribute("aria-live", "polite");
  head.append(calls, bar, count);

  // Bottom of every step: one main button within thumb reach, and a way back that keeps every answer.
  const nav = el("div", "steps-nav");
  const back = el("button", "steps-back", "ย้อนกลับ");
  back.type = "button";
  const next = el("button", "steps-next");
  next.type = "button";
  nav.append(back, next);

  form.prepend(head);
  head.after(...steps);
  steps[3].after(errorBox);
  errorBox.after(nav);
  save.hidden = true;
  form.classList.add("steps-on");

  addCountButtons(people);
  people.querySelector(".count-choices")?.after(vulnerableLabel, vulnerableList);
  foldOptional(place, ["district", "subdistrict"], "+ เพิ่มอำเภอ ตำบล (ถ้ารู้)", place.querySelector('[name="landmark"]')?.closest("label"));
  foldOptional(people, ["details"], "+ เพิ่มรายละเอียด (ไม่บังคับ)");

  let current = 0;
  function show(index, { focus = true } = {}) {
    current = index;
    steps.forEach((section, i) => { section.hidden = i !== index; });
    [...bar.children].forEach((part, i) => part.classList.toggle("on", i <= index));
    count.textContent = `ขั้น ${index + 1} จาก ${steps.length}`;
    back.hidden = index === 0;
    next.textContent = index === steps.length - 1 ? "สร้างข้อความ" : "ถัดไป";
    errorBox.hidden = true;
    if (focus) {
      const title = steps[index].querySelector("legend");
      if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
      // The head is sticky, so scroll to the top of the form itself: the new question then starts just under the head.
      form.scrollIntoView({ block: "start" });
    }
  }

  function problem(index) {
    const values = new FormData(form);
    const chosen = values.getAll("needs");
    if (index === 0) {
      try { validateTriage(values.get("urgentNow"), chosen); } catch (error) { return error.message; }
    }
    const careOnly = ["pregnant", "infant", "elderly", "disabled"];
    if (index === 1 && !chosen.some((need) => !careOnly.includes(need))) return "กรุณาเลือกความช่วยเหลืออย่างน้อยหนึ่งข้อ";
    if (index === 2 && !String(values.get("province") || "").trim()) return "กรุณาระบุจังหวัด";
    const hasPlace = String(values.get("landmark") || "").trim() || (String(values.get("lat") || "") && String(values.get("lon") || ""));
    if (index === 2 && !hasPlace) return "กรุณาระบุจุดสังเกตหรือพิกัด";
    const people = Number(values.get("peopleCount"));
    if (index === 3 && !(Number.isInteger(people) && people >= 1)) return "กรุณาแตะจำนวนคน";
    if (index === 3 && people > 999) return "จำนวนคนต้องไม่เกิน 999";
    return "";
  }

  next.addEventListener("click", () => {
    const message = problem(current);
    if (message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: "nearest" });
      return;
    }
    if (current < steps.length - 1) show(current + 1);
    else {
      // One save per tap: the button waits until app.js has saved (the form resets) or has shown a problem.
      next.disabled = true;
      setTimeout(() => { next.disabled = false; }, 8000);
      form.requestSubmit(save);
    }
  });
  back.addEventListener("click", () => show(Math.max(0, current - 1)));
  // When saving fails because of an answer in an earlier step, go back to that step and keep the message in view.
  const stepFor = [[/อพยพด่วน|เหตุเร่งด่วน/, 0], [/ความช่วยเหลือ/, 1], [/จังหวัด|จุดสังเกต|พิกัด|ละติจูด|ลองจิจูด|GPS/, 2]];
  new MutationObserver(() => {
    if (errorBox.hidden) return;
    const hit = stepFor.find(([pattern]) => pattern.test(errorBox.textContent));
    next.disabled = false;
    if (!hit || hit[1] === current) return;
    const message = errorBox.textContent;
    show(hit[1]);
    errorBox.textContent = message;
    errorBox.hidden = false;
  }).observe(errorBox, { attributes: true, attributeFilter: ["hidden"], childList: true, characterData: true, subtree: true });
  // A message about a missing answer goes away as soon as the person answers.
  for (const type of ["input", "change"]) form.addEventListener(type, () => { errorBox.hidden = true; });

  // After a save app.js empties the form: start again at step 1 and point to the case it just saved.
  let justSaved = false;
  form.addEventListener("reset", () => {
    justSaved = true;
    next.disabled = false;
    setTimeout(() => {
      show(0, { focus: false });
      resetCountButtons(people);
      for (const folder of form.querySelectorAll(".steps-fold")) folder.dispatchEvent(new Event("steps-refold"));
    });
  });
  const list = document.getElementById("case-list");
  if (list) {
    new MutationObserver(() => {
      if (!justSaved) return;
      const card = list.querySelector(".case-card");
      if (!card) return;
      justSaved = false;
      markSaved(card);
    }).observe(list, { childList: true });
  }

  // With very large text the sticky head could cover most of the screen; then it scrolls with the page instead.
  const fitHead = () => head.classList.toggle("steps-head-static", head.offsetHeight > window.innerHeight * 0.3);
  window.addEventListener("resize", fitHead);
  show(0, { focus: false });
  fitHead();
}

// People count: tap 1 to 6, or "more than 6" to type. Starts empty, so the number is always the user's own.
function addCountButtons(people) {
  const input = people.querySelector('input[name="peopleCount"]');
  if (!input) return;
  const group = el("div", "count-choices");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "จำนวนคน");
  const choose = (value, button) => {
    for (const other of group.children) other.setAttribute("aria-pressed", String(other === button));
    input.classList.toggle("count-typed", value === "more");
    if (value === "more") { if (Number(input.value) <= 6) input.value = ""; input.focus(); }
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  for (const value of ["1", "2", "3", "4", "5", "6", "more"]) {
    const button = el("button", "count-choice", value === "more" ? "มากกว่า 6" : value);
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => choose(value, button));
    group.append(button);
  }
  input.closest("label").after(group);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isInteger(n) && n >= 1 && n <= 6 && !input.classList.contains("count-typed")) {
      for (const other of group.children) other.setAttribute("aria-pressed", String(other.textContent === String(n)));
    }
  });
}

function resetCountButtons(people) {
  const input = people.querySelector('input[name="peopleCount"]');
  if (input) input.classList.remove("count-typed");
  for (const button of people.querySelectorAll(".count-choice")) button.setAttribute("aria-pressed", "false");
}

// Fields that are rarely needed stay behind one large button; they open by themselves when they already hold text.
function foldOptional(group, names, text, after = null) {
  const labels = names.map(name => group.querySelector(`[name="${name}"]`)?.closest("label")).filter(Boolean);
  if (!labels.length) return;
  const open = el("button", "steps-fold", text);
  open.type = "button";
  const setFolded = folded => {
    for (const label of labels) label.hidden = folded;
    open.hidden = !folded;
  };
  open.addEventListener("click", () => {
    setFolded(false);
    labels[0].querySelector("input, textarea")?.focus();
  });
  open.addEventListener("steps-refold", () => setFolded(true));
  (after || labels[labels.length - 1]).after(open);
  setFolded(!labels.some(label => label.querySelector("input, textarea")?.value));
}

// The case just saved: open its message, and say plainly that nothing has been sent and what copying does.
function markSaved(card) {
  for (const old of document.querySelectorAll(".case-card.just-saved")) old.classList.remove("just-saved");
  card.classList.add("just-saved");
  const preview = card.querySelector("details.message-preview");
  if (preview) preview.open = true;
  const note = el("p", "saved-note");
  note.append(
    el("b", "", "ข้อความพร้อมแล้ว แต่ยังไม่ถึงใคร เว็บนี้ไม่ส่งให้ใคร"),
    el("span", "", "กดคัดลอกข้อความ แล้วเปิด LINE ปภ. @1784DDPM วางและกดส่งเอง หรือโทร 1784 แล้วอ่านข้อความนี้ ถ้ากดคัดลอก ข้อความจะค้างอยู่ในเครื่องให้วางต่อได้ ถ้ากดแชร์ ข้อความจะไปอยู่ในแอปที่คุณเลือก")
  );
  card.querySelector(".saved-note")?.remove();
  card.prepend(note);
}
