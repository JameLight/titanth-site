// Unit tests for /flood-water/ summaries. Fixtures are trimmed copies of HII ThaiWater answers read on 2026-09-27 at
// 12:44:50Z (19:44 Thai time) for ปราจีนบุรี (25), ระยอง (21) and กรุงเทพมหานคร (10). The ระยอง file also has one reading
// from the day before (must be left out) and one row from ปราจีนบุรี (must be ignored by the province filter).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { waterSummary, rainSummary, waterUrl, rainUrl, thaiTime, stationLine, rainLine, ageText, provinceFromQuery } from "../water_model.js";
import { PROVINCE_CODES } from "../province_codes.js";
import { PROVINCES } from "../../flood/provinces.js";

const NOW = new Date("2026-09-27T12:44:50Z");
const load = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

test("every province on the site has its own ThaiWater province code", () => {
  assert.equal(PROVINCES.length, 77);
  for (const name of PROVINCES) assert.match(PROVINCE_CODES[name] ?? "", /^\d{2}$/, name);
  assert.equal(new Set(Object.values(PROVINCE_CODES)).size, 77);
  assert.equal(PROVINCE_CODES["ระยอง"], "21");
});

test("request URLs ask HII for one province only", () => {
  assert.equal(waterUrl("21"), "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load?province_code=21");
  assert.equal(rainUrl("25"), "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h?province_code=25");
});

test("API times are read as Thailand time", () => {
  assert.equal(thaiTime("2026-09-27 19:30").toISOString(), "2026-09-27T12:30:00.000Z");
  assert.equal(thaiTime("27/09/2026"), null);
});

test("ปราจีนบุรี: eight stations over the bank, sorted from the highest share of the bank", () => {
  const s = waterSummary(load("waterlevel_25"), "25", NOW);
  assert.equal(s.over.length, 8);
  assert.ok(s.over.every(item => item.percent > 100 && item.level === 5));
  for (let i = 1; i < s.over.length; i++) assert.ok(s.over[i - 1].percent >= s.over[i].percent);
  assert.ok(s.high.every(item => item.percent >= 70 && item.percent <= 100));
  assert.ok(["up", "down", "steady", "unknown"].includes(s.over[0].trend));
  assert.match(s.over[0].district, /^อ\./);
});

test("ระยอง: old readings and a row from another province are left out", () => {
  // the real answer already has one reading from 06:00 (บ้านซำฆ้อ); the fixture adds one from the day before
  const s = waterSummary(load("waterlevel_21"), "21", NOW);
  assert.equal(s.stale, 2);
  assert.ok(!s.over.some(item => item.name === "สถานีเก่าเกิน 3 ชั่วโมง"));
  assert.ok(![...s.over, ...s.high].some(item => item.name === "บ้านซำฆ้อ"));
  assert.equal(s.over.length, 2);
  assert.equal(s.total, 4);
});

test("กรุงเทพมหานคร: districts are shown as เขต", () => {
  const s = waterSummary(load("waterlevel_10"), "10", NOW);
  assert.equal(s.over.length, 3);
  assert.ok(s.over.every(item => item.district.startsWith("เขต")));
});

test("ระยอง rain: the top station has 286 mm in 24 hours and counts are right", () => {
  const r = rainSummary(load("rain_21"), "21", NOW);
  assert.equal(r.top[0].mm, 286);
  assert.equal(r.top.length, 5);
  assert.ok(r.over90 >= 1 && r.over35 >= r.over90);
  assert.match(rainLine(r.top[0], NOW), /^286 มม\. — .+ อ\..+ · ถึง \d{2}:\d{2} น\. \(/);
});

test("a station line says the share of the bank, the trend, when it was measured and how long ago", () => {
  const item = { name: "บ้านทดสอบ", river: "คลองทดสอบ", district: "อ.ทดสอบ", percent: 118.6, trend: "up", time: "19:30", at: "2026-09-27T12:30:00.000Z" };
  assert.equal(stationLine(item, NOW), "บ้านทดสอบ (คลองทดสอบ) อ.ทดสอบ — 119% ของตลิ่ง · น้ำกำลังขึ้น · วัดเมื่อ 19:30 น. (15 นาทีที่แล้ว)");
});

test("reading age is said in words and slow readings are marked", () => {
  assert.equal(ageText("2026-09-27T12:44:30Z", NOW), "เมื่อสักครู่");
  assert.equal(ageText("2026-09-27T12:30:00Z", NOW), "15 นาทีที่แล้ว");
  assert.equal(ageText("2026-09-27T11:40:00Z", NOW), "1 ชม. 5 นาทีที่แล้ว");
  assert.equal(ageText("2026-09-27T11:00:00Z", NOW), "1 ชม. 45 นาทีที่แล้ว · ข้อมูลช้า");
  assert.equal(ageText("2026-09-27T10:44:50Z", NOW), "2 ชม.ที่แล้ว · ข้อมูลช้า");
});

test("a shared link opens its province by code or by Thai name, and ignores anything else", () => {
  assert.equal(provinceFromQuery("?p=21", PROVINCE_CODES), "ระยอง");
  assert.equal(provinceFromQuery("?p=" + encodeURIComponent("ปราจีนบุรี"), PROVINCE_CODES), "ปราจีนบุรี");
  assert.equal(provinceFromQuery("?p=99", PROVINCE_CODES), null);
  assert.equal(provinceFromQuery("?p=<script>", PROVINCE_CODES), null);
  assert.equal(provinceFromQuery("", PROVINCE_CODES), null);
});

test("a changed or broken answer is refused instead of shown as no data", () => {
  assert.throws(() => waterSummary({ result: "OK" }, "21", NOW), /FORMAT/);
  assert.throws(() => rainSummary({ data: "x" }, "21", NOW), /FORMAT/);
});
