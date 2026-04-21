# Pull Request Review Guide

This document outlines the authoritative protocol for structuring Pull Request Reviews within the Neo.mjs project. 
Whether you are a human reviewer or an autonomous Agent evaluating code, you must adhere to this structure.

This protocol ensures that feedback is:
1. **Constructive and Engaging:** Encouraging to first-time contributors while remaining technically precise.
2. **Actionable:** Clearly delineating block-level requirements before a merge can occur.
3. **Graph-Extractable:** Structured with specific Markdown tags so the background Retrospective Agent (Gemma 4:31B) can mathematically ingest the feedback into the Native Edge Graph.

## 1. Core Philosophy
- **For Internal Agents (Peer-Review):** Be objective, clinical, and strict. Enforce the "Fat Ticket" protocol and strict JSDoc completeness.
- **For External/First-Time Contributors:** Start with positive reinforcement. Acknowledge their effort. Provide explicit, helpful examples when asking for changes.
- **For Self-Review (same session):** Use first-person, introspective tone. The review is a structured reflection, not praise. Replace "you did X" with "I chose X because...". Focus on documenting *rationale*, *trade-offs*, and *gaps you are aware of* rather than scoring your own work favorably. Be harsher on self-scoring — actively hunt for blind spots.

## 2. Agent Operational Mandates: The Reflection Phase
If you are an AI Agent tasked with writing a PR review directly on GitHub (acting against your own PR or others), you MUST follow this protocol. This serves as the critical "Stepping Back" strategy where you transition from "Driver/Implementer" to "Navigator/Reviewer".

1. **Context Initialization:** You MUST retrieve the state of the PR using `get_pull_request_diff` and `get_conversation` (via the `neo-mjs-github-workflow` MCP server) before formulating your review.
2. **Self-Review Detection:** After retrieving the PR conversation, extract the associated ticket number from the PR body (e.g., `Resolves #N`). Then query `query_raw_memories(query: '#N')` scoped to the **current Memory Core session ID**. If a match is found, the agent authored this PR in the current session — switch to **self-review mode** (first-person, clinical, no congratulatory openers). If no match, use standard **peer-review mode** (third-person, constructive).
3. **Semantic Blast-Radius Sweep (Tech Debt Radar):** If the PR introduces fundamental framework architectural shifts or is labeled as `refactor(ai)`, you MUST execute the Tech Debt Radar (by triggering `view_file` on `/Users/Shared/github/neomjs/neo/.agent/skills/tech-debt-radar/SKILL.md`) to mandate a semantic sweep against historical issues and Memory Core sessions. This guarantees the newly proposed architecture does not collide with or ignore sweeping ambient debt across the repository before the PR is merged.
4. **Scope Creep vs. Iteration:** As you step back to critically review your own architectural choices, you MUST explicitly "think outside the box" and challenge your initial assumptions:
    - **Minor Gaps:** If you uncover minor misses (e.g., missed JSDoc, missing Anchor & Echo context), push rapid successive commits to the PR to polish the execution.
    - **Major Refactors:** If you realize a mathematically superior architecture exists (e.g., massive GC optimization) that is *out-of-scope* for the current ticket, DO NOT attempt to cram it into the active PR. Secure the "good enough" PR, and instead propose a **Follow-Up System Enhancement Ticket** conceptually linked to the original PR to avoid scope creep.
5. **Execution:** Once formulated, use the `manage_issue_comment` MCP tool (action: `create`) to post the review directly onto the PR thread, or formulate it in markdown locally if MCP is disconnected.

## 3. Structural Evaluation Metrics
Every PR review MUST score the work across the following categories on a scale of `0` to `100`:

*   **`[ARCH_ALIGNMENT]`** (0-100): Does it follow Neo.mjs paradigms (e.g., worker delegation, push-based reactivity, config-driven components)?
*   **`[CONTENT_COMPLETENESS]`** (0-100): Are all new or modified methods documented with 'Anchor & Echo' JSDoc? Is the PR description a comprehensive "Fat Ticket"?
*   **`[EXECUTION_QUALITY]`** (0-100): Code flow, absence of bugs, race condition safety, VDOM syncing correctness, and testing coverage.
*   **`[PRODUCTIVITY]`** (0-100): Were the primary goals of the linked ticket achieved?
*   **`[IMPACT]`** (0-100): What is the significance of the change? (100 = critical framework architecture, 10 = trivial typo fix).
*   **`[COMPLEXITY]`** (0-100): Factor in file touchpoints, depth of changes (core vs. app-level), and cognitive load.
*   **`[EFFORT_PROFILE]`**: Categorize the effort relative to the Impact/Complexity ratio to establish explicit Native Graph labels. Valid values are: `Quick Win` (High ROI/Low Complexity), `Heavy Lift` (High Complexity/High Impact), `Maintenance` (Routine tasks), or `Architectural Pillar` (Fundamental shifts).

### 3.1 Score Justification (MANDATORY)

Every metric score MUST include a specific, non-tautological reason. **Restated praise is NOT a justification.**

Metric categories govern what "justification" means:

- **Evaluative metrics** (100 = ideal): `[ARCH_ALIGNMENT]`, `[CONTENT_COMPLETENESS]`, `[EXECUTION_QUALITY]`, `[PRODUCTIVITY]`, `[IMPACT]`. Sub-100 scores MUST explain the deduction (*"X points deducted because…"*).
- **Descriptive metrics** (score is a factual observation; no inherent "ideal"): `[COMPLEXITY]`, `[EFFORT_PROFILE]`. Justification must explain WHY the score characterizes the work — not a deduction from ideal.

Examples:

- ❌ `[CONTENT_COMPLETENESS]`: 80 — *"Documentation is thorough."* (evaluative metric needs deduction reason for the 20-point gap)
- ✅ `[CONTENT_COMPLETENESS]`: 80 — *"20 points deducted because the template was not updated with dedicated sections for §7.1 and §8."*
- ❌ `[COMPLEXITY]`: 85 — *"Deftly handles the staging logic."* (descriptive metric needs factual characterization, not praise)
- ✅ `[COMPLEXITY]`: 85 — *"High: stage-gating across 5 ordered stages introduces novel reasoning an author unfamiliar with the pattern must internalize before sub pickup."*
- ✅ `[COMPLEXITY]`: 30 — *"Low: markdown additions within existing doc structure; no new code paths or cross-substrate integration."*

This discipline prevents cosmetic score adjustments while respecting the category distinction. A 100/100 on an evaluative metric is stronger when sub-100 scores carry explicit deduction reasoning; a clear factual characterization on a descriptive metric anchors the score in the work's actual structure.

## 4. Graph Ingestion Tags
To bridge the gap between human/agent code review and the internal Agent OS memory, you MUST use the following explicit markdown tags for any critical feedback. 
The Retrospective daemon explicitly regex-matches these tags during REM sleep:

*   **`[KB_GAP]`**: Use this to document missing concepts, misunderstandings of framework logic, or areas where the developer (or agent) clearly lacked documentation.
*   **`[TOOLING_GAP]`**: Use this to document failures in the development workflow, broken test commands, or MCP tools that failed during the generation of the PR.
*   **`[RETROSPECTIVE]`**: Use this for high-level takeaways or architectural praise.

**Author-side response tags (`pull-request` §6):** The `pull-request` skill §6 Review Response Protocol defines a symmetric set of author-side tags — `[ADDRESSED]`, `[DEFERRED]`, `[REJECTED_WITH_RATIONALE]` — used by PR authors when responding to Required Actions from a review. Reviewer-side and author-side tags form a unified taxonomy the Retrospective daemon ingests as a complete negotiation thread; both sides of the review cycle are mineable signal.

## 5. Required Actions & Cross-Linking
*   **Related Graph Nodes:** Every PR review MUST list related graph nodes (e.g., `Target Epic ID`, `Issue ID`) to ensure the Native Edge Graph links the evaluation to the overarching goal.
*   **Required Actions:** Clearly list a bulleted checklist of mandatory changes required before the PR can be accepted.
*   **Zero-Issue PR Semantics:** If a PR has no required actions, replace the checkbox list with a single explicit sentence: *"No required actions — ready to merge."* Do NOT pre-tick placeholder items (e.g., `- [x] All checks pass and no required changes identified.`) — that reads as box-checking rather than genuine review. Null state is its own form; don't dress it as action.

## 6. The Review Template
When drafting your review, use the `view_file` tool to load the exact markdown template from:
`/Users/Shared/github/neomjs/neo/.agent/skills/pr-review/assets/pr-review-template.md`

## 7. Depth Floor — Preventing Rubber-Stamp Approvals

Structural skill compliance does not guarantee rigor. A review can hit every `[EVALUATION_METRICS]` score, include all graph-ingestion tags, match the template structure — and still be empirically rubber-stamp-shaped. The Depth Floor mandates below close that gap.

### 7.1 Minimum-One-Challenge for Peer Reviews

Peer-reviews MUST name at least one of the following:
- A **weakness** in the approach, even if non-blocking
- An **unverified assumption** the author is relying on
- An **edge case** that may not be covered
- A **follow-up concern** (something orthogonal the PR surfaces but doesn't resolve)

If no such concern exists, the reviewer MUST explicitly document the search:

> *"I actively looked for [specific thing 1], [specific thing 2], and [specific thing 3] and found no concerns."*

The search documentation is not optional filler — it's the reviewer proving they looked. A peer-review with neither a challenge nor a documented search fails the Depth Floor, regardless of structural compliance elsewhere.

Self-reviews (§1) already have an analogous requirement ("actively hunt for blind spots"); §7.1 extends the discipline to peer-reviews.

### 7.2 Cross-Model Asymmetry Context

Different model families exhibit statistically-different failure modes when reviewing PRs:

- **Claude-family** reviewers tend toward over-rigor — may flag concerns that aren't load-bearing, inflate `[COMPLEXITY]` scores, or request JSDoc polish the PR doesn't need.
- **Gemini-family** reviewers tend toward quick-win framing — may score all metrics at 100 without challenge, pre-tick placeholder required-actions, or skip adversarial examination of the change.

The Depth Floor catches the Gemini-family failure mode. `[CONTENT_COMPLETENESS]` scoring catches part of the Claude-family failure mode. Neither is a style mandate — be the reviewer you are; trust cross-model asymmetry to compensate. The floor is not a ceiling. Do not calibrate toward the other model's style; the skill-level floor is what keeps rigor universal, not style convergence.

### 7.3 Anti-Patterns

| Anti-pattern | Why it fails the Depth Floor |
|---|---|
| Unexplained score (evaluative deduction or descriptive characterization missing) | Cosmetic; §3.1 violated |
| Pre-ticked "All checks pass" placeholder in Required Actions | Null-state dressed as action; §5 Zero-Issue PR Semantics violated |
| Fully affirming review with no challenges or documented search | §7.1 Minimum-One-Challenge violated |
| Approval without cross-skill integration check on PRs introducing new workflow conventions | §8 Cross-Skill Integration Audit violated |
| Style-calibrating toward the other model family's tone | §7.2 — the floor keeps rigor universal, not style convergence |

## 8. Cross-Skill Integration Audit

For PRs that introduce new workflow primitives, skill files, architectural conventions, or MCP tool surfaces, the reviewer MUST verify whether other skills / docs / tools need updating to reference the new pattern.

### 8.1 When This Section Applies

- PR adds or materially changes a skill file (`.agent/skills/**/SKILL.md` or `**/references/*.md`)
- PR introduces a new workflow convention (new commit-message format, new comment template, new ticket-body section)
- PR adds a new MCP tool surface
- PR modifies `AGENTS_STARTUP.md` or `AGENTS.md` (startup conventions change)
- PR introduces a new architectural primitive other subsystems will consume

### 8.2 Verification Checklist

- [ ] Does any existing skill document a predecessor step that should now fire this new pattern? (E.g., if PR adds `epic-review`, does `ticket-intake` need to check for epic-review state as a prerequisite?)
- [ ] Does `AGENTS_STARTUP.md` §9 Workflow skills list need updating to include the new pattern?
- [ ] Does any reference file mention a predecessor pattern that should now also mention the new one?
- [ ] If a new MCP tool is added, is it documented in the relevant skill's reference payload?
- [ ] If a new convention is introduced, is there documentation somewhere explaining when the convention applies and how it fires?

If any check surfaces a miss, flag it in Required Actions. A PR that ships a new convention without the cross-skill references creates a **latent integration gap** — the convention exists but won't fire because no other skill knows to invoke it.

### 8.3 Empirical Example

PR #10155 shipped `.agent/skills/epic-review/` with the claim "runs *before* `ticket-intake`." Real integration required `ticket-intake` to check whether the parent epic had been reviewed before proceeding with sub pickup. The PR did NOT update `ticket-intake`. The reviewer did NOT flag the missing integration. Result: `epic-review` ships as a skill but the "runs before ticket-intake" claim is aspirational until `ticket-intake` is updated — a latent gap §8 would have caught.

