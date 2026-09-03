const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let selectedMinutes = 25;
let timerTick;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const data = await chrome.storage.local.get(["blockingEnabled", "tasks", "scratchpad", "timerEnd", "timerRunning"]);
  $("#block-toggle").checked = data.blockingEnabled !== false;
  updateBlockLabel();
  $("#scratchpad").value = data.scratchpad || "";
  renderTasks(data.tasks || []);
  if (data.timerRunning && data.timerEnd) beginTick(data.timerEnd);

  $$(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $("#block-toggle").addEventListener("change", toggleBlocking);
  $("#scratchpad").addEventListener("input", debounce(event => chrome.storage.local.set({ scratchpad: event.target.value }), 250));
  $("#help-btn").addEventListener("click", createStudyGuide);
  $("#task-form").addEventListener("submit", addTask);
  $("#task-list").addEventListener("click", handleTaskClick);
  $$("[data-minutes]").forEach(button => button.addEventListener("click", () => selectTimer(button)));
  $("#timer-start").addEventListener("click", toggleTimer);
  $("#timer-reset").addEventListener("click", resetTimer);
  $("#settings-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
}

function switchTab(id) {
  $$(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === id));
  $$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === id));
}

async function toggleBlocking(event) {
  await chrome.storage.local.set({ blockingEnabled: event.target.checked });
  await chrome.runtime.sendMessage({ type: "REFRESH_RULES" });
  updateBlockLabel();
}

function updateBlockLabel() {
  const on = $("#block-toggle").checked;
  $("#block-status").textContent = on ? "Blocking is on" : "Blocking is paused";
  $("#block-status").classList.toggle("off", !on);
}

function createStudyGuide() {
  const question = $("#question").value.trim();
  if (!question) return $("#question").focus();
  const subject = $("#subject").value;
  const guides = {
    Math: ["Write down what the question gives you.", "Circle the value or variable you need to find.", "Choose a formula or inverse operation.", "Solve one step at a time, then check by substituting your answer."],
    Science: ["Identify the system, process, or idea being tested.", "List the facts and variables in the question.", "Connect them with a scientific rule or cause-and-effect chain.", "Explain the result in your own words and include units."],
    English: ["Underline the exact instruction word: analyze, compare, explain, or argue.", "Write a one-sentence claim that answers it.", "Find one specific detail or quotation as evidence.", "Explain how that evidence proves your claim."],
    History: ["Identify the time, place, people, and event.", "Separate causes from effects.", "Choose one piece of evidence for your main point.", "Explain why the event mattered, not only what happened."],
    Other: ["Rewrite the question in your own words.", "List what you know and what is missing.", "Split it into the smallest possible first step.", "Try that step and check it against the original question."]
  };
  const keyWords = question.split(/\s+/).filter(word => word.length > 5).slice(0, 4).join(", ");
  $("#help-output").innerHTML = `<strong>Your game plan</strong><ol>${guides[subject].map(step => `<li>${step}</li>`).join("")}</ol>${keyWords ? `<p><b>Key words to inspect:</b> ${escapeHtml(keyWords)}</p>` : ""}<p class="nudge">Start with step 1 in your notes. If you get stuck, identify the exact step that stopped making sense.</p>`;
  $("#help-output").classList.remove("hidden");
}

async function addTask(event) {
  event.preventDefault();
  const text = $("#task-input").value.trim();
  if (!text) return;
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  tasks.push({ id: crypto.randomUUID(), text, done: false });
  await chrome.storage.local.set({ tasks });
  $("#task-input").value = "";
  renderTasks(tasks);
}

async function handleTaskClick(event) {
  const row = event.target.closest("li");
  if (!row) return;
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  const index = tasks.findIndex(task => task.id === row.dataset.id);
  if (index < 0) return;
  if (event.target.matches(".delete-task")) tasks.splice(index, 1);
  else if (event.target.matches("input")) tasks[index].done = event.target.checked;
  await chrome.storage.local.set({ tasks });
  renderTasks(tasks);
}

function renderTasks(tasks) {
  $("#task-list").innerHTML = tasks.map(task => `<li data-id="${task.id}" class="${task.done ? "done" : ""}"><input type="checkbox" ${task.done ? "checked" : ""} aria-label="Mark complete"><span>${escapeHtml(task.text)}</span><button class="delete-task" aria-label="Delete task">×</button></li>`).join("");
  const left = tasks.filter(task => !task.done).length;
  $("#task-count").textContent = `${left} left`;
  $("#empty-tasks").hidden = tasks.length > 0;
}

function selectTimer(button) {
  if ($("#timer-start").dataset.running === "true") return;
  selectedMinutes = Number(button.dataset.minutes);
  $$("[data-minutes]").forEach(item => item.classList.toggle("selected", item === button));
  $("#timer-display").textContent = `${String(selectedMinutes).padStart(2, "0")}:00`;
}

async function toggleTimer() {
  if ($("#timer-start").dataset.running === "true") {
    clearInterval(timerTick);
    chrome.alarms.clear("focus-timer");
    await chrome.storage.local.set({ timerEnd: null, timerRunning: false });
    setTimerUI(false, "Paused. Reset or start a fresh session.");
    return;
  }
  const end = Date.now() + selectedMinutes * 60 * 1000;
  chrome.alarms.create("focus-timer", { when: end });
  await chrome.storage.local.set({ timerEnd: end, timerRunning: true });
  beginTick(end);
}

function beginTick(end) {
  clearInterval(timerTick);
  setTimerUI(true, "Stay on this one task. You’ve got this.");
  const update = () => {
    const remaining = Math.max(0, end - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    $("#timer-display").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (!remaining) { clearInterval(timerTick); setTimerUI(false, "Session complete—nice work!"); }
  };
  update(); timerTick = setInterval(update, 1000);
}

async function resetTimer() {
  clearInterval(timerTick); chrome.alarms.clear("focus-timer");
  await chrome.storage.local.set({ timerEnd: null, timerRunning: false });
  $("#timer-display").textContent = `${String(selectedMinutes).padStart(2, "0")}:00`;
  setTimerUI(false, "Ready when you are.");
}

function setTimerUI(running, status) {
  $("#timer-start").dataset.running = String(running);
  $("#timer-start").textContent = running ? "Pause" : "Start focus";
  $("#timer-status").textContent = status;
}

function debounce(fn, wait) { let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), wait); }; }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
