import test from "node:test";
import assert from "node:assert/strict";
import { snapshotVisible } from "../kamphaeng-phet/snapshot.js";

test("dated province summary is shown only during its short review window", () => {
  assert.equal(snapshotVisible(Date.parse("2026-09-29T06:59:59+07:00")), false);
  assert.equal(snapshotVisible(Date.parse("2026-09-29T07:30:00+07:00")), true);
  assert.equal(snapshotVisible(Date.parse("2026-09-29T08:59:59+07:00")), true);
  assert.equal(snapshotVisible(Date.parse("2026-09-29T09:00:00+07:00")), false);
  assert.equal(snapshotVisible(Number.NaN), false);
});
