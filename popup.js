const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let selectedMinutes = 25;
let timerTick;
let attachedPage = null;
let attachedScreenshot = null;

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
  $("#page-btn").addEventListener("click", attachCurrentPage);
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

async function createStudyGuide() {
  const question = $("#question").value.trim();
  if (!question && !attachedPage) return $("#question").focus();
  const subject = $("#subject").value;
  const output = $("#help-output");
  const button = $("#help-btn");
  output.classList.remove("hidden", "error");
  output.textContent = "Thinking through your question…";
  button.disabled = true;
  button.textContent = "Thinking…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "ASK_DEEPSEEK", question, subject, mode: $("#help-mode").value, pageContext: attachedPage, screenshotData: attachedScreenshot });
    if (!result?.ok) throw new Error(result?.error || "The AI request failed.");
    output.textContent = result.answer;
  } catch (error) {
    output.classList.add("error");
    output.textContent = `${error.message}\n\nOpen Settings & API key to check your DeepSeek key.`;
  } finally {
    button.disabled = false;
    button.textContent = "Ask FocusFox AI";
  }
}

async function attachCurrentPage() {
  const button = $("#page-btn");
  const status = $("#page-status");
  button.disabled = true;
  status.textContent = "Reading page…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) {
      throw new Error("Chrome does not allow page access here. Open a normal webpage first.");
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selectedText = window.getSelection()?.toString().trim() || "";
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll("script,style,noscript,svg,canvas,input,textarea,select,button").forEach(node => node.remove());
        const pageText = (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
        return { title: document.title, url: location.href, text: (selectedText || pageText).slice(0, 12000), selected: Boolean(selectedText) };
      }
    });
    let screenshot = null;
    try { screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 65 }); } catch (_) {}
    if (!result?.text && !screenshot) throw new Error("I could not find readable content on this page.");
    attachedPage = result || { title: tab.title || "Current page", url: tab.url || "", text: "", selected: false };
    attachedScreenshot = screenshot;
    status.textContent = `${result?.selected ? "Selection" : "Page"} attached${screenshot ? " + image" : ""}`;
    status.classList.add("attached");
    button.textContent = "Refresh page";
  } catch (error) {
    attachedPage = null;
    attachedScreenshot = null;
    status.textContent = error.message;
    status.classList.remove("attached");
  } finally {
    button.disabled = false;
  }
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
