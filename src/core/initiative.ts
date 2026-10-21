// Initiative tracking for the DM: players (values called out at the table) and monsters
// (rolled or typed) in one order, plus whose turn it is and the round count.

export interface PartyMember {
  id: string;
  name: string;
}

export interface Tracker {
  /** Initiative per participant id (party member or combatant). */
  values: Record<string, number>;
  /** 0 = combat not started. */
  round: number;
  turnId?: string;
}

export interface InitEntry {
  id: string;
  name: string;
  kind: "player" | "monster";
  init: number | null;
  /** Defeated monsters are skipped when advancing. */
  down: boolean;
}

export const emptyTracker = (): Tracker => ({ values: {}, round: 0 });

/**
 * Highest initiative first; ties keep the order in which participants were added
 * (2024: the DM/players decide ties – reorder by adjusting the values). Entries
 * without a value go last.
 */
export function initiativeOrder(entries: InitEntry[]): InitEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const x = a.e.init;
      const y = b.e.init;
      if (x === null && y === null) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x || a.i - b.i;
    })
    .map(({ e }) => e);
}

const canAct = (e: InitEntry) => e.init !== null && !e.down;

/** Moves to the next participant who can act; wrapping around starts a new round. */
export function nextTurn(t: Tracker, ordered: InitEntry[]): Tracker {
  const actors = ordered.filter(canAct);
  if (!actors.length) return t;
  if (!t.round || !t.turnId) return { ...t, round: 1, turnId: actors[0].id };
  const pos = ordered.findIndex((e) => e.id === t.turnId);
  // Look after the current position (the current entry may have just gone down). If it was
  // removed entirely (pos = -1), fall back to the top of the round.
  for (let i = pos + 1; i < ordered.length; i++) if (canAct(ordered[i])) return { ...t, turnId: ordered[i].id };
  return { ...t, round: t.round + 1, turnId: actors[0].id };
}

/** Steps back one participant; going before the first one returns to the previous round. */
export function previousTurn(t: Tracker, ordered: InitEntry[]): Tracker {
  const actors = ordered.filter(canAct);
  if (!actors.length || !t.round || !t.turnId) return t;
  const pos = ordered.findIndex((e) => e.id === t.turnId);
  for (let i = (pos < 0 ? ordered.length : pos) - 1; i >= 0; i--) if (canAct(ordered[i])) return { ...t, turnId: ordered[i].id };
  if (t.round <= 1) return { ...t, turnId: actors[0].id };
  return { ...t, round: t.round - 1, turnId: actors[actors.length - 1].id };
}

export function setInitiative(t: Tracker, id: string, value: number | null): Tracker {
  const { [id]: _, ...rest } = t.values;
  void _;
  return { ...t, values: value === null ? rest : { ...rest, [id]: Math.max(-20, Math.min(50, Math.trunc(value))) } };
}

/** Ends the combat: clears values, round and turn (the party stays). */
export const endCombat = (): Tracker => emptyTracker();

/** Drops values of participants that no longer exist. */
export function pruneTracker(t: Tracker, ids: Set<string>): Tracker {
  const values = Object.fromEntries(Object.entries(t.values).filter(([id]) => ids.has(id)));
  const turnId = t.turnId && ids.has(t.turnId) ? t.turnId : undefined;
  const out: Tracker = { values, round: turnId ? t.round : 0 };
  if (turnId) out.turnId = turnId;
  return out;
}

// --- Parsing ---

export function parseParty(raw: unknown): PartyMember[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => typeof p?.id === "string" && typeof p?.name === "string" && p.name.trim())
    .slice(0, 20)
    .map((p) => ({ id: p.id.slice(0, 64), name: p.name.trim().slice(0, 40) }));
}

export function parseTracker(raw: unknown, ids: Set<string>): Tracker {
  const r = raw as Record<string, any> | null;
  if (!r || typeof r !== "object") return emptyTracker();
  const values: Record<string, number> = {};
  for (const [id, v] of Object.entries(r.values ?? {})) if (ids.has(id) && Number.isInteger(v)) values[id] = v as number;
  const t: Tracker = { values, round: Number.isInteger(r.round) && r.round > 0 ? Math.min(r.round, 9999) : 0 };
  if (typeof r.turnId === "string" && ids.has(r.turnId) && t.round) t.turnId = r.turnId;
  else t.round = 0;
  return t;
}
