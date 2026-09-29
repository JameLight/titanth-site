// Pure rules for the Kamphaeng Phet water page: classes, changes, flat gauges, peaks and day labels.
// Loaded by the page before kpp.js (window.KPPCore) and by the Node tests (require). No DOM, no clock.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.KPPCore = core;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const STALE_H = 3; // a station whose newest reading is more than 3 hours before the shown hour has no recent data
  const FLAT_MIN = 12; // readings needed before a run within 1 cm is reported

  // Metres to whole centimetres, so comparisons are free of floating-point noise.
  const cmOf = (x) => Math.round(x * 100);

  function lastIdx(arr, upto) {
    for (let i = Math.min(upto, arr.length - 1); i >= 0; i--) if (arr[i] != null) return i;
    return -1;
  }

  // RID's own rule (hydro2hd_admsl.html, showReportTableAll): green below the watch level,
  // yellow from the watch level up to but not including the bank, red at or above the bank.
  function cls(v, st) {
    const c = cmOf(v);
    return c >= cmOf(st.bank) ? "crit" : c >= cmOf(st.watch) ? "watch" : "ok";
  }

  function gapText(v, st) {
    if (v == null) return "ไม่มีข้อมูล";
    const g = cmOf(st.bank) - cmOf(v);
    return g > 0 ? `ต่ำกว่าตลิ่ง ${(g / 100).toFixed(2)} ม.` : g === 0 ? "ถึงตลิ่งแล้ว" : `ล้นตลิ่ง ${(-g / 100).toFixed(2)} ม.`;
  }

  function isOld(series, i) {
    const j = lastIdx(series, i);
    return j < 0 || i - j > STALE_H;
  }

  // Change over about 3 hours: newest reading at or before i against the newest at or before i-3.
  // The label gives the real number of hours between the two readings.
  function trend(series, i) {
    const ja = lastIdx(series, i), jb = lastIdx(series, i - 3);
    if (ja < 0 || jb < 0 || ja === jb) return { k: "flat", t: "ไม่มีข้อมูลพอ", w: "ไม่ทราบแนวโน้ม", h: 0 };
    const d = cmOf(series[ja]) - cmOf(series[jb]), h = ja - jb;
    if (d >= 5) return { k: "up", t: `↗ ขึ้น ${d} ซม. ใน ${h} ชม.`, w: "กำลังขึ้น", h };
    if (d <= -5) return { k: "down", t: `↘ ลด ${-d} ซม. ใน ${h} ชม.`, w: "กำลังลด", h };
    return { k: "flat", t: "→ ทรงตัว", w: "ทรงตัว", h };
  }

  // Change over about 8 hours, for the sentence under the big number.
  function change8(series, i) {
    const ja = lastIdx(series, i), jb = lastIdx(series, i - 8);
    if (ja < 0 || jb < 0 || ja === jb) return null;
    const d = cmOf(series[ja]) - cmOf(series[jb]), h = ja - jb;
    return { d, h, t: d === 0 ? `ทรงตัวใน ${h} ชม.` : `${d > 0 ? "ขึ้น" : "ลด"} ${(Math.abs(d) / 100).toFixed(2)} ม. ใน ${h} ชม.` };
  }

  // A gauge whose last FLAT_MIN or more readings stay within 1 cm may be stuck, or the water may really be steady.
  // Returns null, or { h: hours between the first and last reading of the run, fromStart: no earlier reading exists }.
  function flatRun(series, i) {
    let hi = -Infinity, lo = Infinity, n = 0, first = -1, last = -1;
    for (let k = Math.min(i, series.length - 1); k >= 0; k--) {
      const v = series[k];
      if (v == null) continue;
      const c = cmOf(v), h2 = Math.max(hi, c), l2 = Math.min(lo, c);
      if (h2 - l2 > 1) break;
      hi = h2; lo = l2; n++; first = k;
      if (last < 0) last = k;
    }
    if (n < FLAT_MIN) return null;
    return { h: last - first, fromStart: lastIdx(series, first - 1) < 0 };
  }

  // Highest reading in the whole window up to i, and how far the newest reading is below it.
  // atStart is true when the highest reading is the first one shown, so the real peak may be earlier.
  function peakDrop(series, i) {
    const ja = lastIdx(series, i);
    if (ja < 0) return null;
    let mx = -Infinity, mi = -1, firstIdx = -1;
    for (let k = 0; k <= ja; k++) {
      const v = series[k];
      if (v == null) continue;
      if (firstIdx < 0) firstIdx = k;
      if (v > mx) { mx = v; mi = k; }
    }
    return { drop: cmOf(mx) - cmOf(series[ja]), peakIdx: mi, atStart: mi === firstIdx };
  }

  // "YYYY-MM-DD" of an instant in Thai time.
  function thaiDate(ms) {
    const d = new Date(ms + 7 * 3600e3);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  // Label a forecast day by its date, never by its position in the list.
  function dayLabel(date, nowMs) {
    return date === thaiDate(nowMs) ? "วันนี้" : date === thaiDate(nowMs + 24 * 3600e3) ? "พรุ่งนี้" : "";
  }

  return { STALE_H, FLAT_MIN, cmOf, lastIdx, cls, gapText, isOld, trend, change8, flatRun, peakDrop, thaiDate, dayLabel };
});
