// Tests for the Kamphaeng Phet updater, using trimmed copies of real official responses.
// Run: node --test .github/kpp/tests/update.test.mjs .github/kpp/tests/page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { STATIONS, parseColModel, parseRidDay, buildRiver, parseCB, parseTMD, ridDate, isoThai, toThaiIso, stable, shouldWrite, HEARTBEAT_H } from "../update.mjs";

const K = createRequire(import.meta.url)("../../../flood/kamphaeng-phet/kpp-core.js");
const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (f) => JSON.parse(readFileSync(path.join(FX, f), "utf8"));
const col = parseColModel(load("rid_colmodel.json"));
const day28 = Date.parse("2026-09-28T12:00:00+07:00");
const day29 = Date.parse("2026-09-29T12:00:00+07:00");
const HOUR = 3600e3;

test("RID date is the Thai Buddhist-era date in Thai time", () => {
  assert.equal(ridDate(Date.parse("2026-09-28T17:30:00Z")), "29/09/2569"); // 00:30 Thai on 29 Sep
  assert.equal(ridDate(Date.parse("2026-09-28T16:59:00Z")), "28/09/2569");
});

test("hour 24 becomes midnight of the next day", () => {
  assert.equal(toThaiIso(isoThai(2026, 9, 28, 24)), "2026-09-29T00:00:00+07:00");
});

test("column model maps station codes and bank levels", () => {
  assert.equal(col.codes["P.7A"], 3);
  assert.equal(col.codes["P.78"], 9);
  assert.equal(col.codes["P.50A"], 6);
  assert.equal(col.banks[3], 5.34);
  assert.equal(col.banks[9], 6.29);
});

test("river series ends at the latest hour and matches the official table", () => {
  const r = buildRiver([parseRidDay(col, load("rid_rows_20260928.json").rows, day28), parseRidDay(col, load("rid_rows_20260929.json").rows, day29)]);
  assert.equal(r.observed_at, "2026-09-29T09:00:00+07:00");
  const p7 = r.stations["P.7A"];
  assert.equal(p7.s.length, 33);
  assert.deepEqual(p7.s.slice(-4), [3.44, 3.57, 3.68, 3.79]);
  assert.equal(p7.watch, 4.4);
  assert.equal(p7.bank, 5.34);
  assert.equal(r.stations["P.78"].s.at(-1), 6.6);
  assert.equal(r.stations["P.50A"].col, 6, "the seventh Kamphaeng Phet gauge is included");
  const other = Object.keys(col.codes).find((c) => !STATIONS[c]);
  assert.ok(other, "the fixture has a gauge outside the page's list");
  assert.equal(r.stations[other], undefined, "gauges without a meta entry are left out");
  // RID's own classes at 09:00 were: P.7A green, P.26B yellow, P.47A yellow, P.78 red (same rule as the page)
  const cls = (id) => { const s = r.stations[id]; return K.cls(s.s.at(-1), s); };
  assert.equal(cls("P.7A"), "ok");
  assert.equal(cls("P.26B"), "watch");
  assert.equal(cls("P.47A"), "watch");
  assert.equal(cls("P.78"), "crit");
});

test("the window ends at the newest reading of any gauge, not only P.7A", () => {
  const t = (h) => isoThai(2026, 9, 29, h);
  const part = {
    _columns: { "P.7A": 3, "P.15": 4, "P.50A": 6 },
    _criteria: { "P.50A": { watch: 3.2, bank: 3.7 } },
    "P.7A": [{ t: t(9), v: 3.8, watch: 4.4, bank: 5.34 }],
    "P.15": [{ t: t(11), v: 4.1, watch: 4.8, bank: 6.1 }],
  };
  const r = buildRiver([part]);
  assert.equal(r.observed_at, "2026-09-29T11:00:00+07:00");
  assert.equal(r.stations["P.7A"].s.at(-3), 3.8, "P.7A's 09:00 reading sits two hours before the end");
  assert.ok(r.stations["P.50A"], "a listed gauge with no readings is kept");
  assert.ok(r.stations["P.50A"].s.every((v) => v == null));
  assert.equal(r.stations["P.50A"].bank, 3.7);
});

test("missing P.7A readings fail loudly so old data is kept", () => {
  assert.throws(() => buildRiver([{}]), /P\.7A/);
});

test("Cell Broadcast: only province 62, display window decides active", () => {
  const cb = load("cb_sample.json");
  const at1300 = parseCB(cb, Date.parse("2026-09-28T13:00:00+07:00"));
  const a = at1300.items.find((x) => x.id === "CB-690414");
  assert.ok(a, "CB-690414 found");
  assert.equal(a.sent_at, "2026-09-28T11:14:00+07:00");
  assert.equal(a.active, true);
  assert.ok(!at1300.items.some((x) => x.id === "CB-690438"), "Sukhothai alert is not listed");
  const later = parseCB(cb, Date.parse("2026-09-29T10:00:00+07:00"));
  assert.equal(later.items.find((x) => x.id === "CB-690414").active, false);
  assert.match(later.items[0].text, /กำแพงเพชร/);
});

test("Cell Broadcast: a changed or broken file throws, so the previous alerts are kept instead of showing none", () => {
  const cb = load("cb_sample.json"), now = Date.parse("2026-09-28T13:00:00+07:00");
  assert.throws(() => parseCB(null, now), /fact_cb is missing or empty/);
  for (const table of ["fact_cb", "dim_message", "bridge_alert_location"]) {
    assert.throws(() => parseCB({ ...cb, [table]: undefined }, now), new RegExp(`${table} is missing or empty`));
    assert.throws(() => parseCB({ ...cb, [table]: [] }, now), new RegExp(`${table} is missing or empty`));
    assert.throws(() => parseCB({ ...cb, [table]: {} }, now), new RegExp(`${table} is missing or empty`));
  }
  const noProvince = cb.bridge_alert_location.map(({ province_code, ...x }) => x);
  assert.throws(() => parseCB({ ...cb, bridge_alert_location: noProvince }, now), /bridge_alert_location lacks province_code/);
  const noText = cb.dim_message.map(({ message_th, ...x }) => x);
  assert.throws(() => parseCB({ ...cb, dim_message: noText }, now), /dim_message lacks message_th/);
  const badTime = cb.fact_cb.map((x) => (x.alert_id === "CB-690414" ? { ...x, time: "" } : x));
  assert.throws(() => parseCB({ ...cb, fact_cb: badTime }, now), /unreadable date or time for CB-690414/);
  // An unreadable row of another province is not ours to judge and does not stop the reader.
  const otherBad = cb.fact_cb.map((x) => (x.alert_id === "CB-690438" ? { ...x, time: "" } : x));
  assert.ok(parseCB({ ...cb, fact_cb: otherBad }, now).items.some((x) => x.id === "CB-690414"));
});

test("TMD forecast: Kamphaeng Phet days sorted by date; the response time is kept as fetched_at", () => {
  const f = parseTMD(load("tmd_sample.json"));
  assert.equal(f.days[0].date, "2026-09-29");
  assert.equal(f.days[0].rain_pct, 60);
  assert.equal(f.days[0].desc, "ฝนฟ้าคะนอง");
  assert.ok(f.days.length >= 2);
  assert.ok("fetched_at" in f && !("build_at" in f));
});

test("times that change on every run do not count as a change, but a heartbeat write happens every few hours", () => {
  const base = { version: 1, generated_at: "2026-09-29T06:00:00.000Z", river: { observed_at: "x" }, alerts: { checked_at: "a", items: [] }, forecast: { fetched_at: "13:14:00", days: [1] } };
  const next = structuredClone(base);
  next.generated_at = "2026-09-29T06:30:00.000Z"; next.alerts.checked_at = "b"; next.forecast.fetched_at = "13:44:26";
  assert.equal(stable(base), stable(next));
  const t0 = Date.parse(base.generated_at);
  assert.equal(shouldWrite(base, next, t0 + 30 * 60e3), false, "30 minutes later with nothing new: no write");
  assert.equal(shouldWrite(base, next, t0 + HEARTBEAT_H * HOUR), true, "heartbeat write");
  next.forecast.days = [2];
  assert.equal(shouldWrite(base, next, t0 + 60e3), true, "real change: write at once");
  assert.equal(shouldWrite(null, next, t0), true);
});

test("every gauge's district matches RID's own station list", () => {
  // RID's column model gives each gauge's district (groupHeadersStationAmpur); saved in fixtures/rid_station_districts.json.
  // P.26B คลองสวนหมาก is in อ.เมืองกำแพงเพชร, not อ.คลองลาน, which an earlier version of this page said.
  const rid = Object.fromEntries(load("rid_station_districts.json").stations.map((s) => [s.code, s]));
  for (const [code, meta] of Object.entries(STATIONS)) {
    assert.ok(rid[code], `${code} is in RID's list`);
    assert.ok(meta.place.includes("อ." + rid[code].ampur), `${code}: "${meta.place}" names อ.${rid[code].ampur}`);
  }
  assert.equal(rid["P.26B"].ampur, "เมืองกำแพงเพชร");
});

test("every village or subdistrict named for a gauge is in RID's own records for it", () => {
  // A village (บ้าน…) or subdistrict (ต.…) on the page must appear in RID's hourly-table header for the gauge or in RID's
  // station map (fixtures/rid_station_map.json). An earlier version named P.50A's village from memory (บ้านดงส้ม).
  const col = Object.fromEntries(load("rid_station_districts.json").stations.map((s) => [s.code, s]));
  const map = Object.fromEntries(load("rid_station_map.json").stations.map((s) => [s.code, s]));
  for (const [code, meta] of Object.entries(STATIONS)) {
    assert.ok(map[code], `${code} is on RID's station map`);
    const rid = `${col[code].header} ${map[code].detail}`;
    for (const t of `${meta.name} ${meta.place}`.match(/(?:บ้าน|ต\.)[^\s()]+/g) || []) {
      assert.ok(rid.includes(t), `${code}: "${t}" is not in RID's records (${rid})`);
    }
  }
  assert.ok(!`${col["P.50A"].header} ${map["P.50A"].detail}`.includes("บ้านดงส้ม"));
});
