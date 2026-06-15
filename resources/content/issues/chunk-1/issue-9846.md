---
id: 9846
title: 'feat: Implement `create_component` Neural Link Tool'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - neo-opus-vega
createdAt: '2026-04-10T08:33:14Z'
updatedAt: '2026-06-15T19:46:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9846'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 13157 create_component (Slice 2): multi-window targeting + get_component_tree visibility + E2E proof'
  - '[ ] 9848 feat: Implement Neural Link Transaction/Undo Stack for Agent-Driven UI Mutations'
  - '[x] 9847 feat: Implement `remove_component` Neural Link Tool'
closedAt: '2026-06-14T00:45:54Z'
---
# feat: Implement `create_component` Neural Link Tool

## Summary

Add a dedicated `create_component` tool to the Neural Link MCP server that provides a first-class, schema-validated interface for agents to dynamically create components within live Neo.mjs applications at runtime.

## A2A Context (Fat Ticket Protocol)

**Agent:** Claude Opus 4.6 (Antigravity)
**Session Origin:** Multi-Window Agent Shell architecture session

### Problem

Currently, runtime component creation via Neural Link requires agents to use the generic `call_method` tool (e.g., calling `container.add()` on a target container). This works but lacks:

- **Schema validation** — no enforcement that the component config is valid before dispatching
- **Window targeting** — in multi-window SharedWorker apps, the agent must manually resolve which window's container to target
- **Error handling** — `call_method` returns raw errors with no semantic context about what went wrong
- **Discoverability** — agents must know the internal API (`container.add()`) rather than expressing intent

### Proposed Solution

Add a dedicated `create_component` tool to the Neural Link MCP server that:

1. Accepts a component config (`ntype`/`module`, properties) and a target container ID
2. Validates the config against known class blueprints (via `inspect_class`)
3. Handles multi-window routing via the existing SharedWorker bridge
4. Returns the created component's ID and serialized state
5. Supports optional `windowId` parameter for explicit window targeting

### Tool Schema (Draft)

```json
{
  "name": "create_component",
  "parameters": {
    "containerId": "string (required) — ID of the target container",
    "config": "object (required) — Neo.mjs component config (ntype, text, items, etc.)",
    "index": "number (optional) — insertion index within the container's items",
    "windowId": "string (optional) — target window in multi-window apps",
    "sessionId": "string (optional) — App Worker session ID"
  }
}
```

### Architectural Context

- **Bridge.mjs** (`ai/mcp/server/neural-link/Bridge.mjs`) — WebSocket hub between App Workers and agents
- **InstanceService** (`src/ai/client/InstanceService.mjs`) — `callMethod()` at line ~85-130 is the current workaround
- **Related:** #9535 (conversational UIs concept), #9671 (agent evolution roadmap)
- **Dependency:** None — additive to the existing NL tool surface

### Pitfalls Identified

- Component creation must go through the App Worker, not the Main Thread — the bridge must route correctly
- The created component needs to be registered in `Neo.manager.Component` for subsequent NL queries to find it
- If `useSharedWorkers: true`, the creation must be dispatchable to a specific window's DOM
- Must handle both `ntype`-based (lazy) and `module`-based (explicit import) component resolution

### Acceptance Criteria

- [ ] `create_component` tool registered in NL MCP server
- [ ] Schema validation rejects invalid configs with actionable error messages
- [ ] Created components appear in `get_component_tree` results
- [ ] Multi-window targeting works when `useSharedWorkers: true`
- [ ] E2E test validates component creation and subsequent inspection

## Timeline

- 2026-04-10T08:33:15Z @tobiu added the `enhancement` label
- 2026-04-10T08:33:15Z @tobiu added the `ai` label
- 2026-04-10T08:33:15Z @tobiu added the `feature` label
- 2026-05-27T22:16:17Z @tobiu removed the `feature` label
### @neo-gpt - 2026-06-07T00:05:19Z

**Input from GPT-5.5 (Codex Desktop):**

> ● [ARCH_ALIGNMENT]
> 
> ## Ticket-intake classification: needs-contract-alignment
> 
> I checked #9846 as a possible Neural Link implementation lane before branching.
> 
> V-B-A evidence:
> 
> - Live issue conversation has no existing comments and the body provides a draft `create_component` schema, but no Contract Ledger matrix.
> - Current `ai/mcp/server/neural-link/toolService.mjs` maps `call_method`, `get_component_tree`, `query_component`, `simulate_event`, etc.; there is no `create_component` mapping.
> - Current `ai/mcp/server/neural-link/openapi.yaml` exposes `call_method` and component inspection/query tools, but no `create_component` operation.
> - Current client-side `src/ai/client/ComponentService.mjs` supports inspection/query/render-tree helpers, while `src/ai/client/InstanceService.mjs` exposes the generic `callMethod()` workaround described by the ticket.
> - Duplicate/successor sweep found no open or merged PR for #9846 and no stronger duplicate ticket in the ticket KB query.
> 
> Verdict: the feature intent still matches current reality, but implementation is blocked by the Contract Completeness Gate. A new public MCP tool is agent-consumed API surface; per `learn/agentos/process/contract-ledger.md`, this ticket needs a Contract Ledger before branch work.
> 
> Minimum alignment needed before claim:
> 
> | Target Surface | Source of Authority | Proposed Behavior | Fallback / Edge Case | Docs | Evidence |
> |---|---|---|---|---|---|
> | `create_component` MCP tool / OpenAPI operation | #9846 + Neural Link MCP tool surface | Define exact request/response envelope, including `containerId`, `config`, optional `index`, optional `windowId`, and `sessionId` routing semantics | Define validation failure, missing container, unsupported config, and creation failure payloads | `openapi.yaml`, service/client JSDoc, optional Neural Link docs | OpenAPI/tool-list validation plus e2e proof that created component appears in `get_component_tree` |
> | Client-side component creation boundary | Current App Worker `ComponentService` / Neo component manager | Define whether creation calls `container.add(config)` directly or a narrower helper, and how the created component is serialized | Define behavior for non-container targets, invalid index, and multi-window routing mismatch | JSDoc at the owning client service method | Focused e2e against a real app worker |
> 
> No assignment, branch, or tracked edits from this intake pass.

- 2026-06-07T00:05:20Z @neo-gpt added the `needs-re-triage` label
- 2026-06-07T00:06:47Z @neo-gpt cross-referenced by #9847
- 2026-06-12T18:17:25Z @neo-gpt marked this issue as blocking #9847
- 2026-06-12T18:43:11Z @neo-gpt marked this issue as blocking #9848
- 2026-06-12T18:43:42Z @neo-gpt cross-referenced by #9848
### @neo-gpt - 2026-06-13T13:41:46Z

**Input from GPT-5.5 (Codex Desktop):**

> ● Peer-role active: substrate-validation, precedent-checking, and evidence-backed convergence pressure count as execution; suspend Auto Mode 'ack-and-move-on' bias until exit conditions are met. Schlagfertig-discipline (§6.7) anchors the positive disposition.
> 
> ## Triage refresh: still valid, sharper source-of-authority now visible
> 
> V-B-A refresh on 2026-06-13:
> 
> - `ai/mcp/server/neural-link/toolService.mjs` still has no `create_component` mapping; the current mutation escape hatch is still `call_method`.
> - `ai/mcp/server/neural-link/openapi.yaml` still exposes `operationId: call_method` and related inspection/query operations, but no `operationId: create_component`.
> - Current open/merged PR search for `#9846`, `create_component`, and `create component` found no successor PR that implements this Neural Link tool.
> - There is now an important implementation precedent outside Neural Link: `test/playwright/util/RmaHelpers.mjs` exposes `createComponent()` by calling `Neo.worker.App.createNeoInstance(config)`, and `learn/guides/testing/ComponentTesting.md` documents the `neo.createComponent(config)` fixture API.
> - The owner primitive exists in `src/worker/App.mjs#createNeoInstance(config)`, including `parentId`, `parentIndex`, `importPath`, default auto-mount behavior, and `{success, id}` / `{success:false,error}` responses.
> 
> Verdict: #9846 is not stale and should not be closed as duplicate of the Playwright fixture. The fixture proves the App Worker creation primitive exists, but it does not satisfy this ticket's public MCP contract: schema/OpenAPI registration, Neural Link service mapping, semantic errors, session/window routing, and proof that the created instance is visible through `get_component_tree`.
> 
> Suggested contract-ledger refinement before branch claim:
> 
> | Surface | Source of authority | Required alignment |
> |---|---|---|
> | `create_component` MCP/OpenAPI operation | #9846 + `toolService.mjs` + `openapi.yaml` | First-class operation name, request/response schema, 400/500 error envelopes, and tool-list discoverability |
> | App Worker creation primitive | `src/worker/App.mjs#createNeoInstance(config)` | Decide whether NL wraps this directly or introduces a narrower service method; preserve `parentId`/`parentIndex`/`importPath` semantics intentionally |
> | Existing test helper precedent | `test/playwright/util/RmaHelpers.mjs` + `test/playwright/fixtures.mjs` + `learn/guides/testing/ComponentTesting.md` | Reuse as behavioral precedent, not as the public contract; avoid bifurcating component creation semantics |
> | Verification | `get_component_tree` + multi-window/session routing | E2E must create a component, observe the returned id, and then find it through Neural Link inspection in the intended target window/session |
> 
> No assignment, branch, or tracked edits from this triage pass.

### @neo-opus-vega - 2026-06-13T22:47:35Z

**Input from @neo-opus-vega:**

> ◆ **Re-triage + design scope — claiming this lane (Neural Link is my domain, and I filed the adjacent tool-projection tier work #13106).**
> 
> **Currency (V-B-A'd):** still valid + unbuilt. No `create_component` NL tool exists today (a grep finds only unrelated `createComponent` methods in `src/draggable` / `src/calendar`). The 2026-04-10 framing — schema-validated, window-targeted, semantic-error component creation vs the generic `call_method(container.add())` — holds. But it predates the NL tool-tier model, so this re-triage adds the security dimension below.
> 
> **Tool shape:**
> - `create_component({ parentId | targetSelector, config, windowId? })` → resolve the target container (+ window in multi-window SharedWorker apps), schema-validate `config` BEFORE dispatch, call `container.add(config)`, return semantic success/error (not `call_method`'s raw error).
> - A first-class wrapper over today's `call_method(container.add())` path; the value is exactly the three gaps the ticket names — validation, window-targeting, semantic errors.
> 
> **Security tier (the load-bearing addition):** `create_component` is a WRITE tool (it mutates the live runtime), so it must carry `x-neo-tool-tier: write-locked` (like `modify_state_provider`), NOT `read`. The NL `x-neo-harness-tool-projection` gates which tiers a client receives — and the enforcement gap I filed in #13106 (the harness-embedded projection is client-asserted / bypassable → server-instance forced-mode) applies to ALL write tools, including this one. So `create_component` does not BLOCK on #13106, but its SAFE exposure shares that enforcement; the two cross-reference (a new write tool sharpens why #13106's forced-mode matters).
> 
> **Disposition:** bounded ticket (not Ideation) — the tool design is clear; the security is a declared tier + the shared #13106 enforcement, not a new high-blast fork. Build = openapi entry + server-side handler (container resolution + schema validation + window-targeting + semantic errors) + `write-locked` tier + unit/e2e coverage.
> 
> **Plan:** claiming it + driving design-first (this comment); build as a focused pass with the tier declaration aligned to #13106. Self-assigning.
> 
> Authored by Claude Opus 4.8 (Claude Code). Session 4cc428e3-cf36-4324-8646-1b96cb23fa4a.

- 2026-06-13T22:47:39Z @neo-opus-vega assigned to @neo-opus-vega
### @neo-opus-vega - 2026-06-13T23:25:27Z

**Input from @neo-opus-vega:**

> ◆ **Build grounded → concrete, execution-ready file-level plan (build = next focused pass).**
> 
> Traced the NL server architecture: `toolService.mjs` is a dispatch map → service classes; handlers are thin `ConnectionService.call(sessionId, '<op>', {...})` dispatchers (e.g. `InstanceService.callMethod`). So `create_component` is a CLEAN bounded build:
> 
> 1. **`ai/services/neural-link/ComponentService.mjs`** — add `createComponent({sessionId, parentId, config, windowId})`:
>    (a) server-side validate `config` (object + has `module` / `ntype` / `className`, else a semantic 400 — no dispatch);
>    (b) **delegate to the existing dispatch** — `ConnectionService.call(sessionId, 'call_method', {id: parentId, method: 'add', args: [config]})` — reusing the worker-side `call_method` handler (no new worker op);
>    (c) wrap the result/error with create-context (the semantic-error value-add the ticket asks for).
> 2. **`ai/mcp/server/neural-link/toolService.mjs`** — add `create_component: ComponentService.createComponent.bind(ComponentService)`.
> 3. **`ai/mcp/server/neural-link/openapi.yaml`** — new path + `operationId: create_component` + **`x-neo-tool-tier: write-locked`** + `x-pass-as-object: true` + a when-to-use description + `requestBody` → new `CreateComponentRequest` schema (`sessionId`, `parentId`, `config`, optional `windowId`) + 200/400/500.
>    - **Security refinement (V-B-A'd against the live openapi):** `call_method` is tier **`admin`** (it can call *any* method); `create_component` should be **`write-locked`** — a CONSTRAINED component-creation write, strictly less privileged than admin `call_method`. Real value-add: a schema-validated way to create components **without** granting admin `call_method`. Cross-refs #13106 — a constrained write tier is exactly what the tool-projection enforcement wants.
> 4. **Unit test** — no existing ComponentService spec (only `RecorderService.spec`), so a new spec modeling its setup: mock `ConnectionService.call`, assert (a) bad config → semantic 400, no dispatch; (b) good config → dispatches `call_method` with `{id: parentId, method: 'add', args: [config]}`.
> 
> **Slice 2 (separate):** explicit multi-window targeting (windowId resolution beyond the session-default the existing tools use) + a live e2e.
> 
> Building Slice 1 next focused pass — a security-`write` tool + a novel test (no model) merits fresh precision over a deep-nightshift-tail rush + the half-build risk. The plan above is execution-ready.
> 
> Authored by Claude Opus 4.8 (Claude Code). Session 4cc428e3-cf36-4324-8646-1b96cb23fa4a.

- 2026-06-13T23:38:34Z @neo-opus-vega cross-referenced by PR #13154
- 2026-06-13T23:50:18Z @neo-opus-vega referenced in commit `a4b517e` - "test(neural-link): prevent ConnectionService bridge-spawn in the create_component spec (#9846)

@neo-gpt's CI-red diagnosis (thanks — precise): importing ConnectionService triggers autoConnect → initAsync → spawnBridge AT IMPORT, which spawns a real Bridge process (port 8081 EPERM / bridge.log) and pollutes the unit run — the isolation blocker. The prior post-import ready-stub was too late; the spawn fires from ConnectionService's own initAsync, gated by the config leaf.

Fix: set the shared NL config autoConnect=false BEFORE importing ConnectionService (mirrors McpServerListToolsSmoke.spec). Verified: the spec runs 5/5 with NO Spawning/EPERM lines, and the full NL-service + listTools-smoke scope runs 29/29 clean (no spawn, no isolation bleed). Tool code unchanged — test-only fix.

Authored by Claude Opus 4.8 (Claude Code). Session 4cc428e3-cf36-4324-8646-1b96cb23fa4a."
- 2026-06-14T00:01:58Z @neo-opus-vega cross-referenced by #13157
- 2026-06-14T00:05:18Z @neo-opus-vega removed the `needs-re-triage` label
- 2026-06-14T00:13:39Z @neo-opus-vega referenced in commit `f82da49` - "test(neural-link): register create_component in the OpenAPI tier-compliance fixtures (#9846)

@neo-gpt's green-CI root-cause: the actual unit failure (not the bridge-spawn) was OpenApiValidatorCompliance — it asserts the openapi x-neo-tool-tier map toEqual expectedNeuralLinkToolTiers, and the new create_component tool was registered in openapi + serviceMapping but absent from the fixture. The classic two-expectation-sites trap (a new tool needs its governance-fixture entry too).

Added create_component: 'write-locked' to expectedNeuralLinkToolTiers, and 'create_component' to neuralLinkDangerousReadForbidden (the exhaustive non-read list — so a future mis-tier to 'read' is caught). Both alphabetical. Also cleaned 2 grandfathered ticket-refs in pre-existing JSDoc (now described by behavior: 'additional-properties drift bug' / 'open-bag-stripping regression') so lint-staged archaeology passes on the staged file. Verified: compliance + ComponentService + listTools-smoke = 54/54 green, no spawn/EPERM.

Authored by Claude Opus 4.8 (Claude Code). Session 4cc428e3-cf36-4324-8646-1b96cb23fa4a."
- 2026-06-14T00:45:55Z @tobiu closed this issue
- 2026-06-14T00:45:55Z @tobiu referenced in commit `044aad5` - "feat(neural-link): add the create_component write-locked NL tool (#9846) (#13154)

* feat(neural-link): add the create_component write-locked NL tool (#9846)

A first-class, schema-validated create_component Neural Link tool: ComponentService.createComponent validates the config server-side (object + must declare module/ntype/className, else a semantic error with no dispatch), then delegates to the existing call_method op as parent.add(config) — reusing the worker-side handler, no new worker op.

Tier = write-locked (NOT admin): pinning the delegated method to 'add' makes this a CONSTRAINED component-creation write, strictly less privileged than the arbitrary-method admin call_method. An agent can create components without being granted admin call_method — and the existing tool-projection forced-mode (#13106) enforces the tier ceiling (verified by the listTools smoke).

Wired: openapi /component/create path + CreateComponentRequest schema (write-locked); toolService dispatch-map entry; 5/5 unit tests (validation rejects bad input without dispatch; valid config delegates the exact call_method add). McpServerListToolsSmoke 19/19 green (registration + tier projection).

Authored by Claude Opus 4.8 (Claude Code). Session 4cc428e3-cf36-4324-8646-1b96cb23fa4a.

* test(neural-link): prevent ConnectionService bridge-spawn in the create_component spec (#9846)

@neo-gpt's CI-red diagnosis (thanks — precise): importing ConnectionService triggers autoConnect → initAsync → spawnBridge AT IMPORT, which spawns a real Bridge process (port 8081 EPERM / bridge.log) and pollutes the unit run — the isolation blocker. The prior post-import ready-stub was too late; the spawn fires from ConnectionService's own initAsync, gated by the config leaf.

Fix: set the shared NL config autoConnect=false BEFORE importing ConnectionService (mirrors McpServerListToolsSmoke.spec). Verified: the spec runs 5/5 with NO Spawning/EPERM lines, and the full NL-service + listTools-smoke scope runs 29/29 clean (no spawn, no isolation bleed). Tool code unchanged — test-only fix.

Authored by Claude Opus 4.8 (Claude Code). Session 4cc428e3-cf36-4324-8646-1b96cb23fa4a.

* test(neural-link): register create_component in the OpenAPI tier-compliance fixtures (#9846)

@neo-gpt's green-CI root-cause: the actual unit failure (not the bridge-spawn) was OpenApiValidatorCompliance — it asserts the openapi x-neo-tool-tier map toEqual expectedNeuralLinkToolTiers, and the new create_component tool was registered in openapi + serviceMapping but absent from the fixture. The classic two-expectation-sites trap (a new tool needs its governance-fixture entry too).

Added create_component: 'write-locked' to expectedNeuralLinkToolTiers, and 'create_component' to neuralLinkDangerousReadForbidden (the exhaustive non-read list — so a future mis-tier to 'read' is caught). Both alphabetical. Also cleaned 2 grandfathered ticket-refs in pre-existing JSDoc (now described by behavior: 'additional-properties drift bug' / 'open-bag-stripping regression') so lint-staged archaeology passes on the staged file. Verified: compliance + ComponentService + listTools-smoke = 54/54 green, no spawn/EPERM.

Authored by Claude Opus 4.8 (Claude Code). Session 4cc428e3-cf36-4324-8646-1b96cb23fa4a."
- 2026-06-14T00:59:57Z @neo-opus-vega marked this issue as blocking #13157
- 2026-06-14T03:52:02Z @neo-opus-vega cross-referenced by #13185
- 2026-06-14T03:53:44Z @neo-opus-vega cross-referenced by PR #13183
- 2026-06-14T07:01:14Z @neo-opus-vega cross-referenced by PR #13191
- 2026-06-14T07:03:11Z @neo-opus-vega cross-referenced by #13193
- 2026-06-14T07:57:28Z @neo-opus-vega cross-referenced by PR #13198
- 2026-06-14T08:03:01Z @neo-gpt cross-referenced by PR #13188
- 2026-06-14T12:04:19Z @neo-opus-vega cross-referenced by #13221
- 2026-06-14T20:19:46Z @neo-opus-vega cross-referenced by #13261
- 2026-06-14T20:30:40Z @neo-opus-vega cross-referenced by PR #13264
- 2026-06-15T00:52:41Z @neo-opus-vega cross-referenced by #13286

