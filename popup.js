const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let selectedMinutes = 25;
let timerTick;
let attachedPage = null;
let attachedScreenshot = null;
let lastAnswer = "";
let conversation = [];
let unlockTick = null;
const QUOTES = [
  "Small progress is still progress.",
  "Start messy. Make it better later.",
  "One problem at a time.",
  "Future you will be glad you started.",
  "You only need enough motivation for the next step.",
  "A focused 25 minutes beats an unfocused hour."
];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const data = await chrome.storage.local.get(["blockingEnabled", "tasks", "scratchpad", "timerEnd", "timerRunning", "pendingSnipResult", "streak"]);
  $("#block-toggle").checked = data.blockingEnabled !== false;
  updateBlockLabel();
  $("#scratchpad").value = data.scratchpad || "";
  renderTasks(data.tasks || []);
  const streak = data.streak || 0;
  $("#streak-label").textContent = `🔥 ${streak} ${streak === 1 ? "day" : "days"} streak`;
  showRandomQuote();
  if (data.timerRunning && data.timerEnd) beginTick(data.timerEnd);
  if (data.pendingSnipResult) {
    const output = $("#help-output");
    output.classList.remove("hidden");
    output.classList.toggle("error", !data.pendingSnipResult.ok);
    output.textContent = data.pendingSnipResult.ok ? data.pendingSnipResult.answer : `${data.pendingSnipResult.error}\n\nCheck your DeepSeek API key in Settings.`;
    if (data.pendingSnipResult.ok) setAnswer(data.pendingSnipResult.answer);
    await chrome.storage.local.remove("pendingSnipResult");
  }

  $$(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $("#block-toggle").addEventListener("change", toggleBlocking);
  $("#scratchpad").addEventListener("input", debounce(event => chrome.storage.local.set({ scratchpad: event.target.value }), 250));
  $("#help-btn").addEventListener("click", createStudyGuide);
  $("#followup-btn").addEventListener("click", askFollowup);
  $("#followup-input").addEventListener("keydown", event => { if (event.key === "Enter") askFollowup(); });
  $("#new-chat").addEventListener("click", resetChat);
  $("#page-btn").addEventListener("click", attachCurrentPage);
  $("#snip-btn").addEventListener("click", startSnip);
  $("#copy-answer").addEventListener("click", copyAnswer);
  $("#new-quote").addEventListener("click", showRandomQuote);
  $("#task-form").addEventListener("submit", addTask);
  $("#task-list").addEventListener("click", handleTaskClick);
  $("#clear-completed").addEventListener("click", clearCompletedTasks);
  $$("[data-minutes]").forEach(button => button.addEventListener("click", () => selectTimer(button)));
  $("#timer-start").addEventListener("click", toggleTimer);
  $("#timer-reset").addEventListener("click", resetTimer);
  $("#settings-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#cancel-unlock").addEventListener("click", cancelUnlock);
  $("#confirm-unlock").addEventListener("click", confirmUnlock);
}

function showRandomQuote() {
  const current = $("#motivation").textContent;
  const choices = QUOTES.filter(quote => quote !== current);
  $("#motivation").textContent = choices[Math.floor(Math.random() * choices.length)];
}

function setAnswer(answer) {
  lastAnswer = answer || "";
  $("#copy-answer").classList.toggle("hidden", !lastAnswer);
}

async function askFollowup() {
  const input = $("#followup-input");
  const question = input.value.trim();
  if (!question) return input.focus();
  input.value = "";
  const output = $("#help-output");
  output.classList.remove("error");
  output.textContent = "Thinking about your follow-up…";
  $("#followup-btn").disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "ASK_DEEPSEEK", question, subject: $("#subject").value, mode: "explain", history: conversation, screenshotData: attachedScreenshot });
    if (!result?.ok) throw new Error(result?.error || "The AI request failed.");
    conversation.push({ role: "user", content: question }, { role: "assistant", content: result.answer });
    output.textContent = result.answer;
    setAnswer(result.answer);
  } catch (error) {
    output.classList.add("error");
    output.textContent = error.message;
  } finally { $("#followup-btn").disabled = false; }
}

function resetChat() {
  conversation = [];
  attachedPage = null;
  attachedScreenshot = null;
  lastAnswer = "";
  $("#question").value = "";
  $("#help-output").classList.add("hidden");
  $("#followup-box").classList.add("hidden");
  $("#copy-answer").classList.add("hidden");
  $("#page-status").textContent = "No page attached";
}

async function copyAnswer() {
  if (!lastAnswer) return;
  const button = $("#copy-answer");
  try {
    await navigator.clipboard.writeText(lastAnswer);
    button.textContent = "Copied!";
  } catch (_) {
    button.textContent = "Could not copy";
  }
  setTimeout(() => button.textContent = "Copy answer", 1400);
}

async function startSnip() {
  const status = $("#page-status");
  const button = $("#snip-btn");
  button.disabled = true;
  status.textContent = "Starting snipping tool…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) throw new Error("Open a normal webpage before snipping.");
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const subject = $("#subject").value;
    const mode = $("#help-mode").value;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: launchFocusFoxSnipper,
      args: [screenshot, subject, mode]
    });
    status.textContent = "Drag around the problem, then reopen FocusFox when notified.";
    window.close();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

function launchFocusFoxSnipper(screenshotData, subject, mode) {
  document.getElementById("focusfox-snip-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "focusfox-snip-overlay";
  Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "crosshair", background: "rgba(8,20,14,.36)", userSelect: "none" });
  const tip = document.createElement("div");
  tip.textContent = "Drag around the homework problem • Esc to cancel";
  Object.assign(tip.style, { position: "fixed", top: "18px", left: "50%", transform: "translateX(-50%)", padding: "11px 17px", borderRadius: "999px", background: "#16221d", color: "white", font: "600 14px system-ui", boxShadow: "0 8px 25px #0005" });
  const box = document.createElement("div");
  Object.assign(box.style, { position: "fixed", border: "3px solid #39d98a", background: "rgba(255,255,255,.08)", boxShadow: "0 0 0 9999px rgba(8,20,14,.22)", display: "none" });
  overlay.append(tip, box);
  document.documentElement.appendChild(overlay);
  let startX = 0, startY = 0, dragging = false;
  const cleanup = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = event => { if (event.key === "Escape") cleanup(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", event => {
    if (event.button !== 0) return;
    dragging = true; startX = event.clientX; startY = event.clientY; box.style.display = "block";
    Object.assign(box.style, { left: `${startX}px`, top: `${startY}px`, width: "0", height: "0" });
  });
  overlay.addEventListener("mousemove", event => {
    if (!dragging) return;
    const left = Math.min(startX, event.clientX), top = Math.min(startY, event.clientY);
    Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${Math.abs(event.clientX-startX)}px`, height: `${Math.abs(event.clientY-startY)}px` });
  });
  overlay.addEventListener("mouseup", event => {
    if (!dragging) return;
    dragging = false;
    const left = Math.min(startX, event.clientX), top = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX-startX), height = Math.abs(event.clientY-startY);
    if (width < 20 || height < 20) { box.style.display = "none"; return; }
    const image = new Image();
    image.onload = () => {
      const scaleX = image.naturalWidth / window.innerWidth, scaleY = image.naturalHeight / window.innerHeight;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scaleX)); canvas.height = Math.max(1, Math.round(height * scaleY));
      canvas.getContext("2d").drawImage(image, left*scaleX, top*scaleY, width*scaleX, height*scaleY, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", .88);
      cleanup();
      chrome.runtime.sendMessage({ type: "ANALYZE_SNIP", imageData, subject, mode, pageTitle: document.title, pageUrl: location.href });
    };
    image.src = screenshotData;
  });
}

function switchTab(id) {
  $$(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === id));
  $$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === id));
}

async function toggleBlocking(event) {
  if (event.target.checked) {
    cancelUnlock();
    await chrome.storage.local.set({ blockingEnabled: true });
    await chrome.runtime.sendMessage({ type: "REFRESH_RULES" });
    updateBlockLabel();
    return;
  }
  event.target.checked = true;
  startUnlockCountdown();
}

function startUnlockCountdown() {
  clearInterval(unlockTick);
  let seconds = 30;
  $("#unlock-panel").classList.remove("hidden");
  $("#unlock-seconds").textContent = seconds;
  $("#confirm-unlock").disabled = true;
  unlockTick = setInterval(() => {
    seconds -= 1;
    $("#unlock-seconds").textContent = seconds;
    if (seconds <= 0) { clearInterval(unlockTick); unlockTick = null; $("#confirm-unlock").disabled = false; }
  }, 1000);
}

function cancelUnlock() {
  clearInterval(unlockTick); unlockTick = null;
  $("#unlock-panel").classList.add("hidden");
  $("#unlock-reason").value = "";
  $("#block-toggle").checked = true;
  updateBlockLabel();
}

async function confirmUnlock() {
  const reason = $("#unlock-reason").value.trim();
  if (reason.length < 3) { $("#unlock-reason").focus(); return; }
  await chrome.storage.local.set({ blockingEnabled: false, lastUnlockReason: reason, lastUnlockAt: Date.now() });
  await chrome.runtime.sendMessage({ type: "REFRESH_RULES" });
  $("#unlock-panel").classList.add("hidden");
  $("#block-toggle").checked = false;
  updateBlockLabel();
}

async function updateBlockLabel() {
  const on = $("#block-toggle").checked;
  const { scheduleEnabled = false, scheduleStart = "16:00", scheduleEnd = "21:00" } = await chrome.storage.local.get(["scheduleEnabled", "scheduleStart", "scheduleEnd"]);
  const [startHour, startMinute] = scheduleStart.split(":").map(Number);
  const [endHour, endMinute] = scheduleEnd.split(":").map(Number);
  const current = new Date().getHours() * 60 + new Date().getMinutes();
  const start = startHour * 60 + startMinute, end = endHour * 60 + endMinute;
  const scheduledNow = start <= end ? current >= start && current < end : current >= start || current < end;
  $("#block-status").textContent = !on ? "Blocking is paused" : scheduleEnabled && !scheduledNow ? "Scheduled — currently off" : "Blocking is on";
  $("#block-status").classList.toggle("off", !on || (scheduleEnabled && !scheduledNow));
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
    conversation = [{ role: "user", content: question || "Help with the attached page." }, { role: "assistant", content: result.answer }];
    setAnswer(result.answer);
    $("#followup-box").classList.remove("hidden");
  } catch (error) {
    setAnswer("");
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
  const task = { id: crypto.randomUUID(), text, done: false, due: $("#task-due").value || null };
  tasks.push(task);
  await chrome.storage.local.set({ tasks });
  await scheduleTaskReminder(task);
  $("#task-input").value = "";
  $("#task-due").value = "";
  renderTasks(tasks);
}

async function handleTaskClick(event) {
  const row = event.target.closest("li");
  if (!row) return;
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  const index = tasks.findIndex(task => task.id === row.dataset.id);
  if (index < 0) return;
  if (event.target.matches(".delete-task")) { await chrome.alarms.clear(`task:${tasks[index].id}`); tasks.splice(index, 1); }
  else if (event.target.matches('input[type="checkbox"]')) {
    tasks[index].done = event.target.checked;
    if (tasks[index].done) await chrome.alarms.clear(`task:${tasks[index].id}`); else await scheduleTaskReminder(tasks[index]);
  }
  await chrome.storage.local.set({ tasks });
  renderTasks(tasks);
}

async function clearCompletedTasks() {
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  await Promise.all(tasks.filter(task => task.done).map(task => chrome.alarms.clear(`task:${task.id}`)));
  const remaining = tasks.filter(task => !task.done);
  await chrome.storage.local.set({ tasks: remaining });
  renderTasks(remaining);
}

async function scheduleTaskReminder(task) {
  if (!task.due || task.done) return;
  const due = new Date(`${task.due}T08:00:00`);
  const when = Math.max(Date.now() + 5000, due.getTime());
  await chrome.alarms.create(`task:${task.id}`, { when });
}

function renderTasks(tasks) {
  $("#task-list").innerHTML = tasks.map(task => `<li data-id="${task.id}" class="${task.done ? "done" : ""}"><input type="checkbox" ${task.done ? "checked" : ""} aria-label="Mark complete"><span>${escapeHtml(task.text)}${task.due ? `<small>Due ${formatDueDate(task.due)}</small>` : ""}</span><button class="delete-task" aria-label="Delete task">×</button></li>`).join("");
  const left = tasks.filter(task => !task.done).length;
  $("#task-count").textContent = `${left} left`;
  $("#empty-tasks").hidden = tasks.length > 0;
  $("#clear-completed").hidden = !tasks.some(task => task.done);
}

function formatDueDate(value) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

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
