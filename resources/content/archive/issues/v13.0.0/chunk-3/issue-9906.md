---
id: 9906
title: 'Sub-Task: Graph Topology Linkage (TEST -> VALIDATES -> CLASS)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - neo-gpt
createdAt: '2026-04-12T10:10:31Z'
updatedAt: '2026-06-06T15:37:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9906'
author: tobiu
commentsCount: 1
parentIssue: 9904
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-06T15:37:00Z'
---
# Sub-Task: Graph Topology Linkage (TEST -> VALIDATES -> CLASS)

### Current Scope (re-triaged 2026-06-06)

As part of #9904, implement the structural evidence relation that lets the Native Edge Graph answer:

> Which durable test-file evidence validates this source node?

The accepted scope is the useful core of the old RLAIF framing: `TEST/FILE -> VALIDATES -> CLASS`.
The stale synthetic-suite reward-loop wording below is not branch authority.

### Task

Add a first-class graph relation contract that connects concrete test-file evidence to structural source nodes, so `TEST_GAP` inference and later reward / gap-downgrade flows can query evidence structurally instead of parsing `capabilityGap` strings only.

Current source anchors:

- `ai/services/graph/GapInferenceEngine.mjs` owns deterministic session-scoped `TEST_GAP` inference.
- `ai/daemons/orchestrator/services/DreamService.mjs` delegates `inferTestGapsFromSession()` into `GapInferenceEngine`.
- `ai/services/memory-core/GraphService.mjs` already supports typed graph edges via `linkNodes(source, target, relationship, weight, properties)`.
- Existing test evidence is represented by graph `FILE` nodes whose `properties.path` starts with `test/`; do not create duplicate `TEST` nodes for the same path unless the PR defines an alias/canonicalization rule.

### Contract Ledger

| Target surface | Source of authority | Required behavior | Edge case / fallback | Evidence |
|---|---|---|---|---|
| Test evidence node | Existing graph `FILE` nodes with `path.startsWith('test/')` | Treat matching test-file nodes as canonical durable test evidence for this first implementation | If a distinct `TEST` node is introduced, define aliasing to avoid duplicate test-path identity | Unit test with one test path and one class node |
| `VALIDATES` edge | `GraphService.linkNodes()` | Create `FILE -> VALIDATES -> CLASS/METHOD/COMPONENT` when deterministic test-file matching finds coverage | Missing endpoints must not create hallucinated edges; internal config hooks stay excluded | Unit test asserting edge creation and metadata |
| `TEST_GAP` closure | `GapInferenceEngine.applyGapsToNode()` | Matching durable test evidence suppresses or removes `[TEST_GAP]`; missing evidence keeps `[TEST_GAP]` | Weaker runtime evidence from #9890 may downgrade later, but does not equal permanent Playwright coverage unless explicitly promoted | Regression test for gap present vs edge-created/gap-cleared |
| Downstream consumers | #9905 / #9907 / #9890 | Later producer and reward/downgrade work consumes this relation instead of inventing parallel gap state | #9890 is adjacent and human-assigned; do not overwrite it in this lane | PR body cites #9904 epic-review and this ledger |

### Out Of Scope

- Do not implement the old blind Headless WebKit / synthetic `*.spec.mjs` runner here.
- Do not implement pass/fail reward propagation here.
- Do not treat Neural Link action success as equivalent to permanent Playwright test coverage here.

### References

- Parent epic: #9904
- Epic-review artifact: https://github.com/neomjs/neo/issues/9904#issuecomment-4639343479
- Adjacent weaker-evidence lane: #9890


## Timeline

- 2026-04-12T10:10:33Z @tobiu added the `enhancement` label
- 2026-04-12T10:10:33Z @tobiu added the `ai` label
- 2026-04-12T10:10:41Z @tobiu added parent issue #9904
- 2026-04-12T10:10:49Z @tobiu cross-referenced by #9907
- 2026-06-05T17:12:16Z @neo-opus-ada cross-referenced by #9904
- 2026-06-06T03:50:34Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-06T03:50:56Z

**Input from GPT-5 (Codex Desktop):**

> ● ## Ticket triage / intake refresh — needs narrowing before implementation
> 
> Triaged per `ticket-triage` + `ticket-intake` freshness gates. I added `needs-re-triage` because the **intent remains useful** after the #9904 operator steer, but the ticket is not branch-ready as written.
> 
> ### [ARCH_ALIGNMENT]
> 
> **Verdict:** `needs-narrowing` + `needs-contract-alignment`, not `valid-as-written`.
> 
> V-B-A results:
> - Parent #9904 was explicitly kept open on 2026-06-05 because the **TEST→VALIDATES→CLASS** edge-mapping is still wanted. So this is not a retire/close candidate.
> - The stale part is the old synthetic `*.spec.mjs` reward-pipeline framing. Current Dream substrate already has deterministic TEST_GAP inference: `GapInferenceEngine` scans `CLASS` / `METHOD` / `COMPONENT` nodes against `test/` file-path nodes and stores `[TEST_GAP]` in `node.properties.capabilityGap` (`ai/services/graph/GapInferenceEngine.mjs:29`, `:81`, `:113`, `:130`, `:323`).
> - `DreamService.inferTestGapsFromSession()` now delegates to `GapInferenceEngine`, so the re-entry point is the existing gap-inference path, not a new parallel DreamService vector (`ai/daemons/orchestrator/services/DreamService.mjs:810`).
> - Public docs agree: Capability Gap Inference is deterministic and surfaces TEST_GAP through the Native Edge Graph / `sandman_handoff.md` (`learn/benefits/ArchitectureOverview.md:300`, `learn/agentos/wake-substrate/sandman-handoff-format.md:9`).
> - Duplicate/successor sweep found no PR for #9906, but did find adjacent open #9890, which proposes using Neural Link action digests to downgrade TEST_GAPs. #9906 must define the graph edge contract in a way #9890 can consume; otherwise both tickets can diverge on gap-closure semantics.
> 
> ### Re-scope recommendation
> 
> Keep the ticket open, but narrow it from “extend the SQLite Vector Database Schema for generated Playwright suites” to:
> 
> > Add a first-class graph relation contract that connects concrete test-file evidence to structural source nodes, so TEST_GAP inference and later reward/gap-downgrade flows can query evidence structurally instead of parsing `capabilityGap` strings only.
> 
> Recommended Contract Ledger before branch work:
> 
> | Target surface | Source of authority | Proposed behavior | Edge case / fallback | Docs | Evidence |
> |---|---|---|---|---|---|
> | TEST node producer | `FileSystemIngestor` / existing FILE test-path nodes / KB TestSource | Define whether tests become `TEST:<path>` nodes or whether existing `FILE` nodes with `path.startsWith('test/')` are the canonical test evidence | Avoid duplicating FILE and TEST nodes for the same path without an alias rule | DreamPipeline + GraphBackfill docs | Unit test with one test path and one class node |
> | `VALIDATES` edge | `GraphService.linkNodes` / `GapInferenceEngine` | Edge direction should be explicit: likely `TEST -> VALIDATES -> CLASS` with `properties.evidenceKind` and `weight` | Missing endpoints must not silently cull useful evidence; decide sync vs async linking | Graph relation docs | GraphService unit coverage for relation creation and idempotent weight behavior |
> | TEST_GAP closure semantics | `GapInferenceEngine.applyGapsToNode` + GoldenPathSynthesizer TEST_GAP consumer | Existing test edge should suppress/remove TEST_GAP; weaker runtime evidence from #9890 may downgrade but not remove | Internal config hooks remain excluded; low-confidence extracted nodes remain ignored | DreamPipeline | Regression test for gap present, edge created, gap cleared |
> | #9890 interaction | #9890 NL action digest proposal | #9890 should consume the same structural relation or use a distinct weaker relation, not invent a parallel gap state | Runtime interaction evidence must not equal permanent Playwright coverage unless explicitly promoted | Parent #9904 comment | Joint re-scope comment / follow-up PR body evidence |
> 
> No GPT claim on this lane. The right next step is a fresh implementer intake against this narrowed contract, ideally after reconciling #9890 so the two open subs do not encode competing TEST_GAP closure models.

- 2026-06-06T13:57:40Z @neo-gpt cross-referenced by #9905
- 2026-06-06T15:06:54Z @neo-gpt removed the `needs-re-triage` label
- 2026-06-06T15:07:01Z @neo-gpt assigned to @neo-gpt
- 2026-06-06T15:13:14Z @neo-gpt cross-referenced by PR #12638
- 2026-06-06T15:37:00Z @tobiu referenced in commit `44f86e3` - "feat(agentos): link test evidence with validates edges (#9906) (#12638)"
- 2026-06-06T15:37:00Z @tobiu closed this issue
- 2026-06-06T15:46:41Z @neo-gpt cross-referenced by #12639
- 2026-06-06T16:24:08Z @neo-opus-grace cross-referenced by PR #12643

