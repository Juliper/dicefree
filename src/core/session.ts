import { isDie, type RollResult } from "./dice";

export const LIMITS = {
  count: [1, 50],
  modifier: [-50, 50],
} as const satisfies Record<string, readonly [number, number]>;

export const HISTORY_MAX = 100;

const FORMAT = "dicefree";
const VERSION = 1;

export interface Session {
  count: number;
  modifier: number;
  history: RollResult[]; // newest first
}

export interface SessionFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  settings: { count: number; modifier: number };
  history: RollResult[];
}

export function emptySession(): Session {
  return { count: 1, modifier: 0, history: [] };
}

export function clamp(v: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, v));
}

export function toFile(s: Session): SessionFile {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: { count: s.count, modifier: s.modifier },
    history: s.history,
  };
}

function isValidEntry(e: unknown): e is RollResult {
  const r = e as RollResult;
  return (
    !!r &&
    isDie(r.die) &&
    Number.isInteger(r.count) &&
    Number.isInteger(r.modifier) &&
    Number.isInteger(r.total) &&
    Array.isArray(r.rolls) &&
    r.rolls.every(Number.isInteger)
  );
}

function intOr(v: unknown, range: readonly [number, number], fallback: number): number {
  return Number.isInteger(v) ? clamp(v as number, range) : fallback;
}

/** Parses an exported file. Throws on foreign files; silently drops malformed history entries. */
export function fromFile(raw: unknown): Session {
  const data = raw as Partial<SessionFile> | null;
  if (data?.format !== FORMAT) throw new Error("Keine Dicefree-Datei.");
  return {
    count: intOr(data.settings?.count, LIMITS.count, 1),
    modifier: intOr(data.settings?.modifier, LIMITS.modifier, 0),
    history: (Array.isArray(data.history) ? data.history : [])
      .filter(isValidEntry)
      .slice(0, HISTORY_MAX),
  };
}
