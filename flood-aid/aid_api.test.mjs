import test from "node:test";
import assert from "node:assert/strict";
import { AidError, validConfig, loadConfig, makeAidApi, deniesFraming } from "./aid_api.js";

const origin = "https://titanth.com";
const good = {
  enabled: true, schemaVersion: 27, termsVersion: "aid-terms-v1-20260927",
  privacyNoticeVersion: "aid-terms-v1-20260927", privacyNoticeUrl: "/flood-aid/privacy/",
  url: "https://example.supabase.co/", publishableKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz"
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test("starts closed unless enabled, same-version notice, and safe public API are present", () => {
  assert.equal(validConfig({ ...good, enabled: false }, origin), false);
  assert.equal(validConfig({ ...good, privacyNoticeVersion: "older" }, origin), false);
  assert.equal(validConfig({ ...good, privacyNoticeUrl: "https://evil.example/notice" }, origin), false);
  assert.equal(validConfig({ ...good, url: "https://evil.example/" }, origin), false);
  assert.equal(validConfig({ ...good, publishableKey: "service_role_secret" }, origin), false);
  assert.equal(validConfig(good, origin), true);
});

test("will not activate if notice is unavailable", async () => {
  const fetcher = async url => url === "./aid-config.json" ? json(good) : new Response("missing", { status: 404 });
  assert.equal(await loadConfig(fetcher, origin), null);
  const fetcher2 = async url => url === "./aid-config.json" ? json(good) : url === "./" ?
    new Response("<html></html>", { headers: { "content-security-policy": "frame-ancestors 'none'" } }) :
    new Response('<meta name="aid-terms-version" content="aid-terms-v1-20260927">', { headers: { "content-type": "text/html" } });
  assert.deepEqual(await loadConfig(fetcher2, origin), good);
});

test("HTTP anti-frame header is required; an HTML meta directive does not count", async () => {
  assert.equal(deniesFraming(new Headers()), false);
  assert.equal(deniesFraming(new Headers({ "content-security-policy-report-only": "frame-ancestors 'none'" })), false);
  assert.equal(deniesFraming(new Headers({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" })), true);
  assert.equal(deniesFraming(new Headers({ "x-frame-options": "DENY" })), true);
  assert.equal(deniesFraming(new Headers({ "x-frame-options": "SAMEORIGIN" })), false);
  const noHeader = async url => url === "./aid-config.json" ? json(good) : url === "./" ?
    new Response('<meta http-equiv="Content-Security-Policy" content="frame-ancestors \'none\'">', { headers: { "content-type": "text/html" } }) :
    new Response('<meta name="aid-terms-version" content="aid-terms-v1-20260927">', { headers: { "content-type": "text/html" } });
  assert.equal(await loadConfig(noHeader, origin), null);
});

test("public board calls only RPC with publishable key and never direct tables", async () => {
  const seen = [];
  const fetcher = async (url, init) => {
    seen.push({ url, init });
    return json(url.endsWith("aid_totals") ? [{ board_open: true }] : []);
  };
  const api = makeAidApi(good, fetcher, memory());
  await api.totals(); await api.boardPublic("เชียงใหม่");
  assert.deepEqual(seen.map(x => new URL(x.url).pathname), ["/rest/v1/rpc/aid_totals", "/rest/v1/rpc/aid_board_public"]);
  assert.ok(seen.every(x => x.init.method === "POST" && x.init.headers.apikey === good.publishableKey && !x.init.headers.Authorization));
  assert.equal(JSON.parse(seen[1].init.body).p_province, "เชียงใหม่");
});

test("signup without session does not report the user signed in", async () => {
  const api = makeAidApi(good, async () => json({ user: { id: "test-user" }, session: null }), memory());
  assert.equal(await api.signUp("sample@example.test", "test-password"), false);
  assert.equal(api.hasSession(), false);
});

test("known Auth failures give a useful Thai action without showing raw server text", async () => {
  const cases = [
    ["weak_password", "WEAK_PASSWORD", "รหัสผ่านไม่ผ่านเกณฑ์"],
    ["user_already_exists", "ACCOUNT_EXISTS", "ลองเข้าสู่ระบบ"],
    ["email_exists", "ACCOUNT_EXISTS", "ลองเข้าสู่ระบบ"],
    ["signup_disabled", "SIGNUP_DISABLED", "ไม่เปิดให้สมัคร"],
    ["validation_failed", "AUTH_INPUT_INVALID", "ตรวจรูปแบบอีเมล"],
    ["captcha_failed", "AUTH_CHECK_FAILED", "ระบบตรวจความปลอดภัยไม่ผ่าน"]
  ];
  for (const [errorCode, expectedCode, guidance] of cases) {
    const api = makeAidApi(good, async () => json({ code: 422, error_code: errorCode, msg: "raw sample@example.test" }, 422), memory());
    await assert.rejects(api.signUp("sample@example.test", "test-password"), error =>
      error instanceof AidError && error.code === expectedCode && error.message.includes(guidance) && !error.message.includes("sample@example.test"));
  }
});

test("auth token remains in session storage and refreshes before protected RPC", async () => {
  const seen = [];
  const store = memory();
  const fetcher = async (url, init) => {
    seen.push({ url, init });
    if (url.includes("grant_type=password")) return json({ access_token: "old", refresh_token: "refresh-old", expires_in: 1 });
    if (url.includes("grant_type=refresh_token")) return json({ access_token: "new", refresh_token: "refresh-new", expires_in: 3600 });
    return json([{ account_code: "A12345" }]);
  };
  const api = makeAidApi(good, fetcher, store);
  await api.signIn("sample@example.test", "test-password");
  await api.me();
  assert.equal(seen.at(-1).init.headers.Authorization, "Bearer new");
  assert.equal(seen.at(-1).url.endsWith("/rest/v1/rpc/aid_me"), true);
  await api.signOut();
  assert.equal(api.hasSession(), false);
});

test("closed board and missing RPC errors remain explicit", async () => {
  const api = makeAidApi(good, async () => json({ message: "AID_CLOSED", hint: "closed" }, 400), memory());
  await assert.rejects(api.boardPublic(null), error => error instanceof AidError && error.code === "AID_CLOSED");
  const missing = makeAidApi(good, async () => json({ code: "PGRST202", message: "Could not find the function" }, 404), memory());
  await assert.rejects(missing.boardPublic(null), error => error instanceof AidError && error.code === "MISSING_API");
});
