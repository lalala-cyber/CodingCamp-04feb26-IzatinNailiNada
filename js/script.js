const STORAGE_KEY = "todos-v2";
const DB_NAME = "todo-attachments";
const DB_STORE = "files";

const form = document.getElementById("todoForm");
const taskInput = document.getElementById("taskInput");
const dateInput = document.getElementById("dateInput");
const timeStartInput = document.getElementById("timeStartInput");
const timeEndInput = document.getElementById("timeEndInput");
const priorityInput = document.getElementById("priorityInput");
const attachmentInput = document.getElementById("attachmentInput");
const list = document.getElementById("todoList");
const filter = document.getElementById("filter");
const searchInput = document.getElementById("searchInput");
const totalCount = document.getElementById("totalCount");
const doneCount = document.getElementById("doneCount");
const intro = document.getElementById("intro");
const app = document.getElementById("app");
const enterBtn = document.getElementById("enterBtn");
const timeSep = document.querySelector(".time-sep");
const mobileQuery = window.matchMedia("(max-width: 640px)");

let todos = loadTodos();
const attachmentUrls = new Map();

if (enterBtn && intro && app) {
  enterBtn.addEventListener("click", () => {
    intro.classList.add("hidden");
    app.classList.remove("hidden");
  });
}

initCustomSelects();

form.addEventListener("submit", addTodo);
filter.addEventListener("change", renderTodos);
searchInput.addEventListener("input", renderTodos);
list.addEventListener("click", handleListClick);
list.addEventListener("change", handleListChange);
dateInput.addEventListener("input", syncMobilePlaceholders);
dateInput.addEventListener("change", syncMobilePlaceholders);
timeStartInput.addEventListener("input", syncMobilePlaceholders);
timeStartInput.addEventListener("change", syncMobilePlaceholders);
timeEndInput.addEventListener("input", syncMobileHelpers);
timeEndInput.addEventListener("change", syncMobileHelpers);
mobileQuery.addEventListener("change", syncMobileHelpers);

renderTodos();
syncMobileHelpers();

async function addTodo(e) {
  e.preventDefault();

  const text = taskInput.value.trim();
  const date = dateInput.value;
  const timeStart = timeStartInput.value;
  const timeEnd = timeEndInput.value;
  const priority = priorityInput.value;
  const file = attachmentInput.files[0];

  if (text === "") {
    alert("Task wajib diisi.");
    return;
  }
  if (date === "") {
    alert("Tanggal wajib diisi.");
    return;
  }
  if (timeStart === "") {
    alert("Jam mulai wajib diisi. Jam selesai opsional.");
    return;
  }

  let attachment = null;
  if (file) {
    const isImage = file.type.startsWith("image/");
    const attachmentId = await saveAttachment(file);
    attachment = {
      id: attachmentId,
      name: file.name,
      type: file.type || "unknown",
      isImage,
    };
  }

  todos.push({
    id: crypto.randomUUID(),
    text,
    date,
    timeStart,
    timeEnd,
    priority,
    completed: false,
    attachment,
  });

  saveTodos();
  renderTodos();

  taskInput.value = "";
  dateInput.value = "";
  timeStartInput.value = "";
  timeEndInput.value = "";
  priorityInput.value = "medium";
  attachmentInput.value = "";
  syncMobileHelpers();
}

async function handleListClick(e) {
  const target = e.target;
  const li = target.closest("li");
  if (!li) return;

  const id = li.dataset.id;

  if (target.classList.contains("delete")) {
    const todoToDelete = todos.find((t) => t.id === id);
    if (todoToDelete?.attachment?.id) {
      await deleteAttachment(todoToDelete.attachment.id);
    }
    todos = todos.filter((t) => t.id !== id);
    saveTodos();
    renderTodos();
  }

  if (target.classList.contains("open-attachment")) {
    const todo = todos.find((t) => t.id === id);
    if (!todo?.attachment?.id) return;

    const blob = await getAttachment(todo.attachment.id);
    if (!blob) {
      alert("Attachment not found.");
      return;
    }

    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  if (target.classList.contains("edit")) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const nextText = prompt("Edit task:", todo.text);
    if (nextText === null) return;
    const trimmed = nextText.trim();
    if (trimmed === "") return;

    const nextDate = prompt("Edit date (YYYY-MM-DD):", todo.date);
    if (nextDate === null || nextDate.trim() === "") return;

    const nextTimeStart = prompt("Edit start time (HH:MM):", todo.timeStart || "");
    if (nextTimeStart === null || nextTimeStart.trim() === "") return;

    const nextTimeEnd = prompt("Edit end time (HH:MM, optional):", todo.timeEnd || "");
    if (nextTimeEnd === null) return;

    const nextPriority = prompt(
      "Edit priority (low, medium, high):",
      todo.priority
    );
    if (nextPriority === null || nextPriority.trim() === "") return;

    const normalized = nextPriority.trim().toLowerCase();
    if (!["low", "medium", "high"].includes(normalized)) {
      alert("Priority must be: low, medium, or high.");
      return;
    }

    todo.text = trimmed;
    todo.date = nextDate.trim();
    todo.timeStart = nextTimeStart.trim();
    todo.timeEnd = nextTimeEnd.trim();
    todo.priority = normalized;

    saveTodos();
    renderTodos();
  }
}

async function handleListChange(e) {
  const target = e.target;
  if (!target.classList.contains("checkbox")) return;

  const li = target.closest("li");
  if (!li) return;

  const id = li.dataset.id;
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  todo.completed = target.checked;
  if (todo.completed && todo.attachment?.id) {
    await deleteAttachment(todo.attachment.id);
    todo.attachment = null;
  }
  saveTodos();
  renderTodos();
}

async function renderTodos() {
  const today = new Date().toISOString().split("T")[0];
  const query = searchInput.value.trim().toLowerCase();
  const mode = filter.value;

  const visible = todos.filter((todo) => {
    const matchesSearch = todo.text.toLowerCase().includes(query);
    if (!matchesSearch) return false;

    if (mode === "today") return todo.date === today;
    if (mode === "upcoming") return todo.date > today && !todo.completed;
    if (mode === "overdue") return todo.date < today && !todo.completed;
    if (mode === "completed") return todo.completed;

    return true;
  });

  clearAttachmentUrls();
  list.innerHTML = visible
    .map((todo) => {
      const doneClass = todo.completed ? "done" : "";
      const attachmentHtml = todo.attachment
        ? `
            <div class="attachment">
              ${
                todo.attachment.isImage
                  ? `<img class="preview" data-attachment-id="${todo.attachment.id}" alt="${escapeHtml(
                      todo.attachment.name
                    )}" />`
                  : ""
              }
              <span class="filename">${escapeHtml(todo.attachment.name)}</span>
              ${
                todo.attachment.type && todo.attachment.type !== "unknown"
                  ? `<span class="filetype">${escapeHtml(
                      todo.attachment.type
                    )}</span>`
                  : ""
              }
              <button class="open-attachment" type="button">Open</button>
            </div>
          `
        : "";

      return `
        <li class="${doneClass}" data-id="${todo.id}">
          <input class="checkbox" type="checkbox" ${
            todo.completed ? "checked" : ""
          } />
          <div class="task">
            <strong>${escapeHtml(todo.text)}</strong>
            <div class="meta">
              <span>${todo.date} | ${formatTimeRange(todo.timeStart, todo.timeEnd)}</span>
              <span class="badge ${todo.priority}">${todo.priority}</span>
            </div>
            ${attachmentHtml}
          </div>
          <div class="actions">
            <button class="edit" type="button">Edit</button>
            <button class="delete" type="button">X</button>
          </div>
        </li>
      `;
    })
    .join("");

  totalCount.textContent = `${todos.length} total`;
  const done = todos.filter((t) => t.completed).length;
  doneCount.textContent = `${done} done`;

  await hydrateAttachmentPreviews(visible);
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function loadTodos() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimeRange(start, end) {
  if (!end) return `${start} s.d`;
  return `${start} - ${end}`;
}

function initCustomSelects() {
  const selects = document.querySelectorAll(".custom-select");
  if (!selects.length) return;

  const closeAll = () => {
    selects.forEach((s) => s.classList.remove("open"));
  };

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select")) closeAll();
  });

  selects.forEach((wrapper) => {
    const targetId = wrapper.dataset.target;
    const native = document.getElementById(targetId);
    const trigger = wrapper.querySelector(".select-trigger");
    const valueEl = wrapper.querySelector(".select-value");
    const options = wrapper.querySelectorAll(".select-option");

    if (!native || !trigger || !valueEl) return;

    const syncFromNative = () => {
      const selected = native.options[native.selectedIndex];
      valueEl.textContent = selected ? selected.textContent : "";
      options.forEach((opt) => {
        opt.setAttribute(
          "aria-selected",
          opt.dataset.value === native.value ? "true" : "false"
        );
      });
    };

    syncFromNative();

    trigger.addEventListener("click", () => {
      const isOpen = wrapper.classList.contains("open");
      closeAll();
      wrapper.classList.toggle("open", !isOpen);
    });

    options.forEach((opt) => {
      opt.addEventListener("click", () => {
        native.value = opt.dataset.value || "";
        native.dispatchEvent(new Event("change", { bubbles: true }));
        syncFromNative();
        wrapper.classList.remove("open");
      });
    });
  });
}

function syncMobilePlaceholders() {
  const wraps = document.querySelectorAll(".input-wrap");
  wraps.forEach((wrap) => {
    const input = wrap.querySelector("input");
    if (!input) return;
    wrap.classList.toggle("has-value", input.value !== "");
  });
}

function syncTimeSeparator() {
  if (!timeSep) return;
  if (!mobileQuery.matches) {
    timeSep.textContent = "-";
    return;
  }
  const start = timeStartInput.value;
  const end = timeEndInput.value;
  timeSep.textContent = start && !end ? "s.d" : "-";
}

function syncMobileHelpers() {
  syncMobilePlaceholders();
  syncTimeSeparator();
}

function clearAttachmentUrls() {
  for (const url of attachmentUrls.values()) {
    URL.revokeObjectURL(url);
  }
  attachmentUrls.clear();
}

async function hydrateAttachmentPreviews(items) {
  const previews = list.querySelectorAll("img.preview");
  if (!previews.length) return;

  const byId = new Map(items.map((t) => [t.attachment?.id, t]));
  for (const img of previews) {
    const attachmentId = img.dataset.attachmentId;
    if (!attachmentId) continue;
    const todo = byId.get(attachmentId);
    if (!todo) continue;

    const blob = await getAttachment(attachmentId);
    if (!blob) continue;

    const url = URL.createObjectURL(blob);
    attachmentUrls.set(attachmentId, url);
    img.src = url;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAttachment(file) {
  const db = await openDb();
  const id = crypto.randomUUID();
  const record = { id, name: file.name, type: file.type || "unknown", blob: file };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(record);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAttachment(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteAttachment(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
