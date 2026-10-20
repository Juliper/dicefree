<script lang="ts">
  import { ABILITIES, formatModifier } from "../core/dice";
  import { ABILITY_LABEL } from "../core/effects";
  import {
    SKILLS,
    abilityCheckRoll,
    attackMod,
    attackRoll,
    concentrationRoll,
    damageMod,
    damageRoll,
    deathSaveRoll,
    formatDice,
    initiativeMod,
    initiativeRoll,
    modOf,
    passivePerception,
    pbOf,
    saveMod,
    saveRoll,
    skillMod,
    skillRoll,
    spellAttackMod,
    spellSaveDC,
    SPELLS_MAX,
    type Character,
    type SheetRoll,
  } from "../core/character";
  import { levelLabel, type Spell } from "../core/spells";
  import SpellCard from "./SpellCard.svelte";
  import SpellSearch from "./SpellSearch.svelte";

  interface Props {
    character: Character;
    onroll: (r: SheetRoll) => void;
    /** Changes made directly on the sheet (adding/removing spells). */
    onupdate: (c: Character) => void;
  }
  let { character: c, onroll, onupdate }: Props = $props();
  let search: SpellSearch;

  const spellLevels = $derived([...new Set(c.spells.map((s) => s.level))].sort((a, b) => a - b));

  function addSpell(s: Spell) {
    if (c.spells.some((x) => x.index === s.index) || c.spells.length >= SPELLS_MAX) return;
    onupdate({ ...c, spells: [...c.spells, s].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)) });
  }

  function removeSpell(index: string) {
    onupdate({ ...c, spells: c.spells.filter((s) => s.index !== index) });
  }

  const ABILITY_NAME = {
    str: "Stärke",
    dex: "Geschicklichkeit",
    con: "Konstitution",
    int: "Intelligenz",
    wis: "Weisheit",
    cha: "Charisma",
  } as const;
  const PROF_MARK = ["", "●", "◆"] as const;

  const dc = $derived(spellSaveDC(c));
  const spellAtk = $derived(spellAttackMod(c));
</script>

<section class="sheet-summary" aria-label="Übersicht">
  <span><small>Stufe</small>{c.level}</span>
  <span><small>Übung</small>{formatModifier(pbOf(c))}</span>
  {#if c.armorClass !== undefined}<span><small>RK</small>{c.armorClass}</span>{/if}
  <span><small>Passive Wahrn.</small>{passivePerception(c)}</span>
  {#if dc !== null}
    <span class="highlight"><small>Zauber-SG</small>{dc}</span>
    <span><small>Zauberangriff</small>{formatModifier(spellAtk ?? 0)}</span>
  {/if}
</section>

<section class="quick-rolls" aria-label="Schnellwürfe">
  <button type="button" onclick={() => onroll(initiativeRoll(c))}>Initiative <b>{formatModifier(initiativeMod(c))}</b></button>
  <button type="button" onclick={() => onroll(concentrationRoll(c))}>Konzentration <b>{formatModifier(saveMod(c, "con"))}</b></button>
  {#if spellAtk !== null}
    <button
      type="button"
      onclick={() => onroll({ kind: "attack", dice: [{ die: 20, count: 1 }], modifier: spellAtk, label: "Zauberangriff" })}
      >Zauberangriff <b>{formatModifier(spellAtk)}</b></button
    >
  {/if}
  <button type="button" onclick={() => onroll(deathSaveRoll())}>Todesrettung</button>
</section>

<section class="abilities-grid" aria-label="Attribute">
  {#each ABILITIES as a (a)}
    {@const proficient = c.saves.includes(a)}
    <div class="ability-tile">
      <button
        type="button"
        class="ability-check"
        aria-label="{ABILITY_NAME[a]}-Wurf {formatModifier(modOf(c, a))}"
        onclick={() => onroll(abilityCheckRoll(c, a, `${ABILITY_NAME[a]}-Wurf`))}
      >
        <span class="ability-abbr">{ABILITY_LABEL[a]}</span>
        <span class="ability-mod">{formatModifier(modOf(c, a))}</span>
        <span class="ability-score">{c.scores[a]}</span>
      </button>
      <button
        type="button"
        class="ability-save"
        class:proficient
        aria-label="{ABILITY_NAME[a]}-Rettungswurf {formatModifier(saveMod(c, a))}{proficient ? ', geübt' : ''}"
        onclick={() => onroll(saveRoll(c, a, `${ABILITY_LABEL[a]}-Rettungswurf`))}
        >{proficient ? "● " : ""}Rettung {formatModifier(saveMod(c, a))}</button
      >
    </div>
  {/each}
</section>

<section class="skills" aria-label="Fertigkeiten">
  <h2>Fertigkeiten</h2>
  <div class="skill-list">
    {#each SKILLS as s (s.id)}
      {@const p = c.skills[s.id] ?? 0}
      <button type="button" class="skill" class:trained={p > 0} onclick={() => onroll(skillRoll(c, s.id))}>
        <span class="skill-mark" aria-hidden="true">{PROF_MARK[p]}</span>
        <span class="skill-name">{s.name} <small>{ABILITY_LABEL[s.ability]}</small></span>
        <span class="skill-mod">{formatModifier(skillMod(c, s.id))}</span>
      </button>
    {/each}
  </div>
  <p class="hint">● geübt · ◆ Expertise</p>
</section>

<section class="attacks" aria-label="Angriffe">
  <h2>Angriffe</h2>
  {#if c.attacks.length}
    <ul class="attack-list">
      {#each c.attacks as a (a.id)}
        {@const dmg = damageMod(c, a)}
        <li class="attack">
          <span class="attack-name">{a.name}</span>
          <div class="attack-buttons">
            <button type="button" onclick={() => onroll(attackRoll(c, a))}>Angriff <b>{formatModifier(attackMod(c, a))}</b></button>
            <button type="button" onclick={() => onroll(damageRoll(c, a))}
              >{formatDice(a.damage)}{dmg ? ` ${dmg > 0 ? "+" : "−"} ${Math.abs(dmg)}` : ""}{a.damageType
                ? ` ${a.damageType}`
                : ""}</button
            >
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">Noch keine Angriffe – über „Bearbeiten“ hinzufügen.</p>
  {/if}
</section>

<section class="spells" aria-label="Zauber">
  <div class="section-head">
    <h2>Zauber</h2>
    <button type="button" class="ghost small" onclick={() => search.open()}>+ Zauber</button>
  </div>
  {#if !c.spellAbility}
    <p class="hint">Tipp: Setze im Bogen ein Zauberattribut, dann zeigt jede Karte deinen Zauber-SG und Angriffsbonus.</p>
  {/if}
  {#if c.spells.length}
    {#each spellLevels as lvl (lvl)}
      <h3 class="spell-level">{levelLabel(lvl)}</h3>
      {#each c.spells.filter((s) => s.level === lvl) as s (s.index)}
        <SpellCard character={c} spell={s} {onroll} onremove={removeSpell} />
      {/each}
    {/each}
  {:else}
    <p class="hint">Noch keine Zauber. Über „+ Zauber“ aus dem SRD hinzufügen – sie bleiben danach auch offline verfügbar.</p>
  {/if}
</section>

<SpellSearch bind:this={search} known={c.spells.map((s) => s.index)} onadd={addSpell} />
