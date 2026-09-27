import test from "node:test";
import assert from "node:assert/strict";
import { beginCaseSubmission, stageIntakeAttempt, clearIntakeAttempt, submissionOutcomeForCase, canRetryCaseAttempt } from "./intake_attempt.js";
import { createSubmissionGuard } from "./submission_guard.js";

const payload = { p_province: "กรุงเทพมหานคร", p_secret: "a".repeat(64), p_people: 1 };
const item = { caseId: "sample-local", location: { province: "กรุงเทพมหานคร" } };

test("full attempt is saved and read back before a POST; marker has no secret", async () => {
  const values = new Map();
  const marker = new Map();
  const guard = createSubmissionGuard({ getItem: key => marker.get(key), setItem: (key, value) => marker.set(key, value), removeItem: key => marker.delete(key) });
  values.set(item.caseId, item);
  const store = {
    reserveCaseAttempt: async (id, attempt) => {
      const existing = values.get(id);
      if (existing.intakeAttempt) throw new Error("already reserved");
      values.set(id, { ...existing, intakeAttempt: structuredClone(attempt) });
    },
    getCase: async id => values.get(id),
    clearCaseAttempt: async (id, secret) => {
      const existing = values.get(id);
      if (existing.intakeAttempt?.payload?.p_secret !== secret) return false;
      const { intakeAttempt, ...plain } = existing;
      values.set(id, plain);
      return true;
    }
  };
  const staged = await stageIntakeAttempt(item, payload, { ...store, guard });
  assert.equal(staged.payload.p_secret, payload.p_secret);
  assert.deepEqual(values.get(item.caseId).intakeAttempt.payload, payload);
  assert.deepEqual([...marker.values()], ["uncertain"]);
  assert.doesNotMatch(JSON.stringify([...marker]), /a{64}/);
  await assert.rejects(() => stageIntakeAttempt(item, { ...payload, p_secret: "b".repeat(64) }, { ...store, guard }), /already reserved/);
  assert.equal(await clearIntakeAttempt(values.get(item.caseId), { clearCaseAttempt: store.clearCaseAttempt, guard }), true);
  assert.equal(values.get(item.caseId).intakeAttempt, undefined);
  assert.equal(guard.get(item.caseId), null);
});

test("blocked IndexedDB means no POST even if localStorage is writable", async () => {
  const marker = new Map();
  const guard = createSubmissionGuard({ getItem: key => marker.get(key), setItem: (key, value) => marker.set(key, value), removeItem: key => marker.delete(key) });
  const blockedDb = { reserveCaseAttempt: async () => { throw new Error("quota"); }, getCase: async () => null };
  await assert.rejects(() => stageIntakeAttempt(item, payload, { ...blockedDb, guard }), /หน้านี้จะไม่ส่งซ้ำ/);
  assert.equal(guard.get(item.caseId), null);
  assert.deepEqual([...marker], []);
});

test("cancel before saving the secret never reserves a case or starts POST", async () => {
  const called = [];
  const result = await beginCaseSubmission(item, {
    makeSecret: () => { called.push("secret"); return payload.p_secret; },
    prepare: async () => { called.push("preflight"); return payload; },
    confirmSecret: async () => { called.push("cancel"); return false; },
    stage: async () => { called.push("reserve"); return {}; },
    submit: async () => { called.push("POST"); }
  });
  assert.equal(result, false);
  assert.deepEqual(called, ["secret", "preflight", "cancel"]);
});

test("two tabs sharing one atomic reservation cannot send with two different secrets", async () => {
  let saved = item;
  let posts = 0;
  const reserveCaseAttempt = async (id, attempt) => {
    // IndexedDB readwrite serializes transactions on the same object store.
    if (saved.intakeAttempt) throw new Error("already reserved");
    saved = { ...saved, intakeAttempt: structuredClone(attempt) };
  };
  const getCase = async () => saved;
  const guard = createSubmissionGuard({ getItem: () => null, setItem: () => {} });
  const run = secret => beginCaseSubmission(item, {
    makeSecret: () => secret,
    prepare: async () => ({ ...payload, p_secret: secret }),
    confirmSecret: async () => true,
    stage: (source, prepared) => stageIntakeAttempt(source, prepared, { reserveCaseAttempt, getCase, guard }),
    submit: async () => { posts++; }
  });
  const outcomes = await Promise.allSettled([run("a".repeat(64)), run("b".repeat(64))]);
  assert.deepEqual(outcomes.map(result => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(posts, 1);
  assert.ok(["a".repeat(64), "b".repeat(64)].includes(saved.intakeAttempt.payload.p_secret));
});

test("reserved but failed readback sends nothing and retains the same secret for reload recovery", async () => {
  let saved = item;
  let posts = 0;
  const guard = createSubmissionGuard({ getItem: () => null, setItem: () => {} });
  await assert.rejects(() => beginCaseSubmission(item, {
    makeSecret: () => payload.p_secret,
    prepare: async () => payload,
    confirmSecret: async () => true,
    stage: (source, prepared) => stageIntakeAttempt(source, prepared, {
      reserveCaseAttempt: async (_, attempt) => { saved = { ...saved, intakeAttempt: attempt }; },
      getCase: async () => { throw new Error("readback blocked"); }, guard
    }),
    submit: async () => { posts++; }
  }), error => error.reserved === true && /ยังยืนยันไม่ได้/.test(error.message));
  assert.equal(posts, 0);
  assert.deepEqual(saved.intakeAttempt.payload, payload);
  const reloaded = structuredClone(saved);
  assert.equal(reloaded.intakeAttempt.payload.p_secret, payload.p_secret);
});

test("another tab changing or deleting the case during readback cannot confirm this attempt", async () => {
  const guard = createSubmissionGuard({ getItem: () => null, setItem: () => {} });
  for (const readback of [null, { ...item, intakeAttempt: { payload: { ...payload, p_people: 2 } } }]) {
    await assert.rejects(() => stageIntakeAttempt(item, payload, {
      reserveCaseAttempt: async () => {}, getCase: async () => readback, guard
    }), error => error.reserved === true && /สถานะเคสเปลี่ยน/.test(error.message));
  }
  assert.equal(guard.get(item.caseId), null);
});

test("a closed secret stays terminal after reload even if localStorage is blocked", () => {
  const blockedGuard = createSubmissionGuard({ getItem: () => { throw new Error("blocked"); } });
  const closed = { ...item, intakeAttempt: { payload, closedReason: "SECRET_CLOSED" } };
  assert.equal(submissionOutcomeForCase(closed, blockedGuard), "closed");
  assert.equal(submissionOutcomeForCase({ ...item, intakeAttempt: { payload } }, blockedGuard), "uncertain");
  assert.equal(submissionOutcomeForCase({ ...closed, intake: { code: "NAM-TEST" } }, blockedGuard), null);
});

test("a stale retry button cannot POST after another tab closes the same secret", () => {
  const oldCard = { ...item, intakeAttempt: { payload } };
  const closedRow = { ...item, intakeAttempt: { payload, closedReason: "SECRET_CLOSED" } };
  const openGuard = createSubmissionGuard({ getItem: () => null });
  assert.equal(canRetryCaseAttempt(oldCard, closedRow, openGuard), false);
  assert.equal(canRetryCaseAttempt(oldCard, oldCard, openGuard), true);
  const closedGuard = createSubmissionGuard({ getItem: () => null });
  closedGuard.mark(item.caseId, "closed");
  assert.equal(canRetryCaseAttempt(oldCard, oldCard, closedGuard), false);
});
