# AWTRIX NG Builder

Payload-Builder und **AWTRIX-3 → AWTRIX-NG-Migrator** als Home-Assistant-Integration mit eigenem Eintrag in der Seitenleiste. Läuft zusätzlich als einzelne HTML-Datei ohne Home Assistant.

## Funktionen

- **Builder** für Notifications und Pushed Apps: Text, Icon, Farben, Paletten, Verlauf, Hintergrund, 19 Effekte, Weather-Overlay, Scroll-Modi, Fortschrittsbalken, Balken-/Liniendiagramm, Sound/RTTTL, Timing
- **Live-Vorschau** inkl. Scroll-Verhalten, Blink/Fade, Overlay und Fortschritt
- **Ausgabe** als JSON-Payload und als fertige `mqtt.publish`-Aktion (YAML) für Automationen
- **Migrator**: AWTRIX-3-Payload (JSON oder HA-YAML mit `payload:`) wird live in AWTRIX NG umgeschrieben, inkl. Änderungsprotokoll
- **Senden** direkt per HTTP an die Display-IP oder über Home Assistant per MQTT
- **Presets** speichern, laden, exportieren, importieren
- Mobil bedienbar (Tablet/Handy, HA-App)

## Installation über HACS

1. HACS öffnen → ⋮ (oben rechts) → **Benutzerdefinierte Repositories**
2. URL `https://github.com/Cyber5Dynamo/awtrix-ng-builder` eintragen, Kategorie **Integration** wählen → Hinzufügen
3. „AWTRIX NG Builder“ in HACS suchen → **Herunterladen**
4. Home Assistant **neu starten**
5. **Einstellungen → Geräte & Dienste → Integration hinzufügen → „AWTRIX NG Builder“**
   - Name in der Seitenleiste
   - MQTT-Topic-Präfix des Displays (Standard `Display`)
   - Display-IP (optional, nur für direktes Senden per HTTP)
6. Der Eintrag **AWTRIX Builder** erscheint in der Seitenleiste.

Einstellungen lassen sich später über das Zahnrad der Integration ändern.

### Manuelle Installation

Ordner `custom_components/awtrix_ng_builder` nach `/config/custom_components/` kopieren, Home Assistant neu starten und die Integration wie oben hinzufügen.

## Senden: HTTP oder Home Assistant

| Modus | Funktionsweise | Hinweis |
|---|---|---|
| **Direkt (HTTP)** | Browser → Display (`/api/v1/notifications`, `/api/v1/apps/pushed/<name>`) | Scheitert, wenn HA über HTTPS läuft (Mixed Content) |
| **Home Assistant (MQTT)** | Builder → HA-Service `mqtt.publish` → Display | Braucht die MQTT-Integration; nur im HA-Panel verfügbar |

Die Topics lauten `<Präfix>/cmd/notify` und `<Präfix>/cmd/apps/pushed/<App-Name>`. Stimmt das Schema deines Displays nicht, bitte Präfix bzw. Topic prüfen.

„Dismiss“ funktioniert derzeit nur im HTTP-Modus.

## Ohne Home Assistant nutzen

```bash
python3 tools/build_standalone.py
```

erzeugt `dist/awtrix_ng_builder_standalone.html` – eine einzelne Datei, die direkt im Browser geöffnet werden kann. Alternativ lässt sich der Ordner `custom_components/awtrix_ng_builder/frontend` über GitHub Pages veröffentlichen.

## Projektstruktur

```
custom_components/awtrix_ng_builder/
├── __init__.py          Panel-Registrierung, statische Dateien
├── config_flow.py       Einrichtung + Optionen
├── const.py
├── manifest.json
├── translations/        de, en
└── frontend/
    ├── awtrix-ng-builder-panel.js   Sidebar-Panel (iframe + HA-Bridge)
    ├── index.html
    ├── style.css
    ├── app.js                       Builder-Logik
    └── migrator.js                  AWTRIX-3 → NG (ohne DOM, testbar)
tools/build_standalone.py            Einzeldatei-Build
```

## Migrator: was passiert

| AWTRIX 3 | AWTRIX NG |
|---|---|
| `color` | `textColor` |
| `rainbow: true` | `palette: "Rainbow"`, `textColor: "palette"` |
| `gradient` | `palette` (Array), `textColor: "palette"` |
| `background`, `center` | `backgroundColor`, `textCenter` |
| `duration`, `lifetime` (Sek.) | `durationMs`, `lifetimeMs` (ms) |
| `lifetimeMode` | `lifetimeExpiry` |
| `pushIcon` 0/1/2 | `iconMode` fixed/pushOnce/push |
| `scrollSpeed`, `noScroll` | `scroll: {speed, mode: "static"}` |
| `blinkText`, `fadeText` | `textBlinkMs`, `textFadeMs` |
| `bar`, `line`, `autoscale` | `barChart`, `lineChart`, `chartAutoscale` |
| `progressC`, `progressBC` | `progressColor`, `progressTrackColor` |
| `loopSound`, `rtttl` | `soundLoop`, `soundRtttl` |
| `effectSettings` | `effectSpeed`, `paletteBlend`, `palette` |
| `force`/`hold`/`stack`/`wakeup` in Custom Apps | entfernt (nur in Notifications erlaubt) |
| `topText`, `textOffset`, `pos`, `save`, `clients`, `barBC`, `lineBC`, `iconOffset` | entfernt (kein NG-Äquivalent bekannt) |

Unbekannte Keys werden standardmäßig entfernt (sonst antwortet AWTRIX NG mit 422); das lässt sich im Migrator abschalten.

## Lizenz

MIT – © 2026 Dennis Schütz
