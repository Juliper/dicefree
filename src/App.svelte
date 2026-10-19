<script lang="ts">
  import { DICE, roll, natural, expression, formatModifier, type Die, type RollResult } from "./core/dice";
  import { LIMITS, HISTORY_MAX, clamp, emptySession, toFile, fromFile } from "./core/session";
  import { saveJson, readJson } from "./platform/files";

  let session = $state(emptySession());
  let current = $state<RollResult | null>(null);
  let rollId = $state(0); // bumps on every roll to replay the pop animation

  const nat = $derived(current ? natural(current) : null);
  const detail = $derived.by(() => {
    if (!current) return "";
    const parts: string[] = [];
    if (current.rolls.length > 1 || current.modifier) {
      parts.push(`[${current.rolls.join(", ")}]`);
      if (current.modifier) parts.push(formatModifier(current.modifier));
    }
    if (nat === "crit") parts.push("Natürliche 20!");
    if (nat === "fumble") parts.push("Natürliche 1");
    return parts.join("  ");
  });

  function show(r: RollResult | null) {
    current = r;
    rollId++;
  }

  function rollDie(die: Die) {
    const r = roll({ die, count: session.count, modifier: session.modifier });
    session.history = [r, ...session.history].slice(0, HISTORY_MAX);
    show(r);
  }

  function step(key: "count" | "modifier", delta: number) {
    session[key] = clamp(session[key] + delta, LIMITS[key]);
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
      show(session.history[0] ?? null);
    } catch (err) {
      alert(`Import fehlgeschlagen: ${(err as Error).message}`);
    }
  }
</script>

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
    <div class="result-label">{current ? expression(current) : "Wähle einen Würfel"}</div>
    {#key rollId}
      <div class="result-total" class:pop={current}>{current?.total ?? "–"}</div>
    {/key}
    <div class="result-detail">{detail}</div>
  </section>

  <section class="controls">
    <div class="stepper">
      <span class="stepper-label">Anzahl</span>
      <button type="button" aria-label="Anzahl verringern" onclick={() => step("count", -1)}>−</button>
      <output>{session.count}</output>
      <button type="button" aria-label="Anzahl erhöhen" onclick={() => step("count", 1)}>+</button>
    </div>
    <div class="stepper">
      <span class="stepper-label">Modifikator</span>
      <button type="button" aria-label="Modifikator verringern" onclick={() => step("modifier", -1)}>−</button>
      <output>{formatModifier(session.modifier)}</output>
      <button type="button" aria-label="Modifikator erhöhen" onclick={() => step("modifier", 1)}>+</button>
    </div>
  </section>

  <section class="dice" aria-label="Würfel">
    {#each DICE as die (die)}
      <button type="button" class="die" onclick={() => rollDie(die)}>d{die}</button>
    {/each}
  </section>

  <section class="history">
    <div class="history-head">
      <h2>Verlauf</h2>
      <button type="button" class="ghost small" onclick={() => (session.history = [])}>Leeren</button>
    </div>
    {#if session.history.length}
      <ol>
        {#each session.history as e}
          <li>
            <span class="h-expr">{expression(e)}  [{e.rolls.join(", ")}]</span>
            <span class="h-total">{e.total}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="hint">Noch keine Würfe. Nichts wird gespeichert – nutze Export, um deine Daten mitzunehmen.</p>
    {/if}
  </section>
</main>
