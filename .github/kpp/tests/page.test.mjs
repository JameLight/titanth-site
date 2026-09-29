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
