---
id: 9748
title: 'Update ROADMAP.md to reflect v12.2 target (#9999 + #10030 + multi-body grid)'
state: CLOSED
labels:
  - documentation
  - ai
  - 'agent-role:pm'
assignees:
  - tobiu
createdAt: '2026-04-06T21:03:28Z'
updatedAt: '2026-04-20T11:49:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9748'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-20T11:49:34Z'
---
# Update ROADMAP.md to reflect v12.2 target (#9999 + #10030 + multi-body grid)

The current versions of `ROADMAP.md` and `VISION.md` reflect outdated generic goals or theoretical long-term phases instead of actionable release priorities. As we are wrapping up the baseline for autonomous development (self-healing/self-evolving systems), the roadmap must jump straight to the technical epics in scope for the upcoming releases.

**Objectives:**
1. Align `ROADMAP.md` strictly to the next releases and in-scope autonomous development epics.
2. Formulate proper professional release planning instead of vague or commercial marketing terminology.
3. Establish clear technical milestones for the Agent Swarm's capabilities.

*Note: Document updates deferred to a clean session to avoid context window overload.*

## Timeline

- 2026-04-06T21:03:29Z @tobiu added the `documentation` label
- 2026-04-06T21:03:29Z @tobiu added the `epic` label
- 2026-04-06T21:03:29Z @tobiu added the `ai` label
- 2026-04-06T21:03:29Z @tobiu added the `agent-role:pm` label
- 2026-04-20T11:13:26Z @tobiu changed title from **Update ROADMAP.md and VISION.md for Immediate Autonomous Development Epics** to **Update ROADMAP.md to reflect v12.2 target (#9999 + #10030 + multi-body grid)**
- 2026-04-20T11:13:52Z @tobiu removed the `epic` label
- 2026-04-20T11:13:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-20T11:13:55Z

**Input from Claude Opus 4.7 (Claude Code):**

> ❋ ## Scope alignment for this session's pickup
> 
> Claiming this ticket with narrowed scope: **ROADMAP.md only** (VISION.md deferred — richer rewrite pending a separate session per @tobiu, since VISION is significantly more complex).
> 
> ### v12.2 target
> 
> The ROADMAP update will reframe current focus around three concrete release goals:
> 
> 1. **#9999 — Cloud-Native Knowledge & Multi-Tenant Memory Core.** Currently 2/5 sub-epics closed (#10013 DreamService Decomposition, #10057 KB PR source). Active: sub-epic #10015 (Dynamic Topology) — #10001 landed 2026-04-20 via PR #10121 introducing the `chromaUnified` flag; #10007 (lifecycle bypass), #10000 (hardened identity ingestion), #10010 (team-vs-private read flag) queued next. Sub-epic #10016 (multi-tenant identity) also in scope but likely cross-session.
> 2. **#10030 — Concept Ontology & Semantic Gap Inference.** Currently 9/14 sub-issues closed. Open: #10037 (Chroma concept embedding + hybrid search), #10034 (concept graph viz app), #10050 (description enrichment — blocked on architect time), plus enhancement sub-tickets (#10080, #10081, #10106).
> 3. **Multi-body grid epic completion.** Existing work stream; specific epic ID to be surfaced during the ROADMAP draft.
> 
> ### Enabler worth surfacing in the ROADMAP
> 
> Embedding transition: KB currently ships with `gemini-embedding-001` in the release zip; local runs support `qwen3-8b` via `NEO_GLOBAL_EMBEDDING` configuration. Shifting the release-zip default to qwen3-8b (4k vs 3k vector dims) aligns with the local-inference-first direction already established and tracks naturally with the multi-tenant cloud deployment story. Worth calling out as a v12.2 enabler even if not scoped as a release-blocker.
> 
> ### What success looks like
> 
> ROADMAP.md reads as a **concrete release planner** rather than high-abstraction horizon phases. A future agent or human picking it up should be able to answer *"what's v12.2 shipping?"* in one scan. Phases 3/4/5 from the current doc can stay as horizon framing, but the top of the doc should lead with v12.2 goals and their sub-issue trees so A2A handoffs land context-complete.
> 
> ### Pipeline context
> 
> Sits between PR #10121 (merged 2026-04-20, landed #10001) and the next unified-topology PR for #10007. Updating the roadmap mid-sub-epic gives future sessions an anchor — without it, agents picking up #10007 would have to reconstruct the v12.2 framing from scattered ticket bodies.
> 
> ### Ticket adjustments in this claim
> 
> - Title narrowed: dropped "and VISION.md for Immediate Autonomous Development Epics"; specific v12.2 target surfaced
> - Label `epic` removed: single-PR documentation update, not an umbrella for sub-issues
> - Labels kept: `documentation`, `ai`, `agent-role:pm`
> - Assigned to @me (tobiu) for this session's execution
> 
> Origin Session ID: 1c001810-be28-4554-bb56-c98f9b91bbfb

- 2026-04-20T11:18:26Z @tobiu referenced in commit `b506292` - "docs: update ROADMAP.md for v12.2 release focus (#9748)"
- 2026-04-20T11:19:03Z @tobiu cross-referenced by PR #10122
- 2026-04-20T11:22:53Z @tobiu referenced in commit `72bcb8a` - "docs: correct Phase 2 Neo.ai.Agent status to shipped (#9748)"
- 2026-04-20T11:28:21Z @tobiu referenced in commit `c8d160d` - "docs: refresh Foundation section to reflect shipped Agent OS (#9748)"
- 2026-04-20T11:32:35Z @tobiu referenced in commit `d61c94f` - "docs: split Foundation into v12.1 baseline vs post-v12.1 shipped (#9748)"
- 2026-04-20T11:36:06Z @tobiu referenced in commit `55643a6` - "docs: correct Cognitive Loop + SDK + Agent class as pre-v12.1 baseline (#9748)"
- 2026-04-20T11:42:02Z @tobiu referenced in commit `fe83ad6` - "feat(ai): add analyzeClosedSinceRelease script for roadmap authoring (#9748)"
- 2026-04-20T11:42:02Z @tobiu referenced in commit `b142f40` - "docs: ground velocity signal in 332 tickets closed since v12.1 (#9748)"
- 2026-04-20T11:47:09Z @tobiu referenced in commit `90f886b` - "docs: relocate release-analysis script + expand post-v12.1 highlights (#9748)"
- 2026-04-20T11:47:31Z @tobiu referenced in commit `257a464` - "docs: expand post-v12.1 highlights + update script path (#9748)"
- 2026-04-20T11:49:35Z @tobiu closed this issue
- 2026-04-20T11:49:35Z @tobiu referenced in commit `aa3a4fe` - "docs: update ROADMAP.md for v12.2 release focus (#9748) (#10122)

* docs: update ROADMAP.md for v12.2 release focus (#9748)

* docs: correct Phase 2 Neo.ai.Agent status to shipped (#9748)

* docs: refresh Foundation section to reflect shipped Agent OS (#9748)

* docs: split Foundation into v12.1 baseline vs post-v12.1 shipped (#9748)

* docs: correct Cognitive Loop + SDK + Agent class as pre-v12.1 baseline (#9748)

* feat(ai): add analyzeClosedSinceRelease script for roadmap authoring (#9748)

* docs: ground velocity signal in 332 tickets closed since v12.1 (#9748)

* docs: relocate release-analysis script + expand post-v12.1 highlights (#9748)

* docs: expand post-v12.1 highlights + update script path (#9748)"
- 2026-04-20T15:26:36Z @tobiu cross-referenced by PR #10130

