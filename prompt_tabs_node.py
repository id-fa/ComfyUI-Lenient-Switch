"""Prompt Tabs node.

A single text node that holds any number of named prompt tabs and forwards the
text of the currently-active tab. All tab content lives in the ``tabs_data``
widget (a JSON blob managed by ``web/prompt_tabs.js``); the visible ``text``
widget is the editor for the active tab. The active tab's name is re-emitted on
the ``label`` output. Python emits whatever the active editor currently holds
plus the active tab's name, so this node degrades to a plain text box (with an
empty label) if the frontend extension fails to load (e.g. on older ComfyUI).
"""

import json


class PromptTabs:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Editor for the active tab. The frontend swaps its contents
                # when you switch tabs; its value at run time IS the output.
                "text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "tooltip": "Text of the currently selected tab.",
                    },
                ),
                # Master store for every tab. Hidden and driven entirely by
                # web/prompt_tabs.js. Holds JSON: {"tabs": [{"name", "text"}],
                # "active": int}. Not meant to be edited by hand.
                "tabs_data": (
                    "STRING",
                    {
                        "default": "",
                        "tooltip": "Internal tab storage (managed by the UI).",
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "label")
    FUNCTION = "run"
    CATEGORY = "utils"

    @staticmethod
    def _active_label(tabs_data):
        # Pull the active tab's name out of the JSON the frontend maintains.
        # Any malformed/missing data degrades to an empty label.
        try:
            data = json.loads(tabs_data) if tabs_data else None
        except (ValueError, TypeError):
            return ""
        if not isinstance(data, dict):
            return ""
        tabs = data.get("tabs")
        active = data.get("active", 0)
        if not isinstance(tabs, list) or not isinstance(active, int):
            return ""
        if not (0 <= active < len(tabs)):
            return ""
        name = tabs[active].get("name") if isinstance(tabs[active], dict) else None
        return name if isinstance(name, str) else ""

    def run(self, text, tabs_data):
        return (text, self._active_label(tabs_data))


NODE_CLASS_MAPPINGS = {
    "PromptTabs": PromptTabs,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptTabs": "Prompt Tabs",
}
