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


class LooseSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source_a": (any_type,),
                "source_b": (any_type,),
                "treat_zero_as_false": ("BOOLEAN", {"default": True}),
                "treat_empty_string_as_false": ("BOOLEAN", {"default": True}),
                "evaluate_boolean": ("BOOLEAN", {"default": True}),
                "treat_empty_list_as_false": ("BOOLEAN", {"default": True}),
                "block_on_all_false": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "source_c": (any_type,),
                "source_d": (any_type,),
                "source_e": (any_type,),
                "condition_a": (any_type,),
                "condition_b": (any_type,),
                "condition_c": (any_type,),
                "condition_d": (any_type,),
                "condition_e": (any_type,),
            },
        }

    RETURN_TYPES = (any_type, "BOOLEAN")
    RETURN_NAMES = ("output", "matched")
    FUNCTION = "run"
    CATEGORY = "utils"

    @staticmethod
    def _is_truthy(value, treat_zero, treat_empty_string, evaluate_boolean, treat_empty_list):
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
        source_b,
        treat_zero_as_false,
        treat_empty_string_as_false,
        evaluate_boolean,
        treat_empty_list_as_false,
        block_on_all_false,
        **kwargs,
    ):
        sources = {
            "a": source_a,
            "b": source_b,
            "c": kwargs.get("source_c", _NOT_PROVIDED),
            "d": kwargs.get("source_d", _NOT_PROVIDED),
            "e": kwargs.get("source_e", _NOT_PROVIDED),
        }
        conditions = {slot: kwargs.get(f"condition_{slot}", _NOT_PROVIDED) for slot in SLOTS}

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


NODE_CLASS_MAPPINGS = {
    "LooseSwitch": LooseSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LooseSwitch": "Loose Switch",
}
