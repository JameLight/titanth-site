// Live system status for the public: reads the intake switch and the aggregate public_stats() function.
// Shows "อ่านไม่ได้" instead of zero whenever a source cannot be read. No personal data is requested or shown.
(() => {
  const $ = id => document.getElementById(id);
  const n = v => Number.isInteger(v) && v >= 0 ? v : null;

  async function readJson(url, init) {
    const res = await fetch(url, Object.assign({ cache: "no-store" }, init));
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  async function readIntake() {
    try {
      const cfg = await readJson("../intake-config.json");
      if (!cfg || typeof cfg.enabled !== "boolean") throw new Error("config");
      if (cfg.enabled === true) {
        $("intake-state").textContent = "เปิดตามการตั้งค่า";
        $("intake-note").textContent = "ส่งได้เฉพาะจังหวัดที่มีทีมเฝ้าเวรอยู่จริง และการส่งถึงระบบยังไม่เท่ากับมีทีมรับเรื่อง ถ้าอันตราย โทร 1784 หรือ 1669 ทันที";
        $("intake-state").className = "big";
      } else {
        $("intake-state").textContent = "ปิดอยู่";
        $("intake-note").textContent = "ตอนนี้เว็บยังไม่รับเรื่องเข้าทีมอาสา ต้องโทร 1784 หรือ 1669 หรือส่ง LINE ปภ. เอง";
        $("intake-state").className = "big off";
      }
    } catch {
      $("intake-state").textContent = "อ่านไม่ได้";
      $("intake-note").textContent = "อ่านการตั้งค่าไม่ได้ในตอนนี้ ถ้าอันตราย โทร 1784 หรือ 1669";
      $("intake-state").className = "big unknown";
    }
  }

  async function readStats() {
    try {
      const cfg = await readJson("../../flood-team/team-config.json");
      if (!cfg || typeof cfg.url !== "string" || typeof cfg.publishableKey !== "string" || !cfg.publishableKey.startsWith("sb_publishable_")) throw new Error("config");
      const rows = await readJson(new URL("rest/v1/rpc/public_stats", cfg.url).href, {
        method: "POST", headers: { apikey: cfg.publishableKey, "Content-Type": "application/json" }, body: "{}"
      });
      if (!Array.isArray(rows)) throw new Error("shape");
      const sum = { waiting: 0, waiting10: 0, progress: 0, closed: 0 };
      const onDuty = [];
      for (const r of rows) {
        const t = n(r.teams_on_duty), w = n(r.waiting), w10 = n(r.waiting_over_10_min), p = n(r.in_progress), c = n(r.closed_last_24h);
        if ([t, w, w10, p, c].includes(null) || typeof r.province !== "string") throw new Error("value");
        if (t > 0) onDuty.push(`${r.province} (${t} ทีม)`);
        sum.waiting += w; sum.waiting10 += w10; sum.progress += p; sum.closed += c;
      }
      $("duty-count").textContent = `${onDuty.length} จาก 77 จังหวัด`;
      $("duty-count").className = onDuty.length ? "big ok" : "big off";
      $("duty-list").replaceChildren(...onDuty.map(x => Object.assign(document.createElement("li"), { textContent: x })));
      const total = sum.waiting + sum.progress + sum.closed;
      $("cases-summary").textContent = total ? `${total} เรื่องที่นับตอนนี้` : "ไม่มีเรื่องรอ กำลังช่วย หรือปิดใน 24 ชม.";
      $("cases-detail").hidden = !total;
      $("c-waiting").textContent = sum.waiting; $("c-waiting10").textContent = sum.waiting10;
      $("c-progress").textContent = sum.progress; $("c-closed").textContent = sum.closed;
    } catch {
      $("duty-count").textContent = "อ่านไม่ได้"; $("duty-count").className = "big unknown";
      $("cases-summary").textContent = "อ่านไม่ได้"; $("cases-detail").hidden = true;
      $("duty-list").replaceChildren(Object.assign(document.createElement("li"), { textContent: "อ่านฐานข้อมูลไม่ได้ในตอนนี้ ไม่ได้แปลว่าไม่มีทีมหรือไม่มีเรื่อง" }));
    }
  }

  async function readAll() {
    $("reload").disabled = true;
    await Promise.all([readIntake(), readStats()]);
    const now = new Date();
    $("read-time").textContent = `ตรวจเมื่อ ${now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} น. (เวลาไทย)`;
    $("reload").disabled = false;
  }

  $("reload").addEventListener("click", readAll);
  readAll();
})();
