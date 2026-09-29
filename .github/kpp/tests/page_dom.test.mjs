// Runs the real page script (flood/kamphaeng-phet/kpp.js) against a small fake page and checks the words a visitor
// reads: the top bar, the big block, the Tak line, the river rows, the details sheet, alerts and rain. The clock, the
// river data and the network are all set by each test, so nothing here depends on today's data or on the internet.
// Run: node --test .github/kpp/tests/page_dom.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const PAGE = new URL("../../../flood/kamphaeng-phet/", import.meta.url);
const K = require("../../../flood/kamphaeng-phet/kpp-core.js");
const SRC = fs.readFileSync(new URL("kpp.js", PAGE), "utf8");
const H = 3600e3, N = 33, LAST = N - 1;
const START = Date.parse("2026-09-28T06:00:00+07:00"); // hour 32, the newest, is 29 Sep 14:00 Thai time
const at = (s) => Date.parse(`2026-${s}:00+07:00`); // at("09-29T15:30")

// RID's thresholds for the listed gauges (watch, bank), as in the page data.
const META = {
  "P.2A": ["ตาก บ้านท่าแค", "ต้นน้ำ แม่น้ำปิง อ.เมืองตาก", 4.2, 5.78, 2],
  "P.7A": ["ตัวเมืองกำแพงเพชร", "แม่น้ำปิง ต.ในเมือง อ.เมืองกำแพงเพชร", 4.4, 5.34, 3],
  "P.15": ["คลองขลุง หน้าวัดศรีภิรมย์", "แม่น้ำปิง อ.คลองขลุง", 4.8, 6.1, 4],
  "P.16": ["ขาณุฯ บ้านแสนตอ", "แม่น้ำปิง อ.ขาณุวรลักษบุรี", 5.3, 6.67, 5],
  "P.47A": ["บ้านโป่งน้ำร้อน", "คลองสวนหมาก อ.คลองลาน", 3.2, 4.87, 7],
  "P.26B": ["คลองสวนหมาก (P.26B)", "อ.เมืองกำแพงเพชร", 3, 5, 8],
  "P.78": ["บ้านสามเรือน", "คลองขลุง อ.คลองขลุง", 4.7, 6.29, 9],
  "P.50A": ["คลองวังเจ้า", "อ.โกสัมพีนคร", 2, 3.7, 6],
};
// Every gauge moves 2 cm an hour below its watch level unless a test gives it another series.
const moving = (id) => Array.from({ length: N }, (_, k) => +(META[id][2] - 1 + 0.02 * (k % 4)).toFixed(2));
const blank = (n) => Array(n).fill(null);

function dataSet({ series = {}, alerts = null, forecast = null, start = START, obs = start + LAST * H } = {}) {
  const stations = {};
  for (const [id, [name, place, watch, bank, col]] of Object.entries(META)) {
    stations[id] = { name, place, watch, bank, col, s: series[id] || moving(id) };
  }
  return { version: 1, river: { start: new Date(start).toISOString(), observed_at: new Date(obs).toISOString(), stations }, alerts, forecast };
}

const strip = (h) => String(h).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// A fake page with just what kpp.js touches. Timers and listeners are recorded so a test can run them.
function openPage({ data, geo = { W: 100, H: 100, districts: [], rivers: [], stations: {} }, now, fetchJson = null }) {
  const clock = { now };
  const made = [], errors = [], timers = [], docListeners = {}, fetched = [];
  function makeEl(tag) {
    const el = {
      tagName: tag, children: [], attrs: {}, listeners: {}, _html: "", className: "", hidden: false, dataset: {}, value: "", max: "", inert: false,
      classList: { add() {}, toggle() {}, remove() {} },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
      querySelector(sel) { this._q ||= {}; return (this._q[sel] ||= makeEl("q" + sel)); },
      focus() {}, contains() { return true; }, scrollIntoView() {}, remove() {}, getScreenCTM() { return null; },
    };
    Object.defineProperty(el, "innerHTML", { get() { return this._html; }, set(v) { this._html = v; if (v === "") { this.children = []; this._q = {}; } } });
    // As in a browser, setting textContent replaces the content with that text.
    Object.defineProperty(el, "textContent", { get() { return strip(this._html); }, set(v) { this._html = String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); this.children = []; this._q = {}; } });
    made.push(el);
    return el;
  }
  const els = {};
  const document = {
    getElementById(id) { if (!els[id]) { els[id] = makeEl("#" + id); if (id === "sheet" || id === "scrim" || id === "tiles") els[id].hidden = true; } return els[id]; },
    createElement: makeEl, createElementNS: (ns, t) => makeEl(t), querySelectorAll: () => [],
    addEventListener(t, f) { (docListeners[t] ||= []).push(f); },
    dispatchEvent() {}, body: makeEl("body"), contains: () => true, activeElement: null, visibilityState: "visible",
  };
  class FakeDate extends Date { static now() { return clock.now; } }
  const window = { KPPCore: K, KPP_DATA: data, KPP_GEO: geo, console: { error: (e) => errors.push(String(e && e.stack || e)) } };
  const fetch = async (url) => {
    fetched.push(String(url));
    if (String(url).startsWith("data.json") && fetchJson) return { ok: true, json: async () => JSON.parse(JSON.stringify(fetchJson)) };
    throw new Error("offline");
  };
  const ctx = {
    window, document, Date: FakeDate, matchMedia: () => ({ matches: false }), fetch, console: window.console,
    setTimeout: (f, ms) => { timers.push({ f, ms, kind: "timeout" }); return timers.length; }, clearTimeout() {},
    setInterval: (f, ms) => { timers.push({ f, ms, kind: "interval" }); return timers.length; }, clearInterval() {},
    AbortController, URLSearchParams,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const $ = (id) => document.getElementById(id);
  const stops = () => made.filter((e) => e.className === "stop");
  const nameOf = (b) => strip(b.querySelector(".nm").innerHTML);
  const row = (id) => { const b = stops().find((x) => nameOf(x).startsWith(META[id][0])); return b ? strip(b.querySelector(".val").innerHTML.replace(/<small/g, " | <small")) : null; };
  return {
    clock, errors, fetched, timers, $,
    status: () => strip($("stWord").innerHTML), age: () => $("age").textContent,
    hero: () => ({ big: strip($("hVerdict").innerHTML), chip: $("hTrend").hidden ? null : strip($("hTrend").innerHTML), watch: strip($("hWatch").innerHTML), sentence: strip($("hSentence").innerHTML), up: strip($("hUp").innerHTML) }),
    row, clockText: () => $("clock").textContent,
    replay(i) { const sc = $("scrub"); sc.value = String(i); sc.listeners.input.forEach((f) => f()); },
    sheet(id) { const b = stops().find((x) => nameOf(x).startsWith(META[id][0])); b.listeners.click.forEach((f) => f()); return { place: $("shPlace").textContent, gap: strip($("shGap").innerHTML), cls: strip($("shCls").innerHTML), trend: strip($("shTrend").innerHTML), note: $("shFlat").hidden ? "" : strip($("shFlat").innerHTML) }; },
    alerts: () => ({ active: $("activeAlerts").children.map((d) => strip(d.innerHTML)), calm: strip($("alertCalm").innerHTML), past: strip($("alertPast").innerHTML) }),
    rain: () => ({ old: $("rainOld").hidden ? null : $("rainOld").innerHTML, days: $("days").children.map((d) => strip(d.innerHTML)) }),
    // The page's minute timer, and the page coming back into view.
    minute() { timers.filter((t) => t.kind === "interval" && t.ms === 60000).forEach((t) => t.f()); },
    async settle() { for (let k = 0; k < 10; k++) await new Promise((r) => setImmediate(r)); },
  };
}

test("Codex 15:19: a gauge with no reading for more than 3 hours by the clock is not counted as normal", () => {
  const p7 = [...moving("P.7A").slice(0, 30), null, null, null]; // newest reading 11:00
  const pg = openPage({ data: dataSet({ series: { "P.7A": p7 } }), now: at("09-29T15:30") });
  assert.equal(pg.status(), "จุดวัดน้ำ 6 จุด ต่ำกว่าเกณฑ์เฝ้าระวัง · ไม่มีค่าล่าสุด 1 จุด", "the old gauge is not counted with the others");
  assert.equal(pg.row("P.7A"), "ค่าเดิม ต่ำกว่าตลิ่ง 1.92 ม. | ไม่มีค่าใหม่ตั้งแต่ 29 ก.ย. 11:00 น.");
  assert.match(pg.hero().watch, /^ไม่มีข้อมูลล่าสุด · ค่าล่าสุด 11:00 น\./);
  assert.deepEqual(pg.errors, []);
});

test("Codex 15:12: the top bar gives the span of the readings it counted, and each line its own time", () => {
  const p7 = [...moving("P.7A").slice(0, 31), null, null]; // newest reading 12:00
  const pg = openPage({ data: dataSet({ series: { "P.7A": p7 } }), now: at("09-29T14:30") });
  assert.equal(pg.status(), "จุดวัดน้ำทั้ง 7 จุด ต่ำกว่าเกณฑ์เฝ้าระวัง");
  assert.equal(pg.age(), "วัดเมื่อ 12:00–14:00 น. (ล่าสุด 30 นาทีที่แล้ว)");
  assert.match(pg.hero().big, /^ตอน 12:00 น\. อีก/);
  assert.equal(pg.hero().chip, null, "no trend chip for an earlier reading");
  assert.match(pg.row("P.7A"), /\| ค่าเมื่อ 12:00 น\.$/);
  const all = openPage({ data: dataSet(), now: at("09-29T14:30") });
  assert.equal(all.age(), "วัดเมื่อ 14:00 น. (30 นาทีที่แล้ว)", "one hour for all: unchanged");
});

test("reviewer 1: a late Tak gauge shows its real 3-hour change with its own time, not 'steady'", () => {
  const tak = Array.from({ length: N }, (_, k) => (k <= 30 ? +(1 + 0.04 * k).toFixed(2) : null));
  const pg = openPage({ data: dataSet({ series: { "P.2A": tak } }), now: at("09-29T14:30") });
  assert.equal(pg.hero().up, "เมื่อ 12:00 น. ต้นน้ำ จ.ตาก (ไม่ใช่ตัวเมือง): ↗ ขึ้น 12 ซม. ใน 3 ชม.");
  assert.equal(pg.sheet("P.2A").trend, "↗ ขึ้น 12 ซม. ใน 3 ชม.");
});

test("reviewer 2: a flat town gauge gets no 'steady' chip; the big block says it may be stuck", () => {
  const pg = openPage({ data: dataSet({ series: { "P.7A": Array(N).fill(3.94) } }), now: at("09-29T14:30") });
  assert.equal(pg.hero().chip, null);
  assert.equal(pg.hero().sentence, "ต่ำกว่าตลิ่ง 1.40 ม. · เปลี่ยนไม่เกิน 1 ซม. มาอย่างน้อย 32 ชม. อาจเป็นเครื่องวัดค้าง หรือน้ำนิ่งจริง");
  const tak = openPage({ data: dataSet({ series: { "P.2A": Array(N).fill(1.5) } }), now: at("09-29T14:30") });
  assert.equal(tak.hero().up, "ต้นน้ำ จ.ตาก (ไม่ใช่ตัวเมือง): เปลี่ยนไม่เกิน 1 ซม. มาอย่างน้อย 32 ชม. อาจเป็นเครื่องวัดค้าง หรือน้ำนิ่งจริง");
});

test("reviewer 3 and Codex 14:53: a flat gauge that misses hours keeps its warning, tied to its last reading's time", () => {
  const late = openPage({ data: dataSet({ series: { "P.78": [...Array(31).fill(6.6), null, null] } }), now: at("09-29T14:30") });
  assert.equal(late.row("P.78"), "ล้นตลิ่ง 0.31 ม. | ค่าเมื่อ 12:00 น. | จนถึง 12:00 น. เปลี่ยนไม่เกิน 1 ซม. มาอย่างน้อย 30 ชม.");
  const sh = late.sheet("P.78");
  assert.equal(sh.trend, "ไม่แน่ใจ");
  assert.match(sh.note, /^ค่าที่จุดนี้จนถึง 29 ก\.ย\. 12:00 น\. เปลี่ยนไม่เกิน 1 ซม\. มาอย่างน้อย 30 ชม\. อาจเป็นเครื่องวัดค้าง/);
  const stopped = openPage({ data: dataSet({ series: { "P.78": [...Array(28).fill(6.6), ...blank(5)] } }), now: at("09-29T14:30") });
  assert.equal(stopped.row("P.78"), "ค่าเดิม ล้นตลิ่ง 0.31 ม. | ไม่มีค่าใหม่ตั้งแต่ 29 ก.ย. 09:00 น. | จนถึง 29 ก.ย. 09:00 น. เปลี่ยนไม่เกิน 1 ซม. มาอย่างน้อย 27 ชม.");
  const current = openPage({ data: dataSet({ series: { "P.78": Array(N).fill(6.6) } }), now: at("09-29T14:30") });
  assert.equal(current.row("P.78"), "ล้นตลิ่ง 0.31 ม. | เปลี่ยนไม่เกิน 1 ซม. มาอย่างน้อย 32 ชม.", "a current reading: no time needed");
});

test("every gauge past 3 hours by the clock: the top bar says there is no recent data, never 'ปกติ 0 จุด'", () => {
  const pg = openPage({ data: dataSet({ series: { "P.78": Array(N).fill(6.6) } }), now: at("09-29T17:40") });
  assert.equal(pg.status(), "ไม่มีข้อมูลล่าสุด ดูต้นทางหรือโทร 1784");
  assert.equal(pg.$("tRiver").textContent, "–");
  assert.equal(pg.row("P.78"), "ค่าเดิม ล้นตลิ่ง 0.31 ม. | ไม่มีค่าใหม่ตั้งแต่ 29 ก.ย. 14:00 น. | จนถึง 29 ก.ย. 14:00 น. เปลี่ยนไม่เกิน 1 ซม. มาอย่างน้อย 32 ชม.");
  assert.match(pg.sheet("P.78").note, /ค่าที่จุดนี้จนถึง 29 ก\.ย\. 14:00 น\. เปลี่ยนไม่เกิน 1 ซม\./);
});

test("reviewer 4: 'ตอนนี้' only for a fresh set", () => {
  assert.equal(openPage({ data: dataSet(), now: at("09-29T14:30") }).clockText(), "ตอนนี้ (29 ก.ย. 14:00 น.)");
  assert.equal(openPage({ data: dataSet(), now: at("09-29T17:00") }).clockText(), "ค่าล่าสุด (29 ก.ย. 14:00 น.)");
});

test("reviewer 5 and 6: replay before a gauge's first reading, and a gauge with no reading at all", () => {
  const p15 = [...blank(10), ...moving("P.15").slice(10)];
  const pg = openPage({ data: dataSet({ series: { "P.15": p15 } }), now: at("09-29T14:30") });
  pg.replay(5);
  assert.match(pg.row("P.15"), /\| ยังไม่มีค่าถึงเวลานี้$/);
  const none = openPage({ data: dataSet({ series: { "P.7A": blank(N) } }), now: at("09-29T17:00") });
  assert.equal(none.hero().sentence, "ไม่มีข้อมูล", "no other gauge's time for a gauge with no reading");
  const old = openPage({ data: dataSet({ series: { "P.47A": blank(N) } }), now: at("09-29T23:00") });
  assert.equal(old.row("P.47A"), "ไม่มีข้อมูล | ไม่มีค่าในช่วง 33 ชม. ที่แสดง");
});

test("Codex 15:14: alerts and forecast labels follow the clock on an open page with no new data", () => {
  const alerts = { source: "ปภ.", checked_at: "2026-09-29T14:22:00+07:00", items: [{ id: "CB-1", sent_at: "2026-09-29T14:00:00+07:00", duration_h: 2, title: "t", text: "ข้อความทดสอบ" }] };
  const forecast = { source_url: "https://www.tmd.go.th/weatherForecast7Days?province=กำแพงเพชร", fetched_at: "2026-09-29 14:22:10",
    days: [{ date: "2026-09-29", rain_pct: 60, desc: "ฝนฟ้าคะนอง" }, { date: "2026-09-30", rain_pct: 40, desc: "ฝนฟ้าคะนอง" }, { date: "2026-10-01", rain_pct: 10, desc: "มีเมฆบางส่วน" }] };
  const pg = openPage({ data: dataSet({ alerts, forecast }), now: at("09-29T15:00") });
  assert.equal(pg.alerts().active.length, 1);
  assert.equal(pg.rain().old, null);
  assert.match(pg.rain().days[0], /^วันนี้ 29 ก\.ย\./);
  pg.clock.now = at("09-29T16:00"); pg.minute();
  assert.equal(pg.alerts().active.length, 0, "past its display time");
  assert.match(pg.alerts().past, /ประกาศที่ผ่านมาใน 7 วัน \(1\)/);
  pg.clock.now = at("09-29T20:30"); pg.minute();
  assert.match(pg.rain().old, /^พยากรณ์ชุดนี้ดึงเมื่อ 29 ก\.ย\. 14:22 น\./);
  assert.match(pg.rain().old, /<a href="https:\/\/www\.tmd\.go\.th\/weatherForecast7Days\?province=กำแพงเพชร" target="_blank" rel="noopener">เว็บกรมอุตุนิยมวิทยา ↗<\/a>$/);
  pg.clock.now = at("09-30T00:30"); pg.minute();
  assert.match(pg.rain().days[0], /^วันนี้ 30 ก\.ย\./, "after midnight the labels move on");
  assert.match(pg.rain().days[1], /^พรุ่งนี้ 1 ต\.ค\./);
  assert.deepEqual(pg.errors, []);
});

test("the minute timer marks a gauge old when it passes 3 hours by the clock", () => {
  const p7 = [...moving("P.7A").slice(0, 31), null, null]; // newest reading 12:00
  const pg = openPage({ data: dataSet({ series: { "P.7A": p7 } }), now: at("09-29T14:30") });
  assert.equal(pg.status(), "จุดวัดน้ำทั้ง 7 จุด ต่ำกว่าเกณฑ์เฝ้าระวัง");
  pg.clock.now = at("09-29T15:01"); pg.minute();
  assert.match(pg.status(), /ไม่มีค่าล่าสุด 1 จุด/);
  assert.match(pg.row("P.7A"), /\| ไม่มีค่าใหม่ตั้งแต่ 29 ก\.ย\. 12:00 น\.$/);
});

test("Codex 15:21: without geo.js the map says so and the rest of the page still works", () => {
  const pg = openPage({ data: dataSet(), geo: null, now: at("09-29T14:30") });
  assert.deepEqual(pg.errors, []);
  assert.equal(pg.$("mapNote").textContent, "แผนที่โหลดไม่ขึ้น ลองโหลดหน้าใหม่");
  assert.equal(pg.status(), "จุดวัดน้ำทั้ง 7 จุด ต่ำกว่าเกณฑ์เฝ้าระวัง");
  assert.ok(pg.row("P.7A"));
  assert.ok(pg.timers.some((t) => t.kind === "interval" && t.ms === 60000), "the minute timer is set");
  assert.ok(pg.timers.some((t) => t.kind === "interval" && t.ms === 600000), "the 10-minute reload is set");
});

test("Codex 15:21: without data.js the page reads data.json at once", async () => {
  const pg = openPage({ data: undefined, now: at("09-29T14:30"), fetchJson: dataSet() });
  assert.equal(pg.status(), "ยังโหลดข้อมูลไม่ได้");
  await pg.settle();
  assert.ok(pg.fetched.some((u) => u.startsWith("data.json")), "data.json was read without waiting for a timer");
  assert.equal(pg.status(), "จุดวัดน้ำทั้ง 7 จุด ต่ำกว่าเกณฑ์เฝ้าระวัง");
  const off = openPage({ data: undefined, now: at("09-29T14:30") });
  await off.settle();
  assert.ok(off.timers.some((t) => t.kind === "timeout" && t.ms === 60000), "offline: tries again in a minute");
});

test("Codex 15:52: the top bar speaks of the gauges and RID's watch level, never a bare 'ปกติทุกจุด'", () => {
  const pg = openPage({ data: dataSet(), now: at("09-29T14:30") });
  assert.equal(pg.status(), "จุดวัดน้ำทั้ง 7 จุด ต่ำกว่าเกณฑ์เฝ้าระวัง");
  assert.ok(!pg.status().includes("ปกติ"));
});

test("Codex 15:52: the satellite colours go when their display time ends on an open page", () => {
  const pg = openPage({ data: dataSet(), now: at("10-02T23:58") });
  assert.ok(!pg.$("mapNote").innerHTML.includes("เก่าแล้ว"), "before 2 Oct 23:59 the colours stay");
  pg.clock.now = at("10-03T00:00"); pg.minute();
  assert.match(pg.$("mapNote").innerHTML, /^ข้อมูลดาวเทียมชุดนี้ \(23–29 ก\.ย\.\) เก่าแล้ว จึงไม่ลงสีอำเภอ/);
  assert.match(pg.$("mapNote").innerHTML, /<a href="https:\/\/disaster\.gistda\.or\.th\/flood" target="_blank" rel="noopener">เว็บ GISTDA ↗<\/a>$/);
  assert.equal(pg.$("tMap").textContent, "–");
  assert.deepEqual(pg.errors, []);
});

test("Codex 15:52: a saved forecast with only past days says so, with the TMD link", () => {
  const forecast = { source_url: "https://www.tmd.go.th/weatherForecast7Days?province=กำแพงเพชร", fetched_at: "2026-09-27 08:00:00",
    days: [{ date: "2026-09-27", rain_pct: 60, desc: "ฝนฟ้าคะนอง" }, { date: "2026-09-28", rain_pct: 40, desc: "ฝนฟ้าคะนอง" }] };
  const pg = openPage({ data: dataSet({ forecast }), now: at("09-29T15:00") });
  assert.match(pg.$("days").innerHTML, /^<p class="note">ชุดพยากรณ์ที่บันทึกไว้ไม่มีวันนี้หรือพรุ่งนี้ ดูพยากรณ์ล่าสุดที่<a href="https:\/\/www\.tmd\.go\.th\//);
  assert.match(pg.rain().old, /^พยากรณ์ชุดนี้ดึงเมื่อ 27 ก\.ย\. 08:00 น\./, "and the old-forecast notice still shows");
});

test("Codex 15:55: while replaying, the details sheet shows the same hour as the row", () => {
  const p7 = Array.from({ length: N }, (_, k) => (k >= 10 && k <= 15 ? 5.5 : 4.0)); // over the 5.34 m bank from hour 10 to 15
  const pg = openPage({ data: dataSet({ series: { "P.7A": p7 } }), now: at("09-29T14:30") });
  pg.replay(12); // 28 Sep 18:00
  assert.match(pg.row("P.7A"), /^ล้นตลิ่ง 0\.16 ม\./);
  const sh = pg.sheet("P.7A");
  assert.equal(sh.gap, "ล้นตลิ่ง 0.16 ม.");
  assert.match(sh.cls, /วิกฤติ/);
  assert.match(sh.place, /กรมชลประทาน 28 ก\.ย\. 18:00 น\.$/);
  assert.match(sh.note, /^กำลังย้อนดู 28 ก\.ย\. 18:00 น\. เลื่อนแถบเวลาไปขวาสุดเพื่อดูค่าล่าสุด/);
  const now = openPage({ data: dataSet({ series: { "P.7A": p7 } }), now: at("09-29T14:30") }).sheet("P.7A");
  assert.equal(now.gap, "ต่ำกว่าตลิ่ง 1.34 ม.", "at the newest hour the sheet shows the newest reading");
  assert.ok(!now.note.includes("กำลังย้อนดู"));
});

test("Codex 15:55: a time span across midnight gives both dates", () => {
  const start = Date.parse("2026-09-27T17:00:00+07:00"); // hour 32 is 29 Sep 01:00
  const p7 = [...moving("P.7A").slice(0, 31), null, null]; // newest reading 28 Sep 23:00
  const pg = openPage({ data: dataSet({ start, series: { "P.7A": p7 } }), now: Date.parse("2026-09-29T01:30:00+07:00") });
  assert.equal(pg.age(), "วัดเมื่อ 28 ก.ย. 23:00 น. – 29 ก.ย. 01:00 น. (ล่าสุด 30 นาทีที่แล้ว)");
});

test("Codex 16:18: no gauge reading at all gives no measured time, even with a valid observed_at", () => {
  const series = Object.fromEntries(Object.keys(META).map((id) => [id, blank(N)]));
  const pg = openPage({ data: dataSet({ series }), now: at("09-29T14:30") });
  assert.equal(pg.age(), "ยังไม่มีค่าจุดวัดในข้อมูลชุดนี้");
  assert.equal(pg.status(), "ไม่มีข้อมูลล่าสุด ดูต้นทางหรือโทร 1784");
  assert.deepEqual(pg.errors, []);
});

test("Codex 16:19: the rain box shows exactly today and tomorrow, and says which one is missing", () => {
  const src = "https://www.tmd.go.th/weatherForecast7Days?province=กำแพงเพชร";
  const day = (date) => ({ date, rain_pct: 40, desc: "ฝนฟ้าคะนอง", tmin: 25, tmax: 33 });
  const noToday = openPage({ data: dataSet({ forecast: { source_url: src, fetched_at: "2026-09-29 14:22:10", days: [day("2026-09-30"), day("2026-10-01")] } }), now: at("09-29T15:00") });
  const d1 = noToday.rain().days;
  assert.equal(d1.length, 2);
  assert.match(d1[0], /^วันนี้ 29 ก\.ย\.\s*ไม่มีในชุดพยากรณ์ที่บันทึกไว้ ดูที่เว็บกรมอุตุนิยมวิทยา ↗$/);
  assert.match(d1[1], /^พรุ่งนี้ 30 ก\.ย\.\s*ฝนฟ้าคะนอง 40%/);
  assert.ok(!d1.join(" ").includes("1 ต.ค."), "the day after tomorrow is never shown in their place");
  const noTomorrow = openPage({ data: dataSet({ forecast: { source_url: src, fetched_at: "2026-09-29 14:22:10", days: [day("2026-09-29"), day("2026-10-01")] } }), now: at("09-29T15:00") });
  const d2 = noTomorrow.rain().days;
  assert.match(d2[0], /^วันนี้ 29 ก\.ย\.\s*ฝนฟ้าคะนอง/);
  assert.match(d2[1], /^พรุ่งนี้ 30 ก\.ย\.\s*ไม่มีในชุดพยากรณ์ที่บันทึกไว้/);
});

test("Codex 16:22: the tiles, which hold dated figures, appear only when the script runs", () => {
  const pg = openPage({ data: dataSet(), now: at("09-29T14:30") });
  assert.equal(pg.$("tiles").hidden, false);
});


test("Codex 17:03: an alert dated later than the clock is never shown as in effect, only noted apart", () => {
  const alerts = { source: "ปภ.", checked_at: "2026-09-29T14:22:00+07:00", items: [{ id: "CB-9", sent_at: "2026-09-29T15:10:00+07:00", duration_h: 2, title: "t", text: "ข้อความทดสอบ" }] };
  const pg = openPage({ data: dataSet({ alerts }), now: at("09-29T15:00") }); // 10 minutes before its start time
  assert.equal(pg.alerts().active.length, 0, "not in the red box");
  assert.match(pg.alerts().calm, /มีประกาศของ ปภ\. ที่ระบุเวลาเริ่ม 29 ก\.ย\. 15:10 น\. ซึ่งยังไม่ถึงตามนาฬิกาของเครื่องนี้ นาฬิกาเครื่องอาจคลาดเคลื่อน ตรวจประกาศที่ต้นทาง/);
  assert.ok(!pg.alerts().calm.includes("ข้อความทดสอบ"), "the alert text is not shown before its time");
  pg.clock.now = at("09-29T15:09"); pg.minute();
  assert.equal(pg.alerts().active.length, 0, "1 minute before: still not in effect");
  pg.clock.now = at("09-29T15:10"); pg.minute();
  assert.equal(pg.alerts().active.length, 1, "at its start time the minute check shows it");
  assert.ok(!pg.alerts().calm.includes("ยังไม่ถึง"));
});
