"use strict";

const DICE = [4, 6, 8, 10, 12, 20, 100];
const LIMITS = { count: [1, 50], modifier: [-50, 50] };
const HISTORY_MAX = 100;
const EXPORT_FORMAT = "dicefree";
const EXPORT_VERSION = 1;

const state = {
  count: 1,
  modifier: 0,
  history: [], // newest first: { die, count, modifier, rolls, total, at }
};

const $ = (id) => document.getElementById(id);

// Unbiased random integer in [1, sides] via rejection sampling.
function rollDie(sides) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / sides) * sides;
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return (x % sides) + 1;
}

function formatModifier(m) {
  return m >= 0 ? `+${m}` : `${m}`;
}

function expression({ count, die, modifier }) {
  return `${count}d${die}${modifier ? formatModifier(modifier) : ""}`;
}

function roll(die) {
  const rolls = Array.from({ length: state.count }, () => rollDie(die));
  const total = rolls.reduce((a, b) => a + b, 0) + state.modifier;
  const entry = {
    die,
    count: state.count,
    modifier: state.modifier,
    rolls,
    total,
    at: new Date().toISOString(),
  };
  state.history.unshift(entry);
  state.history.length = Math.min(state.history.length, HISTORY_MAX);
  renderResult(entry);
  renderHistory();
}

function renderResult(entry) {
  const box = document.querySelector(".result");
  box.classList.remove("crit", "fumble", "pop");
  void box.offsetWidth; // restart animation

  $("result-label").textContent = expression(entry);
  $("result-total").textContent = entry.total;

  const parts = [];
  if (entry.rolls.length > 1 || entry.modifier) {
    parts.push(`[${entry.rolls.join(", ")}]`);
    if (entry.modifier) parts.push(formatModifier(entry.modifier));
  }
  if (entry.die === 20 && entry.count === 1) {
    if (entry.rolls[0] === 20) { box.classList.add("crit"); parts.push("Natürliche 20!"); }
    if (entry.rolls[0] === 1) { box.classList.add("fumble"); parts.push("Natürliche 1"); }
  }
  $("result-detail").textContent = parts.join("  ");
  box.classList.add("pop");
}

function renderHistory() {
  const list = $("history-list");
  list.replaceChildren(
    ...state.history.map((e) => {
      const li = document.createElement("li");
      const expr = document.createElement("span");
      expr.className = "h-expr";
      expr.textContent = `${expression(e)}  [${e.rolls.join(", ")}]`;
      const total = document.createElement("span");
      total.className = "h-total";
      total.textContent = e.total;
      li.append(expr, total);
      return li;
    })
  );
  $("history-empty").hidden = state.history.length > 0;
}

function renderControls() {
  $("count-value").textContent = state.count;
  $("modifier-value").textContent = formatModifier(state.modifier);
}

function step(key, delta) {
  const [min, max] = LIMITS[key];
  state[key] = Math.min(max, Math.max(min, state[key] + delta));
  renderControls();
}

// --- Import / Export ---

function exportData() {
  const data = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { count: state.count, modifier: state.modifier },
    history: state.history,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dicefree-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clampInt(v, [min, max], fallback) {
  return Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function isValidEntry(e) {
  return e && DICE.includes(e.die) && Number.isInteger(e.total)
    && Array.isArray(e.rolls) && e.rolls.every(Number.isInteger);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data?.format !== EXPORT_FORMAT) throw new Error("Keine Dicefree-Datei.");
    state.count = clampInt(data.settings?.count, LIMITS.count, 1);
    state.modifier = clampInt(data.settings?.modifier, LIMITS.modifier, 0);
    state.history = (Array.isArray(data.history) ? data.history : [])
      .filter(isValidEntry)
      .slice(0, HISTORY_MAX);
    renderControls();
    renderHistory();
    if (state.history[0]) renderResult(state.history[0]);
  } catch (err) {
    alert(`Import fehlgeschlagen: ${err.message}`);
  }
}

// --- Wiring ---

function init() {
  const grid = $("dice-grid");
  for (const die of DICE) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "die";
    btn.textContent = `d${die}`;
    btn.addEventListener("click", () => roll(die));
    grid.append(btn);
  }

  document.querySelectorAll("[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => step(btn.dataset.step, Number(btn.dataset.delta)));
  });

  $("clear-btn").addEventListener("click", () => {
    state.history = [];
    renderHistory();
  });
  $("export-btn").addEventListener("click", exportData);
  $("import-input").addEventListener("change", (ev) => {
    const file = ev.target.files?.[0];
    if (file) importData(file);
    ev.target.value = "";
  });

  renderControls();
  renderHistory();
}

init();
