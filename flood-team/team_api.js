// พร้อมแจ้งน้ำท่วม · team page · talks to Supabase Auth (/auth/v1) and the Data API (/rest/v1) with fetch only.
// The publishable key is public by design; the signed-in user's access token decides what the database allows.
// A secret key or service-role key must never be put in this page or its config.

const SESSION_KEY = "promjaeng-team-session";

export const CASE_COLUMNS = "id,code,created_at,status,status_at,team_id,province,district,subdistrict,landmark," +
  "lat,lon,accuracy_m,people,needs,details,outcome,closed_at,personal_data_purged";

const THAI_ERRORS = Object.freeze({
  NOT_A_MEMBER: "บัญชีนี้ยังไม่อยู่ในทีม",
  ALREADY_TAKEN_OR_MISSING: "เคสนี้มีทีมอื่นรับไปแล้ว หรือไม่อยู่ในจังหวัดที่ทีมคุณดูแล",
  NOT_YOUR_TEAM_CASE: "เคสนี้ไม่ใช่เคสของทีมคุณ",
  BAD_TRANSITION: "เปลี่ยนสถานะแบบนี้ไม่ได้ ลองอัปเดตหน้าแล้วดูสถานะล่าสุด",
  OUTCOME_REQUIRED: "ต้องเขียนผลการช่วยก่อนปิดเคส",
  REASON_REQUIRED: "ต้องเขียนเหตุผลก่อนคืนเคส",
  COORDINATOR_ONLY: "ทำได้เฉพาะผู้ประสานงานทีม",
  HOURS_0_TO_24: "ชั่วโมงเฝ้าต้องอยู่ระหว่าง 0 ถึง 24",
  BAD_ACCOUNT_CODE: "รหัสบัญชีต้องมี 10 ตัว (ตัวเลข 0-9 และตัวอักษร A-F)",
  ACCOUNT_NOT_FOUND: "ไม่พบบัญชีนี้ ให้เจ้าของบัญชีเข้าสู่ระบบหน้านี้ก่อน แล้วอ่านรหัสให้ใหม่",
  ALREADY_IN_A_TEAM: "บัญชีนี้อยู่ในทีมแล้ว",
  NAME_REQUIRED: "ต้องใส่ชื่อที่ใช้ในทีม",
  CANNOT_REMOVE_SELF: "เอาตัวเองออกจากทีมไม่ได้",
  NOT_IN_YOUR_TEAM: "บัญชีนี้ไม่ได้อยู่ในทีมคุณ"
});

const THAI_AUTH_ERRORS = Object.freeze({
  invalid_credentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  invalid_grant: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  user_already_exists: "อีเมลนี้มีบัญชีแล้ว ให้กด \"เข้าสู่ระบบ\"",
  email_exists: "อีเมลนี้มีบัญชีแล้ว ให้กด \"เข้าสู่ระบบ\"",
  weak_password: "รหัสผ่านสั้นหรือเดาง่ายเกินไป ใช้อย่างน้อย 8 ตัว",
  email_not_confirmed: "ระบบยังตั้งให้ยืนยันอีเมลก่อน แจ้งเจ้าของระบบให้ปิดการยืนยันอีเมล",
  signup_disabled: "ระบบปิดการสร้างบัญชีใหม่อยู่ แจ้งเจ้าของระบบ",
  over_request_rate_limit: "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่",
  validation_failed: "อีเมลหรือรหัสผ่านไม่ถูกรูปแบบ"
});

// A paused free project or an outage answers 5xx; tell people what to do instead of a bare code.
const SERVER_DOWN = "ระบบหลังบ้านไม่ตอบ ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ประสานงานหรือเจ้าของระบบ และส่งต่อ 1784 / 1669 ระหว่างนี้";

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validTeamConfig(value, pageOrigin = globalThis.location?.origin) {
  if (!value || typeof value.url !== "string" || typeof value.publishableKey !== "string") return false;
  if (!value.publishableKey.startsWith("sb_publishable_") || value.publishableKey.length > 200) return false;
  let url;
  try { url = new URL(value.url); } catch { return false; }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return false;
  if (url.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) return true;
  // Local testing only: the emulator serves this page and the API from one loopback origin.
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  return url.protocol === "http:" && loopback && url.origin === pageOrigin;
}

export async function loadTeamConfig(fetchImpl = globalThis.fetch.bind(globalThis)) {
  try {
    const response = await fetchImpl("./team-config.json", { cache: "no-store", credentials: "omit" });
    if (!response.ok) return null;
    const config = await response.json();
    return validTeamConfig(config) ? config : null;
  } catch { return null; }
}

export function accountCodeOf(userId) {
  return String(userId ?? "").replace(/-/g, "").slice(0, 10).toUpperCase();
}

export function formatAccountCode(code) {
  const clean = String(code ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return clean.length === 10 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    return saved && saved.access_token && saved.refresh_token ? saved : null;
  } catch { return null; }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* private mode: the session lasts for this page only */ }
}

function authError(status, body) {
  const key = String(body?.error_code || body?.error || body?.code || "");
  const known = THAI_AUTH_ERRORS[key];
  if (known) return new ApiError(key, known, status);
  if (status === 429) return new ApiError("rate_limited", THAI_AUTH_ERRORS.over_request_rate_limit, status);
  if (status >= 500) return new ApiError("server_down", SERVER_DOWN, status);
  return new ApiError(key || "auth_error", `เข้าสู่ระบบไม่สำเร็จ (${status})`, status);
}

function restError(status, body) {
  const message = String(body?.message ?? "");
  const key = message.split(/\s/)[0];
  if (THAI_ERRORS[key]) return new ApiError(key, THAI_ERRORS[key], status);
  if (status === 429) return new ApiError("rate_limited", THAI_AUTH_ERRORS.over_request_rate_limit, status);
  if (status >= 500) return new ApiError("server_down", SERVER_DOWN, status);
  if (status === 401 || status === 403 || body?.code === "42501") {
    return new ApiError("forbidden", "ไม่มีสิทธิ์ทำรายการนี้ ลองออกจากระบบแล้วเข้าใหม่", status);
  }
  return new ApiError(key || "error", `ระบบตอบกลับผิดพลาด (${status})`, status);
}

export function makeTeamApi(config, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const base = config.url.replace(/\/$/, "");
  let session = loadSession();
  let refreshing = null;

  async function auth(path, body, accessToken) {
    const headers = { apikey: config.publishableKey, "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetchImpl(`${base}/auth/v1/${path}`, {
      method: "POST", headers, body: JSON.stringify(body ?? {}),
      credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    });
    const text = await response.text();
    let data = {};
    if (text) { try { data = JSON.parse(text); } catch { data = {}; } }
    if (!response.ok) throw authError(response.status, data);
    return data;
  }

  function keep(data) {
    if (!data?.access_token || !data?.refresh_token) {
      throw new ApiError("NO_SESSION", THAI_AUTH_ERRORS.email_not_confirmed, 0);
    }
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600) * 1000,
      user: { id: data.user?.id ?? null, email: data.user?.email ?? null }
    };
    saveSession(session);
    return session;
  }

  async function refresh() {
    if (!session) throw new ApiError("SIGNED_OUT", "กรุณาเข้าสู่ระบบ", 401);
    // One refresh at a time: parallel requests wait for the same new token.
    refreshing ??= auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      .then(keep)
      .catch(error => {
        if (error.status === 400 || error.status === 401 || error.status === 403) { session = null; saveSession(null); }
        throw error;
      })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  async function data(path, init = {}, retried = false) {
    if (!session) throw new ApiError("SIGNED_OUT", "กรุณาเข้าสู่ระบบ", 401);
    if (session.expires_at - Date.now() < 60_000) await refresh();
    const headers = { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}`, Accept: "application/json" };
    if (init.body) headers["Content-Type"] = "application/json";
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      ...init, headers, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    });
    if (response.status === 401 && !retried) {
      await refresh();
      return data(path, init, true);
    }
    const text = await response.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch { body = null; } }
    if (!response.ok) throw restError(response.status, body);
    return body;
  }

  const rpc = (name, args = {}) => data(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
  const one = rows => (Array.isArray(rows) ? rows[0] ?? null : rows ?? null);
  const eq = value => `eq.${encodeURIComponent(value)}`;

  return {
    session: () => session,
    signUp: async (email, password) => keep(await auth("signup", { email, password })),
    signIn: async (email, password) => keep(await auth("token?grant_type=password", { email, password })),
    async signOut() {
      const old = session;
      session = null;
      saveSession(null);
      // scope=local signs out this device only; the default (global) would sign the person out everywhere.
      if (old) { try { await auth("logout?scope=local", {}, old.access_token); } catch { /* signed out locally anyway */ } }
    },
    myAccount: async () => one(await rpc("my_account")),
    team: async () => one(await data("teams?select=id,name,on_duty_until,last_seen_at")),
    areas: async () => (await data("team_areas?select=province&order=province")) ?? [],
    members: async () => (await data("team_members?select=user_id,display_name,role,created_at&order=created_at")) ?? [],
    cases: async () => (await data(`cases?select=${CASE_COLUMNS}&order=created_at.desc&limit=300`)) ?? [],
    events: async caseId => (await data(`case_events?select=at,actor_name,type,note&case_id=${eq(caseId)}&order=at.asc`)) ?? [],
    claim: async caseId => one(await rpc("claim_case", { p_case: caseId }))?.contact_phone ?? null,
    contact: async caseId => one(await rpc("case_contact", { p_case: caseId }))?.contact_phone ?? null,
    setStatus: (caseId, status, note = null) => rpc("set_case_status", { p_case: caseId, p_status: status, p_outcome: note }),
    release: (caseId, reason) => rpc("release_case", { p_case: caseId, p_reason: reason }),
    setDuty: hours => rpc("set_duty", { p_hours: hours }),
    heartbeat: () => rpc("team_heartbeat"),
    addMember: (code, name) => rpc("add_member", { p_account_code: code, p_display_name: name }),
    removeMember: code => rpc("remove_member", { p_account_code: code })
  };
}
