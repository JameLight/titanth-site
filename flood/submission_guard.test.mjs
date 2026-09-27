import test from "node:test";
import assert from "node:assert/strict";
import { createSubmissionGuard } from "./submission_guard.js";

test("a confirmed or uncertain POST stays locked after rerender and reload", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const firstPage = createSubmissionGuard(storage);
  assert.equal(firstPage.mark("case-one", "confirmed"), true);
  assert.equal(firstPage.mark("case-two", "uncertain"), true);
  assert.equal(firstPage.mark("case-three", "closed"), true);
  assert.equal(firstPage.get("case-one"), "confirmed");
  assert.equal(createSubmissionGuard(storage).get("case-one"), "confirmed");
  assert.equal(createSubmissionGuard(storage).get("case-two"), "uncertain");
  assert.equal(createSubmissionGuard(storage).get("case-three"), "closed");
  assert.deepEqual([...values.values()].sort(), ["closed", "confirmed", "uncertain"]);
  firstPage.clear("case-one");
  assert.equal(createSubmissionGuard(storage).get("case-one"), null);
});

test("storage failure keeps the current page locked without saving case details", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const guard = createSubmissionGuard(blocked);
  assert.equal(guard.mark("case-one", "confirmed"), false);
  assert.equal(guard.get("case-one"), "confirmed");
  assert.equal(createSubmissionGuard(blocked).get("case-one"), null);
  assert.throws(() => guard.mark("case-two", "invalid"), /สถานะ/);
});
