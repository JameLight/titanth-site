// Read a saved receipt without persisting the secret in the page's form.
export function takeReceipt(form) {
  const code = form.elements.code.value.trim().toUpperCase();
  const secret = form.elements.secret.value.trim().toLowerCase();
  form.elements.secret.value = "";
  if (!/^[A-Z0-9-]{4,40}$/.test(code) || !/^[a-f0-9]{32,128}$/.test(secret)) {
    throw new Error("รหัสเคสหรือรหัสลับไม่ครบ กรุณาตรวจรหัสที่เก็บไว้");
  }
  return { code, secret };
}

export function takeRecoverySecret(form) {
  const secret = form.elements.secret.value.trim().toLowerCase();
  form.elements.secret.value = "";
  if (!/^[a-f0-9]{32,128}$/.test(secret)) throw new Error("รหัสกู้คืนต้องเป็นตัวเลขและ a-f รวม 32–128 ตัว");
  return secret;
}

// A dialog's close event fires for both its button and the browser's Escape
// action. Clear the hidden field on that event, not only on the button click.
export function clearSecretWhenDialogCloses(dialog, field, closeButton) {
  dialog.addEventListener("close", () => {
    field.value = "";
    closeButton.onclick = null;
  }, { once: true });
}
