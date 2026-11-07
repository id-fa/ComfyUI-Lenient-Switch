// Group Bypass Toggle — a frontend-only (virtual) node, rgthree
// FastGroupsBypasser style, that bypasses / un-bypasses ONE canvas group.
//
//   group   [ my group  v ]  <- dropdown of group names (exact match, no partial)
//   [  ACTIVE  |  BYPASSED  ] <- big two-segment switch (custom canvas widget)
//                              (gap, so the button below is not hit by accident)
//   [ re-scan groups ]       <- button: rescans the canvas groups into the dropdown
//
// There is no Python side at all: the node is registered via
// `registerCustomNodes`, is `isVirtualNode` (never sent to the server) and only
// edits the `mode` of the nodes sitting inside the chosen group (BYPASS = 4,
// ALWAYS = 0). Every group whose title equals the chosen name is targeted, so
// several same-named groups flip together.
//
// Renderer notes (classic litegraph AND Vue / Nodes 2.0):
//   * `group` (combo) and `re-scan groups` (button) are stock widget types, so
//     Vue renders them with its own components. `bypass` is a custom
//     canvas-drawn widget (the stock toggle has a fixed, small row height in
//     Vue and cannot be enlarged): it draws a big ACTIVE | BYPASSED segment
//     switch and reserves an empty gap under it. Vue renders custom widgets on
//     a per-widget canvas (WidgetLegacy) honouring `computeSize` height and
//     calling `draw`; clicks arrive via `mouse` on pointer UP, classic via
//     `onPointerDown` — same dual path as simple_selector_group_bypass.js.
//     All widgets are created in the constructor, so Vue keeps them across
//     rebuilds. No hidden widgets.
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
const TOGGLE_KIND = "lenient_bypass_toggle"; // the custom widget's .type
const TOGGLE_H = 36; // height of the drawn switch
const TOGGLE_GAP = 16; // empty space under the switch (keeps the button away)
const MARGIN = 15;

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

// ----- the big bypass switch (custom widget) ----------------------------------

function redraw(node, widget) {
  // Vue: per-widget canvas repaints via triggerDraw(); classic: setDirtyCanvas.
  widget?.triggerDraw?.();
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function setBypass(node, widget, value) {
  if (widget.value === value) return;
  widget.value = value;
  if (typeof widget.callback === "function") widget.callback(value);
  applyBypass(node);
  redraw(node, widget);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// Segment under a node-relative x: false = left (ACTIVE), true = right (BYPASSED).
function segmentAtX(widget, node, x) {
  const width = widget._drawWidth || node.size[0];
  return x >= width / 2;
}

function makeBypassWidget(node, name, defaultValue) {
  const widget = {
    name,
    type: TOGGLE_KIND,
    value: defaultValue, // boolean; serialized like the old stock toggle
    computeSize() {
      return [220, TOGGLE_H + TOGGLE_GAP];
    },
    draw(ctx, n, width, y) {
      this._drawWidth = width;
      const on = this.value === true;
      const x0 = MARGIN;
      const w = width - MARGIN * 2;
      const h = TOGGLE_H - 4;
      const top = y + 2;
      const half = w / 2;
      ctx.save();
      // frame
      ctx.fillStyle = "#1e1e1e";
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      roundRect(ctx, x0, top, w, h, 8);
      ctx.fill();
      ctx.stroke();
      // selected segment
      ctx.fillStyle = on ? "#8a3ab9" : "#3a7afe";
      roundRect(ctx, on ? x0 + half + 2 : x0 + 2, top + 2, half - 4, h - 4, 6);
      ctx.fill();
      // labels
      ctx.font = "bold 14px Arial";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = on ? "#999" : "#fff";
      ctx.fillText("ACTIVE", x0 + half / 2, top + h / 2);
      ctx.fillStyle = on ? "#fff" : "#999";
      ctx.fillText("BYPASSED", x0 + half + half / 2, top + h / 2);
      ctx.restore();
    },
    // Classic litegraph: onPointerDown is checked first; wire the CanvasPointer.
    onPointerDown(pointer, n, canvas) {
      const gm = (canvas && canvas.graph_mouse) || app.canvas?.graph_mouse;
      if (!gm) return false;
      const top = typeof this.y === "number" ? this.y : this.last_y ?? 0;
      const localY = gm[1] - n.pos[1] - top;
      if (localY < 0 || localY >= TOGGLE_H) return false; // the gap is inert
      const localX = gm[0] - n.pos[0];
      pointer.onClick = () => setBypass(n, this, segmentAtX(this, n, localX));
      return true;
    },
    // Vue/Nodes-2.0: the per-widget canvas forwards events to widget.mouse with
    // a NODE-relative pos (canvasX/Y minus node.pos — see
    // LGraphCanvas.processWidgetClick's pointer.finally); the reliable coords
    // arrive on pointer UP. Subtract the widget's own top (`widget.y`).
    mouse(event, pos, n) {
      const t = event.type;
      if (t !== "pointerup" && t !== "mouseup" && t !== "click") return false;
      const top = typeof this.y === "number" ? this.y : this.last_y ?? 0;
      const localY = pos[1] - top;
      if (localY < 0 || localY >= TOGGLE_H) return false; // the gap is inert
      setBypass(n, this, segmentAtX(this, n, pos[0]));
      return true;
    },
  };
  node.addCustomWidget(widget);
  return widget;
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

        // Big ACTIVE | BYPASSED switch with an empty gap under it.
        makeBypassWidget(this, "bypass", false);

        // Rarely used, so it sits last (after the gap).
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
