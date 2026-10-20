<script lang="ts">
  import { untrack } from "svelte";
  import { ABILITIES, formatModifier, type Ability } from "../core/dice";
  import { ABILITY_LABEL } from "../core/effects";
  import {
    LEVEL_RANGE,
    SCORE_RANGE,
    SKILLS,
    abilityMod,
    formatDice,
    newAttack,
    parseCharacter,
    parseDice,
    proficiencyBonus,
    type Character,
    type Proficiency,
  } from "../core/character";

  interface Props {
    character: Character;
    onsave: (c: Character) => void;
    oncancel: () => void;
    ondelete: (id: string) => void;
  }
  let { character, onsave, oncancel, ondelete }: Props = $props();

  // Work on a copy taken once (the parent re-creates the editor per character);
  // the sheet only changes on "Speichern".
  const initial = untrack(() => structuredClone($state.snapshot(character)) as Character);
  let draft = $state<Character>(initial);
  let damageText = $state<Record<string, string>>(
    Object.fromEntries(initial.attacks.map((a) => [a.id, formatDice(a.damage)])),
  );
  let armorText = $state(initial.armorClass === undefined ? "" : String(initial.armorClass));

  const PROF_LABEL = ["–", "Geübt", "Expertise"] as const;
  const damageValid = (id: string) => parseDice(damageText[id] ?? "") !== null;
  const allValid = $derived(draft.attacks.every((a) => damageValid(a.id)) && draft.name.trim().length > 0);

  function toggleSave(a: Ability) {
    draft.saves = draft.saves.includes(a) ? draft.saves.filter((x) => x !== a) : [...draft.saves, a];
  }

  function cycleSkill(id: (typeof SKILLS)[number]["id"]) {
    const next = (((draft.skills[id] ?? 0) + 1) % 3) as Proficiency;
    if (next) draft.skills[id] = next;
    else delete draft.skills[id];
  }

  function addAttack() {
    const a = newAttack();
    draft.attacks.push(a);
    damageText[a.id] = formatDice(a.damage);
  }

  function removeAttack(id: string) {
    draft.attacks = draft.attacks.filter((a) => a.id !== id);
    delete damageText[id];
  }

  function save(ev: SubmitEvent) {
    ev.preventDefault();
    if (!allValid) return;
    const raw = $state.snapshot(draft) as Character;
    raw.attacks = raw.attacks.map((a) => ({ ...a, damage: parseDice(damageText[a.id])! }));
    const armor = Number(armorText);
    if (armorText.trim() === "" || !Number.isInteger(armor)) delete raw.armorClass;
    else raw.armorClass = armor;
    // parseCharacter doubles as sanitizer: clamps levels/scores and drops invalid values.
    const clean = parseCharacter(raw);
    if (clean) onsave(clean);
  }

  function remove() {
    if (confirm(`„${character.name}“ wirklich löschen?`)) ondelete(character.id);
  }
</script>

<form class="editor" onsubmit={save}>
  <div class="editor-row">
    <label class="field grow">
      <span>Name</span>
      <input type="text" bind:value={draft.name} maxlength="40" autocomplete="off" />
    </label>
    <label class="field narrow">
      <span>Stufe</span>
      <input type="number" inputmode="numeric" min={LEVEL_RANGE[0]} max={LEVEL_RANGE[1]} bind:value={draft.level} />
    </label>
    <label class="field narrow">
      <span>RK</span>
      <input type="text" inputmode="numeric" bind:value={armorText} placeholder="–" />
    </label>
  </div>
  <p class="hint">Übungsbonus auf Stufe {draft.level || 1}: {formatModifier(proficiencyBonus(draft.level || 1))}</p>

  <fieldset>
    <legend>Attributswerte</legend>
    <div class="score-grid">
      {#each ABILITIES as a (a)}
        <label class="score">
          <span>{ABILITY_LABEL[a]}</span>
          <input type="number" inputmode="numeric" min={SCORE_RANGE[0]} max={SCORE_RANGE[1]} bind:value={draft.scores[a]} />
          <small>{formatModifier(abilityMod(draft.scores[a] || 10))}</small>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Geübte Rettungswürfe</legend>
    <div class="toggle-row">
      {#each ABILITIES as a (a)}
        <button type="button" class="effect-chip" class:on={draft.saves.includes(a)} aria-pressed={draft.saves.includes(a)} onclick={() => toggleSave(a)}
          >{ABILITY_LABEL[a]}</button
        >
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Zauberattribut</legend>
    <div class="toggle-row">
      <button type="button" class="effect-chip" class:on={!draft.spellAbility} onclick={() => delete draft.spellAbility}>keins</button>
      {#each ["int", "wis", "cha"] as const as a (a)}
        <button type="button" class="effect-chip" class:on={draft.spellAbility === a} onclick={() => (draft.spellAbility = a)}
          >{ABILITY_LABEL[a]}</button
        >
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Fertigkeiten <small>(antippen: – → Geübt → Expertise)</small></legend>
    <div class="skill-edit-list">
      {#each SKILLS as s (s.id)}
        {@const p = draft.skills[s.id] ?? 0}
        <button type="button" class="skill-edit" class:p1={p === 1} class:p2={p === 2} onclick={() => cycleSkill(s.id)}>
          <span>{s.name} <small>{ABILITY_LABEL[s.ability]}</small></span>
          <span class="skill-edit-state">{PROF_LABEL[p]}</span>
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Angriffe</legend>
    {#each draft.attacks as a (a.id)}
      <div class="attack-edit">
        <div class="editor-row">
          <label class="field grow">
            <span>Name</span>
            <input type="text" bind:value={a.name} maxlength="40" autocomplete="off" />
          </label>
          <button type="button" class="ghost danger remove" aria-label="{a.name} entfernen" onclick={() => removeAttack(a.id)}>✕</button>
        </div>
        <div class="editor-row">
          <label class="field">
            <span>Attribut</span>
            <select bind:value={a.ability}>
              {#each ABILITIES as ab (ab)}<option value={ab}>{ABILITY_LABEL[ab]}</option>{/each}
            </select>
          </label>
          <label class="field narrow">
            <span>Magisch</span>
            <input type="number" inputmode="numeric" min="-5" max="5" bind:value={a.magic} />
          </label>
          <label class="field grow">
            <span>Schaden</span>
            <input type="text" bind:value={damageText[a.id]} class:invalid={!damageValid(a.id)} placeholder="1d8" autocomplete="off" />
          </label>
        </div>
        <div class="editor-row">
          <label class="field grow">
            <span>Schadensart</span>
            <input type="text" bind:value={a.damageType} maxlength="40" placeholder="z. B. Hieb" autocomplete="off" />
          </label>
        </div>
        <div class="checks">
          <label class="switch"><input type="checkbox" bind:checked={a.proficient} /> <span>Geübt</span></label>
          <label class="switch"><input type="checkbox" bind:checked={a.addModToDamage} /> <span>Attributsmod. auf Schaden</span></label>
        </div>
      </div>
    {/each}
    <button type="button" class="ghost" onclick={addAttack}>+ Angriff hinzufügen</button>
  </fieldset>

  <div class="dialog-actions sticky-actions">
    <button type="button" class="ghost danger" onclick={remove}>Löschen</button>
    <span class="spacer"></span>
    <button type="button" class="ghost" onclick={oncancel}>Abbrechen</button>
    <button type="submit" class="primary" disabled={!allValid}>Speichern</button>
  </div>
</form>
