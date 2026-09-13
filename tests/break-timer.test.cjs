const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const source = readFileSync(resolve(__dirname, "../background.js"), "utf8");

function timer(saved = {}) {
  const data = { ...saved }, alarms = new Map(), notices = [], events = {};
  let now = new Date("2026-09-12T12:00:00").getTime();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const event = name => ({ addListener(fn) { events[name] = fn; } });
  const chrome = {
    runtime: { onMessage: event("message"), onStartup: event("startup"), onInstalled: event("installed") },
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])); },
      async set(values) { Object.assign(data, values); }
    } },
    alarms: { onAlarm: event("alarm"), async create(name, options) { alarms.set(name, options); }, async clear(name) { alarms.delete(name); } },
    notifications: { async create(notice) { notices.push(notice); } }
  };
  const context = vm.createContext({ chrome, Date: Clock });
  vm.runInContext(source, context);
  return { data, alarms, notices, events, advance(ms) { now += ms; },
    action: (action, minutes) => new Promise(resolve => events.message({ type: "TIMER_ACTION", action, minutes }, {}, resolve)) };
}

test("focus completes into a five-minute break and break ends without another study credit", async () => {
  const app = timer({ blockingEnabled: true, adBlockingEnabled: true });
  await app.action("start");
  assert.equal(app.data.timerMode, "focus");
  app.advance(25 * 60 * 1000);
  await app.events.alarm({ name: "focus-timer" });
  assert.equal(app.data.timerMode, "break");
  assert.equal(app.data.timerRunning, true);
  assert.equal(app.data.streak, 1);
  assert.equal(app.alarms.has("focus-timer"), false);
  assert.ok(app.alarms.has("break-timer"));
  assert.match(app.notices[0].title, /Focus session complete/);
  app.advance(5 * 60 * 1000);
  await app.events.alarm({ name: "break-timer" });
  assert.equal(app.data.timerMode, "focus");
  assert.equal(app.data.timerRunning, false);
  assert.equal(app.data.streak, 1);
  assert.equal(app.data.blockingEnabled, true);
  assert.equal(app.data.adBlockingEnabled, true);
  assert.equal(app.alarms.size, 0);
  assert.match(app.notices[1].title, /Break complete/);
});

test("manual breaks survive worker restart, stop cleanly, and do not earn streaks", async () => {
  const app = timer();
  await app.action("break");
  const reopened = timer(app.data);
  await reopened.action("sync");
  assert.equal(reopened.alarms.get("break-timer").when, app.data.timerEnd);
  await reopened.action("reset");
  reopened.advance(10 * 60 * 1000);
  await reopened.events.alarm({ name: "break-timer" });
  assert.equal(reopened.data.timerRunning, false);
  assert.equal(reopened.data.timerMode, "focus");
  assert.equal(reopened.data.streak, undefined);
  assert.equal(reopened.notices.length, 0);
});

test("break cannot replace running focus; duplicate completion does not restart break", async () => {
  const app = timer();
  await app.action("reset", 45);
  await app.action("start");
  assert.equal((await app.action("break")).ok, false);
  assert.equal(app.data.timerMode, "focus");
  app.advance(45 * 60 * 1000);
  await Promise.all([app.events.alarm({ name: "focus-timer" }), app.action("sync")]);
  assert.equal(app.notices.length, 1);
  assert.equal(app.data.focusMinutes, 45);
  await app.action("stop");
  assert.equal(app.data.timerRunning, false);
  assert.equal(app.alarms.size, 0);
});
