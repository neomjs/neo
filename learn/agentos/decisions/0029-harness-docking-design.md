# ADR 0029: Harness Docking Design — Multi-Window Layout Model, Perspectives, Cross-Window Drag

> Architectural Decision Record for the design tier **above** the landed `dockZone.v1` model contract: the multi-window layout model and its SharedWorker seam, named perspectives across a window topology (carried by the `dockLayout.v2` envelope per the §2.2 amendment), cross-window drag as semantic operations (`transferItem`), grouped drag (`moveNode` / `transferNode`) and tab overflow, the core-lift disposition, the container contract embedded product surfaces consume, the auto-hide UI contract, and — per the §2.8 amendment (2026-07-16) — the multi-window choreography contracts: the gesture claim protocol, the gesture outcome machine, and vessel lifecycle/admission. It settles the questions the remaining docking capability leaves share and cannot answer coherently one leaf at a time. Everything is **additive on the landed `dockZone.v1` model — not a redesign**: where this record names a new schema or operation, it extends the existing family; it never alters a landed shape.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-07-02 (#14423; PR #14425 merged to `dev`). **Re-homed** in the same PR from `learn/agentos/HarnessDockingDesign.md` (contract-doc tier) to decision-record tier after the ADR-0005 `ADR_REQUIRED` audit (operator-flagged, review cycle 3) — see §1 Context for why the authority belongs here. |
| **Author** | @neo-fable-clio (Clio, Claude Fable 5, Claude Code). The cross-window seam contract descends from Discussion #13370's graduated Option-4 convergence (cross-family); the §7 auto-hide contract was written implementation-sufficient for its claimed leaf owner (@neo-opus-grace, #13280). |
| **Resolves** | #14423 — the #13158 design-gate sub: settle the seven shared design questions (layout model, perspectives, cross-window drag, grouped drag/overflow, core-lift disposition, container contract, auto-hide UI) before further implementation lands on the current base (operator direction, 2026-07-02). |
| **Parent epic** | #13158 (*QT-parity docking polish*) under #13012 (Agent Harness). Operator re-ranked 2026-07-02 as an agent-harness cornerstone: the docking shell is the substrate the #13015 FM-UX and #13444 HOME surfaces stand on. |
| **Depends on** | **ADR 0020** (the embodiment vessel — extended, never superseded); the landed **`dockZone.v1` model contract** ([`learn/agentos/HarnessDockZoneModel.md`](../HarnessDockZoneModel.md)) — that document remains the contract of record for landed substrate (`src/dashboard/DockZoneModel.mjs`, `src/dashboard/DockLayoutAdapter.mjs`, `src/dashboard/DockSplitter.mjs`, `apps/agentos/view/DockPreview.mjs`); this ADR is the prescriptive design tier above it. |
| **Connects to** | #13280 (§7's implementation leaf, Grace) · #13444 Institution-Cockpit panes + #13015 FM-UX cards (the §6 container-contract consumers) · #13025 / #13028 (landed window-manager leaves consumed as boundaries by §3 — formalized, not reopened) · Discussion #13370 (graduated 2026-06-15: the seam contract, placement-hint layer, contract-over-lift constraint absorbed here) · `examples/dashboard/dock/` (verification surface, #13247). |
| **Implemented by** | the §5 Decomposition leaves — one Contract-Ledgered leaf per capability, each citing its section here as its upstream contract. |
| **Anti-anchor for** | a **parallel drag system** (every interaction rides the existing preview → operation path); a **dock-aware `DragCoordinator`** (the coordinator arbitrates targets and MUST stay dock-blind); **serialize-and-recreate popout state** (the component exists once in the SharedWorker heap; windows are render targets); **geometry-persisting placement hints** (`windowId`s, rects, monitor coordinates never serialize); a **third collection shape** beside `dockLayoutCollection.v1`; a **core lift before the §2.5 trigger fires**. |

---

## 1. Context

`learn/agentos/HarnessDockZoneModel.md` (`dockZone.v1`) is the model contract of record: the serializable dock-zone tree, its semantic operations, the preview payload, and the persistence wrappers. That contract is landed and shipped. What remained, measured against a mature QT/WPF-class docking system, were the polish/parity capabilities the foundation deliberately deferred — and they share design questions no single leaf owns:

1. the full multi-window layout model — which docking state is worker-owned shared truth and which is per-window render projection (§2.1);
2. named perspectives across a multi-window topology (§2.2);
3. cross-window drag as semantic operations (§2.3);
4. grouped drag and tab overflow (§2.4);
5. the disposition of the core-lift clause (§2.5);
6. the container contract embedded product surfaces consume (§2.6);
7. the auto-hide UI contract (§2.7).

**The capability bar** is the [Qt Advanced Docking System](https://github.com/githubuser0xFFFF/Qt-Advanced-Docking-System) interaction set — dock everywhere, auto-hide sidebars, named perspectives, grouped drag, tab overflow — composed with Neo's multi-window reality: Chromium popups sharing one SharedWorker application heap (ADR 0020), where a docked pane detaches into a real OS window and returns as the same live object. Qt-ADS is the bar, not the design: its single-process, single-window-tree assumptions do not survive the worker/multi-window architecture (see §4 Prior Art).

**Design provenance:** Discussion #13370 (graduated 2026-06-15) resolved the cross-window seam contract, the placement-hint layer, and the contract-over-lift constraint absorbed here; issue #14423 carries the criteria mapping. The window-manager leaves #13025 (popup terminal drop) and #13028 (OS-window drag reintegration) are landed and consumed as boundaries — their arbitration substrate is formalized, not reopened, by §2.3.

**Why this is an ADR and not a contract doc (the re-home).** This record settles seven design questions shared by multiple future leaves, defines new persisted shapes (the perspective fields on the `dockLayout` envelope — see the §2.2 amendment — and the durable placement-hint layer) and new semantic operations (`transferItem`, `moveNode`, `transferNode`), dispositions the core-lift clause, and binds implementation leaves to amend-this-first semantics. That crosses ADR 0005's `ADR_REQUIRED` threshold on three prongs: it changes durable persisted shapes, it decomposes into multiple future tickets needing one canonical authority, and without a decision record future V-B-A would require archaeology across leaf PRs. The content initially shipped as a public learning-tree contract page citing Discussion #13370's "Decision Record: OPTIONAL" disposition — but that disposition covered only the narrow landed-seam formalization (the §2.3 duck-type table), not the seven-section settled authority this document became. Review cycle 3 on PR #14425 (operator-flagged) corrected the placement: the authority now lives here in `learn/agentos/decisions/`, and the guide-tree page is removed in the same change. `HarnessDockZoneModel.md` keeps its own tier — descriptive contract of record for landed substrate; this ADR is prescriptive authority for the leaves above it.

**Escalation boundary, explicitly named:** if a future leaf needs to *change* `DragCoordinator`'s arbitration semantics — its target-resolution order, its registry shape, or its dock-blindness (§2.3 invariant) — that change **amends this ADR before implementation** (ADR-0005 lifecycle), never lands as a leaf-local decision.

**Section mapping from the superseded draft:** the contract-doc draft this record re-homes used top-level §1–§7; they map 1:1 to this record's §2.1–§2.7. External citations predating the re-home — e.g. #13280's "§7" (auto-hide UI), the #14423 criteria-mapping table's section pointers — resolve via that mapping.

## 2. Decision

### §2.1 Layout Model Formalization — Multi-Window State Space

#### The reducer-container pattern (landed, normative)

The landed runtime shape (`examples/dashboard/dock/MainContainer.mjs`) is the normative ownership pattern for every docking workspace:

- **The workspace container** owns the committed dock-zone document (`dockModel`) and its saved-layout collection. It lives in the App Worker heap.
- **`applyDockZoneOperation(descriptor)`** is a pure reducer: `DockZoneModel.applyOperation` over the current document. No pointer handler, splitter, or drag surface mutates the document directly.
- **`onDockZoneDocumentChange(document)`** is the view-sync: it stores the committed document and re-projects it through `DockLayoutAdapter.project()`.

Interaction surfaces (splitters, drag previews, rail tabs, pin controls) emit **operation descriptors**; the reducer commits them; the view-sync re-projects. This is the only sanctioned mutation path.

#### Workspace topology across windows

A **workspace** is one `dockZone.v1` document owned by one workspace container. Multi-window composition uses two shapes, both landed-substrate-compatible:

1. **Detached item:** `detachItem` removes an item from the tree while preserving its catalog record; the item's component embodies into an OS popup window (the landed pane → popup → pane capability, ADR 0020). The item remains a member of its owning workspace document's catalog; its detachment intent is recorded in the placement-hint layer (below).
2. **Nested workspace:** a popup window may host its own workspace container with its own `dockZone.v1` document (the same shape Dockview documents for popout windows hosting nested layouts). A workspace set is then a worker-owned registry `{workspaceId → document}`.

A browser window — including the primary one — is a **render target**, never a state owner. The SharedWorker heap persists while at least one window remains connected; any single window (including the opener) can close or reload without destroying workspace truth.

#### The placement-hint layer — `neo.harness.windowPlacementHints.v1`

Resolved by Discussion #13370 (OQ1) and bound here: window placement intent is a **separate hint layer keyed by item id**, never fields inside the dock-zone tree.

| Hint field class | Fields | Persistence |
|---|---|---|
| Durable | item identity, detached-vs-docked intent, `owningWorkspaceId` + perspective id (fulfilling the graduated "owning `dockLayoutId` / perspective" hint at topology scope), semantic `fallbackTarget` (a dock-zone node reference, e.g. "the tabs node that owned me") | Persisted with perspectives (§2.2). |
| Runtime-only | `windowId`, screen rects, monitor geometry, `SortZone` references | Never serialized. Recomputed per session. |

**Fallback is semantic recovery, not geometry:** restoring a detached item whose window cannot be re-created re-enters the item at its `fallbackTarget`; if that node no longer exists, at the nearest surviving ancestor placement; never at stored pixel coordinates.

#### The SharedWorker seam — normative state-class table

| State class | Examples | Owner | Persistence |
|---|---|---|---|
| **Worker-owned shared truth** | committed `dockZone.v1` documents; the workspace-set registry; `dockLayout.v2` wrappers (perspectives incl., §2.2 amendment); `dockLayoutCollection.v1`; durable placement hints; item catalogs incl. `pinned` / `autoHidden` | workspace container(s) in the App Worker | Serializable per contract rules |
| **Per-window render projection** | projected config trees; edge rails; splitter affordances; tab headers; placeholder panes | `DockLayoutAdapter.project()` output per window | Never persisted; derived |
| **Per-window runtime interaction state** | `dockPreview` payloads; reveal/open state of auto-hidden panes (§2.7); hover state; splitter pixel math mid-drag | the window's drag/interaction surfaces | Never persisted; never crosses the seam except as operation descriptors |
| **Main-thread-only state** | DOM nodes; `DOMRect`s; screen coordinates; native window geometry; `getWindowAt` lookups | main-thread addons (`Neo.manager.Window`, `WindowPosition`) | Never persisted; consumed by arbitration (§2.3), results delivered as semantic events |

Every future docking leaf classifies each new piece of state into exactly one row of this table before implementation. State that wants to live in two rows is two pieces of state.

#### Splitter reconciliation (Discussion #13370 OQ3, dispositioned)

`Neo.dashboard.DockSplitter` is the dock-workspace resize affordance: it renders between projected split children and commits through the `resizeSplit` semantic operation (`DockLayoutAdapter.createResizeSplitOperation`). `Neo.component.Splitter` remains the general-purpose sibling-resize component for non-dock layouts. They stay separate: the dock splitter's contract obligation (semantic commit through the reducer, never direct mutation of persisted `sizes`) is dock-specific, and folding it into the general component would leak dock semantics into core. A future unification is possible only behind the §2.5 lift trigger, never before it.

### §2.2 Named Perspectives

#### Landed baseline

Single-workspace persistence is shipped and closed (fail-closed restore and no-secret metadata enforcement — `createSavedLayout`, `restoreSavedLayout`, `validateSavedLayoutCollection`, `createSavedLayoutCollection`, `upsertSavedLayout`, `selectSavedLayout`, `removeSavedLayout`, `restoreActiveSavedLayout` in `DockZoneModel`). `dockLayoutCollection.v1` already gives one workspace named, switchable layouts. This section extends the semantics to the multi-window topology; it does not reopen the landed wrappers.

#### Capture scope (amendment, 2026-07-11 — #14773: the shipped envelope IS the perspective carrier)

**Why this amendment exists.** This section originally projected a NEW persisted schema (`neo.harness.dockPerspective.v1`) for topology-scope perspectives. The perspective substrate that actually landed ships `neo.harness.dockLayout.v2` — the EXISTING envelope family extended with the perspective fields (`captureScope`, `windowFingerprint`, `perspectiveName`, `windowDocuments`) — and it covers BOTH scopes. Minting a second wrapper name for the same capability territory would itself be the shape-proliferation this record's own anti-anchor forbids; the reconciliation therefore RETIRES the `dockPerspective.v1` name entirely: **`dockLayout.v2` is v2 of the ENVELOPE carrying v1 of the perspective CAPABILITY.** Vocabulary mapping, stated once: the capability scope this section calls `workspace` is the envelope value `captureScope: 'window'`. `workspace` is this record's PROSE label only — runtime and tool surfaces (the NL perspective tools included) speak the executable vocabulary `window | topology` (`DockZoneModel.CAPTURE_SCOPES`, the SSOT); minting `workspace` as a third runtime enum value is the drift this mapping exists to prevent.

Two scopes exist. A perspective declares which one it is; there is no implicit scope.

| Scope | Captures | Wrapper |
|---|---|---|
| `workspace` | one workspace document | `neo.harness.dockLayout.v2` with `captureScope: 'window'` (shipped) |
| `topology` | every workspace document in the workspace set **plus** the durable half of the placement-hint layer | `neo.harness.dockLayout.v2` with `captureScope: 'topology'` + `windowDocuments` (multi-document half shipped; hint layer pending, below) |

```json
{
  "schema": "neo.harness.dockLayout.v2",
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
- Perspective collections (named sets of perspectives) reuse `dockLayoutCollection.v1` verbatim with `dockLayout.v2` entries; they must not fork a third collection shape — and after this amendment not even a second WRAPPER shape exists.

#### Restore semantics into a changed window topology

Windows are render targets (§2.1); restoring a perspective restores **worker-owned truth first**, then lets windows catch up:

1. **Validate everything before mutating anything.** Wrapper schema, every inner `dockZone.v1` document, every hint record. Any failure → fail closed: the entire active perspective stays untouched; validation errors surface to the caller. There is no partial restore.
2. **Restore workspace documents** through the landed `restoreSavedLayout()` path, one per captured document (`dockZone` + each `windowDocuments` entry).
3. **Reconcile windows.** A workspace whose window is already open re-projects in place. A workspace or detached item whose window does not exist does **not** auto-spawn one: browser popup creation requires user activation, and a restore MUST NOT depend on popup permission. The content is instead placed by semantic recovery — the detached item re-enters at its `fallbackTarget`; a workspace with no window renders when a window next binds to it — and the restore reports which hints were applied vs recovered, so a switcher UI can offer "open as window" affordances behind a user gesture.
4. **Excess windows** (open windows whose workspace the perspective does not name) keep their workspace documents untouched; the perspective governs only what it captured.

#### Revision migration

`revision` is monotonic per perspective. An unknown *wrapper* schema version fails closed (keep last-good, surface the error) — same rule as the landed wrappers. A future envelope revision (`dockLayout.v3`) must ship a documented migration in the same change that introduces it — the shipped `v1 → v2` migration (`migrateSavedLayout`, honest defaults) is the precedent; silent best-effort upgrades are forbidden.

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

**Native-OS-window participation hooks (optional class — only for surfaces whose items embody as native popup windows, the #13025/#13028 lineage; the coordinator invokes them `?.`-guarded):**

| Member | Obligation |
|---|---|
| `getNativeWindowDrag(windowId)` | Expose the drag payload a detached OS window carries (`{draggedItem, …}`), enabling drop-candidate commit on native window movement. |
| `onTerminalWindowDrop(draggedItem)` | Finalize when a native-window drag terminates as a standalone window (the drag ends detached rather than re-docking). |

**Binding invariant — the coordinator stays dock-blind:** `DragCoordinator` arbitrates *which target* receives the drag; it MUST NOT import `DockZoneModel`, `DockLayoutAdapter`, or any preview module, and it never interprets dock semantics. This holds in landed code and is now contract. (Changing it triggers the amend-this-ADR escalation named in §1 Context.)

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

Overflow is a **generic tab-subsystem affordance — not a dock concern, not a model change** (mechanism realized by #15098; the first implementation #15062 mis-homed it in `dashboard/plugin/` and was replaced). When a `tabs` node's headers exceed the available extent, the overflowing tabs collapse behind a floating overflow control whose menu reaches them (selecting one sets `activeItemId` via the ordinary semantic path); nothing new persists — `items` order and `activeItemId` already capture the state. It is owned by **`Neo.tab.plugin.Overflow`**, a plugin on the generic `Neo.tab.header.Toolbar` (sibling to the other `src/*/plugin/` affordances), whose pure static `computeOverflow({items, extent, activeItemId, controlWidth})` returns the visible/hidden partition (active-never-hidden). The dock is a **consumer**: `DockLayoutAdapter.projectTabsNode` injects the plugin into each projected header toolbar's `plugins` — a one-directional adapter→plugin consume; the plugin owns its decision, nothing reaches back to the adapter. The control is an **out-of-collection** floating button (rooted at `document.body`, never in `owner.items`) so the header SortZone that `dragResortable` wires never sees it and committed tab order stays uncorrupted. **Invalidation contract:** the plugin re-measures + re-partitions on every tab-set mutation (insert / remove / reorder), not only on resize + `activeIndexChange`. It must **not** fork a dock-specific tab container (inherited from the contract's §Split/Tab Adapter Boundary) — the affordance is tab-native; the dock merely consumes it.

### §2.5 Core-Lift Clause Disposition

The model contract's §Ownership Boundary keeps the dock subsystem in `src/dashboard/` — reusable across apps, not yet a core layout primitive — with a further lift gated on "a second independent consumer beyond dashboard adaptation."

**Disposition: DEFER, with the trigger sharpened.** The approaching consumers — Institution Cockpit panes (#13444) and FM-UX cards (#13015) — consume the docking **shell** through the §2.6 container contract; they are consumers *of the dashboard docking subsystem*, not evidence that a dashboard-independent core primitive is needed. Lifting now would duplicate API surface for zero demanding consumer, while the operator-assessed brittleness lives in the interaction layer — which §§2.1–2.4 and §2.7 address by contract, not by relocation.

**The named trigger (fire condition):** a consumer that needs dock semantics **without dashboard adaptation** — concretely, the Portal learning workspace (the model contract's own named candidate) or any consumer that must compose dock trees from non-dashboard containers. When such a consumer files, the lift executes as its own Contract-Ledgered leaf: model + adapter move to a core namespace, `src/dashboard/` re-exports for compatibility, and the §Ownership Boundary section of the model contract is amended in the same change. Until that consumer exists, any lift PR is premature and should be declined citing this section.

### §2.6 Container Contract for Embedded Product Surfaces

The minimal interface between the docking shell and the product surfaces that live inside it. Named consumers: **Institution Cockpit panes (#13444)** and **FM-UX cards (#13015)**. The contract is deliberately interface-minimal; it can absorb steward feedback (the #13015 options thread) without breaking, because every guarantee below is already landed behavior or a §2.1–§2.3 obligation.

| The embedded surface provides | The docking shell guarantees |
|---|---|
| A stable `componentRef` registered with the workspace's resolver | Resolution to the live instance on every projection; the instance is **moved / re-parented, never destroyed** (landed adapter rule) |
| Optionally a `blueprint` — a serializable Neo config for creation-from-saved-state | Instantiation from blueprint when no live instance exists; recoverable placeholder (never silent drop) when neither resolves (landed placeholder + stale-ref policy) |
| Policy hints: `closable`, `pinnable`, `movable` | Enforcement at the operation layer (e.g. `setItemPinned` / `setItemAutoHidden` reject `pinnable === false`; landed) |
| JSON-only `metadata` — no secrets, credentials, functions, DOM, live objects | No-secret validation on every persistence path (landed, #13153 class of checks) |
| Nothing else — no layout knowledge, no dock imports, no preview access | Semantic placement continuity across moves, splits, transfers (§2.3), perspective capture/restore (§2.2), and auto-hide transitions (§2.7); item identity (`dockItemId`) stable across all of them |

Two binding consequences:

- **Panes are layout-blind.** An embedded surface never reads or mutates the dock document, never listens to drag surfaces, and never persists its own placement. It experiences docking exclusively as ordinary Neo component lifecycle (mount/unmount/re-parent) plus its own config updates. A pane that "helps" with layout is a contract violation.
- **Layout is pane-blind.** The shell knows items only as catalog records. Cockpit panes and FM-UX cards add zero cases to the docking code; if a product surface needs a new docking behavior, that behavior enters through an amendment to this ADR, not through a pane-specific branch.

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
| *detached* | hint layer (§2.1) | An item embodied in its own OS window. **Mutually exclusive with `autoHidden`:** auto-hide is an in-workspace affordance; `detachItem` on a railed item clears `autoHidden` in the same commit, and `setItemAutoHidden(true)` rejects detached items. |

#### Interaction contract

| Interaction | Behavior |
|---|---|
| Click a rail tab | Transient **reveal**: the pane renders as an **overlay** anchored to its edge — left/right rails reveal full-height, top/bottom rails full-width. The overlay's free dimension uses the extent the item's owning split last committed (`sizes`, still in the document) when one exists, else an adapter-default fraction of the workspace extent (default `0.25`, workspace-configurable). Overlay, never push: revealing MUST NOT re-layout the committed projection. Focus moves into the pane. |
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

- **Placement hints stay additive on `dockLayout.v2`.** Any schema revision ships migration + fail-closed tests atomically (Discussion #15204's `revalidationTrigger` fires on a non-additive requirement).
- **ADR 0034 boundary:** the Electron shell may improve vessel *materialization*; it never forks placement or arbitration semantics.
- **Merge order:** this amendment precedes all consuming implementation — #15244 (G1 tear-out), #15246 (G3 composition/arbitration), #15247 (G4 reintegration/vessel), #15248 (teardown hygiene) cite their §2.8 subsection as upstream contract; the #15243 spike's row 6 binds to §2.8.1's identity requirements without implementing arbitration.

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
| Named perspectives | ✓ (save/restore by name) | layout serialize | layout serialize | layout serialize | `saveLayout`/`loadLayout` | — | §2.2 (single-workspace landed; topology-scope reconciler in review, #14668) |
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
| Escape-cancel mid-drag | ✓ cancels the gesture | **gap — no owning leaf** (surfaced by this amendment: no Escape path in the draggable layer, `DragCoordinator`, or the main-thread drag addon as of this date) |
| Commit animation (drop lands smoothly) | not established by this sweep (the fetched Qt-ADS README documents the drag-preview/indicator tier, not committed-re-layout animation) | Neo house/experience target — above the bar, owned by #14779 (motion contract) / #14929 (FLIP layer, in flight) |

**Closure-gate binding.** Epic #13158 MUST NOT resolve without an item-by-item experience-parity matrix against THIS sub-row inventory (plus the surviving capability rows above), each row evidenced by a recorded interaction, an e2e spec, or a live demo beat — evidence links, not assertions. The epic body carries the matching requirement (#14934).

## 5. Consequences — Decomposition, Guardrails, Acceptance

### Decomposition — the leaves this record gates

Per the parent epic's discipline (one Contract-Ledgered leaf per capability), implementation follows as leaves; each cites its section as the upstream contract:

| Leaf | Contract section | Status |
|---|---|---|
| Auto-hide UI: reveal overlay + pin control + rail drag source | §2.7 | **#13280 (in flight, Grace)** — held design-first by owner decision; this record is its contract |
| `CrossWindowDragTarget` formalization + dock workspace target + `transferItem` | §2.3 | document-pair participation landed in #14769 / PR #15017; placement-hint integration remains part of §2.2's future workspace-set transaction |
| Topology perspectives: the hint layer on `dockLayout.v2` + switcher + restore reconciliation | §2.2 | envelope + model-level capture/collection substrate landed; NL capture/list/restore tools are in review (#15019); the placement-hint layer + atomic multi-window restore remain |
| Grouped drag (`moveNode`/`transferNode`) + tab overflow affordance | §2.4 | unfiled |
| Core lift to a non-dashboard namespace | §2.5 | **gated** — fires only on the named trigger |
| The three-OS portability spike (matrix contract) | §2.8.1 (row-6 identity binding) + §2.8.3 (admission receipts) | #15243 (epic #15239; Emmy's contracted lane) |
| Dock tear-out + acquisition contract | §2.8.2/§2.8.3 + the §2.3 participation contract | #15244 / #15245 (epic #15239) |
| Workspace-set composition + claim arbitration + remote preview | §2.8.1 + §2.1 workspace-set | #15246 (epic #15239) |
| Whole-stack reintegration + vessel close policy | §2.8.2/§2.8.3 + §2.4 `transferNode` | #15247 (epic #15239) |
| Coordinator teardown hygiene (exact-once terminals) | §2.8.2 invariant 4 | #15248 (epic #15239) |

### JSON-First Guardrail (restated, applied)

Inherited unchanged from the model contract's §Serializable vs Runtime State and applied to every shape this record introduces:

- Perspective records (`neo.harness.dockLayout.v2`, §2.2 amendment) persist workspace documents, durable hints, titles, ids, revisions, JSON-only metadata. They MUST NOT contain `DOMRect`s, screen or monitor coordinates, `windowId`s, live components, functions, credentials, or any preview payload.
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
