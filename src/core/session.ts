import { isDie, normalizePool, type DiceGroup, type RollMode, type RollResult } from "./dice";

export const LIMITS = {
  groupCount: [0, 50],
  modifier: [-99, 99],
} as const satisfies Record<string, readonly [number, number]>;

export const HISTORY_MAX = 100;
export const PRESETS_MAX = 50;
export const PRESET_NAME_MAX = 40;

const FORMAT = "dicefree";
const VERSION = 3;

/** A saved roll, e.g. "Langschwert: 1d8 + 3". */
export interface Preset {
  id: string;
  name: string;
  dice: DiceGroup[];
  modifier: number;
}

export interface Session {
  pool: DiceGroup[];
  modifier: number;
  mode: RollMode;
  presets: Preset[];
  history: RollResult[]; // newest first
}

export interface SessionFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  settings: { pool: DiceGroup[]; modifier: number; mode: RollMode };
  presets: Preset[];
  history: RollResult[];
}

export function emptySession(): Session {
  return { pool: [], modifier: 0, mode: "normal", presets: [], history: [] };
}

export function clamp(v: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, v));
}

/** Changes how many of `die` are in the pool; removes the group at zero. */
export function adjustPool(pool: DiceGroup[], die: DiceGroup["die"], delta: number): DiceGroup[] {
  const current = pool.find((g) => g.die === die)?.count ?? 0;
  const count = clamp(current + delta, LIMITS.groupCount);
  return normalizePool([...pool.filter((g) => g.die !== die), { die, count }]);
}

const newId = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

/** Builds a preset from user input; returns null if there is nothing to save. */
export function makePreset(name: string, dice: DiceGroup[], modifier: number): Preset | null {
  const pool = normalizePool(dice);
  const trimmed = name.trim().slice(0, PRESET_NAME_MAX);
  if (!pool.length || !trimmed) return null;
  return { id: newId(), name: trimmed, dice: pool, modifier: clamp(Math.trunc(modifier) || 0, LIMITS.modifier) };
}

export function toFile(s: Session): SessionFile {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: { pool: s.pool, modifier: s.modifier, mode: s.mode },
    presets: s.presets,
    history: s.history,
  };
}

// --- Parsing (tolerant: drops what it cannot understand) ---

const isIntArray = (a: unknown): a is number[] => Array.isArray(a) && a.every(Number.isInteger);
const intIn = (v: unknown, range: readonly [number, number], fallback: number) =>
  Number.isInteger(v) ? clamp(v as number, range) : fallback;
const isMode = (m: unknown): m is RollMode => m === "normal" || m === "advantage" || m === "disadvantage";

function parsePool(raw: unknown): DiceGroup[] {
  if (!Array.isArray(raw)) return [];
  return normalizePool(
    raw
      .filter((g) => isDie(g?.die) && Number.isInteger(g?.count))
      .map((g) => ({ die: g.die, count: clamp(g.count, LIMITS.groupCount) })),
  );
}

function parsePreset(raw: unknown): Preset | null {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p.name !== "string") return null;
  const preset = makePreset(p.name, parsePool(p.dice), intIn(p.modifier, LIMITS.modifier, 0));
  if (preset && typeof p.id === "string" && p.id) preset.id = p.id;
  return preset;
}

function parseEntry(e: unknown): RollResult | null {
  const r = e as Record<string, unknown> | null;
  if (!r || !Number.isInteger(r.total)) return null;
  const base = {
    modifier: Number.isInteger(r.modifier) ? (r.modifier as number) : 0,
    total: r.total as number,
    at: typeof r.at === "string" ? r.at : "",
  };
  let result: RollResult | null = null;

  // v2+: mixed pool
  if (Array.isArray(r.groups)) {
    const ok = r.groups.every(
      (g) => isDie(g?.die) && isIntArray(g?.rolls) && g.rolls.length > 0 && (g.dropped === undefined || isIntArray(g.dropped)),
    );
    if (!ok || !r.groups.length) return null;
    result = {
      groups: r.groups.map((g) => (g.dropped ? { die: g.die, rolls: g.rolls, dropped: g.dropped } : { die: g.die, rolls: g.rolls })),
      ...base,
    };
  }
  // v1: single die type
  else if (isDie(r.die) && isIntArray(r.rolls) && r.rolls.length > 0) {
    result = { groups: [{ die: r.die, rolls: r.rolls }], ...base };
  }
  if (!result) return null;
  if (r.mode === "advantage" || r.mode === "disadvantage") result.mode = r.mode;
  if (typeof r.label === "string" && r.label) result.label = r.label.slice(0, PRESET_NAME_MAX);
  return result;
}

const parseList = <T>(raw: unknown, parse: (x: unknown) => T | null, max: number): T[] =>
  (Array.isArray(raw) ? raw : [])
    .map(parse)
    .filter((x): x is T => x !== null)
    .slice(0, max);

/** Parses an exported file (v1–v3). Throws on foreign files; silently drops malformed entries. */
export function fromFile(raw: unknown): Session {
  const data = raw as { format?: unknown; settings?: Record<string, unknown>; presets?: unknown; history?: unknown } | null;
  if (data?.format !== FORMAT) throw new Error("Keine Dicefree-Datei.");
  return {
    pool: parsePool(data.settings?.pool),
    modifier: intIn(data.settings?.modifier, LIMITS.modifier, 0),
    mode: isMode(data.settings?.mode) ? data.settings.mode : "normal",
    presets: parseList(data.presets, parsePreset, PRESETS_MAX),
    history: parseList(data.history, parseEntry, HISTORY_MAX),
  };
}

/** What is kept on the device between visits: settings and saved rolls, not the roll history. */
export function toStored(s: Session): SessionFile {
  // Built without reading `s.history`, so reactive autosave doesn't re-run on every roll.
  return toFile({ pool: s.pool, modifier: s.modifier, mode: s.mode, presets: s.presets, history: [] });
}

/** Restores the device-local state; anything unreadable falls back to an empty session. */
export function fromStored(raw: unknown): Session {
  try {
    return { ...fromFile(raw), history: [] };
  } catch {
    return emptySession();
  }
}
