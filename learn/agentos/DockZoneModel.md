# Dock-Zone Model Contract

`@summary` Minimal model contract for Neo's docking subsystem: a serializable dock-zone tree that composes with Neo's existing dashboard, layout, JSON blueprint, and multi-window drag substrates without introducing a parallel docking engine.

**Code realization (v13.2 architecture).** The contract lives in the `Neo.dashboard.dock.model.*` tier:
`model.WorkspaceDocument` owns the committed tree (schema keys, validation, normalization, tree helpers,
fingerprints, the fail-closed commit), `model.Operations` owns the semantic operation vocabulary and
dispatch, `model.Persistence` owns the saved-layout envelope (capture, wrapper validation, restore), and
`Neo.dashboard.dock.persistence.PerspectiveLibrary` is the single-workspace named-layout authority;
keyed topology envelopes and collections validate through `model.Persistence` until the Group owner loads them.
Method references below name their owning module.

## Scope

This is the executable v13.2 contract shared by the Workstation, the dashboard examples, and external consumers. It
defines the committed document, semantic operations, projection boundary, persistence wrappers, and the strict line
between serializable truth and per-window interaction state.

## Existing Substrates

The contract composes with these current Neo substrates:

| Substrate | Current authority | Contract implication |
|---|---|---|
| Declarative layouts | `learn/guides/uibuildingblocks/Layouts.md`, `src/layout/HBox.mjs`, `src/layout/VBox.mjs`, `src/layout/Card.mjs` | Dock splits map to `hbox` / `vbox`; tabbed slots map to a tab header plus `card`-style active content. |
| JSON-first UI state | `learn/benefits/body/JSONFirstUIs.md`, `learn/gettingstarted/DescribingTheUI.md` | Persist only pure JSON. Runtime component instances, DOMRects, and window objects stay out of the serialized model. |
| Dashboard drag substrate | `src/dashboard/Container.mjs`, `src/draggable/dashboard/SortZone.mjs`, `src/dashboard/dock/interaction/TabSortZone.mjs` | Dock rendering adapts this model into existing dashboard/sort-zone mechanics instead of forking drag handling. |
| Cross-window geometry | `src/manager/Window.mjs`, `src/manager/DragCoordinator.mjs`, `src/main/addon/WindowPosition.mjs` | Dock drop targeting uses existing screen-coordinate and remote-drag authority. The model stores the accepted result, not transient geometry. |
| Engine consumers | `apps/workstation/`, `examples/dashboard/`, ADR 0020 | Minimal and high-density applications consume the same document and operation vocabulary without app-specific docking branches. |

The subsystem realizing this contract lives at `src/dashboard/dock/**` (`Neo.dashboard.dock.*`); ADR 0029's §2.9 amendment records the final package and wire family.

## Ownership Boundary

The model is a generic dashboard-layer contract, not a core layout primitive.

The dock-zone subsystem lives in `src/dashboard/dock/`: `model.WorkspaceDocument` owns document invariants,
`model.Operations` executes semantic changes, `projection.LayoutAdapter` derives component configs, and
`projection.Reconciler` preserves live component identity across projections. Dock zones are an engine capability;
applications contribute pane resolution, product chrome, and product-specific policy only.

Rejected alternatives:

- **Core `src/layout/Dock` first:** rejected. Layout classes arrange existing children; they do not own drag, remote-window handoff, component re-parenting, or persistence semantics.
- **Dashboard-only implicit state:** rejected. `Dashboard` already moves live components, but without a serializable model contract it cannot become a stable blueprint/persistence surface.
- **External docking-library object model:** rejected. Neo must preserve worker-owned JSON, live component identity, and multi-window object continuity.
- **Pixel-absolute workspace persistence:** rejected. Persist semantic splits/tabs/order; runtime pixels and preview rectangles are derived state.

## Data Model

The persisted document is a versioned JSON object:

```json
{
  "schema": "neo.dock.zone.v1",
  "root": "root",
  "items": {
    "strategy": {
      "componentRef": "strategy",
      "title": "Strategy",
      "kind": "panel"
    },
    "swarm": {
      "componentRef": "swarm",
      "title": "Swarm",
      "kind": "panel"
    },
    "terminal": {
      "componentRef": "terminal",
      "title": "Terminal",
      "kind": "terminal"
    },
    "inspector": {
      "componentRef": "inspector",
      "title": "Inspector",
      "kind": "inspector"
    }
  },
  "nodes": {
    "root": {
      "type": "edge-zone",
      "zones": {
        "center": {"nodeId": "main-tabs"},
        "right": {"nodeId": "side-split", "extent": 0.25, "resizable": true}
      }
    },
    "main-tabs": {
      "type": "tabs",
      "items": ["strategy", "swarm"],
      "activeItemId": "swarm"
    },
    "side-split": {
      "type": "split",
      "orientation": "vertical",
      "children": ["terminal-tabs", "inspector-tabs"],
      "sizes": [0.55, 0.45]
    },
    "terminal-tabs": {
      "type": "tabs",
      "items": ["terminal"],
      "activeItemId": "terminal"
    },
    "inspector-tabs": {
      "type": "tabs",
      "items": ["inspector"],
      "activeItemId": "inspector"
    }
  }
}
```

### Node Types

| Type | Required fields | Meaning | Layout mapping |
|---|---|---|---|
| `edge-zone` | `zones` | Root or nested edge container. Each `top`, `right`, `bottom`, `left`, or `center` entry is `{nodeId, extent?, resizable?}`; missing zones are empty. `extent` is a normalized fraction and belongs to the edge descriptor, never to a side map. | The adapter composes edge bands around the center with `vbox`/`hbox` and projects a splitter only when `resizable: true`. |
| `split` | `orientation`, `children` | Ordered splitter container. `orientation: horizontal` means children are side-by-side; `vertical` means stacked. | `horizontal` -> `hbox`; `vertical` -> `vbox`. |
| `tabs` | `items`, `activeItemId` | Ordered tab slot containing stable item ids. | Tab header plus `card` active content. |

### Item Records

`items` is an id-keyed catalog. Item ids are stable workspace identity, not necessarily component instance ids.

Required item fields:

- `componentRef`: stable reference used by the rendering adapter to locate or create the component.
- `title`: display label for tab headers and persistence UIs.
- `kind`: coarse category such as `panel`, `terminal`, `transcript`, `inspector`, or `tool`.

Optional item fields:

- `blueprint`: a serializable Neo component config when the item is created from saved state rather than a live instance.
- `closable`, `pinnable`, `movable`: UI policy hints. Defaults are adapter-defined.
- `pinned`: semantic pin state. `true` means pinned open; `false` means auto-hide eligible when an adapter supports that affordance. Omitted preserves the adapter-defined default. `pinnable === false` means `setItemPinned` must reject pin-state changes.
- `autoHidden`: semantic collapsed/auto-hide state. `true` means the item is committed as collapsed into an auto-hide affordance; `false` means the item is visible when the owning layout renders it. A pinned-open item must not be serialized with `autoHidden: true`; `setItemPinned(..., true)` clears `autoHidden`.
- `metadata`: JSON-only descriptive data. It must not contain DOM nodes, functions, secrets, PATs, or live component objects.

### Stale Component References

`componentRef` is a stable lookup key, not a guarantee that a live component instance or constructable blueprint still exists.

When a rendering adapter cannot resolve `componentRef` to a live component, and cannot instantiate from `item.blueprint`, restore behavior is adapter-defined until a concrete renderer or persistence slice owns a stricter policy. The adapter must still fail non-silently: preserve the item record and its semantic placement long enough for validation, explicit user recovery, or an intentional close/remove operation.

Allowed fallback shapes include a validation error tied to the item id or a recoverable placeholder pane. The adapter must not silently drop the item, synthesize live runtime references into persisted state, or rewrite the dock tree in a way that corrupts the saved layout. A future adapter may narrow this policy, but it must cite or update this contract rather than inventing incompatible restore semantics.

## Serializable vs Runtime State

Persist:

- `schema`
- root node id
- node ids, types, nested edge descriptors (including committed `extent` / `resizable`), split orientation, split child order, normalized split sizes
- tab item order and `activeItemId`
- stable item ids, item pin state, and JSON-only item metadata
- committed item auto-hide/collapsed state

Do not persist:

- `DOMRect`, screen coordinates, hover rectangles, and preview overlays
- `dockPreview` payloads, preview ids, rejection reasons, and placement hints
- runtime hover/open state for auto-hidden panes
- `windowId`, `appName`, `sourceSortZone`, `targetSortZone`, `currentIndex`, `draggedItem`
- live `Neo.component.Base` instances
- functions, controllers, event listeners, PATs, or harness credentials
- transient popup/window-drag flags such as `isWindowDragging`

If a future slice needs to restore detached windows, it should persist semantic placement plus an optional window placement hint separately. The dock-zone model remains the component-layout authority, not an OS-window session dump.

### Active tabs and edge extents

Two values that look like presentation are committed document truth:

- `tabs.activeItemId` changes through `setActiveItem`. A projected `Neo.tab.Container` may render an integer
  `activeIndex`, but every user activation is converted back to the stable item id before an unrelated projection can
  reset it.
- `edge-zone.zones[edge].extent` changes through `resizeEdgeZone`. Pointer-move pixels and inline preview styles stay
  in the main thread. CSS min/max bounds constrain that preview and its one normalized terminal value; only successful
  release advances the document. Escape, stale generations, rejection, and destruction commit nothing.

Auto-hide preserves the owning edge descriptor. A reveal overlay reads that committed extent; only an edge with no
committed extent uses the workspace's presentation fallback. Saved layouts and perspectives capture the descriptor,
so restoring a perspective restores the edge size and active tab together.

## Named Layout Collections / Perspectives

Named perspectives collect multiple saved layouts without choosing a storage backend or rendering a switcher. Writers place the `neo.dock.layout.v1` envelope inside the unchanged collection shape:

```json
{
  "schema": "neo.dock.layoutCollection.v1",
  "activeLayoutId": "operator-default",
  "layouts": {
    "operator-default": {
      "schema": "neo.dock.layout.v1",
      "layoutId": "operator-default",
      "title": "Operator Default",
      "dockZone": {},
      "captureScope": "window",
      "windowFingerprint": null,
      "perspectiveName": "Operator Default"
    }
  },
  "metadata": {},
  "revision": 1
}
```

Rules:

- `layouts` is keyed by each saved layout's `layoutId`; the key and wrapper id must match.
- `activeLayoutId` must name an existing layout whenever the collection contains layouts.
- Collection and saved-layout metadata are JSON-only and must not contain secrets, PATs, credentials, functions, DOM nodes, or live components.
- Restoring a perspective must go through `restoreSavedLayout()` so the saved-layout schema, dock-zone schema, and JSON-only checks stay shared.
- Removing the active layout requires an explicit replacement id. Do not silently pick a different active layout.

Storage remains out of scope for this layer. Browser preferences, Memory Core persistence, import/export, and rendered layout switchers consume this collection contract later; they must not fork their own collection shape.

`neo.dock.layout.v1` is the only accepted envelope. There is no migration reader: any other schema — a different version, or the retired pre-v13.2 family — is rejected fail-closed on every read path (`restoreSavedLayout`, collection validation, library load).

## Operations

Every mutation goes through `Neo.dashboard.dock.model.Operations`; `applyOperation()` is the single dispatch, and UI handlers never perform tree surgery directly:

| Operation | Inputs | Result |
|---|---|---|
| `setActiveItem` | `tabsNodeId`, `itemId` | Commits a member item as the tabs node's `activeItemId`; unknown nodes and non-members fail closed. |
| `moveItem` | `itemId`, `targetNodeId`, `index` | Reorders an item within a tab slot or split-derived target. |
| `splitNode` | `targetNodeId`, `orientation`, `beforeNodeId`, `afterNodeId`, `sizes` | Replaces a node with a split containing the old and new nodes. |
| `resizeSplit` | `splitNodeId`, `sizes` | Updates an existing split node's normalized child sizes after a splitter affordance. |
| `resizeEdgeZone` | `edgeZoneId`, `edge`, `extent` | Commits one normalized extent when that nested edge descriptor explicitly has `resizable: true`. |
| `addTab` | `itemId`, `tabsNodeId`, `index` | Inserts an item into a tab slot and may set `activeItemId`. |
| `detachItem` | `itemId` | Removes an item from the dock tree while preserving its item record for popup/window ownership. |
| `closeItem` | `itemId` | Removes an item from both tree and catalog when policy permits. |
| `setItemPinned` | `itemId`, `pinned` | Updates an item's semantic pin state when `pinnable` policy permits it. |
| `setItemAutoHidden` | `itemId`, `autoHidden` | Updates an item's committed collapsed/auto-hide state when `pinnable` policy permits it. |
| `normalizeTree` | full model | Removes empty tabs/splits and validates references after any operation. |
| `createSavedLayoutCollection` | saved-layout wrappers, metadata | Creates a named perspective collection from valid saved-layout wrappers. |
| `upsertSavedLayout` | collection, saved-layout wrapper, `activate` | Adds or replaces a named saved layout and optionally selects it. |
| `selectSavedLayout` | collection, `layoutId` | Selects an existing saved layout id as active. |
| `removeSavedLayout` | collection, `layoutId`, `replacementLayoutId` | Removes a named saved layout; active removals require an explicit replacement. |
| `restoreActiveSavedLayout` | collection | Restores the active saved layout through `restoreSavedLayout()`. |

Every operation must maintain:

- all referenced item ids exist in `items`
- every item appears at most once in the dock tree unless a future explicit mirroring model is added
- split sizes match child count and normalize to `1`
- `tabs.activeItemId` is either null for empty tabs or one of `tabs.items`
- empty structural nodes are collapsed before serialization
- pin-state changes require a boolean `pinned` payload and must reject items with `pinnable === false`
- auto-hide state changes require a boolean `autoHidden` payload, must reject items with `pinnable === false`, and must not leave a pinned-open item serialized as collapsed

## Drag Integration Boundary

The dock model does not own pointer events.

Drag-to-dock interaction listens to the existing drag surfaces and produces a transient `dockPreview` object:

```json
{
  "schema": "neo.dock.preview.v1",
  "previewId": "preview:strategy:main-tabs:tab-after:1",
  "itemId": "strategy",
  "source": {
    "surface": "dashboard-sort-zone",
    "sortZoneId": "left-workspace"
  },
  "target": {
    "containerId": "workspace",
    "nodeId": "main-tabs"
  },
  "placement": {
    "kind": "tab-after",
    "index": 1
  },
  "feedback": {
    "state": "accepted"
  }
}
```

`dockPreview` is runtime-only. On drop, the adapter converts it into one of the semantic operations above. This keeps the existing `DashboardSortZone` / `DragCoordinator` responsibilities intact:

- `DashboardSortZone` and base sort zones keep drag lifecycle, proxy, overdrag, and reorder math.
- `DragCoordinator` keeps cross-window source/target arbitration.
- `Window` keeps screen-coordinate to window-id lookup.
- The dock model records the accepted workspace shape after the drop.

## Preview State Contract

`dockPreview` is the only transient payload a docking adapter should expose while a drag is in progress. It is produced by existing drag/sort/window signals and consumed by visual affordances or drop handlers. It is never serialized into the dock-zone model.

Required fields:

| Field | Meaning | Persistence |
|---|---|---|
| `schema` | Preview payload version, initially `neo.dock.preview.v1`. | Runtime only. |
| `previewId` | Stable-enough id for one hover frame or dwell window; useful for renderer diffing. | Runtime only. |
| `itemId` | Stable dock item id from `items`. | Serializable only after a drop commits an operation. |
| `source.surface` | Existing producer surface, e.g. `dashboard-sort-zone`, `drag-coordinator`, or `window-geometry`. | Runtime only. |
| `source.sortZoneId` | Optional source sort-zone identity when the drag starts inside a dashboard zone. | Runtime only. |
| `target.containerId` | Stable id for the dock workspace/container being hovered. | Runtime only unless a drop commits into that container. |
| `target.nodeId` | Candidate dock-zone node id receiving the drop. | Runtime only until converted into an operation. |
| `placement.kind` | Candidate intent: `edge-top`, `edge-right`, `edge-bottom`, `edge-left`, `split-before`, `split-after`, `tab-before`, `tab-after`, `tab-into`, or `rejected`. | Runtime only. |
| `placement.orientation` | Required for split previews: `horizontal` or `vertical`. | Runtime only; accepted split operations persist orientation. |
| `placement.ratio` | Optional normalized split preview ratio. | Runtime only; accepted split operations persist normalized sizes. |
| `placement.index` | Optional tab or child insertion index. | Runtime only; accepted operations persist item order. |
| `feedback.state` | `accepted` or `rejected`. | Runtime only. |
| `feedback.reason` | Optional rejection reason such as `same-source`, `locked-target`, `invalid-node`, or `policy-denied`. | Runtime only. |

`feedback.state` is the canonical accept/reject verdict for a hover frame. `placement.kind = rejected` is reserved for hovers that do not have a meaningful candidate placement; otherwise the adapter should keep the candidate `placement.kind` and set `feedback.state = rejected` with a reason.

Allowed producers:

- `src/draggable/dashboard/SortZone.mjs` and base sort-zone drag lifecycle for in-window drags.
- `src/manager/DragCoordinator.mjs` for cross-window or popup-to-pane arbitration.
- `src/manager/Window.mjs` / `src/main/addon/WindowPosition.mjs` geometry when OS-window movement has no pointer events.

Forbidden producers:

- A new docking-specific pointer-event manager that bypasses the existing drag lifecycle.
- Persisted hover rectangles or screen coordinates as blueprint data.
- A private adapter allowlist that maps visual zones without referencing dock-zone node ids.

Conversion rules on drop:

| Preview placement | Semantic operation |
|---|---|
| `tab-before`, `tab-after`, `tab-into` | `addTab` or `moveItem` into the target `tabs` node. |
| `split-before`, `split-after` | `splitNode` with the preview orientation and normalized sizes. |
| `edge-top`, `edge-right`, `edge-bottom`, `edge-left` | `splitNode` or edge-zone insertion chosen by the adapter, then `normalizeTree`. |
| `rejected` | No model mutation; the renderer clears the preview. |

Consumer boundaries:

- Rendering consumes `dockPreview` to draw edge/split/tab affordances.
- Drop handling consumes `dockPreview` once, then converts it into a semantic operation.
- Persistence consumes only the normalized dock-zone model after operations run.
- Tests should prove preview-only fields disappear before serialization.

## Blueprint Compatibility

The contract is deliberately JSON-first. `projection.LayoutAdapter` projects the model into Neo configs without changing the persisted shape:

- `split.orientation: horizontal` -> container `layout: {ntype: 'hbox', align: 'stretch'}`
- `split.orientation: vertical` -> container `layout: {ntype: 'vbox', align: 'stretch'}`
- `split.sizes` -> child `flex` values
- `tabs.items` -> tab header order plus card children
- `activeItemId` -> active card index derived from `items.indexOf(activeItemId)`; user activation emits `setActiveItem` before a later projection can overwrite it

The adapter must treat `componentRef` as the stable bridge between persisted layout and live component ownership. When no live component exists, the adapter may instantiate from `item.blueprint`; when a live component exists, it should move/re-parent the instance without destroying it, matching the existing dashboard and multi-window precedent.

If neither a live component nor a valid `item.blueprint` exists, the adapter must follow the stale-component-reference policy above instead of silently dropping the item.

## Layout Persistence Boundary

Layout persistence owns saved workspace documents, not drag-time state or component lifetime.

A persisted layout is a small versioned wrapper around the normalized dock-zone model. Writers emit `neo.dock.layout.v1`:

```json
{
  "schema": "neo.dock.layout.v1",
  "layoutId": "operator-default",
  "title": "Operator Default",
  "dockZone": {
    "schema": "neo.dock.zone.v1",
    "root": "root",
    "items": {},
    "nodes": {}
  },
  "captureScope": "window",
  "windowFingerprint": null,
  "perspectiveName": "Operator Default",
  "revision": 1,
  "metadata": {}
}
```

Required wrapper fields:

- `schema`: saved-layout wrapper version. The inner dock-zone document keeps its own `schema`.
- `layoutId`: stable user/workspace layout identity, distinct from dock item ids.
- `title`: display label for layout pickers or recovery UIs.
- `dockZone`: a normalized `neo.dock.zone.v1` model after semantic operations have run.
- `captureScope`: fixed to `window`. The layout schema never carries topology mode.
- `windowFingerprint`: JSON-only shape evidence for this Workspace, or `null` when no fingerprint was captured.

Optional wrapper fields:

- `revision`: monotonic revision, content version, or adapter-owned equivalent used for conflict/recovery messaging.
- `metadata`: JSON-only descriptive data. It must not contain DOM nodes, functions, live component instances, credentials, PATs, access tokens, or harness bridge tokens.
- `perspectiveName`: a non-empty display name when the wrapper is used as a named perspective.

Multi-workspace state has a separate keyed envelope:

```json
{
  "schema": "neo.dock.topology.v1",
  "layoutId": "operator-default",
  "title": "Operator Default",
  "workspaces": {
    "main": {"schema": "neo.dock.zone.v1", "root": "root", "items": {}, "nodes": {}},
    "popup:detail": {"schema": "neo.dock.zone.v1", "root": "root", "items": {}, "nodes": {}}
  },
  "placementHints": {
    "popup:detail": {
      "dx": 240,
      "dy": 80,
      "fallbackTarget": {"workspaceKey": "main", "nodeId": "side-tabs"}
    }
  },
  "topologyFingerprint": {"schema": "neo.dock.topologyShape.v2"},
  "metadata": {}
}
```

`workspaces` is keyed by the registered semantic `workspaceKey`; each value validates as a complete
`WorkspaceDocument`. `placementHints` may name only those keys and persist finite relative offsets plus a semantic
fallback target. Aggregate fingerprints sort keys before composition, so object insertion and workspace
registration order cannot become identity. Item ids remain unique across the topology.

Schema-name row (the canonical vocabulary both tiers share):

| Schema | Role | Notes |
|---|---|---|
| `neo.dock.layout.v1` | one Workspace saved layout / perspective | carries fixed `captureScope: 'window'`, `windowFingerprint`, and optional `perspectiveName`; rejects topology fields |
| `neo.dock.layoutCollection.v1` | named single-workspace layouts | every row validates through `restoreSavedLayout()` |
| `neo.dock.topology.v1` | one keyed multi-workspace composition | carries `workspaces`, relative `placementHints`, and `topologyFingerprint` |
| `neo.dock.topologyCollection.v1` | named topology compositions | keyed by each topology's `layoutId`; `activeLayoutId` must resolve |
| `neo.dock.topologyShape.v2` | keyed aggregate shape evidence | `workspaceCount` + collision-safe, sorted workspace-key terms; positional v1 is rejected |

The `neo.dock.` prefix is the single greenfield wire family (ADR 0029 §2.9 amendment): readers fail closed on every other schema string — unsupported versions are proven rejected inside the family, the retired pre-release `neo.harness.` family is proven rejected as foreign, and no migration reader or alias exists.

Persistence consumes only committed dock-zone state. It must not serialize `dockPreview`, hover rectangles, absolute screen coordinates, monitor ids, `windowId`, `sourceSortZone`, `targetSortZone`, runtime hover/open state for auto-hidden panes, live components, event listeners, controllers, functions, or credential material. Relative `{dx, dy}` topology hints stay semantic and always carry a semantic fallback target; they do not turn the topology into an OS-window session dump.

Restore validates the complete wrapper/collection before replacing active truth. For topologies this includes every keyed Workspace document, placement hint, cross-workspace item uniqueness, and the freshly recomputed aggregate fingerprint. Unsupported or positional inputs fail closed: keep the last-good active state and surface validation or recovery state to the caller.

Component recovery remains the adapter's responsibility. A restored item with an unresolved `componentRef` follows the stale component reference policy above: preserve the item record and semantic placement long enough for validation, explicit recovery, placeholder rendering, or intentional removal. Persistence must not silently drop the item or rewrite the dock tree to hide the missing component.

Reusable layout/topology envelope validation and restore live in `model.Persistence`; single-workspace named layouts
live in `persistence.PerspectiveLibrary`. The Group-level topology library remains a separate lazy owner. Only storage
backends, pane registries, and product preference wiring stay app-local.

## Split/Tab Adapter Boundary

The rendering boundary is an adapter/reconciler pair, not a new layout engine. `Neo.dashboard.dock.projection.LayoutAdapter` consumes the dock-zone model and emits ordinary Neo child configs; `Neo.dashboard.dock.projection.Reconciler` hands surviving live components into that projection without changing their identity. Existing containers still own layout, tabs, and cards.

Adapter, reconciler, and model live under `src/dashboard/dock/`. A further lift into a generic core layout primitive is
governed by ADR 0029 §2.5; consumers do not change the package boundary locally.

Rejected boundaries:

- **Generic core layout primitive:** core layout classes own child arrangement; they do not own dock item identity, stale component recovery, or drag/drop semantics.
- **Tab-container fork:** `Neo.tab.Container` already owns tab button order, card-backed active content, `activeIndex`, and `tabBarPosition`; the adapter feeds it compatible configs and retained live children.
- **Splitter-owned model:** `Neo.component.Splitter` owns sibling-resize mechanics, not persistent topology. The dock document keeps split sizes and edge extents; projected splitters emit semantic terminal operations.
- **Preview producer as adapter owner:** rejected. Drag preview state is runtime-only and converts to semantic operations on drop. The adapter receives committed model changes; it must not depend on hover rectangles or pointer lifecycle state.

### Adapter Input

The adapter input is the persisted model plus a runtime component resolver:

| Input | Source | Boundary |
|---|---|---|
| `model.nodes` / `model.root` | persisted dock-zone document | Structural tree authority. |
| `model.items` | persisted dock-zone item catalog | Stable item identity, titles, policy hints, and optional blueprints. |
| `componentRef` resolver | harness/dashboard runtime | Finds an existing live component or returns null so the adapter can instantiate from `blueprint`. |
| `operation` result | drag/drop or command surface | Already-committed semantic model mutation; not raw hover/preview state. |

The adapter must not read `DOMRect`, `windowId`, pointer coordinates, preview placement, or drag-zone internals while projecting committed layout. Those surfaces belong to drag integration and post-drop mutation.

### Split Projection

`split` nodes project to ordinary Neo containers:

| Dock model field | Adapter projection | Notes |
|---|---|---|
| `orientation: horizontal` | container `layout: {ntype: 'hbox', align: 'stretch'}` | Children render side-by-side. |
| `orientation: vertical` | container `layout: {ntype: 'vbox', align: 'stretch'}` | Children render stacked. |
| `children` | projected child configs in listed order | Ordering is model-owned and serializable. |
| `sizes` | child `flex` values when present | Normalize or ignore invalid ratios before projection. |

Projected `interaction.DockSplitter` instances sit between split children and between resizable edge bands and the center. Pointer-move pixels remain
main-thread runtime state; the terminal emits exactly one `resizeSplit` or `resizeEdgeZone` operation. Escape and
rejection restore presentation and commit nothing.

### Tab Projection

`tabs` nodes project to `Neo.tab.Container`-compatible config:

| Dock model field | Adapter projection | Notes |
|---|---|---|
| `items` | tab/card item configs in listed order | Item order maps to tab button order and card order. |
| `activeItemId` | `activeIndex` derived from `items.indexOf(activeItemId)` | Invalid or missing active item falls back to index `0` when items exist, otherwise `null`. |
| item `title` | child `header.text` or equivalent header config | The title is display text, not identity. |
| item `componentRef` | existing component move or blueprint instantiation | Runtime refs stay outside serialized state. |

The adapter preserves the `Neo.tab.Container` contract: tab headers and card children stay index-aligned, and active
state is index-based at render time even though the persisted dock model is id-based. Every projected tab strip reports
user activation through `setActiveItem`, independently of whether close-action chrome is enabled.

### Component Identity Handoff

`componentRef` is the bridge between saved layout and live ownership:

1. Resolve `componentRef` against the harness/dashboard registry.
2. If a live component exists, move or re-parent that instance into the projected structure without destroying it.
3. If no live component exists and `item.blueprint` exists, instantiate from the blueprint.
4. If neither exists, render a recoverable placeholder, validation error, or other policy-owned fail-safe state, then leave the persisted item record intact for recovery.

This aligns the adapter with stale `componentRef` restore behavior: runtime component references are recoverable state, not a reason to corrupt the persisted dock tree.

Repeated projections add one ownership rule: the adapter remains pure and stateless, while `projection.Reconciler` keys surviving tab containers by `dockNodeId` and moves each pane/header-button pair before moving its retained tab-container ancestor. The reconciler commits those descendant and ancestor handoffs separately; app-local code owns only its pane resolver, animation, and app-specific menu readiness. Workstation and Dock Demo B exercise the same transaction with different pane policies, keeping the projection contract reusable without making `projection.LayoutAdapter` stateful.

The resolver may return either an existing live component or a materializable component config; the reconciler normalizes an inserted config to its one live instance. Once every projected tabs destination is known, a live pane/header-button pair absent from all of them is a **true projection retirement** and is destroyed exactly once. This cleanup cannot infer broader app ownership from a single committed document. A consumer that intentionally retains a pane outside the currently renderable projection — for example, during a popup handoff or as an unrestored `no-live-workspace` topology remainder — must park that live instance with a non-destroying removal before reconciliation. A cache guard that recreates an `isDestroyed` entry is recovery safety, not identity preservation.

## Demand Validation

The contract is justified by two independent shapes:

1. Enterprise desktop migration signal: users expect QT/WPF-class dock/split/tab workspaces in web-delivered software.
2. Agent Institution self-use: operators need persistent workspaces for activity, tasks, memories, chat, strategy, and inspector panes, with panes detachable into OS windows and reintegratable without losing state.

## Executable Evidence

- `test/playwright/unit/dashboard/DockZoneModel.spec.mjs` pins document validation, normalization, every semantic
  operation, persistence refusal, and the final wire family.
- `DockLayoutAdapter.spec.mjs`, `DockWorkspace.spec.mjs`, and `DockSplitter.spec.mjs` pin projection, active-item
  commits, edge affordances, terminal-only resize commits, and cancellation.
- The Workstation and dashboard whitebox journeys exercise live component identity, real pointer gestures, auto-hide
  reveal, and perspective restoration against the same contract.
