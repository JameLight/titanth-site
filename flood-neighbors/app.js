import { PROVINCES } from "../flood/provinces.js";
import { checkOffer, shareOfferText } from "./model.js";

const $ = id => document.getElementById(id);
const select = $("share-province");
for (const province of PROVINCES) {
  const option = document.createElement("option");
  option.value = province;
  option.textContent = province;
  select.append(option);
}

function currentOffer() {
  return checkOffer({
    province: select.value,
    kind: $("share-kind").value,
    contactKind: $("share-contact-kind").value,
    contactValue: $("share-contact").value
  });
}

function manualCopy(text) {
  $("manual-copy-label").hidden = false;
  const area = $("manual-copy");
  area.hidden = false;
  area.value = text;
  area.focus(); area.select();
}

$("share-contact-kind").addEventListener("change", () => {
  const kind = $("share-contact-kind").value;
  const needsContact = kind !== "reply_in_app";
  $("share-contact-label").hidden = !needsContact;
  $("share-contact").hidden = !needsContact;
  $("share-contact").value = "";
  $("share-contact").inputMode = kind === "phone" ? "tel" : "text";
  $("share-contact").placeholder = kind === "phone" ? "ใส่เบอร์ของคุณเอง" : "ใส่ LINE ID ของคุณเอง";
});

$("share-now").addEventListener("click", async () => {
  let text;
  try { text = shareOfferText(currentOffer()); }
  catch (error) { $("share-result").textContent = error.message; return; }
  if (!navigator.share) {
    manualCopy(text);
    $("share-result").textContent = "เครื่องนี้ไม่มีเมนูแชร์ ให้คัดลอกข้อความแล้วส่งเอง";
    return;
  }
  try {
    await navigator.share({ text });
    $("share-result").textContent = "เปิดเมนูแชร์แล้ว กรุณาตรวจในแอปปลายทางว่าได้กดส่งและผู้รับตอบกลับ";
  } catch (error) {
    if (error?.name === "AbortError") $("share-result").textContent = "ยกเลิกการแชร์แล้ว ยังไม่ได้ส่งข้อความ";
    else {
      manualCopy(text);
      $("share-result").textContent = "เมนูแชร์ใช้ไม่ได้ ให้คัดลอกข้อความแล้วส่งเอง";
    }
  }
});

$("copy-now").addEventListener("click", async () => {
  let text;
  try { text = shareOfferText(currentOffer()); }
  catch (error) { $("share-result").textContent = error.message; return; }
  try {
    await navigator.clipboard.writeText(text);
    $("share-result").textContent = "คัดลอกแล้ว ยังไม่ได้ส่งให้ใคร กรุณาวางและกดส่งเอง";
  } catch {
    manualCopy(text);
    $("share-result").textContent = "คัดลอกอัตโนมัติไม่ได้ เลือกข้อความที่แสดงแล้วคัดลอกเอง";
  }
});
