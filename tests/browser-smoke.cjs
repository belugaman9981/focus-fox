// Run with: node --test tests/browser-smoke.cjs
// Uses installed Chrome with mocked extension APIs; no external websites or dependencies.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

test("Chrome renders dark pages and runs the popup focus/break flow", { timeout: 45000 }, async () => {
  const profile = mkdtempSync(join(tmpdir(), "focusfox-browser-"));
  const browser = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let socket;
  try {
    const address = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Chrome startup timed out")), 15000);
      browser.on("error", error => { clearTimeout(timer); reject(error); });
      browser.stderr.on("data", chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(address);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let serial = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!pending.has(message.id)) return;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    };
    function command(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      });
    }
    const { targetId } = await command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => command(method, params, sessionId);
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: false });
    const background = readFileSync(resolve(__dirname, "../background.js"), "utf8");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.testData = { darkMode: false, lastTab: "timer", tasks: [] };
      window.notices = [];
      const listeners = [], messages = [];
      window.chrome = {
        storage: { onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
          async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, testData[key]])); },
          async set(values) {
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
              if (testData[key] !== value) changes[key] = { oldValue: testData[key], newValue: value };
              testData[key] = value;
            }
            if (Object.keys(changes).length) listeners.forEach(fn => fn(changes, "local"));
          }, async remove(key) { delete testData[key]; }
        } },
        runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} },
          onMessage: { addListener(fn) { messages.push(fn); } },
          sendMessage(message) { return new Promise(resolve => messages[0](message, {}, resolve)); }
        },
        alarms: { onAlarm: { addListener() {} }, async create() {}, async clear() {} },
        notifications: { async create(notice) { notices.push(notice); } }
      };
      ${background}
    ` });
    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function ready(expression) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Page did not become ready: ${expression}`);
    }
    const pageUrl = name => pathToFileURL(resolve(__dirname, "..", name)).href;
    await send("Page.navigate", { url: pageUrl("popup.html") });
    await ready('document.querySelector("#dark-mode")?.disabled === false && document.querySelector("#timer-start")?.disabled === false');
    await evaluate('document.querySelector("#dark-mode").click()');
    await ready('testData.darkMode === true');
    assert.equal(await evaluate('document.documentElement.dataset.theme'), "dark");
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".app-shell")).backgroundColor'), "rgb(24, 35, 29)");
    await evaluate('document.querySelector("#timer-start").click()');
    await ready('testData.timerRunning === true && !document.querySelector("#timer-start").disabled');
    assert.equal(await evaluate('document.querySelector("#timer-start").textContent'), "Stop");
    await evaluate('chrome.storage.local.set({timerEnd: Date.now() - 1000}).then(() => chrome.runtime.sendMessage({type: "TIMER_ACTION", action: "sync"}))');
    await ready('document.querySelector("#timer-heading").textContent === "5-MINUTE BREAK" && !document.querySelector("#timer-reset").disabled');
    assert.match(await evaluate('document.querySelector("#timer-display").textContent'), /^0[45]:/);
    assert.equal(await evaluate('testData.streak'), 1);
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(profile, "dark-break.png"), Buffer.from(screenshot.data, "base64"));
    console.log(`Dark mode screenshot: ${join(profile, "dark-break.png")}`);
    await evaluate('document.querySelector("#timer-reset").click()');
    await ready('testData.timerRunning === false && testData.timerMode === "focus"');
    await evaluate('chrome.runtime.sendMessage({type: "TIMER_ACTION", action: "break"}).then(() => chrome.storage.local.set({timerEnd: Date.now() - 1000})).then(() => chrome.runtime.sendMessage({type: "TIMER_ACTION", action: "sync"}))');
    assert.equal(await evaluate('notices.at(-1).title'), "Break complete!");
    for (const [page, card] of [["options.html", ".options-card"], ["blocked.html", ".blocked-card"]]) {
      await send("Page.navigate", { url: pageUrl(page) });
      await ready(`document.querySelector(${JSON.stringify(card)}) && document.documentElement.dataset.theme === "light"`);
      await evaluate('chrome.storage.local.set({darkMode: true})');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(card)})).backgroundColor`), "rgb(24, 35, 29)");
      await evaluate('chrome.storage.local.set({darkMode: false})');
      assert.equal(await evaluate('document.documentElement.dataset.theme'), "light");
    }
    await command("Browser.close");
  } finally {
    socket?.close();
    browser.kill();
  }
});
