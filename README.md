# Dicefree

Simpler Würfel-Roller ohne Account und ohne Server. Gespeicherte Würfe und Einstellungen bleiben lokal auf dem Gerät (Browser-Speicher); der Verlauf nicht. Per JSON-Export/-Import nimmst du alles auf ein anderes Gerät mit.

Regelbasis: **D&D 2024 / SRD 5.2** (CC-BY-4.0).

## Features

- Standardwürfel: d4, d6, d8, d10, d12, d20, d100
- Würfelpool aus beliebigen Würfeln plus Bonus/Malus (z. B. `1d20 + 1d4 + 5`)
- Wurfarten: Frei, Angriff, Attributswurf, Rettungswurf (mit Attribut), Schaden (mit kritischem Treffer: alle Schadenswürfel doppelt)
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

- Zauberliste im Charakterbogen aus der SRD-5.2-API (Rettungswurf + SG direkt sichtbar, Schaden pro Grad)
- Spielleiter-Modus: Monster über die [D&D 5e SRD API](https://www.dnd5eapi.co/) durchsuchen und direkt würfeln
- Zustände/Conditions tracken und Mali automatisch anwenden
- Optional: Android-APK über Capacitor als GitHub Release
