# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A small ComfyUI custom node package containing two switch nodes:

- `LenientSwitch` — picks the first slot (A–E) whose **per-slot condition** is truthy. The condition input is decoupled from the pass-through source. See `README.md` for the user-facing spec.
- `SimpleSelectorSwitch` — picks the source explicitly chosen via a `select` dropdown (`none / A / B / C / D / E`). Carries five single-line `label_a`–`label_e` fields as per-slot memos, and re-emits the chosen slot's label as a second `STRING` output.

The package is registered with ComfyUI via the standard `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS` exports in `__init__.py`. It has **no Python dependencies** (`pyproject.toml` lists none beyond dev tooling) and ships **no frontend JS** — both nodes are pure Python (`SimpleSelectorSwitch` uses ComfyUI's stock COMBO widget).

> **Note:** `PromptTabs` (a notepad-style multi-tab prompt node) used to live here in `prompt_tabs_node.py` + `web/prompt_tabs.js`. It was moved to **ComfyUI-PromptPalette-F** on 2026-06-03 and removed from this package.

## Architecture notes

Both nodes live in `lenient_switch_node.py` and share `AnyType`/`any_type`, the `_NOT_PROVIDED` sentinel, and the `ExecutionBlocker` try/except import. Several pieces are non-obvious and easy to break:

- **`AnyType` wildcard trick.** `RETURN_TYPES` uses `any_type` — an `str` subclass with `__eq__` always True and `__ne__` always False so ComfyUI's type checker accepts any upstream/downstream type. Do not "simplify" this to a plain `"*"` string; the equality overrides are what defeats the type check.
- **`ExecutionBlocker` is imported under try/except.** `from comfy_execution.graph import ExecutionBlocker` only resolves at ComfyUI runtime (Pyright will flag it as unresolved — that is expected). Both `block_on_all_false` (LenientSwitch) and `block_on_none_selected` (SimpleSelectorSwitch) silently become no-ops if the import fails, so the nodes degrade gracefully on older ComfyUI versions.

### LenientSwitch specifics

Slot iteration: sources are tested in fixed order `A → B → C → D → E`. C/D/E are optional sources — if the source itself is not connected, the slot is skipped entirely (its condition is irrelevant). If the source is connected but its `pass_if_X` is not, the source value is used as its own condition. The `_NOT_PROVIDED` sentinel distinguishes "not connected" from a legitimately-passed `None`.

The per-slot condition inputs are named **`pass_if_a`–`pass_if_e`**, not `condition_*`. This is deliberate: `condition` collides verbally with ComfyUI's `CONDITIONING` data type (encoded prompts), so the inputs were renamed to disambiguate. They also carry a `tooltip` that explicitly states "NOT a CONDITIONING input". Keep this naming — do not revert to `condition_*`. Note ComfyUI uses the `INPUT_TYPES` dict key as the socket label (there is no input-side equivalent of `RETURN_NAMES`), so the key name *is* the user-facing label; renaming touches the key, `run`'s `kwargs.get(f"pass_if_{slot}", ...)` lookup, and `README.md` together.

Truthy evaluation in `_is_truthy` checks `bool` **before** `int`/`float` because `isinstance(True, int)` is True in Python — reordering will break the `evaluate_boolean` toggle.

### SimpleSelectorSwitch specifics

Source selection is a single COMBO widget over `_SELECT_CHOICES = ["none", "A", "B", "C", "D", "E"]`. The dropdown is used instead of five BOOLEAN toggles because ComfyUI has no native radio-button widget — the combo gives "exactly one, or none" semantics natively without any JS. Choices are uppercase A–E for UI readability; `run` lowercases the choice before looking up `source_{slot}`. If you add or rename a choice, update both `_SELECT_CHOICES` and the lookup.

`label_a`–`label_e` are single-line STRING widgets (`multiline: False`, with `placeholder`) intended as per-slot memos. `run` reads only the label that matches the current `select` and re-emits it on the second output (`label`); the other four are still absorbed into `**kwargs` unused. The label is **not** used for any flow-control decision — making the COMBO choices themselves match instance-level strings would require a JS widget (this was the explicit reason we picked the combo+memo design over per-instance dynamic labels). Do not change `run` to dispatch on label contents.

`block_on_none_selected` only fires when `select == "none"`. When it fires, **both** outputs are set to the same `ExecutionBlocker` instance — the intent is to stop the whole downstream subgraph (including any label-consuming branch like a filename builder), not just the value branch. If the user picks a slot whose `source_X` happens to be unconnected, the node returns `(None, label)` rather than blocking — this matches the spec ("blocks when **nothing is selected**", not "blocks when the selected slot is missing"). Do not extend the blocker to cover the missing-source case without a spec change.

All five `source_a`–`source_e` are in `optional`, not `required`: the whole point of this node is that you wire only the slots you care about.

Pyright note: the COMBO `select` entry (`(_SELECT_CHOICES, {...})`) makes Pyright infer the `required` dict as `dict[str, tuple[list[str], dict[str, str]]]`. Mixing in `("STRING", {...})` or `("BOOLEAN", {...})` entries via subsequent assignment / `update()` then triggers `reportArgumentType`. To avoid this, build `required` as one dict literal (current code does this; the `label_field` helper returns a tuple that's only inserted inline) — do not refactor it into a loop that mutates the dict.

## Commands

Lint/format:

```bash
ruff check .
ruff format .
```

There are no tests yet.

To exercise the nodes, drop the repo into `ComfyUI/custom_nodes/` and restart ComfyUI — there is no separate build step.
