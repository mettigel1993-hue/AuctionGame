# Steam-Release – Umbauplan

Stand: 2026-09-13. Noch nicht umgesetzt.

Ziel: Das HTML/JS-Spiel läuft als Desktop-App (Electron) offline und kann auf Steam veröffentlicht werden.

---

## Zielstruktur

```
Launcher/
├─ package.json            Name, Version, electron + electron-builder, npm start / npm run dist
├─ .gitignore              node_modules/  dist/
├─ electron/
│  └─ main.js              Fenster öffnen, app://-Protokoll registrieren, src/index.html laden
├─ src/                    ← nur dieser Ordner kommt in den Steam-Build
│  ├─ index.html           Hauptmenü (12 Spielkarten)
│  ├─ game.html            nur HTML-Gerüst, kein Inline-CSS/JS mehr
│  ├─ css/
│  │  ├─ tailwind.css      einmalig mit Tailwind CLI gebaut
│  │  ├─ game.css          eigenes CSS (Animationen, Popups, Glücksrad)
│  │  └─ fonts.css         @font-face-Regeln
│  ├─ fonts/               .woff2-Dateien
│  ├─ vendor/fontawesome/  Icons lokal
│  ├─ js/
│  │  ├─ engine.js         Spiellogik (bleibt wie sie ist)
│  │  ├─ settings.js       GameSettings / Balancing-Werte
│  │  ├─ themes.js         Farbpaletten + applyTheme()
│  │  ├─ settings-ui.js    Einstellungs-Fenster
│  │  └─ ui.js             Dropdown, Karten-Overlay, Popups
│  └─ themes/
│     └─ <theme>/
│        ├─ config.json    Texte, Währung, Joker, Kategorien
│        └─ db.json        Karten
├─ tools/
│  └─ audit.html           Dev-Tool, wird nicht ausgeliefert
└─ steam/                  Store-Bilder, app_build.vdf, depot_build.vdf (nicht ausgeliefert)
```

---

## Datei-Mapping (heute → neu)

| Heute | Neu |
|---|---|
| `Index.html` | `src/index.html` (kleines i, Audit-Link entfernen) |
| `game.html` | `src/game.html` |
| `game.html` Zeilen 16–1050 (`<style>`) | `src/css/game.css` |
| `game.html` Zeilen 1556–1655 (THEMES, applyTheme) | `src/js/themes.js` |
| `game.html` Zeilen 1660–1854 (Einstellungs-Modal) | `src/js/settings-ui.js` |
| `game.html` Zeilen 1859–1972 (Dropdown, Overlays, Popups) | `src/js/ui.js` |
| `js/engine.js` | `src/js/engine.js` |
| `js/config_settings.js` | `src/js/settings.js` |
| `audit.html` | `tools/audit.html` |
| `config/config_airline.json` + `db/airline_db.json` | `src/themes/airline/` |
| `config/config_alman.json` + `db/alman_datenbank.json` | `src/themes/alman/` |
| `config/config_bahn.json` + `db/bahn_db.json` | `src/themes/bahn/` |
| `config/config_diktatur.json` + `db/diktatur_db_export.json` | `src/themes/diktatur/` |
| `config/config_eigenheim.json` + `db/hausbau_db_export.json` | `src/themes/eigenheim/` ⚠️ siehe Stolperfallen |
| `config/config_line.json` + `db/line_db_export.json` | `src/themes/line/` |
| `config/config_memories.json` + `db/core_memories_db.json` | `src/themes/memories/` |
| `config/config_nooblobby.json` + `db/nooblobby_db_export.json` | `src/themes/nooblobby/` |
| `config/config_office.json` + `db/office_db_export.json` | `src/themes/office/` |
| `config/config_warzone.json` + `db/warzone_db_export.json` | `src/themes/warzone/` |
| `config/config_wedding.json` + `db/wedding_db_export.json` | `src/themes/wedding/` |
| `config/config_wehleiden.json` + `db/prison_db_export.json` | `src/themes/wehleiden/` |

---

## Schritte

### Phase 1 – Aufräumen (ohne Electron, Spiel läuft weiter im Browser)
- [ ] `.gitignore` anlegen
- [ ] Ordner `src/`, `tools/` anlegen, Dateien laut Mapping verschieben (`git mv`, damit die Historie bleibt)
- [ ] `Index.html` → `index.html`; Link in `audit.html` anpassen; Audit-Karte aus dem Hauptmenü entfernen
- [ ] Themes in `src/themes/<theme>/config.json` + `db.json` zusammenführen
- [ ] `engine.js` Bootloader: ``fetch(`themes/${theme}/config.json`)`` und ``fetch(`themes/${theme}/db.json`)``
- [ ] `"databaseFile"` aus allen Configs löschen
- [ ] Inline-`<style>` und die drei Inline-`<script>`-Blöcke aus `game.html` in eigene Dateien auslagern (Reihenfolge der `<script>`-Tags beibehalten: themes → settings → settings-ui → engine → ui)

**Fertig, wenn:** alle 12 Themes über einen lokalen Server (`npx serve src`) starten und spielbar sind.

### Phase 2 – Offline-fähig
- [ ] Tailwind CLI einrichten, `src/css/tailwind.css` bauen, CDN-Script aus allen HTML-Dateien entfernen
- [ ] Alle Google Fonts als `.woff2` nach `src/fonts/`, `fonts.css` schreiben, Google-Links entfernen
- [ ] Font Awesome nach `src/vendor/fontawesome/`, cdnjs-Link entfernen

**Fertig, wenn:** das Spiel mit abgeschaltetem Internet (DevTools → Network → Offline) identisch aussieht.

### Phase 3 – Electron
- [ ] `package.json` mit `electron` und `electron-builder`
- [ ] `electron/main.js`: Fenster, `protocol.handle('app', …)` für `src/`, `app://index.html` laden
- [ ] `npm start` startet das Spiel im Fenster
- [ ] App-Icon (`.ico` / `.png`) hinterlegen
- [ ] `npm run dist` erzeugt Windows-Build (optional zusätzlich Linux für Steam Deck)

**Fertig, wenn:** die gebaute `.exe` auf einem Rechner ohne Node und ohne Internet läuft und Spielstände nach Neustart noch da sind.

### Phase 4 – Steam
- [ ] Steamworks-Account + App-ID (Steam Direct Gebühr)
- [ ] Store-Bilder in `steam/store-assets/` (Header, Main/Small Capsule, Library Hero/Logo, Screenshots)
- [ ] `steam/app_build.vdf` + `depot_build.vdf`, Upload mit SteamCMD
- [ ] Optional später: `steamworks.js` für Achievements/Overlay
- [ ] Optional später: Spielstände von `localStorage` in eine Datei verschieben (für Steam Cloud)

---

## Stolperfallen

- **`fetch()` über `file://`** ist in Electron blockiert → deshalb das `app://`-Protokoll in `main.js`. Nicht `loadFile()` ohne Protokoll verwenden.
- **Groß-/Kleinschreibung:** Linux/Steam Deck unterscheiden `Index.html` und `index.html`. Alle Pfade klein schreiben und exakt so referenzieren.
- **Eigenheim hat drei Namen:** URL `eigenheim`, `themeId` `hausbau`, Palette in THEMES `hausbau`. Spielstände liegen in `localStorage` unter `hausbau_db`, `hausbau_shredded`, `hausbau_used`. Beim Vereinheitlichen auf `eigenheim` gehen bestehende Spielstände dieses Themes verloren – vor Release egal, danach nicht mehr.
- **Tailwind CLI** findet nur Klassen, die als vollständiger String im Code stehen. Dynamisch zusammengesetzte Klassen wie `bg-${c}-950/40`, `text-${c}-400` in `engine.js` (Joker-Farben aus `terminology.jokers.*.color` in den Configs) müssen in die `safelist`, sonst fehlen die Joker-Farben.
- **Audit-Seite und Admin-Funktionen** nicht in den Build – `tools/` liegt außerhalb von `src/`.
