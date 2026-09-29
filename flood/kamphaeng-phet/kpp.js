// Kamphaeng Phet water page. Reads window.KPP_DATA (data.js, written by the updater), window.KPP_GEO (geo.js)
// and the pure rules in kpp-core.js (window.KPPCore). Reads RID's hourly table live from the visitor's phone and
// re-reads data.json every 10 minutes while the page is open.
(function () {
  "use strict";
  const K = window.KPPCore;
  if (!K) return; // kpp-core.js did not load: the notice in index.html then appears by itself after 10 seconds
  // The notice appears by itself (CSS) only if this script never runs, e.g. it failed to load; it runs, so remove it.
  const jsFail = document.getElementById("jsFail"); if (jsFail) jsFail.remove();
  const NS = "http://www.w3.org/2000/svg";
  const HOUR = 3600e3;
  const $ = (id) => document.getElementById(id);
  const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Escaped text in which each number stays on one line with its unit (for example "1.48 ม." never splits).
  const nw = (s) => esc(s).replace(/(\d[\d.]*) (ม\.|ซม\.|ชม\.)/g, '<span class="nw">$1 $2</span>');
  // RID's hourly table lists these seven gauges in Kamphaeng Phet province (P.2A upstream is in Tak).
  const IN_KPP = ["P.7A", "P.15", "P.16", "P.47A", "P.26B", "P.78", "P.50A"];
  const SHORT = { "P.7A": "ตัวเมือง", "P.15": "คลองขลุง", "P.16": "ขาณุฯ", "P.47A": "บ้านโป่งน้ำร้อน", "P.26B": "คลองสวนหมาก", "P.78": "บ้านสามเรือน", "P.50A": "คลองวังเจ้า" };
  const CLS = { ok: "ปกติ", watch: "เฝ้าระวัง", crit: "วิกฤติ", stale: "ไม่มีข้อมูลล่าสุด" };
  const COL = { ok: "var(--ok)", watch: "var(--watch)", crit: "var(--crit)", stale: "var(--stale)" };
  const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const GISTDA_UNTIL = Date.parse("2026-10-02T23:59:00+07:00");
  const PCT = { TH6201: 0.47, TH6202: 0, TH6203: 0.16, TH6204: 5.16, TH6205: 8.88, TH6206: 0, TH6207: 0, TH6208: 3.64, TH6209: 0.62, TH6210: 5.26, TH6211: 0.08 };
  // P.50A is projected with the same linear fit as the other gauges (RID Ping station list, 16°32'59"N 99°15'00"E).
  // P.26B has no confirmed position, so it is listed in the river panel but not pinned on the map.
  const EXTRA_POS = { "P.50A": [87.9, 164.5] };
  const NO_PIN = new Set(["P.26B"]);
  const REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const SCROLL = { behavior: REDUCED ? "auto" : "smooth" };

  const th = (ms) => new Date(ms + 7 * HOUR);
  const thDateTime = (ms) => { const d = th(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`; };
  const thHM = (ms) => { const d = th(ms); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`; };
  // Time of a reading: only the clock for today, with the date for an earlier day.
  const whenText = (ms) => (K.thaiDate(ms) === K.thaiDate(Date.now()) ? thHM(ms) : thDateTime(ms));
  const cm = (x) => Math.abs(K.cmOf(x));
  const cls = K.cls, lastIdx = K.lastIdx, gapText = K.gapText, STALE_H = K.STALE_H;

  function shapeSVG(c, size) {
    const s = size || 16, col = COL[c];
    if (c === "crit") return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><path d="M8 1l7 7-7 7-7-7z" fill="${col}"/></svg>`;
    if (c === "watch") return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><path d="M8 1.5l7 13H1z" fill="${col}" stroke="var(--watchInk)" stroke-width="1" stroke-linejoin="round"/></svg>`;
    if (c === "stale") return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="${col}" stroke-width="2.5"/></svg>`;
    return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="${col}"/></svg>`;
  }

  let D = null, GEO = window.KPP_GEO, N = 0, LAST = 0, START = 0, OBS = 0, fresh = "fresh", timer = null, opener = null;

  const stationsIn = () => IN_KPP.filter((id) => D.river.stations[id]);
  function valueAt(s, i) { const j = lastIdx(s.s, i); return j < 0 ? null : s.s[j]; }
  const trend = (s, i) => K.trend(s.s, i);
  const flatRun = (s, i) => K.flatRun(s.s, i);
  const flatText = (fl) => (fl ? `เปลี่ยนไม่เกิน 1 ซม. มา${fl.fromStart ? "อย่างน้อย" : ""} ${fl.h} ชม.` : "");
  // A station whose newest reading is more than STALE_H hours before the shown hour has no recent data:
  // it is marked "ไม่มีข้อมูลล่าสุด" with the time of its last reading and is never counted as normal.
  const C = (i) => (id) => { const s = D.river.stations[id]; if (!s) return "stale"; const j = lastIdx(s.s, i); return fresh === "old" || j < 0 || i - j > STALE_H ? "stale" : cls(s.s[j], s); };

  function freshness() {
    const age = (Date.now() - OBS) / 60000;
    fresh = age < 0 ? "fresh" : age <= 120 ? "fresh" : age <= 360 ? "slow" : "old";
    const a = $("age"), mins = Math.round(Math.max(0, age)), h = Math.floor(mins / 60), m = mins % 60;
    const ago = `${h ? h + " ชม." : ""}${h && m ? " " : ""}${m || !h ? m + " นาที" : ""}`;
    a.className = "age" + (fresh === "slow" ? " slow" : fresh === "old" ? " old" : "");
    a.textContent = `วัดเมื่อ ${whenText(OBS)}` + (age < 0 ? "" : ` (${ago}${ago.endsWith(".") ? " " : ""}ที่แล้ว)`) + (fresh === "slow" ? " · ข้อมูลช้า" : fresh === "old" ? " · เก่าแล้ว" : "");
    document.body.classList.toggle("paused", fresh !== "fresh");
  }

  function status() {
    const ids = stationsIn(), c = ids.map(C(LAST)), n = { crit: 0, watch: 0, stale: 0 };
    c.forEach((k) => { if (n[k] !== undefined) n[k]++; });
    const worst = fresh === "old" ? "stale" : n.crit ? "crit" : n.watch ? "watch" : n.stale ? "stale" : "ok";
    const critNames = ids.filter((id, k) => c[k] === "crit").map((id) => SHORT[id] || id);
    const txt = fresh === "old" ? "ไม่มีข้อมูลล่าสุด ดูต้นทางหรือโทร 1784"
      : [n.crit ? `วิกฤติ ${n.crit} จุด` + (n.crit <= 2 ? ` (${critNames.join(", ")})` : "") : "", n.watch ? `เฝ้าระวัง ${n.watch} จุด` : "",
        !n.crit && !n.watch && !n.stale ? "ปกติทุกจุด" : "", !n.crit && !n.watch && n.stale ? `ปกติ ${ids.length - n.stale} จุด` : "",
        n.stale ? `ไม่มีค่าล่าสุด ${n.stale} จุด` : ""].filter(Boolean).join(" · "); // the town trend is right below, in the hero
    $("stWord").innerHTML = shapeSVG(worst) + "<span>" + esc(txt) + "</span>";
    const t = $("tRiver");
    t.textContent = fresh === "old" ? "–" : `${n.crit + n.watch}/${ids.length}`;
    t.className = fresh === "old" ? "" : n.crit ? "c-crit" : n.watch ? "c-watch" : "";
    $("tRiverOf").textContent = `ถึงเกณฑ์เฝ้าระวัง/วิกฤติ (จาก ${ids.length} จุด)`;
  }

  function drawXsec(s, v, rising) {
    const x = $("xsec"); x.innerHTML = "";
    const bankY = 46, bedY = 176, Y = (L) => bedY - (L / s.bank) * (bedY - bankY), over = v != null && K.cmOf(v) > K.cmOf(s.bank);
    const chan = "M58,46 C84,46 96,176 124,176 L220,176 C248,176 258,46 284,46";
    const defs = el("defs", {}, x), cp = el("clipPath", { id: "ch" }, defs); el("path", { d: chan + " Z" }, cp);
    el("path", { d: "M0,46 L58,46 C84,46 96,176 124,176 L220,176 C248,176 258,46 284,46 L340,46 L340,196 L0,196 Z", fill: "var(--earth)" }, x);
    el("path", { d: "M0,46 L58,46 M284,46 L340,46", stroke: "var(--earth2)", "stroke-width": 3, fill: "none" }, x);
    const house = (a) => { const h = el("g", Object.assign({ transform: "translate(12,20)" }, a), x); el("path", { d: "M2 12 L14 2 L26 12 V26 H2 Z", fill: "var(--house)" }, h); el("rect", { x: 11, y: 16, width: 6, height: 10, fill: "var(--surface)" }, h); };
    house({});
    const tl = el("text", { x: 8, y: 62, class: "t-land" }, x); tl.textContent = "ฝั่งตัวเมือง";
    if (v != null) {
      const g = el("g", { "clip-path": "url(#ch)" }, x), wy = Y(v), f = el("g", { class: "fill" }, g);
      el("rect", { x: 40, y: wy + 3, width: 260, height: Math.max(0, bedY - wy + 10), fill: "var(--water)" }, f);
      let d = `M40 ${wy + 3}`; for (let k = 0; k < 15; k++) d += " q10 -5 20 0"; d += " v10 h-300 z";
      el("path", { class: "ripple", d, fill: "var(--water)" }, f);
      if (rising) for (let k = 0; k < 3; k++) { const cx = 150 + k * 22, cy = (over ? bankY : wy) + 34; el("path", { class: "chev" + (k ? " chev" + (k + 1) : ""), d: `M${cx - 7} ${cy} l7 -7 l7 7`, stroke: "#fff", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, f); }
      if (over) {
        // Above the bank the water spreads over the land on both sides, up to its level.
        // The top stays inside the picture (y >= 6) and is at least a thin sheet so a small overflow is still visible.
        const top = Math.max(6, Math.min(wy, bankY - 8));
        const oc = el("clipPath", { id: "ov" }, defs); el("rect", { x: 0, y: 0, width: 340, height: bankY }, oc); el("path", { d: chan + " Z" }, oc); // land above the bank line, plus the channel so the two waters overlap without a seam
        let o = `M0 ${top + 3}`; for (let k = 0; k < 20; k++) o += " q10 -5 20 0"; o += ` V${bankY + 4} H0 Z`;
        el("path", { class: "ripple", d: o, fill: "var(--water)" }, el("g", { class: "fill" }, el("g", { "clip-path": "url(#ov)" }, x)));
        house({ opacity: 0.35 }); // the part of the house under water still shows faintly
      }
      const n = el("text", { x: 172, y: bedY - 10, "text-anchor": "middle", class: "t-water" }, x); n.textContent = `น้ำ ${v.toFixed(2)} ม.`;
    }
    el("line", { x1: 40, x2: 304, y1: bankY, y2: bankY, stroke: "var(--crit)", "stroke-width": 2, "stroke-dasharray": "6 4" }, x);
    const b = el("text", { x: 336, y: bankY - 6, "text-anchor": "end", class: over ? "t-crit t-halo" : "t-crit" }, x); b.textContent = `ตลิ่ง ${s.bank.toFixed(2)} ม.`;
    el("line", { x1: 60, x2: 282, y1: Y(s.watch), y2: Y(s.watch), stroke: "var(--watch)", "stroke-width": 2, "stroke-dasharray": "4 4" }, x);
    const w = el("text", { x: 336, y: Y(s.watch) + 4, "text-anchor": "end", class: "t-watch" }, x); w.textContent = "เริ่มเฝ้าระวัง";
  }

  function hero() {
    const s = D.river.stations["P.7A"], v = valueAt(s, LAST), c = C(LAST)("P.7A"), tr = trend(s, LAST);
    const j0 = lastIdx(s.s, LAST), oldP = j0 >= 0 && LAST - j0 > STALE_H, notNow = fresh !== "fresh" || oldP;
    const at = whenText(oldP ? START + j0 * HOUR : OBS), pre = notNow ? `เมื่อ ${at} ` : "";
    // Big text: how far the river is from the next RID level. RID's own class stays visible in the small line below.
    // The phrase after the distance never breaks inside a word ("ถึงเกณฑ์เฝ้าระวัง" stays on one line).
    const [big, tail] = v == null ? ["ไม่มีข้อมูลล่าสุด", ""] : c === "ok" || (c === "stale" && cls(v, s) === "ok") ? [`อีก ${cm(s.watch - v)} ซม.`, "ถึงเกณฑ์เฝ้าระวัง"]
      : cls(v, s) === "watch" ? [`อีก ${cm(s.bank - v)} ซม.`, "ถึงตลิ่ง"] : [gapText(v, s), ""];
    $("hVerdict").innerHTML = shapeSVG(c, 26) + `<span class="${c === "crit" ? "c-crit" : ""}">${nw((notNow && v != null ? `ตอน ${at} ` : "") + big)}${tail ? ` <span class="nw">${esc(tail)}</span>` : ""}</span>`;
    const t = $("hTrend"); t.className = "chip " + tr.k; t.innerHTML = nw(tr.t); t.hidden = notNow || tr.h === 0;
    const ch = K.change8(s.s, LAST);
    $("hSentence").innerHTML = nw(pre + gapText(v, s) + (ch ? ` · ${ch.t}` : ""));
    $("hWatch").innerHTML = `<span class="c-${c}">${esc(CLS[c])}</span>` + (c === "stale" ? nw(v == null ? "" : ` · ค่าล่าสุด ${at}`) : nw(` ตามเกณฑ์กรมชลประทาน (เฝ้าระวัง ${s.watch.toFixed(2)} ม. · ตลิ่ง ${s.bank.toFixed(2)} ม.)`));
    const u = D.river.stations["P.2A"];
    if (u) {
      const p = K.peakDrop(u.s, LAST), when = p ? thDateTime(START + p.peakIdx * HOUR) : "";
      // Lead with the place, so a quick reader does not take the upstream fall for the town.
      $("hUp").innerHTML = nw((notNow ? `เมื่อ ${at} ` : "") + (!p || p.drop < 5 ? `ต้นน้ำ จ.ตาก (ไม่ใช่ตัวเมือง): ${trend(u, LAST).w}`
        : p.atStart ? `ต้นน้ำ จ.ตาก (ไม่ใช่ตัวเมือง): ลดลงอย่างน้อย ${p.drop} ซม. ตั้งแต่ ${when} (ช่วงเวลาที่หน้านี้มีข้อมูล)` : `ต้นน้ำ จ.ตาก (ไม่ใช่ตัวเมือง): ลดลง ${p.drop} ซม. จากจุดสูงสุดเมื่อ ${when}`));
    }
    drawXsec(s, v, tr.k === "up" && !notNow);
  }

  const ORDER = [["P.2A", { lbl: "คลองวังเจ้า อ.โกสัมพีนคร", ids: ["P.50A"] }], ["P.7A", { lbl: "คลองสวนหมาก ไหลมาบรรจบใกล้ตัวเมือง", ids: ["P.47A", "P.26B"] }], ["P.15", { lbl: "คลองขลุง ไหลมาบรรจบ", ids: ["P.78"] }], ["P.16"]];
  let stopEls = {};
  function buildRibbon() {
    const rib = $("ribbon"); rib.innerHTML = ""; stopEls = {};
    const mk = (id) => { const b = document.createElement("button"); b.className = "stop"; b.type = "button"; b.innerHTML = `<span class="dot"></span><span class="nm"></span><span class="val"></span>`; b.addEventListener("click", () => openSheet(id, b)); stopEls[id] = b; return b; };
    ORDER.forEach(([id, br]) => {
      if (!D.river.stations[id]) return;
      const li = document.createElement("li"); li.appendChild(mk(id)); rib.appendChild(li);
      const ids = br ? br.ids.filter((b) => D.river.stations[b]) : [];
      if (ids.length) {
        const ul = document.createElement("ul"); ul.className = "branch";
        const l = document.createElement("li"); l.className = "lbl"; l.textContent = br.lbl; ul.appendChild(l);
        ids.forEach((b) => { const li2 = document.createElement("li"); li2.appendChild(mk(b)); ul.appendChild(li2); });
        const li3 = document.createElement("li"); li3.appendChild(ul); rib.appendChild(li3);
      }
    });
    const out = document.createElement("li"); out.className = "out"; out.textContent = "↓ ไหลต่อไปนครสวรรค์"; rib.appendChild(out);
    $("rKey").innerHTML = ["ok", "watch", "crit", "stale"].map((k) => `<span class="k">${shapeSVG(k, 14)}${esc(CLS[k])}</span>`).join("") + "<span>(เกณฑ์กรมชลประทาน)</span>";
  }
  function paintRibbon(i) {
    for (const id in stopEls) {
      const s = D.river.stations[id], b = stopEls[id];
      if (!s || !b) continue;
      const v = valueAt(s, i), c = C(i)(id), tr = trend(s, i), fl = flatRun(s, i);
      const j = lastIdx(s.s, i), old = j >= 0 && i - j > STALE_H;
      const flat = flatText(fl);
      // A stopped gauge shows when its last reading was; a flat gauge shows no trend; early replay hours show none either.
      const sub = j < 0 ? `ไม่มีค่าในช่วง ${N} ชม. ที่แสดง` : old ? `ไม่มีค่าใหม่ตั้งแต่ ${thDateTime(START + j * HOUR)}`
        : fresh === "old" ? `ค่าเมื่อ ${whenText(START + j * HOUR)}` : fl || tr.h === 0 ? "" : tr.t;
      const subK = old || j < 0 || fresh === "old" ? "flat" : tr.k;
      b.querySelector(".dot").innerHTML = shapeSVG(c, 24);
      b.querySelector(".nm").innerHTML = `${esc(s.name)}<small>${esc(s.place)}</small>`;
      const main = old || fresh === "old" ? `<span class="oldv">${nw("ค่าเดิม " + gapText(v, s))}</span>` : nw(gapText(v, s));
      b.querySelector(".val").innerHTML = main + (sub ? `<small class="${subK}">${nw(sub)}</small>` : "") + (flat ? `<small class="stuck">${nw(flat)}</small>` : "");
      b.setAttribute("aria-label", `${s.name} ${CLS[c]} ${gapText(v, s)}` + (sub ? " " + sub : "") + (flat ? " " + flat : ""));
    }
    const when = thDateTime(START + i * HOUR);
    $("clock").textContent = i === LAST ? "ตอนนี้ (" + when + ")" : when;
    $("scrub").setAttribute("aria-valuetext", when);
    $("riverTime").textContent = "กรมชลประทาน · " + when;
  }

  let mapDots = {};
  function buildMap() {
    const map = $("mapSvg"); map.innerHTML = ""; mapDots = {}; map.setAttribute("viewBox", `0 0 ${GEO.W} ${GEO.H}`);
    const expired = Date.now() > GISTDA_UNTIL;
    if (expired) { map.classList.add("oldfill"); $("mapNote").textContent = "ข้อมูลดาวเทียมชุดนี้ (23–29 ก.ย.) เก่าแล้ว จึงไม่ลงสีอำเภอ ดูภาพล่าสุดที่เว็บ GISTDA"; $("tMap").textContent = "–"; }
    GEO.districts.forEach((d) => { const p = PCT[d.pcode]; const b = p == null || p === 0 ? 0 : p < 1 ? 1 : p <= 5 ? 2 : 3; el("path", { d: d.d, class: "d f" + b }, map); });
    GEO.districts.filter((d) => d.pcode !== "TH6205" && d.pcode !== "TH6201").forEach((d) => { const t = el("text", { x: d.cx, y: d.cy, "text-anchor": "middle", class: "dl" }, map); t.textContent = d.name.replace("วรลักษบุรี", "ฯ").replace("ทรายทองวัฒนา", "ทรายทองฯ"); });
    GEO.rivers.forEach((r, i) => { const main = i === 0; el("path", { d: r.d, class: "rv", "stroke-width": main ? 4.5 : 2.4 }, map); el("path", { d: r.d, class: "rf", "stroke-width": main ? 2 : 1.2 }, map); });
    const LAB = { "P.2A": ["ตาก (ต้นน้ำ)", 10, 4], "P.7A": ["ตัวเมือง", 10, -8], "P.15": ["ปิง คลองขลุง", -10, -8, "end"], "P.16": ["ขาณุฯ", 10, 4], "P.47A": ["โป่งน้ำร้อน", -10, 14, "end"], "P.78": ["สามเรือน", -10, 14, "end"], "P.50A": ["คลองวังเจ้า", 10, -8] };
    const posOf = (id) => (NO_PIN.has(id) ? null : GEO.stations[id] || EXTRA_POS[id] || null);
    Object.keys(D.river.stations).forEach((id) => { const pos = posOf(id), lab = LAB[id]; if (!pos || !lab) return; const t = el("text", { x: pos[0] + lab[1], y: pos[1] + lab[2], class: "sl", "text-anchor": lab[3] || "start" }, map); t.textContent = lab[0]; });
    Object.keys(D.river.stations).forEach((id) => {
      const pos = posOf(id); if (!pos) return;
      const g = el("g", { tabindex: 0, role: "button", class: "pin" }, map);
      // Clicks and taps are handled once on the whole map (see wire): a tap near a pin opens it.
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(id, g); } });
      mapDots[id] = { g, x: pos[0], y: pos[1] };
    });
  }
  function paintMap(i) {
    for (const id in mapDots) {
      const s = D.river.stations[id]; if (!s) continue;
      const { g, x, y } = mapDots[id]; g.innerHTML = ""; const c = C(i)(id);
      el("circle", { cx: x, cy: y, r: 9, fill: "var(--surface)" }, g);
      if (c === "crit") el("path", { d: `M${x} ${y - 7} L${x + 7} ${y} L${x} ${y + 7} L${x - 7} ${y} Z`, fill: COL[c] }, g);
      else if (c === "watch") el("path", { d: `M${x} ${y - 7} L${x + 7} ${y + 5} L${x - 7} ${y + 5} Z`, fill: COL[c], stroke: "var(--watchInk)", "stroke-width": 1 }, g);
      else if (c === "stale") el("circle", { cx: x, cy: y, r: 5.5, fill: "none", stroke: COL[c], "stroke-width": 2.4 }, g);
      else el("circle", { cx: x, cy: y, r: 6.5, fill: COL[c] }, g);
      g.setAttribute("aria-label", `${s.name} ${CLS[c]}`);
    }
  }

  function drawChart(s) {
    const c = $("shChart"); c.innerHTML = "";
    const vals = s.s.filter((v) => v != null);
    if (!vals.length) { const t = el("text", { x: 170, y: 100, "text-anchor": "middle" }, c); t.textContent = `ยังไม่มีค่าระดับน้ำของจุดนี้ในช่วง ${N} ชม. ที่แสดง`; return; }
    const L = 36, R = 334, T = 10, B = 158;
    const hi = Math.max(s.bank + 0.4, Math.max(...vals) + 0.3), lo = Math.max(0, Math.floor(Math.min(...vals) - 0.4));
    const X = (i) => L + (i * (R - L)) / (N - 1), Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
    const inPlot = (y) => Math.min(B, Math.max(T, y)); // colour bands never spill under the axis labels
    const yw = inPlot(Y(s.watch)), yb = inPlot(Y(s.bank));
    el("rect", { x: L, y: yw, width: R - L, height: Math.max(0, B - yw), class: "b-ok" }, c);
    el("rect", { x: L, y: yb, width: R - L, height: Math.max(0, yw - yb), class: "b-watch" }, c);
    el("rect", { x: L, y: T, width: R - L, height: Math.max(0, yb - T), class: "b-crit" }, c);
    const step = hi - lo > 4 ? 2 : hi - lo < 2 ? 0.5 : 1;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { el("line", { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: "var(--line)", "stroke-width": 1 }, c); const t = el("text", { x: L - 5, y: Y(v) + 4, "text-anchor": "end" }, c); t.textContent = (step < 1 ? v.toFixed(1) : String(v)) + " ม."; }
    el("line", { x1: L, x2: R, y1: Y(s.bank), y2: Y(s.bank), stroke: "var(--crit)", "stroke-width": 1.6, "stroke-dasharray": "5 4" }, c);
    const bt = el("text", { x: R - 2, y: Y(s.bank) - 4, "text-anchor": "end", class: "t-crit" }, c); bt.textContent = "ตลิ่ง";
    let d = "", pen = false;
    s.s.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? " L" : " M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
    el("path", { d: d.trim(), fill: "none", stroke: "var(--water)", "stroke-width": 2.8, "stroke-linejoin": "round" }, c);
    el("line", { x1: X(LAST), x2: X(LAST), y1: T, y2: B, stroke: "var(--muted)", "stroke-dasharray": "3 3" }, c);
    const lj = lastIdx(s.s, LAST); if (lj >= 0) el("circle", { cx: X(lj), cy: Y(s.s[lj]), r: 5, fill: "var(--water)", stroke: "var(--surface)", "stroke-width": 2 }, c);
    [[0, "start"], [Math.round(LAST / 2), "middle"], [LAST, "end"]].forEach(([i, a]) => { const e = el("text", { x: X(i), y: B + 16, "text-anchor": a }, c); e.textContent = (i === LAST ? "ตอนนี้ " : "") + thDateTime(START + i * HOUR); });
    const cap = el("text", { x: L, y: B + 34 }, c); cap.textContent = "เขียว ปกติ · เหลือง เฝ้าระวัง · แดง ถึงหรือเหนือตลิ่ง (เกณฑ์กรมชลประทาน)";
  }
  function openSheet(id, from) {
    const s = D.river.stations[id]; if (!s) return;
    opener = from || document.activeElement;
    const v = valueAt(s, LAST), c = C(LAST)(id), tr = trend(s, LAST), j = lastIdx(s.s, LAST), fl = flatRun(s, LAST), msg = [];
    $("shName").textContent = s.name; $("shPlace").textContent = s.place + " · กรมชลประทาน " + (j >= 0 ? thDateTime(START + j * HOUR) : "ไม่มีค่าในช่วงที่แสดง");
    $("shGap").innerHTML = nw(gapText(v, s)); $("shTrend").innerHTML = nw(j >= 0 && LAST - j > STALE_H ? "ไม่ทราบ" : fl ? "ไม่แน่ใจ" : tr.t); $("shCls").innerHTML = shapeSVG(c, 14) + " " + CLS[c];
    if (j < 0) msg.push(`ยังไม่มีค่าระดับน้ำของจุดนี้ในช่วง ${N} ชม. ที่แสดง`);
    else if (LAST - j > STALE_H) msg.push(`จุดนี้ยังไม่มีค่าใหม่ ค่าล่าสุดเมื่อ ${thDateTime(START + j * HOUR)}`);
    if (fl) msg.push(`ค่าที่จุดนี้${flatText(fl)} อาจเป็นเครื่องวัดค้าง หรือน้ำนิ่งจริง เว็บกรมชลประทานแสดงค่าเดียวกัน ถ้าอยู่ใกล้จุดนี้ ให้ดูสภาพน้ำจริง ถามผู้นำชุมชน หรือโทร 1784`);
    const sf = $("shFlat"); sf.hidden = !msg.length; sf.innerHTML = nw(msg.join(" · "));
    drawChart(s);
    $("app").inert = true; $("sheet").hidden = false; $("scrim").hidden = false; $("shClose").focus();
  }
  function closeSheet() {
    if ($("sheet").hidden) return;
    $("sheet").hidden = true; $("scrim").hidden = true; $("app").inert = false;
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }

  function alerts() {
    const A = D.alerts, act = $("activeAlerts"), calm = $("alertCalm"), past = $("alertPast");
    act.innerHTML = ""; calm.innerHTML = ""; past.innerHTML = "";
    if (!A) { calm.innerHTML = `<p class="calm">ยังตรวจประกาศของ ปภ. ไม่ได้ในรอบนี้</p>`; return; }
    const now = Date.now();
    const active = A.items.filter((x) => now < Date.parse(x.sent_at) + x.duration_h * HOUR);
    active.forEach((x) => { const d = document.createElement("div"); d.className = "alertbox"; d.innerHTML = `<b>ประกาศทางการ ปภ. ${esc(thDateTime(Date.parse(x.sent_at)))}</b>${esc(x.text)}`; act.appendChild(d); });
    if (!active.length) calm.innerHTML = `<p class="calm">ยังไม่พบประกาศที่กำลังแสดงของ ปภ. สำหรับกำแพงเพชร ในข้อมูลประกาศที่บันทึกเมื่อ ${esc(thDateTime(Date.parse(A.checked_at)))} การไม่พบประกาศไม่ได้แปลว่าปลอดภัย</p>`;
    const old = A.items.filter((x) => !active.includes(x));
    if (old.length) past.innerHTML = `<details><summary>ประกาศที่ผ่านมาใน 7 วัน (${old.length})</summary>${old.map((x) => `<p class="note"><b>${esc(thDateTime(Date.parse(x.sent_at)))}</b> ${esc(x.text)} (ตั้งให้แสดงบนมือถือ ${x.duration_h} ชั่วโมง)</p>`).join("")}</details>`;
  }

  function rain() {
    const F = D.forecast, box = $("days"); box.innerHTML = "";
    if (!F || !F.days || !F.days.length) { box.innerHTML = `<p class="note">ยังดึงพยากรณ์ไม่ได้ในรอบนี้</p>`; return; }
    const now = Date.now(), today = K.thaiDate(now);
    const days = F.days.filter((x) => x.date >= today).slice(0, 2);
    days.forEach((x) => {
      const [, m, dd] = x.date.split("-").map(Number), label = K.dayLabel(x.date, now);
      const drops = x.rain_pct >= 60 ? 3 : x.rain_pct >= 30 ? 2 : x.rain_pct > 0 ? 1 : 0;
      let dp = ""; for (let i = 0; i < drops; i++) { const dx = 14 + i * 8; dp += `<path d="M${dx} 30l-2 6" stroke="var(--water)" stroke-width="3" stroke-linecap="round"/>`; }
      const div = document.createElement("div"); div.className = "day";
      div.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M11 26a8 8 0 0 1 1.6-15.8A10.5 10.5 0 0 1 32 12a6.5 6.5 0 0 1 0 14z" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>${dp}</svg><div><b>${label ? label + " " : ""}${dd} ${MONTHS[m - 1]}</b><span>${esc(x.desc)} ${x.rain_pct}% ของพื้นที่ · ${x.tmin}–${x.tmax}°C</span></div>`;
      box.appendChild(div);
    });
  }

  // ---- live river levels straight from RID's public table (works from phones in Thailand; RID sends Access-Control-Allow-Origin: *) ----
  const RID_URL = "https://hyd-app-db.rid.go.th/webservice/getGroupHourlyWaterLevelReportAllHLWLCriteriaAD.ashx";
  const pad2 = (n) => String(n).padStart(2, "0");
  const ridDate = (ms) => { const d = th(ms); return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear() + 543}`; };
  async function ridDay(ms) {
    const body = new URLSearchParams({ "DW[UtokID]": "2", "DW[BasinID]": "6", "DW[TimeCurrent]": ridDate(ms), _search: "false", rows: "100", page: "1", sidx: "indexhourly", sord: "asc" });
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(RID_URL, { method: "POST", body, cache: "no-store", signal: ctl.signal });
      if (!r.ok) throw new Error("http " + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.rows)) throw new Error("empty");
      return { ms, rows: j.rows };
    } finally { clearTimeout(to); }
  }
  async function liveRiver(base) {
    if (!base || !base.stations || !base.stations["P.7A"] || base.stations["P.7A"].col == null) throw new Error("no column map");
    const now = Date.now();
    // Before 10:00 Thai time the window also reaches back into the day before yesterday.
    const dayList = (th(now).getUTCHours() < 10 ? [now - 48 * HOUR] : []).concat([now - 24 * HOUR, now]);
    const days = await Promise.all(dayList.map(ridDay));
    const pts = {}, watchNow = {}; let lastMs = -Infinity;
    for (const day of days) {
      const d = th(day.ms), y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
      for (const row of day.rows) {
        const h = Math.round(Number(String(row.hourlytime).replace(",", ".")));
        if (!(h >= 0 && h <= 24)) continue;
        const tms = Date.UTC(y, m, dd, h) - 7 * HOUR;
        for (const [code, s] of Object.entries(base.stations)) {
          if (s.col == null) continue;
          const raw = row["wlvalues" + s.col];
          if (raw === "" || raw === null || raw === undefined) continue;
          const v = Number(raw); if (!Number.isFinite(v)) continue;
          const crit = /([\d.]+)\s*-\s*([\d.]+)/.exec(String(row["WLCriteria" + s.col] || ""));
          if (!crit || Math.abs(Number(crit[2]) - s.bank) > 0.005) throw new Error("column check failed for " + code);
          (pts[code] || (pts[code] = new Map())).set(tms, Math.round(v * 100) / 100);
          watchNow[code] = Number(crit[1]);
          if (tms > lastMs) lastMs = tms; // the window ends at the newest reading of any gauge, not only P.7A
        }
      }
    }
    if (!Number.isFinite(lastMs)) throw new Error("no readings");
    const n = base.stations["P.7A"].s.length, startMs = lastMs - (n - 1) * HOUR, stations = {};
    for (const [code, s] of Object.entries(base.stations)) {
      const arr = Array(n).fill(null), mp = pts[code];
      if (mp) for (const [tt, v] of mp) { const i = Math.round((tt - startMs) / HOUR); if (i >= 0 && i < n) arr[i] = v; }
      stations[code] = Object.assign({}, s, { s: arr, watch: watchNow[code] != null ? watchNow[code] : s.watch });
    }
    return Object.assign({}, base, { stations, start: new Date(startMs).toISOString(), observed_at: new Date(lastMs).toISOString(), live: true });
  }
  let BASE = null, lastLiveTry = 0;
  async function tryLive(force) {
    const now = Date.now();
    if (!force && now - lastLiveTry < 5 * 60000) return; // at most one live read of RID per 5 minutes per open page
    lastLiveTry = now;
    try {
      const river = await liveRiver((BASE || D || {}).river);
      if (!D || !D.river || Date.parse(river.observed_at) >= Date.parse(D.river.observed_at)) render(Object.assign({}, BASE || D, { river }));
    } catch (e) { /* outside Thailand, offline or RID down: keep the saved numbers, shown with their age */ }
  }

  function render(data) {
    D = data; const R = D && D.river;
    if (!R || !R.stations || !R.stations["P.7A"]) { $("stWord").textContent = "ยังโหลดข้อมูลไม่ได้"; $("age").textContent = "โทร 1784 ถ้าต้องการความช่วยเหลือ"; return; }
    if (!$("sheet").hidden) closeSheet();
    START = Date.parse(R.start); OBS = Date.parse(R.observed_at); N = R.stations["P.7A"].s.length; LAST = N - 1;
    const sc = $("scrub"); sc.max = String(LAST); sc.value = String(LAST);
    $("play").textContent = REDUCED ? "เลื่อนแถบเพื่อดูเวลา" : `▶ ย้อนดู ${N} ชม.`;
    freshness(); status(); hero(); buildRibbon(); paintRibbon(LAST); buildMap(); paintMap(LAST); alerts(); rain();
  }

  function wire() {
    const toRiver = () => $("river").scrollIntoView(SCROLL);
    $("status").addEventListener("click", toRiver); // the whole bar is a tap target; the button inside serves keyboards
    document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => $(b.dataset.go).scrollIntoView(SCROLL)));
    // Pins are small on a phone: a tap within 22 screen px of a pin centre opens it, and the nearest pin wins.
    // A click that carries no usable position (for example from a screen reader) opens the pin it was sent to.
    $("mapSvg").addEventListener("click", (e) => {
      const has = (id) => !!(D && D.river && D.river.stations && D.river.stations[id]);
      const m = $("mapSvg").getScreenCTM(); let best = null, bd = 22;
      if (m) for (const id in mapDots) {
        if (!has(id)) continue;
        const p = mapDots[id], d = Math.hypot(m.a * p.x + m.c * p.y + m.e - e.clientX, m.b * p.x + m.d * p.y + m.f - e.clientY);
        if (d <= bd) { bd = d; best = id; }
      }
      if (!best) for (const id in mapDots) if (has(id) && mapDots[id].g.contains(e.target)) best = id;
      if (best) openSheet(best, mapDots[best].g);
    });
    const scrub = $("scrub");
    scrub.addEventListener("input", () => { paintRibbon(+scrub.value); paintMap(+scrub.value); });
    $("play").addEventListener("click", () => {
      if (timer) { clearInterval(timer); timer = null; $("play").textContent = `▶ ย้อนดู ${N} ชม.`; return; }
      let i = 0; scrub.value = "0"; paintRibbon(0); paintMap(0); $("play").textContent = "■ หยุด";
      timer = setInterval(() => { i++; scrub.value = String(i); paintRibbon(i); paintMap(i); if (i >= LAST) { clearInterval(timer); timer = null; $("play").textContent = `▶ ย้อนดู ${N} ชม.`; } }, 500);
    });
    if (REDUCED) $("play").disabled = true;
    $("shClose").addEventListener("click", closeSheet); $("scrim").addEventListener("click", closeSheet);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  }

  async function refresh() {
    try {
      const r = await fetch("data.json", { cache: "no-store" });
      const d = r.ok ? await r.json() : null; // a failed read must not skip the live RID read below
      if (d && d.river) { BASE = d; if (!D || !D.river || !D.river.live || Date.parse(d.river.observed_at) > Date.parse(D.river.observed_at)) render(d); else render(Object.assign({}, d, { river: D.river })); }
    } catch (e) { /* offline or blocked: keep what we have */ }
    tryLive();
  }

  // Radar pictures on the TMD site are stamped in UTC, 7 hours behind Thai time. Show the current time in both clocks,
  // updated on each new minute. This converts the clock only; it does not read the time printed on any picture.
  function radarClock() {
    const r = $("radarNow"); if (!r) return;
    const now = Date.now(), u = new Date(now);
    r.textContent = `ตอนนี้ ${thHM(now)} เวลาไทย = ${pad2(u.getUTCHours())}:${pad2(u.getUTCMinutes())} เวลาสากล`;
  }

  wire();
  BASE = window.KPP_DATA || null;
  render(BASE);
  tryLive(true);
  (function tick() { radarClock(); setTimeout(tick, 60000 - (Date.now() % 60000) + 50); })();
  setInterval(() => { if (!D || !D.river) return; const f0 = fresh; freshness(); if (f0 !== fresh) { status(); hero(); paintRibbon(+$("scrub").value); paintMap(+$("scrub").value); } }, 60000);
  setInterval(refresh, 10 * 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
})();
