import {
  ABILITIES,
  isD20Test,
  isDie,
  normalizePool,
  type Ability,
  type DiceGroup,
  type RollKind,
  type RollMode,
  type RollResult,
} from "./dice";
import { parseActiveEffects, type ActiveEffects } from "./effects";
import { parseCharacter, type Character } from "./character";
import { parseStoredMonster, type Monster } from "./monsters";
import { emptyTracker, parseParty, parseTracker, type PartyMember, type Tracker } from "./initiative";

export const LIMITS = {
  groupCount: [0, 50],
  modifier: [-99, 99],
} as const satisfies Record<string, readonly [number, number]>;

export const HISTORY_MAX = 100;
export const PRESETS_MAX = 50;
export const PRESET_NAME_MAX = 40;

const FORMAT = "dicefree";
const VERSION = 7;
export const CHARACTERS_MAX = 20;
export const ENCOUNTER_MAX = 40;

export const ROLL_KINDS: readonly RollKind[] = ["free", "attack", "check", "save", "damage"];
const isKind = (k: unknown): k is RollKind => ROLL_KINDS.includes(k as RollKind);
const isAbility = (a: unknown): a is Ability => ABILITIES.includes(a as Ability);

/** A saved roll, e.g. "Langschwert: 1d8 + 3" or "Angriff Langschwert: Angriff +5". */
export interface Preset {
  id: string;
  name: string;
  kind: RollKind;
  ability?: Ability;
  dice: DiceGroup[];
  modifier: number;
}

export interface Settings {
  kind: RollKind;
  ability?: Ability;
  pool: DiceGroup[];
  modifier: number;
  mode: RollMode;
  crit: boolean;
  effects: ActiveEffects;
}

export type View = "dice" | "character" | "dm";

/** One monster in the current encounter; several can share a statblock. */
export interface Combatant {
  id: string;
  index: string;
  label: string;
  hp: number;
  maxHp: number;
  effects: ActiveEffects;
}

export interface Session extends Settings {
  view: View;
  presets: Preset[];
  characters: Character[];
  activeCharacterId?: string;
  /** Statblocks used in the encounter, by index. */
  bestiary: Monster[];
  encounter: Combatant[];
  /** Players the DM tracks in initiative (names only). */
  party: PartyMember[];
  tracker: Tracker;
  history: RollResult[]; // newest first
}

export interface SessionFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  settings: Settings & { view: View; activeCharacterId?: string };
  presets: Preset[];
  characters: Character[];
  bestiary: Monster[];
  encounter: Combatant[];
  party: PartyMember[];
  tracker: Tracker;
  history: RollResult[];
}

export function emptySession(): Session {
  return {
    view: "dice",
    kind: "free",
    pool: [],
    modifier: 0,
    mode: "normal",
    crit: false,
    effects: {},
    presets: [],
    characters: [],
    bestiary: [],
    encounter: [],
    party: [],
    tracker: emptyTracker(),
    history: [],
  };
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

export interface PresetInput {
  name: string;
  kind?: RollKind;
  ability?: Ability;
  dice: DiceGroup[];
  modifier: number;
}

/** Builds a preset from user input; returns null if there is nothing to save. D20 Tests always use 1d20. */
export function makePreset(input: PresetInput): Preset | null {
  const kind = input.kind ?? "free";
  const pool = isD20Test(kind) ? [{ die: 20 as const, count: 1 }] : normalizePool(input.dice);
  const name = input.name.trim().slice(0, PRESET_NAME_MAX);
  if (!pool.length || !name) return null;
  const p: Preset = { id: newId(), name, kind, dice: pool, modifier: clamp(Math.trunc(input.modifier) || 0, LIMITS.modifier) };
  if (input.ability && (kind === "check" || kind === "save")) p.ability = input.ability;
  return p;
}

function settingsOf(s: Session): SessionFile["settings"] {
  const out: SessionFile["settings"] = {
    view: s.view,
    kind: s.kind,
    pool: s.pool,
    modifier: s.modifier,
    mode: s.mode,
    crit: s.crit,
    effects: s.effects,
  };
  if (s.ability) out.ability = s.ability;
  if (s.activeCharacterId) out.activeCharacterId = s.activeCharacterId;
  return out;
}

export function toFile(s: Session): SessionFile {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: settingsOf(s),
    presets: s.presets,
    characters: s.characters,
    bestiary: s.bestiary,
    encounter: s.encounter,
    party: s.party,
    tracker: s.tracker,
    history: s.history,
  };
}

/** Adds a monster to the encounter, numbering duplicates ("Goblin 2"). */
export function addCombatant(s: Pick<Session, "bestiary" | "encounter">, m: Monster): Pick<Session, "bestiary" | "encounter"> {
  if (s.encounter.length >= ENCOUNTER_MAX) return s;
  const bestiary = s.bestiary.some((x) => x.index === m.index) ? s.bestiary : [...s.bestiary, m];
  const same = s.encounter.filter((c) => c.index === m.index);
  const label = same.length ? `${m.name} ${same.length + 1}` : m.name;
  const combatant: Combatant = { id: newId(), index: m.index, label, hp: m.hp, maxHp: m.hp, effects: {} };
  return { bestiary, encounter: [...s.encounter, combatant] };
}

/** Removes a combatant and forgets statblocks nobody uses any more. */
export function removeCombatant(s: Pick<Session, "bestiary" | "encounter">, id: string): Pick<Session, "bestiary" | "encounter"> {
  const encounter = s.encounter.filter((c) => c.id !== id);
  return { encounter, bestiary: s.bestiary.filter((m) => encounter.some((c) => c.index === m.index)) };
}

function parseCombatant(raw: unknown, known: Set<string>): Combatant | null {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c.index !== "string" || !known.has(c.index)) return null;
  const maxHp = intIn(c.maxHp, [1, 9999], 1);
  return {
    id: typeof c.id === "string" && c.id ? c.id.slice(0, 64) : newId(),
    index: c.index,
    label: typeof c.label === "string" && c.label.trim() ? c.label.trim().slice(0, PRESET_NAME_MAX) : c.index,
    hp: intIn(c.hp, [-9999, 9999], maxHp),
    maxHp,
    effects: parseActiveEffects(c.effects),
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
  const preset = makePreset({
    name: p.name,
    kind: isKind(p.kind) ? p.kind : "free",
    ability: isAbility(p.ability) ? p.ability : undefined,
    dice: parsePool(p.dice),
    modifier: intIn(p.modifier, LIMITS.modifier, 0),
  });
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
      groups: r.groups.map((g) => {
        const out: RollResult["groups"][number] = { die: g.die, rolls: g.rolls };
        if (g.dropped) out.dropped = g.dropped;
        if (typeof g.source === "string") out.source = g.source.slice(0, PRESET_NAME_MAX);
        if (g.sign === -1) out.sign = -1;
        return out;
      }),
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
  if (isKind(r.kind) && r.kind !== "free") result.kind = r.kind;
  if (isAbility(r.ability)) result.ability = r.ability;
  if (r.crit === true) result.crit = true;
  if (r.autoFail === true) result.autoFail = true;
  if (Array.isArray(r.flats)) {
    const flats = r.flats.filter((f) => typeof f?.source === "string" && Number.isInteger(f?.value));
    if (flats.length) result.flats = flats.map((f) => ({ source: f.source.slice(0, PRESET_NAME_MAX), value: f.value }));
  }
  if (Array.isArray(r.notes)) {
    const notes = r.notes.filter((n): n is string => typeof n === "string").map((n) => n.slice(0, 200));
    if (notes.length) result.notes = notes;
  }
  return result;
}

const parseList = <T>(raw: unknown, parse: (x: unknown) => T | null, max: number): T[] =>
  (Array.isArray(raw) ? raw : [])
    .map(parse)
    .filter((x): x is T => x !== null)
    .slice(0, max);

/** Parses an exported file (v1–v7). Throws on foreign files; silently drops malformed entries. */
export function fromFile(raw: unknown): Session {
  const data = raw as {
    format?: unknown;
    settings?: Record<string, unknown>;
    presets?: unknown;
    characters?: unknown;
    bestiary?: unknown;
    encounter?: unknown;
    party?: unknown;
    tracker?: unknown;
    history?: unknown;
  } | null;
  if (data?.format !== FORMAT) throw new Error("Keine Dicefree-Datei.");
  const st = data.settings ?? {};
  const characters = parseList(data.characters, parseCharacter, CHARACTERS_MAX);
  const bestiary = parseList(data.bestiary, parseStoredMonster, ENCOUNTER_MAX);
  const known = new Set(bestiary.map((m) => m.index));
  const encounter = parseList(data.encounter, (c) => parseCombatant(c, known), ENCOUNTER_MAX);
  const party = parseParty(data.party);
  const participants = new Set([...party.map((p) => p.id), ...encounter.map((c) => c.id)]);
  const session: Session = {
    view: st.view === "character" || st.view === "dm" ? st.view : "dice",
    characters,
    bestiary,
    encounter,
    party,
    tracker: parseTracker(data.tracker, participants),
    kind: isKind(st.kind) ? st.kind : "free",
    pool: parsePool(st.pool),
    modifier: intIn(st.modifier, LIMITS.modifier, 0),
    mode: isMode(st.mode) ? st.mode : "normal",
    crit: st.crit === true,
    effects: parseActiveEffects(st.effects),
    presets: parseList(data.presets, parsePreset, PRESETS_MAX),
    history: parseList(data.history, parseEntry, HISTORY_MAX),
  };
  if (isAbility(st.ability)) session.ability = st.ability;
  const active = characters.find((c) => c.id === st.activeCharacterId) ?? characters[0];
  if (active) session.activeCharacterId = active.id;
  return session;
}

/** What is kept on the device between visits: settings and saved rolls, not the roll history. */
export function toStored(s: Session): SessionFile {
  // Built without reading `s.history`, so reactive autosave doesn't re-run on every roll.
  return toFile({
    view: s.view,
    kind: s.kind,
    ability: s.ability,
    pool: s.pool,
    modifier: s.modifier,
    mode: s.mode,
    crit: s.crit,
    effects: s.effects,
    presets: s.presets,
    characters: s.characters,
    activeCharacterId: s.activeCharacterId,
    bestiary: s.bestiary,
    encounter: s.encounter,
    party: s.party,
    tracker: s.tracker,
    history: [],
  });
}

/** Restores the device-local state; anything unreadable falls back to an empty session. */
export function fromStored(raw: unknown): Session {
  try {
    return { ...fromFile(raw), history: [] };
  } catch {
    return emptySession();
  }
}
