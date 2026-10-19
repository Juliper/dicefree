// Platform boundary for file I/O. The web implementation lives here; a native
// (Capacitor) variant can replace it later without touching core or UI.

export function saveJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readJson(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}
