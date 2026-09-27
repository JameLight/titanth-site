const DB_NAME = "khem-flood-rescue-pilot-v1";
const STORE = "cases";

function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("เบราว์เซอร์นี้ไม่รองรับการเก็บข้อมูลในเครื่อง"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "caseId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("เปิดพื้นที่เก็บข้อมูลในเครื่องไม่ได้"));
  });
}

async function operate(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(new Error("อ่านหรือบันทึกข้อมูลในเครื่องไม่สำเร็จ"));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new Error("พื้นที่เก็บข้อมูลในเครื่องเกิดข้อผิดพลาด"));
      tx.onabort = () => reject(new Error("การบันทึกข้อมูลในเครื่องถูกยกเลิก"));
    });
  } finally { db.close(); }
}

export const listCases = () => operate("readonly", store => store.getAll());
export const getCase = caseId => operate("readonly", store => store.get(caseId));
export const putCase = item => operate("readwrite", store => store.put(item));
export const deleteCase = caseId => operate("readwrite", store => store.delete(caseId));

export async function deleteCaseIfUnchanged(caseId, snapshot) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(caseId);
      let changed = false;
      request.onsuccess = () => {
        if (JSON.stringify(request.result) !== JSON.stringify(snapshot)) { changed = true; tx.abort(); return; }
        store.delete(caseId);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(new Error("ลบเคสในเครื่องไม่สำเร็จ"));
      tx.onabort = () => changed ? resolve(false) : reject(new Error("ลบเคสในเครื่องไม่สำเร็จ"));
    });
  } finally { db.close(); }
}

// Apply a user note to the latest row, so a stale card from another tab cannot
// overwrite a reserved recovery secret or a newly saved receipt.
export async function updateCase(caseId, change) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(caseId);
      let result;
      let reason;
      request.onsuccess = () => {
        if (!request.result) { reason = new Error("ไม่พบเคสในเครื่อง โหลดหน้าใหม่เพื่อตรวจ"); tx.abort(); return; }
        try { result = change(request.result); store.put(result); }
        catch (error) { reason = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(reason || new Error("บันทึกข้อมูลเคสในเครื่องไม่สำเร็จ"));
      tx.onabort = () => reject(reason || new Error("บันทึกข้อมูลเคสในเครื่องไม่สำเร็จ"));
    });
  } finally { db.close(); }
}

// One readwrite transaction prevents two tabs from reserving different secrets
// for the same local case. A write/readback failure must never start the POST.
export async function reserveCaseAttempt(caseId, attempt) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(caseId);
      let reason = null;
      request.onsuccess = () => {
        const existing = request.result;
        if (!existing || existing.intake || existing.intakeAttempt) {
          reason = new Error("เคสนี้ถูกเตรียมส่งจากอีกแท็บหรือส่งแล้ว โหลดหน้าใหม่เพื่อตรวจ อย่าสร้างเคสซ้ำ");
          tx.abort();
          return;
        }
        store.put({ ...existing, intakeAttempt: attempt });
      };
      request.onerror = () => { reason = new Error("อ่านเคสในเครื่องก่อนส่งไม่ได้"); };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(reason || new Error("บันทึกรหัสกู้คืนก่อนส่งไม่ได้"));
      tx.onabort = () => reject(reason || new Error("บันทึกรหัสกู้คืนก่อนส่งไม่ได้"));
    });
  } finally { db.close(); }
}

async function changeReservedCase(caseId, secret, change) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(caseId);
      let mismatch = false;
      request.onsuccess = () => {
        const existing = request.result;
        if (!existing || existing.intakeAttempt?.payload?.p_secret !== secret || existing.intake) {
          mismatch = true;
          tx.abort();
          return;
        }
        store.put(change(existing));
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(new Error("บันทึกผลเคสในเครื่องไม่สำเร็จ"));
      tx.onabort = () => mismatch ? resolve(false) : reject(new Error("บันทึกผลเคสในเครื่องไม่สำเร็จ"));
    });
  } finally { db.close(); }
}

export const clearCaseAttempt = (caseId, secret) => changeReservedCase(caseId, secret, existing => {
  const { intakeAttempt, ...plain } = existing;
  return plain;
});

export const finalizeCaseAttempt = (caseId, secret, receipt) => changeReservedCase(caseId, secret, existing => {
  const { intakeAttempt, ...plain } = existing;
  return { ...plain, intake: receipt };
});

export const closeCaseAttempt = (caseId, secret) => changeReservedCase(caseId, secret, existing => ({
  ...existing, intakeAttempt: { ...existing.intakeAttempt, closedReason: "SECRET_CLOSED" }
}));
