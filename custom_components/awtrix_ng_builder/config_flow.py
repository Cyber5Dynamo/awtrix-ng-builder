"""Config Flow für AWTRIX NG Builder."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    CONF_IP,
    CONF_PREFIX,
    CONF_TITLE,
    DEFAULT_IP,
    DEFAULT_PREFIX,
    DEFAULT_TITLE,
    DOMAIN,
)


def _schema(current: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_TITLE, default=current.get(CONF_TITLE, DEFAULT_TITLE)): str,
            vol.Required(CONF_PREFIX, default=current.get(CONF_PREFIX, DEFAULT_PREFIX)): str,
            vol.Optional(CONF_IP, default=current.get(CONF_IP, DEFAULT_IP)): str,
        }
    )


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Einrichtung – nur eine Instanz erlaubt."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="AWTRIX NG Builder", data=user_input)
        return self.async_show_form(step_id="user", data_schema=_schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return OptionsFlowHandler()


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Titel, MQTT-Präfix und Display-IP nachträglich ändern."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        current = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(step_id="init", data_schema=_schema(current))
