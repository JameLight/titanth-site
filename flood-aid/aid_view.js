// SQL v2.7 reports are a warning, not a closure. A reported post is still open.
export function conversationControls(row) {
  const open = row?.post_status === "open" || row?.post_status === "reported";
  return {
    message: open,
    share: open && !!row?.i_am_poster && row.shared_at == null,
    view: open && !row?.i_am_poster && row.shared_at != null
  };
}

export function postStatusLabel(status) {
  return ({
    open: "เปิดอยู่", reported: "มีผู้ใช้รายงาน · ยังเปิดอยู่", expired: "หมดอายุ",
    closed: "ปิดแล้ว", hidden: "ถูกซ่อน"
  })[status] || "ไม่ทราบสถานะ";
}

// The current UI has no consent trail for the sensitive marker, so it never sends true.
export function postPayload(fields) {
  return {
    p_kind: fields.kind, p_province: fields.province, p_district: fields.district?.trim() || null,
    p_categories: fields.categories, p_people: fields.people ? Number(fields.people) : null,
    p_vulnerable: false, p_summary: fields.summary?.trim() || "",
    p_place: fields.place?.trim() || null, p_phone: fields.phone?.trim() || null
  };
}
