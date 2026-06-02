import { app } from "../../scripts/app.js";

// Prompt Tabs — a notepad-style node that keeps any number of named prompt
// tabs in one box. Click a tab to switch, double-click to rename, the small
// "x" to delete (with confirmation), and "+" to add a new tab. The active
// tab's text is what the node outputs; all tabs are stored in the hidden
// `tabs_data` widget as JSON.
//
// The tab bar is a DOM widget (real HTML), not a canvas-drawn widget, so it
// stays interactive in the new ComfyUI frontend ("Nodes 2.0" / Vue renderer)
// and wraps onto multiple rows via CSS flex-wrap.

const DBL_CLICK_MS = 350;

function hideWidget(widget) {
  // Keep the widget (so its value still serializes) but stop it from taking
  // layout space or drawing in either the legacy or the Vue frontend.
  widget.computeSize = () => [0, -4];
  widget.type = "hidden";
  widget.hidden = true;
  if (widget.element) {
    widget.element.style.display = "none";
  }
}

app.registerExtension({
  name: "idfa.PromptTabs",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "PromptTabs") {
      return;
    }

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      setupPromptTabs(this);
      return result;
    };

    // Re-sync after a saved workflow is loaded (widget values are restored
    // between onNodeCreated and onConfigure).
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = onConfigure?.apply(this, arguments);
      this._promptTabs?.reload();
      return result;
    };
  },
});

function setupPromptTabs(node) {
  const textWidget = node.widgets?.find((w) => w.name === "text");
  const dataWidget = node.widgets?.find((w) => w.name === "tabs_data");
  if (!textWidget || !dataWidget || !node.addDOMWidget) {
    return; // missing pieces → node degrades to a plain text box
  }

  hideWidget(dataWidget);

  // store = { tabs: [{ name, text }], active: index }
  let store = { tabs: [{ name: "Tab 1", text: "" }], active: 0 };

  function persist() {
    dataWidget.value = JSON.stringify(store);
  }

  function saveEditorIntoActive() {
    const tab = store.tabs[store.active];
    if (tab) {
      tab.text = textWidget.value ?? "";
    }
    persist();
  }

  function loadActiveIntoEditor() {
    const tab = store.tabs[store.active];
    // Programmatic set: does not fire the editor's "input" listener, so no
    // feedback loop with saveEditorIntoActive.
    textWidget.value = tab ? tab.text : "";
  }

  function normalize(parsed) {
    if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return null;
    }
    const tabs = parsed.tabs.map((t, i) => ({
      name: typeof t?.name === "string" && t.name.length ? t.name : `Tab ${i + 1}`,
      text: typeof t?.text === "string" ? t.text : "",
    }));
    let active = parsed.active;
    if (typeof active !== "number" || active < 0 || active >= tabs.length) {
      active = 0;
    }
    return { tabs, active };
  }

  // ---- state transitions ---------------------------------------------------

  function switchTab(i) {
    if (i === store.active) {
      return;
    }
    saveEditorIntoActive();
    store.active = i;
    loadActiveIntoEditor();
    persist();
    render();
    node.setDirtyCanvas(true, true);
  }

  function addTab() {
    saveEditorIntoActive();
    store.tabs.push({ name: `Tab ${store.tabs.length + 1}`, text: "" });
    store.active = store.tabs.length - 1;
    loadActiveIntoEditor();
    persist();
    render();
    node.setDirtyCanvas(true, true);
  }

  function deleteTab(i) {
    if (store.tabs.length <= 1) {
      return; // always keep at least one tab
    }
    const tab = store.tabs[i];
    const hasText = (tab?.text ?? "").trim().length > 0;
    const message = hasText
      ? `Delete tab "${tab.name}"? Its text will be lost.`
      : `Delete tab "${tab.name}"?`;
    if (!window.confirm(message)) {
      return;
    }
    saveEditorIntoActive();
    store.tabs.splice(i, 1);
    if (store.active > i) {
      store.active -= 1;
    } else if (store.active >= store.tabs.length) {
      store.active = store.tabs.length - 1;
    }
    loadActiveIntoEditor();
    persist();
    render();
    node.setDirtyCanvas(true, true);
  }

  function renameTab(i) {
    const current = store.tabs[i]?.name ?? "";
    const name = window.prompt("Tab name:", current);
    if (name != null) {
      store.tabs[i].name = name.trim() || current || `Tab ${i + 1}`;
      persist();
      render();
      node.setDirtyCanvas(true, true);
    }
  }

  function reload() {
    let parsed = null;
    try {
      if (dataWidget.value) {
        parsed = normalize(JSON.parse(dataWidget.value));
      }
    } catch (e) {
      parsed = null;
    }
    // Fresh node (or unreadable data): seed one tab from whatever text is
    // already in the editor so nothing is lost.
    store = parsed || {
      tabs: [{ name: "Tab 1", text: textWidget.value ?? "" }],
      active: 0,
    };
    loadActiveIntoEditor();
    persist();
    render();
    node.setDirtyCanvas(true, true);
  }

  // ---- DOM tab bar ---------------------------------------------------------

  // Outer element is sized by ComfyUI; the inner flex row keeps its natural
  // (wrapped) height, which we report back via computeSize.
  const bar = document.createElement("div");
  bar.style.width = "100%";
  const inner = document.createElement("div");
  Object.assign(inner.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    alignItems: "center",
    width: "100%",
    boxSizing: "border-box",
    padding: "2px 0",
    fontFamily: "Arial, sans-serif",
    fontSize: "12px",
  });
  bar.appendChild(inner);

  function makeTab(tab, i) {
    const active = i === store.active;
    const el = document.createElement("div");
    Object.assign(el.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 6px",
      borderRadius: "4px",
      cursor: "pointer",
      userSelect: "none",
      border: `1px solid ${active ? "#7a7a7a" : "#444"}`,
      background: active ? "#4a4a4a" : "#262626",
      color: active ? "#ffffff" : "#b0b0b0",
      maxWidth: "180px",
    });

    const label = document.createElement("span");
    label.textContent = tab.name || `Tab ${i + 1}`;
    Object.assign(label.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    label.addEventListener("pointerdown", (e) => e.stopPropagation());
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      switchTab(i);
    });
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      renameTab(i);
    });
    el.appendChild(label);

    if (store.tabs.length > 1) {
      const close = document.createElement("span");
      close.textContent = "×";
      Object.assign(close.style, {
        color: active ? "#dddddd" : "#888888",
        fontWeight: "bold",
        padding: "0 2px",
      });
      close.title = "Delete tab";
      close.addEventListener("pointerdown", (e) => e.stopPropagation());
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteTab(i);
      });
      el.appendChild(close);
    }
    return el;
  }

  function makePlus() {
    const el = document.createElement("div");
    el.textContent = "+";
    el.title = "Add tab";
    Object.assign(el.style, {
      padding: "2px 8px",
      borderRadius: "4px",
      cursor: "pointer",
      userSelect: "none",
      border: "1px solid #444",
      background: "#262626",
      color: "#90c090",
      fontWeight: "bold",
    });
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      addTab();
    });
    return el;
  }

  function render() {
    inner.replaceChildren(
      ...store.tabs.map((t, i) => makeTab(t, i)),
      makePlus()
    );
    node.setDirtyCanvas(true, true);
  }

  const tabWidget = node.addDOMWidget("prompt_tabs_bar", "prompt_tabs_bar", bar, {
    serialize: false,
    hideOnZoom: false,
  });

  // Report the wrapped height. `inner` is never height-forced, so its
  // offsetHeight reflects the real number of rows (grows/shrinks with wrap).
  let measuredHeight = 24;
  tabWidget.computeSize = function (width) {
    const h = inner.offsetHeight;
    if (h > 0) {
      measuredHeight = h;
    }
    return [width, measuredHeight];
  };

  // Re-layout the node when wrapping changes the bar's height.
  try {
    const ro = new ResizeObserver(() => node.setDirtyCanvas(true, true));
    ro.observe(inner);
  } catch (e) {
    /* ResizeObserver unavailable — width changes still trigger redraws */
  }

  // Place the tab bar directly above the text editor.
  const barIdx = node.widgets.indexOf(tabWidget);
  if (barIdx !== -1) {
    node.widgets.splice(barIdx, 1);
  }
  const textIdx = node.widgets.indexOf(textWidget);
  node.widgets.splice(textIdx === -1 ? node.widgets.length : textIdx, 0, tabWidget);

  // Live sync: keep the active tab (and `tabs_data`) up to date as the user
  // types, so switching tabs or saving never loses the current edit. This is
  // what makes the tab state track the editor in real time.
  const textArea = findTextArea(textWidget);
  if (textArea) {
    textArea.addEventListener("input", saveEditorIntoActive);
  }

  // Belt-and-suspenders: also flush at serialize/queue time in case the
  // editor element wasn't found above.
  dataWidget.serializeValue = () => {
    saveEditorIntoActive();
    return dataWidget.value;
  };

  node._promptTabs = { reload };
  reload();
}

function findTextArea(widget) {
  let el = widget.inputEl || widget.element;
  if (el && el.tagName !== "TEXTAREA") {
    el = el.querySelector?.("textarea") || null;
  }
  return el && el.tagName === "TEXTAREA" ? el : null;
}
