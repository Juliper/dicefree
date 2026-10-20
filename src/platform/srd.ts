// Client for the SRD 5.2 (2024) data of dnd5eapi.co.
// The spell index is cached on the device; full spells are copied into the character
// when added, so a prepared spell list works offline at the table.

import { parseSpell, type Spell, type SpellIndexEntry } from "../core/spells";

const BASE = "https://www.dnd5eapi.co";
const INDEX_KEY = "dicefree:srd:spell-index";
const INDEX_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SRD-API antwortet mit ${res.status}`);
  return res.json();
}

function readCachedIndex(): { at: number; spells: SpellIndexEntry[] } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null");
    return raw && Array.isArray(raw.spells) && typeof raw.at === "number" ? raw : null;
  } catch {
    return null;
  }
}

function parseIndex(raw: unknown): SpellIndexEntry[] {
  const results = (raw as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) throw new Error("Unerwartete Antwort der SRD-API");
  return results
    .filter((r: any) => typeof r?.index === "string" && typeof r?.name === "string" && Number.isInteger(r?.level))
    .map((r: any) => ({ index: r.index, name: r.name, level: r.level }));
}

/** All SRD spells (index, name, level). Uses the device cache, refreshes it when old; falls back to stale data offline. */
export async function loadSpellIndex(): Promise<SpellIndexEntry[]> {
  const cached = readCachedIndex();
  if (cached && Date.now() - cached.at < INDEX_MAX_AGE) return cached.spells;
  try {
    const spells = parseIndex(await getJson("/api/2024/spells"));
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify({ at: Date.now(), spells }));
    } catch {
      // storage unavailable – fine, we just fetch again next time
    }
    return spells;
  } catch (err) {
    if (cached) return cached.spells;
    throw err;
  }
}

export async function loadSpell(index: string): Promise<Spell> {
  const spell = parseSpell(await getJson(`/api/2024/spells/${encodeURIComponent(index)}`));
  if (!spell) throw new Error("Zauber konnte nicht gelesen werden");
  return spell;
}
