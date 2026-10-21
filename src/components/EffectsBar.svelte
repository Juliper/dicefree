<script lang="ts">
  import { EFFECTS, effectLabel, toggleEffect, type ActiveEffects, type EffectGroup } from "../core/effects";

  interface Props {
    effects: ActiveEffects;
    onchange: (e: ActiveEffects) => void;
    /** Label of the bar, e.g. "Effects" or "Conditions". */
    title?: string;
    /** Heading of the sheet; defaults to the title (e.g. the monster's name on monster cards). */
    sheetTitle?: string;
    /** Marks active effects that don't affect the current roll (shown dimmed). */
    relevant?: (id: string) => boolean;
    hint?: string;
  }
  let { effects, onchange, title = "Effects", sheetTitle, relevant, hint }: Props = $props();

  let sheet: HTMLDialogElement;
  const GROUPS: { id: EffectGroup; label: string }[] = [
    { id: "spell", label: "Spells" },
    { id: "condition", label: "Conditions" },
    { id: "situation", label: "Situations" },
  ];
  const active = $derived(EFFECTS.filter((e) => effects[e.id]));
</script>

<!-- One compact line: only what is active, green = helps, red = hurts. Tap to edit. -->
<button type="button" class="effects-bar" aria-haspopup="dialog" onclick={() => sheet.showModal()}>
  <span class="effects-bar-title">{title}</span>
  <span class="effects-bar-chips">
    {#each active as e (e.id)}
      <span class="effect-pill {e.tone}" class:dim={relevant && !relevant(e.id)}>{effectLabel(e, effects[e.id])}</span>
    {:else}
      <span class="effects-none">None</span>
    {/each}
  </span>
  <span class="effects-bar-edit" aria-hidden="true">Edit</span>
</button>

<dialog
  bind:this={sheet}
  class="sheet"
  aria-label={sheetTitle ?? title}
  onclick={(e) => {
    if (e.target === sheet) sheet.close();
  }}
>
  <div class="sheet-body">
    <div class="sheet-head">
      <h2>{sheetTitle ?? title}</h2>
      <span class="spacer"></span>
      {#if active.length}
        <button type="button" class="ghost small" onclick={() => onchange({})}>All off</button>
      {/if}
      <button type="button" class="ghost small" aria-label="Close" onclick={() => sheet.close()}>✕</button>
    </div>
    {#each GROUPS as g (g.id)}
      <h3 class="effect-group-label">{g.label}</h3>
      <ul class="effect-options">
        {#each EFFECTS.filter((e) => e.group === g.id) as e (e.id)}
          {@const level = effects[e.id] ?? 0}
          <li>
            <button
              type="button"
              class="effect-option {e.tone}"
              class:on={level > 0}
              aria-pressed={level > 0}
              onclick={() => onchange(toggleEffect(effects, e.id))}
            >
              <span class="effect-option-text">
                <b>{e.name}</b>
                <small>{e.summary}</small>
              </span>
              <span class="effect-option-state">
                {#if e.maxLevel}{level ? `${level}/${e.maxLevel}` : "off"}{:else}{level ? "on" : "off"}{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/each}
    {#if hint}<p class="hint">{hint}</p>{/if}
  </div>
</dialog>
