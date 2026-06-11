from .lenient_switch_node import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)

# Serves web/ so SimpleSelectorSwitchAdvanced's frontend extension
# (simple_selector_group_bypass.js) loads. The plain switch nodes ship no JS.
WEB_DIRECTORY = "./web"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
