import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const guard = source.match(/function hasUnsavedDraft\(\) \{[\s\S]*?\n\}\n\nfunction reloadWhenSafe/);
assert.ok(guard, "reload guard must exist");

function draftGuard({ mediaOpen = false, mediaText = "", intakeOpen = false } = {}) {
  const dialogs = {
    "#media-dialog": { open: mediaOpen },
    "#intake-dialog": { open: intakeOpen },
    "#confirm-dialog": { open: false },
    "#handoff-dialog": { open: false },
    "#manual-copy": { hidden: true }
  };
  const sandbox = {
    casesLoaded: true,
    localWrites: 0,
    draftTouched: false,
    quickLocationInProgress: false,
    lastQuickLocationText: "",
    pendingHandoff: false,
    pendingMediaText: mediaText,
    form: { elements: [] },
    $: selector => dialogs[selector]
  };
  const functionSource = guard[0].replace(/\n\nfunction reloadWhenSafe$/, "");
  return vm.runInNewContext(`${functionSource}\nhasUnsavedDraft()`, sandbox);
}

test("a pending photo or audio share prevents an update reload", () => {
  assert.equal(draftGuard({ mediaOpen: true }), true);
  assert.equal(draftGuard({ mediaText: "ข้อความขอความช่วยเหลือที่ยังไม่ได้ส่ง" }), true);
});

test("an intake consent dialog prevents an update reload", () => {
  assert.equal(draftGuard({ intakeOpen: true }), true);
});

test("an idle page may reload to fetch an update", () => {
  assert.equal(draftGuard(), false);
});
