import test from "node:test";
import assert from "node:assert/strict";
import { takeReceipt, takeRecoverySecret, clearSecretWhenDialogCloses } from "./receipt_lookup.js";

test("receipt lookup consumes the secret on valid and invalid input", () => {
  const form = { elements: { code: { value: " nam-test " }, secret: { value: ` ${"A".repeat(32)} ` } } };
  assert.deepEqual(takeReceipt(form), { code: "NAM-TEST", secret: "a".repeat(32) });
  assert.equal(form.elements.secret.value, "");
  form.elements.secret.value = "short";
  assert.throws(() => takeReceipt(form), /รหัส/);
  assert.equal(form.elements.secret.value, "");
});

test("secret-only recovery consumes the secret even when invalid", () => {
  const form = { elements: { secret: { value: ` ${"A".repeat(64)} ` } } };
  assert.equal(takeRecoverySecret(form), "a".repeat(64));
  assert.equal(form.elements.secret.value, "");
  form.elements.secret.value = "bad";
  assert.throws(() => takeRecoverySecret(form), /รหัสกู้คืน/);
  assert.equal(form.elements.secret.value, "");
});

test("Escape close event clears the hidden receipt secret even without clicking Close", () => {
  const dialog = new EventTarget();
  const field = { value: `รหัสลับ: ${"a".repeat(64)}` };
  const closeButton = { onclick: () => {} };
  clearSecretWhenDialogCloses(dialog, field, closeButton);
  dialog.dispatchEvent(new Event("close"));
  assert.equal(field.value, "");
  assert.equal(closeButton.onclick, null);
});
