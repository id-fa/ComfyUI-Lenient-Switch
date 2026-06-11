import json

try:
    from comfy_execution.graph import ExecutionBlocker
except ImportError:
    ExecutionBlocker = None


class AnyType(str):
    def __ne__(self, other):
        return False

    def __eq__(self, other):
        return True

    def __hash__(self):
        return hash(str(self))


any_type = AnyType("*")

_NOT_PROVIDED = object()

SLOTS = ("a", "b", "c", "d", "e")


class LenientSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        pass_if_tooltip = (
            "Per-slot truthiness test (NOT a CONDITIONING input). "
            "When connected, this value decides whether the matching source_X is "
            "forwarded; if unconnected, source_X is tested against itself."
        )
        bypass_tooltip = (
            "When ON, slots whose pass_if_X is connected AND falsy are skipped "
            "WITHOUT evaluating their source_X, so that source's upstream chain "
            "does not run (lazy evaluation). Slots whose pass_if_X is unconnected "
            "are always evaluated (their winner can only be known at run time). "
            "Note: nodes are not visually bypassed like rgthree; they simply do "
            "not execute."
        )
        return {
            "required": {
                "source_a": (
                    any_type,
                    {
                        "tooltip": "Pass-through source for slot A (any type).",
                        "lazy": True,
                    },
                ),
                "treat_zero_as_false": ("BOOLEAN", {"default": True}),
                "treat_empty_string_as_false": ("BOOLEAN", {"default": True}),
                "evaluate_boolean": ("BOOLEAN", {"default": True}),
                "treat_empty_list_as_false": ("BOOLEAN", {"default": True}),
                "block_on_all_false": ("BOOLEAN", {"default": False}),
                "bypass_unselected": (
                    "BOOLEAN",
                    {"default": False, "tooltip": bypass_tooltip},
                ),
            },
            "optional": {
                "source_b": (
                    any_type,
                    {
                        "tooltip": "Optional pass-through source for slot B (any type).",
                        "lazy": True,
                    },
                ),
                "source_c": (
                    any_type,
                    {
                        "tooltip": "Optional pass-through source for slot C (any type).",
                        "lazy": True,
                    },
                ),
                "source_d": (
                    any_type,
                    {
                        "tooltip": "Optional pass-through source for slot D (any type).",
                        "lazy": True,
                    },
                ),
                "source_e": (
                    any_type,
                    {
                        "tooltip": "Optional pass-through source for slot E (any type).",
                        "lazy": True,
                    },
                ),
                "pass_if_a": (any_type, {"tooltip": pass_if_tooltip}),
                "pass_if_b": (any_type, {"tooltip": pass_if_tooltip}),
                "pass_if_c": (any_type, {"tooltip": pass_if_tooltip}),
                "pass_if_d": (any_type, {"tooltip": pass_if_tooltip}),
                "pass_if_e": (any_type, {"tooltip": pass_if_tooltip}),
            },
        }

    RETURN_TYPES = (any_type, "BOOLEAN")
    RETURN_NAMES = ("output", "matched")
    FUNCTION = "run"
    CATEGORY = "Lenient Switch"

    @staticmethod
    def _is_truthy(
        value, treat_zero, treat_empty_string, evaluate_boolean, treat_empty_list
    ):
        if value is None:
            return False

        if isinstance(value, bool):
            if evaluate_boolean:
                return bool(value)
            return True

        if isinstance(value, (int, float)):
            if treat_zero and value == 0:
                return False
            return True

        if isinstance(value, str):
            if treat_empty_string and len(value) == 0:
                return False
            return True

        if isinstance(value, (list, tuple)):
            if treat_empty_list and len(value) == 0:
                return False
            return True

        return True

    def check_lazy_status(
        self,
        treat_zero_as_false,
        treat_empty_string_as_false,
        evaluate_boolean,
        treat_empty_list_as_false,
        block_on_all_false,
        bypass_unselected,
        **kwargs,
    ):
        # All source_* are declared lazy. Returning a name asks ComfyUI to
        # evaluate that source's upstream; never returning it leaves the upstream
        # un-run (the "bypass" effect). Only connected sources appear in kwargs,
        # so we never request an unconnected slot.
        connected = [slot for slot in SLOTS if f"source_{slot}" in kwargs]
        if not bypass_unselected:
            return [f"source_{slot}" for slot in connected]

        needed = []
        for slot in connected:
            pass_if = kwargs.get(f"pass_if_{slot}", _NOT_PROVIDED)
            # Bypass only slots whose pass_if is connected AND falsy (guaranteed
            # losers). An unconnected pass_if means the condition is the source
            # itself, knowable only at run time, so that source must be evaluated.
            if pass_if is _NOT_PROVIDED or self._is_truthy(
                pass_if,
                treat_zero_as_false,
                treat_empty_string_as_false,
                evaluate_boolean,
                treat_empty_list_as_false,
            ):
                needed.append(f"source_{slot}")
        return needed

    def run(
        self,
        source_a,
        treat_zero_as_false,
        treat_empty_string_as_false,
        evaluate_boolean,
        treat_empty_list_as_false,
        block_on_all_false,
        bypass_unselected,
        **kwargs,
    ):
        sources = {
            "a": source_a,
            "b": kwargs.get("source_b", _NOT_PROVIDED),
            "c": kwargs.get("source_c", _NOT_PROVIDED),
            "d": kwargs.get("source_d", _NOT_PROVIDED),
            "e": kwargs.get("source_e", _NOT_PROVIDED),
        }
        conditions = {
            slot: kwargs.get(f"pass_if_{slot}", _NOT_PROVIDED) for slot in SLOTS
        }

        for slot in SLOTS:
            src = sources[slot]
            if src is _NOT_PROVIDED:
                continue

            cond = conditions[slot]
            test_value = src if cond is _NOT_PROVIDED else cond

            if self._is_truthy(
                test_value,
                treat_zero_as_false,
                treat_empty_string_as_false,
                evaluate_boolean,
                treat_empty_list_as_false,
            ):
                return (src, True)

        if block_on_all_false and ExecutionBlocker is not None:
            return (ExecutionBlocker(None), False)
        return (None, False)


_SELECT_CHOICES = ["none", "A", "B", "C", "D", "E"]


class SimpleSelectorSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        label_tooltip = (
            "Free-form per-slot memo (e.g. 'SDXL base'). Not used by the node."
        )

        def label_field(letter):
            return (
                "STRING",
                {
                    "default": "",
                    "multiline": False,
                    "placeholder": f"{letter} label (memo)",
                    "tooltip": label_tooltip,
                },
            )

        return {
            "required": {
                "select": (
                    _SELECT_CHOICES,
                    {
                        "default": "none",
                        "tooltip": (
                            "Pick which source to forward. 'none' forwards nothing "
                            "(see block_on_none_selected)."
                        ),
                    },
                ),
                "label_a": label_field("A"),
                "label_b": label_field("B"),
                "label_c": label_field("C"),
                "label_d": label_field("D"),
                "label_e": label_field("E"),
                "block_on_none_selected": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": (
                            "When 'none' is selected, emit ExecutionBlocker so downstream "
                            "nodes are skipped instead of receiving None."
                        ),
                    },
                ),
                "bypass_unselected": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": (
                            "When ON, only the selected slot's source_X is evaluated; the "
                            "upstream chains feeding the other (and, with 'none', all) "
                            "sources do not run (lazy evaluation). Note: nodes are not "
                            "visually bypassed like rgthree; they simply do not execute."
                        ),
                    },
                ),
            },
            "optional": {
                "source_a": (
                    any_type,
                    {"tooltip": "Source for slot A (any type).", "lazy": True},
                ),
                "source_b": (
                    any_type,
                    {"tooltip": "Source for slot B (any type).", "lazy": True},
                ),
                "source_c": (
                    any_type,
                    {"tooltip": "Source for slot C (any type).", "lazy": True},
                ),
                "source_d": (
                    any_type,
                    {"tooltip": "Source for slot D (any type).", "lazy": True},
                ),
                "source_e": (
                    any_type,
                    {"tooltip": "Source for slot E (any type).", "lazy": True},
                ),
            },
        }

    RETURN_TYPES = (any_type, "STRING")
    RETURN_NAMES = ("output", "label")
    FUNCTION = "run"
    CATEGORY = "Lenient Switch"

    def check_lazy_status(
        self, select, block_on_none_selected, bypass_unselected, **kwargs
    ):
        # source_* are lazy; only the names returned here get their upstream run.
        # Only connected sources appear in kwargs, so unconnected slots are never
        # requested.
        connected = [slot for slot in SLOTS if f"source_{slot}" in kwargs]
        if not bypass_unselected:
            return [f"source_{slot}" for slot in connected]
        if select == "none":
            return []
        slot = select.lower()
        return [f"source_{slot}"] if slot in connected else []

    def run(self, select, block_on_none_selected, bypass_unselected, **kwargs):
        if select == "none":
            if block_on_none_selected and ExecutionBlocker is not None:
                blocker = ExecutionBlocker(None)
                return (blocker, blocker)
            return (None, "")

        slot = select.lower()
        src = kwargs.get(f"source_{slot}", _NOT_PROVIDED)
        label = kwargs.get(f"label_{slot}", "")
        if src is _NOT_PROVIDED:
            return (None, label)
        return (src, label)


_SELECTOR_DEFAULT = json.dumps({"select": "none", "labels": ["", "", "", "", ""]})


class SimpleSelectorSwitchAdvanced:
    """SimpleSelectorSwitch reworked around a single custom selector widget.

    The frontend (`web/simple_selector_group_bypass.js`) registers a custom
    widget type **LENIENT_SELECTOR** via `getCustomWidgets` and renders the
    `selector` input as an exclusive-checkbox radio list (slots A-E plus
    `none`) with a per-slot editable label. The widget's value is a JSON string
    `{"select": "a".."e"|"none", "labels": [..5 strings..]}`; `run` and
    `check_lazy_status` parse it. This replaces the old per-slot `select` COMBO
    + `label_a`-`label_e` STRING widgets with ONE first-class custom widget, so
    the Vue (Nodes 2.0) renderer never disposes/rebuilds it away and there are no
    hidden widgets to hide. `RETURN_TYPES`/`RETURN_NAMES`/`FUNCTION`/`CATEGORY`
    are inherited from SimpleSelectorSwitch (same `(output, label)` outputs).

    `bypass_unselected_groups` is a JS-only toggle (rgthree FastGroupsBypasser-
    style group bypass keyed on the per-slot labels); Python ignores it. The
    plain SimpleSelectorSwitch stays pure Python with no frontend. See CLAUDE.md.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selector": (
                    "LENIENT_SELECTOR",
                    {
                        "default": _SELECTOR_DEFAULT,
                        "tooltip": (
                            "Exclusive-checkbox selector (slots A-E + none) with a "
                            "per-slot editable label. Click a row to select; "
                            "double-click a slot row to edit its label (the label "
                            "also names the canvas group for bypass_unselected_groups). "
                            'Value is JSON: {"select": ..., "labels": [..]}.'
                        ),
                    },
                ),
                "block_on_none_selected": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": (
                            "When 'none' is selected, emit ExecutionBlocker so downstream "
                            "nodes are skipped instead of receiving None."
                        ),
                    },
                ),
                "bypass_unselected": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": (
                            "When ON, only the selected slot's source_X is evaluated; the "
                            "upstream chains feeding the other (and, with 'none', all) "
                            "sources do not run (lazy evaluation). Note: nodes are not "
                            "visually bypassed like rgthree; they simply do not execute."
                        ),
                    },
                ),
                "bypass_unselected_groups": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": (
                            "JS-only, rgthree FastGroupsBypasser-style group bypass. When "
                            "ON, the canvas group whose name matches each slot's label is "
                            "set to BYPASS (mode 4) for every UNSELECTED slot and to ALWAYS "
                            "for the selected slot. Handled entirely by the frontend; the "
                            "Python run/check_lazy_status ignore this toggle. Orthogonal to "
                            "bypass_unselected (lazy eval). When OFF, referenced groups are "
                            "restored to ALWAYS."
                        ),
                    },
                ),
            },
            "optional": {
                "source_a": (
                    any_type,
                    {"tooltip": "Source for slot A (any type).", "lazy": True},
                ),
                "source_b": (
                    any_type,
                    {"tooltip": "Source for slot B (any type).", "lazy": True},
                ),
                "source_c": (
                    any_type,
                    {"tooltip": "Source for slot C (any type).", "lazy": True},
                ),
                "source_d": (
                    any_type,
                    {"tooltip": "Source for slot D (any type).", "lazy": True},
                ),
                "source_e": (
                    any_type,
                    {"tooltip": "Source for slot E (any type).", "lazy": True},
                ),
            },
        }

    RETURN_TYPES = (any_type, "STRING")
    RETURN_NAMES = ("output", "label")
    FUNCTION = "run"
    CATEGORY = "Lenient Switch"

    @staticmethod
    def _parse_selector(selector):
        """Parse the LENIENT_SELECTOR JSON value into (select, labels).

        `select` is lowercased to 'a'..'e'/'none'; `labels` is always a list of
        exactly 5 strings. Tolerates malformed/empty input (falls back to none).
        """
        try:
            data = json.loads(selector) if isinstance(selector, str) else selector
        except (ValueError, TypeError):
            data = None
        if not isinstance(data, dict):
            data = {}
        select = str(data.get("select", "none")).lower()
        labels = data.get("labels")
        if not isinstance(labels, list):
            labels = []
        labels = [str(x) for x in labels[:5]]
        labels += [""] * (5 - len(labels))
        return select, labels

    def check_lazy_status(
        self,
        selector,
        block_on_none_selected,
        bypass_unselected,
        bypass_unselected_groups,
        **kwargs,
    ):
        select, _ = self._parse_selector(selector)
        connected = [slot for slot in SLOTS if f"source_{slot}" in kwargs]
        if not bypass_unselected:
            return [f"source_{slot}" for slot in connected]
        if select == "none":
            return []
        return [f"source_{select}"] if select in connected else []

    def run(
        self,
        selector,
        block_on_none_selected,
        bypass_unselected,
        bypass_unselected_groups,
        **kwargs,
    ):
        select, labels = self._parse_selector(selector)
        if select == "none":
            if block_on_none_selected and ExecutionBlocker is not None:
                blocker = ExecutionBlocker(None)
                return (blocker, blocker)
            return (None, "")

        src = kwargs.get(f"source_{select}", _NOT_PROVIDED)
        label = labels[SLOTS.index(select)] if select in SLOTS else ""
        if src is _NOT_PROVIDED:
            return (None, label)
        return (src, label)


NODE_CLASS_MAPPINGS = {
    "LenientSwitch": LenientSwitch,
    "SimpleSelectorSwitch": SimpleSelectorSwitch,
    "SimpleSelectorSwitchAdvanced": SimpleSelectorSwitchAdvanced,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LenientSwitch": "Lenient Switch",
    "SimpleSelectorSwitch": "Simple Selector (Switch)",
    "SimpleSelectorSwitchAdvanced": "Simple Selector (Switch) Advanced",
}
