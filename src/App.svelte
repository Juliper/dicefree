<script lang="ts">
  import {
    DICE,
    roll,
    natural,
    expression,
    modeApplies,
    poolSize,
    type Die,
    type RollMode,
    type RollRequest,
    type RollResult,
  } from "./core/dice";
  import {
    LIMITS,
    HISTORY_MAX,
    PRESETS_MAX,
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
  import PresetDialog from "./components/PresetDialog.svelte";

  const MODES: { value: RollMode; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "advantage", label: "Vorteil" },
    { value: "disadvantage", label: "Nachteil" },
  ];
  const MODE_LABEL = { advantage: "Vorteil", disadvantage: "Nachteil" } as const;

  const restored = fromStored(loadLocal());
  let session = $state(restored);
  let current = $state<RollResult | null>(null);
  let rollId = $state(0); // bumps on every roll to replay the pop animation
  let modText = $state(String(restored.modifier)); // raw text of the Bonus/Malus field while typing
  let presetDialog: PresetDialog;

  // Keep settings and saved rolls on this device (the roll history stays in memory only).
  $effect(() => saveLocal(toStored(session)));

  const nat = $derived(current ? natural(current) : null);
  const canRoll = $derived(poolSize(session.pool) > 0);
  const countOf = (die: Die) => session.pool.find((g) => g.die === die)?.count ?? 0;

  function show(r: RollResult | null) {
    current = r;
    rollId++;
  }

  function doRoll(req: RollRequest) {
    const r = roll({ ...req, mode: session.mode });
    session.history = [r, ...session.history].slice(0, HISTORY_MAX);
    show(r);
  }

  function rollPool() {
    if (canRoll) doRoll({ dice: session.pool, modifier: session.modifier });
  }

  /** Saved rolls bring their own bonus; the Bonus/Malus field is added on top. */
  function rollPreset(p: Preset) {
    doRoll({ dice: p.dice, modifier: clamp(p.modifier + session.modifier, LIMITS.modifier), label: p.name });
  }

  function savePreset(p: Preset) {
    session.presets = session.presets.some((x) => x.id === p.id)
      ? session.presets.map((x) => (x.id === p.id ? p : x))
      : [...session.presets, p].slice(0, PRESETS_MAX);
  }

  function deletePreset(id: string) {
    session.presets = session.presets.filter((p) => p.id !== id);
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
</script>

{#snippet rolls(r: RollResult)}
  {#each r.groups as g, i}
    {#if i}<span class="sep">·</span>{/if}
    <span class="group"
      ><span class="group-die">d{g.die}</span>
      {g.rolls.join(", ")}{#if g.dropped}{" "}<s class="dropped" title="verworfen">{g.dropped.join(", ")}</s>{/if}</span
    >
  {/each}
{/snippet}

{#snippet title(r: RollResult)}
  {#if r.label}<strong>{r.label}</strong>{" · "}{/if}{expression(r)}{#if r.mode}
    <span class="mode-tag {r.mode}">{MODE_LABEL[r.mode]}</span>{/if}
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
  <section class="result" class:crit={nat === "crit"} class:fumble={nat === "fumble"} aria-live="polite">
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
      </div>
    {/if}
  </section>

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
          onclick={() => changeDie(die, -1)}><span>−</span></button>
        <button
          type="button"
          class="half plus"
          aria-label="Einen d{die} hinzufügen ({n} im Pool)"
          onclick={() => changeDie(die, 1)}><span>+</span></button>
      </div>
    {/each}
  </section>

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
    {#if session.mode !== "normal" && canRoll && !modeApplies(session.pool)}
      <p class="hint mode-hint">{MODE_LABEL[session.mode]} wirkt nur, wenn genau ein d20 im Wurf ist.</p>
    {/if}

    <div class="roll-row">
      <button type="button" class="ghost" disabled={!canRoll} onclick={() => (session.pool = [])}>Leeren</button>
      <button type="button" class="roll" disabled={!canRoll} onclick={rollPool}>
        {canRoll ? `Würfeln: ${expression({ dice: session.pool, modifier: session.modifier })}` : "Würfel antippen"}
      </button>
    </div>
  </section>

  <section class="presets" aria-label="Gespeicherte Würfe">
    <h2>Gespeicherte Würfe</h2>
    <div class="preset-grid">
      {#each session.presets as p (p.id)}
        <div class="preset">
          <button type="button" class="preset-roll" onclick={() => rollPreset(p)}>
            <span class="preset-name">{p.name}</span>
            <span class="preset-expr">{expression(p)}</span>
          </button>
          <button type="button" class="preset-edit" aria-label="{p.name} bearbeiten" onclick={() => presetDialog.openEdit(p)}
            >⋯</button
          >
        </div>
      {/each}
      {#if session.presets.length < PRESETS_MAX}
        <button type="button" class="preset add" aria-label="Aktuelle Auswahl als Wurf speichern" onclick={() => presetDialog.openNew()}>
          <span class="plus">+</span>
          <span class="preset-expr">{canRoll ? expression({ dice: session.pool, modifier: 0 }) : "Auswahl speichern"}</span>
        </button>
      {/if}
    </div>
  </section>

  <section class="history">
    <div class="history-head">
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
            </div>
            <span class="h-total">{e.total}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="hint">Noch keine Würfe. Gespeicherte Würfe und Einstellungen bleiben auf diesem Gerät; der Verlauf nicht. Mit Export nimmst du alles auf ein anderes Gerät mit.</p>
    {/if}
  </section>
</main>

<PresetDialog bind:this={presetDialog} pool={session.pool} onsave={savePreset} ondelete={deletePreset} />
