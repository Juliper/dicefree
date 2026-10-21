<script lang="ts">
  import { initiativeOrder, nextTurn, previousTurn, setInitiative, type InitEntry, type Tracker } from "../core/initiative";

  interface Props {
    entries: InitEntry[];
    tracker: Tracker;
    onchange: (t: Tracker) => void;
    onaddplayer: (name: string) => void;
    onremoveplayer: (id: string) => void;
    /** Rolls initiative for all monsters that don't have a value yet. */
    onrollmonsters: () => void;
    onend: () => void;
    /** Jump to a participant (e.g. scroll to its monster card). */
    onselect: (id: string) => void;
  }
  let { entries, tracker, onchange, onaddplayer, onremoveplayer, onrollmonsters, onend, onselect }: Props = $props();

  let playerName = $state("");
  const ordered = $derived(initiativeOrder(entries));
  const missing = $derived(entries.filter((e) => e.init === null));
  const monstersMissing = $derived(missing.some((e) => e.kind === "monster"));
  const started = $derived(tracker.round > 0);
  const canStart = $derived(entries.some((e) => e.init !== null && !e.down));

  function setValue(id: string, text: string) {
    const t = text.trim().replace("−", "-");
    if (t === "") return onchange(setInitiative(tracker, id, null));
    const v = Number(t);
    if (Number.isFinite(v)) onchange(setInitiative(tracker, id, v));
  }

  function addPlayer(ev: SubmitEvent) {
    ev.preventDefault();
    const name = playerName.trim();
    if (!name) return;
    onaddplayer(name);
    playerName = "";
  }
</script>

<section class="initiative card" aria-label="Initiative">
  <div class="section-head">
    <h2>Initiative{#if started}<span class="round">{" · "}Round {tracker.round}</span>{/if}</h2>
    {#if started}
      <button type="button" class="ghost small" onclick={onend}>End</button>
    {/if}
  </div>

  {#if ordered.length}
    <ol class="init-list">
      {#each ordered as e (e.id)}
        {@const current = tracker.turnId === e.id}
        <li class="init-row" class:current class:down={e.down} class:player={e.kind === "player"}>
          <span class="init-marker" aria-hidden="true">{current ? "▶" : ""}</span>
          <button type="button" class="init-name" onclick={() => onselect(e.id)} aria-current={current ? "true" : undefined}>
            <span class="init-name-text">{e.name}</span>
            <small>{e.kind === "player" ? "Player" : e.down ? "down" : "Monster"}</small>
          </button>
          <input
            type="text"
            inputmode="numeric"
            class="init-value"
            aria-label="Initiative of {e.name}"
            placeholder="–"
            value={e.init ?? ""}
            onchange={(ev) => setValue(e.id, ev.currentTarget.value)}
            onfocus={(ev) => ev.currentTarget.select()}
          />
          {#if e.kind === "player"}
            <button type="button" class="init-remove" aria-label="Remove {e.name}" onclick={() => onremoveplayer(e.id)}>✕</button>
          {:else}
            <span class="init-remove" aria-hidden="true"></span>
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="hint">Add players and monsters, then enter initiative.</p>
  {/if}

  <form class="add-player" onsubmit={addPlayer}>
    <input type="text" bind:value={playerName} placeholder="Add a player, e.g. Aria" maxlength="40" autocomplete="off" enterkeyhint="done" />
    <button type="submit" class="ghost" disabled={!playerName.trim()}>+ Player</button>
  </form>

  <div class="init-actions">
    {#if monstersMissing}
      <button type="button" class="ghost" onclick={onrollmonsters}>Roll monsters</button>
    {/if}
    {#if started}
      <button type="button" class="ghost" onclick={() => onchange(previousTurn(tracker, ordered))} aria-label="Previous turn">◀</button>
    {/if}
    <button type="button" class="primary next" disabled={!canStart} onclick={() => onchange(nextTurn(tracker, ordered))}>
      {started ? "Next ▶" : "Start combat"}
    </button>
  </div>
  {#if missing.length && started}
    <p class="hint">No value yet (not in the order): {missing.map((e) => e.name).join(", ")}</p>
  {/if}
</section>
