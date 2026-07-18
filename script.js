/* ==================================================
   מערכת הגרלות תלמידים — Application Logic
   ================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "raffleApp_state_v1";

  // ---------- Fixed prize list ----------
  const PRIZES = [
    { id: "p1", name: 'ש"ס תלמוד בבלי', icon: "📚" },
    { id: "p2", name: "סט משנה ברורה", icon: "📖" },
    { id: "p3", name: "משקפי צלילה + גלגל ים", icon: "🤿" },
    { id: "p4", name: "סירת משוטים", icon: "🚣" },
    { id: "p5", name: "בריכה מתנפחת", icon: "🏊" },
    { id: "p6", name: "מזרון ים + משקפי ים", icon: "🕶️" },
    { id: "p7", name: "קונסולת משחקים ניידת", icon: "🎮" },
    { id: "p8", name: "חבילת מוזיקה", icon: "🎵" },
    { id: "p9", name: "מנקלה", icon: "🎲" },
    { id: "p10", name: "קונסולת משחקים", icon: "🕹️" },
    { id: "p11", name: "חבילת משחקים", icon: "🧩" },
    { id: "p12", name: "אוהל איכותי", icon: "⛺" },
    { id: "p13", name: "כדור רגל", icon: "⚽" },
    { id: "p14", name: "כיסא שטח", icon: "🪑" },
    { id: "p15", name: "ערכת קפה", icon: "☕" },
    { id: "p16", name: 'שובר מתנה ע"ס 250 ש"ח רפאלי', icon: "🎁" }
  ];

  // ---------- State ----------
  // state.students: [{id, name}]
  // state.tickets: { [prizeId]: { [studentId]: count } }
  // state.winners: { [prizeId]: { studentId, name, date } }
  let state = {
    students: [],
    tickets: {},
    winners: {}
  };

  let currentAssignStudentId = null;
  let currentWheelPrizeId = null;
  let wheelSegments = []; // [{studentId, name, count, startDeg, endDeg}]
  let pickedWinnerId = null;

  // ---------- Persistence ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.students = Array.isArray(parsed.students) ? parsed.students : [];
        state.tickets = parsed.tickets && typeof parsed.tickets === "object" ? parsed.tickets : {};
        state.winners = parsed.winners && typeof parsed.winners === "object" ? parsed.winners : {};
      }
    } catch (e) {
      console.warn("Failed to load saved state:", e);
    }
  }

  function saveState(showToastMsg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (showToastMsg) showToast("💾 נשמר בהצלחה");
    } catch (e) {
      console.warn("Failed to save state:", e);
      showToast("⚠️ שמירה נכשלה");
    }
  }

  // ---------- Utils ----------
  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function getStudentName(id) {
    const s = state.students.find((st) => st.id === id);
    return s ? s.name : "(תלמיד נמחק)";
  }

  function getPrize(id) {
    return PRIZES.find((p) => p.id === id);
  }

  function studentTotalTickets(studentId) {
    let total = 0;
    Object.keys(state.tickets).forEach((prizeId) => {
      const entry = state.tickets[prizeId] && state.tickets[prizeId][studentId];
      if (entry) total += entry;
    });
    return total;
  }

  function prizeEntries(prizeId) {
    const map = state.tickets[prizeId] || {};
    return Object.keys(map)
      .filter((sid) => map[sid] > 0 && state.students.some((s) => s.id === sid))
      .map((sid) => ({ studentId: sid, name: getStudentName(sid), count: map[sid] }));
  }

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  // ==================================================
  // TABS
  // ==================================================
  function initTabs() {
    const btns = document.querySelectorAll(".tab-btn");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        if (btn.dataset.tab === "assign") renderSummaryTable();
        if (btn.dataset.tab === "raffle") renderRaffleCards();
      });
    });
  }

  // ==================================================
  // STUDENTS TAB
  // ==================================================
  function addStudent(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    state.students.push({ id: uid("stu"), name: trimmed });
    saveState(false);
    renderStudentsList();
    renderStudentSelect();
    showToast("➕ התלמיד נוסף");
  }

  function deleteStudent(id) {
    const s = state.students.find((st) => st.id === id);
    if (!s) return;
    if (!confirm('למחוק את "' + s.name + '" מרשימת התלמידים? פעולה זו תסיר גם את כל שיוכי הכרטיסים שלו.')) return;
    state.students = state.students.filter((st) => st.id !== id);
    Object.keys(state.tickets).forEach((prizeId) => {
      if (state.tickets[prizeId] && state.tickets[prizeId][id] !== undefined) {
        delete state.tickets[prizeId][id];
      }
    });
    saveState(false);
    renderStudentsList();
    renderStudentSelect();
    renderSummaryTable();
    renderRaffleCards();
    showToast("🗑️ התלמיד נמחק");
  }

  function renderStudentsList() {
    const list = document.getElementById("studentsList");
    const empty = document.getElementById("studentsEmptyState");
    const count = document.getElementById("studentCount");
    count.textContent = state.students.length + " תלמידים";
    list.innerHTML = "";
    if (state.students.length === 0) {
      empty.classList.add("visible");
      return;
    }
    empty.classList.remove("visible");
    state.students.forEach((s) => {
      const row = document.createElement("div");
      row.className = "student-row";
      const total = studentTotalTickets(s.id);
      row.innerHTML =
        '<div class="student-row-name">' +
        '<span class="student-avatar">' + escapeHtml(s.name.trim().charAt(0) || "?") + "</span>" +
        "<span>" + escapeHtml(s.name) + "</span>" +
        "</div>" +
        '<div class="student-row-meta">' +
        '<span class="student-ticket-total">🎟️ ' + total + " כרטיסים</span>" +
        '<button class="btn btn-icon-only" data-del="' + s.id + '" title="מחק">🗑️</button>' +
        "</div>";
      list.appendChild(row);
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteStudent(btn.dataset.del));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function initStudentsTab() {
    const input = document.getElementById("newStudentInput");
    const addBtn = document.getElementById("addStudentBtn");
    addBtn.addEventListener("click", () => {
      addStudent(input.value);
      input.value = "";
      input.focus();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addStudent(input.value);
        input.value = "";
      }
    });
  }

  // ==================================================
  // ASSIGN TICKETS TAB
  // ==================================================
  function renderStudentSelect() {
    const sel = document.getElementById("studentSelect");
    const prevVal = sel.value;
    sel.innerHTML = '<option value="">— בחר תלמיד —</option>';
    state.students.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    if (state.students.some((s) => s.id === prevVal)) sel.value = prevVal;
  }

  function renderAssignGrid(studentId) {
    const grid = document.getElementById("assignGrid");
    const actions = document.getElementById("assignActions");
    const empty = document.getElementById("assignEmptyState");
    grid.innerHTML = "";

    if (!studentId) {
      actions.style.display = "none";
      empty.classList.add("visible");
      return;
    }
    empty.classList.remove("visible");
    actions.style.display = "flex";

    PRIZES.forEach((prize) => {
      const current = (state.tickets[prize.id] && state.tickets[prize.id][studentId]) || 0;
      const row = document.createElement("div");
      row.className = "assign-row";
      row.innerHTML =
        '<div class="assign-row-label"><span class="prize-emoji">' + prize.icon + '</span><span class="txt">' + escapeHtml(prize.name) + "</span></div>" +
        '<input type="number" min="0" step="1" value="' + current + '" data-prize="' + prize.id + '">';
      grid.appendChild(row);
    });

    // Enter key moves focus to next input
    const inputs = Array.from(grid.querySelectorAll("input"));
    inputs.forEach((inp, idx) => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (inputs[idx + 1]) inputs[idx + 1].focus();
          else saveAssignments(studentId);
        }
      });
    });
  }

  function saveAssignments(studentId) {
    if (!studentId) return;
    const grid = document.getElementById("assignGrid");
    const inputs = grid.querySelectorAll("input[data-prize]");
    inputs.forEach((inp) => {
      const prizeId = inp.dataset.prize;
      const val = Math.max(0, parseInt(inp.value, 10) || 0);
      if (!state.tickets[prizeId]) state.tickets[prizeId] = {};
      if (val > 0) {
        state.tickets[prizeId][studentId] = val;
      } else {
        delete state.tickets[prizeId][studentId];
      }
    });
    saveState(false);
    renderStudentsList();
    renderSummaryTable();
    renderRaffleCards();
    const hint = document.getElementById("assignSavedHint");
    hint.textContent = "✅ השיוך נשמר!";
    hint.classList.add("show");
    setTimeout(() => hint.classList.remove("show"), 2000);
    showToast("💾 שיוך הכרטיסים נשמר");
  }

  function renderSummaryTable() {
    const wrap = document.getElementById("summaryTableWrap");
    if (state.students.length === 0) {
      wrap.innerHTML = '<p class="empty-state visible">אין עדיין תלמידים או שיוכים להצגה.</p>';
      return;
    }
    let html = '<table class="summary-table"><thead><tr><th>הגרלה \\ תלמיד</th>';
    state.students.forEach((s) => {
      html += "<th>" + escapeHtml(s.name) + "</th>";
    });
    html += "</tr></thead><tbody>";
    PRIZES.forEach((prize) => {
      html += "<tr><td>" + prize.icon + " " + escapeHtml(prize.name) + "</td>";
      state.students.forEach((s) => {
        const count = (state.tickets[prize.id] && state.tickets[prize.id][s.id]) || 0;
        html += "<td>" + (count > 0 ? '<span class="cell-count">' + count + "</span>" : '<span class="cell-zero">–</span>') + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    wrap.innerHTML = html;
  }

  function initAssignTab() {
    const sel = document.getElementById("studentSelect");
    sel.addEventListener("change", () => {
      currentAssignStudentId = sel.value || null;
      renderAssignGrid(currentAssignStudentId);
    });
    document.getElementById("saveAssignBtn").addEventListener("click", () => {
      saveAssignments(currentAssignStudentId);
    });
  }

  // ==================================================
  // RAFFLE TAB
  // ==================================================
  function renderRaffleCards() {
    const grid = document.getElementById("prizeCardsGrid");
    grid.innerHTML = "";
    PRIZES.forEach((prize, idx) => {
      const entries = prizeEntries(prize.id);
      const totalTickets = entries.reduce((sum, e) => sum + e.count, 0);
      const winner = state.winners[prize.id];
      const card = document.createElement("div");
      card.className = "prize-card pc-" + (idx % 16);

      let inner =
        '<div class="prize-card-top"><span class="prize-emoji-big">' + prize.icon + "</span></div>" +
        "<h3>" + escapeHtml(prize.name) + "</h3>";

      if (winner) {
        inner +=
          '<div class="winner-badge"><div class="wb-label">🏆 הזוכה/ה:</div><div class="wb-name">' +
          escapeHtml(winner.name) +
          "</div></div>" +
          '<div class="participants-line">' + entries.length + " משתתפים · " + totalTickets + " כרטיסים</div>" +
          '<div class="prize-card-footer">' +
          '<button class="undo-link" data-undo="' + prize.id + '">↺ בטל ובצע הגרלה מחדש</button>' +
          "</div>";
      } else if (entries.length === 0) {
        inner +=
          '<p class="no-participants-note">אין עדיין משתתפים משויכים להגרלה זו</p>' +
          '<div class="prize-card-footer">' +
          '<button class="btn btn-draw" disabled>🎡 הרץ הגרלה</button>' +
          "</div>";
      } else {
        inner +=
          '<div class="participants-line">' + entries.length + " משתתפים · " + totalTickets + " כרטיסים</div>" +
          '<div class="prize-card-footer">' +
          '<button class="btn btn-draw" data-draw="' + prize.id + '">🎡 הרץ הגרלה</button>' +
          "</div>";
      }

      card.innerHTML = inner;
      grid.appendChild(card);
    });

    grid.querySelectorAll("[data-draw]").forEach((btn) => {
      btn.addEventListener("click", () => openWheelModal(btn.dataset.draw));
    });
    grid.querySelectorAll("[data-undo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prize = getPrize(btn.dataset.undo);
        if (!confirm('לבטל את תוצאת ההגרלה עבור "' + prize.name + '" ולאפשר הגרלה מחדש?')) return;
        delete state.winners[btn.dataset.undo];
        saveState(false);
        renderRaffleCards();
        showToast("↺ ההגרלה אופסה");
      });
    });
  }

  // ==================================================
  // WHEEL LOGIC
  // ==================================================
  function pickWeightedWinner(entries) {
    const total = entries.reduce((sum, e) => sum + e.count, 0);
    let r = Math.random() * total;
    for (const e of entries) {
      r -= e.count;
      if (r <= 0) return e.studentId;
    }
    return entries[entries.length - 1].studentId;
  }

  const SEGMENT_COLORS = [
    "#7c3aed", "#ec4899", "#06b6d4", "#f59e0b",
    "#10b981", "#3b82f6", "#f43f5e", "#a855f7",
    "#eab308", "#14b8a6", "#f97316", "#6366f1",
    "#84cc16", "#e11d48", "#0ea5e9", "#d946ef"
  ];

  function buildSegments(entries) {
    const total = entries.reduce((sum, e) => sum + e.count, 0);
    let cursor = 0;
    return entries.map((e, i) => {
      const sweep = (e.count / total) * 360;
      const seg = {
        studentId: e.studentId,
        name: e.name,
        count: e.count,
        startDeg: cursor,
        endDeg: cursor + sweep,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]
      };
      cursor += sweep;
      return seg;
    });
  }

  function drawWheel(segments) {
    const canvas = document.getElementById("wheelCanvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) / 2 - 6;

    ctx.clearRect(0, 0, w, h);

    segments.forEach((seg) => {
      const startRad = ((seg.startDeg - 90) * Math.PI) / 180;
      const endRad = ((seg.endDeg - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startRad, endRad);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // label
      const midDeg = (seg.startDeg + seg.endDeg) / 2;
      const midRad = ((midDeg - 90) * Math.PI) / 180;
      const sweep = seg.endDeg - seg.startDeg;
      ctx.save();
      ctx.translate(cx + Math.cos(midRad) * radius * 0.62, cy + Math.sin(midRad) * radius * 0.62);
      ctx.rotate(midRad + Math.PI / 2);
      ctx.fillStyle = "#fff";
      ctx.font = "bold " + (sweep > 20 ? 15 : sweep > 10 ? 12 : 9) + "px Heebo, Assistant, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      const label = seg.name.length > 12 ? seg.name.slice(0, 11) + "…" : seg.name;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });

    // outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.stroke();
  }

  function openWheelModal(prizeId) {
    const prize = getPrize(prizeId);
    const entries = prizeEntries(prizeId);
    if (entries.length === 0) {
      showToast("⚠️ אין משתתפים להגרלה זו");
      return;
    }
    currentWheelPrizeId = prizeId;
    wheelSegments = buildSegments(entries);
    pickedWinnerId = pickWeightedWinner(entries);

    document.getElementById("wheelPrizeTitle").textContent = prize.icon + " " + prize.name;

    const canvas = document.getElementById("wheelCanvas");
    canvas.style.transition = "none";
    canvas.style.transform = "rotate(0deg)";
    // force reflow so the next transition applies cleanly
    void canvas.offsetWidth;

    drawWheel(wheelSegments);

    const spinBtn = document.getElementById("spinBtn");
    spinBtn.disabled = false;
    spinBtn.textContent = "";
    spinBtn.innerHTML = '<span class="icon">🎡</span> סובב את הגלגל!';

    document.getElementById("wheelModal").classList.add("open");
  }

  function closeWheelModal() {
    document.getElementById("wheelModal").classList.remove("open");
  }

  function spinWheel() {
    const spinBtn = document.getElementById("spinBtn");
    spinBtn.disabled = true;
    spinBtn.innerHTML = '<span class="icon">🌀</span> מסתובב...';

    const winnerSeg = wheelSegments.find((s) => s.studentId === pickedWinnerId);
    const midDeg = (winnerSeg.startDeg + winnerSeg.endDeg) / 2;

    // Pointer sits at top (0deg / 12 o'clock). Our segments are drawn with 0deg at top too
    // (angles offset by -90 in drawWheel). We rotate the whole canvas via CSS transform.
    // After rotating by R degrees clockwise, a point originally at angle 'midDeg' ends up at
    // (midDeg + R) mod 360. We want that to equal 0 (pointer position), so:
    const fullSpins = 6; // extra full rotations for visual effect
    const baseRotationNeeded = ((-midDeg) % 360 + 360) % 360;
    // add slight random offset within the segment for realism (not touching to edges)
    const jitterRange = Math.max(2, (winnerSeg.endDeg - winnerSeg.startDeg) * 0.25);
    const jitter = (Math.random() - 0.5) * jitterRange;
    const totalRotation = fullSpins * 360 + baseRotationNeeded + jitter;

    const canvas = document.getElementById("wheelCanvas");
    canvas.style.transition = "transform 4.8s cubic-bezier(0.13, 0.72, 0.13, 1)";
    canvas.style.transform = "rotate(" + totalRotation + "deg)";

    const onEnd = () => {
      canvas.removeEventListener("transitionend", onEnd);
      finishRaffle();
    };
    canvas.addEventListener("transitionend", onEnd);
  }

  function finishRaffle() {
    const prize = getPrize(currentWheelPrizeId);
    const name = getStudentName(pickedWinnerId);

    state.winners[currentWheelPrizeId] = {
      studentId: pickedWinnerId,
      name: name,
      date: new Date().toISOString()
    };
    saveState(false);

    closeWheelModal();
    renderRaffleCards();

    document.getElementById("winnerPrizeName").textContent = prize.icon + " " + prize.name;
    document.getElementById("winnerStudentName").textContent = name;
    document.getElementById("winnerModal").classList.add("open");
    launchConfetti();
    showToast("🎉 נבחר זוכה!");
  }

  function initWheelModal() {
    document.getElementById("spinBtn").addEventListener("click", spinWheel);
    document.getElementById("closeWheelModal").addEventListener("click", closeWheelModal);
    document.getElementById("wheelModal").addEventListener("click", (e) => {
      if (e.target.id === "wheelModal") closeWheelModal();
    });
    document.getElementById("closeWinnerModal").addEventListener("click", () => {
      document.getElementById("winnerModal").classList.remove("open");
      stopConfetti();
    });
  }

  // ==================================================
  // CONFETTI (lightweight, no external libs)
  // ==================================================
  let confettiAnimId = null;
  let confettiParticles = [];

  function launchConfetti() {
    const canvas = document.getElementById("confettiCanvas");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#7c3aed", "#ec4899", "#f59e0b", "#06b6d4", "#10b981", "#f43f5e", "#eab308"];
    confettiParticles = [];
    const count = 160;
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        vy: 2 + Math.random() * 3.5,
        vx: (Math.random() - 0.5) * 2.5,
        shape: Math.random() > 0.5 ? "rect" : "circle"
      });
    }

    let elapsed = 0;
    const duration = 3800;
    const startTime = performance.now();

    function frame(now) {
      elapsed = now - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confettiParticles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      if (elapsed < duration) {
        confettiAnimId = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    cancelAnimationFrame(confettiAnimId);
    confettiAnimId = requestAnimationFrame(frame);
  }

  function stopConfetti() {
    cancelAnimationFrame(confettiAnimId);
    const canvas = document.getElementById("confettiCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ==================================================
  // GLOBAL SAVE BUTTON
  // ==================================================
  function initSaveButton() {
    document.getElementById("saveBtn").addEventListener("click", () => {
      saveState(true);
    });
  }

  // ==================================================
  // INIT
  // ==================================================
  function init() {
    loadState();
    initTabs();
    initStudentsTab();
    initAssignTab();
    initWheelModal();
    initSaveButton();

    renderStudentsList();
    renderStudentSelect();
    renderAssignGrid(null);
    renderSummaryTable();
    renderRaffleCards();

    window.addEventListener("resize", () => {
      const confettiCanvas = document.getElementById("confettiCanvas");
      confettiCanvas.width = window.innerWidth;
      confettiCanvas.height = window.innerHeight;
    });

    // periodic autosave safety net
    setInterval(() => saveState(false), 15000);
    window.addEventListener("beforeunload", () => saveState(false));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
