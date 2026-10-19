# Dicefree

Simpler Würfel-Roller ohne Account und ohne Server. Es wird nichts dauerhaft gespeichert – Einstellungen und Verlauf lassen sich als JSON exportieren und wieder importieren.

## Features (MVP)

- Standardwürfel: d4, d6, d8, d10, d12, d20, d100
- Anzahl und Modifikator (z. B. `2d6+2`)
- Hervorhebung von natürlicher 20 / natürlicher 1 beim einzelnen d20
- Verlauf der letzten 100 Würfe (nur im Speicher)
- JSON-Import/-Export
- Fairer Zufall über `crypto.getRandomValues` mit Rejection Sampling

## Lokal starten

Reines HTML/CSS/JS, kein Build-Schritt:

```bash
python3 -m http.server 8420
```

Dann <http://localhost:8420> öffnen.

## Deployment (GitHub Pages)

Repository pushen, dann unter **Settings → Pages** als Quelle „Deploy from a branch“, Branch `main`, Ordner `/ (root)` wählen.

## Roadmap

- D&D-Modus: Charakterwerte eintragen, Angriffs-, Rettungs- und Konzentrationswürfe per Knopfdruck mit Erfolg/Misserfolg
- Spielleiter-Modus: Monster über die [D&D 5e SRD API](https://www.dnd5eapi.co/) durchsuchen und direkt würfeln
- Zustände/Conditions tracken und Mali automatisch anwenden
- iOS- und Android-App
