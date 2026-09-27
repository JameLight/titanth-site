import test from "node:test";
import assert from "node:assert/strict";
import { caseStatusText, getOrCreateDeviceToken, makeIntakeClient, validIntakeConfig } from "./intake_client.js";

const config = {
  enabled: true, schemaVersion: 3, url: "https://sample.supabase.co/",
  publishableKey: "sb_publishable_test", consentVersion: "pdpa-test",
  privacyNoticeUrl: "/flood/privacy/"
};
const item = {
  location: { province: "กรุงเทพมหานคร", district: "เขตตัวอย่าง", landmark: "สถานที่สมมติ" },
  needs: ["food_water"], peopleCount: 1, details: "ข้อมูลสมมติ", contactPhone: ""
};

test("browser token is random, stable, and never generated without persistent storage", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let generated = 0;
  const cryptoImpl = { getRandomValues: bytes => { generated++; bytes.forEach((_, i) => { bytes[i] = i + 1; }); return bytes; } };
  const first = getOrCreateDeviceToken(storage, cryptoImpl);
  assert.match(first, /^[a-f0-9]{48}$/);
  assert.equal(getOrCreateDeviceToken(storage, cryptoImpl), first);
  assert.equal(generated, 1);
  assert.equal(getOrCreateDeviceToken({ getItem: () => { throw new Error("storage off"); } }, cryptoImpl), null);
  assert.equal(getOrCreateDeviceToken({ getItem: () => null, setItem: () => { throw new Error("storage off"); } }, cryptoImpl), null);
  assert.equal(getOrCreateDeviceToken(storage, null), first);
});

test("old schema stays closed until version 3 config is installed", () => {
  assert.equal(validIntakeConfig({ ...config, schemaVersion: 2 }), false);
  assert.equal(validIntakeConfig(config), true);
});

test("submission sends the device token only with a ready team, and never retries", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const name = url.split("/").at(-1);
    calls.push({ name, payload: JSON.parse(options.body) });
    return { ok: true, json: async () => name === "system_totals" ? [{ intake_open: true, duty_locked: false }]
      : name === "duty_status" ? [{ on_duty: true }] : [{ code: "NAM-TEST", secret: "a".repeat(32) }] };
  };
  const client = makeIntakeClient(config, fetchImpl, () => "a".repeat(48));
  assert.equal((await client.submitCase(item)).code, "NAM-TEST");
  assert.deepEqual(calls.map(call => call.name), ["system_totals", "duty_status", "submit_case"]);
  assert.equal(calls[2].payload.p_device, "a".repeat(48));
  assert.equal(calls[2].payload.p_consent_version, "pdpa-test");

  let tokenCalls = 0;
  const noTeam = makeIntakeClient(config, async url => ({ ok: true, json: async () => url.endsWith("system_totals")
    ? [{ intake_open: true, duty_locked: false }] : [{ on_duty: false }] }),
    () => { tokenCalls++; return "a".repeat(48); });
  await assert.rejects(() => noTeam.submitCase(item), /ไม่มีทีมอาสาเฝ้า/);
  assert.equal(tokenCalls, 0);
});

test("when the device token is unavailable, the SQL no-device limit remains active", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => url.endsWith("system_totals") ? [{ intake_open: true, duty_locked: false }]
      : url.endsWith("duty_status") ? [{ on_duty: true }] : [{ code: "NAM-TEST", secret: "b".repeat(32) }] };
  };
  await makeIntakeClient(config, fetchImpl, () => null).submitCase(item);
  assert.equal(Object.hasOwn(calls[2], "p_device"), false);
});

test("v2.6 intake closure tells the reporter to use a real emergency channel", async () => {
  const fetchImpl = async url => url.endsWith("system_totals")
    ? { ok: true, json: async () => [{ intake_open: true, duty_locked: false }] }
    : url.endsWith("duty_status") ? { ok: true, json: async () => [{ on_duty: true }] }
    : { ok: false, status: 400, json: async () => ({ message: "INTAKE_CLOSED" }) };
  await assert.rejects(() => makeIntakeClient(config, fetchImpl, () => "a".repeat(48)).submitCase(item), /ไม่เปิดรับเคส.*1784/);
});

test("v2.3 or closed backend never receives a case payload despite a v3 config", async () => {
  const calls = [];
  const oldBackend = async url => { calls.push(url.split("/").at(-1)); return { ok: false, status: 404, json: async () => ({ code: "PGRST202" }) }; };
  await assert.rejects(() => makeIntakeClient(config, oldBackend).submitCase(item), /ยังยืนยันไม่ได้.*1784/);
  assert.deepEqual(calls, ["system_totals"]);

  calls.length = 0;
  const closedBackend = async url => { const name = url.split("/").at(-1); calls.push(name);
    return { ok: true, json: async () => [{ intake_open: false, duty_locked: true }] }; };
  await assert.rejects(() => makeIntakeClient(config, closedBackend).submitCase(item), /ยังไม่เปิดรับเคส.*1784/);
  assert.deepEqual(calls, ["system_totals"]);
});

test("unrecognized server errors still point to an emergency channel", async () => {
  const fetchImpl = async url => url.endsWith("system_totals")
    ? { ok: true, json: async () => [{ intake_open: true, duty_locked: false }] }
    : { ok: false, status: 403, json: async () => ({ message: "UNEXPECTED" }) };
  await assert.rejects(() => makeIntakeClient(config, fetchImpl).submitCase(item), /403.*1784/);
});

test("network and malformed JSON responses point to an emergency channel", async () => {
  const ready = { ok: true, json: async () => [{ intake_open: true, duty_locked: false }] };
  const offline = async url => { if (url.endsWith("system_totals")) return ready; throw new TypeError("offline"); };
  await assert.rejects(() => makeIntakeClient(config, offline).submitCase(item), /ติดต่อระบบ.*1784/);
  const badJson = async url => url.endsWith("system_totals") ? ready
    : { ok: true, json: async () => { throw new SyntaxError("bad JSON"); } };
  await assert.rejects(() => makeIntakeClient(config, badJson).submitCase(item), /อ่านคำตอบ.*1784/);
});

test("stalled claimed cases display a call-now warning without changing the actual status", () => {
  assert.match(caseStatusText({ status: "ACKNOWLEDGED", stale: true }), /ไม่มีการอัปเดต.*1784/);
  assert.match(caseStatusText({ status: "NEED_INFO", stale: true }), /ไม่มีการอัปเดต.*1784/);
  assert.match(caseStatusText({ status: "EN_ROUTE", stale: true }), /ไม่มีการอัปเดต.*1784/);
  assert.doesNotMatch(caseStatusText({ status: "ACKNOWLEDGED", stale: false }), /ไม่มีการอัปเดต/);
  assert.doesNotMatch(caseStatusText({ status: "RESOLVED", stale: true }), /ไม่มีการอัปเดต/);
});
