// Kamphaeng Phet water page. Reads window.KPP_DATA (data.js, written by the updater) and window.KPP_GEO (geo.js).
// Re-reads data.json every 10 minutes while the page is open.
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const HOUR = 3600e3;
  const $ = (id) => document.getElementById(id);
  const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Escaped text in which each number stays on one line with its unit (for example "1.48 ม." never splits).
  const nw = (s) => esc(s).replace(/(\d[\d.]*) (ม\.|ซม\.|ชม\.)/g, '<span class="nw">$1 $2</span>');
  const IN_KPP = ["P.7A", "P.15", "P.16", "P.47A", "P.26B", "P.78"];
  const CLS = { ok: "ปกติ", watch: "เฝ้าระวัง", crit: "วิกฤติ", stale: "ไม่มีข้อมูลล่าสุด" };
  const COL = { ok: "var(--ok)", watch: "var(--watch)", crit: "var(--crit)", stale: "var(--stale)" };
  const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const GISTDA_UNTIL = Date.parse("2026-10-02T23:59:00+07:00");
  const PCT = { TH6201: 0.47, TH6202: 0, TH6203: 0.16, TH6204: 5.16, TH6205: 8.88, TH6206: 0, TH6207: 0, TH6208: 3.64, TH6209: 0.62, TH6210: 5.26, TH6211: 0.08 };

  const th = (ms) => new Date(ms + 7 * HOUR);
  const thDateTime = (ms) => { const d = th(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`; };
  const thHM = (ms) => { const d = th(ms); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`; };
  const cm = (x) => Math.round(Math.abs(x) * 100);
  const cls = (v, s) => (v > s.bank ? "crit" : v >= s.watch ? "watch" : "ok");
  const lastIdx = (arr, upto) => { for (let i = Math.min(upto, arr.length - 1); i >= 0; i--) if (arr[i] != null) return i; return -1; };

  function shapeSVG(c, size) {
    const s = size || 16, col = COL[c];
    if (c === "crit") return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><path d="M8 1l7 7-7 7-7-7z" fill="${col}"/></svg>`;
    if (c === "watch") return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><path d="M8 1.5l7 13H1z" fill="${col}"/></svg>`;
    if (c === "stale") return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="${col}" stroke-width="2.5"/></svg>`;
    return `<svg class="shape" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="${col}"/></svg>`;
  }

  let D = null, GEO = window.KPP_GEO, N = 0, LAST = 0, START = 0, OBS = 0, fresh = "fresh", timer = null;

  function valueAt(s, i) { const j = lastIdx(s.s, i); return j < 0 ? null : s.s[j]; }
  function trend(s, i) {
    const a = valueAt(s, i), j = lastIdx(s.s, i - 3), b = j < 0 ? null : s.s[j];
    if (a == null || b == null) return { k: "flat", t: "ไม่มีข้อมูลพอ", w: "ไม่ทราบแนวโน้ม" };
    const d = a - b;
    return d > 0.05 ? { k: "up", t: `↗ ขึ้น ${cm(d)} ซม. ใน 3 ชม.`, w: "กำลังขึ้น" } : d < -0.05 ? { k: "down", t: `↘ ลด ${cm(d)} ซม. ใน 3 ชม.`, w: "กำลังลด" } : { k: "flat", t: "→ ทรงตัว", w: "ทรงตัว" };
  }
  const gapText = (v, s) => { if (v == null) return "ไม่มีข้อมูล"; const g = s.bank - v; return g >= 0 ? `ต่ำกว่าตลิ่ง ${g.toFixed(2)} ม.` : `ล้นตลิ่ง ${(-g).toFixed(2)} ม.`; };
  const C = (i) => (id) => { const s = D.river.stations[id]; if (!s) return "stale"; const v = valueAt(s, i); return fresh === "old" || v == null ? "stale" : cls(v, s); };
  // A gauge whose last 12 readings stay within 1 cm may be stuck. Returns null when it moves, else
  // { h: hourly slots from the first to the last flat reading, fromStart: the flat run reaches the start of the data }.
  // The official colour and counts are not changed; the page only adds a note.
  function flatRun(s, i) {
    let hi = -Infinity, lo = Infinity, n = 0, first = -1, last = -1;
    for (let k = Math.min(i, s.s.length - 1); k >= 0; k--) {
      const v = s.s[k]; if (v == null) continue;
      const h2 = Math.max(hi, v), l2 = Math.min(lo, v);
      if (Math.round((h2 - l2) * 100) > 1) break;
      hi = h2; lo = l2; n++; first = k; if (last < 0) last = k;
    }
    return n >= 12 ? { h: last - first + 1, fromStart: first === 0 } : null;
  }

  function freshness() {
    const age = (Date.now() - OBS) / 60000;
    fresh = age < 0 ? "fresh" : age <= 120 ? "fresh" : age <= 360 ? "slow" : "old";
    const a = $("age"), mins = Math.round(Math.max(0, age)), h = Math.floor(mins / 60), m = mins % 60;
    const today = th(OBS).toISOString().slice(0, 10) === th(Date.now()).toISOString().slice(0, 10);
    const ago = `${h ? h + " ชม." : ""}${h && m ? " " : ""}${m || !h ? m + " นาที" : ""}`;
    a.className = "age" + (fresh === "slow" ? " slow" : fresh === "old" ? " old" : "");
    a.textContent = `${D && D.river && D.river.live ? "สด " : "ข้อมูล "}${today ? thHM(OBS) : thDateTime(OBS)}` + (age < 0 ? "" : ` · ${ago}${ago.endsWith(".") ? " " : ""}ที่แล้ว`) + (fresh === "slow" ? " · ข้อมูลช้า" : fresh === "old" ? " · เก่าแล้ว" : "");
    document.body.classList.toggle("paused", fresh !== "fresh");
  }

  function status() {
    const c = IN_KPP.map(C(LAST)), n = { crit: 0, watch: 0 };
    c.forEach((k) => { if (n[k] !== undefined) n[k]++; });
    const worst = fresh === "old" ? "stale" : n.crit ? "crit" : n.watch ? "watch" : "ok";
    const p7 = D.river.stations["P.7A"];
    const txt = fresh === "old" ? "ไม่มีข้อมูลล่าสุด ดูต้นทางหรือโทร 1784"
      : [n.crit ? `วิกฤติ ${n.crit} จุด` : "", n.watch ? `เฝ้าระวัง ${n.watch} จุด` : "", !n.crit && !n.watch ? "ปกติทุกจุด" : ""].filter(Boolean).join(" · ") + (p7 ? " · น้ำปิงตัวเมือง" + trend(p7, LAST).w : "");
    $("stWord").innerHTML = shapeSVG(worst) + "<span>" + esc(txt) + "</span>";
    const t = $("tRiver");
    t.textContent = fresh === "old" ? "–" : `${n.crit + n.watch}/6`;
    t.className = fresh === "old" ? "" : n.crit ? "c-crit" : n.watch ? "c-watch" : "";
  }

  function drawXsec(s, v, rising) {
    const x = $("xsec"); x.innerHTML = "";
    const bankY = 46, bedY = 176, Y = (L) => bedY - (L / s.bank) * (bedY - bankY), over = v != null && v > s.bank;
    const chan = "M58,46 C84,46 96,176 124,176 L220,176 C248,176 258,46 284,46";
    const defs = el("defs", {}, x), cp = el("clipPath", { id: "ch" }, defs); el("path", { d: chan + " Z" }, cp);
    el("path", { d: "M0,46 L58,46 C84,46 96,176 124,176 L220,176 C248,176 258,46 284,46 L340,46 L340,196 L0,196 Z", fill: "var(--earth)" }, x);
    el("path", { d: "M0,46 L58,46 M284,46 L340,46", stroke: "var(--earth2)", "stroke-width": 3, fill: "none" }, x);
    const house = (a) => { const h = el("g", Object.assign({ transform: "translate(12,20)" }, a), x); el("path", { d: "M2 12 L14 2 L26 12 V26 H2 Z", fill: "var(--house)" }, h); el("rect", { x: 11, y: 16, width: 6, height: 10, fill: "var(--surface)" }, h); };
    house({});
    const tl = el("text", { x: 8, y: 62, class: "t-muted" }, x); tl.textContent = "ฝั่งตัวเมือง";
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
    const pre = fresh === "fresh" ? "" : `เมื่อ ${thHM(OBS)} `;
    $("hVerdict").innerHTML = shapeSVG(c, 26) + `<span class="c-${c}">${CLS[c]}</span>`;
    const t = $("hTrend"); t.className = "chip " + tr.k; t.textContent = tr.t;
    const j = lastIdx(s.s, LAST - 8), d8 = v != null && j >= 0 ? v - s.s[j] : null;
    $("hSentence").innerHTML = nw(pre + gapText(v, s) + (d8 == null ? "" : ` · ${d8 >= 0 ? "ขึ้น" : "ลด"} ${Math.abs(d8).toFixed(2)} ม. ใน ${LAST - j} ชม.`));
    $("hWatch").innerHTML = nw(v == null ? "" : v < s.watch ? `อีก ${cm(s.watch - v)} ซม. ถึงระดับเฝ้าระวังของกรมชลประทาน (${s.watch.toFixed(2)} ม.)` : v <= s.bank ? "อยู่ในระดับเฝ้าระวังของกรมชลประทานแล้ว" : "สูงกว่าตลิ่งแล้ว");
    const u = D.river.stations["P.2A"];
    if (u) {
      let mx = -Infinity, mi = -1;
      for (let i = Math.max(0, LAST - 8); i <= LAST; i++) if (u.s[i] != null && u.s[i] > mx) { mx = u.s[i]; mi = i; }
      const uv = valueAt(u, LAST), du = uv != null && mi >= 0 ? uv - mx : 0;
      $("hUp").innerHTML = nw(du < -0.05 ? `ต้นน้ำที่ตาก: ลดลง ${cm(du)} ซม. จากจุดสูงสุดเมื่อ ${thDateTime(START + mi * HOUR)}` : `ต้นน้ำที่ตาก: ${trend(u, LAST).w}`);
    }
    drawXsec(s, v, tr.k === "up" && fresh === "fresh");
  }

  const ORDER = [["P.2A"], ["P.7A", { lbl: "คลองสวนหมาก ไหลมาบรรจบใกล้ตัวเมือง", ids: ["P.47A", "P.26B"] }], ["P.15", { lbl: "คลองขลุง ไหลมาบรรจบ", ids: ["P.78"] }], ["P.16"]];
  const stopEls = {};
  function buildRibbon() {
    const rib = $("ribbon"); rib.innerHTML = "";
    const mk = (id) => { const b = document.createElement("button"); b.className = "stop"; b.type = "button"; b.innerHTML = `<span class="dot"></span><span class="nm"></span><span class="val"></span>`; b.addEventListener("click", () => openSheet(id)); stopEls[id] = b; return b; };
    ORDER.forEach(([id, br]) => {
      if (!D.river.stations[id]) return;
      const li = document.createElement("li"); li.appendChild(mk(id)); rib.appendChild(li);
      if (br) {
        const ul = document.createElement("ul"); ul.className = "branch";
        const l = document.createElement("li"); l.className = "lbl"; l.textContent = br.lbl; ul.appendChild(l);
        br.ids.filter((b) => D.river.stations[b]).forEach((b) => { const li2 = document.createElement("li"); li2.appendChild(mk(b)); ul.appendChild(li2); });
        const li3 = document.createElement("li"); li3.appendChild(ul); rib.appendChild(li3);
      }
    });
    const out = document.createElement("li"); out.className = "out"; out.textContent = "↓ ไหลต่อไปนครสวรรค์"; rib.appendChild(out);
  }
  function paintRibbon(i) {
    for (const id in stopEls) {
      const s = D.river.stations[id], v = valueAt(s, i), c = C(i)(id), tr = trend(s, i), b = stopEls[id], fl = flatRun(s, i);
      const flat = fl ? `ค่าไม่ขยับ ${fl.h} ชม.` : "";
      b.querySelector(".dot").innerHTML = shapeSVG(c, 24);
      b.querySelector(".nm").innerHTML = `${esc(s.name)}<small>${esc(s.place)}</small>`;
      b.querySelector(".val").innerHTML = `${nw(gapText(v, s))}<small class="${tr.k}">${nw(tr.t)}</small>` + (flat ? `<small class="stuck">${nw(flat)}</small>` : "");
      b.setAttribute("aria-label", `${s.name} ${CLS[c]} ${gapText(v, s)} ${tr.w}` + (flat ? " " + flat : ""));
    }
    $("clock").textContent = i === LAST ? "ตอนนี้ (" + thDateTime(START + i * HOUR) + ")" : thDateTime(START + i * HOUR);
    $("riverTime").textContent = "กรมชลประทาน · " + thDateTime(START + i * HOUR);
  }

  const mapDots = {};
  function buildMap() {
    const map = $("mapSvg"); map.innerHTML = ""; map.setAttribute("viewBox", `0 0 ${GEO.W} ${GEO.H}`);
    if (Date.now() > GISTDA_UNTIL) { map.classList.add("oldfill"); $("mapNote").textContent = "ข้อมูลดาวเทียมชุดนี้ (23–29 ก.ย.) เก่าแล้ว จึงไม่ลงสีอำเภอ ดูภาพล่าสุดที่เว็บ GISTDA"; }
    GEO.districts.forEach((d) => { const p = PCT[d.pcode]; const b = p == null || p === 0 ? 0 : p < 1 ? 1 : p <= 5 ? 2 : 3; el("path", { d: d.d, class: "d f" + b }, map); });
    GEO.districts.filter((d) => d.pcode !== "TH6205" && d.pcode !== "TH6201").forEach((d) => { const t = el("text", { x: d.cx, y: d.cy, "text-anchor": "middle", class: "dl" }, map); t.textContent = d.name.replace("วรลักษบุรี", "ฯ").replace("ทรายทองวัฒนา", "ทรายทองฯ"); });
    GEO.rivers.forEach((r, i) => { const main = i === 0; el("path", { d: r.d, class: "rv", "stroke-width": main ? 4.5 : 2.4 }, map); el("path", { d: r.d, class: "rf", "stroke-width": main ? 2 : 1.2 }, map); });
    const LAB = { "P.2A": ["ตาก (ต้นน้ำ)", 10, 4], "P.7A": ["ตัวเมือง", 10, -8], "P.15": ["ปิง คลองขลุง", 10, 4], "P.16": ["ขาณุฯ", 10, 4], "P.47A": ["โป่งน้ำร้อน", -10, 14, "end"], "P.26B": ["น้ำโท้ง ~", -10, -6, "end"], "P.78": ["สามเรือน", -10, 14, "end"] };
    Object.keys(D.river.stations).forEach((id) => { const pos = GEO.stations[id], lab = LAB[id]; if (!pos || !lab) return; const t = el("text", { x: pos[0] + lab[1], y: pos[1] + lab[2], class: "sl", "text-anchor": lab[3] || "start" }, map); t.textContent = lab[0]; });
    Object.keys(D.river.stations).forEach((id) => {
      const pos = GEO.stations[id]; if (!pos) return;
      const g = el("g", { tabindex: 0, role: "button", class: "pin" }, map);
      // Clicks and taps are handled once on the whole map (see wire): a tap near a pin opens it.
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(id); } });
      mapDots[id] = { g, x: pos[0], y: pos[1] };
    });
    $("credit").textContent = "แผนที่: " + GEO.credit + " (บ้านน้ำโท้งเป็นตำแหน่งโดยประมาณ)";
  }
  function paintMap(i) {
    for (const id in mapDots) {
      const { g, x, y } = mapDots[id]; g.innerHTML = ""; const c = C(i)(id);
      el("circle", { cx: x, cy: y, r: 9, fill: "var(--surface)" }, g);
      if (c === "crit") el("path", { d: `M${x} ${y - 7} L${x + 7} ${y} L${x} ${y + 7} L${x - 7} ${y} Z`, fill: COL[c] }, g);
      else if (c === "watch") el("path", { d: `M${x} ${y - 7} L${x + 7} ${y + 5} L${x - 7} ${y + 5} Z`, fill: COL[c] }, g);
      else if (c === "stale") el("circle", { cx: x, cy: y, r: 5.5, fill: "none", stroke: COL[c], "stroke-width": 2.4 }, g);
      else el("circle", { cx: x, cy: y, r: 6.5, fill: COL[c] }, g);
      g.setAttribute("aria-label", `${D.river.stations[id].name} ${CLS[c]}`);
    }
  }

  function drawChart(s) {
    const c = $("shChart"); c.innerHTML = "";
    const L = 36, R = 334, T = 10, B = 158, vals = s.s.filter((v) => v != null);
    const hi = Math.max(s.bank + 0.4, Math.max(...vals) + 0.3), lo = Math.max(0, Math.floor(Math.min(...vals) - 0.4));
    const X = (i) => L + (i * (R - L)) / (N - 1), Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
    const yw = Y(Math.min(s.watch, hi)), yb = Y(s.bank);
    el("rect", { x: L, y: yw, width: R - L, height: Math.max(0, B - yw), class: "b-ok" }, c);
    el("rect", { x: L, y: yb, width: R - L, height: Math.max(0, yw - yb), class: "b-watch" }, c);
    el("rect", { x: L, y: T, width: R - L, height: Math.max(0, yb - T), class: "b-crit" }, c);
    const step = hi - lo > 4 ? 2 : 1;
    for (let v = Math.ceil(lo); v <= hi; v += step) { el("line", { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: "var(--line)", "stroke-width": 1 }, c); const t = el("text", { x: L - 5, y: Y(v) + 4, "text-anchor": "end" }, c); t.textContent = v + " ม."; }
    el("line", { x1: L, x2: R, y1: yb, y2: yb, stroke: "var(--crit)", "stroke-width": 1.6, "stroke-dasharray": "5 4" }, c);
    const bt = el("text", { x: R - 2, y: yb - 4, "text-anchor": "end", class: "t-crit" }, c); bt.textContent = "ตลิ่ง";
    let d = "", pen = false;
    s.s.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? " L" : " M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
    el("path", { d: d.trim(), fill: "none", stroke: "var(--water)", "stroke-width": 2.8, "stroke-linejoin": "round" }, c);
    el("line", { x1: X(LAST), x2: X(LAST), y1: T, y2: B, stroke: "var(--muted)", "stroke-dasharray": "3 3" }, c);
    const lv = valueAt(s, LAST); if (lv != null) el("circle", { cx: X(lastIdx(s.s, LAST)), cy: Y(lv), r: 5, fill: "var(--water)", stroke: "var(--surface)", "stroke-width": 2 }, c);
    [[0, "start"], [Math.round(LAST / 2), "middle"], [LAST, "end"]].forEach(([i, a]) => { const e = el("text", { x: X(i), y: B + 16, "text-anchor": a }, c); e.textContent = (i === LAST ? "ตอนนี้ " : "") + thDateTime(START + i * HOUR); });
    const cap = el("text", { x: L, y: B + 34 }, c); cap.textContent = "เขียว ปกติ · เหลือง เฝ้าระวัง · แดง เหนือตลิ่ง (เกณฑ์กรมชลประทาน)";
  }
  function openSheet(id) {
    const s = D.river.stations[id], v = valueAt(s, LAST), c = C(LAST)(id), tr = trend(s, LAST);
    $("shName").textContent = s.name; $("shPlace").textContent = s.place + " · กรมชลประทาน " + thDateTime(OBS);
    $("shGap").innerHTML = nw(gapText(v, s)); $("shTrend").innerHTML = nw(tr.t); $("shCls").innerHTML = shapeSVG(c, 14) + " " + CLS[c];
    const fl = flatRun(s, LAST), sf = $("shFlat");
    if (sf) { sf.hidden = !fl; sf.innerHTML = nw(fl ? `ค่าที่จุดนี้เท่าเดิมมา${fl.fromStart ? "อย่างน้อย" : ""} ${fl.h} ชม. อาจเป็นเครื่องวัดค้าง หรือน้ำนิ่งจริง ตรวจกับเว็บกรมชลประทานก่อนใช้` : ""); }
    drawChart(s); $("sheet").hidden = false; $("scrim").hidden = false; $("shClose").focus();
  }
  function closeSheet() { $("sheet").hidden = true; $("scrim").hidden = true; }

  function alerts() {
    const A = D.alerts, act = $("activeAlerts"), calm = $("alertCalm"), past = $("alertPast");
    act.innerHTML = ""; calm.innerHTML = ""; past.innerHTML = "";
    if (!A) { calm.innerHTML = `<p class="calm">ยังตรวจประกาศของ ปภ. ไม่ได้ในรอบนี้</p>`; return; }
    const now = Date.now();
    const active = A.items.filter((x) => now < Date.parse(x.sent_at) + x.duration_h * HOUR);
    active.forEach((x) => { const d = document.createElement("div"); d.className = "alertbox"; d.innerHTML = `<b>ประกาศทางการ ปภ. ${esc(thDateTime(Date.parse(x.sent_at)))}</b>${esc(x.text)}`; act.appendChild(d); });
    if (!active.length) calm.innerHTML = `<p class="calm">ยังไม่พบประกาศที่กำลังแสดงของ ปภ. สำหรับกำแพงเพชร (ตรวจล่าสุด ${esc(thDateTime(Date.parse(A.checked_at)))}) การไม่พบประกาศไม่ได้แปลว่าปลอดภัย</p>`;
    const old = A.items.filter((x) => !active.includes(x));
    if (old.length) past.innerHTML = `<details><summary>ประกาศที่ผ่านมาใน 7 วัน (${old.length})</summary>${old.map((x) => `<p class="note"><b>${esc(thDateTime(Date.parse(x.sent_at)))}</b> ${esc(x.text)} (ตั้งให้แสดงบนมือถือ ${x.duration_h} ชั่วโมง)</p>`).join("")}</details>`;
  }

  function rain() {
    const F = D.forecast, box = $("days"); box.innerHTML = "";
    if (!F || !F.days || !F.days.length) { box.innerHTML = `<p class="note">ยังดึงพยากรณ์ไม่ได้ในรอบนี้</p>`; return; }
    const d0 = th(Date.now()); const today = `${d0.getUTCFullYear()}-${String(d0.getUTCMonth() + 1).padStart(2, "0")}-${String(d0.getUTCDate()).padStart(2, "0")}`;
    const days = F.days.filter((x) => x.date >= today).slice(0, 2);
    days.forEach((x, k) => {
      const [y, m, dd] = x.date.split("-").map(Number);
      const drops = x.rain_pct >= 60 ? 3 : x.rain_pct >= 30 ? 2 : x.rain_pct > 0 ? 1 : 0;
      let dp = ""; for (let i = 0; i < drops; i++) { const dx = 14 + i * 8; dp += `<path d="M${dx} 30l-2 6" stroke="var(--water)" stroke-width="3" stroke-linecap="round"/>`; }
      const div = document.createElement("div"); div.className = "day";
      div.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M11 26a8 8 0 0 1 1.6-15.8A10.5 10.5 0 0 1 32 12a6.5 6.5 0 0 1 0 14z" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>${dp}</svg><div><b>${k === 0 ? "วันนี้" : "พรุ่งนี้"} ${dd} ${MONTHS[m - 1]}</b><span>${esc(x.desc)} ${x.rain_pct}% ของพื้นที่ · ${x.tmin}–${x.tmax}°C</span></div>`;
      box.appendChild(div);
    });
    $("rainSrc").textContent = "กรมอุตุนิยมวิทยา" + (F.build_at ? " · ออก " + F.build_at.slice(11, 16) + " น." : "");
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
    const days = await Promise.all([ridDay(now - 24 * HOUR), ridDay(now)]);
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
          if (code === "P.7A" && tms > lastMs) lastMs = tms;
        }
      }
    }
    if (!Number.isFinite(lastMs)) throw new Error("no P.7A readings");
    const n = base.stations["P.7A"].s.length, startMs = lastMs - (n - 1) * HOUR, stations = {};
    for (const [code, s] of Object.entries(base.stations)) {
      const arr = Array(n).fill(null), mp = pts[code];
      if (mp) for (const [tt, v] of mp) { const i = Math.round((tt - startMs) / HOUR); if (i >= 0 && i < n) arr[i] = v; }
      stations[code] = Object.assign({}, s, { s: arr, watch: watchNow[code] != null ? watchNow[code] : s.watch });
    }
    return Object.assign({}, base, { stations, start: new Date(startMs).toISOString(), observed_at: new Date(lastMs).toISOString(), live: true });
  }
  let BASE = null;
  async function tryLive() {
    try {
      const river = await liveRiver((BASE || D || {}).river);
      if (!D || !D.river || Date.parse(river.observed_at) >= Date.parse(D.river.observed_at)) render(Object.assign({}, BASE || D, { river }));
    } catch (e) { /* outside Thailand, offline or RID down: keep the saved numbers, shown with their age */ }
  }

  function render(data) {
    D = data; const R = D && D.river;
    if (!R || !R.stations || !R.stations["P.7A"]) { $("stWord").textContent = "ยังโหลดข้อมูลไม่ได้"; $("age").textContent = "โทร 1784 ถ้าต้องการความช่วยเหลือ"; return; }
    START = Date.parse(R.start); OBS = Date.parse(R.observed_at); N = R.stations["P.7A"].s.length; LAST = N - 1;
    const sc = $("scrub"); sc.max = String(LAST); sc.value = String(LAST);
    $("play").textContent = `▶ ย้อนดู ${N} ชม.`;
    freshness(); status(); hero(); buildRibbon(); paintRibbon(LAST); buildMap(); paintMap(LAST); alerts(); rain();
  }

  function wire() {
    $("status").addEventListener("click", () => $("river").scrollIntoView({ behavior: "smooth" }));
    $("status").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("river").scrollIntoView({ behavior: "smooth" }); } });
    document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => $(b.dataset.go).scrollIntoView({ behavior: "smooth" })));
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
      if (best) openSheet(best);
    });
    const scrub = $("scrub");
    scrub.addEventListener("input", () => { paintRibbon(+scrub.value); paintMap(+scrub.value); });
    $("play").addEventListener("click", () => {
      if (timer) { clearInterval(timer); timer = null; $("play").textContent = `▶ ย้อนดู ${N} ชม.`; return; }
      let i = 0; scrub.value = "0"; paintRibbon(0); paintMap(0); $("play").textContent = "■ หยุด";
      timer = setInterval(() => { i++; scrub.value = String(i); paintRibbon(i); paintMap(i); if (i >= LAST) { clearInterval(timer); timer = null; $("play").textContent = `▶ ย้อนดู ${N} ชม.`; } }, 500);
    });
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { $("play").textContent = "เลื่อนแถบเพื่อดูเวลา"; $("play").disabled = true; }
    $("shClose").addEventListener("click", closeSheet); $("scrim").addEventListener("click", closeSheet);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  }

  async function refresh() {
    try {
      const r = await fetch("data.json", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (d && d.river) { BASE = d; if (!D || !D.river || !D.river.live || Date.parse(d.river.observed_at) > Date.parse(D.river.observed_at)) render(d); else render(Object.assign({}, d, { river: D.river })); }
    } catch (e) { /* offline or blocked: keep what we have */ }
    tryLive();
  }

  // Radar pictures on the TMD site are stamped in UTC, 7 hours behind Thai time. Show both clocks, updated on each new minute.
  function radarClock() {
    const r = $("radarNow"); if (!r) return;
    const now = Date.now(), u = new Date(now);
    r.textContent = `ตอนนี้ ${thHM(now)} เวลาไทย = ${pad2(u.getUTCHours())}:${pad2(u.getUTCMinutes())} บนภาพเรดาร์`;
  }

  wire();
  BASE = window.KPP_DATA || null;
  render(BASE);
  tryLive();
  (function tick() { radarClock(); setTimeout(tick, 60000 - (Date.now() % 60000) + 50); })();
  setInterval(() => { if (!D || !D.river) return; const f0 = fresh; freshness(); if (f0 !== fresh) { status(); hero(); paintRibbon(+$("scrub").value); paintMap(+$("scrub").value); } }, 60000);
  setInterval(refresh, 10 * 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
})();
