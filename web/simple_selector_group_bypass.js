// Frontend for the SimpleSelectorSwitchAdvanced node only.
//
// Registers a custom widget type LENIENT_SELECTOR via getCustomWidgets, so the
// `selector` input is rendered as an exclusive-checkbox radio list (slots A-E
// plus `none`) with a per-slot editable label. Because it is a first-class
// registered widget (part of the node's declared inputs), the Vue/Nodes-2.0
// renderer keeps it across rebuilds — no hidden widgets, no row-hiding, no
// re-add hacks. The widget's value is a JSON string
// {"select": "a".."e"|"none", "labels": [..5..]} which the Python run() parses.
//
// Also: rgthree FastGroupsBypasser-style group bypass driven by the selection
// (`bypass_unselected_groups` toggle) — sets the canvas group named after each
// slot's label to BYPASS (mode 4) for unselected slots, ALWAYS for the selected
// one. Pure frontend mode change, orthogonal to the lazy-eval `bypass_unselected`.
import { app } from "../../scripts/app.js";

const NODE_CLASS = "SimpleSelectorSwitchAdvanced";
const WIDGET_TYPE = "LENIENT_SELECTOR"; // the registered input type (Python side)
const WIDGET_KIND = "lenient_selector"; // the widget instance's own .type
const SLOTS = ["a", "b", "c", "d", "e"];
const MODE_ALWAYS = 0; // LiteGraph.ALWAYS
const MODE_BYPASS = 4; // rgthree-style bypass
const ROW_H = 22;
const DOUBLE_CLICK_MS = 400;

const ROWS = [
  ...SLOTS.map((s) => ({ key: s, letter: s.toUpperCase() })),
  { key: "none", letter: null },
];

function isTargetNode(node) {
  return node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
}

function getGroups() {
  const g = app.graph;
  return g ? g._groups || g.groups || [] : [];
}

function findWidget(node, name) {
  return (node.widgets || []).find((w) => w.name === name);
}

function selectorWidget(node) {
  return (node.widgets || []).find((w) => w.type === WIDGET_KIND);
}

// ----- selector value (JSON) -------------------------------------------------

function parseValue(v) {
  let d = null;
  try {
    d = typeof v === "string" ? JSON.parse(v) : v;
  } catch (_) {
    d = null;
  }
  if (!d || typeof d !== "object") d = {};
  const select = String(d.select ?? "none").toLowerCase();
  let labels = Array.isArray(d.labels)
    ? d.labels.slice(0, 5).map((x) => String(x ?? ""))
    : [];
  while (labels.length < 5) labels.push("");
  return { select, labels };
}

function stringifyValue(state) {
  return JSON.stringify({ select: state.select, labels: state.labels });
}

function stateOf(node) {
  const w = selectorWidget(node);
  return w
    ? parseValue(w.value)
    : { select: "none", labels: ["", "", "", "", ""] };
}

// ----- redraw / interactions -------------------------------------------------

function redraw(node, widget) {
  // Vue: per-widget canvas repaints via triggerDraw(); classic: setDirtyCanvas.
  widget?.triggerDraw?.();
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function commitValue(node, widget, st) {
  widget.value = stringifyValue(st);
  // Notify the framework (marks the workflow modified and lets ComfyUI sync any
  // second rendering of this widget, e.g. the properties panel).
  if (typeof widget.callback === "function") widget.callback(widget.value);
  applyGroupBypass(node);
  redraw(node, widget);
}

function setSelection(node, widget, key) {
  const st = parseValue(widget.value);
  st.select = key;
  commitValue(node, widget, st);
}

function editLabel(node, widget, slotIndex, event) {
  const st = parseValue(widget.value);
  const commit = (v) => {
    if (v === null || v === undefined) return;
    st.labels[slotIndex] = String(v);
    commitValue(node, widget, st);
  };
  const canvas = app.canvas;
  if (canvas && typeof canvas.prompt === "function") {
    canvas.prompt("Label / group name", st.labels[slotIndex] ?? "", commit, event);
  } else {
    commit(window.prompt("Label / group name", st.labels[slotIndex] ?? ""));
  }
}

// Map a NODE-relative y to a row index using the widget's own top (`widget.y`,
// set by arrangeWidgets and node-relative in both renderers). The click `pos`
// (classic `mouse`) and `graph_mouse` (Vue path) are node-relative too.
function rowAtNodeY(widget, nodeY) {
  const top = typeof widget.y === "number" ? widget.y : widget.last_y ?? 0;
  const i = Math.floor((nodeY - top) / ROW_H);
  return i >= 0 && i < ROWS.length ? i : -1;
}

// ----- group bypass (rgthree FastGroupsBypasser style) -----------------------

function applyGroupBypass(node) {
  const enabled = findWidget(node, "bypass_unselected_groups")?.value === true;
  const { select, labels } = stateOf(node);

  const titles = {};
  for (let i = 0; i < SLOTS.length; i++) {
    const t = (labels[i] || "").trim();
    if (t) titles[SLOTS[i]] = t;
  }
  const groups = getGroups();
  if (!groups.length) return;

  const selected = enabled ? select : null;
  const enableTitles = new Set();
  const bypassTitles = new Set();
  for (const slot of SLOTS) {
    const t = titles[slot];
    if (!t) continue;
    if (!enabled || slot === selected) enableTitles.add(t);
    else bypassTitles.add(t);
  }

  let changed = false;
  const setMode = (titleSet, mode) => {
    if (!titleSet.size) return;
    for (const group of groups) {
      if (!titleSet.has(String(group.title ?? "").trim())) continue;
      if (typeof group.recomputeInsideNodes === "function") {
        group.recomputeInsideNodes();
      }
      for (const n of group._nodes || []) {
        if (n === node) continue;
        if (n.mode !== mode) {
          n.mode = mode;
          changed = true;
        }
      }
    }
  };
  // BYPASS first, then ALWAYS, so a node shared between the selected group and
  // an unselected group ends up enabled (the selected slot wins).
  setMode(bypassTitles, MODE_BYPASS);
  setMode(enableTitles, MODE_ALWAYS);
  if (changed) app.graph.setDirtyCanvas(true, true);
}

// ----- the custom widget -----------------------------------------------------

function makeSelectorWidget(node, name, defaultValue) {
  const widget = {
    name,
    type: WIDGET_KIND,
    value: defaultValue, // JSON string; serializes to Python as the input value
    computeSize() {
      return [200, ROWS.length * ROW_H + 4];
    },
    draw(ctx, n, width, y) {
      const { select, labels } = parseValue(this.value);
      const boxSize = 13;
      const boxX = 14;
      ctx.save();
      ctx.font = "12px Arial";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (let i = 0; i < ROWS.length; i++) {
        const row = ROWS[i];
        const ry = y + i * ROW_H;
        const isSel = select === row.key;

        if (isSel) {
          ctx.fillStyle = "rgba(58,122,254,0.18)";
          ctx.beginPath();
          ctx.roundRect
            ? ctx.roundRect(8, ry + 1, width - 16, ROW_H - 2, 4)
            : ctx.rect(8, ry + 1, width - 16, ROW_H - 2);
          ctx.fill();
        }

        const boxY = ry + (ROW_H - boxSize) / 2;
        ctx.strokeStyle = isSel ? "#3a7afe" : "#888";
        ctx.fillStyle = "#222";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(boxX, boxY, boxSize, boxSize, 3)
          : ctx.rect(boxX, boxY, boxSize, boxSize);
        ctx.fill();
        ctx.stroke();
        if (isSel) {
          ctx.fillStyle = "#3a7afe";
          ctx.beginPath();
          ctx.roundRect
            ? ctx.roundRect(boxX + 3, boxY + 3, boxSize - 6, boxSize - 6, 2)
            : ctx.rect(boxX + 3, boxY + 3, boxSize - 6, boxSize - 6);
          ctx.fill();
        }

        let text;
        if (row.key === "none") {
          text = "none";
        } else {
          const lbl = (labels[i] || "").trim();
          text = lbl
            ? `${row.letter}  ${lbl}`
            : `${row.letter}  (unnamed — double-click)`;
        }
        ctx.fillStyle = isSel ? "#fff" : "#ccc";
        ctx.fillText(text, boxX + boxSize + 8, ry + ROW_H / 2);
      }
      ctx.restore();
    },
    // Classic litegraph: onPointerDown is checked first; wire the CanvasPointer.
    onPointerDown(pointer, n, canvas) {
      const gm = (canvas && canvas.graph_mouse) || app.canvas?.graph_mouse;
      if (!gm) return false;
      const i = rowAtNodeY(this, gm[1] - n.pos[1]);
      if (i < 0) return false;
      const row = ROWS[i];
      pointer.onClick = () => setSelection(n, this, row.key);
      if (row.key !== "none") {
        pointer.onDoubleClick = () => editLabel(n, this, i, pointer.eDown);
      }
      return true;
    },
    // Vue/Nodes-2.0: the per-widget canvas forwards events to widget.mouse with
    // a node-relative pos; the reliable coords arrive on pointer UP.
    mouse(event, pos, n) {
      const t = event.type;
      if (t !== "pointerup" && t !== "mouseup" && t !== "click") return false;
      const i = rowAtNodeY(this, pos[1]);
      if (i < 0) return false;
      const row = ROWS[i];
      const now = event.timeStamp ?? 0;
      const isDouble =
        this._lastRow === i && now - (this._lastT ?? 0) < DOUBLE_CLICK_MS;
      this._lastRow = i;
      this._lastT = now;
      if (isDouble && row.key !== "none") {
        editLabel(n, this, i, event);
        return true;
      }
      setSelection(n, this, row.key);
      return true;
    },
  };
  node.addCustomWidget(widget);
  return widget;
}

// ----- registration ----------------------------------------------------------

app.registerExtension({
  name: "LenientSwitch.SimpleSelectorAdvanced",
  getCustomWidgets() {
    return {
      [WIDGET_TYPE](node, inputName, inputData) {
        const def =
          (inputData && inputData[1] && inputData[1].default) ||
          JSON.stringify({ select: "none", labels: ["", "", "", "", ""] });
        const widget = makeSelectorWidget(node, inputName, def);
        return { widget };
      },
    };
  },
  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    // Re-apply group bypass when the toggle flips.
    const toggle = findWidget(node, "bypass_unselected_groups");
    if (toggle && !toggle.__lenientWrapped) {
      toggle.__lenientWrapped = true;
      const orig = toggle.callback;
      toggle.callback = function (...args) {
        const r = orig ? orig.apply(this, args) : undefined;
        applyGroupBypass(node);
        redraw(node, selectorWidget(node));
        return r;
      };
    }
  },
  afterConfigureGraph() {
    // Re-apply group bypass once the saved values are restored.
    for (const node of app.graph?._nodes || []) {
      if (isTargetNode(node)) applyGroupBypass(node);
    }
  },
});
