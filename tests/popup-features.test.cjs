const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const source = readFileSync(resolve(__dirname, "../popup.js"), "utf8");
const html = readFileSync(resolve(__dirname, "../popup.html"), "utf8");

function popup(data = {}) {
  const nodes = new Map();
  function node() {
    const classes = new Set();
    return { value: "", checked: false, hidden: false, disabled: false, textContent: "", dataset: {},
      handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; },
      classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); },
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); }, contains: name => classes.has(name) }
    };
  }
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(`#${id}`, node());
  const tabs = ["helper", "tasks", "timer"].map(id => Object.assign(node(), { dataset: { tab: id } }));
  const document = {
    addEventListener() {},
    querySelector(selector) { assert.ok(nodes.has(selector), `Missing HTML control: ${selector}`); return nodes.get(selector); },
    querySelectorAll(selector) { return selector === ".tab" ? tabs : selector === ".panel" ? ["helper", "tasks", "timer"].map(id => Object.assign(nodes.get(`#${id}`), { id })) : []; },
    createElement() { return { set textContent(value) { this.innerHTML = String(value).replaceAll("<", "&lt;"); } }; }
  };
  let failStorage = false, failRules = false, copied;
  const chrome = {
    storage: { onChanged: { addListener() {} }, local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])); },
      async set(values) { if (failStorage) throw new Error("Storage failed"); Object.assign(data, values); }
    } },
    runtime: { async sendMessage() { const ok = !failRules; failRules = false; return { ok }; } }
  };
  const context = vm.createContext({ document, chrome, clearInterval() {}, setInterval() {}, navigator: { clipboard: { async writeText(value) { copied = value; } } } });
  vm.runInContext(source, context);
  return { data, nodes, run: code => vm.runInContext(code, context), failStorage: value => { failStorage = value; },
    failRules: () => { failRules = true; }, copied: () => copied };
}

test("notes clear and undo survive reopening; copy uses the current notes", async () => {
  const app = popup({ scratchpad: "Keep this formula: x = 2" });
  await app.run("init()");
  await app.nodes.get("#copy-notes").handlers.click();
  assert.equal(app.copied(), "Keep this formula: x = 2");
  await app.nodes.get("#clear-notes").handlers.click();
  assert.equal(app.data.scratchpad, "");
  assert.equal(app.data.clearedNotes, "Keep this formula: x = 2");
  const reopened = popup(app.data);
  await reopened.run("init()");
  assert.equal(reopened.nodes.get("#undo-notes").hidden, false);
  await reopened.nodes.get("#undo-notes").handlers.click();
  assert.equal(app.data.scratchpad, "Keep this formula: x = 2");
  assert.equal(reopened.nodes.get("#scratchpad").value, app.data.scratchpad);
  assert.equal(app.data.clearedNotes, "");
});

test("failed clear preserves notes and allows retry", async () => {
  const app = popup({ scratchpad: "Do not lose me" });
  await app.run("init()");
  app.failStorage(true);
  await app.run("clearNotes()");
  assert.equal(app.nodes.get("#scratchpad").value, "Do not lose me");
  assert.equal(app.data.scratchpad, "Do not lose me");
  assert.equal(app.nodes.get("#clear-notes").disabled, false);
  app.failStorage(false);
  await app.run("clearNotes()");
  assert.equal(app.data.clearedNotes, "Do not lose me");
});

test("typing then immediately clearing preserves the latest draft for undo", async () => {
  const app = popup();
  await app.run("init()");
  app.nodes.get("#scratchpad").value = "Latest draft";
  app.nodes.get("#scratchpad").handlers.input();
  await app.run("clearNotes()");
  assert.equal(app.data.scratchpad, "");
  assert.equal(app.data.clearedNotes, "Latest draft");
  app.nodes.get("#scratchpad").value = "Replacement";
  app.nodes.get("#scratchpad").handlers.input();
  await app.run("notesWrite");
  assert.equal(app.data.clearedNotes, "");
  assert.equal(app.data.scratchpad, "Replacement");
});

test("quick ad toggle persists and rolls back when applying fails", async () => {
  const app = popup({ blockingEnabled: false });
  await app.run("init()");
  const toggle = app.nodes.get("#ad-toggle");
  toggle.checked = true;
  await toggle.handlers.change();
  assert.equal(app.data.adBlockingEnabled, true);
  assert.equal(app.data.blockingEnabled, false);
  app.failRules();
  toggle.checked = false;
  await toggle.handlers.change();
  assert.equal(app.data.adBlockingEnabled, true);
  assert.equal(toggle.checked, true);
  assert.equal(toggle.disabled, false);
  assert.match(app.nodes.get("#ad-status").textContent, /Could not apply/);
});

test("last tab restores and task progress handles empty, partial, and complete lists", async () => {
  const app = popup({ lastTab: "tasks", tasks: [{ id: "1", text: "Math", done: true }, { id: "2", text: "Science", done: false }] });
  await app.run("init()");
  assert.equal(app.nodes.get("#tasks").classList.contains("active"), true);
  assert.equal(app.nodes.get("#task-progress").value, 1);
  assert.equal(app.nodes.get("#task-progress").max, 2);
  app.run('renderTasks([{ id: "1", text: "Math", done: true }])');
  assert.match(app.nodes.get("#task-progress-label").textContent, /all done/);
  app.run("renderTasks([])");
  assert.equal(app.nodes.get("#task-progress").value, 0);
  assert.equal(app.nodes.get("#task-progress").max, 1);
  app.run('switchTab("invalid")');
  assert.equal(app.nodes.get("#helper").classList.contains("active"), true);
});
