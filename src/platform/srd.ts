// Client for the SRD 5.2 (2024) data of dnd5eapi.co.
// The spell and monster indexes are cached on the device; full entries are copied into the
// character / encounter when added, so prepared spells and monsters work offline at the table.

import { parseSpell, type Spell, type SpellIndexEntry } from "../core/spells";
import { parseMonster, type Monster, type MonsterIndexEntry } from "../core/monsters";

const BASE = "https://www.dnd5eapi.co";
const INDEX_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SRD API responded with ${res.status}`);
  return res.json();
}

function readCached<T>(key: string): { at: number; items: T[] } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    return raw && Array.isArray(raw.items) && typeof raw.at === "number" ? raw : null;
  } catch {
    return null;
  }
}

function results(raw: unknown): any[] {
  const list = (raw as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(list)) throw new Error("Unexpected response from the SRD API");
  return list;
}

/** A list endpoint with a device cache; refreshes when old and falls back to stale data offline. */
async function cachedIndex<T>(key: string, path: string, map: (r: any) => T | null): Promise<T[]> {
  const cached = readCached<T>(key);
  if (cached && Date.now() - cached.at < INDEX_MAX_AGE) return cached.items;
  try {
    const items = results(await getJson(path))
      .map(map)
      .filter((x): x is T => x !== null);
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), items }));
    } catch {
      // storage unavailable – fine, we just fetch again next time
    }
    return items;
  } catch (err) {
    if (cached) return cached.items;
    throw err;
  }
}

/** All SRD spells (index, name, level). */
export const loadSpellIndex = () =>
  cachedIndex<SpellIndexEntry>("dicefree:srd:spells", "/api/2024/spells", (r) =>
    typeof r?.index === "string" && typeof r?.name === "string" && Number.isInteger(r?.level)
      ? { index: r.index, name: r.name, level: r.level }
      : null,
  );

/** All SRD monsters (index, name). */
export const loadMonsterIndex = () =>
  cachedIndex<MonsterIndexEntry>("dicefree:srd:monsters", "/api/2024/monsters", (r) =>
    typeof r?.index === "string" && typeof r?.name === "string" ? { index: r.index, name: r.name } : null,
  );

export async function loadMonster(index: string): Promise<Monster> {
  const m = parseMonster(await getJson(`/api/2024/monsters/${encodeURIComponent(index)}`));
  if (!m) throw new Error("Could not read the monster");
  return m;
}

export async function loadSpell(index: string): Promise<Spell> {
  const spell = parseSpell(await getJson(`/api/2024/spells/${encodeURIComponent(index)}`));
  if (!spell) throw new Error("Could not read the spell");
  return spell;
}
