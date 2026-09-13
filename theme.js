(() => {
  const apply = dark => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const toggle = document.querySelector("#dark-mode");
    if (toggle) toggle.checked = dark;
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.darkMode) apply(changes.darkMode.newValue === true);
  });
  async function initTheme() {
    const toggle = document.querySelector("#dark-mode");
    const status = document.querySelector("#theme-status");
    try {
      const { darkMode = false } = await chrome.storage.local.get("darkMode");
      apply(darkMode === true);
      if (!toggle) return;
      toggle.disabled = false;
      toggle.addEventListener("change", async () => {
        const dark = toggle.checked;
        toggle.disabled = true;
        apply(dark);
        try {
          await chrome.storage.local.set({ darkMode: dark });
          if (status) status.textContent = "";
        } catch (_) {
          apply(!dark);
          if (status) status.textContent = "Could not save theme. Try again.";
        } finally {
          toggle.disabled = false;
        }
      });
    } catch (_) {
      if (status) status.textContent = "Could not load theme. Reopen this page to retry.";
    }
  }
  initTheme();
})();
