<script lang="ts">
  import { expression, type DiceGroup } from "../core/dice";
  import { LIMITS, PRESET_NAME_MAX, clamp, makePreset, type Preset } from "../core/session";

  interface Props {
    /** Dice currently selected in the main pool (used for new presets / "übernehmen"). */
    pool: DiceGroup[];
    onsave: (p: Preset) => void;
    ondelete: (id: string) => void;
  }
  let { pool, onsave, ondelete }: Props = $props();

  let dialog: HTMLDialogElement;
  let editing = $state<Preset | null>(null);
  let name = $state("");
  let dice = $state<DiceGroup[]>([]);
  let bonusText = $state("0");

  const bonus = $derived.by(() => {
    const v = Number(bonusText.replace("−", "-").trim());
    return Number.isInteger(v) ? clamp(v, LIMITS.modifier) : 0;
  });
  const canSave = $derived(dice.length > 0 && name.trim().length > 0);

  export function openNew() {
    editing = null;
    dice = pool;
    name = "";
    bonusText = "0";
    dialog.showModal();
  }

  export function openEdit(p: Preset) {
    editing = p;
    dice = p.dice;
    name = p.name;
    bonusText = String(p.modifier);
    dialog.showModal();
  }

  function save(ev: SubmitEvent) {
    ev.preventDefault();
    const p = makePreset(name, dice, bonus);
    if (!p) return;
    onsave(editing ? { ...p, id: editing.id } : p);
    dialog.close();
  }

  function remove() {
    if (editing) ondelete(editing.id);
    dialog.close();
  }
</script>

<dialog bind:this={dialog} class="preset-dialog" aria-labelledby="preset-title">
  <form onsubmit={save}>
    <h2 id="preset-title">{editing ? "Wurf bearbeiten" : "Wurf speichern"}</h2>

    <label class="field">
      <span>Name</span>
      <input
        type="text"
        bind:value={name}
        maxlength={PRESET_NAME_MAX}
        placeholder="z. B. Langschwert"
        autocomplete="off"
        enterkeyhint="done"
      />
    </label>

    <div class="field">
      <span>Würfel</span>
      {#if dice.length}
        <div class="preset-dice">{expression({ dice, modifier: 0 })}</div>
      {:else}
        <p class="hint">Wähle zuerst oben die Würfel aus, dann tippe auf +.</p>
      {/if}
      {#if editing && pool.length && expression({ dice: pool, modifier: 0 }) !== expression({ dice, modifier: 0 })}
        <button type="button" class="ghost small" onclick={() => (dice = pool)}>
          Aktuelle Auswahl übernehmen ({expression({ dice: pool, modifier: 0 })})
        </button>
      {/if}
    </div>

    <label class="field">
      <span>Fester Bonus <small>(Bonus/Malus aus dem Feld wird beim Würfeln zusätzlich addiert)</small></span>
      <span class="bonus-row">
        <input type="text" inputmode="numeric" autocomplete="off" bind:value={bonusText} onfocus={(e) => e.currentTarget.select()} />
        <button type="button" class="ghost" aria-label="Vorzeichen wechseln" onclick={() => (bonusText = String(-bonus))}>±</button>
      </span>
    </label>

    <div class="dialog-actions">
      {#if editing}
        <button type="button" class="ghost danger" onclick={remove}>Löschen</button>
      {/if}
      <span class="spacer"></span>
      <button type="button" class="ghost" onclick={() => dialog.close()}>Abbrechen</button>
      <button type="submit" class="primary" disabled={!canSave}>Speichern</button>
    </div>
  </form>
</dialog>
