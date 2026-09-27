import test from "node:test";
import assert from "node:assert/strict";
import { takeReceipt } from "./receipt_lookup.js";

test("receipt lookup consumes the secret on valid and invalid input", () => {
  const form = { elements: { code: { value: " nam-test " }, secret: { value: ` ${"A".repeat(32)} ` } } };
  assert.deepEqual(takeReceipt(form), { code: "NAM-TEST", secret: "a".repeat(32) });
  assert.equal(form.elements.secret.value, "");
  form.elements.secret.value = "short";
  assert.throws(() => takeReceipt(form), /รหัส/);
  assert.equal(form.elements.secret.value, "");
});
