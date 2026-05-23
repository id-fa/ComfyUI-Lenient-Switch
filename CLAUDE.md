# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A single-node ComfyUI custom node package. `LooseSwitch` routes any value through a switch where the **condition is decoupled from the pass-through source** — each slot (A–E) has its own optional condition input. See `README.md` for the user-facing spec.

The package is registered with ComfyUI via the standard `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS` re-export from `__init__.py`. It has **no Python dependencies** (`pyproject.toml` lists none beyond dev tooling) and **no frontend** — it is pure Python that runs inside ComfyUI's process.

## Architecture notes

All node logic lives in `loose_switch_node.py`. Two pieces are non-obvious and easy to break:

- **`AnyType` wildcard trick.** `RETURN_TYPES = (any_type, "BOOLEAN")` and most inputs use `any_type` — an `str` subclass with `__eq__` always True and `__ne__` always False so ComfyUI's type checker accepts any upstream/downstream type. Do not "simplify" this to a plain `"*"` string; the equality overrides are what defeats the type check.
- **`ExecutionBlocker` is imported under try/except.** `from comfy_execution.graph import ExecutionBlocker` only resolves at ComfyUI runtime (Pyright will flag it as unresolved — that is expected). The `block_on_all_false` toggle is silently a no-op if the import fails, so the node degrades gracefully on older ComfyUI versions.

Slot iteration: sources are tested in fixed order `A → B → C → D → E`. C/D/E are optional sources — if the source itself is not connected, the slot is skipped entirely (its condition is irrelevant). If the source is connected but the condition is not, the source value is used as its own condition. The `_NOT_PROVIDED` sentinel distinguishes "not connected" from a legitimately-passed `None`.

Truthy evaluation in `_is_truthy` checks `bool` **before** `int`/`float` because `isinstance(True, int)` is True in Python — reordering will break the `evaluate_boolean` toggle.

## Commands

Lint/format:

```bash
ruff check .
ruff format .
```

There are no tests yet.

To exercise the node, drop the repo into `ComfyUI/custom_nodes/` and restart ComfyUI — there is no separate build step.
