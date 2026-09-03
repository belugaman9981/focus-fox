const DEFAULT_SITES = [
  "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
  "reddit.com", "snapchat.com", "pinterest.com", "tumblr.com", "threads.net",
  "discord.com", "discord.gg", "twitch.tv", "youtube.com"
];

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get(["blockingEnabled", "blockedSites"]);
  if (saved.blockingEnabled === undefined) await chrome.storage.local.set({ blockingEnabled: true });
  if (!saved.blockedSites) await chrome.storage.local.set({ blockedSites: DEFAULT_SITES });
  await refreshRules();
});

chrome.runtime.onStartup.addListener(refreshRules);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "REFRESH_RULES") {
    refreshRules().then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "focus-timer") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Focus session complete!",
      message: "Nice work. Take a short break, then come back strong."
    });
    chrome.storage.local.set({ timerEnd: null, timerRunning: false });
  }
});

async function refreshRules() {
  const { blockingEnabled = true, blockedSites = DEFAULT_SITES } = await chrome.storage.local.get(["blockingEnabled", "blockedSites"]);
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = oldRules.map(rule => rule.id);
  const addRules = blockingEnabled ? blockedSites.map((domain, index) => ({
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
