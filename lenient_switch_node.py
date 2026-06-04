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
        return {
            "required": {
                "source_a": (
                    any_type,
                    {"tooltip": "Pass-through source for slot A (any type)."},
                ),
                "treat_zero_as_false": ("BOOLEAN", {"default": True}),
                "treat_empty_string_as_false": ("BOOLEAN", {"default": True}),
                "evaluate_boolean": ("BOOLEAN", {"default": True}),
                "treat_empty_list_as_false": ("BOOLEAN", {"default": True}),
                "block_on_all_false": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "source_b": (
                    any_type,
                    {"tooltip": "Optional pass-through source for slot B (any type)."},
                ),
                "source_c": (
                    any_type,
                    {"tooltip": "Optional pass-through source for slot C (any type)."},
                ),
                "source_d": (
                    any_type,
                    {"tooltip": "Optional pass-through source for slot D (any type)."},
                ),
                "source_e": (
                    any_type,
                    {"tooltip": "Optional pass-through source for slot E (any type)."},
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

    def run(
        self,
        source_a,
        treat_zero_as_false,
        treat_empty_string_as_false,
        evaluate_boolean,
        treat_empty_list_as_false,
        block_on_all_false,
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
            },
            "optional": {
                "source_a": (any_type, {"tooltip": "Source for slot A (any type)."}),
                "source_b": (any_type, {"tooltip": "Source for slot B (any type)."}),
                "source_c": (any_type, {"tooltip": "Source for slot C (any type)."}),
                "source_d": (any_type, {"tooltip": "Source for slot D (any type)."}),
                "source_e": (any_type, {"tooltip": "Source for slot E (any type)."}),
            },
        }

    RETURN_TYPES = (any_type, "STRING")
    RETURN_NAMES = ("output", "label")
    FUNCTION = "run"
    CATEGORY = "Lenient Switch"

    def run(self, select, block_on_none_selected, **kwargs):
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


NODE_CLASS_MAPPINGS = {
    "LenientSwitch": LenientSwitch,
    "SimpleSelectorSwitch": SimpleSelectorSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LenientSwitch": "Lenient Switch",
    "SimpleSelectorSwitch": "Simple Selector (Switch)",
}
