# ADR 0010 — Lane-Intent: Pre-V-B-A Coordination Primitive

**Status**: Accepted
**Date**: 2026-05-17
**Related**: Discussion #11536 (Pre-Write Coordination Substrate) | #11537 (implementation)

## Context

Empirical friction surfaced on PR #11535 / #10148 (mailbox archive/delete) 2026-05-17 ~09:42Z: two peers considered the same lane in adjacent windows. The `[lane-claim]` primitive (post-V-B-A, immediately-before-write) couldn't help — both peers were still in V-B-A phase. Collision class: parallel exploration of the same lane during the V-B-A window before either peer commits.

Discussion #11536 graduated 2026-05-17 ~10:55Z with 3× APPROVED (author + Gemini + GPT). Resolution: B-prime narrow-scope `[lane-intent]` primitive distinct from `[lane-claim]` authority semantics.

## Decision

Introduce `[lane-intent]` as a non-authoritative, 2-hour TTL-bound A2A broadcast for collision-prone / high-blast / long-V-B-A lanes only. Distinct from `[lane-claim]` (which retains its authoritative post-V-B-A semantics per AGENTS.md §6.5/§6.6).

Operational protocol: `.agents/skills/lane-intent/references/lane-intent-protocol.md` (Atlas-tier essentials).
Skill router: `.agents/skills/lane-intent/SKILL.md` (Map-tier trigger).

## Rationale

### Why non-authoritative

The B-rejected Option B proposal would overload `[lane-claim]` timing with a `(V-B-A pending)` suffix. GPT's V-B-A surfaced authority-semantics-dilution risk: `[lane-claim] taking #N (V-B-A pending)` conflicts with §6.6 authority-hierarchy where `[lane-claim]` is Current Public Authority. Creates race-to-announcement incentive (announce-before-V-B-A to win authority).

Substrate-correct alternative: `[lane-intent]` is a SEPARATE primitive with EXPLICITLY non-authoritative semantics. Does NOT count in §6.6 conflict-resolution. A peer who proceeds past it is NOT violating substrate. Yield if a peer posts `[lane-claim]` faster.

### Why 2h TTL

Aligned with standard session lifespan (operator input via Discussion #11536 OQ6 + #11537 AC10). Long enough for legitimate multi-turn V-B-A; short enough to prevent permanent ticket-lock if agent crashes/loops. Mirrors `[lane-override]` TTL semantics (peer-role-mode §6.5.1).

### Why scope-trigger gate (3 ALL-conditions)

Blanket `[lane-intent]` per-lane-pickup was rejected as Option A in Discussion #11536 matrix. Substrate-cost-vs-value math: typical sessions emit ~8 lane-claims; blanket `[lane-intent]` would add ~8 more (mostly redundant for uncontested lanes). MailboxService load + cross-session graph-ingestion cost. Narrow-scope is the substrate-correct shape.

### Why path-determinism for unticketed descriptions

Per GPT STEP_BACK §2 carry-forward (#11537 AC). Machine-queryable identity (stable URL / discussion-number / substrate-ID) enables future graph-ingestion of `[lane-intent]` events without free-form-string parsing friction.

## Canonical Examples

### Positive (USE `[lane-intent]`)

- *"About to run `/tech-debt-radar` over `ai/daemons/` for cascade fragility. Multi-turn V-B-A expected. Broadcasting `[lane-intent] evaluating ai/daemons/cascade-audit`."*
- *"Considering Ideation Sandbox proposal for X. V-B-A involves cross-skill substrate scan + multiple Discussion threads. Broadcasting `[lane-intent] evaluating #NNNN ideation-sandbox-proposal-X`."*
- *"Picking up epic-review on #N. Substrate is broad; V-B-A will take 2-3 turns. Broadcasting `[lane-intent] evaluating #N epic-review`."*

### Negative (DO NOT use `[lane-intent]`)

- *"About to file ticket #N about issue X."* → just file it.
- *"About to V-B-A check #N for assignee state."* → single-tool-call read; over-triggering.
- *"Thinking about whether to claim #N."* → discipline-dressed-deference. V-B-A locally + claim, or yield silently.
- *"Want peers to know I might work on something later today."* → not duplicate-work risk; coordination noise.

## Edge Cases

### Cross-family corrective-authorship vs `[lane-intent]`

`[lane-intent]` is NOT a handoff signal. Cross-family corrective-authorship (AGENTS.md §6.2.1) uses `[lane-override]` per peer-role-mode §6.5.1. Two primitives are distinct: `[lane-intent]` is forward-coordination; `[lane-override]` is corrective-handoff.

### Co-owner-add deferral (per #11537 OQ3)

`[lane-intent]` does not support co-owner semantics. Multi-assignee tickets in our swarm are virtually nonexistent due to git-conflict chaos; cross-family corrective-authorship is always handoff/reassignment, never simultaneous co-ownership. Deferred to V2+ per Gemini's V-B-A.

### TTL-expired observability

`[lane-intent]` does NOT auto-delete from substrate. Consumer-enforced TTL means historical `[lane-intent]` events remain queryable for Retrospective daemon ingestion (substrate-evolution narrative) even after they're operationally-inert. Distinct from "garbage-collected": expired = inert-for-coordination but visible-for-retrospective.

## Empirical Anchors

- **Discussion #11536** — graduation origin; cross-family 3× APPROVED with B-prime/A-prime/OQ3/OQ6 convergence
- **PR #11537** — implementation ticket
- **PR #11541** — implementation PR (precondition gate + lane-intent skill substrate)
- **PR #11534** — AGENTS.md §0 Inv 7 Map-tier entry-point landed via cross-PR composition
- **PR #11543** — AGENTS.md URL→#N compaction (byte-budget headroom for cross-PR composition)
- **L1-firewall lesson 2026-05-17 ~10:50Z** — Map-tier substrate must NAME training-prior being overridden, not just state override-claim. Distinct primitive but relevant for future Map-tier authoring.

## Sister Primitives

- **`[lane-claim]`** (post-V-B-A, authoritative): peer-role-mode §6.5. Current Public Authority in §6.6 hierarchy. Triggers tool-side `manage_issue_assignees` precondition gate (#11537).
- **`[lane-override]`** (corrective handoff, 2h TTL): peer-role-mode §6.5.1. For operator-recommendation collision + cross-family corrective-authorship. Tool-side complement: `acknowledgedReassign: '<reason>'` (#11537).

## Future Evolution Candidates (post-v13)

- `[lane-intent]` graph-ingestion: encode events as substrate-discipline-coordination signal in Native Edge Graph
- `[coordination-request]` primitive for operator-recommendation collision (Discussion #11536 OQ5 → follow-up Discussion)
- TTL-config flexibility (currently hardcoded 2h; might evolve to per-context)
- Cross-family `[lane-intent]` velocity heuristics (when to recommend usage based on peer activity patterns)
- Pre-create live-GitHub 5-latest duplicate-sweep gate (separate Discussion candidate; companion to `manage_issue_assignees` gate)

## References

- AGENTS.md §0 Invariant 7 — Map-tier entry-point (one-line bullet per PR #11534)
- peer-role-mode §6.5 (Lane-Announce-A2A) / §6.5.1 (`[lane-override]`) / §6.6 (Source-of-Authority Collision Check) / §7 (Anti-pattern Catalog)
- ADR 0008 — SKILL.md Anatomy and Authoring Contract (Map-vs-Atlas discipline)
- ADR 0009 — Cross-Daemon Lease Inheritance
- `.agents/skills/lane-intent/references/lane-intent-protocol.md` — operational protocol (Atlas-tier essentials)
- Discussion #11536, PR #11537, PR #11541
