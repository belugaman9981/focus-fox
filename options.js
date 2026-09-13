const DEFAULT_SITES = ["facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com", "reddit.com", "snapchat.com", "pinterest.com", "tumblr.com", "threads.net", "discord.com", "discord.gg", "twitch.tv", "youtube.com"];
const sites = document.querySelector("#sites");
const status = document.querySelector("#save-status");
const apiKey = document.querySelector("#api-key");
const model = document.querySelector("#model");
const scheduleEnabled = document.querySelector("#schedule-enabled");
const scheduleStart = document.querySelector("#schedule-start");
const scheduleEnd = document.querySelector("#schedule-end");
const adBlockingEnabled = document.querySelector("#ad-blocking-enabled");
let statusTimeout;
document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get(["blockedSites", "deepseekApiKey", "deepseekModel", "scheduleEnabled", "scheduleStart", "scheduleEnd", "adBlockingEnabled"]);
  sites.value = (data.blockedSites || DEFAULT_SITES).join("\n");
  apiKey.value = data.deepseekApiKey || "";
  model.value = data.deepseekModel || "deepseek-v4-flash";
  scheduleEnabled.checked = data.scheduleEnabled || false;
  scheduleStart.value = data.scheduleStart || "16:00";
  scheduleEnd.value = data.scheduleEnd || "21:00";
  adBlockingEnabled.checked = data.adBlockingEnabled === true;
});
document.querySelector("#save").addEventListener("click", save);
document.querySelector("#reset").addEventListener("click", () => { sites.value = DEFAULT_SITES.join("\n"); save(); });
document.querySelector("#show-key").addEventListener("click", event => {
  const showing = apiKey.type === "text";
  apiKey.type = showing ? "password" : "text";
  event.target.textContent = showing ? "Show" : "Hide";
});
async function save() {
  clearTimeout(statusTimeout);
  document.querySelector("#save").disabled = true;
  document.querySelector("#reset").disabled = true;
  status.textContent = "Saving…";
  try {
    const blockedSites = [...new Set(sites.value.split(/\n|,/).map(cleanDomain).filter(Boolean))];
    await chrome.storage.local.set({ blockedSites, deepseekApiKey: apiKey.value.trim(), deepseekModel: model.value, scheduleEnabled: scheduleEnabled.checked, scheduleStart: scheduleStart.value, scheduleEnd: scheduleEnd.value, adBlockingEnabled: adBlockingEnabled.checked });
    const result = await chrome.runtime.sendMessage({ type: "REFRESH_RULES" });
    if (!result?.ok) throw new Error(result?.error || "Could not apply blocking rules. Try saving again.");
    sites.value = blockedSites.join("\n"); status.textContent = "Saved! Reload open pages to apply ad blocking changes.";
    statusTimeout = setTimeout(() => status.textContent = "", 5000);
  } catch (error) {
    status.textContent = `Could not apply changes: ${error.message}`;
  } finally {
    document.querySelector("#save").disabled = false;
    document.querySelector("#reset").disabled = false;
  }
}
function cleanDomain(value) { return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; }
