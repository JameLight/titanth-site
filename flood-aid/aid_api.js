// Candidate v2.7 r6 client. No direct table reads, service keys, analytics, or persistent case data.
const SESSION_KEY = "promjaeng-aid-session-v1";
const THAI_ERROR = Object.freeze({
  SIGNED_OUT: "กรุณาเข้าสู่ระบบใหม่",
  AID_CLOSED: "เจ้าของระบบปิดกระดานชั่วคราว หากอันตราย โทร 1784 หรือ 1669",
  ACCOUNT_SUSPENDED: "บัญชีนี้ถูกระงับ หากอันตราย โทร 1784 หรือ 1669",
  PROFILE_REQUIRED: "ตั้งชื่อและยอมรับข้อตกลงฉบับปัจจุบันก่อน",
  TERMS_OUTDATED: "ข้อตกลงมีรุ่นใหม่ โหลดหน้าใหม่และอ่านอีกครั้ง",
  POST_NOT_FOUND: "ไม่พบโพสต์นี้",
  POST_HIDDEN: "โพสต์นี้ถูกซ่อนแล้ว",
  POST_NOT_OPEN: "โพสต์นี้ปิดหรือหมดอายุแล้ว",
  NOT_YOUR_THREAD: "ห้องคุยนี้ไม่ใช่ของคุณ",
  NOT_SHARED_YET: "เจ้าของโพสต์ยังไม่ได้เปิดรายละเอียดให้คุณ",
  NOT_YOUR_OPEN_POST: "โพสต์นี้ปิดแล้วหรือไม่ใช่ของคุณ",
  OWN_POST: "คุยกับโพสต์ของตัวเองไม่ได้",
  TOO_MANY_POSTS: "โพสต์บ่อยเกินไป รอหรือปิดโพสต์เดิม",
  TOO_MANY_THREADS: "เริ่มห้องคุยใหม่บ่อยเกินไป รอสักครู่",
  TOO_MANY_MESSAGES: "ส่งข้อความบ่อยเกินไป รอสักครู่",
  TOO_MANY_REPORTS: "รายงานบ่อยเกินไป รอสักครู่",
  NO_CONTACT_IN_PUBLIC_TEXT: "คำอธิบายและอำเภอห้ามใส่เบอร์ ลิงก์ หรือไอดี",
  NO_ADDRESS_IN_PUBLIC_TEXT: "คำอธิบายและอำเภอห้ามใส่ที่อยู่",
  BAD_DISTRICT: "อำเภอหรือเขตใส่แค่ชื่อ ไม่ใส่ตัวเลข",
  SUMMARY_TOO_SHORT: "คำอธิบายต้องมีอย่างน้อย 5 ตัวอักษร",
  SUMMARY_TOO_LONG: "คำอธิบายยาวเกิน 160 ตัวอักษร",
  INVALID_INPUT: "ตรวจข้อมูลที่กรอกแล้วลองใหม่"
});
const AUTH_ERROR = Object.freeze({
  weak_password: ["WEAK_PASSWORD", "รหัสผ่านไม่ผ่านเกณฑ์ความปลอดภัย ลองตั้งให้ยาวและคาดเดายากขึ้น"],
  user_already_exists: ["ACCOUNT_EXISTS", "อีเมลนี้อาจมีบัญชีแล้ว ลองเข้าสู่ระบบ"],
  email_exists: ["ACCOUNT_EXISTS", "อีเมลนี้อาจมีบัญชีแล้ว ลองเข้าสู่ระบบ"],
  signup_disabled: ["SIGNUP_DISABLED", "ตอนนี้ระบบไม่เปิดให้สมัครบัญชีใหม่ หากอันตราย โทร 1784 หรือ 1669"],
  validation_failed: ["AUTH_INPUT_INVALID", "ตรวจรูปแบบอีเมลและรหัสผ่าน แล้วลองใหม่"],
  captcha_failed: ["AUTH_CHECK_FAILED", "ระบบตรวจความปลอดภัยไม่ผ่าน กรุณาลองใหม่ภายหลัง หากอันตราย โทร 1784 หรือ 1669"]
});

export class AidError extends Error {
  constructor(code, message, status = 0) { super(message); this.name = "AidError"; this.code = code; this.status = status; }
}

export function validConfig(value, origin = globalThis.location?.origin) {
  if (!value || value.enabled !== true || value.schemaVersion !== 27) return false;
  if (value.termsVersion !== "aid-terms-v1-20260927" || value.privacyNoticeVersion !== value.termsVersion) return false;
  if (typeof value.publishableKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]{10,180}$/.test(value.publishableKey)) return false;
  let api, notice;
  try { api = new URL(value.url); notice = new URL(value.privacyNoticeUrl, origin); } catch { return false; }
  if (api.username || api.password || api.search || api.hash || api.pathname !== "/") return false;
  if (notice.origin !== origin || notice.pathname !== "/flood-aid/privacy/" || notice.search || notice.hash) return false;
  const production = api.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(api.hostname);
  const testing = api.protocol === "http:" && ["localhost", "127.0.0.1"].includes(api.hostname) && api.origin === origin;
  return production || testing;
}

export function deniesFraming(headers) {
  const xfo = String(headers?.get("x-frame-options") ?? "").trim().toUpperCase();
  if (xfo === "DENY") return true;
  const csp = String(headers?.get("content-security-policy") ?? "");
  return csp.split(";").some(directive => /^frame-ancestors\s+'none'$/i.test(directive.trim()));
}

export async function loadConfig(fetchImpl = globalThis.fetch.bind(globalThis), origin = globalThis.location?.origin) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl("./aid-config.json", { cache: "no-store", credentials: "omit", signal: controller.signal });
    if (!response.ok) return null;
    const value = await response.json();
    if (!validConfig(value, origin)) return null;
    const notice = await fetchImpl(value.privacyNoticeUrl, { cache: "no-store", credentials: "omit", signal: controller.signal });
    if (!notice.ok || !String(notice.headers.get("content-type") ?? "").includes("text/html")) return null;
    const noticeText = await notice.text();
    if (!noticeText.includes('<meta name="aid-terms-version" content="aid-terms-v1-20260927">')) return null;
    // GitHub Pages currently sends neither header. A meta CSP frame-ancestors is ignored by browsers.
    // Keep the board closed even if someone accidentally flips the JSON config before hosting is secured.
    const page = await fetchImpl("./", { cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
    if (!page.ok || !deniesFraming(page.headers)) return null;
    return value;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

function readSession(storage) {
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY));
    return value?.access_token && value?.refresh_token && Number.isFinite(value.expires_at) ? value : null;
  } catch { return null; }
}

function responseError(status, body, auth = false) {
  const raw = String(body?.message ?? body?.error_code ?? body?.error ?? "");
  const code = raw.split(/[^A-Z_]/)[0] || String(body?.error_code ?? "REQUEST_FAILED");
  if (THAI_ERROR[code]) return new AidError(code, THAI_ERROR[code], status);
  if (status === 429) return new AidError("RATE_LIMIT", "คำขอถี่เกินไป รอสักครู่", status);
  if (status >= 500) return new AidError("SERVER_DOWN", "ระบบหลังบ้านไม่ตอบ หากอันตราย โทร 1784 หรือ 1669", status);
  if (auth && ["invalid_credentials", "invalid_grant"].includes(body?.error_code)) return new AidError("BAD_LOGIN", "อีเมลหรือรหัสผ่านไม่ถูกต้อง", status);
  if (auth && body?.error_code === "email_not_confirmed") return new AidError("EMAIL_NOT_CONFIRMED", "โปรดยืนยันอีเมลก่อนเข้าสู่ระบบ", status);
  const authCode = String(body?.error_code ?? "").toLowerCase();
  const knownAuth = auth && Object.hasOwn(AUTH_ERROR, authCode) ? AUTH_ERROR[authCode] : null;
  if (knownAuth) return new AidError(knownAuth[0], knownAuth[1], status);
  if (status === 401 || status === 403) return new AidError("NO_PERMISSION", "ไม่มีสิทธิ์ทำรายการนี้ เข้าสู่ระบบใหม่", status);
  if (status === 404) return new AidError("MISSING_API", "ระบบกระดานยังไม่พร้อม กรุณาใช้ช่องทางโทร", status);
  return new AidError(code, "ทำรายการไม่สำเร็จ ตรวจข้อมูลแล้วลองใหม่", status);
}

export function makeAidApi(config, fetchImpl = globalThis.fetch.bind(globalThis), storage = globalThis.sessionStorage) {
  const base = config.url.replace(/\/$/, "");
  let session = readSession(storage);
  let refreshing = null;
  function save(value) { session = value; try { if (value) storage.setItem(SESSION_KEY, JSON.stringify(value)); else storage.removeItem(SESSION_KEY); } catch { /* only current page */ } }
  async function send(path, body, token = null, auth = false) {
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      response = await fetchImpl(`${base}/${path}`, {
        method: "POST", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: { apikey: config.publishableKey, "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body ?? {})
      });
    } catch { throw new AidError("OFFLINE", "ต่อระบบไม่ได้ หากอันตราย โทร 1784 หรือ 1669"); }
    finally { clearTimeout(timeout); }
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* server may return non-JSON error */ }
    if (!response.ok) throw responseError(response.status, data, auth);
    return data;
  }
  function keep(data) {
    if (!data?.access_token || !data?.refresh_token) return false;
    save({
      access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: Date.now() + Math.max(1, Number(data.expires_in) || 3600) * 1000
    });
    return true;
  }
  async function refresh() {
    if (!session) throw new AidError("SIGNED_OUT", THAI_ERROR.SIGNED_OUT, 401);
    refreshing ??= send("auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token }, null, true)
      .then(data => { if (!keep(data)) throw new AidError("SIGNED_OUT", THAI_ERROR.SIGNED_OUT, 401); })
      .catch(error => { if ([400, 401, 403].includes(error.status)) save(null); throw error; })
      .finally(() => { refreshing = null; });
    return refreshing;
  }
  async function rpc(name, args = {}, requiresAuth = true) {
    if (requiresAuth && !session) throw new AidError("SIGNED_OUT", THAI_ERROR.SIGNED_OUT, 401);
    if (requiresAuth && session.expires_at - Date.now() < 60_000) await refresh();
    try { return await send(`rest/v1/rpc/${name}`, args, requiresAuth ? session.access_token : null); }
    catch (error) {
      if (requiresAuth && error.status === 401 && session) {
        await refresh();
        return send(`rest/v1/rpc/${name}`, args, session.access_token);
      }
      throw error;
    }
  }
  return {
    hasSession: () => !!session,
    signUp: async (email, password) => keep(await send("auth/v1/signup", { email, password }, null, true)),
    signIn: async (email, password) => keep(await send("auth/v1/token?grant_type=password", { email, password }, null, true)),
    signOut: async () => {
      const token = session?.access_token;
      save(null);
      if (token) { try { await send("auth/v1/logout?scope=local", {}, token, true); } catch { /* local sign out remains */ } }
    },
    totals: () => rpc("aid_totals", {}, false),
    boardPublic: province => rpc("aid_board_public", { p_province: province || null }, false),
    board: province => rpc("aid_board", { p_province: province || null }),
    me: () => rpc("aid_me"),
    setProfile: (name, version) => rpc("aid_set_profile", { p_display_name: name, p_terms_version: version }),
    post: fields => rpc("aid_post", fields),
    myPosts: () => rpc("aid_my_posts"),
    close: id => rpc("aid_close", { p_post: id }),
    renew: id => rpc("aid_renew", { p_post: id }),
    respond: (id, message) => rpc("aid_respond", { p_post: id, p_message: message }),
    threads: () => rpc("aid_threads"),
    messages: (id, after = 0) => rpc("aid_messages", { p_thread: id, p_after: after }),
    sendMessage: (id, body) => rpc("aid_send", { p_thread: id, p_body: body }),
    share: id => rpc("aid_share_details", { p_thread: id }),
    details: id => rpc("aid_details", { p_thread: id }),
    report: (post, thread, reason) => rpc("aid_report", { p_post: post, p_thread: thread, p_reason: reason })
  };
}
