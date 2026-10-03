import test from "node:test";
import assert from "node:assert/strict";
import { conversationControls, postPayload, postStatusLabel } from "./aid_view.js";

test("three reports warn but do not stop the poster sharing or sending", () => {
  const row = { post_status: "reported", reports: 3, i_am_poster: true, shared_at: null };
  assert.deepEqual(conversationControls(row), { message: true, share: true, view: false });
  assert.match(postStatusLabel(row.post_status), /ยังเปิดอยู่/);
});

test("a responder can still message and view shared details after reports", () => {
  const row = { post_status: "reported", reports: 3, i_am_poster: false, shared_at: "2026-09-27T00:00:00Z" };
  assert.deepEqual(conversationControls(row), { message: true, share: false, view: true });
});

test("closed and expired posts stop new messages and private details", () => {
  for (const post_status of ["closed", "expired", "hidden", null]) {
    assert.deepEqual(conversationControls({ post_status, i_am_poster: false, shared_at: "2026-09-27T00:00:00Z" }),
      { message: false, share: false, view: false });
  }
});

test("web post payload never sets the sensitive marker even if extra input is supplied", () => {
  const payload = postPayload({
    kind: "request", province: "เชียงใหม่", district: "เมือง", categories: ["food_water"],
    people: "2", summary: "ขอน้ำดื่ม", place: "", phone: "", vulnerable: true, health_consent: true
  });
  assert.equal(payload.p_vulnerable, false);
  assert.equal(payload.p_people, 2);
  assert.equal("health_consent" in payload, false);
});
