import qrcode from "./vendor/qrcode.mjs";

// ไลบรารีต้นทางเปิดให้กำหนดตัวเข้ารหัสได้; ต้องใช้ UTF-8 สำหรับภาษาไทย.
qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));

export function qrSvg(message) {
  if (typeof message !== "string" || !message.trim()) throw new Error("ไม่มีข้อความสำหรับ QR");
  const qr = qrcode(0, "M");
  qr.addData(message, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
}
