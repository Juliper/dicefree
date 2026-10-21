<script lang="ts">
  import { levelLabel, type Spell, type SpellIndexEntry } from "../core/spells";
  import { loadSpell, loadSpellIndex } from "../platform/srd";

  interface Props {
    /** Indexes already on the character. */
    known: string[];
    onadd: (s: Spell) => void;
  }
  let { known, onadd }: Props = $props();

  let dialog: HTMLDialogElement;
  let index = $state<SpellIndexEntry[] | null>(null);
  let error = $state("");
  let query = $state("");
  let level = $state<number | null>(null);
  let adding = $state<string | null>(null);

  const results = $derived.by(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    return index
      .filter((s) => (level === null || s.level === level) && (!q || s.name.toLowerCase().includes(q)))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .slice(0, 80);
  });

  export async function open() {
    error = "";
    dialog.showModal();
    if (index) return;
    try {
      index = await loadSpellIndex();
    } catch (err) {
      error = `Could not load the spell list (${(err as Error).message}). Are you online?`;
    }
  }

  async function add(entry: SpellIndexEntry) {
    adding = entry.index;
    error = "";
    try {
      onadd(await loadSpell(entry.index));
    } catch (err) {
      error = `Could not load “${entry.name}” (${(err as Error).message}).`;
    } finally {
      adding = null;
    }
  }
</script>

<dialog bind:this={dialog} class="preset-dialog spell-search" aria-labelledby="spell-search-title">
  <div class="spell-search-body">
    <div class="section-head">
      <h2 id="spell-search-title">Add spells</h2>
      <button type="button" class="ghost small" onclick={() => dialog.close()}>Done</button>
    </div>
    <input
      class="search-input"
      type="search"
      placeholder="Search, e.g. Fireball"
      bind:value={query}
      autocomplete="off"
      enterkeyhint="search"
    />
    <div class="level-filter" role="radiogroup" aria-label="Spell level">
      <button type="button" role="radio" aria-checked={level === null} class:selected={level === null} onclick={() => (level = null)}>All</button>
      {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as l (l)}
        <button type="button" role="radio" aria-checked={level === l} class:selected={level === l} onclick={() => (level = l)}
          >{l === 0 ? "C" : l}</button
        >
      {/each}
    </div>

    {#if error}<p class="error">{error}</p>{/if}
    {#if !index && !error}<p class="hint">Loading spells …</p>{/if}

    <ul class="spell-results">
      {#each results as s (s.index)}
        {@const has = known.includes(s.index)}
        <li>
          <button type="button" disabled={has || adding !== null} onclick={() => add(s)}>
            <span>{s.name}</span>
            <small>{adding === s.index ? "loading …" : has ? "✓ added" : levelLabel(s.level)}</small>
          </button>
        </li>
      {/each}
    </ul>
    {#if index && !results.length}<p class="hint">Nothing found.</p>{/if}
    <p class="hint attribution">Spells from the SRD 5.2, CC-BY-4.0.</p>
  </div>
</dialog>
