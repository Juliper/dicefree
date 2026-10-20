<script lang="ts">
  import type { Ability, DiceGroup, RollKind } from "../core/dice";
  import { LIMITS, PRESET_NAME_MAX, clamp, makePreset, type Preset } from "../core/session";
  import { KIND_LABEL, describeRoll } from "../lib/labels";

  interface Props {
    /** The roll currently set up in the main view (used for new presets / "übernehmen"). */
    pool: DiceGroup[];
    kind: RollKind;
    ability?: Ability;
    onsave: (p: Preset) => void;
    ondelete: (id: string) => void;
  }
  let { pool, kind, ability, onsave, ondelete }: Props = $props();

  let dialog: HTMLDialogElement;
  let editing = $state<Preset | null>(null);
  let name = $state("");
  let draft = $state<{ kind: RollKind; ability?: Ability; dice: DiceGroup[] }>({ kind: "free", dice: [] });
  let bonusText = $state("0");

  const bonus = $derived.by(() => {
    const v = Number(bonusText.replace("−", "-").trim());
    return Number.isInteger(v) ? clamp(v, LIMITS.modifier) : 0;
  });
  const candidate = $derived(makePreset({ name: name || "x", ...draft, modifier: bonus }));
  const canSave = $derived(!!candidate && name.trim().length > 0);
  const describe = (d: { kind: RollKind; ability?: Ability; dice: DiceGroup[] }) =>
    describeRoll(d.kind, d.ability, d.dice, 0).replace(/ \+0$/, "");
  const currentDraft = $derived({ kind, ability, dice: pool });
  const differs = $derived(describe(currentDraft) !== describe(draft));

  export function openNew() {
    editing = null;
    draft = { ...currentDraft };
    name = "";
    bonusText = "0";
    dialog.showModal();
  }

  export function openEdit(p: Preset) {
    editing = p;
    draft = { kind: p.kind, ability: p.ability, dice: p.dice };
    name = p.name;
    bonusText = String(p.modifier);
    dialog.showModal();
  }

  function save(ev: SubmitEvent) {
    ev.preventDefault();
    const p = makePreset({ name, ...draft, modifier: bonus });
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
      <span>Wurf</span>
      {#if candidate}
        <div class="preset-dice">
          {describe(draft)}{#if draft.kind !== "free" && draft.kind !== "attack"}{" "}<small>({KIND_LABEL[draft.kind]})</small>{/if}
        </div>
      {:else}
        <p class="hint">Wähle zuerst oben die Würfel aus, dann tippe auf +.</p>
      {/if}
      {#if editing && differs && makePreset({ name: "x", ...currentDraft, modifier: 0 })}
        <button type="button" class="ghost small" onclick={() => (draft = { ...currentDraft })}>
          Aktuellen Wurf übernehmen ({describe(currentDraft)})
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
