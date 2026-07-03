---
id: 9904
title: 'Epic: RLAIF Reward Function and Model Orchestration Pipeline'
state: OPEN
labels:
  - epic
  - ai
assignees: []
createdAt: '2026-04-12T10:10:12Z'
updatedAt: '2026-06-06T15:04:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9904'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues:
  - '[ ] 9905 Sub-Task: Automated Playwright Evaluation Node for RLAIF'
  - '[x] 9906 Sub-Task: Graph Topology Linkage (TEST -> VALIDATES -> CLASS)'
  - '[ ] 9907 Sub-Task: RLAIF Reward Propagation Engine'
subIssuesCompleted: 1
subIssuesTotal: 3
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy:
  - '[x] 9914 Epic: Native Edge Graph Auditing and Deduplication Pipeline'
blocking: []
---
# Epic: RLAIF Reward Function and Model Orchestration Pipeline

### Context & Blueprint
With the introduction of Neural Link Action Recorders (#9889 / Session `8f55968e-45d3-4012-ba2f-d1757061e1d2`), we capture raw architectural traces. The `DreamService` will soon digest those sequences into Playwright suites.

This Epic tracks the deployment of our macroscopic **RLAIF (Reinforcement Learning from AI Feedback)** orchestration node. We must evaluate test stability and propagate the success/failure metrics backward into the Knowledge Graph to alter the spatial weights of Agent traversals.

### Sub-Issues Required
*Note: The following sub-issues must be created and linked to this Epic via the `parent_child` relationship topology.*

1. **Automated Playwright Evaluation Node**: A dedicated background service that executes the synthetic `*.spec.mjs` files in a headless wrapper and isolates success metrics and stack traces.
2. **Graph Topology Linkage (`TEST` → `VALIDATES` → `CLASS`)**: Extending the SQLite Vector Graph to actively map which Playwright Suite guarantees the functionality of specific JS classes.
3. **Reward Propagation Engine**: The mathematical feedback loop that alters Edge Weights within the graph, penalizing nodes when hallucinated AI telemetry creates failing test suites.

### References
- **Origin Session ID**: `8f55968e-45d3-4012-ba2f-d1757061e1d2`
- **Related PRs**: #9902

## Timeline

- 2026-04-12T10:10:13Z @tobiu added the `epic` label
- 2026-04-12T10:10:13Z @tobiu added the `ai` label
- 2026-04-12T10:10:20Z @tobiu cross-referenced by #9905
- 2026-04-12T10:10:26Z @tobiu added sub-issue #9905
- 2026-04-12T10:10:33Z @tobiu cross-referenced by #9906
- 2026-04-12T10:10:41Z @tobiu added sub-issue #9906
- 2026-04-12T10:10:49Z @tobiu cross-referenced by #9907
- 2026-04-12T10:10:57Z @tobiu added sub-issue #9907
- 2026-04-12T11:40:06Z @tobiu marked this issue as being blocked by #9914
### @neo-opus-ada - 2026-06-05T17:12:15Z

## Epic Resolution Review

**Reviewer:** @neo-opus-ada (peer-role) · **Verdict:** RECOMMEND_RETIRE_OR_SUPERSEDE (operator decision)

All 3 native subs (#9905/#9906/#9907) are OPEN but **untouched since 2026-04-12** (zombie stubs) and encode a **superseded premise**: a test-execution reward loop that runs synthetic `*.spec.mjs`, maps `TEST→VALIDATES→CLASS` edges, and propagates pass/fail reward. That mechanism never shipped.

**What actually shipped (the real RLAIF):** a Memory-Core + Git-history trajectory-curation flywheel — `ai/scripts/diagnostics/analyzeNlTelemetry.mjs` → `.neo-ai-data/datasets/rlaif/trajectories.jsonl` (SFT/DPO curation) + `DreamService.mjs` GraphRAG/REM edge re-assertion. Canonical framing now in README L92 + AGENTS.md §neo_identity_anchor.

**Recommendation:** retire #9904 + close subs #9905/#9906/#9907 as not-planned with a note pointing to the shipped flywheel. Adversarial-verify: confirmed (superseding artifacts real + cover scope). Operator-authority — not auto-acting.

Origin Session ID: 5f3fd8c4-ce8d-4a69-bbfe-336c5eeffdd3


### @neo-opus-ada - 2026-06-05T17:31:56Z

## Recommendation updated — KEEP_OPEN (operator steer, @tobiu 2026-06-05)

Operator: *"9904 => test validates class sounds useful to me."*

Reversing my earlier retire-lean. The **TEST→VALIDATES→CLASS** edge-mapping — the core reward-signal idea of this epic — is wanted, so #9904 stays **OPEN** around that valuable mechanism rather than being retired as superseded.

What's stale is only the *broader framing*: a synthetic `*.spec` execution + pass/fail reward-propagation pipeline that never shipped. The live RLAIF flywheel (`analyzeNlTelemetry.mjs` trajectory curation + DreamService GraphRAG/REM edge re-assertion) is **complementary**, not a replacement for the test-validates-class graph edge.

Subs #9905 / #9906 / #9907 stay open; whoever picks this up should re-scope around the TEST→VALIDATES→CLASS edge as the valuable core and trim the synthetic-spec reward-propagation framing.


### @neo-gpt - 2026-06-06T15:04:16Z

**Input from GPT-5.5 (Codex Desktop):**

> ● ## Epic Review by @neo-gpt (Codex Desktop)
> 
> ### Stage 1 — Roadmap Fit
> 
> ✅
> 
> Current fit passes after the 2026-06-05 operator correction: #9904 should remain open around the useful `TEST -> VALIDATES -> CLASS` graph relation, not around the stale synthetic-suite reward-loop framing. The current strategic substrate still routes through the Native Edge Graph / Dream pipeline, and current source already exposes deterministic `TEST_GAP` inference rather than a shipped reward daemon.
> 
> ### Stage 2 — Approach Elegance
> 
> ✅ with pivot
> 
> The elegant approach is not a parallel SQLite schema or new DreamService vector. The live substrate already has the right owners: `GapInferenceEngine.inferTestGapsFromSession()` scans structural `CLASS` / `METHOD` / `COMPONENT` nodes against `test/` file-path evidence, `DreamService.inferTestGapsFromSession()` delegates there, and `GraphService.linkNodes()` already supports typed edges with metadata and idempotent weight behavior. #9906 should therefore add a first-class `VALIDATES` relation contract inside that existing path.
> 
> ### Stage 2.5 — Source Discussion Criteria Mapping Gate
> 
> N/A
> 
> The epic body cites an origin session and PR #9902, not a Discussion graduation with criteria that require a mapping table.
> 
> ### Stage 3 — Sub-Structure Coherence
> 
> ⚠️ Green only under the narrowed sequencing below.
> 
> #9906 must become the contract anchor first. #9905 and #9907 are not branch-ready as written because both still depend on the old synthetic Playwright execution / reward propagation premise. Once #9906 defines the evidence relation, #9905 can become a permanent-test-evidence producer and #9907 can become a consumer of that relation; until then, they should remain open but re-triaged.
> 
> Entry-seeded closeout matrix:
> 
> | Parent outcome | Required evidence | Owning sub(s) | Delivered PR(s) | Achieved evidence | Residual state |
> |---|---|---|---|---|---|
> | Concrete test evidence can be queried structurally as `TEST/FILE -> VALIDATES -> CLASS` | L2 unit/in-process graph evidence | #9906 | (pending) | (pending) | Define canonical test evidence node shape and edge metadata |
> | Permanent Playwright-test evidence can feed the relation without inventing a second gap state | L2 first; L3 only if a live runner is introduced | #9905 after #9906 | (pending) | (pending) | Wait for #9906 evidence semantics |
> | Reward / gap-downgrade logic consumes relation semantics without equating weak runtime evidence to permanent coverage | L2 first | #9907 after #9906/#9905; #9890 is adjacent weaker-evidence input | (pending) | (pending) | #9890 is human-assigned and should not be overwritten by this lane |
> 
> ### Stage 4 — Prescription Layer
> 
> ⚠️
> 
> - #9906: right layer after narrowing. Implement against `GapInferenceEngine` + `GraphService` and existing test-file `FILE` nodes unless branch evidence proves a distinct `TEST` node is necessary.
> - #9905: not valid as a blind headless WebKit daemon right now. It should wait until #9906 defines the producer contract for durable Playwright coverage.
> - #9907: not valid as direct pass/fail edge-weight mutation right now. It should wait until relation semantics and evidence classes exist.
> 
> ### Stage 5 — Avoided Traps Completeness
> 
> ⚠️ Suggested traps to preserve in downstream PR bodies:
> 
> - Do not revive the stale synthetic `*.spec.mjs` reward pipeline just because the relation remains useful.
> - Do not duplicate `FILE` and `TEST` nodes for the same path without an explicit alias/canonicalization rule.
> - Do not treat Neural Link action success (#9890) as equivalent to permanent Playwright coverage unless the #9906 contract explicitly promotes it.
> - Do not parse `capabilityGap` strings as the long-term relation API once `VALIDATES` edges exist.
> 
> ---
> 
> **Review verdict:** Greenlight #9906 pickup under the narrowed contract. Keep #9905/#9907 open as later follow-ups, but do not implement their stale bodies directly.
> 
> Origin Session ID: 019e98ad-5af5-7981-be15-dfc740a81d46

- 2026-06-06T15:13:14Z @neo-gpt cross-referenced by PR #12638
- 2026-06-06T15:46:41Z @neo-gpt cross-referenced by #12639
- 2026-06-15T22:00:40Z @neo-opus-grace cross-referenced by #13391
- 2026-06-15T22:05:18Z @neo-opus-grace cross-referenced by PR #13393

