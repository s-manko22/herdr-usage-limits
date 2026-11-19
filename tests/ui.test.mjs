import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const folder = new URL("../mods/usage-limits/", import.meta.url);
const i18nSource = readFileSync(new URL("i18n.js", folder), "utf8");
const { text, duration } = await import(`data:text/javascript;base64,${Buffer.from(i18nSource).toString("base64")}`);
const source = readFileSync(new URL("main.js", folder), "utf8")
  .replace(/^import .*;$/gm, "").replace("export default class Limits", "class Limits");

// Describe the native UI as a tree so real render callbacks can be exercised.
function widget() {
  const node = { children: [] };
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key in target && key !== "children") return target[key];
      if (key === "nodes") return target.children;
      return (...args) => {
        if (key === "child") target.children.push(args[0]);
        if (key === "children") target.children.push(...args[0]);
        if (key === "when" && args[0]) args[1](proxy);
        if (key === "id") target.id = args[0];
        if (key === "on_click") target.click = args[0];
        if (key === "tooltip") target.tooltip = args[0];
        return proxy;
      };
    },
  });
  return proxy;
}

function setup(saved) {
  const storage = new Map(saved === undefined ? [] : [["language", saved]]);
  const cx = { notify() {} };
  let currentProps = {};
  const context = vm.createContext({
    View: class {}, div: widget, svg: widget, v_flex: widget, h_flex: widget,
    theme: () => ({}), checking: () => true, props: () => currentProps, text, duration,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  const Limits = vm.runInContext(`${source}\nLimits;`, context);
  const create = props => { currentProps = props ?? {}; const view = new Limits(); view.init({}, cx); return view; };
  return { create, cx, storage };
}

function flatten(node) {
  return typeof node === "string" ? [node] : [node, ...node.nodes.flatMap(flatten)];
}

test("language buttons translate loaded data immediately and persist across copies", () => {
  const { create, cx, storage } = setup();
  const view = create();
  view.services = [{ name: "Claude", at: Date.now() / 1000, source: "claude_api",
    note: { key: "claude_http", code: 429 }, windows: [{ label: "week", used: 85,
      reset: Date.now() / 1000 + 3600, detail: "monthly_budget" }] }];
  let nodes = flatten(view.render(cx));
  assert(nodes.includes("Лимиты"));
  nodes.find(node => node.id === "language-en").click(null, cx);
  nodes = flatten(view.render(cx));
  for (const label of ["Limits", "Refresh", "Week", "15% left", "Monthly extra usage budget",
    "Claude API: HTTP 429. Using the latest available data."]) assert(nodes.includes(label), label);
  assert(!nodes.filter(node => typeof node === "string").some(value => /[а-яё]/i.test(value)));
  assert.equal(storage.get("language"), "en");
  assert.equal(create().language, "en");
  nodes.find(node => node.id === "language-ru").click(null, cx);
  assert(flatten(view.render(cx)).includes("Лимиты"));
  assert.equal(create().language, "ru");
});

test("English installation, loading, expired data and refresh failures are translated", () => {
  const { create, cx } = setup();
  const view = create({ language: "en" });
  view.loading = true;
  view.error = "refresh_error";
  view.services = [{ name: "Codex", note: "collect_error", source: "codex_source",
    windows: [{ label: "quota", used: 20, reset: 1 }] }];
  const nodes = flatten(view.render(cx));
  for (const label of ["Refreshing…", "Waiting for data", "No data", "Period expired — waiting for new data",
    "Could not refresh data. Check that Python 3 is available.", "Could not read quotas. Click Refresh."])
    assert(nodes.includes(label), label);
  assert.equal(setup("invalid").create().language, "ru");
});

test("duration units and parameterized periods follow the selected language", () => {
  assert.equal(duration(60, "en"), "1m");
  assert.equal(duration(3600, "en"), "1h 0m");
  assert.equal(duration(90000, "en"), "1d 1h");
  assert.equal(duration(3600, "ru"), "1 ч 0 мин");
  assert.equal(text("en", { key: "days", count: 3 }), "3d");
});
