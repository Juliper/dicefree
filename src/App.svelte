<script lang="ts">
  import {
    DICE,
    roll,
    natural,
    expression,
    formatModifier,
    isD20Test,
    modeApplies,
    ownGroups,
    poolSize,
    type Die,
    type RollKind,
    type RollMode,
    type RollRequest,
    type RollResult,
  } from "./core/dice";
  import { EFFECTS, applyEffects, buildRoll, effectLabel, toggleEffect, type EffectGroup } from "./core/effects";
  import {
    LIMITS,
    HISTORY_MAX,
    PRESETS_MAX,
    CHARACTERS_MAX,
    ENCOUNTER_MAX,
    addCombatant,
    clearEncounter,
    countsOf,
    deleteSavedEncounter,
    loadSavedEncounter,
    removeCombatant,
    storeSavedEncounter,
    type SavedEncounter,
    adjustPool,
    clamp,
    toFile,
    fromFile,
    fromStored,
    toStored,
    type Combatant,
    type Preset,
  } from "./core/session";
  import { saveJson, readJson } from "./platform/files";
  import { loadLocal, saveLocal } from "./platform/storage";
  import { KIND_LABEL, KIND_TAB, describeRoll, testName } from "./lib/labels";
  import PresetDialog from "./components/PresetDialog.svelte";
  import ConfirmHost from "./components/ConfirmHost.svelte";
  import { ask, notify } from "./lib/dialogs.svelte";
  import CharacterSheet from "./components/CharacterSheet.svelte";
  import CharacterEditor from "./components/CharacterEditor.svelte";
  import { deathSaveOutcome, newCharacter, type Character, type SheetRoll } from "./core/character";
  import CombatantCard from "./components/CombatantCard.svelte";
  import MonsterSearch from "./components/MonsterSearch.svelte";
  import { monsterCheckRoll, rechargeOutcome, type Monster, type MonsterRoll } from "./core/monsters";
  import InitiativeTracker from "./components/InitiativeTracker.svelte";
  import EncounterEditor from "./components/EncounterEditor.svelte";
  import {
    emptyTracker,
    initiativeOrder,
    nextTurn,
    pruneTracker,
    setInitiative,
    type InitEntry,
  } from "./core/initiative";
  import type { ActiveEffects } from "./core/effects";

  const MODES: { value: RollMode; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "advantage", label: "Advantage" },
    { value: "disadvantage", label: "Disadvantage" },
  ];
  const MODE_LABEL = { advantage: "Advantage", disadvantage: "Disadvantage" } as const;
  const EFFECT_GROUPS: { id: EffectGroup; label: string }[] = [
    { id: "spell", label: "Spells" },
    { id: "condition", label: "Conditions" },
    { id: "situation", label: "Situations" },
  ];

  // The dice tab only offers roll kinds that don't need character data; checks and saves
  // live on the character sheet (saved rolls of those kinds still work).
  const DICE_VIEW_KINDS: RollKind[] = ["free", "attack", "damage"];

  const restored = fromStored(loadLocal());
  if (!DICE_VIEW_KINDS.includes(restored.kind)) {
    restored.kind = "free";
    delete restored.ability;
  }
  let session = $state(restored);
  let current = $state<RollResult | null>(null);
  let rollId = $state(0); // bumps on every roll to replay the pop animation
  let modText = $state(String(restored.modifier)); // raw text of the modifier field while typing
  let presetDialog: PresetDialog;
  let editingCharacter = $state(false);
  let monsterSearch: MonsterSearch;
  let historyDialog: HTMLDialogElement;
  let encounterEditor: EncounterEditor;
  const statblock = (index: string) => session.bestiary.find((m) => m.index === index);
  const encounterXp = $derived(session.encounter.reduce((n, c) => n + (statblock(c.index)?.xp ?? 0), 0));
  const initEntries = $derived<InitEntry[]>([
    ...session.party.map((p) => ({ id: p.id, name: p.name, kind: "player" as const, init: session.tracker.values[p.id] ?? null, down: false })),
    ...session.encounter.map((c) => ({
      id: c.id,
      name: c.label,
      kind: "monster" as const,
      init: session.tracker.values[c.id] ?? null,
      down: c.hp <= 0,
    })),
  ]);

  const activeCharacter = $derived(
    session.characters.find((c) => c.id === session.activeCharacterId) ?? session.characters[0],
  );

  // Keep settings and saved rolls on this device (the roll history stays in memory only).
  $effect(() => saveLocal(toStored(session)));

  const d20Test = $derived(isD20Test(session.kind));
  const nat = $derived(current && (!current.kind || current.kind === "attack") ? natural(current) : null);
  const canRoll = $derived(d20Test || poolSize(session.pool) > 0);
  const showMode = $derived(d20Test || session.kind === "free");
  const preview = $derived(
    d20Test ? applyEffects({ kind: session.kind, ability: session.ability }, session.effects, session.mode) : null,
  );
  const rollLabel = $derived(
    canRoll ? describeRoll(session.kind, session.ability, session.pool, session.modifier) : "Tap a die",
  );
  const countOf = (die: Die) => session.pool.find((g) => g.die === die)?.count ?? 0;
  const effectRelevant = (id: string) =>
    d20Test && !!EFFECTS.find((e) => e.id === id)?.impact({ kind: session.kind, ability: session.ability }, 1);

  function show(r: RollResult | null) {
    current = r;
    rollId++;
  }

  /**
   * Rolls with the given active effects (default: the player's own) and the shared
   * situational settings. Returns the result and the consumable effects it used up.
   */
  function doRoll(
    base: RollRequest & { kind: RollKind; deathSave?: boolean; rechargeAt?: number },
    effects?: ActiveEffects,
  ) {
    const own = effects === undefined;
    const { deathSave, rechargeAt, ...rest } = base;
    const { consumed, ...req } = buildRoll(rest, effects ?? session.effects, session.mode);
    const r = roll(req);
    if (deathSave) {
      const kept = r.groups.find((g) => g.die === 20 && !g.source)?.rolls[0] ?? 0;
      r.notes = [...(r.notes ?? []), deathSaveOutcome(kept, r.total)];
    }
    if (rechargeAt) r.notes = [...(r.notes ?? []), rechargeOutcome(r.total, rechargeAt)];
    session.history = [r, ...session.history].slice(0, HISTORY_MAX);
    if (own && consumed.length) session.effects = withoutEffects(session.effects, consumed);
    if (base.kind === "damage") session.crit = false; // a crit is per hit
    show(r);
    return { result: r, consumed };
  }

  const withoutEffects = (e: ActiveEffects, ids: string[]) =>
    Object.fromEntries(Object.entries(e).filter(([id]) => !ids.includes(id)));

  // --- DM mode ---

  function addMonster(m: Monster) {
    Object.assign(session, addCombatant(session, m));
  }

  function updateCombatant(c: Combatant) {
    session.encounter = session.encounter.map((x) => (x.id === c.id ? c : x));
  }

  /** Removing whoever is on turn passes the turn on first, then forgets their initiative. */
  function removeParticipant(id: string) {
    if (session.tracker.turnId === id) session.tracker = nextTurn(session.tracker, initiativeOrder(initEntries));
    if (session.tracker.turnId === id) session.tracker = emptyTracker(); // nobody else left
  }

  function prune() {
    const ids = new Set([...session.party.map((p) => p.id), ...session.encounter.map((c) => c.id)]);
    session.tracker = pruneTracker(session.tracker, ids);
  }

  function removeMonster(id: string) {
    removeParticipant(id);
    Object.assign(session, removeCombatant(session, id));
    prune();
  }

  async function clearCurrentEncounter() {
    if (!(await ask("Remove all monsters from the encounter? Players stay.", { confirmLabel: "Clear", danger: true }))) return;
    Object.assign(session, clearEncounter(session), { tracker: emptyTracker() });
  }

  // --- Prepared fights ---

  function saveEncounter(saved: SavedEncounter, statblocks: Monster[]) {
    Object.assign(session, storeSavedEncounter(session, saved, statblocks));
  }

  function removeSavedEncounter(id: string) {
    Object.assign(session, deleteSavedEncounter(session, id));
  }

  /** Replaces the current fight; initiative starts over (players keep their place in the party). */
  async function startEncounter(saved: SavedEncounter) {
    if (session.encounter.length && !(await ask(`Replace the current encounter with “${saved.name}”?`, { confirmLabel: "Replace" })))
      return;
    Object.assign(session, loadSavedEncounter(session, saved, "replace"), { tracker: emptyTracker() });
  }

  /** Adds the prepared monsters to the running fight (e.g. reinforcements). */
  function appendEncounter(saved: SavedEncounter) {
    Object.assign(session, loadSavedEncounter(session, saved, "append"));
  }

  const savedSummary = (saved: SavedEncounter) =>
    saved.monsters.map((m) => `${m.count}× ${statblock(m.index)?.name ?? m.index}`).join(" · ");
  const savedXp = (saved: SavedEncounter) =>
    saved.monsters.reduce((n, m) => n + m.count * (statblock(m.index)?.xp ?? 0), 0);

  // --- Initiative ---

  function addPlayer(name: string) {
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    session.party = [...session.party, { id, name: name.slice(0, 40) }].slice(0, 20);
  }

  function removePlayer(id: string) {
    removeParticipant(id);
    session.party = session.party.filter((p) => p.id !== id);
    prune();
  }

  /** Initiative is a Dexterity check; the combatant's own conditions apply. */
  function rollInitiative(c: Combatant) {
    const m = statblock(c.index);
    if (!m) return;
    const { result } = doRoll(monsterCheckRoll(m, `${c.label}: Initiative`, "dex"), c.effects);
    session.tracker = setInitiative(session.tracker, c.id, result.total);
  }

  function rollMissingInitiative() {
    for (const c of session.encounter) if (session.tracker.values[c.id] === undefined) rollInitiative(c);
  }

  async function endCombat() {
    if (await ask("End combat? Initiative values and rounds are reset; monsters and players stay.", { confirmLabel: "End" })) {
      session.tracker = emptyTracker();
    }
  }

  function focusParticipant(id: string) {
    document.getElementById(`combatant-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function rollForCombatant(c: Combatant, r: MonsterRoll, effects: ActiveEffects) {
    const { consumed } = doRoll(
      { ...r, modifier: clamp(r.modifier + session.modifier, LIMITS.modifier), crit: r.kind === "damage" && session.crit },
      effects,
    );
    if (consumed.length) updateCombatant({ ...c, effects: withoutEffects(c.effects, consumed) });
  }

  /** Rolled hit points become the combatant's maximum and current HP. */
  function rollHitPoints(c: Combatant, r: MonsterRoll) {
    const { result } = doRoll(r, {});
    const hp = Math.max(1, result.total);
    updateCombatant({ ...c, hp, maxHp: hp });
  }

  function rollCurrent() {
    if (!canRoll) return;
    doRoll({
      kind: session.kind,
      ability: session.ability,
      dice: session.pool,
      modifier: session.modifier,
      crit: session.kind === "damage" && session.crit,
    });
  }

  /** Saved rolls bring their own bonus; the modifier field is added on top. */
  function rollPreset(p: Preset) {
    doRoll({
      kind: p.kind,
      ability: p.ability,
      dice: p.dice,
      modifier: clamp(p.modifier + session.modifier, LIMITS.modifier),
      label: p.name,
      crit: p.kind === "damage" && session.crit,
    });
  }

  /** Sheet rolls use the sheet's numbers; the modifier field still adds situational modifiers. */
  function rollFromSheet(r: SheetRoll) {
    const who = activeCharacter ? `${activeCharacter.name}: ` : "";
    doRoll({
      ...r,
      label: who + r.label,
      modifier: clamp(r.modifier + session.modifier, LIMITS.modifier),
      crit: r.kind === "damage" && session.crit,
    });
  }

  function createCharacter() {
    if (session.characters.length >= CHARACTERS_MAX) return;
    const c = newCharacter();
    session.characters = [...session.characters, c];
    session.activeCharacterId = c.id;
    editingCharacter = true;
  }

  function updateCharacter(c: Character) {
    session.characters = session.characters.map((x) => (x.id === c.id ? c : x));
  }

  function saveCharacter(c: Character) {
    updateCharacter(c);
    editingCharacter = false;
  }

  function deleteCharacter(id: string) {
    session.characters = session.characters.filter((c) => c.id !== id);
    session.activeCharacterId = session.characters[0]?.id;
    editingCharacter = false;
  }

  function savePreset(p: Preset) {
    session.presets = session.presets.some((x) => x.id === p.id)
      ? session.presets.map((x) => (x.id === p.id ? p : x))
      : [...session.presets, p].slice(0, PRESETS_MAX);
  }

  function deletePreset(id: string) {
    session.presets = session.presets.filter((p) => p.id !== id);
  }

  function setKind(kind: RollKind) {
    session.kind = kind;
    if (kind !== "check" && kind !== "save") delete session.ability;
  }

  function changeDie(die: Die, delta: number) {
    session.pool = adjustPool(session.pool, die, delta);
  }

  function setModifier(v: number) {
    session.modifier = clamp(v, LIMITS.modifier);
    modText = String(session.modifier);
  }

  function onModInput() {
    const text = modText.replace("−", "-").trim();
    if (text === "" || text === "-" || text === "+") return; // still typing
    const v = Number(text);
    if (Number.isInteger(v)) session.modifier = clamp(v, LIMITS.modifier);
  }

  function exportSession() {
    saveJson(`dicefree-${new Date().toISOString().slice(0, 10)}.json`, toFile(session));
  }

  async function importSession(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      session = fromFile(await readJson(file));
      modText = String(session.modifier);
      show(session.history[0] ?? null);
    } catch (err) {
      await notify(`Import failed: ${(err as Error).message}`);
    }
  }

  const signed = (sign: -1 | undefined) => (sign === -1 ? "−" : "+");
</script>

{#snippet rolls(r: RollResult)}
  {#each ownGroups(r) as g, i}
    {#if i}<span class="sep">·</span>{/if}
    <span class="group"
      ><span class="group-die">d{g.die}</span>
      {g.rolls.join(", ")}{#if g.dropped}{" "}<s class="dropped" title="verworfen">{g.dropped.join(", ")}</s>{/if}</span
    >
  {/each}
  {#each r.groups.filter((g) => g.source) as g}
    <span class="sep">·</span>
    <span class="group effect">{g.source} {signed(g.sign)}{g.rolls.join(", ")}</span>
  {/each}
  {#each r.flats ?? [] as f}
    <span class="sep">·</span>
    <span class="group effect">{f.source} {formatModifier(f.value)}</span>
  {/each}
{/snippet}

{#snippet title(r: RollResult)}
  {#if r.label && (r.kind === "check" || r.kind === "save")}<strong>{r.label}</strong>
    {formatModifier(r.modifier)}{:else}{#if r.label}<strong>{r.label}</strong>{" · "}{/if}{#if r.kind && r.kind !== "damage"}{testName(
        r.kind,
        r.ability,
      )} {formatModifier(r.modifier)}{:else}{expression(r)}{/if}{/if}{#if r.mode}
    <span class="mode-tag {r.mode}">{MODE_LABEL[r.mode]}</span>{/if}{#if r.crit}
    <span class="mode-tag advantage">Critical</span>{/if}
{/snippet}

{#snippet situational()}
  <section class="pool card" aria-label="Situational">
        <div class="modifier">
          <label for="sheet-modifier">Situational modifier</label>
          <div class="modifier-input">
            <button type="button" aria-label="Decrease modifier" onclick={() => setModifier(session.modifier - 1)}>−</button>
            <input
              id="sheet-modifier"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              bind:value={modText}
              oninput={onModInput}
              onblur={() => setModifier(session.modifier)}
              onfocus={(e) => e.currentTarget.select()}
            />
            <button type="button" aria-label="Increase modifier" onclick={() => setModifier(session.modifier + 1)}>+</button>
          </div>
        </div>
        <div class="mode" role="radiogroup" aria-label="Advantage or disadvantage">
          {#each MODES as m (m.value)}
            <button
              type="button"
              role="radio"
              aria-checked={session.mode === m.value}
              class:selected={session.mode === m.value}
              class={m.value}
              onclick={() => (session.mode = m.value)}>{m.label}</button
            >
          {/each}
        </div>
        <label class="switch">
          <input type="checkbox" bind:checked={session.crit} />
          <span>Next damage roll is a critical hit</span>
        </label>
      </section>
{/snippet}

<header class="topbar">
  <h1>Dicefree</h1>
  <div class="topbar-actions">
    <button type="button" class="ghost" onclick={exportSession}>Export</button>
    <label class="ghost">
      Import
      <input type="file" accept="application/json,.json" hidden onchange={importSession} />
    </label>
  </div>
</header>

<main>
  <section
    class="result"
    class:crit={nat === "crit"}
    class:fumble={nat === "fumble" || current?.autoFail}
    aria-live="polite"
  >
    <button
      type="button"
      class="history-toggle"
      aria-label="Show history{session.history.length ? ` (${session.history.length} rolls)` : ''}"
      onclick={() => historyDialog.showModal()}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 7v5l3 2" />
      </svg>
      {#if session.history.length}<span class="history-count">{session.history.length}</span>{/if}
    </button>
    <div class="result-label">
      {#if current}{@render title(current)}{:else}Build a roll{/if}
    </div>
    {#key rollId}
      <div class="result-total" class:pop={current}>{current?.total ?? "–"}</div>
    {/key}
    {#if current}
      <div class="result-detail">
        {@render rolls(current)}
        {#if nat === "crit"}<div class="nat">Natural 20!</div>{/if}
        {#if nat === "fumble"}<div class="nat">Natural 1</div>{/if}
        {#each current.notes ?? [] as n}<div class="note">{n}</div>{/each}
      </div>
    {/if}
  </section>

  <nav class="views" aria-label="View">
    <button type="button" class:selected={session.view === "dice"} aria-current={session.view === "dice"} onclick={() => (session.view = "dice")}
      >Dice</button
    >
    <button
      type="button"
      class:selected={session.view === "character"}
      aria-current={session.view === "character"}
      onclick={() => (session.view = "character")}>Character</button
    >
    <button type="button" class:selected={session.view === "dm"} aria-current={session.view === "dm"} onclick={() => (session.view = "dm")}
      >DM</button
    >
  </nav>

  {#if session.view === "character"}
    <section class="character-bar" aria-label="Choose character">
      {#if session.characters.length > 1 && !editingCharacter}
        <select
          aria-label="Active character"
          value={activeCharacter?.id}
          onchange={(e) => (session.activeCharacterId = e.currentTarget.value)}
        >
          {#each session.characters as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      {:else if activeCharacter}
        <h2 class="character-name">{activeCharacter.name}</h2>
      {/if}
      {#if !editingCharacter}
        <span class="spacer"></span>
        {#if activeCharacter}
          <button type="button" class="ghost small" onclick={() => (editingCharacter = true)}>Edit</button>
        {/if}
        {#if session.characters.length < CHARACTERS_MAX}
          <button type="button" class="ghost small" onclick={createCharacter}>+ New</button>
        {/if}
      {/if}
    </section>

    {#if !activeCharacter}
      <section class="card empty">
        <p>Enter your stats – then skills, saving throws and attacks are one tap away, and the app shows your spell save DC.</p>
        <button type="button" class="primary" onclick={createCharacter}>Create character</button>
      </section>
    {:else if editingCharacter}
      {#key activeCharacter.id}
        <CharacterEditor
          character={activeCharacter}
          onsave={saveCharacter}
          oncancel={() => (editingCharacter = false)}
          ondelete={deleteCharacter}
        />
      {/key}
    {:else}
      <CharacterSheet character={activeCharacter} onroll={rollFromSheet} onupdate={updateCharacter} />
      {@render situational()}
    {/if}
  {:else if session.view === "dm"}
    <section class="character-bar" aria-label="Encounter">
      <div class="bar-title">
        <h2 class="character-name">Encounter</h2>
        {#if session.encounter.length}
          <small>{session.encounter.length} {session.encounter.length === 1 ? "monster" : "monsters"} · {encounterXp.toLocaleString("en-US")} XP</small>
        {/if}
      </div>
      <span class="spacer"></span>
      {#if session.encounter.length}
        <button type="button" class="ghost small" onclick={clearCurrentEncounter}>Clear</button>
      {/if}
      {#if session.encounter.length < ENCOUNTER_MAX}
        <button type="button" class="ghost small" onclick={() => monsterSearch.open()}>+ Monster</button>
      {/if}
    </section>

    <section class="saved-encounters" aria-label="Prepared encounters">
      <div class="section-head">
        <h2>Prepared Encounters</h2>
        <span class="spacer"></span>
        {#if session.encounter.length}
          <button type="button" class="ghost small" onclick={() => encounterEditor.openNew(countsOf(session.encounter))}
            >Save current</button
          >
        {/if}
        <button type="button" class="ghost small" onclick={() => encounterEditor.openNew()}>+ New</button>
      </div>
      {#if session.savedEncounters.length}
        <ul class="saved-list">
          {#each session.savedEncounters as saved (saved.id)}
            <li class="saved-card">
              <div class="saved-info">
                <b>{saved.name}</b>
                <small>{savedSummary(saved)} · {savedXp(saved).toLocaleString("en-US")} XP</small>
              </div>
              <div class="saved-buttons">
                <button type="button" class="primary" onclick={() => startEncounter(saved)}>Start</button>
                <button type="button" class="ghost" onclick={() => appendEncounter(saved)} aria-label="Add {saved.name} to the running encounter"
                  >+ Add</button
                >
                <button type="button" class="ghost" aria-label="Edit {saved.name}" onclick={() => encounterEditor.openEdit(saved)}>⋯</button>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Prepare encounters at home, then start them at the table with one tap – even offline.</p>
      {/if}
    </section>

    <InitiativeTracker
      entries={initEntries}
      tracker={session.tracker}
      onchange={(t) => (session.tracker = t)}
      onaddplayer={addPlayer}
      onremoveplayer={removePlayer}
      onrollmonsters={rollMissingInitiative}
      onend={endCombat}
      onselect={focusParticipant}
    />

    {#if session.encounter.length}
      {@render situational()}
      {#each session.encounter as c (c.id)}
        {@const m = statblock(c.index)}
        {#if m}
          <CombatantCard
            combatant={c}
            monster={m}
            onroll={(r, effects) => rollForCombatant(c, r, effects)}
            onrollhp={(r) => rollHitPoints(c, r)}
            onrollinit={() => rollInitiative(c)}
            onupdate={updateCombatant}
            onremove={removeMonster}
            current={session.tracker.turnId === c.id}
            initiative={session.tracker.values[c.id]}
          />
        {/if}
      {/each}
    {:else}
      <section class="card empty">
        <p>Build an encounter: search SRD 5.2 monsters, roll attacks, damage, saves and recharges with one tap, and track HP and conditions per monster.</p>
        <button type="button" class="primary" onclick={() => monsterSearch.open()}>Add monsters</button>
      </section>
    {/if}
  {:else}
  <div class="kinds" role="tablist" aria-label="Roll type">
    {#each DICE_VIEW_KINDS as k (k)}
      <button type="button" role="tab" aria-selected={session.kind === k} class:selected={session.kind === k} onclick={() => setKind(k)}
        >{KIND_TAB[k]}</button
      >
    {/each}
  </div>

  {#if d20Test}
    <p class="hint d20-hint">{KIND_LABEL[session.kind]}: 1d20 + modifier – active effects apply.</p>
  {:else}
    <section class="dice" aria-label="Dice – tap the right half to add, the left half to remove">
      {#each DICE as die (die)}
        {@const n = countOf(die)}
        <div class="die" class:active={n > 0}>
          <span class="die-name">d{die}</span>
          <span class="die-count" aria-hidden="true">{n ? `×${n}` : ""}</span>
          <button
            type="button"
            class="half minus"
            aria-label="Remove a d{die} ({n} in the pool)"
            disabled={!n}
            onclick={() => changeDie(die, -1)}><span>−</span></button
          >
          <button
            type="button"
            class="half plus"
            aria-label="Add a d{die} ({n} in the pool)"
            onclick={() => changeDie(die, 1)}><span>+</span></button
          >
        </div>
      {/each}
    </section>
  {/if}

  <section class="pool card" aria-label="Roll">
    <div class="modifier">
      <label for="modifier-input">Modifier</label>
      <div class="modifier-input">
        <button type="button" aria-label="Decrease modifier" onclick={() => setModifier(session.modifier - 1)}>−</button>
        <input
          id="modifier-input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          bind:value={modText}
          oninput={onModInput}
          onblur={() => setModifier(session.modifier)}
          onfocus={(e) => e.currentTarget.select()}
        />
        <button type="button" aria-label="Increase modifier" onclick={() => setModifier(session.modifier + 1)}>+</button>
        <button type="button" class="sign" aria-label="Vorzeichen wechseln" onclick={() => setModifier(-session.modifier)}>±</button>
      </div>
    </div>

    {#if showMode}
      <div class="mode" role="radiogroup" aria-label="Advantage or disadvantage">
        {#each MODES as m (m.value)}
          <button
            type="button"
            role="radio"
            aria-checked={session.mode === m.value}
            class:selected={session.mode === m.value}
            class={m.value}
            onclick={() => (session.mode = m.value)}>{m.label}</button
          >
        {/each}
      </div>
      {#if session.kind === "free" && session.mode !== "normal" && canRoll && !modeApplies(session.pool)}
        <p class="hint mode-hint">{MODE_LABEL[session.mode]} only applies when the roll has exactly one d20.</p>
      {/if}
    {/if}

    {#if session.kind === "damage"}
      <label class="switch">
        <input type="checkbox" bind:checked={session.crit} />
        <span>Critical hit – roll all damage dice twice</span>
      </label>
    {/if}

    {#if preview && (preview.bonusDice.length || preview.flats.length || preview.notes.length)}
      <ul class="preview" aria-label="Applies to this roll">
        {#each preview.bonusDice as b}<li>{b.source} {b.sign === -1 ? "−" : "+"}{b.count}d{b.die}</li>{/each}
        {#each preview.flats as f}<li>{f.source} {formatModifier(f.value)}</li>{/each}
        {#each preview.notes as n}<li>{n}</li>{/each}
      </ul>
    {/if}

    <div class="roll-row">
      {#if !d20Test}
        <button type="button" class="ghost" disabled={!poolSize(session.pool)} onclick={() => (session.pool = [])}>Clear</button>
      {/if}
      <button type="button" class="roll" disabled={!canRoll} onclick={rollCurrent}>
        {canRoll ? `Roll: ${rollLabel}` : rollLabel}
      </button>
    </div>
  </section>

  {/if}

  {#if !(session.view === "character" && editingCharacter) && session.view !== "dm"}
  <section class="effects" aria-label="Active effects">
    <div class="section-head">
      <h2>Active Effects</h2>
      {#if Object.keys(session.effects).length}
        <button type="button" class="ghost small" onclick={() => (session.effects = {})}>All off</button>
      {/if}
    </div>
    {#each EFFECT_GROUPS as grp (grp.id)}
      <div class="effect-group">
        <span class="effect-group-label">{grp.label}</span>
        <div class="effect-chips">
          {#each EFFECTS.filter((e) => e.group === grp.id) as e (e.id)}
            {@const level = session.effects[e.id] ?? 0}
            <button
              type="button"
              class="effect-chip"
              class:on={level > 0}
              class:relevant={level > 0 && effectRelevant(e.id)}
              aria-pressed={level > 0}
              title={e.summary}
              onclick={() => (session.effects = toggleEffect(session.effects, e.id))}
              >{level ? effectLabel(e, level) : e.name}{#if e.maxLevel && level}<small> / {e.maxLevel}</small>{/if}</button
            >
          {/each}
        </div>
      </div>
    {/each}
    <p class="hint">Tap to toggle{#if EFFECTS.some((e) => e.maxLevel)}; Exhaustion goes up one level per tap{/if}. Effects apply to attack rolls, ability checks and saving throws.</p>
  </section>

  {/if}

  {#if session.view === "dice"}
  <section class="presets" aria-label="Saved rolls">
    <h2>Saved Rolls</h2>
    <div class="preset-grid">
      {#each session.presets as p (p.id)}
        <div class="preset">
          <button type="button" class="preset-roll" onclick={() => rollPreset(p)}>
            <span class="preset-name">{p.name}</span>
            <span class="preset-expr">{describeRoll(p.kind, p.ability, p.dice, p.modifier)}</span>
          </button>
          <button type="button" class="preset-edit" aria-label="{p.name} bearbeiten" onclick={() => presetDialog.openEdit(p)}
            >⋯</button
          >
        </div>
      {/each}
      {#if session.presets.length < PRESETS_MAX}
        <button type="button" class="preset add" aria-label="Save the current roll" onclick={() => presetDialog.openNew()}>
          <span class="plus">+</span>
          <span class="preset-expr">{canRoll ? describeRoll(session.kind, session.ability, session.pool, 0) : "Save selection"}</span>
        </button>
      {/if}
    </div>
  </section>

  {/if}

  <footer class="attribution">
    This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC,
    available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener">dndbeyond.com/srd</a>.
    The SRD 5.2 is licensed under the
    <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener">Creative Commons Attribution 4.0 International License</a>.
    Data via <a href="https://www.dnd5eapi.co" target="_blank" rel="noopener">dnd5eapi.co</a>. Not an official Wizards of the Coast product.
  </footer>
</main>

<!-- Roll history as a bottom sheet; tapping the backdrop closes it. -->
<dialog
  bind:this={historyDialog}
  class="sheet"
  aria-labelledby="history-title"
  onclick={(e) => {
    if (e.target === historyDialog) historyDialog.close();
  }}
>
  <div class="sheet-body">
    <div class="sheet-head">
      <h2 id="history-title">History</h2>
      <span class="spacer"></span>
      {#if session.history.length}
        <button type="button" class="ghost small" onclick={() => (session.history = [])}>Clear</button>
      {/if}
      <button type="button" class="ghost small" aria-label="Close history" onclick={() => historyDialog.close()}>✕</button>
    </div>
    {#if session.history.length}
      <ol class="history-list">
        {#each session.history as e}
          <li>
            <div class="h-main">
              <span class="h-expr">{@render title(e)}</span>
              <span class="h-rolls">{@render rolls(e)}</span>
              {#each e.notes ?? [] as n}<span class="h-rolls">{n}</span>{/each}
            </div>
            <span class="h-total" class:failed={e.autoFail}>{e.total}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="hint">No rolls yet. The history only lasts until you reload; saved rolls, characters and encounters stay on this device.</p>
    {/if}
  </div>
</dialog>

<ConfirmHost />
<MonsterSearch bind:this={monsterSearch} bestiary={session.bestiary} onadd={addMonster} />
<EncounterEditor bind:this={encounterEditor} bestiary={session.bestiary} onsave={saveEncounter} ondelete={removeSavedEncounter} />

<PresetDialog
  bind:this={presetDialog}
  pool={session.pool}
  kind={session.kind}
  ability={session.ability}
  onsave={savePreset}
  ondelete={deletePreset}
/>
