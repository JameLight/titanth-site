import test from "node:test";
import assert from "node:assert/strict";
import { conversationControls, postStatusLabel } from "./aid_view.js";

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
