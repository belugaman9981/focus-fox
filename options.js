const DEFAULT_SITES = ["facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com", "reddit.com", "snapchat.com", "pinterest.com", "tumblr.com", "threads.net", "discord.com", "discord.gg", "twitch.tv", "youtube.com"];
const sites = document.querySelector("#sites");
const status = document.querySelector("#save-status");
const apiKey = document.querySelector("#api-key");
const model = document.querySelector("#model");
const scheduleEnabled = document.querySelector("#schedule-enabled");
const scheduleStart = document.querySelector("#schedule-start");
const scheduleEnd = document.querySelector("#schedule-end");
document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get(["blockedSites", "deepseekApiKey", "deepseekModel", "scheduleEnabled", "scheduleStart", "scheduleEnd"]);
  sites.value = (data.blockedSites || DEFAULT_SITES).join("\n");
  apiKey.value = data.deepseekApiKey || "";
  model.value = data.deepseekModel || "deepseek-v4-flash";
  scheduleEnabled.checked = data.scheduleEnabled || false;
  scheduleStart.value = data.scheduleStart || "16:00";
  scheduleEnd.value = data.scheduleEnd || "21:00";
});
document.querySelector("#save").addEventListener("click", save);
document.querySelector("#reset").addEventListener("click", () => { sites.value = DEFAULT_SITES.join("\n"); save(); });
document.querySelector("#show-key").addEventListener("click", event => {
  const showing = apiKey.type === "text";
  apiKey.type = showing ? "password" : "text";
  event.target.textContent = showing ? "Show" : "Hide";
});
async function save() {
  const blockedSites = [...new Set(sites.value.split(/\n|,/).map(cleanDomain).filter(Boolean))];
  await chrome.storage.local.set({ blockedSites, deepseekApiKey: apiKey.value.trim(), deepseekModel: model.value, scheduleEnabled: scheduleEnabled.checked, scheduleStart: scheduleStart.value, scheduleEnd: scheduleEnd.value });
  await chrome.runtime.sendMessage({ type: "REFRESH_RULES" });
  sites.value = blockedSites.join("\n"); status.textContent = "Saved!"; setTimeout(() => status.textContent = "", 1800);
}
function cleanDomain(value) { return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; }
  