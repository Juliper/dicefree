<script lang="ts">
  import { answer, dialogs } from "../lib/dialogs.svelte";

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (dialogs.current && !dialog.open) dialog.showModal();
    if (!dialogs.current && dialog.open) dialog.close();
  });
</script>

<!-- Esc / backdrop "cancel" counts as declining. -->
<dialog
  bind:this={dialog}
  class="preset-dialog confirm-dialog"
  aria-describedby="confirm-message"
  oncancel={(e) => {
    e.preventDefault();
    answer(false);
  }}
>
  {#if dialogs.current}
    <p id="confirm-message">{dialogs.current.message}</p>
    <div class="dialog-actions">
      <span class="spacer"></span>
      {#if dialogs.current.cancelLabel}
        <button type="button" class="ghost" onclick={() => answer(false)}>{dialogs.current.cancelLabel}</button>
      {/if}
      <button type="button" class="primary" class:danger-fill={dialogs.current.danger} onclick={() => answer(true)}
        >{dialogs.current.confirmLabel}</button
      >
    </div>
  {/if}
</dialog>
