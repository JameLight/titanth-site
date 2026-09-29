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
  const FLAT_GAP = 1; // any missing hour ends a flat run: nothing shows what the water did in that hour
  const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

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

  // A gauge whose last FLAT_MIN or more hourly readings, with no hour missing, stay within 1 cm may be stuck,
  // or the water may really be steady. A missing hour ends the run, because nothing is known about it.
  // The run must reach the shown hour: with no reading at i, nothing is known about the water at i, so no run.
  // Returns null, or { h: hours between the first and last reading of the run,
  //   fromStart: the run was ended by missing data or the start of the window, so it may be longer ("อย่างน้อย") }.
  function flatRun(series, i) {
    const i0 = Math.min(i, series.length - 1);
    if (i0 < 0 || series[i0] == null) return null;
    let hi = -Infinity, lo = Infinity, n = 0, first = -1, last = -1, gap = 0, open = true;
    for (let k = i0; k >= 0; k--) {
      const v = series[k];
      if (v == null) { if (last >= 0 && ++gap >= FLAT_GAP) break; continue; }
      gap = 0;
      const c = cmOf(v), h2 = Math.max(hi, c), l2 = Math.min(lo, c);
      if (h2 - l2 > 1) { open = false; break; }
      hi = h2; lo = l2; n++; first = k;
      if (last < 0) last = k;
    }
    if (n < FLAT_MIN) return null;
    return { h: last - first, fromStart: open };
  }

  // The reading a line shows at hour i. The newest reading at or before i can be an hour or more before i (a late or
  // stopped gauge), or the whole data set can be late (fresh "slow" or "old"); a line must then say when its reading was,
  // using that gauge's own reading time, never the shown hour or another gauge's time.
  // Returns { j: index of the reading (-1: none), ms: its time (NaN: none), behind: j is before i,
  //   old: more than STALE_H hours before i, notNow: a line about it must give its time }.
  function readingAt(series, i, startMs, fresh) {
    const j = lastIdx(series, i), behind = j >= 0 && j < i;
    return { j, ms: j >= 0 ? startMs + j * 3600e3 : NaN, behind, old: j >= 0 && i - j > STALE_H, notNow: fresh !== "fresh" || behind };
  }

  // What the small line under a river row's value says at hour i: "none" (no reading in the window), "stopped" (no new
  // reading for more than STALE_H hours), "at" (the reading's time, because it is before i or the whole set is old),
  // "flat" (the flat note says it, so no trend), "trend", or "" (too early in the window for a 3-hour change).
  function rowLine(series, i, fresh) {
    const r = readingAt(series, i, 0, fresh);
    if (r.j < 0) return "none";
    if (r.old) return "stopped";
    if (fresh === "old" || r.behind) return "at";
    if (flatRun(series, i)) return "flat";
    return trend(series, i).h === 0 ? "" : "trend";
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

  // Row and sheet wording for a flat run; the hours are hours with a reading in every one of them.
  function flatNote(fl) {
    return fl ? `เปลี่ยนไม่เกิน 1 ซม. มา${fl.fromStart ? "อย่างน้อย" : ""} ${fl.h} ชม.` : "";
  }

  function thDateTime(ms) {
    const d = new Date(ms + 7 * 3600e3), p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} น.`;
  }

  // Notice for an old forecast. An old fetch time alone does not show why no newer forecast is stored,
  // so the notice states only what is known: when this one was fetched, and that it may not be the latest.
  function forecastNotice(fetchedMs, nowMs) {
    if (!Number.isFinite(fetchedMs)) return "ไม่ทราบเวลาที่ดึงพยากรณ์ชุดนี้ อาจไม่ใช่ฉบับล่าสุด ดูฉบับล่าสุดที่เว็บกรมอุตุนิยมวิทยา";
    if (nowMs - fetchedMs <= 6 * 3600e3) return "";
    return `พยากรณ์ชุดนี้ดึงเมื่อ ${thDateTime(fetchedMs)} เว็บนี้ยังไม่มีชุดที่ดึงใหม่ใน 6 ชั่วโมงที่ผ่านมา อาจไม่ใช่ฉบับล่าสุด ดูฉบับล่าสุดที่เว็บกรมอุตุนิยมวิทยา`;
  }

  // "YYYY-MM-DD HH:MM[:SS]" written in Thai time (as TMD stamps its responses) to milliseconds; NaN when unreadable.
  function thaiStampMs(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - 7 * 3600e3 : NaN;
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

  return { STALE_H, FLAT_MIN, FLAT_GAP, cmOf, lastIdx, cls, gapText, isOld, trend, change8, flatRun, flatNote, readingAt, rowLine, forecastNotice, peakDrop, thaiStampMs, thaiDate, dayLabel };
});
