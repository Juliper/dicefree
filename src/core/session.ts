import { isDie, normalizePool, type DiceGroup, type RollResult } from "./dice";

export const LIMITS = {
  groupCount: [0, 50],
  modifier: [-99, 99],
} as const satisfies Record<string, readonly [number, number]>;

export const HISTORY_MAX = 100;

const FORMAT = "dicefree";
const VERSION = 2;

export interface Session {
  pool: DiceGroup[];
  modifier: number;
  history: RollResult[]; // newest first
}

export interface SessionFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  settings: { pool: DiceGroup[]; modifier: number };
  history: RollResult[];
}

export function emptySession(): Session {
  return { pool: [], modifier: 0, history: [] };
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

export function toFile(s: Session): SessionFile {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: { pool: s.pool, modifier: s.modifier },
    history: s.history,
  };
}

const isIntArray = (a: unknown): a is number[] => Array.isArray(a) && a.every(Number.isInteger);

function parseEntry(e: unknown): RollResult | null {
  const r = e as Record<string, unknown> | null;
  if (!r || !Number.isInteger(r.total)) return null;
  const at = typeof r.at === "string" ? r.at : "";
  const modifier = Number.isInteger(r.modifier) ? (r.modifier as number) : 0;

  // v2: mixed pool
  if (Array.isArray(r.groups)) {
    const groups = r.groups.filter((g) => isDie(g?.die) && isIntArray(g?.rolls) && g.rolls.length > 0);
    if (groups.length !== r.groups.length || !groups.length) return null;
    return { groups: groups.map((g) => ({ die: g.die, rolls: g.rolls })), modifier, total: r.total as number, at };
  }
  // v1: single die type
  if (isDie(r.die) && isIntArray(r.rolls) && r.rolls.length > 0) {
    return { groups: [{ die: r.die, rolls: r.rolls }], modifier, total: r.total as number, at };
  }
  return null;
}

function parsePool(raw: unknown): DiceGroup[] {
  if (!Array.isArray(raw)) return [];
  return normalizePool(
    raw
      .filter((g) => isDie(g?.die) && Number.isInteger(g?.count))
      .map((g) => ({ die: g.die, count: clamp(g.count, LIMITS.groupCount) })),
  );
}

/** Parses an exported file (v1 or v2). Throws on foreign files; silently drops malformed history entries. */
export function fromFile(raw: unknown): Session {
  const data = raw as { format?: unknown; settings?: Record<string, unknown>; history?: unknown } | null;
  if (data?.format !== FORMAT) throw new Error("Keine Dicefree-Datei.");
  const mod = data.settings?.modifier;
  return {
    pool: parsePool(data.settings?.pool),
    modifier: Number.isInteger(mod) ? clamp(mod as number, LIMITS.modifier) : 0,
    history: (Array.isArray(data.history) ? data.history : [])
      .map(parseEntry)
      .filter((e): e is RollResult => e !== null)
      .slice(0, HISTORY_MAX),
  };
}
