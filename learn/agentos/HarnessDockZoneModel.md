# Agent Harness Dock-Zone Model Contract

`@summary` Minimal model contract for Agent Harness docking: a serializable dock-zone tree that composes with Neo's existing dashboard, layout, JSON blueprint, and multi-window drag substrates without introducing a parallel docking engine.

## Scope

This contract is the first concrete slice of the QT-grade docking line under the Agent Harness. It defines the data model that future rendering, preview, and persistence slices consume.

This document does not implement drag previews, split/tab rendering, layout persistence, or cross-window choreography. Those are follow-up leaves. This slice exists so those leaves do not invent incompatible object models.

The preview-state section below records the follow-up drag-to-dock contract. It still defines data shape only: no renderer, event listener, persistence writer, or drag manager lives here.

## Existing Substrates

The contract composes with these current Neo substrates:

| Substrate | Current authority | Contract implication |
|---|---|---|
| Declarative layouts | `learn/guides/uibuildingblocks/Layouts.md`, `src/layout/HBox.mjs`, `src/layout/VBox.mjs`, `src/layout/Card.mjs` | Dock splits map to `hbox` / `vbox`; tabbed slots map to a tab header plus `card`-style active content. |
| JSON-first UI state | `learn/benefits/body/JSONFirstUIs.md`, `learn/gettingstarted/DescribingTheUI.md` | Persist only pure JSON. Runtime component instances, DOMRects, and window objects stay out of the serialized model. |
| Dashboard drag substrate | `src/dashboard/Container.mjs`, `src/draggable/dashboard/SortZone.mjs` | Future dock rendering should adapt this model into dashboard/sort-zone mechanics instead of forking drag handling. |
| Cross-window geometry | `src/manager/Window.mjs`, `src/manager/DragCoordinator.mjs`, `src/main/addon/WindowPosition.mjs` | Dock drop targeting uses existing screen-coordinate and remote-drag authority. The model stores the accepted result, not transient geometry. |
| Harness self-use | `apps/agentos/view/Viewport.mjs`, ADR 0020 | The first independent use shape is the Agent Harness operator cockpit: strategy, swarm, intervention, terminal, transcript, and inspector panes arranged as a persistent workspace. |

No dedicated dock manager exists today. ADR 0020 names QT-grade docking as a gap, and the KB/source sweep found dashboard drag and layout primitives but no generic `DockManager`.

## Ownership Boundary

The model is a harness product contract that lives in the dashboard layer (`src/dashboard/`), not a new core layout primitive yet.

Initial durable surface: this document.

**Resolved (operator, 2026-06-13):** the dock-zone subsystem lives in `src/dashboard/` — `Neo.dashboard.DockZoneModel` (the executor) co-located with `Neo.dashboard.DockLayoutAdapter` (the renderer) — reusable across apps. Dock zones are a Neo layout topic available to other apps, not a harness-app-private concern; only app-specific pane wiring / persistence glue stays in the harness app. The decision tree below is the rationale that led here — its conditional "harness app layer" model placement (option 1) and the "second independent in-repo consumer required before lifting" gate (option 2) are superseded by this decision.

The rationale that resolved to the dashboard layer:

1. If the first implementation only proves Agent Harness workspace persistence with app-specific pane wiring or persistence glue, place that app-specific code in the harness app layer and keep the model documented here.
2. If the first implementation is a reusable projection adapter that consumes dashboard/container/tab primitives and emits ordinary Neo configs, place the adapter in the dashboard layer while keeping the model contract here. A second independent in-repo use is still required before lifting the model/parser or public API beyond dashboard adaptation. Candidate second use: the Portal learning workspace, where docs, Monaco/live preview, output panes, and inspectors benefit from saveable split/tab workspaces.
3. Only after reusable behavior exceeds dashboard adaptation should a generic core layout primitive be considered.

Rejected alternatives:

- **Core `src/layout/Dock` first:** rejected. Layout classes arrange existing children; they do not own drag, remote-window handoff, component re-parenting, or persistence semantics.
- **Dashboard-only implicit state:** rejected. `Dashboard` already moves live components, but without a serializable model contract it cannot become a stable blueprint/persistence surface.
- **External docking-library object model:** rejected. Neo must preserve worker-owned JSON, live component identity, and multi-window object continuity.
- **Pixel-absolute workspace persistence:** rejected. Persist semantic splits/tabs/order; runtime pixels and preview rectangles are derived state.

## Data Model

The persisted document is a versioned JSON object:

```json
{
  "schema": "neo.harness.dockZone.v1",
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
        "center": "main-tabs",
        "right": "side-split"
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
| `edge-zone` | `zones` | Root or nested edge container with `top`, `right`, `bottom`, `left`, and/or `center` entries. Missing zones are empty. | A future adapter composes edge bands around the center with `vbox`/`hbox`. |
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
- node ids, types, zone mapping, split orientation, split child order, normalized split sizes
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

## Named Layout Collections / Perspectives

Named perspectives collect multiple saved layouts without choosing a storage backend or rendering a switcher. Current writers place the `dockLayout.v2` envelope inside the unchanged collection shape:

```json
{
  "schema": "neo.harness.dockLayoutCollection.v1",
  "activeLayoutId": "operator-default",
  "layouts": {
    "operator-default": {
      "schema": "neo.harness.dockLayout.v2",
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

Legacy `dockLayout.v1` entries remain valid on the read path only. `migrateSavedLayout()` upgrades them to v2 with the honest defaults `captureScope: 'window'` and `windowFingerprint: null`; no writer emits v1.

## Operations

Future implementations should mutate the model through semantic operations instead of direct tree surgery in UI handlers:

| Operation | Inputs | Result |
|---|---|---|
| `moveItem` | `itemId`, `targetNodeId`, `index` | Reorders an item within a tab slot or split-derived target. |
| `splitNode` | `targetNodeId`, `orientation`, `beforeNodeId`, `afterNodeId`, `sizes` | Replaces a node with a split containing the old and new nodes. |
| `resizeSplit` | `splitNodeId`, `sizes` | Updates an existing split node's normalized child sizes after a splitter affordance. |
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

Future drag-to-dock preview slices should listen to existing drag surfaces and produce a transient `dockPreview` object:

```json
{
  "schema": "neo.harness.dockPreview.v1",
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
| `schema` | Preview payload version, initially `neo.harness.dockPreview.v1`. | Runtime only. |
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

The contract is deliberately JSON-first. A future renderer can project the model into Neo configs without changing the persisted shape:

- `split.orientation: horizontal` -> container `layout: {ntype: 'hbox', align: 'stretch'}`
- `split.orientation: vertical` -> container `layout: {ntype: 'vbox', align: 'stretch'}`
- `split.sizes` -> child `flex` values
- `tabs.items` -> tab header order plus card children
- `activeItemId` -> active card index derived from `items.indexOf(activeItemId)`

The adapter must treat `componentRef` as the stable bridge between persisted layout and live component ownership. When no live component exists, the adapter may instantiate from `item.blueprint`; when a live component exists, it should move/re-parent the instance without destroying it, matching the existing dashboard and multi-window precedent.

If neither a live component nor a valid `item.blueprint` exists, the adapter must follow the stale-component-reference policy above instead of silently dropping the item.

## Layout Persistence Boundary

Layout persistence owns saved workspace documents, not drag-time state or component lifetime.

A persisted layout is a small versioned wrapper around the normalized dock-zone model. Current writers emit v2:

```json
{
  "schema": "neo.harness.dockLayout.v2",
  "layoutId": "operator-default",
  "title": "Operator Default",
  "dockZone": {
    "schema": "neo.harness.dockZone.v1",
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
- `dockZone`: a normalized `neo.harness.dockZone.v1` model after semantic operations have run.
- `captureScope`: `window` for one document or `topology` for a multi-window capture.
- `windowFingerprint`: JSON-only topology-shape evidence, or `null` when a legacy v1 record had no captured fingerprint.

Optional wrapper fields:

- `revision`: monotonic revision, content version, or adapter-owned equivalent used for conflict/recovery messaging.
- `metadata`: JSON-only descriptive data. It must not contain DOM nodes, functions, live component instances, credentials, PATs, access tokens, or harness bridge tokens.
- `perspectiveName`: a non-empty display name when the wrapper is used as a named perspective.
- `windowDocuments`: additional normalized dock-zone documents, valid only for `captureScope: 'topology'`; the primary document remains in `dockZone`.

Schema-name row (the canonical vocabulary both tiers share — the design record's capture-scope amendment is the prescriptive side of this row):

| Schema | Role | Notes |
|---|---|---|
| `neo.harness.dockLayout.v1` | legacy saved-layout wrapper | read-path only; migrates forward with honest defaults |
| `neo.harness.dockLayout.v2` | THE saved-layout AND perspective wrapper | adds `captureScope` (`window` \| `topology`), `windowFingerprint`, `perspectiveName`, `windowDocuments`; there is no separate perspective schema — the envelope carries the capability |
| `neo.harness.dockLayoutCollection.v1` | the one named-collection shape | perspective collections reuse it verbatim; no third collection shape exists |

Persistence consumes only committed dock-zone state. It must not serialize `dockPreview`, hover rectangles, screen coordinates, `windowId`, `sourceSortZone`, `targetSortZone`, runtime hover/open state for auto-hidden panes, live components, event listeners, controllers, functions, or credential material. If a future detached-window slice needs restore hints, those hints must be separate semantic placement metadata; they must not turn the dock layout into an OS-window session dump.

Restore must validate the wrapper schema, the inner dock-zone schema, and the normalized model invariants before replacing an active layout. Unsupported wrapper versions, unsupported dock-zone versions, invalid references, or invalid split/tab invariants fail closed: keep the last-good active layout and surface validation or recovery state to the caller.

Component recovery remains the adapter's responsibility. A restored item with an unresolved `componentRef` follows the stale component reference policy above: preserve the item record and semantic placement long enough for validation, explicit recovery, placeholder rendering, or intentional removal. Persistence must not silently drop the item or rewrite the dock tree to hide the missing component.

First implementation ownership may be harness-local when the storage backend, pane registry, or preference wiring is specific to the Agent Harness. Reusable import/export, validation, or storage projection logic should follow the dock-zone relocation path into `src/` only after the source-placement decision has landed and a second in-repo consumer proves the logic is not harness-specific.

## Split/Tab Adapter Boundary

The rendering boundary is an adapter/reconciler pair, not a new layout engine. `Neo.dashboard.DockLayoutAdapter` consumes the dock-zone model and emits ordinary Neo child configs; `Neo.dashboard.DockProjectionReconciler` hands surviving live components into that projection without changing their identity. Existing containers still own layout, tabs, and cards.

Adapter, projection reconciler, and model live in the dashboard layer (`src/dashboard/`) — per the operator's 2026-06-13 placement decision (see §Ownership Boundary), the dock-zone subsystem is a reusable Neo layout topic, not harness-app-private. A *further* lift into a generic core layout primitive (beyond dashboard adaptation) still requires a second independent in-repo consumer and source evidence that the logic is reusable outside dashboard adaptation.

Rejected placements for the first adapter:

- **Generic core layout primitive:** rejected for this slice. Core layout classes own child arrangement; they do not yet need to own dock item identity, stale component recovery, drag-drop producer handoff, or future blueprint persistence.
- **Tab-container fork:** rejected. `Neo.tab.Container` already owns tab button order, card-backed active content, `activeIndex`, and `tabBarPosition`; the adapter/reconciler pair should feed it compatible child/header configs and retained live children rather than create a harness-only tab system.
- **Splitter-owned model:** rejected. `Neo.component.Splitter` is a resize affordance for existing siblings, not the authority for persistent split topology. The model keeps split orientation, child order, and normalized sizes; splitters may render between children later.
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

Resizable splitters are a later rendering affordance. When added, they should sit between projected children and write back semantic size changes through `resizeSplit`, not mutate persisted `sizes` directly from pointer handlers.

### Tab Projection

`tabs` nodes project to `Neo.tab.Container`-compatible config:

| Dock model field | Adapter projection | Notes |
|---|---|---|
| `items` | tab/card item configs in listed order | Item order maps to tab button order and card order. |
| `activeItemId` | `activeIndex` derived from `items.indexOf(activeItemId)` | Invalid or missing active item falls back to index `0` when items exist, otherwise `null`. |
| item `title` | child `header.text` or equivalent header config | The title is display text, not identity. |
| item `componentRef` | existing component move or blueprint instantiation | Runtime refs stay outside serialized state. |

The adapter must preserve the current `Neo.tab.Container` contract: tab headers and card children stay index-aligned, and active state is index-based at render time even though the persisted dock model is id-based.

### Component Identity Handoff

`componentRef` is the bridge between saved layout and live ownership:

1. Resolve `componentRef` against the harness/dashboard registry.
2. If a live component exists, move or re-parent that instance into the projected structure without destroying it.
3. If no live component exists and `item.blueprint` exists, instantiate from the blueprint.
4. If neither exists, render a recoverable placeholder, validation error, or other policy-owned fail-safe state, then leave the persisted item record intact for recovery.

This aligns the adapter with stale `componentRef` restore behavior: runtime component references are recoverable state, not a reason to corrupt the persisted dock tree.

Repeated projections add one ownership rule: the adapter remains pure and stateless, while `DockProjectionReconciler` keys surviving tab containers by `dockNodeId` and moves each pane/header-button pair before moving its retained tab-container ancestor. The reconciler commits those descendant and ancestor handoffs separately; app-local code owns only its pane resolver, animation, and app-specific menu readiness. Workstation and Dock Demo B exercise the same transaction with different pane policies, keeping the projection contract reusable without making `DockLayoutAdapter` stateful.

## Demand Validation

The contract is justified by two independent shapes:

1. Enterprise desktop migration signal: users expect QT/WPF-class dock/split/tab workspaces in web-delivered software.
2. Agent Harness self-use: operators need persistent workspaces for fleet, transcript, terminal, strategy, preview, and inspector panes, with panes detachable into OS windows and reintegratable without losing state.

The Portal learning workspace is the next in-repo validation candidate before lifting any implementation into a generic core primitive.

## Acceptance Boundaries

This contract satisfies the model-contract leaf when:

- the tree covers edge zones, nested splits, tabbed slots, stable item identity, and serializable ordering
- ownership is documented as harness-contract-first, dashboard-adapter-second, core-layout-last
- serializable fields are separated from drag/preview/window runtime state
- a second independent use shape is named
- the split/tab adapter boundary is documented as model-in / existing-Neo-primitive-out
- no preview UI, persistence implementation, or concrete split/tab rendering component is bundled into this slice

The preview-state follow-up satisfies its leaf when:

- `dockPreview` covers edge targets, split orientation/ratio, tab placement, rejected targets, stable item identity, and target container identity
- allowed producers are existing drag, sort-zone, drag-coordinator, and window-geometry signals
- forbidden producers prevent a parallel docking drag system
- preview-only fields are explicitly runtime-only and are not serialized
- downstream consumers for rendering, drop handling, and persistence are named

The layout-persistence follow-up satisfies its leaf when:

- a saved layout wrapper is defined separately from the inner dock-zone model
- wrapper schema, layout identity, display title, and normalized `dockZone` payload are named
- restore fails closed on unsupported schema or invalid saved state
- stale `componentRef` recovery delegates to the adapter policy instead of duplicating restore semantics
- runtime preview/window/component/credential state remains outside persisted layout data

If a future PR introduces new `.mjs` files for this contract, it must run `structural-pre-flight` before choosing the destination.
