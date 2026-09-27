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
