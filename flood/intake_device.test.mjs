import test from "node:test";
import assert from "node:assert/strict";
import { getOrCreateDeviceToken, makeIntakeClient, validIntakeConfig } from "./intake_client.js";

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

test("old schema stays closed until the v2.6 RPC and version 3 config are installed", () => {
  assert.equal(validIntakeConfig({ ...config, schemaVersion: 2 }), false);
  assert.equal(validIntakeConfig(config), true);
});

test("submission sends the device token only with a ready team, and never retries", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const name = url.split("/").at(-1);
    calls.push({ name, payload: JSON.parse(options.body) });
    return { ok: true, json: async () => name === "duty_status"
      ? [{ on_duty: true }] : [{ code: "NAM-TEST", secret: "a".repeat(32) }] };
  };
  const client = makeIntakeClient(config, fetchImpl, () => "a".repeat(48));
  assert.equal((await client.submitCase(item)).code, "NAM-TEST");
  assert.deepEqual(calls.map(call => call.name), ["duty_status", "submit_case"]);
  assert.equal(calls[1].payload.p_device, "a".repeat(48));
  assert.equal(calls[1].payload.p_consent_version, "pdpa-test");

  let tokenCalls = 0;
  const noTeam = makeIntakeClient(config, async () => ({ ok: true, json: async () => [{ on_duty: false }] }),
    () => { tokenCalls++; return "a".repeat(48); });
  await assert.rejects(() => noTeam.submitCase(item), /ไม่มีทีมอาสาเฝ้า/);
  assert.equal(tokenCalls, 0);
});

test("when the device token is unavailable, the SQL no-device limit remains active", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => url.endsWith("duty_status")
      ? [{ on_duty: true }] : [{ code: "NAM-TEST", secret: "b".repeat(32) }] };
  };
  await makeIntakeClient(config, fetchImpl, () => null).submitCase(item);
  assert.equal(Object.hasOwn(calls[1], "p_device"), false);
});
