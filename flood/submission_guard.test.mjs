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
  firstPage.mark("case-one", "confirmed");
  firstPage.mark("case-two", "uncertain");
  assert.equal(firstPage.get("case-one"), "confirmed");
  assert.equal(createSubmissionGuard(storage).get("case-one"), "confirmed");
  assert.equal(createSubmissionGuard(storage).get("case-two"), "uncertain");
  assert.deepEqual([...values.values()].sort(), ["confirmed", "uncertain"]);
  firstPage.clear("case-one");
  assert.equal(createSubmissionGuard(storage).get("case-one"), null);
});

test("storage failure keeps the current page locked without saving case details", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const guard = createSubmissionGuard(blocked);
  guard.mark("case-one", "confirmed");
  assert.equal(guard.get("case-one"), "confirmed");
  assert.equal(createSubmissionGuard(blocked).get("case-one"), null);
  assert.throws(() => guard.mark("case-two", "invalid"), /สถานะ/);
});
