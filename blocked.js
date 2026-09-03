document.querySelector("#back").addEventListener("click", () => history.length > 1 ? history.back() : location.href = "about:blank");
document.querySelector("#pause").addEventListener("click", async () => { await chrome.storage.local.set({ blockingEnabled: false }); await chrome.runtime.sendMessage({ type: "REFRESH_RULES" }); document.querySelector("#pause").textContent = "Blocking paused"; });
