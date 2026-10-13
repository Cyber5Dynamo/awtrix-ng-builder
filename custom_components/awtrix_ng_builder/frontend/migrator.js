/* AWTRIX 3 → AWTRIX NG Payload-Migrator
 * Reines Logikmodul ohne DOM-Zugriff (läuft im Browser und in Node).
 */
(function (root) {
  'use strict';

  // Keys, die AWTRIX NG laut Builder kennt
  const KNOWN_NG = [
    'text', 'textColor', 'backgroundColor', 'textCenter', 'icon', 'iconMode',
    'repeat', 'force', 'hold', 'stack', 'wakeup', 'scroll', 'font', 'textCase',
    'textInFront', 'progress', 'progressColor', 'progressTrackColor',
    'durationMs', 'lifetimeMs', 'lifetimeExpiry', 'name', 'sound', 'soundRtttl',
    'soundLoop', 'palette', 'paletteSpeed', 'paletteSpan', 'paletteBlend',
    'textBlinkMs', 'textFadeMs', 'barChart', 'lineChart', 'chartColor',
    'chartAutoscale', 'draw', 'effect', 'effectSpeed', 'overlay'
  ];

  // AWTRIX-3-Keys ohne bekanntes NG-Äquivalent
  const AWTRIX3_ONLY = ['topText', 'textOffset', 'pos', 'save', 'clients', 'barBC', 'lineBC', 'iconOffset'];

  // Nur in Notifications erlaubt
  const NOTIFY_ONLY = ['force', 'hold', 'stack', 'wakeup'];

  const SIMPLE_RENAMES = {
    background: 'backgroundColor',
    center: 'textCenter',
    blinkText: 'textBlinkMs',
    fadeText: 'textFadeMs',
    loopSound: 'soundLoop',
    rtttl: 'soundRtttl',
    bar: 'barChart',
    line: 'lineChart',
    progressC: 'progressColor',
    progressBC: 'progressTrackColor',
    autoscale: 'chartAutoscale'
  };

  const SEC_TO_MS = { duration: 'durationMs', lifetime: 'lifetimeMs' };
  const PUSH_ICON = { 0: 'fixed', 1: 'pushOnce', 2: 'push' };
  const TEXT_CASE = { 0: 'inherit', 1: 'inherit', 2: 'asTyped' };

  const fmt = (v) => JSON.stringify(v);

  function migrateOne(obj, opts) {
    const isApp = !!opts.isApp;
    const dropUnknown = opts.dropUnknown !== false;
    const changes = [];
    const result = {};
    const scroll = {};
    let effectSettings = null;
    const add = (t, m) => changes.push({ t, m });
    const rainbow = obj.rainbow === true;

    for (const [k, v] of Object.entries(obj)) {
      if (k in SIMPLE_RENAMES) {
        result[SIMPLE_RENAMES[k]] = v;
        add('rename', `"${k}" → "${SIMPLE_RENAMES[k]}"`);
        continue;
      }
      if (k in SEC_TO_MS) {
        if (typeof v === 'number') {
          result[SEC_TO_MS[k]] = Math.round(v * 1000);
          add('rename', `"${k}": ${v} (Sek.) → "${SEC_TO_MS[k]}": ${Math.round(v * 1000)} (ms)`);
        } else {
          result[SEC_TO_MS[k]] = v;
          add('warn', `"${k}" ist keine Zahl (${fmt(v)}) – unverändert nach "${SEC_TO_MS[k]}" übernommen, bitte prüfen`);
        }
        continue;
      }

      switch (k) {
        case 'color':
          if (rainbow) {
            add('removed', '"color" entfernt – "rainbow": true hat Vorrang');
          } else {
            result.textColor = v;
            add('rename', `"color": ${fmt(v)} → "textColor"`);
          }
          break;

        case 'gradient':
          if (rainbow) {
            add('removed', '"gradient" entfernt – "rainbow": true hat Vorrang');
          } else if (Array.isArray(v)) {
            result.palette = v;
            result.textColor = 'palette';
            add('rename', '"gradient" → "palette" (Array) + "textColor": "palette"');
          } else {
            add('warn', '"gradient" ist kein Array – entfernt');
          }
          break;

        case 'rainbow':
          if (v === true) {
            result.palette = 'Rainbow';
            result.textColor = 'palette';
            add('rename', '"rainbow": true → "palette": "Rainbow", "textColor": "palette"');
          } else {
            add('removed', '"rainbow": false entfernt (ist Standard in NG)');
          }
          break;

        case 'pushIcon':
          result.iconMode = PUSH_ICON[v] || 'fixed';
          add('rename', `"pushIcon": ${fmt(v)} → "iconMode": "${result.iconMode}"`);
          if (!(v in PUSH_ICON)) add('warn', `pushIcon-Wert ${fmt(v)} unbekannt – "fixed" angenommen`);
          break;

        case 'lifetimeMode':
          result.lifetimeExpiry = v === 0 ? 'remove' : 'mark';
          add('rename', `"lifetimeMode": ${fmt(v)} → "lifetimeExpiry": "${result.lifetimeExpiry}"`);
          break;

        case 'textCase':
          if (typeof v === 'number') {
            result.textCase = TEXT_CASE[v] || 'asTyped';
            add('rename', `"textCase": ${v} → "textCase": "${result.textCase}"`);
            if (v === 1) add('warn', '"textCase": 1 (erzwungen Großbuchstaben) auf "inherit" gemappt – bitte prüfen');
          } else {
            result.textCase = v;
          }
          break;

        case 'scrollSpeed':
          scroll.speed = v;
          add('rename', `"scrollSpeed": ${fmt(v)} → "scroll": {"speed": ${fmt(v)}}`);
          break;

        case 'noScroll':
          if (v) {
            scroll.mode = 'static';
            add('rename', '"noScroll": true → "scroll": {"mode": "static"}');
          } else {
            add('removed', '"noScroll": false entfernt (ist Standard)');
          }
          break;

        case 'effectSettings':
          effectSettings = v;
          break;

        case 'draw':
          result.draw = v;
          add('warn', '"draw" unverändert übernommen – Format bitte gegen die NG-Doku prüfen');
          break;

        default:
          if (NOTIFY_ONLY.includes(k)) {
            if (isApp) {
              add('removed', `"${k}" entfernt – nur in Notifications erlaubt (würde 422 erzeugen)`);
            } else {
              result[k] = v;
            }
          } else if (AWTRIX3_ONLY.includes(k)) {
            add('removed', `"${k}" hat kein NG-Äquivalent – entfernt`);
          } else if (KNOWN_NG.includes(k)) {
            if (k === 'scroll') {
              if (typeof v === 'string') scroll.mode = scroll.mode || v;
              else if (v && typeof v === 'object') Object.assign(scroll, v);
            } else {
              result[k] = v;
            }
          } else if (dropUnknown) {
            add('removed', `"${k}" ist kein bekannter NG-Key – entfernt (sonst 422)`);
          } else {
            result[k] = v;
            add('warn', `"${k}" ist kein bekannter NG-Key – AWTRIX NG würde mit 422 ablehnen`);
          }
      }
    }

    if (effectSettings && typeof effectSettings === 'object') {
      if (effectSettings.speed != null) result.effectSpeed = effectSettings.speed;
      if (effectSettings.blend != null) result.paletteBlend = effectSettings.blend;
      if (effectSettings.palette) {
        if (result.textColor === 'palette') {
          add('warn', '"effectSettings.palette" verworfen – Text-Palette (rainbow/gradient) hat Vorrang');
        } else {
          result.palette = effectSettings.palette;
        }
      }
      add('rename', '"effectSettings" aufgelöst → effectSpeed, paletteBlend, palette');
    }

    if (Object.keys(scroll).length) {
      if (result.scroll && typeof result.scroll === 'object') Object.assign(result.scroll, scroll);
      else result.scroll = scroll;
    }

    return { result, changes };
  }

  function migrate(input, opts) {
    opts = opts || {};
    if (Array.isArray(input)) {
      const results = [];
      const changes = [{ t: 'warn', m: 'Array-Payload erkannt – jedes Element einzeln migriert' }];
      input.forEach((item, i) => {
        const r = migrateOne(item || {}, opts);
        results.push(r.result);
        r.changes.forEach((c) => changes.push({ t: c.t, m: `[${i}] ${c.m}` }));
      });
      return { result: results, changes };
    }
    return migrateOne(input || {}, opts);
  }

  // Zieht ein JSON-Objekt aus rohem JSON oder aus einem HA-YAML-Schnipsel mit "payload:"
  function extractJson(raw) {
    raw = String(raw).trim();
    try { return JSON.parse(raw); } catch (e) { /* weiter */ }

    const m = raw.match(/payload:\s*(.*)$/s);
    if (m) {
      let rest = m[1].trim();
      if (/^[>|][-+]?\s*\n/.test(rest)) {
        rest = rest.replace(/^[>|][-+]?\s*\n/, '').split('\n').map((l) => l.trim()).join(' ');
      } else if (rest.startsWith("'")) {
        const end = rest.lastIndexOf("'");
        rest = rest.slice(1, end).replace(/''/g, "'");
      } else if (rest.startsWith('"')) {
        const end = rest.lastIndexOf('"');
        rest = rest.slice(1, end).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
      try { return JSON.parse(rest); } catch (e) { /* weiter */ }
    }

    const a = raw.indexOf('{');
    const b = raw.lastIndexOf('}');
    if (a !== -1 && b > a) return JSON.parse(raw.slice(a, b + 1));
    return JSON.parse(raw); // wirft sinnvolle Fehlermeldung
  }

  const api = { migrate, extractJson, KNOWN_NG };
  root.Migrator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
