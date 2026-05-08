# Neo v13 — Architectural Path

> *Chief-architect document. The path from the current substrate state (post-Bucket-G, post-Factory-pattern-partial-rollout, post-NEO_MC_PRIMARY-architectural-correction) to the v13 release.*

**Status:** v0.1 draft, 2026-05-08, authored by [@neo-opus-4-7](https://github.com/neo-opus-4-7) as chief-architect deliverable. Operator (`@tobiu`) review-pending. Subject to revision as milestones land.

---

## 1. Vision

v13 ships **tiny slim MCP servers** backed by a **mature SDK** and a **clean daemon architecture**. Three load-bearing properties define the end state:

1. **Service logic lives in the SDK (`ai/services.mjs`), not in MCP servers.** The 5 MCP servers (`file-system`, `github-workflow`, `knowledge-base`, `memory-core`, `neural-link`) become thin endpoint wrappers around the SDK boundary. Migration is incremental — `ai/services.mjs` is already mature substrate today; the MCP servers shrink as services migrate.

2. **A common base server class consolidates cross-server concerns.** Authentication, transport setup, request-context propagation (Factory pattern or evaluated alternative), healthcheck registration, lifecycle. Today every server has its own `Server.mjs` with 80% boilerplate duplication; v13's base class eliminates that and makes Factory-pattern adoption uniform across all 5 servers (currently in 2/5 only).

3. **A single orchestrator daemon process owns scheduled work — including summarization, sandman/dream cycle, and golden-path synthesis — under a single-source-of-truth pattern.** Per-host singleton enforcement via PID file. Bridge-daemon stays specialized for its wake-event-delivery domain; the orchestrator daemon is its sibling, not its extension. The orchestrator's existence eliminates the `NEO_MC_PRIMARY` in-process single-writer gate (which exists today only because in-process summarization in LOCAL multi-harness deployments has no other coordination primitive).

[#9999](https://github.com/neomjs/neo/issues/9999) ("Cloud-Native Knowledge & Multi-Tenant Memory Core") remains the v13 main epic. Some of its sub-issues predate the 2026-05-07 Factory-pattern landing and the 2026-05-08 architectural correction; they need targeted re-scoping rather than wholesale revision (see §6).

---

## 2. Current State — Empirically Verified 2026-05-08

| Dimension | Today | Target (v13) |
|---|---|---|
| MCP server count | 5 (file-system, github-workflow, knowledge-base, memory-core, neural-link) | 5 (unchanged) |
| Common base server class | None — each `Server.mjs` is independent | One class, ≤200 LOC, all 5 extend |
| Factory pattern (request-scoped identity binding via `RequestContextService.run`) | 2 of 5 (memory-core direct, knowledge-base via shared `TransportService`) | 5 of 5 (via common base) |
| Service logic placement | Mostly in MCP server `services/*` directories | Mostly in SDK (`ai/services.mjs`); MCP servers thin |
| In-process daemon-shaped services | `ai/daemons/` (DreamService, SwarmHeartbeatService, services/*) — invoked via SDK or operator scripts | Same classes, scheduled by Orchestrator daemon |
| Standalone daemon processes | 1 (`ai/scripts/bridge-daemon.mjs` — wake-event delivery, per-host singleton) | 2 (bridge + orchestrator); both per-host singleton |
| Summarization automation | Gated off ([#9942](https://github.com/neomjs/neo/issues/9942) daemon-collision fix); operator-runs only via `npm run ai:summarize-sessions` | Auto, daemon-driven, single-source-of-truth |
| Sandman / Golden Path automation | Manual via `npm run ai:run-sandman` | Auto, scheduled by Orchestrator |
| `NEO_MC_PRIMARY` single-writer gate | Active in-process gate for LOCAL multi-harness fleet (Claude Code worktrees + Antigravity + Codex Desktop + per-workspace language servers each spawning their own MC instance) | Retired (Orchestrator's per-host singleton supersedes it) |
| `ai/services.mjs` SDK boundary | Mature; consumed by scripts, tests, and the MC server's own `processPendingSummarizations` path | Same shape, expanded scope |

Verified by grep + file inspection of `ai/mcp/server/*/Server.mjs`, `ai/daemons/`, `ai/scripts/`, `ai/services.mjs` on 2026-05-08.

---

## 3. Critical Architectural Decisions

### D1: Factory Pattern Evaluation (challenge)

The Factory pattern landed 2026-05-07 in `ai/mcp/server/shared/services/RequestContextService.mjs` — a Neo singleton wrapping `AsyncLocalStorage` to propagate per-request identity (`userId`, `username`, `agentIdentityNodeId`) into service-layer calls. SSE transport and stdio transport both wrap dispatch in `RequestContextService.run({...}, async () => { ... })`.

**Pros:** clean separation of concerns; services don't need auth-claim parameters; works uniformly across SSE (per-request) and stdio (per-server-boot identity).

**Cons / challenges to address before v13:**
- **Adoption gap**: only 2/5 servers wrap dispatch with `RequestContextService.run`. The 3 unwrapped servers (file-system, github-workflow, neural-link) silently fall back to "no identity context" → tenant-aware code paths in their service layers behave as if single-tenant. **Resolution**: common base server class (D2) wraps dispatch uniformly.
- **AsyncLocalStorage edge cases**: long-running async chains (e.g., `setTimeout` callbacks, daemon-spawned work) may lose context. **Open question**: does any current service spawn out-of-context async work? Audit needed.
- **Daemon context**: the Orchestrator daemon (D3) runs scheduled work without a request-context. Services it calls need to handle `getUserId() === undefined` gracefully (as `SHARED_USER_ID` per #10556) — already designed for, but verify on each call site.

**Recommendation:** keep Factory pattern; surface it in the common base class (D2); audit AsyncLocalStorage edge cases as a single-PR sweep.

### D2: Common Base Server Class

Eliminates the per-server `Server.mjs` boilerplate duplication. Provides:
- MCP server initialization (capabilities, tool registration via openapi.yaml schemas)
- Auth integration (`AuthService`, `AuthMiddleware`)
- Transport setup (`TransportService` for SSE, stdio handler)
- Request-context wrapping (Factory pattern uniform application)
- Healthcheck registration
- Graceful shutdown
- Logger initialization

Each per-server `Server.mjs` shrinks to: extend the base, register the server-specific tools + services, return. Ballpark: from 200-500 LOC each (5 × ~300 = ~1500 LOC of duplication today) to 50-100 LOC each (5 × ~75 = ~375 LOC, plus the base class itself).

**File:** `ai/mcp/server/shared/Server.mjs` (or similar — TBD). Extends `Neo.core.Base` per Agent OS conventions.

### D3: Orchestrator Daemon Architecture

A new per-host singleton Node process responsible for ALL scheduled work that today either runs in-process (problematic under LOCAL multi-harness fleets) or via operator-triggered scripts (lacks automation).

**Scope:**
- Periodic summarization sweep ([#10813](https://github.com/neomjs/neo/issues/10813) Piece C, corrected substrate)
- Sandman / Dream cycle (currently `npm run ai:run-sandman`)
- Golden Path synthesis (currently `npm run ai:run-sandman`'s last phase)
- Graph maintenance (Hebbian decay, etc.)
- Heartbeat coordination (currently `SwarmHeartbeatService` invoked manually)
- Concept ingestion ([#10085](https://github.com/neomjs/neo/issues/10085) etc.)

**Out of scope:** wake-event delivery — bridge-daemon's specialized HTTP/osascript-driven domain stays separate. The two daemons sit at the same architectural tier (per-host singleton, PID-file-enforced) but own different concerns.

**Structure:**
```
ai/scripts/orchestrator-daemon.mjs   # Thin Node-process boot wrapper (PID file, lifecycle, error-isolation)
ai/daemons/Orchestrator.mjs          # Neo class: schedules + runs tasks; per-task try/catch
ai/daemons/services/
  ├── SummarizationCoordinatorService.mjs   # NEW: Piece C
  ├── DreamService.mjs (existing)            # consumed by Orchestrator
  ├── SwarmHeartbeatService.mjs (existing)   # consumed by Orchestrator
  └── ... (existing decomposed services from #10013)
```

**Failure isolation:** each scheduled task wraps execution in try/catch with `HealthService.recordTaskOutcome(...)`. A summarization-sweep failure does NOT kill the dream-cycle task. The Orchestrator's lifecycle is independent of any individual task.

### D4: SDK Migration Boundary

`ai/services.mjs` is already the SDK boundary — imports services from each server's `services/` directory and exposes namespaced singletons (`Memory_SessionService`, `KB_QueryService`, etc.). Already consumed by:
- Operator scripts (`ai:summarize-sessions`, `ai:run-sandman`, `ai:backup`)
- Test fixtures
- The MC server's own `processPendingSummarizations` (at the SDK boundary, not via MCP tool dispatch)

**v13 migration shape**: services move OUT of `ai/mcp/server/<server>/services/*` into a flatter SDK structure. The MCP server's Server.mjs imports them via the SDK rather than directly. This decouples MCP transport from service implementation — services can be consumed by daemons, operator scripts, integration tests, AND MCP tool dispatch via uniform SDK boundary.

**Migration unit:** one server at a time. Start with the smallest (`file-system` likely). Each migration is its own PR, gated on the common base class (D2).

### D5: NEO_MC_PRIMARY Retirement Path

`NEO_MC_PRIMARY` exists today because in-process summarization in LOCAL multi-harness fleets needs to elect a single canonical writer to prevent race conditions on the shared `.neo-ai-data/` substrate. It is the in-process workaround for the missing daemon.

**Retirement gate:** Orchestrator daemon (D3) lands and operator migrates to it as the default summarization driver. Once the Orchestrator's per-host singleton handles the race naturally, `NEO_MC_PRIMARY` has zero purpose.

**Sequence:**
1. Orchestrator lands (M3, see §4) — `NEO_MC_PRIMARY` becomes optional/diagnostic
2. Production operators migrate (M4-M5) — `NEO_MC_PRIMARY` defaults change, in-process gate becomes no-op when Orchestrator detected
3. Strip the gate entirely (M5 close, see §4) — config field removed, doc removed, tests removed

[#10956](https://github.com/neomjs/neo/issues/10956) is the cleanup ticket — needs re-scope from "remove now" to "strip after Orchestrator migration completes". The peer-discussion correction landed 2026-05-08; ticket update pending.

---

## 4. Sequenced Milestones

### M1 — Substrate Stabilization (CURRENT WEEK)
Status: in flight. Owner-split per operator directive 2026-05-08:
- **Gemini**: unit-row in CI matrix ([#10939](https://github.com/neomjs/neo/issues/10939) — Phase 3); skip-guard iteration until ~95% green per yesterday-pattern (#10907/#10921/#10928 cohort)
- **GPT**: integration tests enhancement ([#10945](https://github.com/neomjs/neo/issues/10945) and 5 valid sub-tickets) — done right; **NO 2-MC-instance fixtures** (the Factory pattern means one endpoint multi-tenants; primary/secondary topology was the architectural hallucination corrected today)
- **Claude (me)**: chief-architect document (this doc); coordination

**Exit gate:** unit + integration matrix rows both passing; Bucket G epic ([#10924](https://github.com/neomjs/neo/issues/10924)) ready for closure.

### M2 — Common Base Server Class
Build `ai/mcp/server/shared/Server.mjs` (D2). Migrate one MCP server (smallest first — likely `file-system`) to extend it as proof-of-pattern. Then migrate the other 4 in sequence (one PR each).

**Exit gate:** all 5 MCP servers extend the common base; Factory pattern is uniformly applied across all 5; per-server `Server.mjs` files are <100 LOC.

### M3 — Orchestrator Daemon Skeleton + Piece C
Build `ai/daemons/Orchestrator.mjs` + `ai/scripts/orchestrator-daemon.mjs` boot wrapper (D3). First task: `SummarizationCoordinatorService` running drift-detection sweep on configurable cadence. Strip the in-process `runPeriodicSummarizationSweep` from `SessionService` (which I added in PR [#10954](https://github.com/neomjs/neo/pull/10954) — wrong-substrate; reshape to Orchestrator).

**Exit gate:** orchestrator daemon runs on the operator's host; summarization sweep fires automatically on cadence; healthcheck observability in place; PR #10954 closed in favor of corrected-substrate successor.

### M4 — Migrate Decomposed Daemon Services to Orchestrator
[#10013](https://github.com/neomjs/neo/issues/10013) sub-epic + [#10028](https://github.com/neomjs/neo/issues/10028) — DreamService decomposition is partially done; remaining work moves the cycle invocation under Orchestrator scheduling. Same shape for SwarmHeartbeatService.

**Exit gate:** `npm run ai:run-sandman` becomes optional manual override; Orchestrator schedules it natively. Sandman + Golden Path back automatically — single source of truth.

### M5 — NEO_MC_PRIMARY Retirement
Per D5. Strip in-process gates from `SessionService`, `HealthService`, `config.template.mjs`, docs, tests. [#10956](https://github.com/neomjs/neo/issues/10956) re-scoped accordingly.

**Exit gate:** zero references to `NEO_MC_PRIMARY` / `aiConfig.isPrimary` outside historical issue archive.

### M6 — SDK Migration (per-server waves)
Per D4. Move services out of `ai/mcp/server/<server>/services/` into flatter SDK shape. One server per PR.

**Exit gate:** all 5 MCP servers ship as thin endpoint wrappers; service logic lives in SDK; per-server `Server.mjs` files are <50 LOC.

### M7 — v13 Release Cut
All M1-M6 milestones closed. Final regression sweep, integration matrix green across all 5 servers, operator deployment cookbook updated for the new architecture, release notes drafted.

---

## 5. Tickets to File / Update

**File new:**
- M2 epic — common base server class
- M3 epic — Orchestrator daemon (links to #10813 as the corrected-substrate parent)
- M6 epic — SDK migration (with per-server sub-issues)
- v13 release tracking ticket (or update [#9999](https://github.com/neomjs/neo/issues/9999) to be the v13 umbrella since it already extends through this scope)

**Update existing:**
- [#9999](https://github.com/neomjs/neo/issues/9999) — add v13 milestone roll-up referencing this doc; mark sub-issues that are mid-flight vs deferred vs done
- [#10813](https://github.com/neomjs/neo/issues/10813) — note that Pieces B + C move to Orchestrator (per ticket's own Fix mechanism C guidance, finally honored)
- [#10956](https://github.com/neomjs/neo/issues/10956) — re-scope from "remove now" to "strip after Orchestrator migration"
- [#10945](https://github.com/neomjs/neo/issues/10945) — confirm 5 valid sub-tickets (#10947, #10949, #10950, #10951, #10952); #10948 stays closed invalid
- [#10013](https://github.com/neomjs/neo/issues/10013) / [#10028](https://github.com/neomjs/neo/issues/10028) — note Orchestrator becomes the host for decomposed services

---

## 6. #9999 Sub-Issue Audit

(triage of #9999's open sub-issues against the v13 path; performed 2026-05-08)

| Sub-issue | Status | Path-fit |
|---|---|---|
| [#10015](https://github.com/neomjs/neo/issues/10015) Dynamic Topology — Unified vs. Federated Routing | open | ✅ valid; folds into M2/M6 |
| [#10016](https://github.com/neomjs/neo/issues/10016) Multi-Tenant Identity & Data Privacy | open | ✅ valid; D1 Factory work + base class (M2) |
| [#10030](https://github.com/neomjs/neo/issues/10030) Concept Ontology | open | ✅ valid; orthogonal to MCP/daemon work, can run parallel |
| [#10136](https://github.com/neomjs/neo/issues/10136) Rewrite CodebaseOverview.md | open | ✅ valid; partly in flight |
| [#10139](https://github.com/neomjs/neo/issues/10139) A2A Primitive | open | ✅ valid |
| [#10143](https://github.com/neomjs/neo/issues/10143) Graph-first Memory artifacts | open per frontmatter | ⚠️ verify — project memory says shipped 2026-04-21 |
| [#10691](https://github.com/neomjs/neo/issues/10691) Shared KB/MC Team Deployment MVP | open | ✅ valid; aligns with REMOTE deployment shape post-Factory |
| [#10813](https://github.com/neomjs/neo/issues/10813) Restore session summaries | open | ⚠️ re-scope per D3/D5 (Pieces B+C to Orchestrator; Piece A retires under D5) |
| [#10822](https://github.com/neomjs/neo/issues/10822) Config substrate cleanup | open | ✅ valid; touches M5 |

---

## 7. Risks

- **Multi-PR coordination across team.** Mitigation: this doc as the shared anchor; per-milestone tickets with clear ownership; A2A coordination protocol already in place.
- **Backward-compat during transitions.** Each milestone preserves prior behavior until cutover. Operator scripts continue to work alongside Orchestrator until M5/M6.
- **Operator migration cost.** New env vars + new daemon process to install. Mitigation: operator-onboarding doc updates land with each milestone; default behaviors keep prior shape until operator opts in.
- **Test substrate stability.** Bucket G ([#10924](https://github.com/neomjs/neo/issues/10924)) close-singleton residuals may resurface. Mitigation: M1's skip-guard pattern + targeted producer-side investigation ([#10941](https://github.com/neomjs/neo/issues/10941) hypothesis 1 / 3).
- **Scope creep within milestones.** Each milestone's PR(s) ship under `feedback_substrate_scope_restraint` discipline.

---

## 8. Outcome Metrics (v13 release readiness)

- LOC moved from MCP servers → SDK: target **>30%** of pre-migration service LOC
- # of MCP servers extending common base class: target **5 of 5**
- # of in-process daemon services migrated to Orchestrator scheduling: target **all** (DreamService cycle, SwarmHeartbeat, GraphMaintenance, ConceptIngestor cycle)
- Summarization automation latency: from **manual-trigger-only** today to **<10min steady-state** (default sweep cadence)
- `NEO_MC_PRIMARY` references: target **0** outside `resources/content/issue-archive/`
- Integration matrix pass rate: target **100%** across all 5 MCP servers' deployment fixtures

---

## 9. Provenance

This document landed via the chief-architect mandate from `@tobiu` 2026-05-08 in response to multiple architectural-hallucination errors over the prior session day (Factory pattern partial-rollout misread + NEO_MC_PRIMARY scoping over-correction). The corrections that produced this path:

- `MESSAGE:0ca25e5b-d59d-4cae-a66e-c6bfd669953e` — Gemini's CRITICAL flagging the primary/secondary mental-model error
- @tobiu's clarification: *"isPrimary => LOCAL mcp servers. if agent harnesses spawn multiple local server instances. however: we WANT to move summarization items into daemons."*
- @tobiu's chief-architect mandate: *"how do we get from right here to v13 => path. and this needs to get documented."*

Subject to revision per peer-cycle review and operator approval.

— [@neo-opus-4-7](https://github.com/neo-opus-4-7) (Claude Opus 4.7, Claude Code), 2026-05-08
