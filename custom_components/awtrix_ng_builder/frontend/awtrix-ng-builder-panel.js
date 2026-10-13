/* Sidebar-Panel: bettet den Builder per iframe ein und stellt ihm
 * den Home-Assistant-Service-Aufruf (mqtt.publish) zur Verfügung. */
const BASE = new URL('.', import.meta.url);
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';

class AwtrixNgBuilderPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._cfg = {};
    this._narrow = false;
    this._frame = null;
    this._bar = null;
    this._menu = null;
  }

  connectedCallback() {
    window.awtrixNgBuilder = {
      _owner: this,
      callService: (domain, service, data) => this._hass.callService(domain, service, data),
    };
    this._build();
  }

  disconnectedCallback() {
    if (window.awtrixNgBuilder && window.awtrixNgBuilder._owner === this) {
      delete window.awtrixNgBuilder;
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (this._menu) this._menu.hass = hass;
  }

  set panel(panel) {
    this._cfg = (panel && panel.config) || {};
    this._build();
  }

  set narrow(narrow) {
    this._narrow = !!narrow;
    if (this._bar) this._bar.style.display = this._narrow ? 'flex' : 'none';
    if (this._menu) this._menu.narrow = this._narrow;
  }

  _build() {
    if (!this.isConnected) return;
    if (!this._frame) {
      // Feste Viewport-Höhe: HA gibt Custom-Panels keine Höhe vor, sonst fällt das iframe auf ~150px zurück
      this.style.cssText = 'display:flex;flex-direction:column;width:100%;box-sizing:border-box;' +
        'height:100vh;height:100dvh;min-height:400px;overflow:hidden;' +
        'background:var(--primary-background-color,#0c0e14)';

      this._bar = document.createElement('div');
      this._bar.style.cssText = 'display:none;align-items:center;gap:8px;height:56px;padding:0 8px;' +
        'background:var(--app-header-background-color,#151821);color:var(--app-header-text-color,#fff);flex-shrink:0';
      this._menu = document.createElement('ha-menu-button');
      this._menu.hass = this._hass;
      this._menu.narrow = this._narrow;
      const title = document.createElement('span');
      title.textContent = 'AWTRIX Builder';
      title.style.fontSize = '18px';
      this._bar.append(this._menu, title);
      this._bar.style.display = this._narrow ? 'flex' : 'none';

      this._frame = document.createElement('iframe');
      this._frame.style.cssText = 'flex:1 1 auto;width:100%;height:100%;border:0;display:block;min-height:0';
      this._frame.setAttribute('allow', 'clipboard-write');
      this.append(this._bar, this._frame);
    }
    const url = new URL('index.html', BASE);
    url.searchParams.set('embedded', '1');
    if (this._cfg.mqtt_prefix) url.searchParams.set('prefix', this._cfg.mqtt_prefix);
    if (this._cfg.display_ip) url.searchParams.set('ip', this._cfg.display_ip);
    if (VERSION) url.searchParams.set('v', VERSION);
    if (this._frame.src !== url.href) this._frame.src = url.href;
  }
}

if (!customElements.get('awtrix-ng-builder-panel')) {
  customElements.define('awtrix-ng-builder-panel', AwtrixNgBuilderPanel);
}
