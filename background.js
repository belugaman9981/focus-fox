const DEFAULT_SITES = [
  "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
  "reddit.com", "snapchat.com", "pinterest.com", "tumblr.com", "threads.net",
  "discord.com", "discord.gg", "twitch.tv", "youtube.com"
];

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get(["blockingEnabled", "blockedSites"]);
  if (saved.blockingEnabled === undefined) await chrome.storage.local.set({ blockingEnabled: true });
  if (!saved.blockedSites) await chrome.storage.local.set({ blockedSites: DEFAULT_SITES });
  chrome.alarms.create("schedule-check", { periodInMinutes: 1 });
  await restoreTaskAlarms();
  await refreshRules();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("schedule-check", { periodInMinutes: 1 });
  restoreTaskAlarms();
  refreshRules();
});

async function restoreTaskAlarms() {
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  for (const task of tasks) {
    if (!task.due || task.done) continue;
    const due = new Date(`${task.due}T08:00:00`).getTime();
    chrome.alarms.create(`task:${task.id}`, { when: Math.max(Date.now() + 5000, due) });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "REFRESH_RULES") {
    refreshRules().then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "ASK_DEEPSEEK") {
    askDeepSeek(message).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "ANALYZE_SNIP") {
    analyzeSnip(message).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function analyzeSnip({ imageData, subject, mode, pageTitle, pageUrl }) {
  try {
    const result = await askDeepSeek({
      question: "Identify the homework problem in this snipped image and help me with it.",
      subject,
      mode,
      pageContext: { title: pageTitle || "Snipped page", url: pageUrl || "", text: "", selected: false },
      screenshotData: imageData
    });
    if (!result.ok) throw new Error(result.error || "The snip could not be analyzed.");
    await chrome.storage.local.set({ pendingSnipResult: { ok: true, answer: result.answer, createdAt: Date.now() } });
    chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title: "FocusFox finished your snip", message: "Open FocusFox to see the explanation." });
    return { ok: true };
  } catch (error) {
    await chrome.storage.local.set({ pendingSnipResult: { ok: false, error: error.message, createdAt: Date.now() } });
    chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title: "FocusFox could not analyze the snip", message: "Open FocusFox to see what went wrong." });
    return { ok: false, error: error.message };
  }
}

async function askDeepSeek({ question, subject, mode, pageContext, screenshotData, history = [] }) {
  const { deepseekApiKey, deepseekModel = "deepseek-v4-flash" } = await chrome.storage.local.get(["deepseekApiKey", "deepseekModel"]);
  if (!deepseekApiKey) return { ok: false, error: "No DeepSeek API key saved. Open settings and add one first." };
  const instructions = {
    explain: "Teach the solution clearly, step by step. Explain why each step works, then give the final answer.",
    hint: "Give progressive hints without immediately revealing the final answer. Start with the smallest useful hint.",
    solve: "Solve the problem completely. Show concise working and clearly label the final answer.",
    check: "Check the student's work or proposed answer. Identify the first mistake, explain it, and show a corrected solution."
  };
  const contextText = pageContext ? `\n\nCURRENT PAGE CONTEXT:\nTitle: ${pageContext.title}\nURL: ${pageContext.url}\n${pageContext.selected ? "Selected text" : "Visible page text"}:\n${pageContext.text}` : "";
  const userText = `${question || "Identify the homework problem shown on the current page and help me solve it."}${contextText}`;
  const userContent = screenshotData ? [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: screenshotData, detail: "high" } }
  ] : userText;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${deepseekApiKey}` },
    body: JSON.stringify({
      model: screenshotData ? "deepseek-v4-flash-vision-exp" : deepseekModel,
      messages: [
        { role: "system", content: `You are FocusFox, a patient and accurate homework tutor. The subject is ${subject}. ${instructions[mode] || instructions.explain} Use language suitable for a high-school student. For math and science, verify calculations and include units where relevant.` },
        ...history.slice(-8).filter(item => ["user", "assistant"].includes(item.role) && typeof item.content === "string"),
        { role: "user", content: userContent }
      ],
      thinking: { type: "enabled" }, reasoning_effort: "high", max_tokens: 1600, stream: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `DeepSeek request failed (${response.status}).`);
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) throw new Error("DeepSeek returned an empty response. Please try again.");
  return { ok: true, answer };
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "focus-timer") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Focus session complete!",
      message: "Nice work. Take a short break, then come back strong."
    });
    chrome.storage.local.set({ timerEnd: null, timerRunning: false });
    recordStudyDay();
  }
  if (alarm.name === "schedule-check") refreshRules();
  if (alarm.name.startsWith("task:")) notifyTaskDue(alarm.name.slice(5));
});

async function notifyTaskDue(taskId) {
  const { tasks = [] } = await chrome.storage.local.get("tasks");
  const task = tasks.find(item => item.id === taskId && !item.done);
  if (!task) return;
  chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title: "Homework due today", message: task.text });
}

async function recordStudyDay() {
  const today = new Date().toLocaleDateString("en-CA");
  const { streak = 0, lastStudyDate } = await chrome.storage.local.get(["streak", "lastStudyDate"]);
  if (lastStudyDate === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const continued = lastStudyDate === yesterday.toLocaleDateString("en-CA");
  await chrome.storage.local.set({ streak: continued ? streak + 1 : 1, lastStudyDate: today });
}

// Serialize refreshes from settings, startup, and the schedule alarm.
let rulesRefresh = Promise.resolve();
function refreshRules() {
  rulesRefresh = rulesRefresh.catch(() => {}).then(applyRules);
  return rulesRefresh;
}

async function applyRules() {
  const { adBlockingEnabled = false } = await chrome.storage.local.get("adBlockingEnabled");
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: adBlockingEnabled ? ["ad_blocker"] : [],
    disableRulesetIds: adBlockingEnabled ? [] : ["ad_blocker"]
  });
  const { blockingEnabled = true, blockedSites = DEFAULT_SITES, scheduleEnabled = false, scheduleStart = "16:00", scheduleEnd = "21:00" } = await chrome.storage.local.get(["blockingEnabled", "blockedSites", "scheduleEnabled", "scheduleStart", "scheduleEnd"]);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = value => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };
  const start = toMinutes(scheduleStart), end = toMinutes(scheduleEnd);
  const insideSchedule = start <= end ? currentMinutes >= start && currentMinutes < end : currentMinutes >= start || currentMinutes < end;
  const shouldBlock = blockingEnabled && (!scheduleEnabled || insideSchedule);
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = oldRules.map(rule => rule.id);
  const addRules = shouldBlock ? blockedSites.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame"]
    }
  })) : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}
