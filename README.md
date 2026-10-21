# Dicefree

Simpler Würfel-Roller ohne Account und ohne Server. Gespeicherte Würfe und Einstellungen bleiben lokal auf dem Gerät (Browser-Speicher); der Verlauf nicht. Per JSON-Export/-Import nimmst du alles auf ein anderes Gerät mit.

Regelbasis: **D&D 2024 / SRD 5.2** (CC-BY-4.0).

## Features

- Standardwürfel: d4, d6, d8, d10, d12, d20, d100
- Würfelpool aus beliebigen Würfeln plus Bonus/Malus (z. B. `1d20 + 1d4 + 5`)
- Wurfarten im Würfel-Tab: Frei, Angriff, Schaden (mit kritischem Treffer: alle Schadenswürfel doppelt); Attributs- und Rettungswürfe laufen über den Charakterbogen
- Vorteil/Nachteil: zwei d20, der bessere bzw. schlechtere zählt; mehrere Quellen stapeln nicht, Vorteil + Nachteil heben sich auf
- Aktive Effekte zum Antippen, die automatisch in Angriffs-, Attributs- und Rettungswürfe einfließen – mit Quelle im Ergebnis:
  Segnen, Verderben (−1d4), Anleitung, Vergiftet, Verängstigt, Blind, Liegend, Festgesetzt, Gepackt, Unsichtbar,
  Gelähmt/Betäubt/Bewusstlos (STÄ-/GES-Rettung scheitert), Erschöpfung (−2 pro Stufe), Hilfe erhalten (verbraucht sich),
  halbe/Dreivierteldeckung
- Gespeicherte Würfe (z. B. „Langschwert: 1d8 + 3“) per +-Kachel; Bonus/Malus aus dem Feld wird beim Würfeln zusätzlich addiert
- Hervorhebung von natürlicher 20 / natürlicher 1 (bei Angriffen und freien Würfen)
- **Spielermodus / Charakterbogen:** Stufe, Attributswerte, geübte Rettungswürfe, 18 Fertigkeiten mit Übung/Expertise,
  Zauberattribut, RK und Angriffe. Berechnet Übungsbonus, Zauber-SG, Zauberangriff, passive Wahrnehmung.
  Ein Tipp würfelt Attributswurf, Rettungswurf, Fertigkeit, Initiative, Konzentration, Todesrettungswurf (mit Auswertung)
  sowie Angriff und Schaden je Waffe – aktive Effekte und der situative Bonus/Malus fließen automatisch ein.
  Mehrere Charaktere möglich.
- **Zauberliste** aus dem SRD 5.2 (über dnd5eapi.co): suchen, hinzufügen, und jede Karte zeigt direkt z. B.
  „GES-Rettungswurf gegen SG 15 · Erfolg: halber Schaden“. Zauberangriff, Schaden und Heilung per Tipp, inkl. Hochstufen
  und Zaubertrick-Skalierung nach Charakterstufe. Hinzugefügte Zauber liegen im Charakter und funktionieren offline.
- **Spielleiter-Modus:** Monster aus dem SRD 5.2 suchen und zu einem Kampf hinzufügen (Duplikate werden durchnummeriert,
  EP summiert). Jede Monsterkarte zeigt RK, TP (mit Schaden/Heilen und „TP würfeln“), Aktionen, Bonusaktionen,
  Reaktionen, legendäre Aktionen und Zauberwirken. Ein Tipp würfelt Angriff, Schaden (alle Schadensarten, mit Krit),
  Aufladung (mit Auswertung), Initiative, Attributs- und Rettungswürfe sowie Fertigkeiten. SG-Fähigkeiten wie Odem
  zeigen Rettungswurf, SG und „halber Schaden“. Zustände und Effekte gelten pro Monster.
- **Vorbereitete Kämpfe** (Spielleiter): Kämpfe mit Namen und Monster-Anzahl speichern – neu zusammenstellen oder den
  laufenden Kampf übernehmen. Am Tisch mit „Starten“ laden (ersetzt den Kampf) oder mit „+ Dazu“ als Verstärkung
  anhängen. Die Statblöcke bleiben auf dem Gerät, also auch offline nutzbar.
- **Initiative-Tracker** (Spielleiter): Spieler per Name anlegen (bleiben über Kämpfe hinweg), ihre angesagten Werte
  eintragen, Monster mit einem Tipp würfeln (d20 + GES, Zustände wirken mit) oder von Hand setzen. Automatisch
  sortiert; „Weiter“ zeigt, wer dran ist, zählt Runden und überspringt kampfunfähige Monster. Die aktive Monsterkarte
  wird hervorgehoben.
- Verlauf der letzten 100 Würfe (nur im Speicher), einblendbar über das Uhr-Symbol in der Ergebnis-Karte
- JSON-Import/-Export
- Fairer Zufall über `crypto.getRandomValues` mit Rejection Sampling
- Installierbar als PWA (Android & iOS „Zum Home-Bildschirm“), funktioniert offline

## Entwicklung

Vite + Svelte 5 + TypeScript.

```bash
npm install
npm run dev      # Dev-Server
npm test         # Unit-Tests (Vitest)
npm run check    # Typecheck
npm run build    # Production-Build nach dist/
```

Struktur:

- `src/core/` – Würfel-, Effekt- und Session-Logik, framework-unabhängig und getestet (`effects.ts` = Regelkatalog)
- `src/platform/` – Plattform-Grenze (Datei-Export/-Import, lokaler Speicher); hier kommt später die native Variante hin
- `src/App.svelte`, `src/components/`, `src/lib/` – Oberfläche
- `public/icon.svg` – Quelle für alle App-Icons (`npm run icons` erzeugt die PNGs neu)

## Deployment

Jeder Push auf `main` baut und veröffentlicht die Seite per GitHub Action (`.github/workflows/deploy.yml`) auf GitHub Pages. In den Repo-Einstellungen muss unter **Settings → Pages** als Quelle „GitHub Actions“ gesetzt sein.

## Installation als App

- **iOS:** Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“
- **Android:** Seite in Chrome öffnen → Menü → „App installieren“

## Roadmap

- Erweitertes Highlighting im Kampf (z. B. Reaktionen/legendäre Aktionen am Rundenende)
- Spieler-Charaktere (RK, TP) im Kampf, Treffer/Verfehlt gegen RK für den Spielleiter
- Dauer von Zuständen/Effekten in Runden, Konzentrations-Erinnerung bei Schaden
- Optional: Android-APK über Capacitor als GitHub Release

## Lizenz der Spielinhalte

Dieses Werk enthält Material aus dem System Reference Document 5.2 („SRD 5.2“) von Wizards of the Coast LLC,
verfügbar unter <https://www.dndbeyond.com/srd>. Das SRD 5.2 steht unter der Creative Commons Attribution 4.0
International License (<https://creativecommons.org/licenses/by/4.0/legalcode>). Daten über <https://www.dnd5eapi.co>.
Dicefree ist kein offizielles Produkt von Wizards of the Coast.

