const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const read = file => readFileSync(resolve(__dirname, "..", file), "utf8");

function extension(saved = {}) {
  const data = { ...saved };
  const events = {};
  let dynamic = [], enabled = [], fail = false;
  const event = name => ({ addListener: callback => { events[name] = callback; } });
  const chrome = {
    runtime: { onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message") },
    alarms: { create() {}, clear() {}, onAlarm: event("alarm") },
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])); },
      async set(values) { Object.assign(data, values); }
    } },
    declarativeNetRequest: {
      async updateEnabledRulesets({ enableRulesetIds, disableRulesetIds }) {
        if (fail) throw new Error("Rules unavailable");
        enabled = [...new Set([...enabled.filter(id => !disableRulesetIds.includes(id)), ...enableRulesetIds])];
      },
      async getDynamicRules() { return dynamic; },
      async updateDynamicRules({ addRules }) { dynamic = addRules; }
    }
  };
  vm.runInNewContext(read("background.js"), { chrome });
  chrome.runtime.sendMessage = message => new Promise(resolve => events.message(message, {}, resolve));
  return { chrome, events, data, refresh: () => chrome.runtime.sendMessage({ type: "REFRESH_RULES" }),
    ads: () => enabled.includes("ad_blocker"), social: () => dynamic.length, fail: value => { fail = value; } };
}

test("ad blocking defaults off on install and restores the saved option on update", async () => {
  const ext = extension();
  await ext.events.installed();
  assert.equal(ext.ads(), false);
  assert.equal(ext.social(), 14);
  ext.data.adBlockingEnabled = true;
  await ext.events.installed();
  assert.equal(ext.ads(), true);
});

test("ad toggle is independent of paused and scheduled social blocking", async () => {
  const ext = extension({ adBlockingEnabled: true, blockingEnabled: false });
  assert.equal((await ext.refresh()).ok, true);
  assert.equal(ext.ads(), true);
  assert.equal(ext.social(), 0);
  Object.assign(ext.data, { blockingEnabled: true, scheduleEnabled: true, scheduleStart: "00:00", scheduleEnd: "00:00" });
  await ext.refresh();
  assert.equal(ext.ads(), true);
  assert.equal(ext.social(), 0);
  Object.assign(ext.data, { adBlockingEnabled: false, scheduleEnabled: false });
  await ext.refresh();
  assert.equal(ext.ads(), false);
  assert.equal(ext.social(), 14);
});

test("failed rule updates are reported and do not break later refreshes", async () => {
  const ext = extension({ adBlockingEnabled: true });
  ext.fail(true);
  assert.equal((await ext.refresh()).ok, false);
  ext.fail(false);
  assert.equal((await ext.refresh()).ok, true);
  assert.equal(ext.ads(), true);
});

test("settings save enables and disables ads and restores the saved checkbox", async () => {
  const ext = extension();
  const nodes = new Map();
  const listeners = {};
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { value: "", checked: false, addEventListener() {} });
      return nodes.get(selector);
    },
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  const context = vm.createContext({ chrome: ext.chrome, document, setTimeout() {}, clearTimeout() {} });
  vm.runInContext(read("options.js"), context);
  await listeners.DOMContentLoaded();
  const toggle = nodes.get("#ad-blocking-enabled");
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  await vm.runInContext("save()", context);
  assert.equal(ext.data.adBlockingEnabled, true);
  assert.equal(ext.ads(), true);
  toggle.checked = false;
  await listeners.DOMContentLoaded();
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  await vm.runInContext("save()", context);
  assert.equal(ext.ads(), false);
  ext.fail(true);
  await vm.runInContext("save()", context);
  assert.match(nodes.get("#save-status").textContent, /Could not apply changes/);
  assert.equal(nodes.get("#save").disabled, false);
});

test("manifest bundles an opt-in ad list without blocking top-level navigation", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const resource = manifest.declarative_net_request.rule_resources.find(item => item.id === "ad_blocker");
  assert.equal(resource.enabled, false);
  const rules = JSON.parse(read(resource.path));
  assert.equal(new Set(rules.map(rule => rule.id)).size, rules.length);
  for (const rule of rules) {
    assert.equal(rule.action.type, "block");
    assert.equal(rule.condition.resourceTypes.includes("main_frame"), false);
    assert.ok(rule.condition.requestDomains.includes("doubleclick.net"));
    assert.ok(!rule.condition.requestDomains.includes("google.com"));
    assert.ok(!rule.condition.requestDomains.includes("api.deepseek.com"));
  }
});
