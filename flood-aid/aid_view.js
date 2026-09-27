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
