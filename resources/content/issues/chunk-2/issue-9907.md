---
id: 9907
title: 'Sub-Task: RLAIF Reward Propagation Engine'
state: OPEN
labels:
  - enhancement
  - ai
  - needs-re-triage
assignees: []
createdAt: '2026-04-12T10:10:48Z'
updatedAt: '2026-06-06T13:57:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9907'
author: tobiu
commentsCount: 1
parentIssue: 9904
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Sub-Task: RLAIF Reward Propagation Engine

### Context
As part of the [Epic: RLAIF Reward Function and Model Orchestration Pipeline](#9904), we need a mathematical engine to execute the actual reinforcement learning parameter adjustments across the Native Graph.

### Task
Implement the **Reward Propagation Engine**. This service consumes the success metrics yielded by the Automated Playwright Evaluation Node (#9905) for a given sequence.

**Mechanism:**
1. If the generated Playwright test suite passes (Success): Increase the topological Edge Weight between the `TEST` node and the source `CLASS` node (#9906) and the originating `AGENT_MEMORY` node, validating the AI's prior conceptual mapping.
2. If the generated Playwright test suite crashes/fails (Penalty): Depreciate the corresponding topological Edge Weight. This penalizes hallucinated telemetry or invalid logic and steers future Agent Swarm transversals away from those logic paths.

### References
- **Origin Session ID**: `8f55968e-45d3-4012-ba2f-d1757061e1d2`
- **Parent Epic**: #9904

## Timeline

- 2026-04-12T10:10:49Z @tobiu added the `enhancement` label
- 2026-04-12T10:10:49Z @tobiu added the `ai` label
- 2026-04-12T10:10:57Z @tobiu added parent issue #9904
- 2026-06-05T17:12:16Z @neo-opus-ada cross-referenced by #9904
### @neo-gpt - 2026-06-06T13:57:40Z

**Input from GPT-5.5 (Codex Desktop, extra-high thought budget):**

> ● ## Ticket intake refresh — reward propagation is not branch-ready as written
> 
> [ARCH_ALIGNMENT]
> 
> **Verdict:** `needs-narrowing` + `needs-contract-alignment`, not `valid-as-written`.
> 
> V-B-A results:
> - Parent #9904 remains open for the useful `TEST -> VALIDATES -> CLASS` relation, but the original synthetic pass/fail reward-loop framing is stale.
> - Current source has no live `Reward Propagation` or `VALIDATES` implementation in `ai/`, `test/playwright/unit/ai`, or `learn/`; a targeted source sweep returned no live hits for those terms.
> - `GraphService.linkNodes()` already increments an existing edge’s weight and caps it, but that is a generic graph-link behavior, not a reward-propagation engine. `GapInferenceEngine` currently emits `[TEST_GAP]` through `capabilityGap`; it does not consume `VALIDATES` edges or mutate weights from test pass/fail telemetry.
> - #9890 is an adjacent weaker-evidence path: Neural Link action success may downgrade a TEST_GAP, but it should not be treated as equivalent to permanent Playwright test coverage unless the #9906 contract explicitly promotes it.
> 
> **Recommended re-scope:** keep #9907 open only as a later follow-up after #9906 defines the structural edge/evidence contract and after #9905 (or another permanent test-evidence producer) defines what counts as durable test coverage. Do not implement pass/fail edge-weight mutation from the stale body text directly; that would risk encoding synthetic-suite assumptions the current substrate does not ship.

- 2026-06-06T13:57:58Z @neo-gpt added the `needs-re-triage` label
- 2026-06-06T15:05:56Z @neo-gpt cross-referenced by #9906
- 2026-06-06T15:13:14Z @neo-gpt cross-referenced by PR #12638

