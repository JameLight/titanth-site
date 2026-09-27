// A second, minimal store for a case whose POST may already have succeeded.
// It holds only the local case ID and outcome, never a receipt secret or case details.
const PREFIX = "promjaeng-flood-submitted-v1:";
const OUTCOMES = new Set(["confirmed", "uncertain"]);

export function createSubmissionGuard(storage) {
  const memory = new Map();
  const key = caseId => PREFIX + caseId;
  return {
    get(caseId) {
      if (memory.has(caseId)) return memory.get(caseId);
      try {
        const value = storage?.getItem(key(caseId));
        if (OUTCOMES.has(value)) { memory.set(caseId, value); return value; }
      } catch { /* In-memory protection remains for this page. */ }
      return null;
    },
    mark(caseId, outcome) {
      if (!OUTCOMES.has(outcome)) throw new Error("สถานะการส่งไม่ถูกต้อง");
      memory.set(caseId, outcome);
      try { storage?.setItem(key(caseId), outcome); } catch { /* Keep the page locked. */ }
    },
    clear(caseId) {
      memory.delete(caseId);
      try { storage?.removeItem(key(caseId)); } catch { /* Local storage may be unavailable. */ }
    }
  };
}
