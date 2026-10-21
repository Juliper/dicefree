<script lang="ts">
  import { ABILITIES, formatModifier } from "../core/dice";
  import { ABILITY_LABEL, EFFECTS, effectLabel, toggleEffect, type ActiveEffects } from "../core/effects";
  import {
    SECTION_LABEL,
    crLabel,
    damageText,
    hitPointsRoll,
    monsterAttackRoll,
    monsterCheckRoll,
    monsterDamageRoll,
    monsterMod,
    monsterSave,
    monsterSaveRoll,
    monsterSkillRoll,
    rechargeRoll,
    sizeLabel,
    typeLabel,
    type ActionSection,
    type Monster,
    type MonsterRoll,
  } from "../core/monsters";
  import { damageTypeLabel } from "../core/spells";
  import type { Combatant } from "../core/session";

  interface Props {
    combatant: Combatant;
    monster: Monster;
    /** Rolls for this combatant; its own conditions apply. */
    onroll: (r: MonsterRoll, effects: ActiveEffects) => void;
    /** Rolls whose result should become this combatant's hit points. */
    onrollhp: (r: MonsterRoll) => void;
    /** Rolls initiative and enters it into the tracker. */
    onrollinit: () => void;
    onupdate: (c: Combatant) => void;
    onremove: (id: string) => void;
    /** Whose turn it is in the initiative order. */
    current?: boolean;
    initiative?: number;
  }
  let { combatant: c, monster: m, onroll, onrollhp, onrollinit, onupdate, onremove, current = false, initiative }: Props = $props();

  let amountText = $state("");
  const SECTIONS: ActionSection[] = ["action", "bonus", "reaction", "legendary", "trait"];
  const active = $derived(EFFECTS.filter((e) => c.effects[e.id]));
  const down = $derived(c.hp <= 0);
  const label = (what: string) => `${c.label}: ${what}`;
  const roll = (r: MonsterRoll | null) => r && onroll(r, c.effects);

  function changeHp(sign: 1 | -1) {
    const v = Math.abs(Math.trunc(Number(amountText)));
    if (!v) return;
    onupdate({ ...c, hp: Math.min(c.maxHp, c.hp + sign * v) });
    amountText = "";
  }
</script>

<article class="combatant" class:down class:current id="combatant-{c.id}" aria-current={current ? "true" : undefined}>
  {#if current}<p class="turn-banner">▶ Their turn</p>{/if}
  <header class="combatant-head">
    <div>
      <h3>{c.label}</h3>
      <p class="spell-meta">
        {sizeLabel(m.size)} {typeLabel(m.type)} · CR {crLabel(m.cr)} ({m.xp.toLocaleString("en-US")} XP)
      </p>
    </div>
    <button type="button" class="ghost small danger" aria-label="Remove {c.label}" onclick={() => onremove(c.id)}>✕</button>
  </header>

  <div class="combatant-stats">
    <span class="stat"><small>AC</small>{m.ac}</span>
    <span class="stat hp" class:low={c.hp <= c.maxHp / 2}><small>HP</small>{c.hp}/{c.maxHp}</span>
    <div class="hp-edit">
      <input type="text" inputmode="numeric" placeholder="Amount" aria-label="Damage or healing for {c.label}" bind:value={amountText} />
      <button type="button" onclick={() => changeHp(-1)}>Damage</button>
      <button type="button" onclick={() => changeHp(1)}>Heal</button>
    </div>
  </div>

  <div class="quick-rolls">
    <button type="button" onclick={onrollinit}
      >Initiative <b>{formatModifier(monsterMod(m, "dex"))}</b>{#if initiative !== undefined}<small>{" → "}{initiative}</small>{/if}</button
    >
    <button type="button" onclick={() => { const r = hitPointsRoll(m); if (r) onrollhp({ ...r, label: label("Hit Points") }); }}
      >Roll HP <small>({m.hitDice})</small></button
    >
  </div>

  {#if active.length}
    <p class="combatant-effects">{active.map((e) => effectLabel(e, c.effects[e.id])).join(" · ")}</p>
  {/if}

  {#each SECTIONS as sec (sec)}
    {@const list = m.actions.filter((a) => a.section === sec)}
    {#if list.length}
      <h4 class="spell-level">{SECTION_LABEL[sec]}</h4>
      {#each list as a (a.name)}
        {@const rollable = a.attackBonus !== undefined || a.damage.length || a.dc || a.recharge}
        <div class="monster-action">
          <div class="monster-action-head">
            <b>{a.name}</b>
            {#if a.recharge}<small class="tag-text">Recharge {a.recharge}{a.recharge < 6 ? "–6" : ""}</small>{/if}
            {#if a.perDay}<small class="tag-text">{a.perDay}/Day</small>{/if}
          </div>
          {#if a.dc}
            <p class="spell-save">
              <b>{ABILITY_LABEL[a.dc.ability]} saving throw DC {a.dc.value}</b>
              {#if a.dc.success === "half"}<span class="spell-success">· Success: half damage</span>{/if}
            </p>
          {/if}
          {#if rollable}
            <div class="spell-actions">
              {#if a.attackBonus !== undefined}
                <button type="button" onclick={() => roll(monsterAttackRoll(label(a.name), a))}>Attack <b>{formatModifier(a.attackBonus)}</b></button>
              {/if}
              {#if a.damage.length}
                <button type="button" onclick={() => roll(monsterDamageRoll(label(a.name), a))}>Damage <b>{damageText(a.damage)}</b></button>
              {/if}
              {#if a.recharge}
                <button type="button" onclick={() => roll(rechargeRoll(label(a.name), a))}>Recharge (d6)</button>
              {/if}
            </div>
          {/if}
          {#if rollable}
            <details>
              <summary>Text</summary>
              <p class="spell-desc">{a.desc}</p>
            </details>
          {:else}
            <p class="spell-desc action-text">{a.desc}</p>
          {/if}
        </div>
      {/each}
    {/if}
  {/each}

  {#if m.spellcasting}
    <h4 class="spell-level">Spellcasting</h4>
    <div class="monster-action">
      <p class="spell-save">
        {#if m.spellcasting.dc}<b>Spell save DC {m.spellcasting.dc}</b>{/if}
        {#if m.spellcasting.attack !== undefined}· Spell attack <b>{formatModifier(m.spellcasting.attack)}</b>{/if}
      </p>
      {#if m.spellcasting.attack !== undefined}
        <div class="spell-actions">
          <button
            type="button"
            onclick={() =>
              roll({ kind: "attack", dice: [{ die: 20, count: 1 }], modifier: m.spellcasting?.attack ?? 0, label: label("Spell Attack") })}
            >Spell Attack <b>{formatModifier(m.spellcasting.attack)}</b></button
          >
        </div>
      {/if}
      {#if m.spellcasting.spells.length}<p class="hint">{m.spellcasting.spells.join(", ")}</p>{/if}
    </div>
  {/if}

  <details class="combatant-more">
    <summary>Abilities, saves & skills</summary>
    <div class="abilities-grid">
      {#each ABILITIES as ab (ab)}
        <div class="ability-tile">
          <button type="button" class="ability-check" onclick={() => roll(monsterCheckRoll(m, label(`${ABILITY_LABEL[ab]} Check`), ab))}>
            <span class="ability-abbr">{ABILITY_LABEL[ab]}</span>
            <span class="ability-mod">{formatModifier(monsterMod(m, ab))}</span>
            <span class="ability-score">{m.scores[ab]}</span>
          </button>
          <button
            type="button"
            class="ability-save"
            class:proficient={m.saves[ab] !== undefined}
            onclick={() => roll(monsterSaveRoll(m, label(`${ABILITY_LABEL[ab]} Save`), ab))}
            >Save {formatModifier(monsterSave(m, ab))}</button
          >
        </div>
      {/each}
    </div>
    {#if m.skills.length}
      <div class="toggle-row skills-row">
        {#each m.skills as s (s.name)}
          <button type="button" class="effect-chip" onclick={() => roll(monsterSkillRoll(label(s.name), s.value))}
            >{s.name} {formatModifier(s.value)}</button
          >
        {/each}
      </div>
    {/if}
    <dl class="monster-facts">
      {#if m.speed}<dt>Speed</dt><dd>{m.speed}</dd>{/if}
      {#if m.senses}<dt>Senses</dt><dd>{m.senses}</dd>{/if}
      {#if m.languages}<dt>Languages</dt><dd>{m.languages}</dd>{/if}
      {#if m.resistances.length}<dt>Resistances</dt><dd>{m.resistances.map(damageTypeLabel).join(", ")}</dd>{/if}
      {#if m.immunities.length}<dt>Immunities</dt><dd>{m.immunities.map(damageTypeLabel).join(", ")}</dd>{/if}
      {#if m.vulnerabilities.length}<dt>Vulnerabilities</dt><dd>{m.vulnerabilities.map(damageTypeLabel).join(", ")}</dd>{/if}
      {#if m.conditionImmunities.length}<dt>Condition imm.</dt><dd>{m.conditionImmunities.join(", ")}</dd>{/if}
    </dl>
  </details>

  <details class="combatant-more">
    <summary>Conditions & effects{active.length ? ` (${active.length})` : ""}</summary>
    <div class="effect-chips">
      {#each EFFECTS as e (e.id)}
        {@const level = c.effects[e.id] ?? 0}
        <button
          type="button"
          class="effect-chip"
          class:on={level > 0}
          aria-pressed={level > 0}
          title={e.summary}
          onclick={() => onupdate({ ...c, effects: toggleEffect(c.effects, e.id) })}
          >{level ? effectLabel(e, level) : e.name}</button
        >
      {/each}
    </div>
  </details>
</article>
