# Contract Ledger

Authoritative reference for the Contract Completeness Gate and the Contract Ledger matrix. This protocol prevents multi-cycle PR friction caused by ambiguous or assumed API contracts.

**Origin:** Discussion #10703 graduation artifact (issue #10704). Empirical anchor: PR #10700, where 5 of 6 review cycles were spent negotiating the exact API contract (edge cases, legacy fallbacks, concurrent test design) because the agent was allowed to assume the contract implicitly.

## Why this exists

When agents build features that expose public surfaces (or consumed internal surfaces) without a formal contract, the negotiation of edge cases, fallbacks, and types is pushed downstream to the PR Review phase. This causes high friction, multi-cycle delays, and "ping-pong" reviews.

The Contract Ledger forces this negotiation upstream to the ticket creation phase. Ambiguity in the contract must be resolved *before* branching and coding begins.

## The Contract Taxonomy (T1 — T4)

To standardize how we talk about API contracts and feature surfaces, we define four tiers of contract completeness:

| Tier | Contract Class | Description | Risk Profile |
|---|---|---|---|
| **T1** | Implicit | No documented contract. The agent guesses the consumer's intent based on vague ticket prose. | **High Risk.** Guarantees multi-cycle PR friction. Forbidden for public surfaces. |
| **T2** | Scattered | The contract exists across PR comments, GitHub issues, or inline code, but lacks centralized structural alignment. | **Medium Risk.** Prone to edge-case gaps and fallback ambiguity. |
| **T3** | Explicit Matrix | A formal, centralized **Contract Ledger** matrix defining the exact Surface, Source of Authority, Behavior, Fallback, Docs, and Evidence. | **Safe.** The baseline required for any public/consumed surface modification. |
| **T4** | Executable | The T3 Contract Ledger is backed by executable tests (e.g., OpenAPI validation, Playwright suite, TypeScript interfaces) enforcing the contract at runtime. | **Gold Standard.** Required for core framework public APIs and critical memory-core schemas. |

## The Contract Ledger Matrix Schema

Any ticket proposing changes to a public or consumed surface MUST include a Contract Ledger matrix in the Fat Ticket body.

**Schema Definition:**

| Column | Description |
|---|---|
| **Target Surface** | The specific API, component config, endpoint, or class method being modified or created. |
| **Source of Authority** | The foundational truth dictating this behavior (e.g., an Epic, a Discussion, a specific `learn/` doc, or OpenAPI spec). |
| **Proposed Behavior** | The explicit exact "happy path" behavior. Must be specific (e.g., "Returns HTTP 201 with `{ id }` payload"). |
| **Fallback / Edge Case** | The explicit error handling, default value, or degraded state behavior if the primary path fails or inputs are missing. |
| **Docs** | Whether documentation (`JSDoc`, `learn/` markdown, `openapi.yaml`) must be updated. |
| **Evidence** | How the adherence to this contract will be empirically proven (see [`evidence-ladder.md`](./evidence-ladder.md) for valid proof classes). |

**Example Matrix:**

| Target Surface | Source of Authority | Proposed Behavior | Fallback | Docs | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ticket-create` skill | Discussion #10703 | Mandate inclusion of Contract Ledger matrix for public-surface tickets. | Reject if missing | Yes | `ticket-create-workflow.md` updated |
| `Neo.data.Store#load` | Issue #8888 | Accepts `config.limit` to restrict payload size. | Defaults to `Neo.config.defaultPageSize` | Yes | `Store.spec.mjs` pagination tests |

## Surface-Anchor V-B-A

Every Contract Ledger row that names an **existing** field, method, helper,
MCP tool, config key, docs path, or runtime surface MUST be anchored by
row-level Verify-Before-Assert evidence before the ticket/PR/review asserts it.
The author must run the falsifying lookup that would disprove the surface name
or semantics, then let that result determine the row wording.

This is narrower than "verify everything" and broader than "check field names":
the contract row is a public source of authority, so any existing surface it
names must match current substrate reality instead of semantic memory.

**Required discipline:**
- Prefer the upstream substrate anchor over downstream consumer aliases. For
  example, cite the service method, config key, schema field, or docs path that
  owns the behavior rather than a later MCP/tool/user-facing label.
- If the surface is new, say so explicitly and cite the ticket/Discussion as
  Source of Authority. Do not describe a proposed surface as if it already
  exists.
- If the row depends on helper defaults, fallback behavior, or MVP scope, verify
  that behavior in the current implementation or canonical docs instead of
  inheriting it from prior discussion context.
- The Evidence column should name the proof surface that will validate the row
  after implementation; the authoring/review notes should preserve the lookup
  used to verify any existing named surface.

**Failure classes this prevents:**
- Field-name drift: naming `sourceFiles` when the live
  `KnowledgeBaseIngestionService.ingestSourceFiles()` envelope uses `files`,
  `deleted`, `manifestSnapshot`, `baseRevision`, and `headRevision`.
- Helper-default drift: reusing `resolveDeploymentEnabled()` for a
  cloud-deployable lane without verifying that the helper is local-only shaped
  and defaults `cloud` off.
- Downstream-vs-substrate naming drift: naming an MCP healthcheck command when
  the owning substrate anchor is the health payload, such as
  `healthcheck.orchestrator.tasks` recorded through
  `HealthService.recordTaskOutcome()`.
- Existence drift: asserting a `setTenantConfig` MCP tool when the live surface
  is `KnowledgeBaseIngestionService.setTenantConfig()`.
- Stale scope inheritance: carrying an old backup/redeploy boundary after ADR
  0014 records `tenant-repo-sync` as a distinct lane backed by a persistent
  GitMirror primitive.

## Pipeline Integration (The Contract Completeness Gate)

The Contract Ledger is enforced across the swarm lifecycle via three coordinated skill updates:

1. **Upstream Authoring (`ticket-create`):** The agent drafting the ticket is responsible for creating the matrix. This is cheap for the author who has the full ideation context.
2. **Pre-Flight Verification (`ticket-intake`):** The agent picking up the ticket MUST verify the presence and clarity of the Contract Ledger. If missing from a public-surface ticket, the agent must block/clarify and is forbidden from branching/coding.
3. **Downstream Audit (`pr-review`):** The reviewer formally audits the submitted PR against the Contract Ledger. Contradictions or missing fallbacks result in an immediate "Request Changes" state.

## When the Ledger Applies (Trigger Scope)

The Contract Ledger is required for any ticket where:
> The work introduces, modifies, or deprecates a surface that will be consumed by humans, agents, or external systems.

**Heuristic clusters that hit this trigger:**
- Memory Core MCP tools (Agent-consumed).
- Core framework class configs and public methods (Human-consumed).
- OpenAPI specifications and REST endpoints (System-consumed).
- Swarm governance rules and SKILL files (Agent-consumed).

**Trigger does NOT apply to:**
- Private internal methods (`_myMethod`).
- Pure refactoring that does not change the observable public shape.
- Simple bug fixes restoring a previously broken (but already documented) contract.

## Cross-references

- Discussion #10703 — origin ideation
- [`evidence-ladder.md`](./evidence-ladder.md) — reciprocal protocol mapping Evidence classes to these contract tiers
