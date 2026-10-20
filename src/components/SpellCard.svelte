<script lang="ts">
  import { untrack } from "svelte";
  import { formatModifier } from "../core/dice";
  import { ABILITY_LABEL } from "../core/effects";
  import {
    formatDice,
    modOf,
    spellAttackMod,
    spellAttackRoll,
    spellDamageRoll,
    spellHealRoll,
    spellSaveDC,
    type Character,
    type SheetRoll,
  } from "../core/character";
  import { amountAt, damageTypeLabel, levelLabel, type Spell } from "../core/spells";

  interface Props {
    character: Character;
    spell: Spell;
    onroll: (r: SheetRoll) => void;
    onremove: (index: string) => void;
  }
  let { character: c, spell, onroll, onremove }: Props = $props();

  // Start at the spell's own level (cards are keyed by spell, so this is per spell).
  let slot = $state(untrack(() => Math.max(spell.level, 1)));

  const scalable = $derived(spell.level > 0 && !!(spell.damage?.perSlot || spell.heal?.perSlot));
  const dc = $derived(spellSaveDC(c));
  const atk = $derived(spellAttackMod(c));
  const castSlot = $derived(spell.level === 0 ? 0 : slot);
  const damageDice = $derived(spell.damage ? amountAt(spell.damage, spell.level, castSlot, c.level) : []);
  const healDice = $derived(spell.heal ? amountAt(spell.heal, spell.level, castSlot, c.level) : []);
  const healMod = $derived(spell.heal?.addMod && c.spellAbility ? modOf(c, c.spellAbility) : 0);
</script>

<article class="spell-card">
  <header>
    <h3>{spell.name}</h3>
    <span class="spell-tags">
      {#if spell.concentration}<span class="tag" title="Konzentration">K</span>{/if}
      {#if spell.ritual}<span class="tag" title="Ritual">R</span>{/if}
    </span>
  </header>
  <p class="spell-meta">
    {levelLabel(spell.level)}{spell.school ? ` · ${spell.school}` : ""}{spell.castingTime ? ` · ${spell.castingTime}` : ""}{spell.range
      ? ` · ${spell.range}`
      : ""}
  </p>

  {#if spell.save}
    <p class="spell-save">
      <b>{ABILITY_LABEL[spell.save.ability]}-Rettungswurf</b>
      {#if dc !== null}gegen <b>SG {dc}</b>{:else}<small>(Zauberattribut im Bogen setzen für den SG)</small>{/if}
      {#if spell.save.onSuccess === "half"}<span class="spell-success">· Erfolg: halber Schaden</span>{/if}
    </p>
  {/if}

  <div class="spell-actions">
    {#if spell.attack}
      <button type="button" onclick={() => onroll(spellAttackRoll(c, spell))}
        >{spell.attack === "melee" ? "Nahkampf" : "Fernkampf"}-Zauberangriff <b>{formatModifier(atk ?? 0)}</b></button
      >
    {/if}
    {#if spell.damage}
      <button type="button" onclick={() => { const r = spellDamageRoll(c, spell, castSlot); if (r) onroll(r); }}
        >Schaden <b>{formatDice(damageDice)}</b>{spell.damage.type ? ` ${damageTypeLabel(spell.damage.type)}` : ""}</button
      >
    {/if}
    {#if spell.heal}
      <button type="button" onclick={() => { const r = spellHealRoll(c, spell, castSlot); if (r) onroll(r); }}
        >Heilung <b>{formatDice(healDice)}{healMod ? ` ${healMod > 0 ? "+" : "−"} ${Math.abs(healMod)}` : ""}</b></button
      >
    {/if}
    {#if scalable}
      <label class="slot-select">
        <span>Grad</span>
        <select bind:value={slot} aria-label="Zaubergrad für {spell.name}">
          {#each Array.from({ length: 10 - spell.level }, (_, i) => spell.level + i) as l (l)}<option value={l}>{l}</option>{/each}
        </select>
      </label>
    {/if}
  </div>

  <details>
    <summary>Beschreibung</summary>
    <p class="spell-desc">{spell.description}</p>
    {#if spell.duration}<p class="hint">Dauer: {spell.duration}</p>{/if}
    <button type="button" class="ghost small danger" onclick={() => onremove(spell.index)}>Aus Zauberliste entfernen</button>
  </details>
</article>
