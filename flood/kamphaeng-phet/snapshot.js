export const SNAPSHOT_START = Date.parse("2026-09-29T07:00:00+07:00");
export const SNAPSHOT_END = Date.parse("2026-09-29T09:00:00+07:00");

export function snapshotVisible(now = Date.now()) {
  return Number.isFinite(now) && now >= SNAPSHOT_START && now < SNAPSHOT_END;
}

if (typeof document !== "undefined") {
  const current = document.querySelector("#snapshot-current");
  const expired = document.querySelector("#snapshot-expired");
  function update() {
    const visible = snapshotVisible();
    current.hidden = !visible;
    expired.hidden = visible;
  }
  update();
  document.addEventListener("visibilitychange", update);
  setTimeout(update, Math.max(0, SNAPSHOT_END - Date.now() + 1));
  setInterval(update, 60_000);
}
