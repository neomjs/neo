# Contract Ledger

Authoritative reference for the Contract Completeness Gate and the Contract Ledger matrix. This protocol prevents multi-cycle PR friction caused by ambiguous or assumed API contracts.

**Origin:** Discussion #10703 graduation artifact (issue #10704). Empirical anchor: PR #10700, where 5 of 6 review cycles were spent negotiating the exact API contract (edge cases, legacy fallbacks, concurrent test design) because the agent was allowed to assume the contract implicitly.

<a id="why-this-exists"></a>
## Why this exists

When agents build features that expose public surfaces (or consumed internal surfaces) without a formal contract, the negotiation of edge cases, fallbacks, and types is pushed downstream to the PR Review phase. This causes high friction, multi-cycle delays, and "ping-pong" reviews.

The Contract Ledger forces this negotiation upstream to the ticket creation phase. Ambiguity in the contract must be resolved *before* branching and coding begins.

<a id="the-contract-taxonomy-t1-t4"></a>
## The Contract Taxonomy (T1 — T4)

To standardize how we talk about API contracts and feature surfaces, we define four tiers of contract completeness:

| Tier | Contract Class | Description | Risk Profile |
|---|---|---|---|
| **T1** | Implicit | No documented contract. The agent guesses the consumer's intent based on vague ticket prose. | **High Risk.** Guarantees multi-cycle PR friction. Forbidden for public surfaces. |
| **T2** | Scattered | The contract exists across PR comments, GitHub issues, or inline code, but lacks centralized structural alignment. | **Medium Risk.** Prone to edge-case gaps and fallback ambiguity. |
| **T3** | Explicit Matrix | A formal, centralized **Contract Ledger** matrix defining the exact Surface, Source of Authority, Behavior, Fallback, Docs, and Evidence. | **Safe.** The baseline required for any public/consumed surface modification. |
| **T4** | Executable | The T3 Contract Ledger is backed by executable tests (e.g., OpenAPI validation, Playwright suite, TypeScript interfaces) enforcing the contract at runtime. | **Gold Standard.** Required for core framework public APIs and critical memory-core schemas. |

<a id="the-contract-ledger-matrix-schema"></a>
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

<a id="pipeline-integration-the-contract-completeness-gate"></a>
## Pipeline Integration (The Contract Completeness Gate)

The Contract Ledger is enforced across the swarm lifecycle via three coordinated skill updates:

1. **Upstream Authoring (`ticket-create`):** The agent drafting the ticket is responsible for creating the matrix. This is cheap for the author who has the full ideation context.
2. **Pre-Flight Verification (`ticket-intake`):** The agent picking up the ticket MUST verify the presence and clarity of the Contract Ledger. If missing from a public-surface ticket, the agent must block/clarify and is forbidden from branching/coding.
3. **Downstream Audit (`pr-review`):** The reviewer formally audits the submitted PR against the Contract Ledger. Contradictions or missing fallbacks result in an immediate "Request Changes" state.

<a id="when-the-ledger-applies-trigger-scope"></a>
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

<a id="cross-references"></a>
## Cross-references

- Discussion #10703 — origin ideation
- [`evidence-ladder.md`](./evidence-ladder.md) — reciprocal protocol mapping Evidence classes to these contract tiers
