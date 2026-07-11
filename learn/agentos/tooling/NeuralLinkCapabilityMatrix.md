# Neural Link Capability Matrix

This is the reference spine for the Neural Link tool surface. The conceptual
guide explains why the Possession Interface matters; this page says what each
registered verb is allowed to do, which App Worker surface it reaches, whether
it participates in the transaction stack, and whether a generated payload may
drive it directly.

The source of authority is `ai/mcp/server/neural-link/openapi.yaml`, with
dispatch in `ai/mcp/server/neural-link/toolService.mjs`. If this page and the
OpenAPI registry disagree, the registry is the runtime contract and the doc must
be updated in the same change.

## Projection Policy

`openapi.yaml` declares three Neural Link tiers:

| Tier | Projection | Meaning |
|---|---|---|
| `read` | Default visible | Safe inspection. A harness-embedded agent can receive these by default. |
| `write-locked` | Withheld until explicit locking/targets | Mutates live App Worker state or user-visible runtime state. Trusted controller or e2e code may call these after validation. A model-generated artifact must never call them directly. |
| `admin` | Operator only | Lifecycle, config, arbitrary method, or hot-patch authority. These require an operator/admin gate and are never model-generated. |

The direct model-generation rule is deliberately stricter than ordinary agent
operation: a model may produce a candidate blueprint or plan, but that artifact
does not get to select a Neural Link write/admin verb. A trusted caller must
validate intent, resolve targets, and choose the verb.

## Never Directly Model-Drivable

These operation IDs are not reachable from model-generated blueprints, route
payloads, or boot-consumed generated artifacts. They may only be invoked by a
trusted controller, fixture, maintainer, or operator path after its own guard
has accepted the action.

<!-- nl-capability-matrix:never-model-drivable:start -->
`abort_transaction`, `begin_transaction`, `call_method`, `capture_perspective`,
`commit_transaction`, `create_component`, `create_instance`,
`execute_dock_operation`, `focus_window`, `highlight_component`,
`manage_connection`, `manage_neo_config`, `modify_state_provider`,
`open_component_window`, `patch_code`, `position_window`, `redo`,
`reload_page`, `remove_component`, `replay_transaction`,
`restore_perspective`, `save_transaction`, `set_instance_properties`,
`set_route`, `simulate_event`, `undo`
<!-- nl-capability-matrix:never-model-drivable:end -->

## Verb Matrix

| Verb | Purpose | Owner / App Worker Surface | Class | Transaction | Error Shape | Firewall | E2E Fixture Support |
|---|---|---|---|---|---|---|---|
| `abort_transaction` | Discard the requester's open named transaction record; already-applied UI mutations remain. | `InstanceService` -> `Neo.ai.TransactionService` stack. | `write-locked` | Controls an open batch; not a rollback. | Recoverable `{aborted:false, reason}` for expected misses; schema/server errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Direct SDK/MCP only; no fixture wrapper. |
| `begin_transaction` | Open a named transaction so later captured mutations undo as one intent. | `InstanceService` -> `Neo.ai.TransactionService` stack. | `write-locked` | Opens a batch for captured writes. | Recoverable `{opened:false, reason}` for expected misses; schema/server errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Direct SDK/MCP only; no fixture wrapper. |
| `call_method` | Invoke an arbitrary method on a live instance. | `InstanceService` -> live instance method dispatch. | `admin` | Lock-enforced; generic calls are not undoable except server-stamped create/remove paths. | Throws missing instance/method or downstream errors as `{error}`. | Operator/admin only; never direct from model-generated payload. | Fixture wrapper: `callMethod`; use sparingly. |
| `capture_perspective` | Capture a dock workspace as a named saved-layout record — `window` scope through `DockZoneModel.capturePerspective()`, `topology` scope through `captureTopologyPerspective()` over the holder's `getDockTopologyDocuments()` seam — stored on the holder's perspective store when present. | `DockService` -> App Worker dock document holder / the `DockZoneModel` scope producers (`CAPTURE_SCOPES` SSOT) + the holder's perspective store. | `write-locked` | Dock commit path, not the transaction stack. | `{captured, stored, collision, errors, layout}`; scope/name refusals are structured errors, never crashes. | Trusted controller/e2e only; never direct from model-generated payload. | SDK export: `NeuralLink_DockService`; no fixture wrapper yet. |
| `check_namespace` | Check whether a namespace exists in the App Worker runtime. | `RuntimeService` -> namespace lookup. | `read` | None. | Boolean-style result or `{error}`. | Model-readable after caller validates the namespace query. | Fixture wrapper: `checkNamespace`. |
| `commit_transaction` | Commit the requester's open named transaction into one undoable unit. | `InstanceService` -> `Neo.ai.TransactionService` stack. | `write-locked` | Closes an open batch. | Recoverable `{committed:false, reason}` for expected misses; schema/server errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Direct SDK/MCP only; no fixture wrapper. |
| `create_component` | Add a component config to a target container through constrained `container.add`. | `ComponentService` -> App Worker `call_method` with server-stamped `undoKind`. | `write-locked` | Captured when Bridge-stamped; named-batch aware. | Fail-fast validation for missing target/config/class identity; downstream errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `createComponent`; keeper parity gap filed as #14815. |
| `create_instance` | Create any JSON-addressable Neo instance, optionally attaching to a parent container. | `InstanceService` -> `Neo.create` / `Neo.ntype` in the App Worker. | `write-locked` | Captured when Bridge-stamped; named-batch aware. | Fail-fast data-only validation and parent checks; downstream errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `createInstance`; direct SDK specs exist. |
| `diff_dock_topology` | Compare a supplied dockZone document with the live holder document and return semantic dock deltas. | `DockService` -> App Worker dock document holder / `DockTopologyDiff`. | `read` | None. | Diff result includes deterministic category arrays plus shape-gate `errors`; missing holder/session errors use `{error}`. | Model-readable after caller validates holder id and before-document provenance. | SDK export: `NeuralLink_DockService`; no Playwright fixture wrapper. |
| `execute_dock_operation` | Apply one semantic dock operation and return the post-operation document. | `DockService` -> App Worker dock document holder / `DockZoneModel.applyOperation`. | `write-locked` | Dock commit path, not the transaction stack. | Executor returns `{applied, document, errors}`; malformed holder/transport errors use `{error}`. | Operator/e2e-tier only; never direct from model-generated payload. | SDK export: `NeuralLink_DockService`; fixture wrapper: `executeDockOperation`. |
| `find_instances` | Find live instances by property selector. | `InstanceService` -> App Worker instance registry. | `read` | None. | Returns matching instances or `{error}`. | Model-readable after caller validates selector scope. | Fixture wrapper: `findInstances`. |
| `focus_window` | Focus a known runtime window. | `RuntimeService` -> window operation bridge. | `write-locked` | None. | Window operation result or `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `focusWindow`. |
| `get_component_tree` | Read the live component tree from a root. | `ComponentService` -> component serialization / `toJSON`-style tree. | `read` | None. | Tree result or `{error}` for invalid root/session. | Model-readable after caller bounds depth/root. | Fixture wrapper: `getComponentTree`. |
| `get_computed_styles` | Read computed CSS properties for a component. | `ComponentService` -> main-thread style read. | `read` | None. | Style result or `{error}`. | Model-readable after caller validates target id. | Fixture wrapper: `getComputedStyles`. |
| `get_console_logs` | Read captured console logs for the App Worker/session. | `ConnectionService` -> bridge/session log buffer. | `read` | None. | Log list or `{error}`. | Model-readable; filter before large dumps. | Fixture wrapper: `getConsoleLogs`. |
| `get_dock_topology` | Read a dock workspace document plus executable operation vocabulary. | `DockService` -> App Worker dock document holder. | `read` | None. | Topology result or `{error}` for missing holder/session. | Model-readable after caller validates holder id. | SDK export: `NeuralLink_DockService`; fixture wrapper: `getDockTopology`. |
| `get_dom_event_listeners` | Read bound DOM event listeners for a component. | `RuntimeService` -> DOM event manager summary. | `read` | None. | Listener list or `{error}`. | Model-readable after caller validates target id. | Fixture wrapper: `getDomEventListeners`. |
| `get_dom_event_summary` | Read a high-level DOM event manager summary. | `RuntimeService` -> DOM event manager. | `read` | None. | Summary result or `{error}`. | Model-readable for diagnostics. | Fixture wrapper: `getDomEventSummary`. |
| `get_dom_rect` | Read physical DOM rects for components. | `ComponentService` -> main-thread DOM geometry read. | `read` | None. | Rect list or `{error}`. | Model-readable after caller validates target ids. | Fixture wrapper: `getDomRect`. |
| `get_drag_state` | Read the current drag coordinator state. | `InteractionService` -> drag coordinator. | `read` | None. | Drag state or `{error}`. | Model-readable for drag diagnostics. | Fixture wrapper: `getDragState`. |
| `get_drag_trace` | Read recent SortZone drag lifecycle trace entries, optionally clearing them. | `InteractionService` -> drag trace ring buffer. | `read` | None. | Trace result or `{error}`. | Model-readable; clear only when the test owns the trace. | Fixture wrapper: `getDragTrace`. |
| `get_instance_properties` | Read selected properties from a live instance. | `InstanceService` -> live instance property access. | `read` | None. | Property map or `{error}`. | Model-readable after caller scopes properties. | Fixture wrapper via `getComponent`. |
| `get_mcp_tool_handbook` | Read lazy usage detail for one Neural Link MCP tool. | `ToolService` -> OpenAPI handbook cache. | `read` | None. | `{found, handbook}` result or `{error}`. | Model-readable; stale MCP runtime must not override source. | Direct MCP only. |
| `get_method_source` | Read a live class method source string. | `RuntimeService` -> class/method introspection. | `read` | None. | Source result or `{error}`. | Model-readable; required before any `patch_code`. | Fixture wrapper: `getMethodSource`. |
| `get_namespace_tree` | Read the loaded namespace tree. | `RuntimeService` -> namespace traversal. | `read` | None. | Namespace tree or `{error}`. | Model-readable with root/depth restraint. | Fixture wrapper: `getNamespaceTree`. |
| `get_record` | Read one data record, optionally scoped to a store. | `DataService` -> store/record lookup. | `read` | None. | Record result or `{error}`. | Model-readable after caller validates store/record ids. | Fixture wrapper: `getRecord`. |
| `get_route_history` | Read route history for a window/session. | `RuntimeService` -> navigation history. | `read` | None. | Route history or `{error}`. | Model-readable for navigation diagnostics. | Fixture wrapper: `getRouteHistory`. |
| `get_window_topology` | Read connected window metadata. | `RuntimeService` -> `ConnectionService.sessionData`. | `read` | None. | Window list or `{error}`. | Model-readable. | Fixture wrapper: `getWindowTopology`. |
| `get_worker_topology` | Read connected App Worker/session metadata. | `RuntimeService` -> `ConnectionService.sessionData`. | `read` | None. | Worker list or `{error}`. | Model-readable. | Fixture wrapper: `getWorkerTopology`. |
| `healthcheck` | Report server, bridge, session, and runtime freshness status. | `HealthService` -> MCP server + bridge observability. | `read` | None. | Healthy payload or 503-style `{error}`/freshness details. | Model-readable; stale freshness blocks schema/source assertions. | Direct MCP only; fixture starts bridge separately. |
| `highlight_component` | Temporarily apply a visual highlight style to a component. | `InteractionService` -> component style mutation. | `write-locked` | Temporary visual mutation; not captured in transaction stack. | Missing component or style errors use `{error}`. | Trusted diagnostic/e2e only; never direct from model-generated payload. | Fixture wrapper: `highlightComponent`. |
| `inspect_class` | Read a Rich Blueprint for a Neo class. | `RuntimeService` -> class introspection. | `read` | None. | Class schema or `{error}`. | Model-readable; use before patching or class claims. | Fixture wrapper: `inspectClass`. |
| `inspect_component_render_tree` | Read VDOM/VNode render tree for a component. | `ComponentService` -> render-tree serialization. | `read` | None. | Render tree or `{error}`. | Model-readable after caller bounds root/depth. | Fixture wrapper: `inspectComponentRenderTree`. |
| `inspect_state_provider` | Read a state provider's data. | `DataService` -> state provider lookup. | `read` | None. | Provider data or `{error}`. | Model-readable after caller validates provider id. | Fixture wrapper: `inspectStateProvider`. |
| `inspect_store` | Read store metadata and records. | `DataService` -> store lookup. | `read` | None. | Store result or `{error}`. | Model-readable; use limits for large stores. | Fixture wrappers: `getStore` / `inspectStore`. |
| `list_perspectives` | List a dock workspace's stored perspectives plus the active layout id. | `DockService` -> the holder's perspective store. | `read` | None. | `{perspectives, activeLayoutId, errors}`; a store-less holder is a structured error, never an empty list. | Model-readable after caller validates holder id. | SDK export: `NeuralLink_DockService`; no fixture wrapper yet. |
| `list_stores` | List available data stores. | `DataService` -> store manager. | `read` | None. | Store list or `{error}`. | Model-readable. | Fixture wrapper: `listStores`. |
| `list_transactions` | Read the requester's undo/redo transaction audit summary. | `InstanceService` -> `Neo.ai.TransactionService` stack. | `read` | Non-consuming transaction audit. | Empty lists for no writer/stack; server errors use `{error}`. | Model-readable for the current writer's own stack. | Direct SDK/MCP only; no fixture wrapper. |
| `manage_connection` | Start or stop the local Neural Link WebSocket bridge. | `ConnectionService` -> bridge process lifecycle. | `admin` | None. | Action result or `{error}`. | Operator/admin only; never direct from model-generated payload. | Fixture setup calls `start`; no per-test wrapper. |
| `manage_neo_config` | Get or merge `Neo.config` at runtime. | `RuntimeService` -> App Worker config surface. | `admin` | None. | Config result or `{error}`. | Operator/admin only; never direct from model-generated payload. | Fixture wrapper: `manageNeoConfig`. |
| `modify_state_provider` | Merge data into a live state provider. | `DataService` -> `provider.setData`. | `write-locked` | Not captured in transaction stack. | Missing provider or payload errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `modifyStateProvider`. |
| `observe_motion` | Sample component/raw DOM rects over a bounded time window. | `InteractionService` -> rendered geometry sampler. | `read` | None. | Motion trace or `{error}`. | Model-readable; duration is clamped. | Fixture wrapper: `observeMotion`. |
| `open_component_window` | Open a live component in a popup/window target. | `RuntimeService` -> window operation bridge. | `write-locked` | Runtime window mutation; not transaction-captured. | Window operation result or `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `openComponentWindow`. |
| `patch_code` | Replace a class prototype method implementation at runtime. | `RuntimeService` -> App Worker hot-patch gate. | `admin` | None. | Fails when hot patching is disabled, target missing, or source invalid; errors use `{error}`. | Operator/admin only; must be preceded by `get_method_source`; never direct from model-generated payload. | Fixture wrapper: `patchCode`. |
| `position_window` | Move a known popup/window when a native handle exists. | `RuntimeService` -> window operation bridge. | `write-locked` | Runtime window mutation; not transaction-captured. | Window operation result or `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `positionWindow`. |
| `query_component` | Find live components by selector. | `ComponentService` -> component manager/tree query. | `read` | None. | Component list or `{error}`. | Model-readable after caller scopes selectors. | Fixture wrapper: `queryComponent`. |
| `query_vdom` | Find VDOM nodes by selector/root. | `ComponentService` -> VDOM traversal. | `read` | None. | Node list or `{error}`. | Model-readable after caller scopes selectors/root. | Fixture wrapper: `queryVdom`. |
| `redo` | Re-apply the requester's most recently undone transaction. | `InstanceService` -> transaction replay through enforced dispatch. | `write-locked` | Consumes redo branch only on full success. | Recoverable `{redone:false, reason}` for expected misses; server errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Direct SDK specs exist; no fixture wrapper. |
| `reload_page` | Reload the application page/window. | `RuntimeService` -> page lifecycle. | `admin` | None; invalidates session ids. | Reload result or `{error}`. | Operator/admin only; never direct from model-generated payload. | Fixture wrapper: `reloadPage`; caller must rediscover session. |
| `remove_component` | Destroy and detach a live component by id. | `ComponentService` -> App Worker `call_method` with server-stamped `undoKind`. | `write-locked` | Captured when Bridge-stamped; named-batch aware. | Fail-fast missing component id; downstream errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `removeComponent`. |
| `replay_transaction` | Replay an archived transaction's forward ops into the current session as a new undoable transaction. | `InstanceService` -> `RecorderService` archive + App Worker enforced dispatch. | `write-locked` | Opens a fresh replay transaction captured under the current writer. | Recoverable `{replayed:false, reason}` for missing archive, invalid archive, or replay denial; schema/server errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Direct SDK/MCP only; no fixture wrapper. |
| `restore_perspective` | Restore a stored perspective by name, routed by the record's own `captureScope`: window records ride the holder's switch seam (or the store's fail-closed load); topology records reconcile through `DockTopologyReconciler` + the holder's atomic `commitDockTopologyDocuments()` seam. | `DockService` -> the store's read-only `getPerspective()` inspect, then `activatePerspective` / the landed commit path (window) or the reconciler + atomic multi-document seam (topology). | `write-locked` | Dock commit path, not the transaction stack. | Window: `{switched, captureScope, errors, document}`; topology adds `{documents, restored, unrestored, displaced}` — completion/remainder honest, `windowDocuments` never dropped; a refused restore leaves the layout byte-untouched and the store pointer unmoved. | Trusted controller/e2e only; never direct from model-generated payload. | SDK export: `NeuralLink_DockService`; no fixture wrapper yet. |
| `save_transaction` | Persist one committed transaction snapshot to the Brain-side archive. | `InstanceService` -> App Worker `Neo.ai.TransactionService` stack + `RecorderService` archive. | `write-locked` | Archives a committed stack entry; no live mutation. | Recoverable `{saved:false, reason}` for missing transaction or archive-store failures; schema/server errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Direct SDK/MCP only; no fixture wrapper. |
| `set_instance_properties` | Set properties/configs on a live instance. | `InstanceService` -> live instance `set`. | `write-locked` | Captured when Bridge-stamped; named-batch aware. | Missing instance or setter errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `setProperties`. |
| `set_route` | Drive a window/session to a hash route. | `RuntimeService` -> navigation. | `write-locked` | Navigation mutation; not transaction-captured. | Route result or `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `setRoute`. |
| `simulate_event` | Dispatch native DOM events against target DOM ids. | `InteractionService` -> browser/main-thread event dispatch. | `write-locked` | Interaction side effects are not transaction-captured. | Event dispatch result or `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Fixture wrapper: `simulateEvent`. |
| `undo` | Revert the requester's most recently committed captured transaction. | `InstanceService` -> transaction replay through enforced dispatch. | `write-locked` | Consumes committed transaction only on full success. | Recoverable `{undone:false, reason}` for expected misses; server errors use `{error}`. | Trusted controller/e2e only; never direct from model-generated payload. | Direct SDK specs exist; no fixture wrapper. |
| `verify_component_consistency` | Compare logical items, VDOM, and real DOM child surfaces. | `InteractionService` -> component consistency oracle. | `read` | None. | Consistency report or `{error}`. | Model-readable after caller validates container id. | Fixture wrapper: `verifyComponentConsistency`. |

## Gap Ledger

| Gap | Filed Leaf | Why It Is A Gap |
|---|---|---|
| Scripted tour-mode driving primitives | #14640 | Journey and demo work needs deterministic scene execution, not ad-hoc e2e timing glue. |
| Keeper external `create_component` parity | #14815 | Keeper-owned materialization and external Neural Link inserts must have an explicit, tested provenance/chrome boundary before journey authors assume parity. |

## Verification

`test/playwright/unit/ai/mcp/server/neural-link/CapabilityMatrix.spec.mjs`
parses this table and `ai/mcp/server/neural-link/openapi.yaml`. A registered
operation without a row fails. A row without a registered operation fails. The
same spec checks the explicit never-direct model set against every non-read
operation and requires the firewall cell for non-read rows to state that it is
never direct from a model-generated payload.

The Knowledge Base ingestion AC is post-merge: after this page lands and the KB
sync runs, `ask_knowledge_base` should surface per-verb contracts from this
reference page.
