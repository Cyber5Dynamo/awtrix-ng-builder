"""AWTRIX NG Builder – Payload-Builder und Migrator als Sidebar-Panel."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import (
    CONF_IP,
    CONF_PREFIX,
    CONF_TITLE,
    DEFAULT_IP,
    DEFAULT_PREFIX,
    DEFAULT_TITLE,
    DOMAIN,
    PANEL_PATH,
    URL_BASE,
    WEBCOMPONENT,
)

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Frontend-Dateien einmalig als statischen Pfad bereitstellen."""
    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(frontend_dir), False)]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Sidebar-Panel registrieren."""
    options = {**entry.data, **entry.options}
    integration = await async_get_integration(hass, DOMAIN)
    version = str(integration.version)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name=WEBCOMPONENT,
        sidebar_title=options.get(CONF_TITLE, DEFAULT_TITLE),
        sidebar_icon="mdi:led-strip-variant",
        module_url=f"{URL_BASE}/awtrix-ng-builder-panel.js?v={version}",
        embed_iframe=False,
        require_admin=False,
        config={
            "mqtt_prefix": options.get(CONF_PREFIX, DEFAULT_PREFIX),
            "display_ip": options.get(CONF_IP, DEFAULT_IP),
            "version": version,
        },
    )

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Panel entfernen."""
    frontend.async_remove_panel(hass, PANEL_PATH)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Bei geänderten Optionen neu laden."""
    await hass.config_entries.async_reload(entry.entry_id)
