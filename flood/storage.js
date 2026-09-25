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
export const putCase = item => operate("readwrite", store => store.put(item));
export const deleteCase = caseId => operate("readwrite", store => store.delete(caseId));
