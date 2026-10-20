<script lang="ts">
  import {
    ABILITIES,
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
  import { ABILITY_LABEL, EFFECTS, applyEffects, buildRoll, effectLabel, toggleEffect, type EffectGroup } from "./core/effects";
  import {
    LIMITS,
    HISTORY_MAX,
    PRESETS_MAX,
    ROLL_KINDS,
    adjustPool,
    clamp,
    toFile,
    fromFile,
    fromStored,
    toStored,
    type Preset,
  } from "./core/session";
  import { saveJson, readJson } from "./platform/files";
  import { loadLocal, saveLocal } from "./platform/storage";
  import { KIND_LABEL, KIND_TAB, describeRoll } from "./lib/labels";
  import PresetDialog from "./components/PresetDialog.svelte";

  const MODES: { value: RollMode; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "advantage", label: "Vorteil" },
    { value: "disadvantage", label: "Nachteil" },
  ];
  const MODE_LABEL = { advantage: "Vorteil", disadvantage: "Nachteil" } as const;
  const EFFECT_GROUPS: { id: EffectGroup; label: string }[] = [
    { id: "spell", label: "Zauber" },
    { id: "condition", label: "Zustände" },
    { id: "situation", label: "Situation" },
  ];

  const restored = fromStored(loadLocal());
  let session = $state(restored);
  let current = $state<RollResult | null>(null);
  let rollId = $state(0); // bumps on every roll to replay the pop animation
  let modText = $state(String(restored.modifier)); // raw text of the Bonus/Malus field while typing
  let presetDialog: PresetDialog;

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
    canRoll ? describeRoll(session.kind, session.ability, session.pool, session.modifier) : "Würfel antippen",
  );
  const countOf = (die: Die) => session.pool.find((g) => g.die === die)?.count ?? 0;
  const effectRelevant = (id: string) =>
    d20Test && !!EFFECTS.find((e) => e.id === id)?.impact({ kind: session.kind, ability: session.ability }, 1);

  function show(r: RollResult | null) {
    current = r;
    rollId++;
  }

  function doRoll(base: RollRequest & { kind: RollKind }) {
    const { consumed, ...req } = buildRoll(base, session.effects, session.mode);
    const r = roll(req);
    session.history = [r, ...session.history].slice(0, HISTORY_MAX);
    if (consumed.length) {
      session.effects = Object.fromEntries(Object.entries(session.effects).filter(([id]) => !consumed.includes(id)));
    }
    if (base.kind === "damage") session.crit = false; // a crit is per hit
    show(r);
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

  /** Saved rolls bring their own bonus; the Bonus/Malus field is added on top. */
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
      alert(`Import fehlgeschlagen: ${(err as Error).message}`);
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
  {#if r.label}<strong>{r.label}</strong>{" · "}{/if}{#if r.kind && r.kind !== "damage"}{r.ability
      ? `${ABILITY_LABEL[r.ability]}-`
      : ""}{KIND_LABEL[r.kind]} {formatModifier(r.modifier)}{:else}{expression(r)}{/if}{#if r.mode}
    <span class="mode-tag {r.mode}">{MODE_LABEL[r.mode]}</span>{/if}{#if r.crit}
    <span class="mode-tag advantage">Kritisch</span>{/if}
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
    <div class="result-label">
      {#if current}{@render title(current)}{:else}Stell dir einen Wurf zusammen{/if}
    </div>
    {#key rollId}
      <div class="result-total" class:pop={current}>{current?.total ?? "–"}</div>
    {/key}
    {#if current}
      <div class="result-detail">
        {@render rolls(current)}
        {#if nat === "crit"}<div class="nat">Natürliche 20!</div>{/if}
        {#if nat === "fumble"}<div class="nat">Natürliche 1</div>{/if}
        {#each current.notes ?? [] as n}<div class="note">{n}</div>{/each}
      </div>
    {/if}
  </section>

  <div class="kinds" role="tablist" aria-label="Wurfart">
    {#each ROLL_KINDS as k (k)}
      <button type="button" role="tab" aria-selected={session.kind === k} class:selected={session.kind === k} onclick={() => setKind(k)}
        >{KIND_TAB[k]}</button
      >
    {/each}
  </div>

  {#if session.kind === "check" || session.kind === "save"}
    <div class="abilities" role="radiogroup" aria-label="Attribut">
      {#each ABILITIES as a (a)}
        <button
          type="button"
          role="radio"
          aria-checked={session.ability === a}
          class:selected={session.ability === a}
          onclick={() => (session.ability = session.ability === a ? undefined : a)}>{ABILITY_LABEL[a]}</button
        >
      {/each}
    </div>
  {/if}

  {#if d20Test}
    <p class="hint d20-hint">
      {KIND_LABEL[session.kind]}: 1d20 + Bonus/Malus{#if session.kind !== "attack"}{" "}– Attribut wählen, damit z. B. Deckung
        oder „Festgesetzt“ greifen{/if}.
    </p>
  {:else}
    <section class="dice" aria-label="Würfel – rechts tippen fügt hinzu, links entfernt">
      {#each DICE as die (die)}
        {@const n = countOf(die)}
        <div class="die" class:active={n > 0}>
          <span class="die-name">d{die}</span>
          <span class="die-count" aria-hidden="true">{n ? `×${n}` : ""}</span>
          <button
            type="button"
            class="half minus"
            aria-label="Einen d{die} entfernen ({n} im Pool)"
            disabled={!n}
            onclick={() => changeDie(die, -1)}><span>−</span></button
          >
          <button
            type="button"
            class="half plus"
            aria-label="Einen d{die} hinzufügen ({n} im Pool)"
            onclick={() => changeDie(die, 1)}><span>+</span></button
          >
        </div>
      {/each}
    </section>
  {/if}

  <section class="pool card" aria-label="Wurf">
    <div class="modifier">
      <label for="modifier-input">Bonus / Malus</label>
      <div class="modifier-input">
        <button type="button" aria-label="Malus erhöhen" onclick={() => setModifier(session.modifier - 1)}>−</button>
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
        <button type="button" aria-label="Bonus erhöhen" onclick={() => setModifier(session.modifier + 1)}>+</button>
        <button type="button" class="sign" aria-label="Vorzeichen wechseln" onclick={() => setModifier(-session.modifier)}>±</button>
      </div>
    </div>

    {#if showMode}
      <div class="mode" role="radiogroup" aria-label="Vorteil oder Nachteil">
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
        <p class="hint mode-hint">{MODE_LABEL[session.mode]} wirkt nur, wenn genau ein d20 im Wurf ist.</p>
      {/if}
    {/if}

    {#if session.kind === "damage"}
      <label class="switch">
        <input type="checkbox" bind:checked={session.crit} />
        <span>Kritischer Treffer – alle Schadenswürfel doppelt</span>
      </label>
    {/if}

    {#if preview && (preview.bonusDice.length || preview.flats.length || preview.notes.length)}
      <ul class="preview" aria-label="Wirkt auf diesen Wurf">
        {#each preview.bonusDice as b}<li>{b.source} {b.sign === -1 ? "−" : "+"}{b.count}d{b.die}</li>{/each}
        {#each preview.flats as f}<li>{f.source} {formatModifier(f.value)}</li>{/each}
        {#each preview.notes as n}<li>{n}</li>{/each}
      </ul>
    {/if}

    <div class="roll-row">
      {#if !d20Test}
        <button type="button" class="ghost" disabled={!poolSize(session.pool)} onclick={() => (session.pool = [])}>Leeren</button>
      {/if}
      <button type="button" class="roll" disabled={!canRoll} onclick={rollCurrent}>
        {canRoll ? `Würfeln: ${rollLabel}` : rollLabel}
      </button>
    </div>
  </section>

  <section class="effects" aria-label="Aktive Effekte">
    <div class="section-head">
      <h2>Aktive Effekte</h2>
      {#if Object.keys(session.effects).length}
        <button type="button" class="ghost small" onclick={() => (session.effects = {})}>Alle aus</button>
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
    <p class="hint">Antippen schaltet an/aus{#if EFFECTS.some((e) => e.maxLevel)}, Erschöpfung zählt pro Tipp eine Stufe hoch{/if}. Effekte wirken auf Angriffs-, Attributs- und Rettungswürfe.</p>
  </section>

  <section class="presets" aria-label="Gespeicherte Würfe">
    <h2>Gespeicherte Würfe</h2>
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
        <button type="button" class="preset add" aria-label="Aktuellen Wurf speichern" onclick={() => presetDialog.openNew()}>
          <span class="plus">+</span>
          <span class="preset-expr">{canRoll ? describeRoll(session.kind, session.ability, session.pool, 0) : "Auswahl speichern"}</span>
        </button>
      {/if}
    </div>
  </section>

  <section class="history">
    <div class="section-head">
      <h2>Verlauf</h2>
      {#if session.history.length}
        <button type="button" class="ghost small" onclick={() => (session.history = [])}>Leeren</button>
      {/if}
    </div>
    {#if session.history.length}
      <ol>
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
      <p class="hint">Noch keine Würfe. Gespeicherte Würfe, Effekte und Einstellungen bleiben auf diesem Gerät; der Verlauf nicht. Mit Export nimmst du alles auf ein anderes Gerät mit.</p>
    {/if}
  </section>
</main>

<PresetDialog
  bind:this={presetDialog}
  pool={session.pool}
  kind={session.kind}
  ability={session.ability}
  onsave={savePreset}
  ondelete={deletePreset}
/>
