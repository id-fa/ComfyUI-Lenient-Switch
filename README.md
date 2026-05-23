# Loose Switch

A ComfyUI custom node that lets you **route any value through a switch while specifying the condition separately from the pass-through source**.

Most switch nodes force you to choose a slot based on the same value you forward downstream. Loose Switch decouples those: each slot has its own optional *condition* input. If a condition is connected, it decides whether that slot wins; if not, the source itself is used for the test. This makes it easy to gate one signal on the truthiness of another (e.g. "forward the image when the mask is non-empty", "pick a prompt based on a flag").

![Example1](docs/screenshot1.png)

![Example2](docs/screenshot2.png)

## Node

- Category: `utils`
- Display name: `Loose Switch`
- Class: `LooseSwitch`

### Inputs

| Slot | Required | Purpose |
| --- | --- | --- |
| `source_a`, `source_b` | yes | Pass-through sources (any type) |
| `source_c`, `source_d`, `source_e` | no | Additional pass-through sources |
| `condition_a` … `condition_e` | no | Per-slot truthiness test. If unconnected, the matching `source_X` is used as the condition |

Toggles (required):

| Toggle | Default | Effect when ON |
| --- | --- | --- |
| `treat_zero_as_false` | true | Numeric `0` / `0.0` is falsy |
| `treat_empty_string_as_false` | true | `""` is falsy |
| `evaluate_boolean` | true | Booleans use their actual value. When OFF, booleans are always truthy |
| `treat_empty_list_as_false` | true | Empty `list` / `tuple` is falsy |
| `block_on_all_false` | false | When every slot is falsy, emit an `ExecutionBlocker` on the `output` socket to stop downstream execution |

`None` is always falsy. Values that don't match any falsy rule are truthy.

### Outputs

| Output | Type | Meaning |
| --- | --- | --- |
| `output` | any | The `source_X` of the first slot whose condition is truthy. `None` if all slots are falsy (or `ExecutionBlocker` if `block_on_all_false` is ON) |
| `matched` | BOOLEAN | `True` if a slot matched, `False` otherwise (always `False` when all slots are falsy, including the blocker case) |

### Evaluation order

Slots are tested in the order **A → B → C → D → E**. Slots whose `source_X` is not connected (C/D/E only) are skipped. The first slot whose condition evaluates truthy wins, and its `source_X` value is forwarded.

## Installation

Clone into your ComfyUI `custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/id-fa/ComfyUI-Loose-Switch
```

Restart ComfyUI. No additional dependencies required.

## License

[MIT](LICENSE)
