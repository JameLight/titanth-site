import test from "node:test";
import assert from "node:assert/strict";
import { alertsForProvince, alertDisplayState, showAlertMessageByDefault } from "../official_alerts.js";

const cb690414 = {
  fact_cb: [{ alert_id: "CB-690414", date_id: "D-20260928", time: "11:14", duration_hour: 2,
    event_id: "EXA", title: "ปภ.เตือนน้ำท่วม", message_id: "M-690414" }],
  dim_message: [{ message_id: "M-690414", message_th: "ข้อความประกาศต้นทาง" }],
  bridge_alert_location: [{ alert_id: "CB-690414", province_code: 62 }],
  dim_province: [{ province_code: 62, province_name_th: "กำแพงเพชร" }],
  dim_event: [{ event_id: "EXA", event_th: "การแจ้งเตือนภัยขั้นรุนแรง" }]
};

test("CB-690414: 28 Sep 11:14 Thai, 2-hour display window ended at 13:14 Thai", () => {
  const [alert] = alertsForProvince(cb690414, "กำแพงเพชร", { now: new Date("2026-09-29T00:00:00Z") });
  assert.equal(alert.at, "2026-09-28T04:14:00.000Z");
  assert.equal(alert.hours, 2);
  const state = alertDisplayState(alert, new Date("2026-09-29T00:00:00Z"));
  assert.deepEqual(state, { kind: "ended", endAt: "2026-09-28T06:14:00.000Z" });
  assert.equal(showAlertMessageByDefault(state), false);
});

test("active display window shows text only on a fresh fetch, then ends at the boundary", () => {
  const [alert] = alertsForProvince(cb690414, "กำแพงเพชร", { now: new Date("2026-09-28T05:14:00Z") });
  const active = alertDisplayState(alert, new Date("2026-09-28T05:14:00Z"));
  assert.equal(active.kind, "within-display-window");
  assert.equal(showAlertMessageByDefault(active), true);
  assert.equal(showAlertMessageByDefault(active, true), false);
  assert.equal(alertDisplayState(alert, new Date("2026-09-28T06:14:00Z")).kind, "ended");
  assert.equal(showAlertMessageByDefault(alertDisplayState(alert, new Date("2026-09-28T04:13:00Z"))), false);
});

test("missing or invalid display duration cannot be presented as current", () => {
  for (const duration_hour of [undefined, null, "2", 0, -1]) {
    const input = structuredClone(cb690414);
    if (duration_hour === undefined) delete input.fact_cb[0].duration_hour;
    else input.fact_cb[0].duration_hour = duration_hour;
    const [alert] = alertsForProvince(input, "กำแพงเพชร", { now: new Date("2026-09-28T05:14:00Z") });
    assert.equal(alert.hours, null);
    const state = alertDisplayState(alert, new Date("2026-09-28T05:14:00Z"));
    assert.equal(state.kind, "unknown");
    assert.equal(showAlertMessageByDefault(state), false);
  }
});

test("cached alert is classified again when opened after its display window", () => {
  const [alert] = alertsForProvince(cb690414, "กำแพงเพชร", { now: new Date("2026-09-28T05:14:00Z") });
  const saved = JSON.parse(JSON.stringify({ alerts: [alert], fetchedAt: "2026-09-28T05:14:00Z" }));
  assert.equal(alertDisplayState(saved.alerts[0], new Date(saved.fetchedAt)).kind, "within-display-window");
  const reopened = alertDisplayState(saved.alerts[0], new Date("2026-09-29T00:00:00Z"));
  assert.equal(reopened.kind, "ended");
  assert.equal(showAlertMessageByDefault(reopened, true), false);
  delete saved.alerts[0].hours; // Older or incomplete cache shape.
  assert.equal(alertDisplayState(saved.alerts[0], new Date("2026-09-29T00:00:00Z")).kind, "unknown");
});
