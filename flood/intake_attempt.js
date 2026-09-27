// An uncertain POST is reserved before fetch begins. The secret and payload
// stay in IndexedDB; the localStorage marker holds only a local ID and state.
export async function stageIntakeAttempt(item, payload, { reserveCaseAttempt, getCase, guard }) {
  const attempt = { payload, preparedAt: new Date().toISOString() };
  try { await reserveCaseAttempt(item.caseId, attempt); }
  catch (error) { throw new Error(`${error.message || "เก็บรหัสกู้คืนก่อนส่งไม่ได้"} หน้านี้จะไม่ส่งซ้ำ โหลดหน้าใหม่เพื่อตรวจเคสก่อนกดส่งอีกครั้ง หากอันตรายโทร 1784 หรือ 1669`); }
  let readback;
  try { readback = await getCase(item.caseId); }
  catch {
    const error = new Error("จองรหัสกู้คืนไว้แล้ว แต่ยังยืนยันไม่ได้ว่าเคสนี้ถูกส่งหรือไม่ โหลดหน้าใหม่เพื่อตรวจเคสเดิม อย่าสร้างเคสซ้ำ หากอันตรายโทร 1784 หรือ 1669");
    error.reserved = true;
    throw error;
  }
  if (readback?.intakeAttempt?.payload?.p_secret !== payload.p_secret ||
      JSON.stringify(readback.intakeAttempt.payload) !== JSON.stringify(payload)) {
    const error = new Error("จองรหัสกู้คืนไว้แล้ว แต่สถานะเคสเปลี่ยนจากอีกแท็บ ยังยืนยันไม่ได้ว่าถูกส่งหรือไม่ โหลดหน้าใหม่เพื่อตรวจเคสเดิม อย่าสร้างเคสซ้ำ หากอันตรายโทร 1784 หรือ 1669");
    error.reserved = true;
    throw error;
  }
  guard.mark(item.caseId, "uncertain");
  return attempt;
}

export async function beginCaseSubmission(item, { makeSecret, prepare, confirmSecret, stage, submit }) {
  const secret = makeSecret();
  const payload = await prepare(item, secret);
  if (!await confirmSecret(secret)) return false;
  const attempt = await stage(item, payload);
  await submit({ ...item, intakeAttempt: attempt }, payload);
  return true;
}

export async function clearIntakeAttempt(item, { clearCaseAttempt, guard }) {
  let cleared = false;
  try { cleared = await clearCaseAttempt(item.caseId, item.intakeAttempt?.payload?.p_secret); }
  catch { /* A stale IndexedDB attempt keeps the card locked after reload. */ }
  if (cleared) guard.clear(item.caseId);
  return cleared;
}

export function submissionOutcomeForCase(item, guard) {
  if (item.intake) return null;
  if (item.intakeAttempt?.closedReason === "SECRET_CLOSED") return "closed";
  if (item.intakeAttempt) return "uncertain";
  return guard.get(item.caseId);
}

export function canRetryCaseAttempt(expected, current, guard) {
  return !!expected.intakeAttempt?.payload?.p_secret && !!current?.intakeAttempt?.payload?.p_secret &&
    !current.intake && !current.intakeAttempt.closedReason && guard.get(expected.caseId) !== "closed" &&
    JSON.stringify(current.intakeAttempt.payload) === JSON.stringify(expected.intakeAttempt.payload);
}
