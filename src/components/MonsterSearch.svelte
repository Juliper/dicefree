<script lang="ts">
  import type { Monster, MonsterIndexEntry } from "../core/monsters";
  import { loadMonster, loadMonsterIndex } from "../platform/srd";

  interface Props {
    /** Statblocks already loaded (adding them again needs no network). */
    bestiary: Monster[];
    onadd: (m: Monster) => void;
  }
  let { bestiary, onadd }: Props = $props();

  let dialog: HTMLDialogElement;
  let index = $state<MonsterIndexEntry[] | null>(null);
  let error = $state("");
  let query = $state("");
  let adding = $state<string | null>(null);
  let added = $state<Record<string, number>>({});

  const results = $derived.by(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    return index
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 80);
  });

  export async function open() {
    error = "";
    added = {};
    dialog.showModal();
    if (index) return;
    try {
      index = await loadMonsterIndex();
    } catch (err) {
      error = `Could not load the monster list (${(err as Error).message}). Are you online?`;
    }
  }

  async function add(entry: MonsterIndexEntry) {
    adding = entry.index;
    error = "";
    try {
      onadd(bestiary.find((m) => m.index === entry.index) ?? (await loadMonster(entry.index)));
      added[entry.index] = (added[entry.index] ?? 0) + 1;
    } catch (err) {
      error = `Could not load “${entry.name}” (${(err as Error).message}).`;
    } finally {
      adding = null;
    }
  }
</script>

<dialog bind:this={dialog} class="preset-dialog spell-search" aria-labelledby="monster-search-title">
  <div class="spell-search-body">
    <div class="section-head">
      <h2 id="monster-search-title">Add monsters</h2>
      <button type="button" class="ghost small" onclick={() => dialog.close()}>Done</button>
    </div>
    <input
      class="search-input"
      type="search"
      placeholder="Search, e.g. Goblin"
      bind:value={query}
      autocomplete="off"
      enterkeyhint="search"
    />
    {#if error}<p class="error">{error}</p>{/if}
    {#if !index && !error}<p class="hint">Loading monsters …</p>{/if}
    <ul class="spell-results">
      {#each results as m (m.index)}
        <li>
          <button type="button" disabled={adding !== null} onclick={() => add(m)}>
            <span>{m.name}</span>
            <small>{adding === m.index ? "loading …" : added[m.index] ? `+${added[m.index]} added` : "add"}</small>
          </button>
        </li>
      {/each}
    </ul>
    {#if index && !results.length}<p class="hint">Nothing found.</p>{/if}
    <p class="hint attribution">Monsters from the SRD 5.2, CC-BY-4.0. Tap several times to add several.</p>
  </div>
</dialog>
