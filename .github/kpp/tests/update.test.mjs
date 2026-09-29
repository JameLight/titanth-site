// Tests for the Kamphaeng Phet updater, using trimmed copies of real official responses.
// Run: node --test .github/kpp/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseColModel, parseRidDay, buildRiver, parseCB, parseTMD, ridDate, isoThai, toThaiIso } from "../update.mjs";

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (f) => JSON.parse(readFileSync(path.join(FX, f), "utf8"));
const col = parseColModel(load("rid_colmodel.json"));
const day28 = Date.parse("2026-09-28T12:00:00+07:00");
const day29 = Date.parse("2026-09-29T12:00:00+07:00");

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
  assert.equal(r.stations["P.50A"], undefined, "stations without a meta entry are left out");
  // RID's own classes at 09:00 were: P.7A green, P.26B yellow, P.47A yellow, P.78 red
  const cls = (id) => { const s = r.stations[id], v = s.s.at(-1); return v > s.bank ? "crit" : v >= s.watch ? "watch" : "ok"; };
  assert.equal(cls("P.7A"), "ok");
  assert.equal(cls("P.26B"), "watch");
  assert.equal(cls("P.47A"), "watch");
  assert.equal(cls("P.78"), "crit");
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

test("TMD forecast: Kamphaeng Phet days sorted by date", () => {
  const f = parseTMD(load("tmd_sample.json"));
  assert.equal(f.days[0].date, "2026-09-29");
  assert.equal(f.days[0].rain_pct, 60);
  assert.equal(f.days[0].desc, "ฝนฟ้าคะนอง");
  assert.ok(f.days.length >= 2);
});
