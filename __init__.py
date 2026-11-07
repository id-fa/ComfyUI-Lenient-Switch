from .lenient_switch_node import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)

# Serves web/: SimpleSelectorSwitchAdvanced's frontend extension
# (simple_selector_group_bypass.js) and the frontend-only Group Bypass Toggle
# node (group_bypass_toggle.js, no Python class). The plain switch nodes ship no JS.
WEB_DIRECTORY = "./web"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
