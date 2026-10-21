<script lang="ts">
  import { crLabel, type Monster } from "../core/monsters";
  import { ENCOUNTER_MAX, PRESET_NAME_MAX, makeSavedEncounter, type SavedEncounter } from "../core/session";
  import MonsterSearch from "./MonsterSearch.svelte";
  import { ask } from "../lib/dialogs.svelte";

  interface Props {
    /** Statblocks already on the device. */
    bestiary: Monster[];
    onsave: (saved: SavedEncounter, statblocks: Monster[]) => void;
    ondelete: (id: string) => void;
  }
  let { bestiary, onsave, ondelete }: Props = $props();

  let dialog: HTMLDialogElement;
  let search: MonsterSearch;
  let editing = $state<SavedEncounter | null>(null);
  let name = $state("");
  let rows = $state<{ index: string; count: number }[]>([]);
  /** Statblocks fetched while editing, not yet in the bestiary. */
  let fetched = $state<Monster[]>([]);

  const statblock = (index: string) => fetched.find((m) => m.index === index) ?? bestiary.find((m) => m.index === index);
  const total = $derived(rows.reduce((n, r) => n + r.count, 0));
  const xp = $derived(rows.reduce((n, r) => n + r.count * (statblock(r.index)?.xp ?? 0), 0));
  const canSave = $derived(!!name.trim() && total > 0);

  /** New fight, optionally prefilled (e.g. from the current encounter). */
  export function openNew(prefill: { index: string; count: number }[] = [], suggestedName = "") {
    editing = null;
    name = suggestedName;
    rows = prefill.map((r) => ({ ...r }));
    fetched = [];
    dialog.showModal();
  }

  export function openEdit(saved: SavedEncounter) {
    editing = saved;
    name = saved.name;
    rows = saved.monsters.map((r) => ({ ...r }));
    fetched = [];
    dialog.showModal();
  }

  function add(m: Monster) {
    if (!statblock(m.index)) fetched = [...fetched, m];
    const row = rows.find((r) => r.index === m.index);
    if (row) row.count = Math.min(ENCOUNTER_MAX, row.count + 1);
    else rows = [...rows, { index: m.index, count: 1 }];
  }

  function change(index: string, delta: number) {
    rows = rows
      .map((r) => (r.index === index ? { ...r, count: Math.min(ENCOUNTER_MAX, r.count + delta) } : r))
      .filter((r) => r.count > 0);
  }

  function save(ev: SubmitEvent) {
    ev.preventDefault();
    const saved = makeSavedEncounter(name, rows);
    if (!saved) return;
    const needed = new Set(saved.monsters.map((m) => m.index));
    onsave(editing ? { ...saved, id: editing.id } : saved, fetched.filter((m) => needed.has(m.index)));
    dialog.close();
  }

  async function remove() {
    if (editing && (await ask(`Delete encounter “${editing.name}”?`, { confirmLabel: "Delete", danger: true }))) {
      ondelete(editing.id);
      dialog.close();
    }
  }
</script>

<dialog bind:this={dialog} class="preset-dialog spell-search" aria-labelledby="encounter-editor-title">
  <form class="spell-search-body" onsubmit={save}>
    <h2 id="encounter-editor-title">{editing ? "Edit encounter" : "Prepare encounter"}</h2>

    <label class="field">
      <span>Name</span>
      <input type="text" bind:value={name} maxlength={PRESET_NAME_MAX} placeholder="e.g. Goblin Ambush" autocomplete="off" />
    </label>

    <div class="field">
      <span>Monsters{#if total} <small>· {total} total · {xp.toLocaleString("en-US")} XP</small>{/if}</span>
      {#if rows.length}
        <ul class="encounter-rows">
          {#each rows as r (r.index)}
            {@const m = statblock(r.index)}
            <li>
              <span class="encounter-row-name">{m?.name ?? r.index} <small>CR {m ? crLabel(m.cr) : "?"}</small></span>
              <span class="chip">
                <button type="button" aria-label="One {m?.name} less" onclick={() => change(r.index, -1)}>−</button>
                <span>{r.count}×</span>
                <button type="button" aria-label="One {m?.name} more" onclick={() => change(r.index, 1)}>+</button>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">No monsters yet.</p>
      {/if}
      <button type="button" class="ghost" onclick={() => search.open()}>+ Search monsters</button>
    </div>

    <div class="dialog-actions">
      {#if editing}
        <button type="button" class="ghost danger" onclick={remove}>Delete</button>
      {/if}
      <span class="spacer"></span>
      <button type="button" class="ghost" onclick={() => dialog.close()}>Cancel</button>
      <button type="submit" class="primary" disabled={!canSave}>Save</button>
    </div>
  </form>
</dialog>

<MonsterSearch bind:this={search} bestiary={[...bestiary, ...fetched]} onadd={add} />
