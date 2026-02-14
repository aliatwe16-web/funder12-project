/* =========================
   StudySphere - app.js
   Pure JS app with localStorage
   - Dynamic section rendering
   - Tasks, Notes, Timetable DnD
   - Assignments, Flashcards (quiz)
   - Pomodoro + Theme persistence
   ========================= */

/* -------------------------
   Utilities
   ------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/* -------------------------
   Storage Layer
   ------------------------- */
const STORAGE_KEY = "studysphere_v1";

const defaultData = () => ({
  theme: "light",
  activeSection: "tasks",

  tasks: [
    { id: uid(), title: "Read Chapter 3 (Biology)", category: "School", due: addDaysISO(1), priority: "Medium", done: false },
    { id: uid(), title: "Solve 15 calculus problems", category: "Homework", due: addDaysISO(2), priority: "High", done: false },
    { id: uid(), title: "Prepare flashcards for French vocab", category: "Study", due: addDaysISO(0), priority: "Low", done: true },
  ],

  notes: [
    { id: uid(), title: "History: Causes of WWI", body: "Alliance system, militarism, imperialism, nationalism. Trigger: assassination in Sarajevo.", updatedAt: Date.now() },
    { id: uid(), title: "Chemistry: pH shortcuts", body: "pH = -log[H+]. Each pH unit is 10× change in acidity.", updatedAt: Date.now() - 1000 * 60 * 60 * 8 },
  ],

  assignments: [
    { id: uid(), title: "English Essay Draft", subject: "English", due: addDaysISO(3), status: "In Progress", done: false },
    { id: uid(), title: "Physics Lab Report", subject: "Physics", due: addDaysISO(6), status: "Not Started", done: false },
    { id: uid(), title: "Math Quiz Revision", subject: "Math", due: addDaysISO(1), status: "Done", done: true },
  ],

  flashcards: {
    decks: [
      {
        id: uid(),
        name: "Biology — Cell Basics",
        cards: [
          { id: uid(), front: "What is the powerhouse of the cell?", back: "Mitochondria" },
          { id: uid(), front: "Cell membrane function?", back: "Controls what enters and leaves the cell" },
          { id: uid(), front: "Where is DNA stored (eukaryotes)?", back: "Nucleus" },
        ],
      },
      {
        id: uid(),
        name: "French — Common Verbs",
        cards: [
          { id: uid(), front: "Être", back: "To be" },
          { id: uid(), front: "Avoir", back: "To have" },
          { id: uid(), front: "Aller", back: "To go" },
        ],
      },
    ],
  },

  timetable: {
    // slots are keyed by `${day}_${time}` -> { title, color }
    // day: Mon..Fri, time: "08:00", "10:00" ...
    slots: {
      "Mon_10:00": { title: "Math", color: "#4f46e5" },
      "Wed_12:00": { title: "Biology", color: "#10b981" },
      "Fri_08:00": { title: "French", color: "#f59e0b" },
    },
    palette: [
      { id: uid(), title: "Math", color: "#4f46e5" },
      { id: uid(), title: "Biology", color: "#10b981" },
      { id: uid(), title: "Physics", color: "#0ea5e9" },
      { id: uid(), title: "History", color: "#ef4444" },
      { id: uid(), title: "French", color: "#f59e0b" },
    ],
  },

  pomodoro: {
    mode: "focus",            // focus | short | long
    isRunning: false,
    secondsLeft: 25 * 60,
    lastTickAt: null
  }
});

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // return YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);

    // Basic migration safety: ensure keys exist
    const base = defaultData();
    return {
      ...base,
      ...parsed,
      flashcards: parsed.flashcards?.decks ? parsed.flashcards : base.flashcards,
      timetable: parsed.timetable?.slots ? parsed.timetable : base.timetable,
      pomodoro: parsed.pomodoro?.secondsLeft != null ? parsed.pomodoro : base.pomodoro
    };
  } catch {
    return defaultData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateBadges();
}

/* -------------------------
   Global State
   ------------------------- */
let state = loadData();

/* -------------------------
   DOM references
   ------------------------- */
const contentRoot = $("#contentRoot");
const sectionTitle = $("#sectionTitle");
const sectionSubtitle = $("#sectionSubtitle");
const mainActions = $("#mainActions");

const modalOverlay = $("#modalOverlay");
const modalTitle = $("#modalTitle");
const modalSubtitle = $("#modalSubtitle");
const modalForm = $("#modalForm");
const modalClose = $("#modalClose");
const modalCancel = $("#modalCancel");

const toastRoot = $("#toastRoot");

const badgeTasks = $("#badgeTasks");
const badgeNotes = $("#badgeNotes");
const badgeAssignments = $("#badgeAssignments");
const badgeDecks = $("#badgeDecks");

const themeToggle = $("#themeToggle");
const yearEl = $("#year");

const miniTimer = $("#miniTimer");
const miniTimerStart = $("#miniTimerStart");

/* -------------------------
   Toasts
   ------------------------- */
function toast(title, body = "") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="toastTitle">${escapeHtml(title)}</div>
    ${body ? `<div class="toastBody">${escapeHtml(body)}</div>` : ""}
  `;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(10px)";
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

/* -------------------------
   Theme
   ------------------------- */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme === "dark" ? "dark" : "light");
  // icon hint
  themeToggle.querySelector(".icon").textContent = state.theme === "dark" ? "☀" : "☾";
}

themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveData();
  applyTheme();
  toast("Theme updated", state.theme === "dark" ? "Dark mode enabled" : "Light mode enabled");
});

/* -------------------------
   Navigation
   ------------------------- */
function setActiveSection(section) {
  state.activeSection = section;
  saveData();

  $$(".navItem").forEach(btn => btn.classList.toggle("is-active", btn.dataset.section === section));
  renderSection(section);
}

$$(".navItem").forEach(btn => {
  btn.addEventListener("click", () => setActiveSection(btn.dataset.section));
});

$$(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $$(".chip").forEach(c => c.classList.toggle("is-active", c === chip));
    const q = chip.dataset.quick;
    if (q === "overview") {
      toast("Quick action", "Overview is built into each section card.");
      // Keep current section
      renderSection(state.activeSection);
      return;
    }
    if (q === "pomodoro") {
      setActiveSection("studyroom"); // Pomodoro lives there too
      return;
    }
    if (q === "today") {
      setActiveSection("tasks");
      toast("Today", "Sorted tasks by nearest due date.");
      state.tasks = sortTasksByDue(state.tasks);
      saveData();
      renderSection("tasks");
    }
  });
});

/* -------------------------
   Modal System (Reusable)
   ------------------------- */
let modalContext = null; // { type, mode, id, onSave }

function openModal({ title, subtitle, fieldsHtml, initial = {}, onSave }) {
  modalContext = { initial, onSave };
  modalTitle.textContent = title;
  modalSubtitle.textContent = subtitle;

  modalForm.innerHTML = fieldsHtml;
  // Fill initial values if matching names exist
  Object.entries(initial).forEach(([k, v]) => {
    const el = modalForm.querySelector(`[name="${k}"]`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(v);
    else el.value = v ?? "";
  });

  modalOverlay.classList.add("show");
  modalOverlay.setAttribute("aria-hidden", "false");

  // Focus first input for accessibility
  const first = modalForm.querySelector("input, textarea, select, button");
  if (first) first.focus();
}

function closeModal() {
  modalOverlay.classList.remove("show");
  modalOverlay.setAttribute("aria-hidden", "true");
  modalForm.innerHTML = "";
  modalContext = null;
}

modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalOverlay.classList.contains("show")) closeModal();
});

modalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!modalContext?.onSave) return;

  const data = Object.fromEntries(new FormData(modalForm).entries());
  // normalize checkbox
  $$('input[type="checkbox"]', modalForm).forEach(cb => data[cb.name] = cb.checked);

  const ok = modalContext.onSave(data);
  if (ok !== false) closeModal();
});

/* -------------------------
   Section Rendering
   ------------------------- */
function renderSection(section) {
  // Clear action bar
  mainActions.innerHTML = "";

  // Route
  switch (section) {
    case "tasks": renderTasks(); break;
    case "notes": renderNotes(); break;
    case "timetable": renderTimetable(); break;
    case "assignments": renderAssignments(); break;
    case "flashcards": renderFlashcards(); break;
    case "studyroom": renderStudyRoom(); break;
    default: renderTasks();
  }
}

/* -------------------------
   Badges
   ------------------------- */
function updateBadges() {
  const totalTasks = state.tasks.length;
  const openTasks = state.tasks.filter(t => !t.done).length;

  badgeTasks.textContent = String(openTasks);
  badgeNotes.textContent = String(state.notes.length);
  badgeAssignments.textContent = String(state.assignments.filter(a => !a.done).length);
  badgeDecks.textContent = String(state.flashcards.decks.length);

  // Update mini timer readout
  miniTimer.textContent = secondsToMMSS(state.pomodoro.secondsLeft);
  miniTimerStart.textContent = state.pomodoro.isRunning ? "Pause" : "Start";
}

/* =========================================================
   TASKS
   ========================================================= */
function sortTasksByDue(tasks) {
  return [...tasks].sort((a, b) => {
    const ad = a.due ? new Date(a.due).getTime() : Infinity;
    const bd = b.due ? new Date(b.due).getTime() : Infinity;
    return ad - bd;
  });
}

function renderTasks() {
  sectionTitle.textContent = "Tasks";
  sectionSubtitle.textContent = "Plan your day and crush your goals.";

  // Actions
  const addBtn = actionButton("➕ Add Task", "Add a new task", () => openTaskModal());
  const sortBtn = actionButton("⇅ Sort by Due", "Sort tasks by due date", () => {
    state.tasks = sortTasksByDue(state.tasks);
    saveData();
    toast("Sorted", "Tasks sorted by due date.");
    renderTasks();
  });
  const clearDoneBtn = actionButton("🧹 Clear Completed", "Remove completed tasks", () => {
    const before = state.tasks.length;
    state.tasks = state.tasks.filter(t => !t.done);
    saveData();
    toast("Cleared", `Removed ${before - state.tasks.length} completed task(s).`);
    renderTasks();
  }, "ghost");

  mainActions.append(addBtn, sortBtn, clearDoneBtn);

  const cards = document.createElement("div");
  cards.className = "cardGrid";

  // Summary card
  const doneCount = state.tasks.filter(t => t.done).length;
  const openCount = state.tasks.length - doneCount;
  cards.appendChild(cardTemplate(
    "Today at a glance",
    "A quick snapshot of your progress.",
    `
      <div class="row two">
        <div class="item" style="grid-template-columns: 1fr;">
          <div class="itemMain">
            <div class="itemTitle">
              <span class="badge task">Open</span> ${openCount} task(s)
            </div>
            <div class="itemMeta">Keep the momentum—small wins compound.</div>
          </div>
        </div>
        <div class="item" style="grid-template-columns: 1fr;">
          <div class="itemMain">
            <div class="itemTitle">
              <span class="badge" style="border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.12);">Completed</span> ${doneCount} task(s)
            </div>
            <div class="itemMeta">Nice—mark tasks done to get a satisfying boost.</div>
          </div>
        </div>
      </div>
    `
  ));

  // Tasks list card
  const listHtml = `
    <div class="list">
      ${state.tasks.map(t => taskRowHtml(t)).join("")}
    </div>
  `;
  cards.appendChild(cardTemplate("Task Board", "Add, edit, complete, and stay on track.", listHtml));

  contentRoot.innerHTML = "";
  contentRoot.appendChild(cards);

  // Wire events
  $$(".task-check").forEach(btn => btn.addEventListener("click", () => toggleTaskDone(btn.dataset.id)));
  $$(".task-edit").forEach(btn => btn.addEventListener("click", () => openTaskModal(btn.dataset.id)));
  $$(".task-del").forEach(btn => btn.addEventListener("click", () => deleteTask(btn.dataset.id)));
}

function taskRowHtml(t) {
  const due = formatDate(t.due);
  const catBadge = categoryBadge(t.category);
  const priBadge = priorityBadge(t.priority);

  const titleClass = t.done ? "doneText" : "";
  const checkClass = t.done ? "check is-done" : "check";

  return `
    <div class="item ${t.done ? "pulseComplete" : ""}" data-id="${t.id}">
      <div class="itemMain">
        <div class="itemTitle">
          <span class="${checkClass} task-check" data-id="${t.id}" data-tooltip="Mark complete">
            ${t.done ? "✓" : ""}
          </span>
          <span class="${titleClass}">${escapeHtml(t.title)}</span>
          <span class="badge task">${escapeHtml(catBadge)}</span>
          <span class="badge">${escapeHtml(priBadge)}</span>
        </div>
        <div class="itemMeta">
          <span>📅 Due: <strong>${escapeHtml(due)}</strong></span>
        </div>
      </div>

      <div class="actions">
        <button class="iconPill task-edit" data-id="${t.id}" data-tooltip="Edit">✎</button>
        <button class="iconPill task-del" data-id="${t.id}" data-tooltip="Delete">🗑</button>
      </div>
    </div>
  `;
}

function categoryBadge(cat) {
  // Color-coding is visually implied via "task" badge; category text is still helpful
  return cat || "General";
}
function priorityBadge(p) {
  if (!p) return "Medium";
  return p;
}

function openTaskModal(taskId = null) {
  const existing = taskId ? state.tasks.find(t => t.id === taskId) : null;

  openModal({
    title: taskId ? "Edit Task" : "Add Task",
    subtitle: "Keep it specific and realistic.",
    initial: existing || { title: "", category: "Study", due: addDaysISO(0), priority: "Medium" },
    fieldsHtml: `
      <div class="row two">
        <div>
          <label class="label">Title</label>
          <input class="input" name="title" placeholder="e.g., Review lecture notes" required />
        </div>
        <div>
          <label class="label">Category</label>
          <select name="category" class="input">
            <option>Study</option>
            <option>School</option>
            <option>Homework</option>
            <option>Personal</option>
          </select>
        </div>
      </div>

      <div class="row two">
        <div>
          <label class="label">Due date</label>
          <input class="input" type="date" name="due" />
        </div>
        <div>
          <label class="label">Priority</label>
          <select name="priority" class="input">
            <option>Low</option>
            <option selected>Medium</option>
            <option>High</option>
          </select>
        </div>
      </div>
    `,
    onSave: (data) => {
      const title = (data.title || "").trim();
      if (!title) return false;

      if (existing) {
        existing.title = title;
        existing.category = data.category;
        existing.due = data.due;
        existing.priority = data.priority;
        toast("Updated", "Task updated successfully.");
      } else {
        state.tasks.unshift({
          id: uid(),
          title,
          category: data.category,
          due: data.due,
          priority: data.priority,
          done: false
        });
        toast("Added", "New task created.");
      }
      saveData();
      renderTasks();
    }
  });
}

function toggleTaskDone(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveData();
  toast(t.done ? "Nice!" : "Reopened", t.done ? "Task completed." : "Task marked as not done.");
  renderTasks();
}

function deleteTask(id) {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveData();
  toast("Deleted", `${before - state.tasks.length} task removed.`);
  renderTasks();
}

/* =========================================================
   NOTES
   ========================================================= */
function renderNotes() {
  sectionTitle.textContent = "Notes";
  sectionSubtitle.textContent = "Capture ideas, summaries, and study snippets.";

  mainActions.append(
    actionButton("➕ Add Note", "Create a new note", () => openNoteModal()),
    actionButton("🧠 Study Tip", "Get a quick suggestion", () => toast("Study Tip", "Try active recall: write questions first, then answer without looking."), "ghost")
  );

  const cards = document.createElement("div");
  cards.className = "cardGrid";

  const notesList = `
    <div class="list">
      ${state.notes
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(n => noteRowHtml(n))
      .join("")}
    </div>
  `;

  cards.appendChild(cardTemplate(
    "Note Library",
    "Your most recent notes appear first. Everything saves automatically.",
    notesList
  ));

  contentRoot.innerHTML = "";
  contentRoot.appendChild(cards);

  $$(".note-open").forEach(btn => btn.addEventListener("click", () => openNoteModal(btn.dataset.id)));
  $$(".note-del").forEach(btn => btn.addEventListener("click", () => deleteNote(btn.dataset.id)));
}

function noteRowHtml(n) {
  const snippet = (n.body || "").slice(0, 90) + ((n.body || "").length > 90 ? "…" : "");
  const updated = new Date(n.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `
    <div class="item">
      <div class="itemMain">
        <div class="itemTitle">
          <span class="badge note">Note</span>
          <span>${escapeHtml(n.title)}</span>
        </div>
        <div class="itemMeta">
          <span>🕒 Updated: <strong>${escapeHtml(updated)}</strong></span>
          <span>•</span>
          <span>${escapeHtml(snippet)}</span>
        </div>
      </div>
      <div class="actions">
        <button class="iconPill note-open" data-id="${n.id}" data-tooltip="Edit">✎</button>
        <button class="iconPill note-del" data-id="${n.id}" data-tooltip="Delete">🗑</button>
      </div>
    </div>
  `;
}

function openNoteModal(noteId = null) {
  const existing = noteId ? state.notes.find(n => n.id === noteId) : null;

  openModal({
    title: noteId ? "Edit Note" : "Add Note",
    subtitle: "Write concise summaries you can revise quickly.",
    initial: existing || { title: "", body: "" },
    fieldsHtml: `
      <div>
        <label class="label">Title</label>
        <input class="input" name="title" placeholder="e.g., Photosynthesis summary" required />
      </div>
      <div>
        <label class="label">Content</label>
        <textarea class="input" name="body" rows="10" placeholder="Write your note..." required></textarea>
      </div>
    `,
    onSave: (data) => {
      const title = (data.title || "").trim();
      const body = (data.body || "").trim();
      if (!title || !body) return false;

      if (existing) {
        existing.title = title;
        existing.body = body;
        existing.updatedAt = Date.now();
        toast("Updated", "Note saved.");
      } else {
        state.notes.unshift({ id: uid(), title, body, updatedAt: Date.now() });
        toast("Added", "New note created.");
      }
      saveData();
      renderNotes();
    }
  });
}

function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  saveData();
  toast("Deleted", "Note removed.");
  renderNotes();
}

/* =========================================================
   TIMETABLE (Drag & Drop)
   ========================================================= */
const TT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const TT_TIMES = ["08:00", "10:00", "12:00", "14:00", "16:00"];

function renderTimetable() {
  sectionTitle.textContent = "Timetable";
  sectionSubtitle.textContent = "Drag subjects into your weekly schedule.";

  mainActions.append(
    actionButton("➕ Add Subject", "Add a draggable subject chip", () => openSubjectModal()),
    actionButton("🧽 Clear Week", "Remove all scheduled blocks", () => {
      state.timetable.slots = {};
      saveData();
      toast("Cleared", "Timetable cleared.");
      renderTimetable();
    }, "ghost")
  );

  const wrap = document.createElement("div");
  wrap.className = "ttWrap";

  // Palette
  const palette = document.createElement("div");
  palette.className = "ttPalette";
  palette.innerHTML = `
    <div style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <div>
        <div style="font-weight:900;">Subject Palette</div>
        <div style="color:var(--muted); font-size:12px;">Tip: Drag a subject onto a time slot. Click ✕ to remove a block.</div>
      </div>
      <span class="badge">DnD enabled</span>
    </div>
    ${state.timetable.palette.map(s => `
      <div class="ttChip" draggable="true" data-subject-id="${s.id}" data-tooltip="Drag to timetable">
        <span class="ttDot" style="background:${s.color}"></span>
        <strong>${escapeHtml(s.title)}</strong>
      </div>
    `).join("")}
  `;
  wrap.appendChild(palette);

  // Grid
  const grid = document.createElement("div");
  grid.className = "ttGrid";

  // Header row
  const head = document.createElement("div");
  head.className = "ttHead";
  head.innerHTML = `
    <div class="ttCell ttTime"><strong>Time</strong></div>
    ${TT_DAYS.map(d => `<div class="ttCell"><strong>${d}</strong></div>`).join("")}
  `;
  grid.appendChild(head);

  // Time rows
  TT_TIMES.forEach(time => {
    const row = document.createElement("div");
    row.className = "ttRow";
    row.innerHTML = `
      <div class="ttCell ttTime">${escapeHtml(time)}</div>
      ${TT_DAYS.map(day => {
      const key = `${day}_${time}`;
      const slot = state.timetable.slots[key];
      return `
          <div class="ttCell ttSlot" data-slot="${key}">
            ${slot ? timetableBlockHtml(key, slot) : ""}
          </div>
        `;
    }).join("")}
    `;
    grid.appendChild(row);
  });

  wrap.appendChild(grid);
  contentRoot.innerHTML = "";
  contentRoot.appendChild(wrap);

  // DnD wires
  $$(".ttChip").forEach(chip => {
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", chip.dataset.subjectId);
      e.dataTransfer.effectAllowed = "copy";
    });
  });

  $$(".ttSlot").forEach(slot => {
    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      slot.classList.add("isOver");
      e.dataTransfer.dropEffect = "copy";
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("isOver"));
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("isOver");
      const subjectId = e.dataTransfer.getData("text/plain");
      assignSubjectToSlot(subjectId, slot.dataset.slot);
    });
  });

  $$(".ttRemove").forEach(btn => btn.addEventListener("click", () => removeSlot(btn.dataset.slot)));
}

function timetableBlockHtml(key, slot) {
  return `
    <div class="ttBlock" style="border-color:${slot.color}55; background:${slot.color}22;">
      <div>
        <div class="ttBlockTitle">${escapeHtml(slot.title)}</div>
        <div class="ttBlockSmall">${escapeHtml(key.replace("_", " • "))}</div>
      </div>
      <div class="ttRemove" data-slot="${key}" data-tooltip="Remove">✕</div>
    </div>
  `;
}

function assignSubjectToSlot(subjectId, slotKey) {
  const subj = state.timetable.palette.find(s => s.id === subjectId);
  if (!subj) return;

  state.timetable.slots[slotKey] = { title: subj.title, color: subj.color };
  saveData();
  toast("Scheduled", `${subj.title} added to ${slotKey.replace("_", " at ")}.`);
  renderTimetable();
}

function removeSlot(slotKey) {
  delete state.timetable.slots[slotKey];
  saveData();
  toast("Removed", "Schedule block removed.");
  renderTimetable();
}

function openSubjectModal() {
  openModal({
    title: "Add Subject",
    subtitle: "Create a draggable chip for your timetable.",
    initial: { title: "", color: "#4f46e5" },
    fieldsHtml: `
      <div class="row two">
        <div>
          <label class="label">Subject name</label>
          <input class="input" name="title" placeholder="e.g., Computer Science" required />
        </div>
        <div>
          <label class="label">Color</label>
          <input class="input" type="color" name="color" />
        </div>
      </div>
    `,
    onSave: (data) => {
      const title = (data.title || "").trim();
      if (!title) return false;
      state.timetable.palette.unshift({ id: uid(), title, color: data.color || "#4f46e5" });
      saveData();
      toast("Added", "Subject palette updated.");
      renderTimetable();
    }
  });
}

/* =========================================================
   ASSIGNMENTS
   ========================================================= */
function renderAssignments() {
  sectionTitle.textContent = "Assignments";
  sectionSubtitle.textContent = "Track deadlines and finish strong.";

  mainActions.append(
    actionButton("➕ Add Assignment", "Add an assignment", () => openAssignmentModal()),
    actionButton("⇅ Sort by Deadline", "Sort by due date", () => {
      state.assignments = [...state.assignments].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
      saveData();
      toast("Sorted", "Assignments sorted by deadline.");
      renderAssignments();
    })
  );

  const cards = document.createElement("div");
  cards.className = "cardGrid";

  const upcoming = state.assignments
    .filter(a => !a.done)
    .slice()
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, 3);

  cards.appendChild(cardTemplate(
    "Upcoming Deadlines",
    "Your next 3 assignments (not completed).",
    `
      <div class="list">
        ${upcoming.length ? upcoming.map(a => assignmentRowHtml(a, true)).join("") : `<div class="item"><div class="itemMain"><div class="itemTitle">All caught up 🎉</div><div class="itemMeta">Add assignments to track them here.</div></div></div>`}
      </div>
    `
  ));

  cards.appendChild(cardTemplate(
    "Assignment Tracker",
    "Add, update status, and mark as done.",
    `
      <div class="list">
        ${state.assignments.map(a => assignmentRowHtml(a, false)).join("")}
      </div>
    `
  ));

  contentRoot.innerHTML = "";
  contentRoot.appendChild(cards);

  $$(".asgn-done").forEach(btn => btn.addEventListener("click", () => toggleAssignmentDone(btn.dataset.id)));
  $$(".asgn-edit").forEach(btn => btn.addEventListener("click", () => openAssignmentModal(btn.dataset.id)));
  $$(".asgn-del").forEach(btn => btn.addEventListener("click", () => deleteAssignment(btn.dataset.id)));
}

function assignmentRowHtml(a, compact) {
  const due = formatDate(a.due);
  const checkClass = a.done ? "check is-done" : "check";
  const titleClass = a.done ? "doneText" : "";
  const meta = compact
    ? `📅 Due: <strong>${escapeHtml(due)}</strong> • ${escapeHtml(a.subject)}`
    : `📅 Due: <strong>${escapeHtml(due)}</strong> • ${escapeHtml(a.subject)} • Status: <strong>${escapeHtml(a.status)}</strong>`;

  return `
    <div class="item">
      <div class="itemMain">
        <div class="itemTitle">
          <span class="${checkClass} asgn-done" data-id="${a.id}" data-tooltip="Mark complete">${a.done ? "✓" : ""}</span>
          <span class="${titleClass}">${escapeHtml(a.title)}</span>
          <span class="badge assign">${escapeHtml(a.subject || "Subject")}</span>
        </div>
        <div class="itemMeta">${meta}</div>
      </div>
      ${compact ? "" : `
        <div class="actions">
          <button class="iconPill asgn-edit" data-id="${a.id}" data-tooltip="Edit">✎</button>
          <button class="iconPill asgn-del" data-id="${a.id}" data-tooltip="Delete">🗑</button>
        </div>
      `}
    </div>
  `;
}

function openAssignmentModal(id = null) {
  const existing = id ? state.assignments.find(a => a.id === id) : null;

  openModal({
    title: id ? "Edit Assignment" : "Add Assignment",
    subtitle: "A clear deadline makes planning easier.",
    initial: existing || { title: "", subject: "Math", due: addDaysISO(3), status: "Not Started" },
    fieldsHtml: `
      <div class="row two">
        <div>
          <label class="label">Title</label>
          <input class="input" name="title" placeholder="e.g., Research outline" required />
        </div>
        <div>
          <label class="label">Subject</label>
          <input class="input" name="subject" placeholder="e.g., Biology" required />
        </div>
      </div>
      <div class="row two">
        <div>
          <label class="label">Deadline</label>
          <input class="input" type="date" name="due" required />
        </div>
        <div>
          <label class="label">Status</label>
          <select class="input" name="status">
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Done</option>
          </select>
        </div>
      </div>
    `,
    onSave: (data) => {
      const title = (data.title || "").trim();
      const subject = (data.subject || "").trim();
      if (!title || !subject) return false;

      if (existing) {
        existing.title = title;
        existing.subject = subject;
        existing.due = data.due;
        existing.status = data.status;
        existing.done = data.status === "Done" ? true : existing.done;
        toast("Updated", "Assignment updated.");
      } else {
        state.assignments.unshift({
          id: uid(),
          title,
          subject,
          due: data.due,
          status: data.status,
          done: data.status === "Done"
        });
        toast("Added", "Assignment created.");
      }
      saveData();
      renderAssignments();
    }
  });
}

function toggleAssignmentDone(id) {
  const a = state.assignments.find(x => x.id === id);
  if (!a) return;
  a.done = !a.done;
  if (a.done) a.status = "Done";
  saveData();
  toast(a.done ? "Completed" : "Reopened", a.done ? "Assignment marked done." : "Assignment marked not done.");
  renderAssignments();
}

function deleteAssignment(id) {
  state.assignments = state.assignments.filter(a => a.id !== id);
  saveData();
  toast("Deleted", "Assignment removed.");
  renderAssignments();
}

/* =========================================================
   FLASHCARDS
   - Decks
   - Flip view
   - Quiz mode
   ========================================================= */
let flashcardUI = {
  activeDeckId: null,
  activeCardIndex: 0,
  quiz: {
    enabled: false,
    index: 0,
    correct: 0,
    order: []
  }
};

function renderFlashcards() {
  sectionTitle.textContent = "Flashcards";
  sectionSubtitle.textContent = "Create decks, flip cards, and quiz yourself.";

  mainActions.append(
    actionButton("➕ New Deck", "Create a new deck", () => openDeckModal()),
    actionButton("➕ Add Card", "Add a card to current deck", () => {
      const deck = getActiveDeck();
      if (!deck) return toast("Pick a deck", "Select a deck first.");
      openCardModal(deck.id);
    }),
    actionButton("🎯 Quiz Mode", "Practice with quick prompts", () => toggleQuizMode())
  );

  const decks = state.flashcards.decks;

  // Ensure active deck is valid
  if (!flashcardUI.activeDeckId && decks[0]) flashcardUI.activeDeckId = decks[0].id;
  if (flashcardUI.activeDeckId && !decks.some(d => d.id === flashcardUI.activeDeckId)) {
    flashcardUI.activeDeckId = decks[0]?.id || null;
  }

  const deck = getActiveDeck();

  const wrap = document.createElement("div");
  wrap.className = "cardGrid";

  // Left: Deck list
  wrap.appendChild(cardTemplate(
    "Decks",
    "Switch decks or manage them.",
    `
      <div class="list">
        ${decks.map(d => `
          <div class="item" style="cursor:pointer;" data-deck="${d.id}">
            <div class="itemMain">
              <div class="itemTitle">
                <span class="badge deck">Deck</span>
                <span>${escapeHtml(d.name)}</span>
              </div>
              <div class="itemMeta">${d.cards.length} card(s)</div>
            </div>
            <div class="actions">
              <button class="iconPill deck-edit" data-id="${d.id}" data-tooltip="Rename">✎</button>
              <button class="iconPill deck-del" data-id="${d.id}" data-tooltip="Delete">🗑</button>
            </div>
          </div>
        `).join("")}
      </div>
    `
  ));

  // Right: Stage (flip/quiz)
  wrap.appendChild(cardTemplate(
    "Study Stage",
    deck ? `Active deck: ${escapeHtml(deck.name)}` : "Create a deck to begin.",
    deck ? flashcardStageHtml(deck) : emptyStateHtml("No deck yet", "Create a deck and add cards to start studying.")
  ));

  contentRoot.innerHTML = "";
  contentRoot.appendChild(wrap);

  // Deck selection
  $$("[data-deck]").forEach(el => el.addEventListener("click", (e) => {
    // Avoid selecting when clicking edit/delete buttons
    if (e.target.closest(".deck-edit") || e.target.closest(".deck-del")) return;
    flashcardUI.activeDeckId = el.dataset.deck;
    flashcardUI.activeCardIndex = 0;
    flashcardUI.quiz = { enabled: false, index: 0, correct: 0, order: [] };
    renderFlashcards();
  }));

  // Deck manage
  $$(".deck-edit").forEach(btn => btn.addEventListener("click", () => openDeckModal(btn.dataset.id)));
  $$(".deck-del").forEach(btn => btn.addEventListener("click", () => deleteDeck(btn.dataset.id)));

  // Flip + navigation
  const flip = $(".flipCard");
  if (flip) flip.addEventListener("click", () => flip.classList.toggle("isFlipped"));

  const prevBtn = $("#fcPrev");
  const nextBtn = $("#fcNext");
  if (prevBtn) prevBtn.addEventListener("click", () => moveCard(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => moveCard(1));

  const editBtn = $("#fcEdit");
  const delBtn = $("#fcDelete");
  if (editBtn) editBtn.addEventListener("click", () => {
    const d = getActiveDeck(); if (!d) return;
    const c = d.cards[flashcardUI.activeCardIndex]; if (!c) return;
    openCardModal(d.id, c.id);
  });
  if (delBtn) delBtn.addEventListener("click", () => deleteCard());

  // Quiz actions
  const quizGood = $("#quizGood");
  const quizBad = $("#quizBad");
  if (quizGood) quizGood.addEventListener("click", () => answerQuiz(true));
  if (quizBad) quizBad.addEventListener("click", () => answerQuiz(false));
}

function getActiveDeck() {
  return state.flashcards.decks.find(d => d.id === flashcardUI.activeDeckId) || null;
}

function flashcardStageHtml(deck) {
  const cards = deck.cards;
  if (!cards.length) return emptyStateHtml("No cards", "Add your first flashcard to this deck.");

  if (flashcardUI.quiz.enabled) {
    return quizHtml(deck);
  }

  // Ensure index safe
  flashcardUI.activeCardIndex = clamp(flashcardUI.activeCardIndex, 0, cards.length - 1);
  const card = cards[flashcardUI.activeCardIndex];

  return `
    <div class="fcWrap">
      <div class="fcStage">
        <div class="badge">Card ${flashcardUI.activeCardIndex + 1} / ${cards.length} • Click card to flip</div>

        <div class="flipCard" data-tooltip="Click to flip">
          <div class="flipInner">
            <div class="flipFace">
              <div class="fcBig">${escapeHtml(card.front)}</div>
              <div class="fcSmall">Front • Try to answer before flipping.</div>
            </div>
            <div class="flipFace flipBack">
              <div class="fcBig">${escapeHtml(card.back)}</div>
              <div class="fcSmall">Back • Great! Move to the next card.</div>
            </div>
          </div>
        </div>

        <div class="timerRow">
          <button class="btn ghost" id="fcPrev" data-tooltip="Previous">← Prev</button>
          <button class="btn ghost" id="fcNext" data-tooltip="Next">Next →</button>
          <button class="btn ghost" id="fcEdit" data-tooltip="Edit card">✎ Edit</button>
          <button class="btn ghost" id="fcDelete" data-tooltip="Delete card">🗑 Delete</button>
        </div>
      </div>
    </div>
  `;
}

function emptyStateHtml(title, hint) {
  return `
    <div class="item" style="grid-template-columns: 1fr;">
      <div class="itemMain">
        <div class="itemTitle">${escapeHtml(title)}</div>
        <div class="itemMeta">${escapeHtml(hint)}</div>
      </div>
    </div>
  `;
}

function moveCard(dir) {
  const deck = getActiveDeck();
  if (!deck) return;
  const max = deck.cards.length - 1;
  flashcardUI.activeCardIndex = clamp(flashcardUI.activeCardIndex + dir, 0, max);
  renderFlashcards();
}

function openDeckModal(deckId = null) {
  const existing = deckId ? state.flashcards.decks.find(d => d.id === deckId) : null;

  openModal({
    title: deckId ? "Rename Deck" : "Create Deck",
    subtitle: "Decks help organize topics and subjects.",
    initial: existing || { name: "" },
    fieldsHtml: `
      <div>
        <label class="label">Deck name</label>
        <input class="input" name="name" placeholder="e.g., Algebra — Formulas" required />
      </div>
    `,
    onSave: (data) => {
      const name = (data.name || "").trim();
      if (!name) return false;

      if (existing) {
        existing.name = name;
        toast("Updated", "Deck renamed.");
      } else {
        const deck = { id: uid(), name, cards: [] };
        state.flashcards.decks.unshift(deck);
        flashcardUI.activeDeckId = deck.id;
        flashcardUI.activeCardIndex = 0;
        toast("Created", "New deck added.");
      }
      saveData();
      renderFlashcards();
    }
  });
}

function deleteDeck(id) {
  const before = state.flashcards.decks.length;
  state.flashcards.decks = state.flashcards.decks.filter(d => d.id !== id);
  if (flashcardUI.activeDeckId === id) flashcardUI.activeDeckId = state.flashcards.decks[0]?.id || null;
  flashcardUI.activeCardIndex = 0;
  flashcardUI.quiz = { enabled: false, index: 0, correct: 0, order: [] };
  saveData();
  toast("Deleted", `${before - state.flashcards.decks.length} deck removed.`);
  renderFlashcards();
}

function openCardModal(deckId, cardId = null) {
  const deck = state.flashcards.decks.find(d => d.id === deckId);
  if (!deck) return;

  const existing = cardId ? deck.cards.find(c => c.id === cardId) : null;

  openModal({
    title: cardId ? "Edit Flashcard" : "Add Flashcard",
    subtitle: "Keep prompts short for faster recall.",
    initial: existing || { front: "", back: "" },
    fieldsHtml: `
      <div>
        <label class="label">Front</label>
        <input class="input" name="front" placeholder="Question / prompt" required />
      </div>
      <div>
        <label class="label">Back</label>
        <textarea class="input" name="back" rows="5" placeholder="Answer / explanation" required></textarea>
      </div>
    `,
    onSave: (data) => {
      const front = (data.front || "").trim();
      const back = (data.back || "").trim();
      if (!front || !back) return false;

      if (existing) {
        existing.front = front;
        existing.back = back;
        toast("Updated", "Card updated.");
      } else {
        deck.cards.push({ id: uid(), front, back });
        toast("Added", "Card added to deck.");
      }
      saveData();
      renderFlashcards();
    }
  });
}

function deleteCard() {
  const deck = getActiveDeck();
  if (!deck) return;
  const card = deck.cards[flashcardUI.activeCardIndex];
  if (!card) return;

  deck.cards = deck.cards.filter(c => c.id !== card.id);
  flashcardUI.activeCardIndex = clamp(flashcardUI.activeCardIndex, 0, deck.cards.length - 1);
  saveData();
  toast("Deleted", "Card removed.");
  renderFlashcards();
}

/* -------- Quiz Mode -------- */
function toggleQuizMode() {
  const deck = getActiveDeck();
  if (!deck) return toast("Pick a deck", "Select a deck to quiz.");
  if (!deck.cards.length) return toast("No cards", "Add cards to quiz yourself.");

  flashcardUI.quiz.enabled = !flashcardUI.quiz.enabled;

  if (flashcardUI.quiz.enabled) {
    // Create randomized order
    const order = deck.cards.map((_, i) => i).sort(() => Math.random() - 0.5);
    flashcardUI.quiz = { enabled: true, index: 0, correct: 0, order };
    toast("Quiz mode", "Rate yourself: ✅ got it / 🤔 again.");
  } else {
    flashcardUI.quiz = { enabled: false, index: 0, correct: 0, order: [] };
    toast("Quiz mode", "Exited quiz mode.");
  }
  renderFlashcards();
}

function quizHtml(deck) {
  const q = flashcardUI.quiz;
  const total = q.order.length;
  const idx = q.index;

  if (idx >= total) {
    const score = Math.round((q.correct / total) * 100);
    return `
      <div class="fcWrap">
        <div class="fcStage">
          <div class="badge">Quiz Complete</div>
          <div class="fcBig">Score: ${q.correct}/${total} (${score}%)</div>
          <div class="fcSmall">Keep going—repeat the deck tomorrow for spaced repetition.</div>
          <div class="timerRow">
            <button class="btn" data-tooltip="Restart quiz" onclick="window.__restartQuiz()">Restart</button>
            <button class="btn ghost" data-tooltip="Exit quiz" onclick="window.__exitQuiz()">Exit</button>
          </div>
        </div>
      </div>
    `;
  }

  const cardIndex = q.order[idx];
  const card = deck.cards[cardIndex];

  return `
    <div class="fcWrap">
      <div class="fcStage">
        <div class="badge">Quiz ${idx + 1} / ${total}</div>
        <div class="flipCard isFlipped" data-tooltip="In quiz mode, answer first, then reveal">
          <div class="flipInner">
            <div class="flipFace">
              <div class="fcBig">${escapeHtml(card.front)}</div>
              <div class="fcSmall">Try to answer. Then decide if you got it.</div>
            </div>
            <div class="flipFace flipBack">
              <div class="fcBig">${escapeHtml(card.back)}</div>
              <div class="fcSmall">Be honest—this builds real progress.</div>
            </div>
          </div>
        </div>

        <div class="timerRow">
          <button class="btn ghost" id="quizBad" data-tooltip="Need again">🤔 Again</button>
          <button class="btn" id="quizGood" data-tooltip="Got it">✅ Got it</button>
        </div>

        <div class="fcSmall">Current score: ${q.correct}/${idx}</div>
      </div>
    </div>
  `;
}

// Small helpers to allow inline handlers above (kept minimal)
window.__restartQuiz = () => {
  const deck = getActiveDeck(); if (!deck) return;
  flashcardUI.quiz = { enabled: true, index: 0, correct: 0, order: deck.cards.map((_, i) => i).sort(() => Math.random() - 0.5) };
  renderFlashcards();
};
window.__exitQuiz = () => {
  flashcardUI.quiz = { enabled: false, index: 0, correct: 0, order: [] };
  renderFlashcards();
};

function answerQuiz(good) {
  const q = flashcardUI.quiz;
  if (!q.enabled) return;
  if (good) q.correct += 1;
  q.index += 1;
  renderFlashcards();
}

/* =========================================================
   STUDY ROOM
   - Pomodoro timer (full controls)
   ========================================================= */
let pomodoroInterval = null;

function renderStudyRoom() {
  sectionTitle.textContent = "Study Room";
  sectionSubtitle.textContent = "A calm space: Pomodoro + focus rituals.";

  mainActions.append(
    actionButton("🎯 Start Focus", "Switch to focus mode", () => setPomodoroMode("focus")),
    actionButton("☕ Short Break", "Switch to short break", () => setPomodoroMode("short"), "ghost"),
    actionButton("🛌 Long Break", "Switch to long break", () => setPomodoroMode("long"), "ghost")
  );

  const wrap = document.createElement("div");
  wrap.className = "cardGrid";

  const modes = {
    focus: { label: "Focus", minutes: 25 },
    short: { label: "Short Break", minutes: 5 },
    long: { label: "Long Break", minutes: 15 }
  };
  const modeInfo = modes[state.pomodoro.mode] || modes.focus;

  wrap.appendChild(cardTemplate(
    "Pomodoro Timer",
    "Start/pause/reset. The timer keeps running even if you switch sections.",
    `
      <div class="timerCard">
        <div class="badge">Mode: <strong>${escapeHtml(modeInfo.label)}</strong> • ${modeInfo.minutes} min</div>
        <div class="timerReadout" id="timerReadout">${escapeHtml(secondsToMMSS(state.pomodoro.secondsLeft))}</div>

        <div class="timerRow">
          <button class="btn" id="timerStart" data-tooltip="Start/Pause">${state.pomodoro.isRunning ? "Pause" : "Start"}</button>
          <button class="btn ghost" id="timerReset" data-tooltip="Reset">Reset</button>
          <button class="btn ghost" id="timerSkip" data-tooltip="Skip to next">Skip</button>
        </div>

        <div class="row three">
          <div>
            <label class="label">Focus (min)</label>
            <input class="input" type="number" id="setFocus" min="10" max="90" value="25" />
          </div>
          <div>
            <label class="label">Short break (min)</label>
            <input class="input" type="number" id="setShort" min="3" max="30" value="5" />
          </div>
          <div>
            <label class="label">Long break (min)</label>
            <input class="input" type="number" id="setLong" min="5" max="60" value="15" />
          </div>
        </div>

        <div class="timerRow">
          <button class="btn ghost" id="applyDurations" data-tooltip="Apply durations">Apply durations</button>
          <span class="badge">Persistence: on</span>
        </div>

        <div class="item" style="grid-template-columns: 1fr;">
          <div class="itemMain">
            <div class="itemTitle">Focus Ritual</div>
            <div class="itemMeta">1) Put phone away • 2) One task only • 3) Start timer • 4) Small reward after break.</div>
          </div>
        </div>
      </div>
    `
  ));

  wrap.appendChild(cardTemplate(
    "Ambient Checklist",
    "A lightweight routine for deep work.",
    `
      <div class="list">
        ${[
      "Clear desk (1 min)",
      "Open notes + materials",
      "Set a single goal for this session",
      "Start Pomodoro",
      "Review: what changed after 25 minutes?"
    ].map(x => `
          <div class="item" style="grid-template-columns: 1fr;">
            <div class="itemMain">
              <div class="itemTitle">• ${escapeHtml(x)}</div>
              <div class="itemMeta">Tip: Keep the goal measurable (e.g., “finish 10 problems”).</div>
            </div>
          </div>
        `).join("")}
      </div>
    `
  ));

  contentRoot.innerHTML = "";
  contentRoot.appendChild(wrap);

  // Wire controls
  $("#timerStart")?.addEventListener("click", togglePomodoro);
  $("#timerReset")?.addEventListener("click", () => resetPomodoro(state.pomodoro.mode));
  $("#timerSkip")?.addEventListener("click", skipPomodoroMode);

  $("#applyDurations")?.addEventListener("click", () => {
    const focus = clamp(parseInt($("#setFocus").value, 10) || 25, 10, 90);
    const short = clamp(parseInt($("#setShort").value, 10) || 5, 3, 30);
    const long = clamp(parseInt($("#setLong").value, 10) || 15, 5, 60);
    // store custom durations on state
    state.pomodoro.custom = { focus, short, long };
    saveData();
    toast("Updated", "Pomodoro durations saved.");
    resetPomodoro(state.pomodoro.mode);
  });
}

/* -------------------------
   Pomodoro Timer Engine
   ------------------------- */
function getDurations() {
  const custom = state.pomodoro.custom || { focus: 25, short: 5, long: 15 };
  return {
    focus: clamp(custom.focus || 25, 10, 90),
    short: clamp(custom.short || 5, 3, 30),
    long: clamp(custom.long || 15, 5, 60),
  };
}

function setPomodoroMode(mode) {
  state.pomodoro.mode = mode;
  resetPomodoro(mode);
  toast("Mode changed", mode === "focus" ? "Focus time." : "Break time.");
  saveData();
  updateBadges();
  if (state.activeSection === "studyroom") renderStudyRoom();
}

function resetPomodoro(mode = state.pomodoro.mode) {
  const durations = getDurations();
  const minutes = durations[mode] ?? 25;
  state.pomodoro.secondsLeft = minutes * 60;
  state.pomodoro.lastTickAt = null;
  saveData();
  updateBadges();
  updatePomodoroUI();
}

function togglePomodoro() {
  state.pomodoro.isRunning = !state.pomodoro.isRunning;
  saveData();
  updateBadges();
  updatePomodoroUI();
  if (state.pomodoro.isRunning) startPomodoroLoop();
  else stopPomodoroLoop();
}

function startPomodoroLoop() {
  stopPomodoroLoop();
  state.pomodoro.lastTickAt = Date.now();
  pomodoroInterval = setInterval(() => {
    if (!state.pomodoro.isRunning) return;

    const now = Date.now();
    const last = state.pomodoro.lastTickAt ?? now;
    const deltaSec = Math.floor((now - last) / 1000);

    if (deltaSec > 0) {
      state.pomodoro.secondsLeft = Math.max(0, state.pomodoro.secondsLeft - deltaSec);
      state.pomodoro.lastTickAt = now;
      saveData();
      updateBadges();
      updatePomodoroUI();

      if (state.pomodoro.secondsLeft === 0) {
        // Auto stop + notify + auto-switch mode
        state.pomodoro.isRunning = false;
        saveData();
        stopPomodoroLoop();
        toast("Time!", "Session complete. Switching mode.");
        autoAdvancePomodoro();
      }
    }
  }, 400);
}

function stopPomodoroLoop() {
  if (pomodoroInterval) clearInterval(pomodoroInterval);
  pomodoroInterval = null;
}

function updatePomodoroUI() {
  // Main studyroom timer
  const readout = $("#timerReadout");
  if (readout) readout.textContent = secondsToMMSS(state.pomodoro.secondsLeft);

  const startBtn = $("#timerStart");
  if (startBtn) startBtn.textContent = state.pomodoro.isRunning ? "Pause" : "Start";

  // Sidebar mini timer
  miniTimer.textContent = secondsToMMSS(state.pomodoro.secondsLeft);
  miniTimerStart.textContent = state.pomodoro.isRunning ? "Pause" : "Start";
}

function secondsToMMSS(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function autoAdvancePomodoro() {
  // Simple cycle: focus -> short -> focus -> short -> focus -> long -> focus ...
  // We'll track a counter
  state.pomodoro.cycle = (state.pomodoro.cycle || 0) + 1;

  if (state.pomodoro.mode === "focus") {
    // after focus: every 3rd focus gives long break
    const focusCount = state.pomodoro.focusCount = (state.pomodoro.focusCount || 0) + 1;
    if (focusCount % 3 === 0) setPomodoroMode("long");
    else setPomodoroMode("short");
  } else {
    // after any break: go back to focus
    setPomodoroMode("focus");
  }
}

function skipPomodoroMode() {
  toast("Skipped", "Moving to the next mode.");
  autoAdvancePomodoro();
}

/* Mini timer control */
miniTimerStart.addEventListener("click", () => {
  togglePomodoro();
});

/* =========================================================
   Shared UI builders
   ========================================================= */
function actionButton(label, tooltip, onClick, variant = "") {
  const b = document.createElement("button");
  b.className = `btn ${variant}`.trim();
  b.textContent = label;
  b.setAttribute("data-tooltip", tooltip);
  b.addEventListener("click", onClick);
  return b;
}

function cardTemplate(title, hint, innerHtml) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div class="cardHeader">
      <div>
        <div class="cardTitle">${escapeHtml(title)}</div>
        <div class="cardHint">${escapeHtml(hint)}</div>
      </div>
      <span class="badge">Live</span>
    </div>
    ${innerHtml}
  `;
  return el;
}

/* =========================================================
   Boot
   ========================================================= */
function boot() {
  yearEl.textContent = String(new Date().getFullYear());

  applyTheme();
  updateBadges();

  // Restore last section
  setActiveSection(state.activeSection || "tasks");

  // If pomodoro was running, resume loop
  if (state.pomodoro.isRunning) startPomodoroLoop();
  updatePomodoroUI();
}

boot();
/* =========================
   NEW CODE BEGIN — SSX (Goals / Habits / Insights) module
   Self-contained. Does NOT depend on your existing app.js architecture.
   ========================= */
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const todayKey = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  const store = {
    ns: "ssx:v1",
    read() {
      try {
        return JSON.parse(localStorage.getItem(this.ns)) || { goals: [], habits: [], notes: [] };
      } catch {
        return { goals: [], habits: [], notes: [] };
      }
    },
    write(data) {
      localStorage.setItem(this.ns, JSON.stringify(data));
    }
  };

  const fmtPct = (n) => `${Math.max(0, Math.min(100, Math.round(n)))}%`;

  // ---------- UI Elements ----------
  const elFab = () => $("#ssxFab");
  const elDrawer = () => $("#ssxDrawer");
  const elDrawerOverlay = () => $("#ssxDrawerOverlay");
  const elDrawerTitle = () => $("#ssxDrawerTitle");
  const elDrawerSubtitle = () => $("#ssxDrawerSubtitle");
  const elDrawerBody = () => $("#ssxDrawerBody");
  const elDrawerClose = () => $("#ssxDrawerClose");

  const elModalOverlay = () => $("#ssxModalOverlay");
  const elModalClose = () => $("#ssxModalClose");
  const elModalCancel = () => $("#ssxModalCancel");
  const elModalForm = () => $("#ssxModalForm");

  const elBadgeGoals = () => $("#ssxBadgeGoals");
  const elBadgeHabits = () => $("#ssxBadgeHabits");

  // ---------- Drawer open/close ----------
  const openDrawer = (title, subtitle, html) => {
    elDrawerTitle().textContent = title;
    elDrawerSubtitle().textContent = subtitle;
    elDrawerBody().innerHTML = html;

    elDrawer().classList.add("is-open");
    elDrawerOverlay().classList.add("is-open");
    elDrawer().setAttribute("aria-hidden", "false");
    elDrawerOverlay().setAttribute("aria-hidden", "false");
  };

  const closeDrawer = () => {
    elDrawer().classList.remove("is-open");
    elDrawerOverlay().classList.remove("is-open");
    elDrawer().setAttribute("aria-hidden", "true");
    elDrawerOverlay().setAttribute("aria-hidden", "true");
  };

  // ---------- Modal open/close ----------
  const openModal = () => {
    elModalOverlay().classList.add("is-open");
    elModalOverlay().setAttribute("aria-hidden", "false");
    // small QoL: focus the title field
    const titleInput = elModalForm().elements.title;
    if (titleInput) setTimeout(() => titleInput.focus(), 0);
  };

  const closeModal = () => {
    elModalOverlay().classList.remove("is-open");
    elModalOverlay().setAttribute("aria-hidden", "true");
    elModalForm().reset();
  };

  // ---------- Renderers ----------
  function renderGoals() {
    const data = store.read();
    const goals = data.goals;

    const activeCount = goals.filter(g => !g.done).length;
    const doneCount = goals.filter(g => g.done).length;

    const html = `
      <div class="ssx-grid2">
        <div class="ssx-card">
          <div class="ssx-cardTitle">Active Goals <span class="ssx-pill">now</span></div>
          <div class="ssx-kpi">${activeCount}</div>
          <div class="ssx-muted">Keep it tight: 1–3 goals works best.</div>
        </div>
        <div class="ssx-card">
          <div class="ssx-cardTitle">Completed</div>
          <div class="ssx-kpi">${doneCount}</div>
          <div class="ssx-muted">Celebrate wins, then raise the bar.</div>
        </div>
      </div>

      <div class="ssx-row">
        <div class="ssx-muted">Tip: Track progress with the slider inside each goal.</div>
        <button class="ssx-btn" data-ssx-action="add-goal">Add Goal</button>
      </div>

      <div class="ssx-list">
        ${goals.length ? goals.map(goalItemHTML).join("") : emptyStateHTML("No goals yet", "Click “Add Goal” or use the ＋ button.")}
      </div>
    `;

    openDrawer("Goals", "Define outcomes. Track progress. Finish strong.", html);
    wireGoalsEvents();
    refreshBadges();
  }

  function goalItemHTML(g) {
    const pct = typeof g.progress === "number" ? g.progress : 0;
    const isDone = !!g.done;
    const metaBits = [];
    if (g.meta) metaBits.push(`<span class="ssx-pill">${escapeHtml(g.meta)}</span>`);
    metaBits.push(`<span class="ssx-pill">${isDone ? "Done" : "In progress"}</span>`);

    return `
      <div class="ssx-item" data-ssx-goal-id="${g.id}">
        <div class="ssx-itemTop">
          <div class="ssx-itemTitle">${escapeHtml(g.title)}</div>
          <div class="ssx-itemMeta">
            <button class="ssx-btn ghost" data-ssx-action="toggle-goal">${isDone ? "Reopen" : "Done"}</button>
            <button class="ssx-btn ghost" data-ssx-action="delete-goal">Delete</button>
          </div>
        </div>

        ${g.details ? `<div class="ssx-muted">${escapeHtml(g.details)}</div>` : ""}

        <div class="ssx-itemMeta">
          ${metaBits.join("")}
        </div>

        <div class="ssx-progressWrap">
          <div class="ssx-progressBar" aria-label="Progress">
            <div style="width:${fmtPct(pct)}"></div>
          </div>
          <div class="ssx-pill">${fmtPct(pct)}</div>
        </div>

        <input type="range" min="0" max="100" value="${Math.round(pct)}"
          data-ssx-action="progress-goal" aria-label="Adjust progress" />
      </div>
    `;
  }

  function renderHabits() {
    const data = store.read();
    const habits = data.habits;
    const day = todayKey();

    // Count completions today
    const completedToday = habits.filter(h => !!(h.days && h.days[day])).length;

    const html = `
      <div class="ssx-grid2">
        <div class="ssx-card">
          <div class="ssx-cardTitle">Today</div>
          <div class="ssx-kpi">${completedToday}/${habits.length}</div>
          <div class="ssx-muted">Small actions, big momentum.</div>
        </div>
        <div class="ssx-card">
          <div class="ssx-cardTitle">Streak Focus</div>
          <div class="ssx-kpi">${bestStreak(habits)}🔥</div>
          <div class="ssx-muted">Best streak across your habits.</div>
        </div>
      </div>

      <div class="ssx-row">
        <div class="ssx-muted">Click the check to mark today done.</div>
        <button class="ssx-btn" data-ssx-action="add-habit">Add Habit</button>
      </div>

      <div class="ssx-habitGrid">
        ${habits.length ? habits.map(h => habitRowHTML(h, day)).join("") : emptyStateHTML("No habits yet", "Add 1–2 habits you can actually sustain.")}
      </div>
    `;

    openDrawer("Habits", "Build consistency with daily micro-wins.", html);
    wireHabitsEvents();
    refreshBadges();
  }

  function habitRowHTML(h, day) {
    const on = !!(h.days && h.days[day]);
    return `
      <div class="ssx-habitRow" data-ssx-habit-id="${h.id}">
        <div>
          <div class="ssx-itemTitle">${escapeHtml(h.title)}</div>
          <div class="ssx-itemMeta">
            ${h.meta ? `<span class="ssx-pill">${escapeHtml(h.meta)}</span>` : `<span class="ssx-pill">daily</span>`}
            <span class="ssx-pill">streak: ${habitStreak(h)} </span>
          </div>
          ${h.details ? `<div class="ssx-muted" style="margin-top:6px">${escapeHtml(h.details)}</div>` : ""}
        </div>

        <div style="display:grid; gap:8px; justify-items:end">
          <button class="ssx-check ${on ? "is-on" : ""}" data-ssx-action="toggle-habit" aria-label="Toggle habit">
            ${on ? "✓" : "○"}
          </button>
          <button class="ssx-btn ghost" data-ssx-action="delete-habit">Delete</button>
        </div>
      </div>
    `;
  }

  function renderInsights() {
    const data = store.read();
    const goals = data.goals;
    const habits = data.habits;

    const totalGoals = goals.length;
    const doneGoals = goals.filter(g => g.done).length;
    const avgProgress = totalGoals
      ? goals.reduce((acc, g) => acc + (typeof g.progress === "number" ? g.progress : 0), 0) / totalGoals
      : 0;

    const day = todayKey();
    const habitsDoneToday = habits.filter(h => !!(h.days && h.days[day])).length;

    const html = `
      <div class="ssx-card">
        <div class="ssx-cardTitle">Snapshot <span class="ssx-pill">${escapeHtml(day)}</span></div>
        <div class="ssx-grid2" style="margin-top:10px">
          <div class="ssx-card">
            <div class="ssx-cardTitle">Goals Completed</div>
            <div class="ssx-kpi">${doneGoals}/${totalGoals}</div>
            <div class="ssx-muted">Completion rate: ${totalGoals ? fmtPct((doneGoals / totalGoals) * 100) : "—"}</div>
          </div>
          <div class="ssx-card">
            <div class="ssx-cardTitle">Habits Today</div>
            <div class="ssx-kpi">${habitsDoneToday}/${habits.length}</div>
            <div class="ssx-muted">Keep streaks alive.</div>
          </div>
        </div>
      </div>

      <div class="ssx-card">
        <div class="ssx-cardTitle">Goal Progress (Avg.)</div>
        <div class="ssx-progressWrap" style="margin-top:10px">
          <div class="ssx-progressBar" aria-label="Average progress">
            <div style="width:${fmtPct(avgProgress)}"></div>
          </div>
          <div class="ssx-pill">${fmtPct(avgProgress)}</div>
        </div>
        <div class="ssx-muted" style="margin-top:8px">
          Strategy: keep progress moving with tiny steps (10–15 min blocks).
        </div>
      </div>

      <div class="ssx-card">
        <div class="ssx-cardTitle">Recommendations</div>
        <div class="ssx-muted" style="margin-top:8px; line-height:1.5">
          • If habits are low today: do your easiest habit first (2 minutes).<br/>
          • If goals are stuck: raise clarity — rewrite the next action.<br/>
          • Protect focus: schedule a single 25-minute sprint.
        </div>
      </div>
    `;

    openDrawer("Insights", "A quick view of momentum and progress.", html);
    refreshBadges();
  }

  function emptyStateHTML(title, text) {
    return `
      <div class="ssx-card">
        <div class="ssx-cardTitle">${escapeHtml(title)}</div>
        <div class="ssx-muted" style="margin-top:8px">${escapeHtml(text)}</div>
      </div>
    `;
  }

  // ---------- Events wiring ----------
  function wireGoalsEvents() {
    const root = elDrawerBody();

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ssx-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-ssx-action");
      const item = e.target.closest("[data-ssx-goal-id]");
      const id = item ? item.getAttribute("data-ssx-goal-id") : null;

      if (action === "add-goal") {
        openQuickAddPrefill("goal");
        return;
      }
      if (!id) return;

      const data = store.read();
      const idx = data.goals.findIndex(g => g.id === id);
      if (idx < 0) return;

      if (action === "toggle-goal") {
        data.goals[idx].done = !data.goals[idx].done;
        // Auto-complete progress if marking done
        if (data.goals[idx].done) data.goals[idx].progress = 100;
        store.write(data);
        renderGoals();
      }

      if (action === "delete-goal") {
        data.goals.splice(idx, 1);
        store.write(data);
        renderGoals();
      }
    }, { passive: true });

    root.addEventListener("input", (e) => {
      const slider = e.target.closest('input[type="range"][data-ssx-action="progress-goal"]');
      if (!slider) return;
      const item = e.target.closest("[data-ssx-goal-id]");
      if (!item) return;

      const id = item.getAttribute("data-ssx-goal-id");
      const data = store.read();
      const idx = data.goals.findIndex(g => g.id === id);
      if (idx < 0) return;

      const v = Number(slider.value);
      data.goals[idx].progress = isFinite(v) ? v : 0;
      // If progress hits 100, mark done. If under 100, keep not done.
      data.goals[idx].done = data.goals[idx].progress >= 100;
      store.write(data);

      // update the progress bar live (no full re-render)
      const bar = item.querySelector(".ssx-progressBar > div");
      const pill = item.querySelector(".ssx-progressWrap .ssx-pill");
      if (bar) bar.style.width = fmtPct(v);
      if (pill) pill.textContent = fmtPct(v);

      refreshBadges();
    }, { passive: true });
  }

  function wireHabitsEvents() {
    const root = elDrawerBody();
    const day = todayKey();

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ssx-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-ssx-action");
      const row = e.target.closest("[data-ssx-habit-id]");
      const id = row ? row.getAttribute("data-ssx-habit-id") : null;

      if (action === "add-habit") {
        openQuickAddPrefill("habit");
        return;
      }
      if (!id) return;

      const data = store.read();
      const idx = data.habits.findIndex(h => h.id === id);
      if (idx < 0) return;

      if (action === "toggle-habit") {
        const h = data.habits[idx];
        h.days = h.days || {};
        h.days[day] = !h.days[day];
        store.write(data);
        renderHabits();
      }

      if (action === "delete-habit") {
        data.habits.splice(idx, 1);
        store.write(data);
        renderHabits();
      }
    }, { passive: true });
  }

  function refreshBadges() {
    const data = store.read();
    const activeGoals = data.goals.filter(g => !g.done).length;
    const habitCount = data.habits.length;

    if (elBadgeGoals()) elBadgeGoals().textContent = String(activeGoals);
    if (elBadgeHabits()) elBadgeHabits().textContent = String(habitCount);
  }

  // ---------- Streak math ----------
  function habitStreak(h) {
    // count consecutive days ending today (local), using keys like YYYY-MM-DD
    const days = h.days || {};
    let streak = 0;
    const d = new Date();
    for (; ;) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (days[key]) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return streak;
  }

  function bestStreak(habits) {
    if (!habits.length) return 0;
    return Math.max(...habits.map(habitStreak));
  }

  // ---------- XSS-safe text ----------
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Quick Add ----------
  function openQuickAddPrefill(type) {
    const form = elModalForm();
    if (!form) return;
    form.elements.type.value = type;
    openModal();
  }

  function handleQuickAddSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const type = form.elements.type.value;
    const title = (form.elements.title.value || "").trim();
    const details = (form.elements.details.value || "").trim();
    const meta = (form.elements.meta.value || "").trim();

    if (!title) return;

    const data = store.read();

    if (type === "goal") {
      data.goals.unshift({
        id: uid(),
        title,
        details,
        meta,
        progress: 0,
        done: false,
        createdAt: Date.now()
      });
    } else if (type === "habit") {
      data.habits.unshift({
        id: uid(),
        title,
        details,
        meta: meta || "daily",
        days: {},
        createdAt: Date.now()
      });
    } else {
      data.notes.unshift({
        id: uid(),
        title,
        details,
        createdAt: Date.now()
      });
    }

    store.write(data);
    closeModal();
    refreshBadges();

    // After save, open relevant drawer so user sees it instantly
    if (type === "goal") renderGoals();
    else if (type === "habit") renderHabits();
    else renderInsights();
  }

  // ---------- Init ----------
  function init() {
    // If user didn't paste the HTML parts, fail silently.
    if (!elFab() || !elDrawer() || !elDrawerOverlay() || !elModalOverlay()) return;

    refreshBadges();

    // Drawer open via sidebar buttons with data-ssx-panel
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ssx-panel]");
      if (!btn) return;
      const panel = btn.getAttribute("data-ssx-panel");

      if (panel === "goals") renderGoals();
      if (panel === "habits") renderHabits();
      if (panel === "insights") renderInsights();
    });

    // Close drawer
    elDrawerClose().addEventListener("click", closeDrawer);
    elDrawerOverlay().addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeModal(); } });

    // Open Quick Add
    elFab().addEventListener("click", () => openModal());

    // Close modal
    elModalClose().addEventListener("click", closeModal);
    elModalCancel().addEventListener("click", closeModal);
    elModalOverlay().addEventListener("click", (e) => {
      if (e.target === elModalOverlay()) closeModal();
    });

    // Save quick add
    elModalForm().addEventListener("submit", handleQuickAddSubmit);

    // Optional: initial “Insights” preload if you want:
    // renderInsights();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
/* =========================
   NEW CODE END — SSX module
   ========================= */
