// Group Bypass Toggle — a frontend-only (virtual) node, rgthree
// FastGroupsBypasser style, that bypasses / un-bypasses ONE canvas group.
//
//   group   [ my group  v ]  <- dropdown of group names (exact match, no partial)
//   bypass  [ ACTIVE | BYPASSED ]
//   [ re-scan groups ]       <- button: rescans the canvas groups into the dropdown
//
// There is no Python side at all: the node is registered via
// `registerCustomNodes`, is `isVirtualNode` (never sent to the server) and only
// edits the `mode` of the nodes sitting inside the chosen group (BYPASS = 4,
// ALWAYS = 0). Every group whose title equals the chosen name is targeted, so
// several same-named groups flip together.
//
// Renderer notes (classic litegraph AND Vue / Nodes 2.0):
//   * All three widgets are stock types (`button`, `combo`, `toggle`) created in
//     the constructor, so Vue renders them with its own components and keeps
//     them across rebuilds. No custom widget, no hidden widgets.
//   * The dropdown choices are refreshed by mutating `widget.options.values`
//     IN PLACE (splice). The Vue select keeps a shallow copy of the options
//     object and re-resolves `values` each time it opens, so replacing the
//     array with a new one can leave Vue showing a stale list — splice instead.
//   * `on` / `off` option labels are honoured by both renderers (classic draws
//     them, Vue shows a two-button toggle group).
import { app } from "../../scripts/app.js";

const NODE_TYPE = "Group Bypass Toggle (Lenient Switch)";
const NODE_TITLE = "Group Bypass Toggle";
const NONE = "(none)";
const MODE_ALWAYS = 0; // LiteGraph.ALWAYS
const MODE_BYPASS = 4; // rgthree-style bypass

function isToggleNode(node) {
  return node && node.type === NODE_TYPE;
}

function graphOf(node) {
  return (node && node.graph) || app.graph || null;
}

function getGroups(graph) {
  return graph ? graph._groups || graph.groups || [] : [];
}

function findWidget(node, name) {
  return (node.widgets || []).find((w) => w.name === name);
}

function groupTitle(group) {
  return String(group.title ?? "").trim();
}

// ----- scanning ---------------------------------------------------------------

// Rebuild the dropdown list: "(none)" + every distinct, non-empty group title
// (sorted). The current value is kept in the list even if its group is gone
// (renamed / deleted) so a saved workflow never silently loses its target.
function scanGroups(node) {
  const w = findWidget(node, "group");
  if (!w) return;
  const names = new Set();
  for (const g of getGroups(graphOf(node))) {
    const t = groupTitle(g);
    if (t) names.add(t);
  }
  const list = [...names].sort((a, b) => a.localeCompare(b));
  const current = typeof w.value === "string" ? w.value : "";
  if (current && current !== NONE && !names.has(current)) list.push(current);
  const values = [NONE, ...list];

  const arr = w.options.values;
  if (Array.isArray(arr)) {
    arr.splice(0, arr.length, ...values); // in place — see header note
  } else {
    w.options.values = values;
  }
  if (!current) w.value = NONE;
  node.setDirtyCanvas?.(true, true);
}

// ----- apply --------------------------------------------------------------------

function applyBypass(node) {
  const groupW = findWidget(node, "group");
  const bypassW = findWidget(node, "bypass");
  if (!groupW || !bypassW) return;
  const name = typeof groupW.value === "string" ? groupW.value.trim() : "";
  if (!name || name === NONE) return;
  const mode = bypassW.value === true ? MODE_BYPASS : MODE_ALWAYS;

  const graph = graphOf(node);
  let changed = false;
  for (const group of getGroups(graph)) {
    if (groupTitle(group) !== name) continue; // exact match only
    if (typeof group.recomputeInsideNodes === "function") {
      try {
        group.recomputeInsideNodes();
      } catch (_) {
        /* group not attached to a graph yet */
      }
    }
    for (const n of group._nodes || []) {
      if (n === node) continue; // never bypass ourselves
      if (n.mode !== mode) {
        n.mode = mode;
        changed = true;
      }
    }
  }
  if (changed) {
    graph?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
  }
}

// ----- the node ----------------------------------------------------------------

app.registerExtension({
  name: "LenientSwitch.GroupBypassToggle",
  registerCustomNodes() {
    const LGraphNode = globalThis.LGraphNode || app.graph?.constructor?.LGraphNode;
    const LiteGraph = globalThis.LiteGraph;
    if (!LGraphNode || !LiteGraph) {
      console.warn("[LenientSwitch] LiteGraph globals missing; Group Bypass Toggle not registered");
      return;
    }

    class GroupBypassToggleNode extends LGraphNode {
      static title = NODE_TITLE;
      static category = "Lenient Switch";
      static description =
        "Bypass / un-bypass one canvas group (rgthree FastGroupsBypasser style). " +
        "Press 're-scan groups' to list the group names, pick one (exact match; every " +
        "same-named group is targeted), then flip 'bypass'. Frontend-only; never " +
        "sent to the server.";

      constructor(title) {
        super(title);
        this.isVirtualNode = true;
        this.serialize_widgets = true;

        this.addWidget(
          "combo",
          "group",
          NONE,
          () => {
            // Re-targeting applies the current toggle state to the new group.
            applyBypass(this);
          },
          { values: [NONE] }
        );

        this.addWidget(
          "toggle",
          "bypass",
          false,
          () => {
            applyBypass(this);
          },
          { on: "BYPASSED", off: "ACTIVE" }
        );

        // Rarely used, so it sits last.
        const scanBtn = this.addWidget("button", "re-scan groups", null, () => {
          scanGroups(this);
        });
        scanBtn.serialize = false;

        const sz = this.computeSize();
        this.setSize([Math.max(sz[0], 240), sz[1]]);
      }

      onAdded() {
        // Called before configure() when loading; gives a sensible initial list.
        scanGroups(this);
      }

      onConfigure() {
        // Widget values are restored by now: make sure the saved group name is
        // in the dropdown (also covers paste / undo).
        scanGroups(this);
      }
    }

    LiteGraph.registerNodeType(NODE_TYPE, GroupBypassToggleNode);
    // registerNodeType may overwrite `title`/`category` from the type string on
    // some versions — assert them afterwards (rgthree does the same).
    GroupBypassToggleNode.title = NODE_TITLE;
    GroupBypassToggleNode.category = "Lenient Switch";
  },

  afterConfigureGraph() {
    // Saved toggle state is authoritative: re-apply it on load.
    for (const node of app.graph?._nodes || []) {
      if (!isToggleNode(node)) continue;
      scanGroups(node);
      applyBypass(node);
    }
  },
});
