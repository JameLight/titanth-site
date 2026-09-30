// Step-by-step layer for the help-message form (#case-form). The form only works with scripts on (app.js shows it),
// and without this file it is one long page, as before. With it, the same fields are shown one group at a time with one
// main button at the bottom of the screen, as in a bank transfer, then a review of the answers before the message is
// made. Nothing here saves or sends anything: app.js and model.js still check and save the case (the form's own Save
// button is pressed through requestSubmit), so the field names, the saved case and the message stay the same.
import { NEEDS, validateTriage, makeCase, shareText } from "./model.js";

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

  // Step 5 shows every answer with a way back to change it, and the message as it will look, before it is made.
  const review = el("fieldset", "step-review");
  review.append(el("legend", "", "ตรวจก่อนสร้างข้อความ"), el("p", "step-hint", "แตะ \"แก้\" เพื่อกลับไปเปลี่ยนคำตอบ ยังไม่มีอะไรถูกบันทึกหรือส่ง"));
  const answers = el("dl", "review-list");
  const sample = el("pre", "review-message");
  review.append(answers, el("p", "review-sample", "ตัวอย่างข้อความ รหัสบันทึกในเครื่องและเวลาจะใส่ให้ตอนกดสร้างข้อความ ยังไม่ใช่เลขรับเรื่องของหน่วยงาน"), sample);

  const steps = [triage, needs, place, people, review].map((group, index) => {
    const section = el("section", "step");
    section.dataset.step = String(index + 1);
    section.append(group);
    return section;
  });
  if (privacy) steps[4].append(privacy);

  // Top of every step: where you are, and both emergency numbers one tap away.
  const head = el("div", "steps-head");
  const calls = el("div", "steps-calls");
  for (const [number, label] of [["1784", "ติดน้ำ ขอกู้ภัย"], ["1669", "เจ็บป่วยฉุกเฉิน"]]) {
    const call = el("a", `steps-call${number === "1669" ? " alt" : ""}`);
    call.href = `tel:${number}`;
    call.setAttribute("aria-label", `โทร ${number} ${label}`);
    call.append(el("b", "", number), el("span", "", `โทร · ${label}`));
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
  steps[4].after(errorBox);
  errorBox.after(nav);
  save.hidden = true;
  form.classList.add("steps-on");

  addCountButtons(people);
  const countGroup = people.querySelector(".count-choices");
  const countError = el("p", "count-error");
  countError.setAttribute("role", "alert");
  countError.hidden = true;
  people.querySelector(".count-choices")?.after(vulnerableLabel, vulnerableList);
  countGroup?.after(countError);
  foldOptional(place, ["district", "subdistrict"], "+ เพิ่มอำเภอ ตำบล (ถ้ารู้)", place.querySelector('[name="landmark"]')?.closest("label"));
  foldOptional(people, ["details"], "+ เพิ่มรายละเอียด (ไม่บังคับ)");

  let current = 0;
  function show(index, { focus = true } = {}) {
    current = index;
    steps.forEach((section, i) => { section.hidden = i !== index; });
    [...bar.children].forEach((part, i) => part.classList.toggle("on", i <= index));
    count.textContent = `ขั้น ${index + 1} จาก ${steps.length}`;
    back.hidden = index === 0;
    next.textContent = index === steps.length - 1 ? "สร้างข้อความ" : index === steps.length - 2 ? "ตรวจก่อนสร้าง" : "ถัดไป";
    errorBox.hidden = true;
    countError.hidden = true;
    // Built after the old message is cleared, so a problem found while building it stays in view.
    if (index === steps.length - 1) fillReview();
    if (focus) {
      const title = steps[index].querySelector("legend");
      if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
      // The head is sticky, so scroll to the top of the form itself: the new question then starts just under the head.
      form.scrollIntoView({ block: "start" });
    }
  }

  // The review: each answer in words, with "แก้" going back to its step, and the message built by the same code
  // that app.js uses. The case id and time are placeholders here; the saved message gets real ones.
  function fillReview() {
    const values = new FormData(form);
    const chosen = values.getAll("needs");
    const care = ["pregnant", "infant", "elderly", "disabled"];
    const text = (list) => list.map((key) => NEEDS[key]).join(", ") || "-";
    const place = [values.get("province"), values.get("district") && `อ.${values.get("district")}`, values.get("subdistrict") && `ต.${values.get("subdistrict")}`, values.get("landmark")]
      .map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
    const gps = values.get("lat") && values.get("lon") ? `พิกัดจากโทรศัพท์${values.get("accuracyMeters") ? ` (อาจคลาดราว ${Math.round(Number(values.get("accuracyMeters")))} เมตร)` : ""}` : "ไม่ได้ใช้ตำแหน่งโทรศัพท์";
    const rows = [
      ["ตอนนี้", values.get("urgentNow") === "yes" ? "ด่วน" : "ยังไม่ต้องอพยพด่วน", 0],
      ["ต้องการ", text(chosen.filter((key) => !care.includes(key))), 1],
      ["อยู่ที่ไหน", `${place || "-"} · ${gps}`, 2],
      ["จำนวนคน", `${values.get("peopleCount")} คน`, 3],
      ["ดูแลพิเศษ", text(chosen.filter((key) => care.includes(key))), 3],
      ["เบอร์โทรกลับ", String(values.get("contactPhone") || "").trim() || "-", 3],
    ];
    answers.replaceChildren();
    for (const [label, value, step] of rows) {
      const change = el("button", "review-change", "แก้");
      change.type = "button";
      change.setAttribute("aria-label", `แก้ ${label}`);
      change.addEventListener("click", () => show(step));
      const row = el("div", "review-row");
      row.append(el("dt", "", label), el("dd", "", value), change);
      answers.append(row);
    }
    try {
      const draft = makeCase({
        province: values.get("province"), district: values.get("district"), subdistrict: values.get("subdistrict"), landmark: values.get("landmark"),
        lat: values.get("lat"), lon: values.get("lon"), accuracyMeters: values.get("accuracyMeters") || null,
        peopleCount: values.get("peopleCount"), contactPhone: values.get("contactPhone"), needs: chosen, details: values.get("details"),
      }, { id: "(ใส่ตอนสร้างข้อความ)" });
      sample.textContent = shareText(draft).replace(/^ข้อมูล ณ \(เวลาไทย\): .*$/m, "ข้อมูล ณ (เวลาไทย): (ใส่ตอนสร้างข้อความ)");
    } catch (error) {
      sample.textContent = "";
      errorBox.textContent = error.message;
      errorBox.hidden = false;
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
      if (current === 3 && /จำนวนคน/.test(message)) {
        countError.textContent = message;
        countError.hidden = false;
        const input = people.querySelector('input[name="peopleCount"]');
        const target = input?.classList.contains("count-typed") ? input : countGroup?.querySelector(".count-choice");
        target?.focus();
        target?.scrollIntoView({ block: "center" });
        return;
      }
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
  const stepFor = [[/อพยพด่วน|เหตุเร่งด่วน/, 0], [/ความช่วยเหลือ/, 1], [/จังหวัด|จุดสังเกต|พิกัด|ละติจูด|ลองจิจูด|GPS/, 2], [/จำนวนคน/, 3]];
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
  for (const type of ["input", "change"]) form.addEventListener(type, () => { errorBox.hidden = true; countError.hidden = true; });

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

  // With large text keep both call numbers in view, but shorten their labels so the first question is not buried
  // below a tall heading and the bottom Next button. The full call purpose remains in each link's accessible name.
  const fitHead = () => {
    head.classList.remove("steps-head-compact", "steps-head-static");
    if (head.offsetHeight > window.innerHeight * 0.3) head.classList.add("steps-head-compact");
    head.classList.toggle("steps-head-static", head.offsetHeight > window.innerHeight * 0.3);
  };
  window.addEventListener("resize", fitHead);
  const shortcut = document.querySelector(".quick-action-form");
  if (shortcut) shortcut.href = "#case-form";
  show(0, { focus: false });
  fitHead();
}

// People count: tap 1 to 6, or "more than 6" to type. Starts empty, so the number is always the user's own.
function addCountButtons(people) {
  const input = people.querySelector('input[name="peopleCount"]');
  if (!input) return;
  input.tabIndex = -1; // The 1px hidden input must never be a keyboard stop.
  const group = el("div", "count-choices");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "จำนวนคน");
  const choose = (value, button) => {
    for (const other of group.children) other.setAttribute("aria-pressed", String(other === button));
    input.classList.toggle("count-typed", value === "more");
    input.tabIndex = value === "more" ? 0 : -1;
    if (value === "more") { if (Number(input.value) <= 6) input.value = ""; input.focus(); }
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  for (const value of ["1", "2", "3", "4", "5", "6", "more"]) {
    const button = el("button", "count-choice", value === "more" ? "มากกว่า 6" : value);
    button.type = "button";
    button.setAttribute("aria-label", value === "more" ? "มากกว่า 6 คน กรอกจำนวน" : `${value} คน`);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => choose(value, button));
    group.append(button);
  }
  input.closest("label").after(group);
  const unknown = el("p", "step-hint", "ไม่ทราบจำนวน? โทร 1784 แล้วบอกว่าไม่ทราบ อย่าเดาจำนวนคน");
  group.after(unknown);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isInteger(n) && n >= 1 && n <= 6 && !input.classList.contains("count-typed")) {
      for (const other of group.children) other.setAttribute("aria-pressed", String(other.textContent === String(n)));
    }
  });
}

function resetCountButtons(people) {
  const input = people.querySelector('input[name="peopleCount"]');
  if (input) { input.classList.remove("count-typed"); input.tabIndex = -1; }
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

// The case just saved, at the top of the list where app.js scrolls: its real message comes first, open, followed by the
// ways to send it. The copy, LINE and share controls are app.js's own, moved up with their handlers, not copies.
function markSaved(card) {
  for (const old of document.querySelectorAll(".case-card.just-saved")) old.classList.remove("just-saved");
  card.classList.add("just-saved");
  card.querySelector(".saved-top")?.remove();
  const top = el("div", "saved-top");
  const note = el("p", "saved-note");
  note.append(
    el("b", "", "ข้อความพร้อมแล้ว แต่ยังไม่ถึงใคร เว็บนี้ไม่ส่งให้ใคร"),
    el("span", "", "กดคัดลอกข้อความ แล้วเปิด LINE ปภ. @1784DDPM วางและกดส่งเอง (อาจต้องกดเพิ่มเพื่อนก่อน) หรือโทร 1784 แล้วอ่านข้อความนี้ ถ้ากดคัดลอก ข้อความจะค้างอยู่ในเครื่องให้วางต่อได้ ถ้ากดแชร์ ข้อความจะไปอยู่ในแอปที่คุณเลือก")
  );
  top.append(note);
  const preview = card.querySelector("details.message-preview");
  if (preview) { preview.open = true; top.append(preview); }
  const ways = el("div", "saved-actions");
  const find = (selector, words) => [...card.querySelectorAll(selector)].find((node) => node.textContent.includes(words));
  const line = find("a", "LINE");
  if (line) line.classList.add("saved-line");
  for (const control of [find("button", "คัดลอกข้อความ"), line, find("button", "แชร์ข้อความ")]) if (control) ways.append(control);
  const call = el("a", "saved-call", "โทร 1784 แล้วอ่านข้อความนี้");
  call.href = "tel:1784";
  ways.append(call);
  top.append(ways);
  card.prepend(top);
}
