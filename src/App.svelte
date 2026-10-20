<script lang="ts">
  import { DICE, roll, natural, expression, poolSize, type Die, type RollResult } from "./core/dice";
  import { LIMITS, HISTORY_MAX, adjustPool, clamp, emptySession, toFile, fromFile } from "./core/session";
  import { saveJson, readJson } from "./platform/files";

  let session = $state(emptySession());
  let current = $state<RollResult | null>(null);
  let rollId = $state(0); // bumps on every roll to replay the pop animation
  let modText = $state("0"); // raw text of the Bonus/Malus field while typing

  const nat = $derived(current ? natural(current) : null);
  const canRoll = $derived(poolSize(session.pool) > 0);
  const countOf = (die: Die) => session.pool.find((g) => g.die === die)?.count ?? 0;

  function show(r: RollResult | null) {
    current = r;
    rollId++;
  }

  function rollPool() {
    if (!canRoll) return;
    const r = roll({ dice: session.pool, modifier: session.modifier });
    session.history = [r, ...session.history].slice(0, HISTORY_MAX);
    show(r);
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
    <span class="group"><span class="group-die">d{g.die}</span> {g.rolls.join(", ")}</span>
  {/each}
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
    <div class="result-label">{current ? expression(current) : "Stell dir einen Wurf zusammen"}</div>
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

    <div class="roll-row">
      <button type="button" class="ghost" disabled={!canRoll} onclick={() => (session.pool = [])}>Leeren</button>
      <button type="button" class="roll" disabled={!canRoll} onclick={rollPool}>
        {canRoll ? `Würfeln: ${expression({ dice: session.pool, modifier: session.modifier })}` : "Würfel antippen"}
      </button>
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
              <span class="h-expr">{expression(e)}</span>
              <span class="h-rolls">{@render rolls(e)}</span>
            </div>
            <span class="h-total">{e.total}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="hint">Noch keine Würfe. Nichts wird gespeichert – nutze Export, um deine Daten mitzunehmen.</p>
    {/if}
  </section>
</main>
