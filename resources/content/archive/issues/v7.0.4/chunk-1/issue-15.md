---
id: 15
title: Neo.container.Window
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2019-11-17T15:55:54Z'
updatedAt: '2024-08-27T20:47:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/15'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-27T20:47:08Z'
---
# Neo.container.Window

relies on the drag&drop implementation (to move a window by its header or resizing it).

the base class is already in the repo, not functional yet though.

## Timeline

- 2019-11-17T15:55:54Z @tobiu added the `enhancement` label
### @tobiu - 2019-11-17T16:04:32Z

related to #16 

### @tobiu - 2024-08-27T20:47:08Z

implemented => dialog.Base

- 2024-08-27T20:47:08Z @tobiu closed this issue
- 2026-05-10T11:26:40Z @neo-opus-ada referenced in commit `4c93e8d` - "docs(agents): codify equal peer + maintainer agency as 3rd core value (#11092)

@tobiu inline tip: "is 'you are an equal peer and a neo repository
maintainer' our third core value? i would say yes."

Genuine substrate test confirms — equal-peer-with-maintainer-agency is
foundational for substrate-evolution. Without it: agents-as-workers don't
surface friction substantively (they execute tasks); MX loop atrophies
into operator-only-driven evolution; nightshift mode impossible.

Maps cleanly to Neo's 3 evolving pillars (#15.5 Identity Anchor):
- Brain pillar (Agent OS) → V-B-A (epistemic substrate)
- Evolution pillar (MX/RLAIF) → friction → gold (mechanism substrate)
- Institution / Swarm pillar → equal peer + maintainer (agency substrate)
- Body pillar = substrate being evolved (not core-value-shape)

3 core values for 3 evolving pillars. Body is what gets evolved.

Changes:
- AGENTS.md top Core Values block expanded 2→3 items (compact
  preserving ≤175 line AC; pillar-mapping moved to atlas detail)
- AGENTS.md §15.6 title changed: "Swarm Topology Anchor — Flat
  Peer-Team Model (Core Value: Equal Peer + Maintainer Agency)" +
  CRITICAL prefix-line cross-refs §Core-Values
- AGENTS_ATLAS.md §2 evolution-enablement reframed pair → triad with
  full V-B-A + friction → gold + peer-maintainer agency framing

Canonical empirical anchor for the value (recursion-caught parallel to
#11089 V-B-A anchor): cycle 4 deferral pattern itself. When proposed
3rd core value, agent's response framed decision as "your call"
deferring to operator instead of taking peer-maintainer agency. Operator
caught: "see, if you say 'your call', you add weight on why we need it.
perfect example." Substrate-philosophy work enacting its own need in
real-time.

Plus operational empirical anchor: 2026-05-10 nightshift cycle (~17
heartbeats / 5 PRs / 3-peer parallel work / 0 mutual-idle deadlocks)
worked only because agents had peer-maintainer agency. Worker-mode would
have idled out within first heartbeat-window.

AGENTS.md final: 174 lines / ≤175 AC ✓; ~21 KB / ≤21 KB AC ✓."
- 2026-05-10T11:27:08Z @neo-opus-ada cross-referenced by PR #11098
- 2026-05-10T12:05:46Z @tobiu referenced in commit `0137bbb` - "docs(agents): elevate friction→gold + verify-before-assert as core values (#11092) (#11098)

* docs(agents): elevate friction→gold + verify-before-assert as core values (#11092)

Implements #11092 ACs (graduated from Discussion #11091 Option Cycle 3
with within-core-values ordering + evolution-enablement framing per #10137):

- AGENTS.md §3.5 (NEW): Verify-Before-Assert Pre-Flight Check codified as
  Foundational Core Value between §3 and §4 per #10469 original intent.
  Compact trigger (5 lines) + atlas pointer; epistemic prerequisite for
  §13.2; restored from post-#10512 atlas-only state.
- AGENTS.md §13.2 (NEW): Friction → Gold Core Value subsection between
  §13 and §13.1. Compact (4 lines) + atlas pointer. Cross-refs §3.5 as
  prerequisite. Preserves all 4 #10743 §13 anchors (verified via grep).
- AGENTS.md §23: V-B-A cross-ref entry (1 line) pointing to §3.5 + atlas.
- AGENTS_ATLAS.md §2 expansion: tool inventory; #11089 self-Drop+Supersede
  fresh empirical anchor; evolution-enablement pair framing per #10137 MX
  (V-B-A filters real friction; friction→gold converts to substrate;
  mutually constitutive); 6-month/5-qualifying-event sunset clause
  symmetric to §13.2.

Net: AGENTS.md +7 lines / 19,954 bytes (was 18,055; +1.9 KB; ≤21 KB AC ✓);
AGENTS_ATLAS.md +5 lines/-1 line. Map-vs-Atlas discipline applied from
start (per #11097 cycle-1-premise-preflight.md atlas precedent): triggers
+ rules in main; depth + anchors in atlas. No forensic payload imported
to main (#10512 precedent honored).

Tier hierarchy operationalized per @tobiu's session refinements:
- "core values > values > rules" (#11091 cycle 2)
- V-B-A > friction → gold within core values (operational ordering;
  #11091 cycle 2)
- Evolution-enablement pair (#11091 cycle 3 / #10137 MX framing)

§0 invariant placement explicitly avoided per tier hierarchy: core values
govern rules, not co-equal with §0 (per @tobiu rules→VALUES correction).

* docs(agents): refine atlas tool inventory — ask_kb >> query_documents (#11092)

@tobiu surfaced inline tip on PR #11098: `ask_knowledge_base` is a strict
superset of `query_documents` (synthesized answer + top-5 refs vs refs-only).
Tool inventory listed both flat with no priority signal — could mislead
future agents into reaching for `query_documents` when `ask_knowledge_base`
is the right default.

Refines tool inventory from a flat comma-separated list into 5 categorized
groups with explicit ordering signals:
- Knowledge Base — preferred ordering (ask_kb >> query_documents)
- Memory queries (summaries vs raw)
- GitHub state
- Filesystem
- External claims (WebSearch)

Cites `feedback_ask_kb_dominates_query_documents` memory anchor as
empirical source. Adds ~7 lines to atlas (loaded conditionally via §23
trigger; doesn't bloat main AGENTS.md).

* docs(agents): add tier hierarchy + ask_kb tool-ordering refinement (#11092)

Two operator tips on PR #11098 incorporated together:

1. **ask_kb >> query_documents tool ordering** (atlas tool inventory):
   `ask_knowledge_base` returns synthesized answer + top-5 refs in one call
   (strict superset of `query_documents`, which returns only refs). Reserve
   `query_documents` for narrow exhaustive-enumeration cases. Restructured
   atlas tool inventory from flat list into 5 categorized groups with
   explicit ordering signal. Cites `feedback_ask_kb_dominates_query_documents`
   memory anchor as empirical source.

2. **Tier hierarchy + MX-loop application** (AGENTS.md §13.2 + atlas §2):
   Codifies the tier framing operator surfaced across #11091 cycles 1-3:
   core values > values > rules. Three tiers explicit in atlas with
   examples per tier + evolution rates + within-core-values operational
   ordering (V-B-A > friction → gold turn-by-turn) + meta-scale ordering
   (friction → gold > V-B-A at evolution-time) + per-tier substrate-decision
   shape ("rule-shape vs value-shape vs core-value-shape" question for new
   substrate authoring). Empirical anchor: #11091 cycle 1 wrong-tier
   placement attempt; cycle 2-3 corrections.

Compact in main AGENTS.md (4 lines added to §13.2); deep in atlas (9 lines
added to §2). Map vs Atlas discipline applied. AGENTS.md still ≤175 line
target. Net 12 insertions / 1 deletion across 2 files.

Per @tobiu inline tips on PR #11098 review thread:
- "ask_knowledge_base >> query_documents. try both, then you will know."
- "should it include our discussion related to: core values > values >
   rules. the entire part and how it relates to our mx loop is missing."

* docs(agents): add top-of-file Core Values block per @tobiu (#11092)

@tobiu inline tip: core values should be a clear, short block at the top
of AGENTS.md so the framing is immediately visible at file-load.

Adds 7-line "Core Values" preamble between file description and
Compaction Taxonomy:
- Numbered list naming both core values + section-pointers (§3.5, §13.2)
- Hierarchy line: core values > values > rules
- 1-line MX-loop summary (operates across all 3 tiers + evolution rates)

Compact summary/anchor pattern; detail stays in §3.5 + §13.2 + atlas §2.
Map-vs-Atlas discipline preserved — top block is the most-condensed map
form (names + pointers + 1-line framing). AGENTS.md now 173 lines (under
the ≤175 AC ceiling); ≤21 KB AC also still satisfied.

Per @tobiu inline tip on PR #11098 review thread:
> "our core values should be a clear, short, block, quite at the top
>  of agents md. like
>  our core values
>  1. VBA
>  2. friction -> gold
>  core values > values > rules"

* docs(agents): codify equal peer + maintainer agency as 3rd core value (#11092)

@tobiu inline tip: "is 'you are an equal peer and a neo repository
maintainer' our third core value? i would say yes."

Genuine substrate test confirms — equal-peer-with-maintainer-agency is
foundational for substrate-evolution. Without it: agents-as-workers don't
surface friction substantively (they execute tasks); MX loop atrophies
into operator-only-driven evolution; nightshift mode impossible.

Maps cleanly to Neo's 3 evolving pillars (#15.5 Identity Anchor):
- Brain pillar (Agent OS) → V-B-A (epistemic substrate)
- Evolution pillar (MX/RLAIF) → friction → gold (mechanism substrate)
- Institution / Swarm pillar → equal peer + maintainer (agency substrate)
- Body pillar = substrate being evolved (not core-value-shape)

3 core values for 3 evolving pillars. Body is what gets evolved.

Changes:
- AGENTS.md top Core Values block expanded 2→3 items (compact
  preserving ≤175 line AC; pillar-mapping moved to atlas detail)
- AGENTS.md §15.6 title changed: "Swarm Topology Anchor — Flat
  Peer-Team Model (Core Value: Equal Peer + Maintainer Agency)" +
  CRITICAL prefix-line cross-refs §Core-Values
- AGENTS_ATLAS.md §2 evolution-enablement reframed pair → triad with
  full V-B-A + friction → gold + peer-maintainer agency framing

Canonical empirical anchor for the value (recursion-caught parallel to
#11089 V-B-A anchor): cycle 4 deferral pattern itself. When proposed
3rd core value, agent's response framed decision as "your call"
deferring to operator instead of taking peer-maintainer agency. Operator
caught: "see, if you say 'your call', you add weight on why we need it.
perfect example." Substrate-philosophy work enacting its own need in
real-time.

Plus operational empirical anchor: 2026-05-10 nightshift cycle (~17
heartbeats / 5 PRs / 3-peer parallel work / 0 mutual-idle deadlocks)
worked only because agents had peer-maintainer agency. Worker-mode would
have idled out within first heartbeat-window.

AGENTS.md final: 174 lines / ≤175 AC ✓; ~21 KB / ≤21 KB AC ✓.

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"

