// In-app replacements for window.confirm / window.alert. Native dialogs are silently
// suppressed in many embedded browsers and WebViews (they return false at once),
// so every confirmation goes through the <ConfirmHost> rendered by the app.

export interface DialogRequest {
  message: string;
  confirmLabel: string;
  cancelLabel: string | null;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export const dialogs = $state<{ current: DialogRequest | null }>({ current: null });

interface AskOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

/** Asks for confirmation; resolves to true only if the user confirms. */
export function ask(message: string, opts: AskOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    dialogs.current?.resolve(false); // a newer question replaces an unanswered one
    dialogs.current = {
      message,
      confirmLabel: opts.confirmLabel ?? "OK",
      cancelLabel: opts.cancelLabel ?? "Abbrechen",
      danger: opts.danger ?? false,
      resolve,
    };
  });
}

/** Shows a message with a single OK button. */
export async function notify(message: string): Promise<void> {
  await new Promise<boolean>((resolve) => {
    dialogs.current?.resolve(false);
    dialogs.current = { message, confirmLabel: "OK", cancelLabel: null, danger: false, resolve };
  });
}

export function answer(ok: boolean) {
  const req = dialogs.current;
  dialogs.current = null;
  req?.resolve(ok);
}
