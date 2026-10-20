# Dicefree

Simpler Würfel-Roller ohne Account und ohne Server. Es wird nichts dauerhaft gespeichert – Einstellungen und Verlauf lassen sich als JSON exportieren und wieder importieren.

## Features (MVP)

- Standardwürfel: d4, d6, d8, d10, d12, d20, d100
- Würfelpool aus beliebigen Würfeln plus Bonus/Malus (z. B. `1d20 + 1d4 + 5`)
- Hervorhebung von natürlicher 20 / natürlicher 1, sobald genau ein d20 im Pool ist
- Verlauf der letzten 100 Würfe (nur im Speicher)
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

- `src/core/` – Würfel- und Session-Logik, framework-unabhängig und getestet
- `src/platform/` – Plattform-Grenze (Datei-Export/-Import); hier kommt später die native Variante hin
- `src/App.svelte` – Oberfläche
- `public/icon.svg` – Quelle für alle App-Icons (`npm run icons` erzeugt die PNGs neu)

## Deployment

Jeder Push auf `main` baut und veröffentlicht die Seite per GitHub Action (`.github/workflows/deploy.yml`) auf GitHub Pages. In den Repo-Einstellungen muss unter **Settings → Pages** als Quelle „GitHub Actions“ gesetzt sein.

## Installation als App

- **iOS:** Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“
- **Android:** Seite in Chrome öffnen → Menü → „App installieren“

## Roadmap

- D&D-Modus: Charakterwerte eintragen, Angriffs-, Rettungs- und Konzentrationswürfe per Knopfdruck mit Erfolg/Misserfolg
- Spielleiter-Modus: Monster über die [D&D 5e SRD API](https://www.dnd5eapi.co/) durchsuchen und direkt würfeln
- Zustände/Conditions tracken und Mali automatisch anwenden
- Optional: Android-APK über Capacitor als GitHub Release
