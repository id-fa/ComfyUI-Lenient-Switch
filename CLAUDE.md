# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A small ComfyUI custom node package containing three switch nodes:

- `LenientSwitch` — picks the first slot (A–E) whose **per-slot condition** is truthy. The condition input is decoupled from the pass-through source. See `README.md` for the user-facing spec.
- `SimpleSelectorSwitch` — picks the source explicitly chosen via a `select` dropdown (`none / A / B / C / D / E`). Carries five single-line `label_a`–`label_e` fields as per-slot memos, and re-emits the chosen slot's label as a second `STRING` output.
- `SimpleSelectorSwitchAdvanced` — subclass of `SimpleSelectorSwitch` with **identical server-side behavior** plus one extra `bypass_unselected_groups` toggle that is acted on **only by a frontend JS extension** (`web/simple_selector_group_bypass.js`), rgthree-FastGroupsBypasser-style. This is the **only** node in the package with any frontend.

The package is registered with ComfyUI via the standard `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS` exports in `__init__.py`. It has **no Python dependencies** (`pyproject.toml` lists none beyond dev tooling). `LenientSwitch` and `SimpleSelectorSwitch` are pure Python with **no frontend JS** (`SimpleSelectorSwitch` uses ComfyUI's stock COMBO widget); only `SimpleSelectorSwitchAdvanced` ships JS, served via `WEB_DIRECTORY = "./web"` in `__init__.py`.

> **Note:** `PromptTabs` (a notepad-style multi-tab prompt node) used to live here in `prompt_tabs_node.py` + `web/prompt_tabs.js`. It was moved to **ComfyUI-PromptPalette-F** on 2026-06-03 and removed from this package.

## Architecture notes

Both nodes live in `lenient_switch_node.py` and share `AnyType`/`any_type`, the `_NOT_PROVIDED` sentinel, and the `ExecutionBlocker` try/except import. Several pieces are non-obvious and easy to break:

- **`AnyType` wildcard trick.** `RETURN_TYPES` uses `any_type` — an `str` subclass with `__eq__` always True and `__ne__` always False so ComfyUI's type checker accepts any upstream/downstream type. Do not "simplify" this to a plain `"*"` string; the equality overrides are what defeats the type check.
- **`ExecutionBlocker` is imported under try/except.** `from comfy_execution.graph import ExecutionBlocker` only resolves at ComfyUI runtime (Pyright will flag it as unresolved — that is expected). Both `block_on_all_false` (LenientSwitch) and `block_on_none_selected` (SimpleSelectorSwitch) silently become no-ops if the import fails, so the nodes degrade gracefully on older ComfyUI versions.

- **Lazy `source_*` + `bypass_unselected` toggle.** Both nodes declare every `source_*` with `"lazy": True` and implement `check_lazy_status`, which returns the list of source input names whose upstream ComfyUI should evaluate. A source name *not* returned means its upstream subgraph **is not executed** — this is the "bypass" the `bypass_unselected` toggle provides (ComfyUI-native lazy eval, *not* an rgthree-style `mode=4` change; there is still no JS). When the toggle is OFF, `check_lazy_status` returns every connected source, reproducing the original eager behavior exactly, so OFF is a true no-op. Key invariants:
  - `check_lazy_status` only requests sources whose key is present in `kwargs` (`f"source_{slot}" in kwargs`). Unconnected optional inputs are absent from `kwargs`, so this never asks ComfyUI to evaluate an unconnected slot — do not drop this guard or the OFF path may request phantom inputs.
  - The toggle and `pass_if_*` are **eager** (not lazy), so they are available inside `check_lazy_status`; only `source_*` are lazy. Keep it that way — the bypass decision for LenientSwitch is made purely from the `pass_if_*` values.
  - A bypassed source arrives in `run` as `None` (the key is present), whereas an unconnected source is absent (`_NOT_PROVIDED`). `run` is unchanged and relies on this distinction. It stays correct because a slot is only bypassed when it is a *guaranteed loser*, so its `None` value can never be selected — see the LenientSwitch rule below. Do not change `run` to treat a bypassed `None` as a win.

### LenientSwitch specifics

Slot iteration: sources are tested in fixed order `A → B → C → D → E`. C/D/E are optional sources — if the source itself is not connected, the slot is skipped entirely (its condition is irrelevant). If the source is connected but its `pass_if_X` is not, the source value is used as its own condition. The `_NOT_PROVIDED` sentinel distinguishes "not connected" from a legitimately-passed `None`.

The per-slot condition inputs are named **`pass_if_a`–`pass_if_e`**, not `condition_*`. This is deliberate: `condition` collides verbally with ComfyUI's `CONDITIONING` data type (encoded prompts), so the inputs were renamed to disambiguate. They also carry a `tooltip` that explicitly states "NOT a CONDITIONING input". Keep this naming — do not revert to `condition_*`. Note ComfyUI uses the `INPUT_TYPES` dict key as the socket label (there is no input-side equivalent of `RETURN_NAMES`), so the key name *is* the user-facing label; renaming touches the key, `run`'s `kwargs.get(f"pass_if_{slot}", ...)` lookup, and `README.md` together.

Truthy evaluation in `_is_truthy` checks `bool` **before** `int`/`float` because `isinstance(True, int)` is True in Python — reordering will break the `evaluate_boolean` toggle.

`bypass_unselected` rule (LenientSwitch): a slot's `source_X` is skipped **only** when its `pass_if_X` is connected *and* falsy — those slots can never win regardless of any earlier slot's outcome, so skipping them is always safe and order-independent. A slot with an *unconnected* `pass_if_X` is never bypassed: its condition is the source value itself, knowable only after the source runs (the user explicitly asked for this — judging bypass on `source_X` would be meaningless execution-order-wise). Do not try to be cleverer (e.g. "first truthy slot wins, skip the rest"): a not-connected `pass_if` slot earlier in A→E order could preempt a later connected-truthy slot, and that can only be resolved at run time. The conservative "skip connected-falsy slots only" rule is what keeps `check_lazy_status` correct without iterating.

### SimpleSelectorSwitch specifics

Source selection is a single COMBO widget over `_SELECT_CHOICES = ["none", "A", "B", "C", "D", "E"]`. The dropdown is used instead of five BOOLEAN toggles because ComfyUI has no native radio-button widget — the combo gives "exactly one, or none" semantics natively without any JS. Choices are uppercase A–E for UI readability; `run` lowercases the choice before looking up `source_{slot}`. If you add or rename a choice, update both `_SELECT_CHOICES` and the lookup.

`label_a`–`label_e` are single-line STRING widgets (`multiline: False`, with `placeholder`) intended as per-slot memos. `run` reads only the label that matches the current `select` and re-emits it on the second output (`label`); the other four are still absorbed into `**kwargs` unused. The label is **not** used for any flow-control decision — making the COMBO choices themselves match instance-level strings would require a JS widget (this was the explicit reason we picked the combo+memo design over per-instance dynamic labels). Do not change `run` to dispatch on label contents.

`block_on_none_selected` only fires when `select == "none"`. When it fires, **both** outputs are set to the same `ExecutionBlocker` instance — the intent is to stop the whole downstream subgraph (including any label-consuming branch like a filename builder), not just the value branch. If the user picks a slot whose `source_X` happens to be unconnected, the node returns `(None, label)` rather than blocking — this matches the spec ("blocks when **nothing is selected**", not "blocks when the selected slot is missing"). Do not extend the blocker to cover the missing-source case without a spec change.

All five `source_a`–`source_e` are in `optional`, not `required`: the whole point of this node is that you wire only the slots you care about.

`bypass_unselected` here is simpler than LenientSwitch's: `check_lazy_status` requests only `source_{select}` (or nothing when `select == "none"`), so the unselected slots' upstream chains don't run. `run` is unchanged — it only ever reads the selected slot's source, so bypassed slots arriving as `None` are never consumed. Note this is orthogonal to `block_on_none_selected`: bypass controls *which upstream runs*, the blocker controls *what the outputs emit*; with `select == "none"` and both ON, all sources are bypassed **and** both outputs carry the `ExecutionBlocker`.

Pyright note: the COMBO `select` entry (`(_SELECT_CHOICES, {...})`) makes Pyright infer the `required` dict as `dict[str, tuple[list[str], dict[str, str]]]`. Mixing in `("STRING", {...})` or `("BOOLEAN", {...})` entries via subsequent assignment / `update()` then triggers `reportArgumentType`. To avoid this, build `required` as one dict literal (current code does this; the `label_field` helper returns a tuple that's only inserted inline) — do not refactor it into a loop that mutates the dict.

### SimpleSelectorSwitchAdvanced specifics

`SimpleSelectorSwitchAdvanced` is a **standalone class** (no longer subclasses `SimpleSelectorSwitch` — its `run`/`check_lazy_status` signatures differ, which tripped Pyright's `reportIncompatibleMethodOverride`). It declares its own `RETURN_TYPES = (any_type, "STRING")` / `RETURN_NAMES = ("output", "label")` / `FUNCTION` / `CATEGORY`.

The big idea: instead of a stock `select` COMBO + five `label_*` STRING widgets, it has **one custom widget**. `INPUT_TYPES` declares a single `selector` input of custom type **`LENIENT_SELECTOR`**; the rest is `block_on_none_selected` / `bypass_unselected` / `bypass_unselected_groups` (BOOLEAN) and the optional lazy `source_a`–`source_e`.

- **The selector value is a JSON string** `{"select": "a".."e"|"none", "labels": [..5 strings..]}`. `_parse_selector` decodes it (lowercases `select`, pads labels to exactly 5, tolerates malformed/empty → `none`). `run` and `check_lazy_status` both parse it; otherwise their logic mirrors `SimpleSelectorSwitch` (forward `source_{select}`, re-emit that slot's label, block only on `select == "none"`). The `labels` double as canvas group names for the JS group bypass. `bypass_unselected_groups` is **JS-only** — Python receives it and ignores it.
- **Why this shape.** The earlier design kept the stock `select`/`label_*` widgets and hid them, then layered a custom radio on top. In the **Vue / Nodes-2.0 renderer** (`Comfy.VueNodes.Enabled`) that fought the framework constantly: Vue renders every widget in `node.widgets` as its own ≥24px row (ignoring `hidden`/`computeSize`), disposes runtime-added `serialize:false` widgets on rebuild, recycles per-widget canvases, etc. Folding everything into ONE first-class custom widget removes all of that — there are no hidden widgets, no row-hiding, no re-add/observer/sweep hacks, no serialize shim. If you are tempted to split the labels back into separate inputs, re-read this paragraph first.

- **The JS extension (`web/simple_selector_group_bypass.js`).** Registered for `SimpleSelectorSwitchAdvanced` only. It does two things:

  **(a) The `LENIENT_SELECTOR` custom widget (via `getCustomWidgets`).** The extension's `getCustomWidgets()` returns `{ LENIENT_SELECTOR(node, inputName, inputData) { ...; node.addCustomWidget(widget); return { widget }; } }`. Returning `{ widget }` *after* adding it yourself is the ComfyUI contract (mirrors `addDOMWidget`-based examples — the caller does NOT re-add). Because it comes from `getCustomWidgets`, ComfyUI treats it as a declared input widget and **Vue keeps it across rebuilds** (the whole reason for the rewrite). The widget (`type: "lenient_selector"`) canvas-draws six rows (A–E + `none`), reads/writes its own `value` as JSON via `parseValue`/`stringifyValue`, and serializes that JSON straight to Python — no shift, no hidden widgets. Click handling, debugged live in BOTH renderers, must stay:
    - **Hit-testing uses `widget.y`** (node-relative, set by `arrangeWidgets`), NOT `last_y` (undefined in Vue) and NOT the `y` passed to `draw` (a per-widget-canvas-local ≈0 offset in Vue). The click `pos` (classic `mouse`) and `canvas.graph_mouse` (`onPointerDown`) are node-relative → subtract `widget.y` (see `rowAtNodeY`).
    - **Two click paths.** Classic litegraph calls `widget.onPointerDown` first (wire `pointer.onClick`/`onDoubleClick`; CanvasPointer fires one, never both). Vue forwards to `widget.mouse` with reliable node-relative coords on **pointer UP** → `mouse` acts on `pointerup`/`mouseup`/`click` (double-click via `event.timeStamp` < `DOUBLE_CLICK_MS`). Keep both.
    - **Repaint via `widget.triggerDraw()`** in Vue (the shared `setDirtyCanvas` does not repaint a per-widget canvas); classic uses `setDirtyCanvas`. `redraw()` calls both.
    - Double-clicking a slot row edits that label via `app.canvas.prompt`; `none` has no label. All writes go through `setSelection`/`editLabel` → `commitValue`, which sets the JSON `value`, calls `widget.callback(value)` (the framework notify — marks the workflow dirty and is ComfyUI's hook to sync a second rendering of the widget), then `applyGroupBypass` + `redraw` (`triggerDraw` for the Vue per-widget canvas + `setDirtyCanvas`).
    - **Known limitation (dual render).** Vue renders the widget in BOTH the node body and the properties panel (when the node is selected). `triggerDraw` repaints only one canvas, so changing the selection while both are visible can leave the node-body canvas briefly stale until it next repaints (click, move, reload). Normal use (panel closed) and load both render correctly. There's no widget API to force-repaint every rendering; `widget.callback` is the closest. Don't add hacks for this without a real fix.

  **(b) rgthree FastGroupsBypasser-style group bypass.** Reads `{select, labels}` from the selector widget. Each non-empty label is a **canvas group name**: the selected slot's group → ALWAYS (mode 0), every unselected slot's group → BYPASS (mode 4); with `none`, all referenced groups → BYPASS; toggle OFF → all ALWAYS. Edits *other nodes'* `mode` (not lazy eval) — orthogonal to `bypass_unselected`. Invariants:
    - BYPASS is applied **before** ALWAYS so a node shared between the selected and an unselected group ends up enabled (selected wins).
    - The selector node itself is never bypassed (`if (n === node) continue`).
    - Triggers: `setSelection`/`editLabel`, the wrapped `bypass_unselected_groups` callback, and `afterConfigureGraph` (load). Group membership is **spatial** (`recomputeInsideNodes()`), so structural group edits only re-apply on the next selection/label change — documented in README, not a bug.

> **Server restart required after Python `INPUT_TYPES` changes** — a browser reload only reloads the JS; ComfyUI caches the node's input schema until the server restarts. Changing the `selector` input is also a **breaking change** for workflows saved with the old (select + label_a–e) Advanced node: their `widgets_values` won't line up, so re-set the selector after loading.

## Commands

Lint/format:

```bash
ruff check .
ruff format .
```

There are no tests yet.

To exercise the nodes, drop the repo into `ComfyUI/custom_nodes/` and restart ComfyUI — there is no separate build step.
