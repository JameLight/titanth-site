// Tests for the page's own rules (flood/kamphaeng-phet/kpp-core.js).
// Run: node --test .github/kpp/tests/update.test.mjs .github/kpp/tests/page.test.mjs .github/kpp/tests/page_dom.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

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
  assert.equal(K.change8([3.12, 0, 0, 0, 0, 0, 0, 0, 3.94], 8).t, "ขึ้น 82 ซม. ใน 8 ชม.");
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
  assert.equal(K.flatRun(twelve, 20), null, "an hour past the end of the series has no reading");
  assert.equal(K.flatRun(twelve, -1), null);
  const late = [...twelve, null];
  assert.deepEqual(K.flatRun(late, K.lastIdx(late, 12)), { h: 11, fromStart: true }, "the run that ends at the newest reading");
});

// Hour 0 is 28 Sep 06:00 Thai time; hour 32, the newest, is 29 Sep 14:00.
const START = Date.parse("2026-09-28T06:00:00+07:00"), H = 3600e3, LAST = 32;
const at = (hhmm) => Date.parse(`2026-09-29T${hhmm}:00+07:00`);
const ctx = (fresh, now = at("14:30")) => ({ start: START, fresh, last: LAST, now });

test("a line about a reading gives that gauge's own reading time when it is not the shown hour", () => {
  const cur = Array(33).fill(4.2);
  const behind2 = [...Array(31).fill(4.2), null, null]; // newest reading at hour 30 (12:00), 2 hours before the newest hour
  for (const fresh of ["fresh", "slow"]) {
    const r = K.readingAt(behind2, LAST, ctx(fresh));
    assert.equal(r.j, 30, fresh);
    assert.equal(r.ms, at("12:00"), `${fresh}: the time of hour 30`);
    assert.equal(r.behind, true);
    assert.equal(r.old, false, `${fresh}: 2.5 hours before the clock`);
    assert.equal(r.notNow, true, `${fresh}: the line must give the time`);
    assert.equal(K.rowLine(behind2, LAST, ctx(fresh)), "at", `${fresh}: the row gives the time, not a trend`);
  }
  for (const k of [1, 2]) {
    const s = [...Array(33 - k).fill(4.2), ...Array(k).fill(null)];
    assert.equal(K.rowLine(s, LAST, ctx("fresh")), "at", `${k} hour(s) behind`);
    assert.equal(K.readingAt(s, LAST, ctx("fresh")).ms, START + (32 - k) * H);
  }
  assert.equal(K.readingAt(cur, LAST, ctx("fresh")).notNow, false, "a reading at the newest hour in a fresh set needs no time");
  assert.equal(K.readingAt(cur, LAST, ctx("slow")).notNow, true, "a late set always gives the time");
  assert.equal(K.rowLine(cur, LAST, ctx("fresh")), "flat", "33 equal readings: the flat note, no trend");
  const rising = cur.map((v, i) => v + i * 0.03);
  assert.equal(K.rowLine(rising, LAST, ctx("fresh")), "trend");
  assert.equal(K.rowLine(rising, LAST, ctx("slow", at("16:30"))), "trend", "a slow set keeps the trend; the top bar says the set is late");
  assert.equal(K.rowLine(rising, LAST, ctx("old", at("23:00"))), "stopped", "an old set at 23:00: no new reading for 9 hours");
  assert.equal(K.rowLine(rising, 31, ctx("old", at("23:00"))), "at", "replaying an old set gives each reading's time");
  assert.equal(K.rowLine(Array(33).fill(null), LAST, ctx("fresh")), "none");
  assert.equal(K.rowLine(rising, 0, ctx("fresh")), "", "the first hour of the window has no 3-hour change");
  const none = K.readingAt(Array(3).fill(null), 2, ctx("fresh"));
  assert.equal(none.j, -1);
  assert.ok(Number.isNaN(none.ms));
});

test("more than 3 hours without a reading is old: against the shown hour, and at the newest hour against the clock", () => {
  // Codex's case: the set's newest reading is 14:00, the page is open at 15:30, the town gauge's newest is 11:00.
  const p7 = [...Array(30).fill(4.2), null, null, null]; // newest reading at hour 29 = 11:00
  assert.equal(K.readingAt(p7, LAST, ctx("fresh", at("15:30"))).old, true, "4.5 hours before the clock");
  assert.equal(K.rowLine(p7, LAST, ctx("fresh", at("15:30"))), "stopped");
  assert.equal(K.readingAt(p7, LAST, ctx("fresh", at("14:00"))).old, false, "exactly 3 hours before the clock is not old");
  assert.equal(K.readingAt(p7, LAST, ctx("fresh", at("14:01"))).old, true, "just over 3 hours before the clock is old");
  const s4 = [...Array(29).fill(4.2), null, null, null, null]; // newest reading at hour 28, 4 hours before hour 32
  assert.equal(K.readingAt(s4, LAST, ctx("fresh", at("14:00"))).old, true, "4 hours before the newest hour");
  // Replay compares with the replayed hour only: the clock does not make an earlier hour's reading old.
  assert.equal(K.readingAt(p7, 31, ctx("fresh", at("23:00"))).old, false, "replayed 13:00, reading 11:00");
  assert.equal(K.readingAt(s4, 31, ctx("fresh", at("14:00"))).old, false, "replayed 13:00, reading 10:00");
  assert.equal(K.readingAt(s4, 32, ctx("fresh", at("14:00"))).old, true);
});

test("the top bar's time span covers only the readings it counted", () => {
  const cur = Array(33).fill(4.2), behind2 = [...Array(31).fill(4.2), null, null];
  const stopped = [...Array(28).fill(4.2), ...Array(5).fill(null)];
  assert.deepEqual(K.usedSpan([cur, cur], LAST, ctx("fresh")), { lo: 32, hi: 32 });
  assert.deepEqual(K.usedSpan([cur, behind2], LAST, ctx("fresh")), { lo: 30, hi: 32 }, "12:00 to 14:00");
  assert.deepEqual(K.usedSpan([cur, stopped], LAST, ctx("fresh")), { lo: 32, hi: 32 }, "a stopped gauge is not counted");
  assert.deepEqual(K.usedSpan([behind2, behind2], LAST, ctx("fresh")), { lo: 30, hi: 30 });
  assert.equal(K.usedSpan([stopped, Array(33).fill(null)], LAST, ctx("fresh")), null);
});

test("3-hour and 8-hour changes count back from the gauge's newest reading", () => {
  // The reviewer's case: Tak rises 4 cm an hour, and its last two hours are missing.
  const tak = Array.from({ length: 33 }, (_, k) => (k <= 30 ? +(1 + 0.04 * k).toFixed(2) : null));
  assert.equal(K.trend(tak, LAST).t, "↗ ขึ้น 12 ซม. ใน 3 ชม.", "not a 1-hour span called steady");
  assert.equal(K.trend(tak, 30).t, "↗ ขึ้น 12 ซม. ใน 3 ชม.", "the same as at its own newest hour");
  assert.equal(K.change8(tak, LAST).t, "ขึ้น 32 ซม. ใน 8 ชม.");
});

test("an alert is active only inside the display time its sender set", () => {
  const items = [{ id: "a", sent_at: "2026-09-29T14:00:00+07:00", duration_h: 2 }];
  assert.equal(K.activeAlerts(items, at("15:59")).length, 1);
  assert.equal(K.activeAlerts(items, at("16:00")).length, 0, "at the end of the display time it is past");
  assert.deepEqual(K.activeAlerts(undefined, at("15:00")), []);
  const later = [{ id: "b", sent_at: "2026-09-29T16:00:00+07:00", duration_h: 2 }];
  assert.equal(K.activeAlerts(later, at("15:00")).length, 0, "dated an hour ahead: not in effect");
  assert.equal(K.pastAlerts(later, at("15:00")).length, 0, "and not listed as past");
  assert.equal(K.activeAlerts(later, at("15:50")).length, 0, "10 minutes ahead: still not in effect");
  assert.equal(K.activeAlerts(later, at("15:59")).length, 0, "1 minute ahead: still not in effect");
  assert.equal(K.upcomingAlerts(later, at("15:59")).length, 1, "noted apart as dated later than the clock");
  assert.equal(K.activeAlerts(later, at("16:00")).length, 1, "from its own start time it is in effect");
  assert.equal(K.upcomingAlerts(later, at("16:00")).length, 0);
  assert.equal(K.pastAlerts(items, at("16:00")).length, 1);
  assert.equal(K.pastAlerts(items, at("15:59")).length, 0);
});

test("the first screen says the site takes no reports, and the dated tiles need the script", () => {
  const html = fs.readFileSync(new URL("../../../flood/kamphaeng-phet/index.html", import.meta.url), "utf8");
  const role = html.indexOf('<p class="role">'), alerts = html.indexOf('id="activeAlerts"'), hero = html.indexOf('id="heroTitle"');
  assert.ok(role > 0 && role < alerts && alerts < hero, "the role line comes before the alerts, so a long alert cannot push it under the call bar");
  const roleText = html.slice(role, html.indexOf("</p>", role));
  assert.match(roleText, /ไม่ใช่หน่วยงานรัฐ ไม่รับแจ้งเหตุ/);
  // The call bar comes first in the markup and sits at the bottom only by style, so the line names the number, not a place.
  assert.match(roleText, /โทร 1784/);
  assert.doesNotMatch(roleText, /ด้านล่าง|ด้านบน/);
  assert.match(html, /<div class="tiles" id="tiles" hidden>/, "hidden until the script shows them");
});

test("the page title and share texts do not promise automatic or current data", () => {
  const html = fs.readFileSync(new URL("../../../flood/kamphaeng-phet/index.html", import.meta.url), "utf8");
  for (const phrase of ["อัปเดตอัตโนมัติจากกรมชลประทาน", "อัปเดตเองจากข้อมูลกรมชลประทาน", "น้ำกำแพงเพชรตอนนี้"]) assert.ok(!html.includes(phrase), phrase);
});

test("forecast notice says only what is known about its age", () => {
  const now = Date.parse("2026-09-29T14:30:00+07:00");
  assert.equal(K.forecastNotice(now - 60 * 60e3, now), "", "one hour old: no notice");
  const old = K.forecastNotice(Date.parse("2026-09-28T13:14:00+07:00"), now);
  assert.equal(old, "พยากรณ์ชุดนี้ดึงเมื่อ 28 ก.ย. 13:14 น. เว็บนี้ยังไม่มีชุดที่ดึงใหม่ใน 6 ชั่วโมงที่ผ่านมา อาจไม่ใช่ฉบับล่าสุด ดูฉบับล่าสุดที่เว็บกรมอุตุนิยมวิทยา");
  assert.ok(!old.includes("ดึงฉบับใหม่ไม่ได้"), "no claim about why");
  assert.equal(K.forecastNotice(NaN, now), "ไม่ทราบเวลาที่ดึงพยากรณ์ชุดนี้ อาจไม่ใช่ฉบับล่าสุด ดูฉบับล่าสุดที่เว็บกรมอุตุนิยมวิทยา");
  const f = Date.parse("2026-09-29T14:22:00+07:00");
  assert.equal(K.forecastNotice(f, f + 6 * 3600e3), "", "exactly 6 hours: no notice yet");
  assert.ok(K.forecastNotice(f, f + 6 * 3600e3 + 60e3).startsWith("พยากรณ์ชุดนี้ดึงเมื่อ 29 ก.ย. 14:22 น."), "just over 6 hours: the notice");
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

test("map pins sit where RID's station map puts the gauges, each inside the district RID gives", () => {
  // Pins are projected from RID's station map coordinates (fixtures/rid_station_map.json) with one straight-line fit.
  // P.50A was once placed from an older figure about 10 km south, outside every district on this map.
  const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const geoSrc = read("../../../flood/kamphaeng-phet/geo.js"), GEO = JSON.parse(geoSrc.slice(geoSrc.indexOf("{"), geoSrc.lastIndexOf("}") + 1));
  const extra = JSON.parse(read("../../../flood/kamphaeng-phet/kpp.js").match(/const EXTRA_POS = (\{[^;]*\});/)[1]);
  const rid = Object.fromEntries(JSON.parse(read("fixtures/rid_station_map.json")).stations.map((s) => [s.code, s]));
  const amp = Object.fromEntries(JSON.parse(read("fixtures/rid_station_districts.json")).stations.map((s) => [s.code, s.ampur]));
  const fit = (pairs) => {
    const n = pairs.length, mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
    const a = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    return (v) => a * v + (my - a * mx);
  };
  const ids = Object.keys(GEO.stations);
  const fx = fit(ids.map((id) => [+rid[id].long, GEO.stations[id][0]])), fy = fit(ids.map((id) => [+rid[id].lat, GEO.stations[id][1]]));
  const pos = { ...GEO.stations, ...extra };
  // Every gauge on the page has a pin: none is left out any more (P.26B once was, before its position was taken from RID).
  const noPin = read("../../../flood/kamphaeng-phet/kpp.js").match(/const NO_PIN = new Set\((\[[^\]]*\])?\);/);
  assert.ok(noPin, "NO_PIN is declared");
  assert.deepEqual(noPin[1] ? JSON.parse(noPin[1]) : [], []);
  for (const id of Object.keys(amp)) if (id !== "P.12C") assert.ok(pos[id], `${id} has a map position`);
  for (const [id, p] of Object.entries(pos)) {
    assert.ok(Math.hypot(p[0] - fx(+rid[id].long), p[1] - fy(+rid[id].lat)) < 1, `${id} pin is at RID's coordinates`);
  }
  const inside = ([x, y], d) => {
    let c = false;
    for (const ring of d.split("M").filter(Boolean).map((r) => [...r.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]))) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[j];
        if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
      }
    }
    return c;
  };
  for (const [id, p] of Object.entries(pos)) {
    if (id === "P.2A") continue; // upstream in Tak, outside this map's districts
    const d = GEO.districts.find((x) => x.name === amp[id]);
    assert.ok(d && inside(p, d.d), `${id} pin is inside อ.${amp[id]}`);
  }
});
