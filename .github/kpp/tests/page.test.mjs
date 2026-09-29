// Tests for the page's own rules (flood/kamphaeng-phet/kpp-core.js).
// Run: node --test .github/kpp/tests/update.test.mjs .github/kpp/tests/page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const K = require("../../../flood/kamphaeng-phet/kpp-core.js");
const P7 = { watch: 4.4, bank: 5.34 }; // P.7A thresholds from RID

test("classes follow RID's rule: red at or above the bank, yellow from the watch level", () => {
  assert.equal(K.cls(4.39, P7), "ok");
  assert.equal(K.cls(4.4, P7), "watch");
  assert.equal(K.cls(5.33, P7), "watch");
  assert.equal(K.cls(5.34, P7), "crit");
  assert.equal(K.cls(5.35, P7), "crit");
  assert.equal(K.cls(4.1 + 0.3, P7), "watch", "4.3999999 from floating-point maths still counts as 4.40");
});

test("gap to the bank reads correctly at, below and above the bank", () => {
  assert.equal(K.gapText(3.94, P7), "ต่ำกว่าตลิ่ง 1.40 ม.");
  assert.equal(K.gapText(5.34, P7), "ถึงตลิ่งแล้ว");
  assert.equal(K.gapText(5.8, P7), "ล้นตลิ่ง 0.46 ม.");
  assert.equal(K.gapText(null, P7), "ไม่มีข้อมูล");
});

test("3-hour trend gives the real number of hours and a steady 5 cm threshold", () => {
  assert.deepEqual(K.trend([3.79, 3.85, 3.9, 3.94], 3).t, "↗ ขึ้น 15 ซม. ใน 3 ชม.");
  const gap = [2.8, null, null, null, null, null, null, 3.3];
  assert.equal(K.trend(gap, 7).t, "↗ ขึ้น 50 ซม. ใน 7 ชม.", "a gap in the readings makes the span longer");
  assert.equal(K.trend([4.0, 4.0, 4.0, 4.05], 3).k, "up", "exactly 5 cm counts as a change");
  assert.equal(K.trend([4.0, 4.0, 4.0, 4.04], 3).k, "flat");
  assert.equal(K.trend([3.0, null, null, null, null], 4).t, "ไม่มีข้อมูลพอ", "no reading in the last 3 hours");
});

test("8-hour change says steady instead of 'up 0.00 m'", () => {
  const s = [3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9];
  assert.equal(K.change8(s, 8).t, "ทรงตัวใน 8 ชม.");
  assert.equal(K.change8([3.12, 0, 0, 0, 0, 0, 0, 0, 3.94], 8).t, "ขึ้น 0.82 ม. ใน 8 ชม.");
});

test("flat run: hours are the span, and 'at least' only when no earlier reading exists", () => {
  const flat = Array(33).fill(6.6).map((v, i) => (i % 2 ? 6.59 : v));
  assert.deepEqual(K.flatRun(flat, 32), { h: 32, fromStart: true });
  const lead = [null, null, ...Array(12).fill(6.6)];
  assert.deepEqual(K.flatRun(lead, 13), { h: 11, fromStart: true }, "empty slots before the run do not count as data");
  const moved = [6.5, ...Array(12).fill(6.6)];
  assert.deepEqual(K.flatRun(moved, 12), { h: 11, fromStart: false });
  assert.equal(K.flatRun(Array(11).fill(6.6), 10), null, "11 readings are not enough");
  assert.equal(K.flatRun([...Array(12).fill(6.6), 6.62], 12), null, "a 2 cm step breaks the run");
});

test("flat run: any missing hour ends the run, and the wording says only what was measured", () => {
  const codexCase = [6.6, ...Array(18).fill(null), ...Array(11).fill(6.6)];
  assert.equal(K.flatRun(codexCase, codexCase.length - 1), null, "18 unknown hours must not count as flat");
  const oneMissing = [...Array(6).fill(6.6), null, ...Array(6).fill(6.6)];
  assert.equal(K.flatRun(oneMissing, 12), null, "a missing hour is not evidence of steady water");
  const afterGap = [...Array(6).fill(6.6), null, ...Array(12).fill(6.6)];
  const fl = K.flatRun(afterGap, 18);
  assert.deepEqual(fl, { h: 11, fromStart: true }, "ended by missing data, so 'at least'");
  assert.equal(K.flatNote(fl), "เปลี่ยนไม่เกิน 1 ซม. มาอย่างน้อย 11 ชม.");
  assert.equal(K.flatNote({ h: 20, fromStart: false }), "เปลี่ยนไม่เกิน 1 ซม. มา 20 ชม.");
  assert.equal(K.flatNote(null), "");
});

test("flat run: no claim for an hour that has no reading, now or while replaying", () => {
  const twelve = Array(12).fill(6.6);
  assert.equal(K.flatRun([...twelve, null], 12), null, "the newest hour is missing");
  assert.equal(K.flatRun([...twelve, null, null], 13), null, "the newest two hours are missing");
  const replay = [...twelve, null, ...twelve];
  assert.equal(K.flatRun(replay, 12), null, "the replayed hour is missing");
  assert.deepEqual(K.flatRun(replay, 11), { h: 11, fromStart: true }, "the hour before it has a reading and a run");
  assert.deepEqual(K.flatRun(replay, 24), { h: 11, fromStart: true }, "the run after the gap reaches the shown hour");
  assert.equal(K.flatRun([], 0), null);
  const late = [...twelve, null];
  assert.deepEqual(K.flatRun(late, K.lastIdx(late, 12)), { h: 11, fromStart: true },
    "the details sheet asks for the run that ends at its newest reading, and states that reading's time");
});

test("a line about a reading gives that gauge's own reading time when it is not the shown hour", () => {
  const start = Date.parse("2026-09-28T06:00:00+07:00"), H = 3600e3, last = 32;
  const cur = Array(33).fill(4.2);
  const behind2 = [...Array(31).fill(4.2), null, null]; // the town gauge's newest reading is 2 hours before the shown hour
  for (const fresh of ["fresh", "slow"]) {
    const r = K.readingAt(behind2, last, start, fresh);
    assert.equal(r.j, 30, fresh);
    assert.equal(r.ms, start + 30 * H, `${fresh}: the gauge's own time, not the newest time of another gauge`);
    assert.equal(r.behind, true);
    assert.equal(r.old, false);
    assert.equal(r.notNow, true, `${fresh}: the line must give the time`);
    assert.equal(K.rowLine(behind2, last, fresh), "at", `${fresh}: the row gives the time, not a trend`);
  }
  for (const k of [1, 3]) {
    const s = [...Array(33 - k).fill(4.2), ...Array(k).fill(null)];
    assert.equal(K.rowLine(s, last, "fresh"), "at", `${k} hour(s) behind`);
    assert.equal(K.readingAt(s, last, start, "fresh").ms, start + (32 - k) * H);
  }
  assert.equal(K.readingAt(cur, last, start, "fresh").notNow, false, "a reading at the shown hour in a fresh set needs no time");
  assert.equal(K.readingAt(cur, last, start, "slow").notNow, true, "a late set always gives the time");
  assert.equal(K.readingAt(cur, last, start, "slow").ms, start + last * H);
  assert.equal(K.rowLine(cur, last, "fresh"), "flat", "33 equal readings: the flat note, no trend");
  const rising = cur.map((v, i) => v + i * 0.03);
  assert.equal(K.rowLine(rising, last, "fresh"), "trend");
  assert.equal(K.rowLine(rising, last, "slow"), "trend", "a slow set keeps the trend; the top bar says the set is late");
  assert.equal(K.rowLine(rising, last, "old"), "at");
  assert.equal(K.rowLine([...Array(28).fill(4.2), ...Array(5).fill(null)], last, "fresh"), "stopped", "more than 3 hours");
  assert.equal(K.rowLine(Array(33).fill(null), last, "fresh"), "none");
  assert.equal(K.rowLine(rising, 0, "fresh"), "", "the first hour of the window has no 3-hour change");
  const none = K.readingAt(Array(3).fill(null), 2, start, "fresh");
  assert.equal(none.j, -1);
  assert.ok(Number.isNaN(none.ms));
});

test("forecast notice says only what is known about its age", () => {
  const now = Date.parse("2026-09-29T14:30:00+07:00");
  assert.equal(K.forecastNotice(now - 60 * 60e3, now), "", "one hour old: no notice");
  const old = K.forecastNotice(Date.parse("2026-09-28T13:14:00+07:00"), now);
  assert.equal(old, "พยากรณ์ชุดนี้ดึงเมื่อ 28 ก.ย. 13:14 น. เว็บนี้ยังไม่มีชุดที่ดึงใหม่ใน 6 ชั่วโมงที่ผ่านมา อาจไม่ใช่ฉบับล่าสุด ดูฉบับล่าสุดที่เว็บกรมอุตุนิยมวิทยา");
  assert.ok(!old.includes("ดึงฉบับใหม่ไม่ได้"), "no claim about why");
  assert.equal(K.forecastNotice(NaN, now), "ไม่ทราบเวลาที่ดึงพยากรณ์ชุดนี้ อาจไม่ใช่ฉบับล่าสุด ดูฉบับล่าสุดที่เว็บกรมอุตุนิยมวิทยา");
});

test("TMD's Thai-time stamp is read as Thai time", () => {
  assert.equal(K.thaiStampMs("2026-09-29 13:14:00"), Date.parse("2026-09-29T13:14:00+07:00"));
  assert.ok(Number.isNaN(K.thaiStampMs("")));
});

test("upstream peak is searched in the whole window, not only the last 8 hours", () => {
  const tak = [2.2, 2.4, 2.6, 2.6, 2.55, 2.5, 2.45, 2.35, 2.24, 2.12, 2.0, 1.9, 1.8];
  const p = K.peakDrop(tak, 12);
  assert.equal(p.drop, 80);
  assert.equal(p.peakIdx, 2);
  assert.equal(p.atStart, false);
  assert.equal(K.peakDrop([2.6, 2.5, 2.4], 2).atStart, true, "highest reading is the first one shown");
});

test("a station with no reading for more than 3 hours is old", () => {
  assert.equal(K.isOld([1, 1, 1, 1, 1], 4), false);
  assert.equal(K.isOld([1, null, null, null, null], 4), true);
  assert.equal(K.isOld([null, null], 1), true);
});

test("forecast cards are labelled by date", () => {
  const noon29 = Date.parse("2026-09-29T12:00:00+07:00");
  assert.equal(K.dayLabel("2026-09-29", noon29), "วันนี้");
  assert.equal(K.dayLabel("2026-09-30", noon29), "พรุ่งนี้");
  assert.equal(K.dayLabel("2026-10-01", noon29), "");
  assert.equal(K.dayLabel("2026-09-30", Date.parse("2026-09-29T23:30:00+07:00")), "พรุ่งนี้", "Thai date, not UTC date");
});
