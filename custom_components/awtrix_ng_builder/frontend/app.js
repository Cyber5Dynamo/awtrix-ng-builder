/* AWTRIX NG · Payload Builder
 * Läuft standalone (Datei/Webserver) und eingebettet im Home-Assistant-Panel.
 */
'use strict';

// ── Helpers ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorieren */ } }
};
const params = new URLSearchParams(location.search);

// ── State ─────────────────────────────────────────────────
const DEFAULTS = {
  mode: 'notify', appName: 'myapp',
  text: 'Hallo AWTRIX NG!', icon: '', imode: 'push',
  tcMode: 'solid', tcColor: '#FFFFFF',
  palette: 'Rainbow', palSpeed: 0, palSpan: 0,
  gradStops: ['#FF0000', '#0000FF'],
  animMode: 'none', animMs: 500,
  bgEnabled: false, bgColor: '#000000',
  scrollMode: 'wrap', scrollSpeed: 100, holdMs: 1000, scrollGap: 8,
  direction: 'left', entry: 'inline', whenFits: 'static',
  font: 'small', textCase: 'asTyped', textInFront: false, textCenter: true,
  effect: '', effectSpeed: 1, overlay: '',
  progressOn: false, progress: 50, progressColor: '#4CAF50', progressTrackColor: '#333333',
  chartType: 'none', chartData: '1,4,2,7,5,8', chartColor: '#00BCD4', chartAutoscale: false,
  sound: '', soundRtttl: '', soundLoop: false,
  dur: 0, rep: 1, lt: 0, hold: false, stack: false, notifName: ''
};
const CONN = { transport: 'http', ip: '', prefix: 'Display' };
const UI = { view: 'controls', otab: 'json', migMode: 'notify', migAppName: 'myapp', migDrop: true };

const S = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), CONN, UI);

const SLIDER_FMT = {
  ms: (v) => v + 'ms', pct: (v) => v + '%', px: (v) => v + 'px',
  x: (v) => Number(v).toFixed(1) + 'x', num: (v) => String(v)
};

const COLORS_TEXT = [
  ['Weiß', '#FFFFFF'], ['Rot', '#F44336'], ['Orange', '#FF9800'], ['Gelb', '#FFC107'],
  ['Grün', '#4CAF50'], ['Cyan', '#00BCD4'], ['Blau', '#2196F3'], ['Lila', '#9C27B0'], ['Pink', '#E91E63']
];
const COLORS_BG = [
  ['Schwarz', '#000000'], ['Dunkelblau', '#001840'], ['Dunkelrot', '#1A0000'],
  ['Dunkelgrün', '#001A00'], ['Dunkelgrau', '#1A1A1A']
];

// ── Verbindung ────────────────────────────────────────────
function haBridge() {
  try { return (window.parent && window.parent !== window && window.parent.awtrixNgBuilder) || null; }
  catch (e) { return null; }
}
function topicFor(mode, app) {
  const p = (S.prefix || 'Display').trim().replace(/^\/+|\/+$/g, '') || 'Display';
  return mode === 'notify' ? `${p}/cmd/notify` : `${p}/cmd/apps/pushed/${(app || 'myapp').trim() || 'myapp'}`;
}
function httpBase() {
  const ip = (S.ip || '').trim();
  if (!ip) return null;
  return /^https?:\/\//.test(ip) ? ip.replace(/\/+$/, '') : `http://${ip}`;
}
async function req(method, path, body) {
  const b = httpBase();
  if (!b) { toast('Keine IP!', 'err'); return null; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const o = { method, headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal };
    if (body != null) o.body = JSON.stringify(body);
    const r = await fetch(b + path, o);
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; }
    return { ok: r.ok, status: r.status, data: j };
  } catch (e) {
    let msg = e.name === 'AbortError' ? 'Timeout' : e.message;
    if (location.protocol === 'https:' && b.startsWith('http:')) msg = 'Mixed Content blockiert – „Home Assistant (MQTT)“ nutzen';
    return { ok: false, status: 0, data: { error: msg } };
  } finally { clearTimeout(timer); }
}
function setStatus(state, msg) {
  $('status-dot').className = 'status-dot ' + (state || '');
  $('status-msg').textContent = msg || '—';
  $('status-msg').title = msg || '';
}
async function publishViaHA(topic, payloadObj) {
  const b = haBridge();
  if (!b) { setStatus('err', 'HA-Modus nur im Home-Assistant-Panel'); toast('❌ Nicht in Home Assistant geöffnet', 'err'); return false; }
  setStatus('pend', 'Sende per MQTT…');
  try {
    await b.callService('mqtt', 'publish', { topic, payload: JSON.stringify(payloadObj) });
    setStatus('ok', `MQTT → ${topic}`);
    toast('✅ Gesendet', 'ok');
    return true;
  } catch (e) {
    const msg = (e && (e.message || e.code)) || String(e);
    setStatus('err', msg);
    toast('❌ ' + msg, 'err');
    return false;
  }
}
async function publishViaHTTP(mode, app, payload) {
  const path = mode === 'notify' ? '/api/v1/notifications' : `/api/v1/apps/pushed/${encodeURIComponent((app || 'myapp').trim() || 'myapp')}`;
  const method = mode === 'notify' ? 'POST' : 'PUT';
  setStatus('pend', 'Sende…');
  const r = await req(method, path, payload);
  if (!r) { setStatus('err', 'Keine IP'); return false; }
  if (r.ok) { setStatus('ok', 'OK'); toast('✅ OK', 'ok'); return true; }
  const f = r.data && r.data.error && r.data.error.field || '';
  const m = (r.data && r.data.error && (r.data.error.message || (typeof r.data.error === 'string' && r.data.error))) || JSON.stringify(r.data).substring(0, 80);
  setStatus('err', `${r.status}: ${f ? f + ' – ' : ''}${m}`);
  toast(`❌ ${r.status}: ${f || m}`, 'err');
  return false;
}
function sendPayload(mode, app, payload) {
  return S.transport === 'ha'
    ? publishViaHA(topicFor(mode, app), payload)
    : publishViaHTTP(mode, app, payload);
}

// ── Payload ───────────────────────────────────────────────
function parseChart(str) {
  return String(str || '').split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
}

function buildPayload() {
  const o = {};
  if (S.text) o.text = S.text;

  if (S.tcMode === 'palette') {
    o.palette = S.palette;
    o.textColor = 'palette';
    if (S.palSpeed > 0) o.paletteSpeed = S.palSpeed;
    if (S.palSpan > 0) o.paletteSpan = S.palSpan;
  } else if (S.tcMode === 'gradient') {
    o.palette = S.gradStops.slice();
    o.textColor = 'palette';
  } else if (S.tcColor !== '#FFFFFF') {
    o.textColor = S.tcColor;
  }

  if (S.animMode === 'blink') o.textBlinkMs = S.animMs;
  else if (S.animMode === 'fade') o.textFadeMs = S.animMs;

  if (S.bgEnabled) o.backgroundColor = S.bgColor;

  const ic = String(S.icon).trim();
  if (ic) { o.icon = ic; o.iconMode = S.imode; }

  const sc = {};
  if (S.scrollMode !== 'wrap') sc.mode = S.scrollMode;
  if (S.scrollSpeed !== 100) sc.speed = S.scrollSpeed;
  if (S.scrollMode === 'bounce' && S.holdMs !== 1000) sc.holdMs = S.holdMs;
  if (S.scrollMode === 'loop' && S.scrollGap !== 8) sc.gap = S.scrollGap;
  if (S.direction !== 'left') sc.direction = S.direction;
  if (S.entry !== 'inline') sc.entry = S.entry;
  if (S.whenFits !== 'static') sc.whenFits = S.whenFits;
  const scKeys = Object.keys(sc);
  if (scKeys.length) o.scroll = scKeys.length === 1 && sc.mode ? sc.mode : sc;

  if (S.font !== 'small') o.font = S.font;
  if (S.textCase !== 'asTyped') o.textCase = S.textCase;
  if (S.textInFront) o.textInFront = true;
  if (!S.textCenter) o.textCenter = false;

  if (S.effect) {
    o.effect = S.effect;
    if (S.effectSpeed !== 1) o.effectSpeed = S.effectSpeed;
  }
  if (S.overlay) o.overlay = S.overlay;

  if (S.progressOn) {
    o.progress = Math.round(S.progress);
    o.progressColor = S.progressColor.toUpperCase();
    o.progressTrackColor = S.progressTrackColor.toUpperCase();
  }
  if (S.chartType !== 'none') {
    const data = parseChart(S.chartData);
    if (data.length) {
      o[S.chartType === 'bar' ? 'barChart' : 'lineChart'] = data;
      o.chartColor = S.chartColor.toUpperCase();
      if (S.chartAutoscale) o.chartAutoscale = true;
    }
  }

  const snd = String(S.sound).trim();
  const rtttl = String(S.soundRtttl).trim();
  if (snd) o.sound = snd;
  if (rtttl) o.soundRtttl = rtttl;
  if ((snd || rtttl) && S.soundLoop) o.soundLoop = true;

  if (S.dur > 0) o.durationMs = Math.round(S.dur);
  if (S.rep !== 1) o.repeat = Math.round(S.rep);

  if (S.mode === 'app') {
    if (S.lt > 0) o.lifetimeMs = Math.round(S.lt);
  } else {
    if (S.hold) o.hold = true;
    if (S.stack) o.stack = true;
    const nn = String(S.notifName).trim();
    if (nn) o.name = nn;
  }
  return o;
}

function esc(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function highlight(json) {
  return esc(json).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],]/g,
    (m, str, colon, bool) => {
      if (str) return colon ? `<span class="j-key">${str}</span><span class="j-punct">${colon}</span>` : `<span class="j-str">${m}</span>`;
      if (bool) return `<span class="j-bool">${m}</span>`;
      if (m === 'null') return '<span class="j-null">null</span>';
      if (/^-?\d/.test(m)) return `<span class="j-num">${m}</span>`;
      return `<span class="j-punct">${m}</span>`;
    }
  );
}
function buildYAML(p) {
  const topic = topicFor(S.mode, S.appName);
  const safe = JSON.stringify(p).replace(/'/g, "''");
  return `- action: mqtt.publish\n  data:\n    topic: ${topic}\n    payload: '${safe}'`;
}

// ── UI-Sync ───────────────────────────────────────────────
const norm = (c) => String(c).toUpperCase();
const CONN_LS = { transport: 'awtrix-ng-transport', ip: 'awtrix-ip', prefix: 'awtrix-ng-prefix' };

function buildSwatches() {
  document.querySelectorAll('[data-swatches]').forEach((box) => {
    const key = box.dataset.swatches;
    const list = box.dataset.set === 'bg' ? COLORS_BG : COLORS_TEXT;
    box.innerHTML = '';
    list.forEach(([name, hex]) => {
      const sw = document.createElement('span');
      sw.className = 'sw' + (box.dataset.set === 'bg' ? ' sw-off' : '');
      sw.title = name;
      sw.style.background = hex === '#000000' ? '#080a0c' : hex;
      sw.dataset.k = key;
      sw.dataset.color = hex;
      box.appendChild(sw);
    });
    const custom = document.createElement('span');
    custom.className = 'sw sw-custom';
    custom.title = 'Eigene Farbe';
    custom.innerHTML = `<input type="color" data-k="${key}">`;
    box.appendChild(custom);
  });
}

function renderStops() {
  const wrap = $('grad-stops');
  let prev = $('grad-preview');
  const inputs = () => [...wrap.querySelectorAll('.stop-input')];
  if (inputs().length !== S.gradStops.length) {
    wrap.innerHTML = '';
    S.gradStops.forEach((c, i) => {
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.className = 'stop-input';
      inp.value = c.toLowerCase();
      inp.addEventListener('input', () => { S.gradStops[i] = norm(inp.value); syncGradPreview(); update(); });
      wrap.appendChild(inp);
    });
    prev = document.createElement('div');
    prev.className = 'grad-preview';
    prev.id = 'grad-preview';
    wrap.appendChild(prev);
  } else {
    inputs().forEach((inp, i) => { if (inp !== document.activeElement) inp.value = S.gradStops[i].toLowerCase(); });
  }
  syncGradPreview();
}
function syncGradPreview() {
  const p = $('grad-preview');
  if (p) p.style.background = `linear-gradient(90deg,${S.gradStops.join(',')})`;
}

function syncUI() {
  document.querySelectorAll('[data-k]').forEach((el) => {
    const k = el.dataset.k;
    if (!(k in S)) return;
    if (el.matches('input,textarea')) {
      if (el === document.activeElement) return;
      el.value = el.type === 'color' ? String(S[k]).toLowerCase() : S[k];
    } else if (el.classList.contains('toggle')) {
      el.classList.toggle('on', !!S[k]);
    } else if (el.dataset.v !== undefined) {
      el.classList.toggle('active', String(S[k]) === el.dataset.v);
    } else if (el.dataset.color) {
      el.classList.toggle('active', norm(S[k]) === norm(el.dataset.color));
    }
  });
  // „Eigene Farbe“ aktiv, wenn keine Vorgabe passt
  document.querySelectorAll('.swatches').forEach((box) => {
    const custom = box.querySelector('.sw-custom');
    if (custom) custom.classList.toggle('active', !box.querySelector('.sw[data-color].active'));
  });
  document.querySelectorAll('[data-prev]').forEach((el) => { el.style.background = S[el.dataset.prev]; });
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const k = el.dataset.badge;
    const rng = document.querySelector(`input[type=range][data-k="${k}"]`);
    const f = SLIDER_FMT[rng ? rng.dataset.fmt : 'num'] || SLIDER_FMT.num;
    el.textContent = f(S[k]);
  });
  document.querySelectorAll('[data-showif]').forEach((el) => {
    const m = /^(\w+)(==|!=)(.*)$/.exec(el.dataset.showif);
    if (!m) return;
    const eq = String(S[m[1]]) === m[3];
    el.classList.toggle('hide', m[2] === '==' ? !eq : eq);
  });
  document.querySelector('.body').dataset.view = S.view;
  renderStops();
}

function afterChange(k) {
  if (CONN_LS[k]) LS.set(CONN_LS[k], S[k]);
  if (k === 'overlay') startOverlay(S.overlay);
  syncUI();
  update();
  if (/^mig/.test(k)) liveConvert();
}

// ── Events (delegiert) ────────────────────────────────────
document.addEventListener('click', (e) => {
  const head = e.target.closest('.sec-head');
  if (head) { head.nextElementSibling.classList.toggle('collapsed'); return; }

  const a = e.target.closest('[data-act]');
  if (a) { const fn = ACT[a.dataset.act]; if (fn) fn(a); return; }

  const t = e.target.closest('[data-k]');
  if (!t || t.matches('input,textarea')) return;
  const k = t.dataset.k;
  if (t.classList.contains('toggle')) S[k] = !S[k];
  else if (t.dataset.v !== undefined) S[k] = t.dataset.v;
  else if (t.dataset.color) S[k] = norm(t.dataset.color);
  else return;
  afterChange(k);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches || !el.matches('input[data-k],textarea[data-k]')) return;
  const k = el.dataset.k;
  if (!(k in S)) return;
  if (el.dataset.hex !== undefined) {
    let v = el.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
    S[k] = norm(v);
  } else if (el.type === 'color') {
    S[k] = norm(el.value);
  } else if (el.type === 'number' || el.type === 'range') {
    const n = parseFloat(el.value);
    S[k] = Number.isNaN(n) ? DEFAULTS[k] : n;
  } else {
    S[k] = el.value;
  }
  afterChange(k);
});

// ── Aktionen ──────────────────────────────────────────────
const ACT = {
  addStop() { if (S.gradStops.length < 4) { S.gradStops.push('#00FF00'); afterChange('gradStops'); } },
  delStop() { if (S.gradStops.length > 2) { S.gradStops.pop(); afterChange('gradStops'); } },

  async send() { await sendPayload(S.mode, S.appName, buildPayload()); },
  async ping() {
    if (S.transport === 'ha') { setStatus('', 'HA-Modus: kein Ping nötig'); return; }
    setStatus('pend', 'Ping…');
    const r = await req('GET', '/api/v1/device');
    if (!r) { setStatus('err', 'Keine IP'); return; }
    if (r.ok) { const v = (r.data && r.data.version) || '?'; setStatus('ok', `v${v} · verbunden`); toast(`✅ AWTRIX NG v${v}`, 'ok'); }
    else { setStatus('err', (r.data && r.data.error) || 'Nicht erreichbar'); toast('❌ Nicht erreichbar', 'err'); }
  },
  async dismiss() {
    if (S.transport === 'ha') { toast('Dismiss geht nur per HTTP', 'err'); return; }
    const r = await req('DELETE', '/api/v1/notifications/active');
    if (r && r.ok) toast('✅ Dismissed', 'ok');
    else toast('❌ ' + ((r && r.status) || 'Fehler'), 'err');
  },
  copyJSON() { copyText(JSON.stringify(buildPayload(), null, 2), '📋 JSON kopiert'); },
  copyYAML() { copyText(buildYAML(buildPayload()), '📋 YAML kopiert'); },

  savePreset() {
    const name = $('preset-name').value.trim();
    if (!name) { toast('Name fehlt', 'err'); return; }
    const all = loadPresets();
    all[name] = pickDefaults();
    LS.set('awtrix-ng-presets', JSON.stringify(all));
    $('preset-name').value = '';
    renderPresets();
    toast('★ Preset gespeichert', 'ok');
  },
  loadPreset(btn) {
    const p = loadPresets()[btn.dataset.name];
    if (!p) return;
    applyState(p);
    toast('★ Preset geladen', 'ok');
  },
  delPreset(btn) {
    const all = loadPresets();
    delete all[btn.dataset.name];
    LS.set('awtrix-ng-presets', JSON.stringify(all));
    renderPresets();
  },
  exportPresets() { $('preset-io').value = JSON.stringify(loadPresets(), null, 2); copyText($('preset-io').value, '📋 Presets kopiert'); },
  importPresets() {
    try {
      const incoming = JSON.parse($('preset-io').value);
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Kein Objekt');
      const all = Object.assign(loadPresets(), incoming);
      LS.set('awtrix-ng-presets', JSON.stringify(all));
      renderPresets();
      toast('★ Presets importiert', 'ok');
    } catch (e) { toast('❌ Import: ' + e.message, 'err'); }
  },
  resetAll() { applyState({}); toast('Zurückgesetzt', 'ok'); },

  migExample() {
    $('mig-input').value = `{
  "text": "Spülmaschine fertig",
  "color": [0, 255, 0],
  "duration": 15,
  "icon": 71024,
  "pushIcon": 2,
  "repeat": 2,
  "rainbow": false,
  "force": true,
  "lifetime": 120,
  "scrollSpeed": 80
}`;
    liveConvert();
  },
  migClear() { $('mig-input').value = ''; clearMig(); },
  migCopy() {
    if (!migratedObj) { toast('Noch nichts konvertiert', 'err'); return; }
    copyText(JSON.stringify(migratedObj, null, 2), '📋 Konvertierter Payload kopiert');
  },
  migToBuilder() {
    if (!migratedObj || Array.isArray(migratedObj)) { toast(Array.isArray(migratedObj) ? 'Arrays nicht ladbar' : 'Noch nichts konvertiert', 'err'); return; }
    applyPayload(migratedObj);
    S.otab = 'json';
    S.view = 'controls';
    afterChange('otab');
    toast('⇪ In Builder geladen', 'ok');
  },
  async migSend() {
    if (!migratedObj) { toast('Noch nichts konvertiert', 'err'); return; }
    await sendPayload(S.migMode, S.migAppName, migratedObj);
  }
};

function copyText(text, okMsg) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    toast(ok ? okMsg : '❌ Kopieren fehlgeschlagen', ok ? 'ok' : 'err');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(okMsg, 'ok'), fallback);
  } else fallback();
}

let _tt;
function toast(msg, type) {
  const el = $('toast');
  const colors = { ok: ['#1a3a2a', '#3ecf7a', '#3ecf7a55'], err: ['#3a1a1a', '#f05555', '#f0555555'] };
  const [bg, col, brd] = colors[type] || ['#2a2a1a', '#ffaa44', '#ffaa4455'];
  el.textContent = msg;
  el.style.cssText = `background:${bg};color:${col};border-color:${brd};display:block;opacity:1`;
  clearTimeout(_tt);
  _tt = setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 200); }, 2500);
}

// ── Presets / State ───────────────────────────────────────
function pickDefaults() {
  const o = {};
  Object.keys(DEFAULTS).forEach((k) => { o[k] = JSON.parse(JSON.stringify(S[k])); });
  return o;
}
function loadPresets() {
  try { const p = JSON.parse(LS.get('awtrix-ng-presets', '{}')); return p && typeof p === 'object' ? p : {}; }
  catch (e) { return {}; }
}
function renderPresets() {
  const box = $('preset-list');
  box.innerHTML = '';
  const names = Object.keys(loadPresets());
  if (!names.length) { box.innerHTML = '<div class="hint">Noch keine Presets gespeichert.</div>'; return; }
  names.forEach((n) => {
    const row = document.createElement('div');
    row.className = 'preset-item';
    const load = document.createElement('button');
    load.className = 'seg'; load.textContent = n; load.dataset.act = 'loadPreset'; load.dataset.name = n;
    const del = document.createElement('button');
    del.className = 'btn btn-ghost'; del.textContent = '×'; del.title = 'Löschen'; del.dataset.act = 'delPreset'; del.dataset.name = n;
    row.append(load, del);
    box.appendChild(row);
  });
}
function applyState(partial) {
  Object.assign(S, JSON.parse(JSON.stringify(DEFAULTS)), partial || {});
  if (!Array.isArray(S.gradStops) || S.gradStops.length < 2) S.gradStops = DEFAULTS.gradStops.slice();
  afterChange('overlay');
}

function toHex(c) {
  if (Array.isArray(c) && c.length >= 3) {
    return '#' + c.slice(0, 3).map((x) => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  if (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c)) return ('#' + c.replace('#', '')).toUpperCase();
  return null;
}

// Setzt den Builder-State aus einem (NG-)Payload
function applyPayload(p) {
  const keepMode = S.mode;
  const next = {};
  if (typeof p.text === 'string') next.text = p.text;
  else if (Array.isArray(p.text)) next.text = p.text.map((f) => (f && (f.text || f.t)) || '').join('');
  else next.text = '';
  if (p.icon !== undefined) next.icon = String(p.icon);
  if (p.iconMode) next.imode = p.iconMode;

  if (p.textColor === 'palette' || p.palette) {
    if (Array.isArray(p.palette)) {
      next.tcMode = 'gradient';
      next.gradStops = p.palette.map(toHex).filter(Boolean).slice(0, 4);
    } else if (p.palette) {
      next.tcMode = 'palette';
      next.palette = p.palette;
    }
  } else {
    const hx = toHex(p.textColor);
    if (hx) next.tcColor = hx;
  }
  if (p.paletteSpeed != null) next.palSpeed = p.paletteSpeed;
  if (p.paletteSpan != null) next.palSpan = p.paletteSpan;

  if (p.textBlinkMs) { next.animMode = 'blink'; next.animMs = p.textBlinkMs; }
  else if (p.textFadeMs) { next.animMode = 'fade'; next.animMs = p.textFadeMs; }

  const bg = toHex(p.backgroundColor);
  if (bg) { next.bgEnabled = true; next.bgColor = bg; }

  if (p.scroll) {
    const sc = typeof p.scroll === 'string' ? { mode: p.scroll } : p.scroll;
    if (sc.mode) next.scrollMode = sc.mode;
    if (sc.speed != null) next.scrollSpeed = sc.speed;
    if (sc.holdMs != null) next.holdMs = sc.holdMs;
    if (sc.gap != null) next.scrollGap = sc.gap;
    if (sc.direction) next.direction = sc.direction;
    if (sc.entry) next.entry = sc.entry;
    if (sc.whenFits) next.whenFits = sc.whenFits;
  }
  if (p.font) next.font = p.font;
  if (p.textCase) next.textCase = p.textCase;
  if (p.textInFront != null) next.textInFront = !!p.textInFront;
  if (p.textCenter != null) next.textCenter = !!p.textCenter;
  if (p.effect) next.effect = p.effect;
  if (p.effectSpeed != null) next.effectSpeed = p.effectSpeed;
  if (p.overlay) next.overlay = p.overlay;

  if (p.progress != null) {
    next.progressOn = true; next.progress = p.progress;
    const pc = toHex(p.progressColor); if (pc) next.progressColor = pc;
    const pt = toHex(p.progressTrackColor); if (pt) next.progressTrackColor = pt;
  }
  const chart = p.barChart || p.lineChart;
  if (Array.isArray(chart)) {
    next.chartType = p.barChart ? 'bar' : 'line';
    next.chartData = chart.join(',');
    const cc = toHex(p.chartColor); if (cc) next.chartColor = cc;
    if (p.chartAutoscale != null) next.chartAutoscale = !!p.chartAutoscale;
  }
  if (p.sound) next.sound = String(p.sound);
  if (p.soundRtttl) next.soundRtttl = String(p.soundRtttl);
  if (p.soundLoop != null) next.soundLoop = !!p.soundLoop;

  if (p.durationMs != null) next.dur = p.durationMs;
  if (p.repeat != null) next.rep = p.repeat;
  if (p.lifetimeMs != null) next.lt = p.lifetimeMs;
  if (p.hold != null) next.hold = !!p.hold;
  if (p.stack != null) next.stack = !!p.stack;
  if (p.name) next.notifName = String(p.name);

  next.mode = keepMode;
  applyState(next);
}

// ── Vorschau ──────────────────────────────────────────────
const PAL_GRAD = {
  Rainbow: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)',
  Heat: 'linear-gradient(90deg,#800,#f40,#ff0)',
  Ocean: 'linear-gradient(90deg,#004080,#0088ff,#00ccff)',
  Forest: 'linear-gradient(90deg,#003300,#009900,#66ff66)',
  Lava: 'linear-gradient(90deg,#400,#f40,#ffa000)',
  Cloud: 'linear-gradient(90deg,#666,#aaa,#eee)',
  Party: 'linear-gradient(90deg,#f0f,#00f,#0ff,#0f0,#ff0,#f00)',
  Stripe: 'repeating-linear-gradient(90deg,#f00 0 12%,#0f0 12% 24%,#00f 24% 36%)'
};
const EFFECT_BG = {
  Plasma: 'linear-gradient(135deg,#f00,#0f0,#00f,#f0f)',
  PlasmaCloud: 'linear-gradient(135deg,#004,#408,#80c,#c08)',
  Matrix: '#000', Fireworks: '#000', TwinklingStars: '#000080',
  ColorWaves: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f)',
  Fade: 'linear-gradient(135deg,#300020,#002030)',
  Checkerboard: 'repeating-conic-gradient(#111 0% 25%,#222 0% 50%)',
  Pacifica: 'linear-gradient(180deg,#001840,#004080)',
  Radar: '#001208', PingPong: '#100010', BrickBreaker: '#100010',
  Snake: '#001000', Ripple: '#000820', LookingEyes: '#0a0010',
  SwirlIn: 'linear-gradient(135deg,#200010,#001020)',
  SwirlOut: 'linear-gradient(135deg,#100020,#002010)',
  MovingLine: '#000820', TheaterChase: '#0a0a00'
};

let scrollAnim = null;
let textAnim = null;

function updatePreview(p) {
  const txt = $('led-text');
  const scroller = $('led-scroll');
  const wrap = $('led-wrap');
  const icon = $('led-icon');
  const disp = $('led-display');

  txt.textContent = typeof p.text === 'string' ? p.text : '';
  txt.classList.toggle('large', p.font === 'large');
  txt.style.textTransform = p.textCase && p.textCase !== 'asTyped' ? 'uppercase' : 'none';

  let clr = '#FFFFFF';
  if (p.textColor === 'palette') {
    const g = Array.isArray(p.palette) ? `linear-gradient(90deg,${p.palette.join(',')})` : (PAL_GRAD[p.palette] || PAL_GRAD.Rainbow);
    txt.style.background = g;
    txt.style.webkitBackgroundClip = 'text';
    txt.style.backgroundClip = 'text';
    txt.style.webkitTextFillColor = 'transparent';
    txt.style.color = '';
    clr = null;
  } else {
    clr = p.textColor || '#FFFFFF';
    txt.style.background = 'none';
    txt.style.webkitBackgroundClip = 'border-box';
    txt.style.backgroundClip = 'border-box';
    txt.style.webkitTextFillColor = '';
    txt.style.color = clr;
  }

  // Blink / Fade
  if (textAnim) { textAnim.cancel(); textAnim = null; }
  if (p.textBlinkMs && txt.animate) {
    textAnim = txt.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], { duration: p.textBlinkMs, iterations: Infinity });
  } else if (p.textFadeMs && txt.animate) {
    textAnim = txt.animate([{ opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }], { duration: p.textFadeMs, iterations: Infinity, easing: 'ease-in-out' });
  }

  // Scroll
  if (scrollAnim) { scrollAnim.cancel(); scrollAnim = null; }
  scroller.style.transform = 'none';
  wrap.style.textAlign = p.textCenter === false ? 'left' : 'center';
  requestAnimationFrame(() => {
    if (!scroller.animate) return;
    const sc = typeof p.scroll === 'string' ? { mode: p.scroll } : (p.scroll || {});
    const mode = sc.mode || 'wrap';
    const speed = sc.speed != null ? sc.speed : 100;
    const dir = sc.direction === 'right' ? -1 : 1;
    const whenFits = sc.whenFits || 'static';
    const T = scroller.offsetWidth;
    const W = wrap.clientWidth;
    if (mode === 'static' || speed <= 0 || !T) return;
    if (T <= W && whenFits !== 'scroll') return;
    const pxs = 60 * (speed / 100);

    if (mode === 'bounce' && T > W) {
      const dist = T - W;
      const move = (dist / pxs) * 1000;
      const hold = sc.holdMs != null ? sc.holdMs : 1000;
      const total = 2 * move + 2 * hold;
      const a = hold / total;
      const b = (hold + move) / total;
      const c = (2 * hold + move) / total;
      const end = -dist * dir;
      scrollAnim = scroller.animate([
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: a },
        { transform: `translateX(${end}px)`, offset: b },
        { transform: `translateX(${end}px)`, offset: c },
        { transform: 'translateX(0)', offset: 1 }
      ], { duration: total, iterations: Infinity, easing: 'linear' });
      return;
    }
    const gap = mode === 'loop' ? (sc.gap != null ? sc.gap : 8) : 0;
    const from = dir === 1 ? W : -T;
    const to = dir === 1 ? -(T + gap) : W + gap;
    const dur = ((T + W + gap) / pxs) * 1000;
    if (mode === 'wrap') {
      const split = (T / (T + W)) || 0.5;
      scrollAnim = scroller.animate([
        { transform: 'translateX(0)', offset: 0 },
        { transform: `translateX(${to}px)`, offset: split },
        { transform: `translateX(${from}px)`, offset: Math.min(split + 0.0001, 0.9999) },
        { transform: 'translateX(0)', offset: 1 }
      ], { duration: dur, iterations: Infinity, easing: 'linear' });
    } else {
      scrollAnim = scroller.animate([
        { transform: `translateX(${from}px)` },
        { transform: `translateX(${to}px)` }
      ], { duration: dur, iterations: Infinity, easing: 'linear' });
    }
  });

  // Hintergrund
  if (p.effect && EFFECT_BG[p.effect]) disp.style.background = EFFECT_BG[p.effect];
  else disp.style.background = p.backgroundColor || '#080a0c';

  // Icon
  if (p.icon) {
    icon.classList.remove('hide');
    icon.textContent = String(p.icon).substring(0, 4);
    icon.style.background = clr || '#5b8cff';
    icon.style.color = '#000';
  } else icon.classList.add('hide');

  // Fortschritt
  const pg = $('led-progress');
  if (p.progress != null) {
    pg.classList.remove('hide');
    pg.style.width = Math.max(0, Math.min(100, p.progress)) + '%';
    pg.style.background = p.progressColor || '#3ecf7a';
  } else pg.classList.add('hide');
}

// ── Wetter-Overlay (Canvas) ───────────────────────────────
let ovAnim = null; let ovCtx = null; let particles = [];
function stopOverlay() {
  if (ovAnim) { cancelAnimationFrame(ovAnim); ovAnim = null; }
  if (ovCtx) ovCtx.clearRect(0, 0, ovCtx.canvas.width, ovCtx.canvas.height);
  particles = [];
}
function startOverlay(type) {
  stopOverlay();
  if (!type) return;
  const canvas = $('ov-canvas');
  const display = $('led-display');
  canvas.width = display.offsetWidth;
  canvas.height = display.offsetHeight;
  ovCtx = canvas.getContext('2d');
  if (!ovCtx) return;
  const W = canvas.width; const H = canvas.height;
  const configs = {
    rain: { count: 60, size: 1.2, speedX: 1, speedY: 4, alpha: 0.7, trail: 3 },
    drizzle: { count: 35, size: 0.8, speedX: 0.5, speedY: 2.5, alpha: 0.5, trail: 2 },
    snow: { count: 50, size: 2, speedX: 0.3, speedY: 1.2, alpha: 0.9, trail: 0 },
    storm: { count: 80, size: 1, speedX: 3, speedY: 5, alpha: 0.8, trail: 4 },
    thunder: { count: 70, size: 1.1, speedX: 2, speedY: 4.5, alpha: 0.75, trail: 3 },
    frost: { count: 40, size: 2.5, speedX: 0.1, speedY: 0.5, alpha: 0.6, trail: 0 }
  };
  const cfg = configs[type] || configs.rain;
  particles = Array.from({ length: cfg.count }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * cfg.speedX + cfg.speedX * 0.5,
    vy: cfg.speedY * (0.7 + Math.random() * 0.6),
    a: cfg.alpha * (0.6 + Math.random() * 0.4),
    r: cfg.size * (0.7 + Math.random() * 0.6)
  }));
  let flash = 0;
  const flakes = type === 'snow' || type === 'frost';
  (function draw() {
    ovCtx.clearRect(0, 0, W, H);
    if (type === 'thunder') {
      flash++;
      if (flash > 120 && Math.random() < 0.02) { ovCtx.fillStyle = 'rgba(255,255,255,0.15)'; ovCtx.fillRect(0, 0, W, H); flash = 0; }
    }
    if (type === 'frost') { ovCtx.fillStyle = 'rgba(150,210,255,0.08)'; ovCtx.fillRect(0, 0, W, H); }
    particles.forEach((pt) => {
      if (flakes) {
        ovCtx.beginPath(); ovCtx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ovCtx.fillStyle = `rgba(255,255,255,${pt.a})`; ovCtx.fill();
      } else {
        ovCtx.beginPath(); ovCtx.moveTo(pt.x, pt.y);
        ovCtx.lineTo(pt.x - pt.vx * cfg.trail, pt.y - pt.vy * cfg.trail);
        ovCtx.strokeStyle = `rgba(68,170,255,${pt.a})`; ovCtx.lineWidth = pt.r; ovCtx.stroke();
      }
      pt.x += pt.vx * (type === 'storm' ? 1.8 : 1);
      pt.y += pt.vy;
      if (pt.y > H + 5) { pt.y = -5; pt.x = Math.random() * W; }
      if (pt.x > W + 5) pt.x = 0;
      if (pt.x < -5) pt.x = W;
    });
    ovAnim = requestAnimationFrame(draw);
  })();
}

// ── Migrator-UI ───────────────────────────────────────────
let migratedObj = null;

function liveConvert() {
  const raw = $('mig-input').value.trim();
  if (!raw) { clearMig(); return; }
  let obj;
  try { obj = Migrator.extractJson(raw); }
  catch (e) {
    const out = $('mig-output');
    out.textContent = '';
    const span = document.createElement('span');
    span.className = 'err-text';
    span.textContent = '❌ Kein gültiges JSON: ' + e.message;
    out.appendChild(span);
    $('mig-changes-wrap').classList.add('hide');
    migratedObj = null;
    return;
  }
  const { result, changes } = Migrator.migrate(obj, { isApp: S.migMode === 'app', dropUnknown: S.migDrop });
  migratedObj = result;
  $('mig-output').innerHTML = highlight(JSON.stringify(result, null, 2));
  renderChanges(changes);
}
function renderChanges(changes) {
  $('mig-changes-wrap').classList.remove('hide');
  const box = $('mig-changes');
  box.innerHTML = '';
  if (!changes.length) {
    box.innerHTML = '<div class="change-item ok">✓ Kein Anpassungsbedarf – Payload war schon NG-kompatibel</div>';
    return;
  }
  const icons = { rename: '⇄', removed: '🗑', warn: '⚠', ok: '✓' };
  changes.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'change-item ' + c.t;
    d.textContent = `${icons[c.t] || '·'} ${c.m}`;
    box.appendChild(d);
  });
}
function clearMig() {
  migratedObj = null;
  $('mig-output').innerHTML = '<span class="dim-text">← Payload einfügen, Konvertierung läuft live</span>';
  $('mig-changes-wrap').classList.add('hide');
}

// ── Update ────────────────────────────────────────────────
function update() {
  const p = buildPayload();
  $('json-out').innerHTML = highlight(JSON.stringify(p, null, 2));
  $('yaml-out').textContent = buildYAML(p);
  updatePreview(p);
}

// ── Init ──────────────────────────────────────────────────
(function init() {
  S.ip = params.get('ip') || LS.get(CONN_LS.ip, '');
  S.prefix = params.get('prefix') || LS.get(CONN_LS.prefix, 'Display');
  const embedded = params.get('embedded') === '1' || !!haBridge();
  S.transport = LS.get(CONN_LS.transport, embedded ? 'ha' : 'http');
  if (S.transport === 'ha' && !embedded) S.transport = 'http';

  buildSwatches();
  renderPresets();
  $('mig-input').addEventListener('input', liveConvert);
  clearMig();
  syncUI();
  update();
  setStatus('', embedded ? 'Home Assistant verbunden' : '—');
  window.addEventListener('resize', () => { if (S.overlay) startOverlay(S.overlay); update(); });
})();
