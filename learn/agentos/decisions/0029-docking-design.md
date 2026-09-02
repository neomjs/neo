# ADR 0029: Docking Design — Multi-Window Layout Model, Perspectives, Cross-Window Drag

> Architectural Decision Record for the design tier **above** the landed `neo.dock.zone.v1` model contract: the multi-window layout model and its SharedWorker seam, named perspectives across a window topology (carried by `neo.dock.layout.v1`), cross-window drag as semantic operations (`transferItem`), grouped drag (`moveNode` / `transferNode`) and tab overflow, the core-lift disposition, the container contract embedded product surfaces consume, the auto-hide UI contract, and — per the §2.8 amendment (2026-07-16) — the multi-window choreography contracts: the gesture claim protocol, the gesture outcome machine, and vessel lifecycle/admission.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-07-02 (#14423; PR #14425 merged to `dev`). **Re-homed** in the same PR from `learn/agentos/HarnessDockingDesign.md` (contract-doc tier) to decision-record tier after the ADR-0005 `ADR_REQUIRED` audit (operator-flagged, review cycle 3) — see §1 Context for why the authority belongs here. **Renamed** 2026-08-21 from `0029-harness-docking-design.md` (#17503; §2.9): the subsystem is a generic Body capability — the harness misnomer is retired, persisted schema strings stay frozen. **Amended** 2026-08-22 (`#17541`; §2.1): the normative workspace host becomes the engine class `Neo.dashboard.dock.Workspace`. **Amended** 2026-08-31 (`#17969`; §2.7 state table): the *detached* row's `autoHidden` mutual-exclusion clause is retired as an error — detachment and auto-hide are orthogonal, and the exclusion holds structurally in the projection walk rather than as a commit rule. |
| **Author** | @neo-fable-clio (Clio, Claude Fable 5, Claude Code). The cross-window seam contract descends from Discussion #13370's graduated Option-4 convergence (cross-family); the §7 auto-hide contract was written implementation-sufficient for its claimed leaf owner (@neo-opus-grace, #13280). |
| **Resolves** | #14423 — the #13158 design-gate sub: settle the seven shared design questions (layout model, perspectives, cross-window drag, grouped drag/overflow, core-lift disposition, container contract, auto-hide UI) before further implementation lands on the current base (operator direction, 2026-07-02). |
| **Parent epic** | #13158 (*QT-parity docking polish*) under #13012 (Agent Harness). Operator re-ranked 2026-07-02 as an agent-harness cornerstone: the docking shell is the substrate the #13015 FM-UX and #13444 HOME surfaces stand on. |
| **Depends on** | **ADR 0020** (the embodiment vessel — extended, never superseded); the landed model contract ([`learn/agentos/DockZoneModel.md`](../DockZoneModel.md)) realized under `src/dashboard/dock/{model,projection,interaction,persistence,window}`; this ADR is the prescriptive design tier above it. |
| **Connects to** | #13280 (§7's implementation leaf, Grace) · #13444 Institution-Cockpit panes + #13015 FM-UX cards (the §6 container-contract consumers) · #13025 / #13028 (landed window-manager leaves consumed as boundaries by §3 — formalized, not reopened) · Discussion #13370 (graduated 2026-06-15: the seam contract, placement-hint layer, contract-over-lift constraint absorbed here) · `examples/dashboard/dock/` (verification surface, #13247). |
| **Implemented by** | the §5 Decomposition leaves — one Contract-Ledgered leaf per capability, each citing its section here as its upstream contract. |
| **Anti-anchor for** | a **parallel drag system** (every interaction rides the existing preview → operation path); a **dock-aware `DragCoordinator`** (the coordinator arbitrates targets and MUST stay dock-blind); **serialize-and-recreate popout state** (the component exists once in the SharedWorker heap; windows are render targets); **geometry-persisting placement hints** (`windowId`s, rects, monitor coordinates never serialize); a **third collection shape** beside `dockLayoutCollection.v1`; a **core lift before the §2.5 trigger fires**. |

---

## 1. Context

`learn/agentos/DockZoneModel.md` (`dockZone.v1`) is the model contract of record: the serializable dock-zone tree, its semantic operations, the preview payload, and the persistence wrappers. That contract is landed and shipped. What remained, measured against a mature QT/WPF-class docking system, were the polish/parity capabilities the foundation deliberately deferred — and they share design questions no single leaf owns:

1. the full multi-window layout model — which docking state is worker-owned shared truth and which is per-window render projection (§2.1);
2. named perspectives across a multi-window topology (§2.2);
3. cross-window drag as semantic operations (§2.3);
4. grouped drag and tab overflow (§2.4);
5. the disposition of the core-lift clause (§2.5);
6. the container contract embedded product surfaces consume (§2.6);
7. the auto-hide UI contract (§2.7).

**The capability bar** is the [Qt Advanced Docking System](https://github.com/githubuser0xFFFF/Qt-Advanced-Docking-System) interaction set — dock everywhere, auto-hide sidebars, named perspectives, grouped drag, tab overflow — composed with Neo's multi-window reality: Chromium popups sharing one SharedWorker application heap (ADR 0020), where a docked pane detaches into a real OS window and returns as the same live object. Qt-ADS is the bar, not the design: its single-process, single-window-tree assumptions do not survive the worker/multi-window architecture (see §4 Prior Art).

**Design provenance:** Discussion #13370 (graduated 2026-06-15) resolved the cross-window seam contract, the placement-hint layer, and the contract-over-lift constraint absorbed here; issue #14423 carries the criteria mapping. The window-manager leaves #13025 (popup terminal drop) and #13028 (OS-window drag reintegration) are landed and consumed as boundaries — their arbitration substrate is formalized, not reopened, by §2.3.

**Why this is an ADR and not a contract doc (the re-home).** This record settles seven design questions shared by multiple future leaves, defines new persisted shapes (the perspective fields on the `dockLayout` envelope — see the §2.2 amendment — and the durable placement-hint layer) and new semantic operations (`transferItem`, `moveNode`, `transferNode`), dispositions the core-lift clause, and binds implementation leaves to amend-this-first semantics. That crosses ADR 0005's `ADR_REQUIRED` threshold on three prongs: it changes durable persisted shapes, it decomposes into multiple future tickets needing one canonical authority, and without a decision record future V-B-A would require archaeology across leaf PRs. The content initially shipped as a public learning-tree contract page citing Discussion #13370's "Decision Record: OPTIONAL" disposition — but that disposition covered only the narrow landed-seam formalization (the §2.3 duck-type table), not the seven-section settled authority this document became. Review cycle 3 on PR #14425 (operator-flagged) corrected the placement: the authority now lives here in `learn/agentos/decisions/`, and the guide-tree page is removed in the same change. `DockZoneModel.md` keeps its own tier — descriptive contract of record for landed substrate; this ADR is prescriptive authority for the leaves above it.

**Escalation boundary, explicitly named:** if a future leaf needs to *change* `DragCoordinator`'s arbitration semantics — its target-resolution order, its registry shape, or its dock-blindness (§2.3 invariant) — that change **amends this ADR before implementation** (ADR-0005 lifecycle), never lands as a leaf-local decision.

**Section mapping from the superseded draft:** the contract-doc draft this record re-homes used top-level §1–§7; they map 1:1 to this record's §2.1–§2.7. External citations predating the re-home — e.g. #13280's "§7" (auto-hide UI), the #14423 criteria-mapping table's section pointers — resolve via that mapping.

## 2. Decision

### §2.1 Layout Model Formalization — Multi-Window State Space

#### The reducer-container pattern (landed, normative — amended 2026-08-22, `#17541`)

The normative host is the engine class **`Neo.dashboard.dock.Workspace`**
(`src/dashboard/dock/Workspace.mjs`); `examples/dashboard/dock/MainContainer.mjs` is its minimal consumer and
`apps/workstation/` its high-density consumer. New docking workspaces extend it. The class contract:

- **The workspace container** owns the committed dock-zone document (`dockModel`) and its saved-layout collection. It lives in the App Worker heap.
- **`applyDockZoneOperation(descriptor)`** is a pure reducer: `Operations.applyOperation` over the current document. No pointer handler, splitter, or drag surface mutates the document directly.
- **`onDockZoneDocumentChange(document)`** is the view-sync: it stores the committed document and re-projects it
  through `projection.LayoutAdapter.project()` — one atomic ownership transaction per commit, scheduled off the
  settled tail of the refresh chain and reconciled by `projection.Reconciler` so surviving panes keep their identity.
  A failed transaction stays observable on its own commit's promise and never suppresses a later one; a configured
  dock-host reference that resolves to no live host fails loudly.

Interaction surfaces (splitters, drag previews, rail tabs, pin controls) emit **operation descriptors**; the reducer commits them; the view-sync re-projects. This is the only sanctioned mutation path.

A consumer contributes only what is its own, through the class's template hooks: pane resolution, reveal resolution, owner-preserved item ids, pre-refresh chrome sync, extra projection options (the hover-reveal opt-in, a drag-affordance layer's cross-zone seams, tear-out policy), and the reconciler's fast-path options. The tear-out / vessel host half (`openTearOutVessel` … `onWindowDisconnect`) is not part of the class yet: its engine/app boundary is designed with the host owners under epic `#17539` before it lifts. Before this amendment the pattern existed only as the example's code, and each flagship host carried its own copy of the loop — the measurement that motivated the class lives on `#17539`.

#### Workspace topology across windows

A **workspace** is one `dockZone.v1` document owned by one workspace container. Multi-window composition uses two shapes, both landed-substrate-compatible:

1. **Detached item:** `detachItem` removes an item from the tree while preserving its catalog record; the item's component embodies into an OS popup window (the landed pane → popup → pane capability, ADR 0020). The item remains a member of its owning workspace document's catalog; its detachment intent is recorded in the placement-hint layer (below).
2. **Nested workspace:** a popup window may host its own workspace container with its own `dockZone.v1` document (the same shape Dockview documents for popout windows hosting nested layouts). A workspace set is then a worker-owned registry `{workspaceId → document}`.

A browser window — including the primary one — is a **render target**, never a state owner. The SharedWorker heap persists while at least one window remains connected; any single window (including the opener) can close or reload without destroying workspace truth.

#### The placement-hint fields — additive on `neo.dock.layout.v1`

Window placement intent is a **separate hint layer keyed by item id**, never fields inside the dock-zone tree. Its
durable half is additive data inside the layout envelope; it does not mint a standalone schema identity.

| Hint field class | Fields | Persistence |
|---|---|---|
| Durable | item identity, detached-vs-docked intent, `owningWorkspaceId` + perspective id (fulfilling the graduated "owning `dockLayoutId` / perspective" hint at topology scope), semantic `fallbackTarget` (a dock-zone node reference, e.g. "the tabs node that owned me") | Persisted with perspectives (§2.2). |
| Runtime-only | `windowId`, screen rects, monitor geometry, `SortZone` references | Never serialized. Recomputed per session. |

**Fallback is semantic recovery, not geometry:** restoring a detached item whose window cannot be re-created re-enters the item at its `fallbackTarget`; if that node no longer exists, at the nearest surviving ancestor placement; never at stored pixel coordinates.

#### The SharedWorker seam — normative state-class table

| State class | Examples | Owner | Persistence |
|---|---|---|---|
| **Worker-owned shared truth** | committed `neo.dock.zone.v1` documents incl. tab `activeItemId`, split `sizes`, and edge `extent`/`resizable`; the workspace-set registry; `neo.dock.layout.v1` perspectives; `neo.dock.layoutCollection.v1`; durable placement hints; item catalogs incl. `pinned` / `autoHidden` / `locked` and their policy hints | workspace container(s) in the App Worker | Serializable per contract rules |
| **Per-window render projection** | projected config trees; edge rails; splitter affordances; tab headers; placeholder panes | `projection.LayoutAdapter.project()` output per window | Never persisted; derived |
| **Per-window runtime interaction state** | `dockPreview` payloads; reveal/open state of auto-hidden panes (§2.7); hover state; splitter pixel math mid-drag | the window's drag/interaction surfaces | Never persisted; never crosses the seam except as operation descriptors |
| **Main-thread-only state** | DOM nodes; `DOMRect`s; screen coordinates; native window geometry; `getWindowAt` lookups | main-thread addons (`Neo.manager.Window`, `WindowPosition`) | Never persisted; consumed by arbitration (§2.3), results delivered as semantic events |

Every future docking leaf classifies each new piece of state into exactly one row of this table before implementation. State that wants to live in two rows is two pieces of state.

#### Splitter reconciliation (Discussion #13370 OQ3, dispositioned)

`Neo.dashboard.dock.interaction.DockSplitter` extends `Neo.component.Splitter`: the generic parent owns registration,
pointer mechanics, proxy/live presentation, CSS bounds, cancellation, generation fencing, and teardown. The dock
subclass adds only semantic terminals. Split-node affordances commit `resizeSplit`; edge-zone affordances commit
`resizeEdgeZone`. No dock document concept enters the generic component.

#### Committed tab and edge state (amendment, 2026-08-29 — #17838)

The document owns two values that previously looked like projection state:

- A `tabs` node owns `activeItemId`. Every projected tab strip reports user activation through
  `{operation: 'setActiveItem', tabsNodeId, itemId}`, whether close-action chrome is enabled or not. Membership is
  validated against the committed node; invalid descriptors fail closed and restore document truth.
- An edge-zone entry is a nested descriptor `{nodeId, extent?, resizable?}`. `extent` is a normalized fraction and
  `resizable: true` is the explicit permission to project an edge splitter. No parallel edge-size or policy map exists.

Edge pointer frames resize only main-thread presentation under the target band's CSS min/max bounds. Successful release
converts the final pixel size into one normalized `resizeEdgeZone` commit. Escape, stale generation, rejection, and
destruction restore the prior projection and commit zero operations. Split-node `sizes` remain authoritative only for
split nodes; an edge never borrows an ancestor split ratio.

#### Committed item lock state (amendment, 2026-08-31 — #17949)

An item may carry committed `locked: true|false` plus the policy hint `lockable: true|false`;
both are plain JSON booleans in the item catalog and therefore ride saved layouts and perspectives
without a second persistence surface. Missing `locked` means unlocked, and missing `lockable`
means the item may be locked. `setItemLocked` is the sole state transition and fails closed for
unknown items, non-boolean state, and `lockable: false`.

Lock protects the item as a **source** while preserving its role as a target. `closeItem`,
`detachItem`, and source `moveItem` reject a locked item at the model boundary. The existing
`addTab` dispatch downgrades an in-tree item to `moveItem`, so in-strip reorder and cross-zone
movement share that same guard; an unlocked item may still move into a tabs node that contains a
locked peer.

The interaction layer is derived per projection, never persisted: the Workspace makes the live
pane root inert, stamps the stable locked visual token, hides close, and removes the tab button's
`.neo-draggable` source token. A Workspace-owned `WeakMap` records whether the pane already owned
`vdom.inert` and its prior value; unlock restores that exact ownership/value rather than blindly
making independently inert content interactive. These presentation guards improve affordance
honesty, while the reducer remains the independent boundary for stale chrome and programmatic
descriptors.

### §2.2 Named Perspectives

#### Landed baseline

Single-workspace persistence is shipped and closed (fail-closed restore and no-secret metadata enforcement — `createSavedLayout`, `restoreSavedLayout`, `validateSavedLayoutCollection`, `createSavedLayoutCollection`, `upsertSavedLayout`, `selectSavedLayout`, `removeSavedLayout`, `restoreActiveSavedLayout` in `DockZoneModel`). `dockLayoutCollection.v1` already gives one workspace named, switchable layouts. This section extends the semantics to the multi-window topology; it does not reopen the landed wrappers.

#### Capture scope (amendment, 2026-07-11 — #14773: the shipped envelope IS the perspective carrier)

The one persisted perspective carrier is `neo.dock.layout.v1`, extended with `captureScope`, `windowFingerprint`,
`perspectiveName`, and `windowDocuments`; it covers both scopes. No second perspective schema or migration reader exists.
The capability scope this section calls `workspace` is the executable envelope value `captureScope: 'window'`.
Runtime and Neural Link surfaces speak `window | topology` (`Persistence.CAPTURE_SCOPES`, the SSOT).

Two scopes exist. A perspective declares which one it is; there is no implicit scope.

| Scope | Captures | Wrapper |
|---|---|---|
| `workspace` | one workspace document | `neo.dock.layout.v1` with `captureScope: 'window'` (shipped) |
| `topology` | every workspace document in the workspace set **plus** the durable half of the placement-hint layer | `neo.dock.layout.v1` with `captureScope: 'topology'` + `windowDocuments` (multi-document half shipped; hint layer pending, below) |

```json
{
  "schema": "neo.dock.layout.v1",
  "layoutId": "operator-default",
  "perspectiveName": "Operator Default",
  "title": "Operator Default",
  "captureScope": "topology",
  "windowFingerprint": null,
  "dockZone": {},
  "windowDocuments": [],
  "revision": 1,
  "metadata": {}
}
```

Rules, inheriting every `dockLayoutCollection.v1` discipline:

- `dockZone` carries the PRIMARY window's document (slot 0); `windowDocuments` is an array of the ADDITIONAL windows' documents (slots 1..N), valid only on `captureScope: 'topology'` records — each tree validated by the landed path.
- **The durable placement-hint layer is the REMAINING §2.2 obligation** (detached-item intent, `owningWorkspaceId`, semantic `fallbackTarget` — the §2.1 durable set). It lands as ADDITIVE fields on this same envelope when the multi-window restore leaf files — never as a new schema name. A perspective containing `windowId`, screen coordinates, monitor geometry, or rects remains invalid and must be rejected at validation.
- `metadata` is JSON-only, no secrets — enforced by the same `findSecretMetadataKey` class of checks that guards saved layouts.
- Perspective collections reuse `neo.dock.layoutCollection.v1` with `neo.dock.layout.v1` entries; they must not fork another collection or wrapper shape.

#### Restore semantics into a changed window topology

Windows are render targets (§2.1); restoring a perspective restores **worker-owned truth first**, then lets windows catch up:

1. **Validate everything before mutating anything.** Wrapper schema, every inner `dockZone.v1` document, every hint record. Any failure → fail closed: the entire active perspective stays untouched; validation errors surface to the caller. There is no partial restore.
2. **Restore workspace documents** through the landed `restoreSavedLayout()` path, one per captured document (`dockZone` + each `windowDocuments` entry).
3. **Reconcile windows.** A workspace whose window is already open re-projects in place. A workspace or detached item whose window does not exist does **not** auto-spawn one: browser popup creation requires user activation, and a restore MUST NOT depend on popup permission. The content is instead placed by semantic recovery — the detached item re-enters at its `fallbackTarget`; a workspace with no window renders when a window next binds to it — and the restore reports which hints were applied vs recovered, so a switcher UI can offer "open as window" affordances behind a user gesture.
4. **Excess windows** (open windows whose workspace the perspective does not name) keep their workspace documents untouched; the perspective governs only what it captured.

#### Revision migration

`revision` is monotonic per perspective. An unknown wrapper schema version fails closed (keep last-good, surface the
error). A future envelope revision must define its compatibility or migration contract in the same change that
introduces it; silent best-effort upgrades are forbidden. The current greenfield v1 has no compatibility reader.

### §2.3 Cross-Window Drag

#### Landed substrate (verified 2026-07-02)

`Neo.manager.DragCoordinator` already arbitrates cross-window drags today: it holds a two-level registry `sortGroup → windowId → zone`, resolves the window under the pointer via `getWindowAtExcept`, and drives targets through remote-drag hooks (`acceptsRemoteDrag`, `onRemoteDragMove`, `onRemoteDragLeave`, `onRemoteDrop`, `onRemoteDropOut`) plus native-titlebar drag handoff (`getNativeWindowDrag`, `nativeWindowDropCandidates`, `commitNativeWindowDrop` — the landed #13028 reintegration path). It imports `Neo.manager.Base`, `Neo.util.Rectangle`, and `Neo.manager.Window` — nothing dock-specific.

#### The `CrossWindowDragTarget` contract (formalized)

What `DragCoordinator` consumes as an informal duck-type becomes the named, manager-facing contract (Discussion #13370 Option-4 seam, carried verbatim — the graduated "native-titlebar hooks" expand to the four-member participation class below). Any surface that participates in cross-window drags — dashboard sort zones today, dock workspaces next, any future canvas — implements the classes that match its role. The mandatory/optional split below mirrors the landed invocation style: mandatory hooks are invoked bare; participation hooks are optional-chained (`?.`) by the coordinator.

**Registry identity (mandatory, both roles):**

| Member | Kind | Obligation |
|---|---|---|
| `sortGroup` | property | Registry key. Only targets sharing the source's `sortGroup` are candidates. |
| `windowId` | property | The window this surface renders in. |

**Target-side hooks (mandatory for any registered target):**

| Member | Obligation |
|---|---|
| `acceptsRemoteDrag(localX, localY)` | Cheap hit-test in window-local coordinates. No side effects. |
| `onRemoteDragMove(payload)` | Hover feedback for a remote drag over this target (`{draggedItem, localX, localY, offsetX, offsetY, proxyRect}`). |
| `onRemoteDragLeave()` | Clear hover feedback when the drag exits this target or the coordinator switches targets. |
| `onRemoteDrop(draggedItem)` | Commit the drop on the target side. |

**Source-side hooks (mandatory for any source whose drags can cross windows):**

| Member | Obligation |
|---|---|
| `onRemoteDropOut(draggedItem)` | Release the item after a successful remote drop (the cross-document handoff's source half). |
| `suspendWindowDrag(widgetName)` | Suspend the source's drag embodiment when a remote target engages (mid-gesture handoff: the source's proxy/popup yields while a target window hosts the hover) and before a native-window drop commits. Awaited on the commit path. |
| `resumeWindowDrag(widgetName, proxyRect)` | Resume the source's drag embodiment when the drag leaves all remote targets back into the void (re-open the popup/proxy at the supplied rect). |

**Source transition-policy hook (optional):**

| Member | Obligation |
|---|---|
| `resolveRemoteDragTransition(frame)` | Synchronously decide whether the current stable claim may engage, remain visually retained, and commit. `frame` carries `{draggedItem, logicalSourceRect, now, pointerInTarget, targetId, targetRect, targetWindowId}`: the coordinator owns claim truth, the pointer-follow destination, and the live target rect; the source owns resolution of its exact live dragged-vessel rect and any conversion sensor. Return `null` to preserve the legacy path, or exactly `{engage: Boolean, retain: Boolean, commitEligible: Boolean}`. A throw, Promise, or malformed record fails closed. `retain` may preserve visual hover after a raw miss, but `commitEligible` MUST drop immediately. |

The optional policy is source-owned because the source alone can map the dragged semantic item to
its physical vessel identity. For projected dock trees, that mapping rides a synchronous,
clone-safe owner listener; function configs do not enter the serialized SortZone config. The
logical proxy rect is never a substitute for the live vessel rect used by dual-window metrics.

**Native-OS-window participation hooks (optional class — only for surfaces whose items embody as native popup windows, the #13025/#13028 lineage; the coordinator invokes them `?.`-guarded):**

| Member | Obligation |
|---|---|
| `getNativeWindowDrag(windowId)` | Expose the drag payload a detached OS window carries (`{draggedItem, …}`), enabling drop-candidate commit on native window movement. |
| `onTerminalWindowDrop(draggedItem)` | Finalize when a native-window drag terminates as a standalone window (the drag ends detached rather than re-docking). |

**Binding invariant — the coordinator stays dock-blind:** `DragCoordinator` arbitrates *which target* receives the
drag; it MUST NOT import any `Neo.dashboard.dock.*` model, projection, or interaction module, and it never interprets
dock semantics. Changing that boundary amends this ADR before implementation.

**Binding constraint (Discussion #13370 OQ2):** the reusable shape is this **contract**, not a lift of `Neo.draggable.dashboard.SortZone` out of the dashboard layer. Dock workspaces implement the contract; they do not inherit the dashboard sort zone.

#### Dock participation: remote drag → preview → operation

A dock workspace participates by registering a `CrossWindowDragTarget` whose hover path produces `dockPreview` payloads (runtime-only, unchanged contract) and whose drop path converts the final preview through the landed `previewToOperation()` → `applyOperation()` pipeline — the same path in-window drags ride. **No parallel drag system** (inherited guardrail): cross-window dock drags add a target implementation, not a pipeline.

#### Cross-workspace item transfer — `transferItem`

Moving an item between two workspace documents (window A's dock tree → window B's dock tree) is one semantic operation executed by the worker-owned workspace set:

```json
{
  "operation": "transferItem",
  "itemId": "terminal",
  "sourceWorkspaceId": "main",
  "targetWorkspaceId": "popup-1",
  "target": {"operation": "addTab", "tabsNodeId": "side-tabs", "index": 0}
}
```

Semantics, all mandatory:

- **Atomic:** validate against both documents first; then remove from source (tree + catalog) and insert into target (catalog + placement descriptor) and normalize both; commit both documents or neither. A half-transferred item is a contract violation, not an error state.
- **Identity-preserving:** the item record (id, `componentRef`, `title`, `kind`, policy hints, `blueprint`, metadata) travels verbatim. The live component instance is **moved, never re-instantiated** — it exists once in the shared heap throughout (this is the §4 Prior-Art moat behavior; it must never regress to serialize-and-recreate).
- **Hint-layer transaction (conditional on that layer existing):** the currently landed transfer commits the document pair only and MUST NOT place perspective-specific fields inside item records. When §2.2's separate placement-hint layer lands, the worker-owned workspace-set transaction updates its `owningWorkspaceId` / semantic `fallbackTarget` entries atomically with the source and target documents. An adapter that cannot commit all three surfaces publishes the executor's finite documents unchanged.
- **Pipeline-conforming:** a cross-window drop produces `transferItem` from the accepted `dockPreview` exactly as an in-window drop produces `moveItem`/`splitNode`/`addTab`.

`detachItem` (landed) remains the single-document operation for item → OS-window embodiment without a target workspace; `transferItem` is dock-tree → dock-tree across documents.

### §2.4 Grouped Drag + Tab Overflow

**The bar (Qt-ADS):** dragging a title bar moves the whole tabbed group; heavily-tabbed slots expose an overflow menu.

#### Grouped drag — `moveNode` / `transferNode`

The dock tree already models the group: a `tabs` node. Grouped drag therefore moves a **node**, not N items:

- `moveNode` — `{nodeId, targetNodeId, placement}` within one document: re-parents the subtree per the placement descriptor; `normalizeTree` guarantees invariants afterward.
- `transferNode` — the §2.3 `transferItem` semantics applied to a subtree: atomic two-document commit, all member item records travel verbatim, and all live component instances move without re-instantiation. Once the separate hint layer exists, its workspace-set transaction updates one entry per member alongside the document pair; item records remain unchanged.

The preview layer carries grouped intent with one additive, optional, runtime-only field on the existing payload — `groupNodeId` — set when the drag source is a group handle (tab-bar drag surface) rather than a single tab. `dockPreview` stays at `v1`; the field is documented here and remains forbidden in persisted state like every other preview field. Placement kinds are unchanged (`edge-*`, `split-*`, `tab-*` — a group dropped `tab-into` merges its items into the target tabs node in order).

#### Tab overflow

Overflow is a **generic tab-subsystem affordance — not a dock concern, not a model change**. When a `tabs` node's
headers exceed the available extent, the overflowing tabs collapse behind a control whose menu reaches them;
selection commits through the ordinary `setActiveItem` path. `Neo.tab.plugin.Overflow` owns the partition and its
default remains an out-of-collection floating control. Composed headers with an existing action rail may opt into a
stable, focus-independent toolbar contribution instead: it occupies the first action slot only while overflowing,
survives consumer-action replacement, and self-excludes from its own partition/visibility feedback. The dock adapter
only installs that generic plugin mode. Nothing new persists.

### §2.5 Core-Lift Clause Disposition

The model contract's §Ownership Boundary keeps the dock subsystem in `src/dashboard/` — reusable across apps, not yet a core layout primitive — with a further lift gated on "a second independent consumer beyond dashboard adaptation."

**Disposition: DEFER, with the trigger sharpened.** The approaching consumers — Institution Cockpit panes (#13444) and FM-UX cards (#13015) — consume the docking **shell** through the §2.6 container contract; they are consumers *of the dashboard docking subsystem*, not evidence that a dashboard-independent core primitive is needed. Lifting now would duplicate API surface for zero demanding consumer, while the operator-assessed brittleness lives in the interaction layer — which §§2.1–2.4 and §2.7 address by contract, not by relocation.

**The named trigger (fire condition):** a consumer that needs dock semantics **without dashboard adaptation** — concretely, the Portal learning workspace (the model contract's own named candidate) or any consumer that must compose dock trees from non-dashboard containers. When such a consumer files, the lift executes as its own Contract-Ledgered leaf: model + adapter move to a core namespace, `src/dashboard/` re-exports for compatibility, and the §Ownership Boundary section of the model contract is amended in the same change. Until that consumer exists, any lift PR is premature and should be declined citing this section.

### §2.6 Container Contract for Embedded Product Surfaces

The minimal interface between the docking shell and the product surfaces that live inside it. Named consumers: **Institution Cockpit panes (#13444)** and **FM-UX cards (#13015)**. The contract is deliberately interface-minimal; it can absorb steward feedback (the #13015 options thread) without breaking, because every guarantee below is already landed behavior or a §2.1–§2.3 obligation.

| The embedded surface provides | The docking shell guarantees |
|---|---|
| A stable `componentRef` registered with the workspace's resolver | Resolution to the live instance on every projection; the instance is **moved / re-parented, never destroyed** (landed adapter rule) — one conditioned exception, see *User-triggered recreate* below |
| Optionally a `blueprint` — a serializable Neo config for creation-from-saved-state | Instantiation from blueprint when no live instance exists; recoverable placeholder (never silent drop) when neither resolves (landed placeholder + stale-ref policy) |
| Policy hints: `closable`, `pinnable`, `movable` | Enforcement at the operation layer (e.g. `setItemPinned` / `setItemAutoHidden` reject `pinnable === false`; landed) |
| JSON-only `metadata` — no secrets, credentials, functions, DOM, live objects | No-secret validation on every persistence path (landed, #13153 class of checks) |
| Nothing else — no layout knowledge, no dock imports, no preview access | Semantic placement continuity across moves, splits, transfers (§2.3), perspective capture/restore (§2.2), and auto-hide transitions (§2.7); item identity (`dockItemId`) stable across all of them |

Two binding consequences:

- **Panes are layout-blind.** An embedded surface never reads or mutates the dock document, never listens to drag surfaces, and never persists its own placement. It experiences docking exclusively as ordinary Neo component lifecycle (mount/unmount/re-parent) plus its own config updates. A pane that "helps" with layout is a contract violation.
- **Layout is pane-blind.** The shell knows items only as catalog records. Cockpit panes and FM-UX cards add zero cases to the docking code; if a product surface needs a new docking behavior, that behavior enters through an amendment to this ADR, not through a pane-specific branch.

#### User-triggered recreate (amendment, 2026-09-01 — #17966)

The table above guarantees a resolved instance is **moved / re-parented, never destroyed**. That guarantee is unchanged for every shell-initiated operation. This amendment adds one narrow exception and states its **condition**, not merely its permission — the row stays authoritative wherever the condition is unmet.

**The exception.** A pane that does not implement the `dockReload()` delegation contract (#17948) has no recovery path once its own state is wedged: a JS error inside the surface leaves an instance the shell will faithfully re-parent forever. For that case only, a **user-triggered** recreate may destroy the resolved instance and replace it with a fresh one for the same `dockItemId` and slot.

**The condition — a two-phase transaction, or the exception does not apply.**

1. **Prepare.** A fresh candidate is obtained and validated *independently of the live-instance cache*, without touching the live pane. Three failure shapes must each leave the old pane fully intact and settle with a named error: the factory throws, it returns `null`, or it returns the cached — still live — current instance. Rollback is by construction, not by repair: at this point nothing has been destroyed.
2. **Commit.** The card-body slot is replaced through container ownership (`removeAt` + insert), never a bare destroy. `core.Base#destroy` unregisters an instance without removing it from `parent.items`, and the reconciler fills `liveItems` positionally from `body.items` and prefers that entry over `resolveItem` — so a bare destroy can hand an erased object back as the live answer on the next refresh. The old instance is destroyed only after the candidate is live.

**Identity that survives:** `dockItemId`, tab, header actions, and overflow membership. The component *instance* is the only thing this exception permits losing, and only for the item the user acted on — which is why §2.3 placement continuity and §2.2 perspective capture are unaffected.

**Still forbidden:** automatic recreation of any kind — crash detection, watchdogs, retry policies. Those live in consumer territory above the transaction. A shell that recreates without a user action has re-entered the rule this amendment does not touch.

**Retirement condition.** This exception exists only because `dockReload()` is optional. When the delegation contract becomes mandatory for embedded surfaces, or a pane-level error boundary makes a wedged pane recoverable without identity loss, this subsection retires with the leaf that makes it unnecessary and the table row returns to unconditional. Whoever lands that leaf should delete this block rather than qualify it further.

### §2.7 Auto-Hide UI Contract

Grace's #13280 implements this section; it is written to be implementation-sufficient without further design decisions. Sequencing per the leaf owner's decision (2026-07-02): the leaf follows this record.

#### Landed substrate (verified 2026-07-02)

- **Model:** `pinned` / `autoHidden` item fields with committed-state guards — `setItemPinned(true)` clears `autoHidden`; `setItemAutoHidden` rejects non-boolean payloads, `pinnable === false` items, and pinned-open items (`DockZoneModel` lines around `setItemPinned` / `setItemAutoHidden`).
- **Projection:** the adapter already collects committed-auto-hidden items per edge (`collectAutoHiddenItems`), drops them from the tab flow, and projects them as thin **edge rails** of rail tabs carrying `dockItemId` + `dockEdge` (`createEdgeRail` / `createRailTab`). Center-zone items never rail (fail-safe: main content does not auto-hide; a center `autoHidden` item stays visible in its tab flow).

What remains — and what #13280 builds — is the **runtime interaction layer**: reveal, dismiss, pin, and the rail tab as a drag source.

#### State model

| State | Persisted? | Meaning |
|---|---|---|
| `autoHidden: true` | yes (item field) | Committed collapsed: the item renders as a rail tab on its owning edge. |
| `pinned: true` | yes (item field) | Committed open: full pane in the tab flow. Mutually exclusive with `autoHidden` (model-enforced). |
| *revealed* | **never** | Runtime-only overlay state of an auto-hidden item in one window (§2.1 table, row 3). A revealed-but-unpinned item serializes as `autoHidden: true`. |
| *detached* | hint layer (§2.1) | An item embodied in its own OS window. **Orthogonal to `autoHidden`, not exclusive with it** (amended 2026-08-31, `#17969`): `autoHidden` is *residency while docked* — where the item lives **when** it is in the workspace — so `detachItem` carries the flag verbatim and `setItemAutoHidden` does not consult detachment. Clearing it at detach would spend the return address the reintegration row below guarantees ("returns with the committed `pinned` / `autoHidden` values its catalog record carries"), landing a pane torn out of a rail back **expanded** — the wrong home for exactly the users a rail serves. The exclusion this row first asserted still holds, one layer down and more strongly than a commit rule could: rail membership is *derived* by walking the node tree (`collectAutoHiddenItems`), and a detached item is in no tabs node, so it contributes no rail entry whatever its catalog record says. **Corollary — read rail membership only through that walk, never from the catalog flag alone;** a catalog-only reader is wrong here for the same reason it would be wrong between any two commits. **Edge-scoped, and the return guarantee is conditional on it:** `collectAutoHiddenItems` feeds `railsByEdge` per edge zone and there is no center rail, so the return address is spendable only where reintegration lands at an **edge** — an item reintegrated into a center stack keeps its flag verbatim and still renders expanded. |

#### Interaction contract

| Interaction | Behavior |
|---|---|
| Click a rail tab | Transient **reveal**: the pane renders as an **overlay** anchored to its edge — left/right rails reveal full-height, top/bottom rails full-width. The overlay's free dimension uses its owning edge descriptor's committed `extent`; only a never-sized edge uses the workspace fallback (default `0.25`, configurable). Overlay, never push: revealing MUST NOT re-layout the committed projection. Focus moves into the pane. |
| Hover a rail tab | No reveal by default. A workspace MAY opt in via `autoHideRevealOnHover: true` (workspace-level config, not persisted per item); hover-reveal then opens after a short dwell and never steals focus. Default off — hover reveals are an accessibility hazard. |
| Dismiss | Focus leaving the overlay, `Escape`, clicking outside the overlay, or re-clicking the rail tab. Dismiss discards runtime reveal state only; no operation is emitted. |
| Pin control on the revealed overlay | Emits `setItemPinned(itemId, true)` through the reducer — the model clears `autoHidden` (landed guard); the item re-enters the tab flow at its recorded placement; the overlay closes. |
| Collapse control on a pinned/visible pane | Two-step sequence through the reducer, in this order: `setItemPinned(itemId, false)` (when pinned) then `setItemAutoHidden(itemId, true)`. Each step commits independently; the intermediate state (unpinned, visible) is benign and acceptable on step-2 failure. No composite operation is introduced. |
| Drag a rail tab | The rail tab is an ordinary drag source on the existing preview → operation path. A committed drop that re-places the item into the tree flow (any `tab-*` / `split-*` / `edge-*` placement) MUST clear `autoHidden` in the same commit sequence — an item dropped into the tree flow is visible by definition. **One exception:** a drop whose target is another edge's **rail** (identifiable as the rail affordance, `dockNodeType: 'edge-rail'`, not a tree placement) keeps `autoHidden: true` and re-places the item into a tabs node of that edge — the rail is a collapse affordance, so rail-to-rail drag re-targets the collapse edge. |
| Reveal, then drag out of the overlay | Equivalent to rail-tab drag: the overlay closes, the drag proceeds with the same clearing rule. |

Edge association is model-derived: the rail an item collapses to is the edge zone that contains it (landed `collectAutoHiddenItems` walk). Moving which rail an item belongs to is a placement change (`moveItem`), never a rail-side attribute.

#### Composition across windows (Discussion #13370 OQ5, dispositioned)

| Composition | Behavior |
|---|---|
| Auto-hidden item in a multi-window topology | Rails are per-window projections of the owning workspace document (§2.1). The item rails in the window rendering that workspace — exactly one place. |
| Reveal state across windows | Runtime-only and per-window; never mirrored, never persisted. |
| `transferItem` of a railed item (§2.3) | Transfers the catalog record verbatim — including `autoHidden: true`; the item arrives railed on the target's corresponding edge if placed in an edge zone, else the placement descriptor governs and the §2.7 clearing rule applies. |
| Perspective capture (§2.2) | Captures `pinned` / `autoHidden` as committed item state (landed serialization rules); reveal state is invisible to perspectives. |
| Detached window closes (reintegration, #13028 path) | The item re-enters via its `fallbackTarget` hint; it returns with the committed `pinned` / `autoHidden` values its catalog record carries. |

### §2.8 Amendment — Multi-Window Choreography Contracts (2026-07-16, #15240)

> Graduated from Discussion #15204 (§6.2 family-keyed quorum, cycle-4b) into epic #15239; this amendment is the epic's first merge-ordered leaf. It fires the §1 escalation boundary **by design**: the claim protocol below *changes `DragCoordinator`'s target-resolution semantics*, so per this record's own lifecycle the change lands here first — amend, never supersede: every landed section above stays authoritative; this section OWNS the arbitration, gesture-outcome, and vessel-lifecycle semantics the multi-window choreography leaves (#15244, #15245, #15246, #15247, #15248, #15250, #15251, #15252) consume.

#### §2.8.1 The gesture claim protocol (replaces first-intersecting target resolution)

The landed physical resolution — `Window.getWindowAt()` / `getWindowAtExcept()` first-intersecting registered rectangle — resolves overlapping windows by **registration order**, which is nondeterministic under the popup-over-popup story. It is replaced on the dock path by a **session-scoped gesture/claim protocol**, expressed at the coordinator tier in dock-blind terms (registered zone identity, never dock semantics — the §2.3 dock-blindness invariant HOLDS):

- **One gesture token per drag.** The coordinator mints it at gesture start; every claim references it; a token's claims die with its gesture (terminal or cancel).
- **Hit-claims on stable identity.** A target zone acquires a short-lived claim keyed on its **stable workspace/zone identity** — never `windowId`, never registration/insertion order (`windowId` stays runtime-only per §2.1).
- **Validity and expiry.** Claims carry an expiry; a stale (expired) claim is ignored.
- **Deterministic outcomes, all three cases:** *tie* — the earliest valid claim wins; stable-identity lexicographic order is the final tiebreak; *stale* — ignored; *no claim* — **fail closed: no preview, no commit.**
- **The falsifier (binding on the implementing leaf, #15246):** the ≥3-window OVERLAP witness — three overlapping windows, one gesture, exactly **one** preview and exactly **one** commit.

#### §2.8.2 The gesture outcome machine

Every cross-window gesture resolves through one finite state contract:

```
IN_SOURCE → DETACHED_MOVING → HOVERING_CLAIM → { COMMITTED_TARGET | TERMINAL_DETACHED | REJECTED | CANCELLED }
```

Four invariants, all mandatory:

1. **Source cleanup and empty-vessel close occur ONLY after `COMMITTED_TARGET`.** This qualifies §2.3's source-hook table: `onRemoteDropOut(draggedItem)` is invoked **only after a committed remote drop** — the landed behavior in which `DragCoordinator.onDragEnd()` calls it unconditionally while `CrossWindowDragTarget.onRemoteDrop()` may return `null` (a no-commit drop retiring a live source gesture) is the **named forbidden defect** (#15248 enforces).
2. **Reject / no-preview restores or resumes the source with zero model mutation.**
3. **Model commit precedes window close.** A vessel-close failure can neither roll back the committed documents nor double-reintegrate the item (`Container.onWindowDisconnect()` must be idempotent against the committed state).
4. **Exact-once, idempotent cleanup** across every terminal for every surface: preview, claim, candidate timer, `activeTargetZone` (the landed `unregister()` residue is in scope), registration, vessel bookkeeping.

#### §2.8.3 Vessel lifecycle and admission

- **The admission truth:** `windowOpen` returns a **Boolean** — a blocked popup **never throws**, so try/catch-shaped acquisition silently passes its own failure. Spike receipts (#15243) and the acquisition contract (#15245) assert it.
- **The admission state machine binds the FULL chain** — `Boolean open → bounded connect admission → generation revalidation → disconnect correlation` — never the Boolean alone:
  1. `windowOpen === false` ⇒ fail closed per §2.8.2 invariant 2: the gesture degrades to its documented in-window fallback; no orphan vessel state.
  2. `windowOpen === true` opens a **bounded connect window**: the vessel must complete the embodiment handshake (the ADR 0020 connect) within it — **opened-but-never-connected admission fails closed**: the vessel is closed, the gesture degrades per invariant 2, zero model mutation.
  3. **Generation revalidation at connect:** the connecting vessel validates against the CURRENT gesture/session generation — a vessel arriving for a stale generation (its gesture already terminal) is refused and closed; a successor gesture never adopts a predecessor's vessel.
  4. **Disconnect correlation:** every vessel disconnect correlates to its workspace-set entry and the owning gesture's outcome state — a disconnect during `DETACHED_MOVING` / `HOVERING_CLAIM` resolves through the §2.8.2 machine (never a dangling registry entry), and the landed `Container.onWindowDisconnect` reintegration path stays idempotent against already-committed outcomes (§2.8.2 invariant 3).
- **Close is a post-commit render-target effect** — never part of the model transaction (§2.1's worker-truth boundary): closing a vessel unbinds a render target; it does not delete worker documents.
- **The emptied-workspace registry disposition is explicit:** whether an emptied `{workspaceId → document}` entry is retained or retired is decided and named SEPARATELY from closing its OS window (#15247 owns the decision); recovery stays semantic through `fallbackTarget` (§2.1 hints).

#### §2.8.4 Constraints and merge order

- **Placement hints stay additive on `neo.dock.layout.v1`.** Any future schema revision defines compatibility and fail-closed tests atomically.
- **ADR 0034 boundary:** the Electron shell may improve vessel *materialization*; it never forks placement or arbitration semantics.
- **Merge order:** this amendment precedes all consuming implementation — #15244 (G1 tear-out), #15246 (G3 composition/arbitration), #15247 (G4 reintegration/vessel), #15248 (teardown hygiene) cite their §2.8 subsection as upstream contract; the #15243 spike's row 6 binds to §2.8.1's identity requirements without implementing arbitration.

#### §2.8.5 Generic runtime window identity and Neural Link possession (2026-07-18, #15514)

Neural Link addresses windows by the connected App-Worker `windowId`, while the browser main thread owns popup
handles by the semantic `windowName` passed to `Main.windowOpen()`. Those identities are deliberately distinct:

- `manager.Window` remains the runtime topology and geometry observer. Its private entry may carry the reconnect-bounded
  `{targetWindowId, ownerWindowId, opaqueHandleKey}` route plus generic capability facts
  (`focus`, `position`, `resize`, `close`);
  no dock document, workspace, vessel, reintegration, or persistence semantics enter the manager.
  The manager only learns what a window's Main realm publishes, so the dock host
  (`Neo.dashboard.dock.Workspace`) opens that stream itself — movement and resize observation for
  its own render target at construction and for each admitted vessel before ownership publication
  (`observeWindowGeometry`); adopters inherit it rather than arming `WindowPosition` by hand.
- `Main` remains the physical-handle owner. On open, the opener mints a short-lived one-time capability and a separate
  opaque handle key against the exact `WindowProxy`. The target consumes that capability once during the existing
  `getWindowData()` handshake; only then does the opener bind the private key to the target runtime `windowId`. URL,
  `window.name`, semantic name, `appName`, timing, and same-name reuse are never routing authority. Timeout, reload,
  close, reuse, or a mismatched handle invalidates the generation.
- `get_window_topology` projects generic capability booleans, not the private route. Focus, position, resize, and close
  resolve the topology entry inside the App Worker, route the opaque key to the exact owning main thread, and revalidate
  the live generation before touching the native handle.
- Close remains §2.8.3's **post-commit render-target effect** and is separately owner-granted. Generic popups default
  close-unsupported; a product owner may grant physical close only when its semantic return/disposal contract makes
  that effect safe. The Neural Link receipt is terminal only after the connected `windowId` disappears from topology;
  accepting a native `close()` call alone is not completion.
- Every identity and route field in this join is runtime-only and reconnect-bounded. Independently opened, cross-origin,
  stale, or uncorrelated windows remain inspectable where possible but fail closed for physical control.

This is the generic multi-window Possession Interface consumed by inspection tooling. Product code still decides what a
window *means* and which semantic transaction precedes a physical effect.

#### §2.8.6 In-gesture vessel conversion and park (2026-07-19, #15396; amended 2026-07-29, #16117)

Popup-to-proxy conversion is an admitted transition inside the existing outcome machine, not a new
terminal state. A source may enter `HOVERING_CLAIM` only after its physical park effect returns strict
`true`; leaving the claim may resume `DETACHED_MOVING` only after strict re-show admission. Promise
dispatch is provisional authority: conversion and park owners retain their prior state until settlement,
and a stale generation cannot mutate a successor gesture.

The Workstation browser-runtime park binding is **target-cover**, behind generic exact-handle capabilities. Its
admission reads the source's live **outer** extent and the target's live **inner** extent; creation-time dimensions
and equal-size assumptions are not authority:

1. resolve both connected generations from `manager.Window` and require opener-minted routes;
2. require exact target focus and exact source position authority; require exact source resize authority only when the
   source outer frame exceeds the target inner frame on either axis;
3. focus the exact target route first;
4. only after focus admission, pause pointer-follow, drain already-issued physical moves, preserve the source's exact
   outer extent and origin, and — when needed — request a best-effort target-origin pre-position before resizing the
   same exact source handle to
   `{width: min(sourceOuter.width, targetInner.width), height: min(sourceOuter.height, targetInner.height)}`;
5. verify the target realm's observed `outerWidth` / `outerHeight`, move the exact source route to the target origin,
   then refocus the exact target route.

The order is load-bearing. A focus refusal leaves the source untouched and moving. The full-size pre-position is
deliberately non-admitting: Chrome may clamp a frame that cannot yet fit at the requested target origin, so only the
post-resize exact move can admit cover. A resize refusal restores the original extent before pointer-follow resumes. A
final move refusal restores the original origin and extent. A final-refocus refusal re-shows the same source generation;
if that compensation is itself refused, the still-parked generation remains the sole retry authority. Browser
minimum-size clamping therefore fails closed: requested dimensions are never projected into topology truth, and a
non-matching observed extent cannot admit conversion. No effectful half-park needs semantic-name recovery.

Offscreen coordinates are not the browser-runtime default: the macOS/Chrome headed falsifier clamped a requested
far-negative position back onto the visible desktop. The #16117 macOS/Chrome probe instead kept one script-opened popup
alive, shrank its outer `640×546` frame to `360×260`, and restored the exact original frame with zero additional
`window.open` calls. Other platform mechanics remain host seams and require their own #15243 matrix receipts; the exact
observation gate lets an admitting platform use the same state machine and makes a refusing or clamping platform remain
`DETACHED_MOVING`. The §2.8.4 min-axis metric stays size-neutral; target-cover changes only the reversible physical
embodiment needed after that metric proposes conversion.

This amendment does not silently broaden every popup owner. Resize remains least-authority by default and the
Workstation vessel opener grants it explicitly. Demo B keeps its existing source-larger-than-target refusal until its
own owner contract and headed portability matrix deliberately admit a resize binding.

Park and re-show settlement re-enter the dock-blind `DragCoordinator` with the source zone's latest raw pointer and
geometry frame. This continuation is source-owned and latest-frame-only: one successful platform settlement must be
enough to materialize or retire the target proxy even when the hand stops moving; a refusal, reset epoch, or stale
generation emits no replay and never auto-retries an effect.

Convert-out re-shows the **same** connected window through the same opaque handle generation and resumes
physical pointer-follow at the live logical drag origin after restoring the exact pre-conversion outer extent. If no
live origin is supplied, the park owner falls back to its recorded pre-conversion rect. The slot clears only
after strict re-show success. Neither conversion direction owns a popup-acquisition seam, so a continuous
park → re-show journey has zero mid-gesture `windowOpen` attempts by construction.

Terminal disposition remains §2.8.2-owned:

- `COMMITTED_TARGET` consumes the tear-out admission slot, commits model truth first, then closes that exact
  parked route through §2.8.3's post-commit close policy. Strict close refusal retains both cleanup
  authorities for an exact retry; an invalid correlated route never downgrades to same-name close;
- `CANCELLED` / `REJECTED` restore the same vessel, unless an outer tear-out cancellation already retired it,
  in which case the verified retirement settlement clears the park generation without resurrecting it;
- after an admitted convert-out, `TERMINAL_DETACHED` follows the ordinary tear-out terminal and adopts the
  re-shown vessel — no close and no reacquisition.

The baseline binding witness is macOS/Chrome headed and gesture-level on the committed #15243 matrix runner:
one real pointer journey acquires one externally observed tear-out `Page`, parks under a still-focused real
target at the requested physical coordinates, leaves the claim, proves the identical `Page`, runtime
`windowId`, opaque handle, external restore coordinates, and zero additional browser-realm `window.open`
calls, then releases through `TERMINAL_DETACHED`. Unit witnesses additionally pin refusal, latest-frame
replay, stale completion, terminal-during-transition, duplicate terminal, and exact-once retirement
behavior. #16117 adds the ordinary actual-pointer popup-over-popup witness and the non-coverable target-cover matrix;
Windows/Linux headed cells remain honestly owned by #15243.

### §2.9 Amendment — Identity and Schema-Prefix Disposition (2026-08-21, #17503)

> **Superseded 2026-08-29 by the §2.9 v13.2 greenfield amendment below.** Retained as history: its
> compatibility reasoning was correct for a shipped surface, and its own successor-family clause is the
> path the greenfield cut took. The empirical ground that reversed it: npm `13.1.0` shipped only the
> generic root primitives plus three experimental foundation files, so the present subsystem carried no
> deployed durable state and no external compatibility boundary.

The subsystem this record governs is a generic Body capability (`src/dashboard/`), consumed beyond the harness (workstation, `examples/dashboard/*`, portal-candidate consumers); the Agent Harness cockpit is one consumer among several. The record and the model contract doc therefore drop the `Harness` prefix (`0029-docking-design.md`, `DockZoneModel.md`); older prose and external links referring to "harness docking" read as historical.

**Schema strings are wire format and do NOT follow the rename.** The shipped `neo.harness.*` vocabulary, derived from exact source at this amendment (35 occurrences, 8 unique identifiers), splits into two compatibility classes — both keep their names:

- **Persisted envelopes/models** — `dockZone.v1` · `dockLayout.v1` · `dockLayout.v2` · `dockLayoutCollection.v1`: bound by fail-closed restore compatibility. A bare string rename would reject every previously persisted layout and perspective, including deployed consumers'. Renaming happens ONLY inside a shape-changing envelope revision (`dockLayout.v3`+, or a successor family) that introduces `neo.dock.*` in that same change, WITH the documented migration the shipped `v1 → v2` precedent (`migrateSavedLayout`) sets. A find-replace of persisted schema strings outside such a revision is forbidden.
- **Runtime-only contracts** — `dockPreview.v1` · `dockCandidates.v1` · `dockShape.v1` · `dockTopologyShape.v1`: never persisted (the JSON-First Guardrail forbids it), but pinned by cross-window participation, Neural Link, and test consumers. Their rename obligation is consumer-coordinated versioning in one change — lighter than a stored-data migration, still never a silent find-replace.

The §2.1 heading's `neo.dock.windowPlacementHints.v1` is a PROPOSED name only: it has zero runtime occurrences, and the §2.2 amendment supersedes it — the durable hint layer lands as additive fields on the existing envelope, never as a new schema name. Nothing is frozen there, because nothing shipped.

### §2.9 Amendment — The v13.2 Greenfield Hard Cut (2026-08-29, Epic #17836 / Discussion #17818)

The graduated v13.2 architecture executes the successor-family path the 2026-08-21 clause reserved, as a
**hard cut with no migration path**: the operator ruled the subsystem a greenfield product surface, and the
npm `13.1.0` boundary proves no deployed durable state existed to protect.

**Final package and namespace.** The subsystem lives in `src/dashboard/dock/{model,projection,interaction,persistence,window}`
under `Neo.dashboard.dock.*`; folder, class namespace, JSDoc targets, theme identities, and SCSS mirrors
tell one story. Generic `Container`/`Panel` stay frozen at the package root. The former zone-model monolith
is dissolved: `model.Document` owns the committed-document contract (validation, normalization, tree
helpers, fingerprints, the fail-closed commit), `model.Operations` owns the semantic reducer vocabulary and
dispatch, `model.Persistence` owns saved-layout envelopes (capture, wrapper validation, restore), and
`persistence.PerspectiveLibrary` — the former perspective store merged with the collection statics — is the
**sole** collection/perspective authority. `interaction.DockSplitter` keeps its disambiguating name beside
generic `Neo.component.Splitter` and **subclasses it**, inheriting DragZone, live-resize, generation-fence,
and cancel mechanics; dock code owns only document descriptors and one terminal semantic commit, and a
prototype-census control fails if the generic machinery is ever re-implemented locally.

**Final wire family.** One enumerated `neo.dock.*` set replaces `neo.harness.*` outright. The runtime
family is **exactly these seven** — every identity below exists in executable source, and no reserved,
retired, or proposed name belongs in this table:

| Concept | Identity |
|---|---|
| committed dock document | `neo.dock.zone.v1` |
| drag preview | `neo.dock.preview.v1` |
| saved layout (former v1/v2 collapsed) | `neo.dock.layout.v1` |
| drop candidates | `neo.dock.candidates.v1` |
| saved-layout collection | `neo.dock.layoutCollection.v1` |
| per-window shape fingerprint | `neo.dock.shape.v1` |
| aggregate topology shape | `neo.dock.topologyShape.v1` |

The §2.2 placement-hint obligation lands as **additive fields on `neo.dock.layout.v1`** when its leaf
files — never as a new schema name (the §2.2 amendment's own rule); the retired `perspective` wrapper
name exists only as §2.2 history. A future identity enters this table by amending this record, not by
reserving a row.

The former layout v1/v2 wrapper split collapses into one `neo.dock.layout.v1` carrying the perspective
fields; the migration reader and every dual-version branch are **deleted**, not renamed. Negative controls use the
new family (`neo.dock.layout.v2`/`.v999`,
`neo.dock.zone.v2`, `neo.dock.preview.v2`, `neo.dock.layoutCollection.v0`/`.v2`) so they prove
unsupported-**version** rejection, and dedicated controls prove the retired `neo.harness.*` **family** is
rejected fail-closed at both the envelope and collection tiers. No alias, dual parser, or compatibility
branch survives.

Every other contract in this record — worker-owned document truth, per-window projection state,
runtime-only pixels, the dock-blind `DragCoordinator`, semantic-operation commits, JSON-first
persistence — remains in force unchanged.

## 3. Rejected Options

- **Qt-ADS wholesale import** — Qt-ADS is the capability bar, not the design: its single-process, single-window-tree assumptions (native floating windows, one owning widget tree) do not survive the worker-owned/multi-window reality. Rejected in favor of extending `dockZone.v1` semantics.
- **Serialize-and-recreate popout state** (the GoldenLayout answer) — identity loss and transient-state loss on every detach; regresses the landed moat behavior (one live instance in the SharedWorker heap). Rejected as an anti-anchor.
- **Portal-into-child-window rendering** (the FlexLayout / Dockview answer) — live state, but owned by the opener window's main thread: opener reload/close tears down every popout. Neo's heap-owned state makes the workaround class unnecessary. Rejected.
- **Placement hints inside the dock-zone tree** — rejected by Discussion #13370 OQ1: geometry and window identity would leak into persisted documents; the separate hint layer with a durable/runtime split is binding instead.
- **A dock-specific tab container or a third collection shape** — rejected; overflow is a projection affordance on `Neo.tab.Container`, and perspective collections reuse `dockLayoutCollection.v1` verbatim.
- **Lifting `SortZone` or the dock subsystem to core now** — rejected; the reusable shape is the `CrossWindowDragTarget` contract (§2.3), and the core lift stays behind the §2.5 named trigger.

## 4. Prior Art — the 2026-07-02 parity sweep

Sweep of the web docking field against the Qt-ADS bar and the multi-window requirement, per the industry-friction-radar discipline: capability surfaces and friction points are extracted; **no architecture is imported** — every surveyed design assumes a single JS realm owning both state and rendering, which is the assumption Neo's worker architecture removes.

| Capability | [Qt-ADS](https://github.com/githubuser0xFFFF/Qt-Advanced-Docking-System) (bar) | [Dockview](https://dockview.dev/docs/core/groups/popoutGroups/) | [GoldenLayout](https://golden-layout.com/docs/GoldenLayout.html) | [FlexLayout](https://github.com/caplin/FlexLayout) | [rc-dock](https://github.com/ticlo/rc-dock) | [Lumino](https://github.com/jupyterlab/lumino) | Neo target (this ADR) |
|---|---|---|---|---|---|---|---|
| Dock/split/tab + drag preview | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | model + mechanics landed (dockZone.v1); **interaction grain: §4.1** |
| Auto-hide sidebars | ✓ (click/hover reveal, drag to borders) | — | — | — | — | — | landed (§2.7 full arc: rails + click reveal + hover opt-in + pin, e2e-proven; #14654/#14660) |
| Named perspectives | ✓ (save/restore by name) | layout serialize | layout serialize | layout serialize | `saveLayout`/`loadLayout` | — | §2.2 (single-workspace landed; topology-scope reconciler landed, #14668) |
| Grouped drag | ✓ (title bar moves tab group) | — | — | — | — | — | §2.4 (`moveNode`/`transferNode`) |
| Tab overflow | ✓ (dropdown) | — | — | ✓ | — | — | §2.4 (projection affordance) |
| OS-window popout | native floating windows | ✓ popout groups (same-origin `popout.html`) | ✓ popout windows | ✓ popout tabs (`popout.html`) | ✓ popup panel | — | landed (detach/reintegrate, #13025/#13028) |
| **Pane state across the popout boundary** | native (single process) | opener-realm rendering into the child window | **re-created**: "doesn't copy your current component… creates an entirely new one with the same state" | opener-realm via React portals ("code runs in the main window's JS context") | popup supported; continuity mechanism not documented | n/a | **worker-owned: the component exists once in the SharedWorker heap; windows are render targets** |
| Survives opener close/reload with popouts open | n/a (native) | no — popouts are opener-tied | no — popout re-creation is opener-coordinated | no — portals live in the opener's realm | not documented | n/a | yes — heap persists while ≥1 window is connected (§2.1) |
| Mid-gesture drag **between** OS windows | ✓ (native) | — | — | — | — | — | landed (`DragCoordinator` remote-drag arbitration, §2.3) |

Two friction classes recur across the surveyed field and are dispositioned by this design:

1. **The popout state problem.** The field's two answers are serialize-and-recreate (GoldenLayout — identity loss, transient state loss) and portal-into-child-window (FlexLayout, Dockview — live state, but owned by the opener window's main thread: opener reload/close tears down every popout, and the popout's interactivity competes with the opener's main-thread load). Neo's answer is architectural: state lives in a heap owned by **no** window (§2.1), so the question each library answers with a workaround does not arise. As of this sweep, no surveyed library offers window-independent live-state docking; this claim is capability-scoped (not a performance claim) and its re-validation trigger is the next sweep of the same five libraries.
2. **Auto-hide as afterthought.** The most visible Qt-ADS affordance is absent across all five surveyed web libraries. It is specified here (§2.7) as committed model state + per-window runtime reveal — the same seam discipline as everything else, not a bolt-on.

### 4.1 Row-1 interaction grain (amendment, 2026-07-10 — #14934)

**Why this amendment exists.** Row 1 above compressed the entire drag interaction into one cell, and that grain is load-bearing: four independent analysis passes verified "drag preview ✓" at capability-list altitude while the operator's standing bar (#13158: *Qt-Advanced-Docking-System-class*) is **experience**-parity. A checklist row cannot distinguish a drag-preview proxy with parallel-visible dock guides from single-affordance pointer inference — list-parity checks systematically pass what experience-parity demands. Row 1 therefore decomposes into the interaction sub-rows below. The five web-library columns above deliberately STAY at capability grain (their original sweep verdicts stand un-revalidated); the sub-rows grade the bar and this design only — inventing per-library interaction detail without a fresh sweep would repeat the altitude error in the other direction.

| Interaction sub-capability | Qt-ADS (bar) | Neo target (this ADR) — status as of 2026-07-10 |
|---|---|---|
| Drag proxy (visual travels with the pointer) | static pixmap or live-morphing preview proxy | landed in-window (`draggable` SortZone drag proxy); cross-window arbitration landed (§2.3); proxy visual language → #14930 design artifact |
| Drop-indicator overlays | **parallel-visible** 5-position cross + container-edge indicators | single-affordance edge-band idiom (producer resolves ONE placement per hover frame, `dockPreview.v1`); compass-guide vs edge-band is an explicit design disposition owned by #14930 — the bar is a floor, not a blueprint |
| Per-option target-area preview | translucent area preview per indicator | landed single-option at functional grade (accept translucent fill/border, reject red-dashed — `DockPreview`); flagship treatment + the parallel-option question follow the #14930 disposition |
| Tab insertion cues | insertion marker in the target tab bar | landed functional grade (tab before/after markers, `DockPreview`); flagship polish = #14930 |
| Escape-cancel mid-drag | ✓ cancels the gesture | landed — gesture-time Escape capture at the gesture owner shipped via #14980 (`src/main/addon/DragDrop.mjs`); dock-tier routing in `DockKeyboardCommands` + `DockRevealOverlay` (status refreshed 2026-08-21, #17503) |
| Commit animation (drop lands smoothly) | not established by this sweep (the fetched Qt-ADS README documents the drag-preview/indicator tier, not committed-re-layout animation) | Neo house/experience target — above the bar, owned by #14779 (motion contract) + #14929 (FLIP layer), both landed |

**Closure-gate binding.** Epic #13158 MUST NOT resolve without an item-by-item experience-parity matrix against THIS sub-row inventory (plus the surviving capability rows above), each row evidenced by a recorded interaction, an e2e spec, or a live demo beat — evidence links, not assertions. The epic body carries the matching requirement (#14934).

## 5. Consequences — Decomposition, Guardrails, Acceptance

### Decomposition — the leaves this record gates

Per the parent epic's discipline (one Contract-Ledgered leaf per capability), implementation follows as leaves; each cites its section as the upstream contract:

| Leaf | Contract section | Status |
|---|---|---|
| Auto-hide UI: reveal overlay + pin control + rail drag source | §2.7 | landed — #13280 closed; the §4 auto-hide capability row carries the e2e evidence |
| `CrossWindowDragTarget` formalization + dock workspace target + `transferItem` | §2.3 | document-pair participation landed in #14769 / PR #15017; placement-hint integration remains part of §2.2's future workspace-set transaction |
| Topology perspectives: additive hints on `neo.dock.layout.v1` + switcher + restore reconciliation | §2.2 | envelope + model-level capture/collection substrate landed; NL capture/list/restore tools merged (#15019); the placement-hint layer + atomic multi-window restore remain |
| Grouped drag (`moveNode`/`transferNode`) + tab overflow affordance | §2.4 | landed — #14770 (`moveNode`/`transferNode`) + #14850 (tab drag) + #15098 (`Neo.tab.plugin.Overflow`) |
| Core lift to a non-dashboard namespace | §2.5 | **gated** — fires only on the named trigger |
| The engine-owned workspace host (`Neo.dashboard.dock.Workspace`) + per-host migration | §2.1 | class + example landed — `#17541`; the flagship host migrations are leaves of epic `#17539` |
| The three-OS portability spike (matrix contract) | §2.8.1 (row-6 identity binding) + §2.8.3 (admission receipts) | #15243 open (epic #15239; Clio's lane per live assignee) |
| Dock tear-out + acquisition contract | §2.8.2/§2.8.3 + the §2.3 participation contract | #15244 landed; #15245 open (epic #15239) |
| Workspace-set composition + claim arbitration + remote preview | §2.8.1 + §2.1 workspace-set | #15246 landed (epic #15239) |
| Whole-stack reintegration + vessel close policy | §2.8.2/§2.8.3 + §2.4 `transferNode` | #15247 landed (epic #15239) |
| Coordinator teardown hygiene (exact-once terminals) | §2.8.2 invariant 4 | #15248 landed (epic #15239) |
| Neural Link generic window identity + physical focus/position/close | §2.8.5 | #15514 landed |
| Dual-window conversion + in-gesture park/re-show | §2.3 transition-policy hook + §2.8.6 | #15395 / #15396 landed (epic #15239) |

### JSON-First Guardrail (restated, applied)

Inherited unchanged from the model contract's §Serializable vs Runtime State and applied to every shape this record introduces:

- Perspective records (`neo.dock.layout.v1`, §2.2 amendment) persist workspace documents, durable hints, titles, ids, revisions, JSON-only metadata. They MUST NOT contain `DOMRect`s, screen or monitor coordinates, `windowId`s, live components, functions, credentials, or any preview payload.
- Durable placement hints persist intent and semantic targets only; every geometric or window-identity field is runtime-only (§2.1 hint table).
- `dockPreview` (including the §2.4 `groupNodeId` field) remains runtime-only in its entirety.
- Reveal/open state of auto-hidden panes is never serialized (§2.7).
- All landed enforcement (adapter preview-key rejection, no-secret metadata validation, fail-closed restore) extends to the new shapes as a leaf-implementation obligation.

### Acceptance Boundaries

This record satisfies the design-tier ticket (#14423) when:

- the SharedWorker seam is stated as a normative state-class table (§2.1);
- perspective semantics define capture scope, cross-topology restore, and fail-closed behavior (§2.2);
- cross-window drag is defined as semantic operations riding the existing preview → operation path, with the coordinator dock-blind and no parallel drag system (§2.3);
- grouped drag and overflow have a leaf-implementable contract (§2.4);
- the core-lift clause is dispositioned with a named trigger (§2.5);
- the container contract names its two consumers and their minimal interface (§2.6);
- the auto-hide UI contract is implementation-sufficient for #13280 (§2.7);
- every Discussion #13370 graduated criterion maps to a section here or to named post-spec decomposition (the #14423 mapping table);
- the JSON-first guardrail is restated and applied to every new persisted shape.

Implementation leaves begin after this record merges; a leaf that contradicts a section here **amends this ADR first**, in its own reviewed change (ADR-0005 lifecycle).
