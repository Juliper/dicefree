# Dicefree

A simple D&D dice roller without accounts or servers. Saved rolls, characters, encounters and settings stay on your device (browser storage); the roll history does not. Use JSON export/import to take everything to another device.

Rules: **D&D 2024 / SRD 5.2** (CC-BY-4.0).

## Features

- Standard dice: d4, d6, d8, d10, d12, d20, d100
- Mixed dice pool plus a modifier (e.g. `1d20 + 1d4 + 5`)
- Roll types in the dice tab: Free, Attack, Damage (critical hit: all damage dice rolled twice); ability checks and saving throws run through the character sheet
- Advantage/Disadvantage: two d20s, the higher or lower counts; several sources don't stack, Advantage + Disadvantage cancel out
- Active effects shown as one compact line (green = helps, red = hurts); tap it to open a sheet with all effects and their rules. They are applied to attack rolls, ability checks and saving throws automatically – with their source in the result:
  Bless, Bane (−1d4), Guidance, Poisoned, Frightened, Blinded, Prone, Restrained, Grappled, Invisible,
  Paralyzed/Stunned/Unconscious (Strength/Dexterity saves fail), Exhaustion (−2 per level), Helped (used up),
  Half Cover / Three-Quarters Cover
- Saved rolls (e.g. "Longsword: 1d8 + 3") via a "+" tile; the modifier field is added on top when rolling
- Natural 20 / natural 1 highlighting (attacks and free rolls)
- **Player mode / character sheet:** level, ability scores, saving throw proficiencies, 18 skills with proficiency/expertise,
  spellcasting ability, AC and attacks. Computes proficiency bonus, spell save DC, spell attack and passive Perception.
  One tap rolls ability checks, saving throws, skills, initiative, concentration, death saves (with outcome)
  and attack/damage per weapon – active effects and the situational modifier apply automatically.
  Multiple characters.
- **Spell list** from the SRD 5.2 (via dnd5eapi.co): search, add, and every card shows e.g.
  "DEX saving throw vs. DC 15 · Success: half damage". Spell attack, damage and healing in one tap, including upcasting
  and cantrip scaling by character level. Added spells are stored in the character and work offline.
- **DM mode:** search SRD 5.2 monsters and add them to an encounter (duplicates are numbered, XP is summed).
  Every monster card shows AC, HP (damage/heal and "Roll HP"), actions, bonus actions, reactions, legendary actions
  and spellcasting. One tap rolls attacks, damage (all damage types, with crits), recharge (with outcome), initiative,
  ability checks, saving throws and skills. DC abilities like breath weapons show the save, DC and "half damage".
  Conditions and effects are tracked per monster.
- **Prepared encounters** (DM): save encounters with a name and monster counts – build them from scratch or take over the
  running encounter. At the table, "Start" loads one (replacing the current encounter) and "+ Add" appends it as
  reinforcements. Statblocks stay on the device, so this works offline.
- **Initiative tracker** (DM): add players by name (kept across encounters), enter the initiative they call out, roll for
  monsters in one tap (d20 + DEX, their conditions apply) or set values by hand. Sorted automatically; "Next" shows whose
  turn it is, counts rounds and skips defeated monsters. The active monster card is highlighted.
- History of the last 100 rolls (in memory only), shown via the clock icon in the result card
- JSON import/export
- Fair randomness via `crypto.getRandomValues` with rejection sampling
- Installable as a PWA (Android & iOS "Add to Home Screen"), works offline

## Development

Vite + Svelte 5 + TypeScript.

```bash
npm install
npm run dev      # dev server
npm test         # unit tests (Vitest)
npm run check    # type check
npm run build    # production build into dist/
```

Structure:

- `src/core/` – dice, effects, character, monster and session logic; framework-free and tested (`effects.ts` = rules catalog)
- `src/platform/` – platform boundary (file export/import, local storage, SRD API); a native variant can replace it later
- `src/App.svelte`, `src/components/`, `src/lib/` – UI
- `public/icon.svg` – source for all app icons (`npm run icons` regenerates the PNGs)

## Deployment

Every push to `main` builds and publishes the site to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). In the repository settings, **Settings → Pages** must use "GitHub Actions" as the source.

## Install as an app

- **iOS:** open the site in Safari → Share → "Add to Home Screen"
- **Android:** open the site in Chrome → menu → "Install app"

## Roadmap

- Share characters with the DM (export a single character, import it into the DM's party: AC, passive Perception, saves)
- Hit/miss against AC for the DM
- Richer combat highlighting (e.g. reactions/legendary actions at the end of a round)
- Durations of conditions/effects in rounds, concentration reminder on damage
- Layout for larger screens
- More languages
- Optional: Android APK via Capacitor as a GitHub release

## Game content license

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC,
available at <https://www.dndbeyond.com/srd>. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0
International License (<https://creativecommons.org/licenses/by/4.0/legalcode>). Data via <https://www.dnd5eapi.co>.
Dicefree is not an official Wizards of the Coast product.
