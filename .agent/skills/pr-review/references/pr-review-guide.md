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
- **For Self-Review (same session):** Use first-person, introspective tone. The review is a structured reflection, not praise. Replace "you did X" with "I chose X because...". Focus on documenting *rationale*, *trade-offs*, and *gaps you are aware of* rather than scoring your own work favorably. Be harsher on self-scoring — actively hunt for blind spots. Self-review is a **fallback mode** for intent capture; it does NOT substitute for the cross-family requirement. See `pull-request §6.1` for the authoritative cross-family mandate.

## 2. Agent Operational Mandates: The Reflection Phase
If you are an AI Agent tasked with writing a PR review directly on GitHub (acting against your own PR or others), you MUST follow this protocol. This serves as the critical "Stepping Back" strategy where you transition from "Driver/Implementer" to "Navigator/Reviewer".

1. **Context Initialization:** You MUST retrieve the state of the PR using `get_pull_request_diff` and `get_conversation` (via the `neo-mjs-github-workflow` MCP server) before formulating your review.
2. **Self-Review Detection:** After retrieving the PR conversation, extract the associated ticket number from the PR body (e.g., `Resolves #N`). Then query `query_raw_memories(query: '#N')` scoped to the **current Memory Core session ID**. If a match is found, the agent authored this PR in the current session — switch to **self-review mode** (first-person, clinical, no congratulatory openers). If no match, use standard **peer-review mode** (third-person, constructive).
3. **Semantic Blast-Radius Sweep (Tech Debt Radar):** If the PR introduces fundamental framework architectural shifts or is labeled as `refactor(ai)`, you MUST execute the Tech Debt Radar (by triggering `view_file` on `.agent/skills/tech-debt-radar/SKILL.md`) to mandate a semantic sweep against historical issues and Memory Core sessions. This guarantees the newly proposed architecture does not collide with or ignore sweeping ambient debt across the repository before the PR is merged.
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

### 3.1 Decile Anchors for Evaluative Metrics

To minimize cross-family scoring drift, all evaluative metrics MUST adhere to these explicit decile anchors. The human-recognizable word per tier acts as a shared calibration vocabulary, avoiding affect-loaded cross-cultural drift (e.g., "Awesome" vs "Meh"). Engineering-specific words ensure consistent scale anchoring.

| Score | Word | `[EXECUTION_QUALITY]` Anchor | `[ARCH_ALIGNMENT]` Anchor | `[CONTENT_COMPLETENESS]` Anchor | `[PRODUCTIVITY]` Anchor | `[IMPACT]` Anchor |
|---|---|---|---|---|---|---|
| 100 | Exemplary | No observed defects. Tests green. Edge cases covered/deferred. | Flawless paradigm alignment. | Perfect Anchor & Echo. Fat Ticket. | Achieves all goals efficiently. | Foundational framework architecture. |
| 90 | Excellent | Tests green. One polish nit. | Minor architectural nit. | One missing JSDoc nit. | Achieves all goals; minor polish missing. | N/A |
| 80 | Strong | Tests green. 1-2 nits. | 1-2 minor anti-patterns. | 1-2 missing @summary tags. | Achieves main goals; 1-2 nits missed. | Major feature or subsystem. |
| 70 | Solid | Tests green. Mechanical defect. | Suboptimal API usage. | Missing doc on a helper method. | Misses a minor AC. | N/A |
| 60 | Acceptable | Tests green. Functional gap deferred. | Ignores some framework idioms. | Relies on implied context. | Requires follow-up for a major AC. | Substantive refactor or workflow. |
| 50 | Mixed | Claimed green; not re-verified. 1 functional defect. | Mix of correct/incorrect usage. | Some methods bare. | Partially functional. | N/A |
| 40 | Weak | Tests fail/unrun. 1 functional defect. | Misunderstanding of core concepts. | Major methods lack JSDoc. | Misses primary goal. | Routine bug fix or standard feature. |
| 30 | Poor | Multiple defects; tests fail materially. | Active violation of architecture. | Barely any documentation. | Little progress on requirements. | N/A |
| 20 | Inadequate | Functional regression observed. | Introduces major architectural debt. | Zero documentation added. | Re-derives/ignores instructions. | Minor localized tweak. |
| 10 | Broken | Tests fail catastrophically; regression. | Completely incompatible. | Active semantic degradation. | Negative productivity. | Trivial changes (typos, formatting). |

### 3.2 Score Justification (MANDATORY)

Every metric score MUST include a specific, non-tautological reason. **Restated praise is NOT a justification.**

Metric categories govern what "justification" means:

- **Evaluative metrics** (100 = ideal): `[ARCH_ALIGNMENT]`, `[CONTENT_COMPLETENESS]`, `[EXECUTION_QUALITY]`, `[PRODUCTIVITY]`, `[IMPACT]`. Sub-100 scores MUST explain the deduction (*"X points deducted because…"*). A score of 100 on an evaluative metric requires an explicit one-line enumeration: *"I actively considered [X], [Y], [Z] and confirmed none apply."*
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
*   **Zero-Issue PR Semantics:** If a PR has no required actions, replace the checkbox list with a single explicit sentence: *"No required actions — eligible for human merge."* (Note: this means eligibility, not an authorization for the reviewing agent to execute it). Do NOT pre-tick placeholder items (e.g., `- [x] All checks pass and no required changes identified.`) — that reads as box-checking rather than genuine review. Null state is its own form; don't dress it as action.

### 5.1 Suggesting Empirical Isolation Tests
When challenging a specific architectural pattern or complex implementation detail as suspect (e.g., an unnecessary retry loop, an overly complex state sync), you should explicitly suggest the author perform an **Empirical Isolation Test**. Instead of engaging in a theoretical debate, ask the author to temporarily disable or strip the challenged pattern and run a binary isolation test to prove or disprove its necessity. This shifts the review from architectural argument to empirical verification.

### 5.2 Close-Target Audit

When reviewing a PR, audit every issue named as a close-target via GitHub's magic keywords (`Closes #N`, `Resolves #N`, `Fixes #N` — case-insensitive, in the PR body or commit messages) against the target issue's labels.

**The Rule:** Epics are not valid close-targets for PRs. An epic represents a body of work delivered across multiple sub-issues; closing an epic is a *project-management* event that fires when the last sub closes (or when the epic is explicitly retired with rationale). PRs deliver subs, not epics. GitHub's auto-close-on-merge semantics fire indiscriminately on any magic-keyword reference, so the discipline-layer enforcement is the reviewer's job.

**Reviewer-side check:**

1. Parse the PR body + commit messages for `Closes #N` / `Resolves #N` / `Fixes #N` patterns (case-insensitive).
2. For each `#N`, fetch the issue's labels (via `gh issue view N --json labels` or the `mcp__neo-mjs-github-workflow__get_local_issue_by_id` tool).
3. If the issue carries the `epic` label → flag as **Required Action**:

   > *"PR names epic #N as close-target via `Closes`/`Resolves`/`Fixes` keyword. Epics close when their last sub-issue closes, not on PR-merge. Required: change close-target to a specific sub-issue this PR resolves, or remove the magic-close keyword and reference the epic via `Related: #N` instead."*

**Author response options** when this Required Action fires:
- Change `Closes #N` → `Closes #M` where `#M` is the specific sub-issue the PR resolves.
- Remove the close-target entirely if the PR is an incremental contribution toward the epic without fully closing any single issue.
- Move the epic reference to `Related: #N` (no magic-close behavior).

**Empirical anchor:** Epic #9999 ("Cloud-Native Knowledge & Multi-Tenant Memory Core") was auto-closed at 2026-04-23T23:54:09Z with `stateReason: COMPLETED` despite 7 of 10 sub-issues still being open. Most likely mechanism: a merged PR named `Closes #9999` triggering GitHub's auto-close-on-merge. The damage was compounded by `prevent-reopen.yml` (since disabled) re-closing the manual reopen 6 seconds later, plus a sabotage-spawn duplicate ticket (#10323, since closed). The discipline-layer audit codified here would have caught the close-target at review time, before merge — preventing the entire downstream chain.

**Out of scope for this audit:**
- Leaf tickets without `epic` label — close-target is valid.
- Sub-issues with their own children (rare but legitimate) — same risk class as leaf; not flagged.
- `Related: #N` / `Refs #N` / `Part of #N` references — these don't trigger GitHub's magic-close, so they're not subject to this audit.

### 5.3 MCP-Tool-Description Budget Audit

When a PR touches `ai/mcp/server/*/openapi.yaml`, audit each modified or added tool description for budget compliance. Tool descriptions are loaded into every consuming agent's context window when the tool surface is enumerated; bloat compounds across the tool surface and competes with reasoning budget at runtime.

**The Rule:** OpenAPI tool-parameter and operation descriptions are runtime payload, not source-code documentation. Their audience is the agent enumerating the tool surface — not the developer reading the source. Treat them as terse, usage-focused contracts; relegate architectural narrative to JSDoc on the corresponding service method or to the PR / ticket body.

**Three audiences, three verbosity budgets:**

| Surface | Audience | Verbosity budget | Acceptable content |
|---|---|---|---|
| **OpenAPI YAML** (`openapi.yaml`) | MCP-consuming agents at runtime (every tool-surface enumeration) | **Terse, single-line, usage-focused** | What it is + when to use + when NOT to use |
| **JSDoc** (source code) | Developers reading source | Verbose; framing OK | Architectural rationale, design history, cross-refs |
| **PR body / ticket body** | Reviewers + Retrospective daemon | Full Fat Ticket | Narrative, deltas, test evidence, post-merge validation |

Conflating budgets — bloating YAML with what should have stayed in JSDoc — has empirical cost. It also conflates audience: an agent calling `add_message` doesn't need to know about Phase 1/Phase 2 sequencing; it needs to know whether to populate the param.

**Trigger conditions** (fire if any apply):

1. PR adds a new `description:` to an OpenAPI tool param or operation.
2. PR modifies an existing `description:` block-literal (`|` form).
3. PR introduces a new OpenAPI tool path or operation.

**Audit checks:**

1. **Single-line preferred** — multi-line block-literal (`|`) descriptions warrant scrutiny. Block-literal is acceptable for genuinely complex contracts (e.g., transport-substrate observability blocks) but must be justified by content, not authorial habit.
2. **No internal cross-refs** — descriptions should not cite ticket numbers, internal Phase sequencing, session IDs, or memory anchors (those belong in JSDoc + PR / ticket bodies).
3. **No architectural narrative** — descriptions should describe call-site usage (what + when-to-use + when-not-to-use), not implementation history.
4. **External standard URLs OK** — citing `https://a2a-protocol.org/...` or other canonical specs is acceptable when the param adopts an external standard; agents can navigate canonical docs.
5. **Mind the 1024-char hard cap** — MCP protocol enforces a per-tool-description limit; approaching it is a red flag (see `McpServerToolLimits` test for the empirical bound).

**Required Action template when violated:**

> *"OpenAPI description on param `X` of tool `Y` exceeds budget — multi-line block-literal + internal ticket references. Tighten to single-line usage-focused description; move architectural narrative to JSDoc on the corresponding service method or to the PR body."*

**Author response options** when this Required Action fires:
- Tighten the description to single-line usage-focused form; relocate the architectural narrative to JSDoc or the PR body.
- Defend the block-literal with a content-justification (e.g., transport-substrate observability that genuinely requires multi-clause framing) — reviewer can accept with rationale logged.
- Push back on a specific check if the audit misfires (e.g., a multi-line description that legitimately enumerates an external spec's nuances).

**Distinction from JSDoc audit:** JSDoc on service-method source is a separate audience (developers reading code). Verbosity is acceptable there. The §5.3 audit fires only on the OpenAPI YAML surface that becomes runtime tool-description payload.

**Empirical anchor:** PR #10340's initial `task` parameter description on `mailbox/messages` was a ~600-char block-literal with internal Phase 1/Phase 2 framing and ticket cross-refs (#10334/#10313/#10338). Cycle 1 review challenge ("these directly map to mcp server tools — they must be short and meaningful") tightened it to a ~155-char single-line description in one follow-up commit. The post-fix form (`"Optional A2A Task envelope (https://...) for structured agent coordination. Omit for free-form markdown messages."`) preserves usage signal without architectural narrative — a 4× reduction with no information loss for the consuming agent. The §5.3 audit codifies that reviewer-side discipline so the tightening fires pre-Approval, not post-Approval.

**Out of scope for this audit:**
- Auto-tooling for description-bloat detection (mechanical-layer enforcement after discipline-layer proves insufficient).
- Migration sweep of legacy verbose descriptions in existing OpenAPI files (forward-only via this discipline + opportunistic refactoring during ongoing PR work).
- JSDoc verbosity (different audience, different budget).
- PR body verbosity (reviewers + Retrospective daemon legitimately consume Fat Ticket framing).
- OpenAPI/JS contract drift (e.g., `enum` values diverging from runtime validators, `required` arrays diverging from JS-side implementation) — adjacent discipline gap; warrants separate codification if recurrent. The §5.3 audit is budget-focused; correctness drift is a different audit shape.

## 6. The Review Template
When drafting your review, use the `view_file` tool to load the exact markdown template from:
`.agent/skills/pr-review/assets/pr-review-template.md`

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

**Note on Resolution Paths:** If your challenge raises a "this pattern is suspect" claim or architectural dispute, refer to **§5.1 Suggesting Empirical Isolation Tests** as the preferred path for resolving the concern empirically rather than via theoretical debate.

Self-reviews (§1) already have an analogous requirement ("actively hunt for blind spots"); §7.1 extends the discipline to peer-reviews.

*(Extension for Discussion reviews: When reviewing Ideation Sandbox proposals, this Depth Floor applies equally. You must challenge an assumption or document your search. See `.agent/skills/ideation-sandbox/references/ideation-sandbox-workflow.md §4`)*

### 7.2 Cross-Model Asymmetry Context

Different model families exhibit statistically-different failure modes when reviewing PRs:

- **Claude-family** reviewers tend toward over-rigor — may flag concerns that aren't load-bearing, inflate `[COMPLEXITY]` scores, or request JSDoc polish the PR doesn't need.
- **Gemini-family** reviewers tend toward quick-win framing — may score all metrics at 100 without challenge, pre-tick placeholder required-actions, or skip adversarial examination of the change.

The Depth Floor catches the Gemini-family failure mode. `[CONTENT_COMPLETENESS]` scoring catches part of the Claude-family failure mode. Neither is a style mandate — be the reviewer you are; trust cross-model asymmetry to compensate. The floor is not a ceiling. Do not calibrate toward the other model's style; the skill-level floor is what keeps rigor universal, not style convergence.

*This asymmetry is the empirical basis for the cross-family review mandate in `pull-request §6.1` and is mitigated by the decile anchor rubric in §3.1 which acts as a concrete calibration intervention.*

### 7.3 Provenance Audit

When a PR introduces a major new architectural abstraction or core subsystem, it is vulnerable to ingesting external framework bias or improperly attributed concepts. The reviewer MUST execute a **Provenance Audit**:

1. **The Threshold:** Standard feature PRs or bug fixes are exempt. This audit triggers only for structural shifts, novel algorithms, or core subsystems.
2. **The Audit Task:** The reviewer's task is **not** to play detective or run exhaustive web searches for stolen code. The task is to audit the author's declarations.
3. **Chain of Custody:** The conceptual origin trace of an architectural abstraction. The PR description (Fat Ticket) MUST explicitly declare this provenance:
   - *Internal Origin:* E.g., "Derived from internal Neo.mjs R&D / Session ID XYZ."
   - *External Origin:* E.g., "Friction abstracted from [Ecosystem] via industry-friction-radar."
4. **The External Nuance:** External human or agent contributors will likely not use internal ideation tools. For external PRs, the reviewer enforces the *principle* of the radar. If the author cannot defend the conceptual origin of the architecture natively (e.g., relying on "Because React does it this way"), the PR fails the audit.

If a qualifying PR lacks a provenance declaration, or if it merely ports external framework code rather than solving the abstracted friction natively, the reviewer MUST flag it as a Required Action.

### 7.4 Rhetorical-Drift Audit

A review can hit every structural metric, document its search, pass §7.1-§7.3 — and still let through prose that drifts away from mechanical reality. **Rhetorical Drift** is the divergence of stated framing from substrate truth: PR descriptions, Anchor & Echo summaries, docstrings, or `[RETROSPECTIVE]` tags that conceptually overshoot what the code actually does (e.g., framing a JSON-schema constraint as an "air-gapped substrate boundary", or claiming a radar ingests "SOTA" when it explicitly filters out industry standards).

Unaudited rhetorical drift poisons the `ask_knowledge_base` ingestion pipeline. Future agents query the synthesized answer and inherit the metaphor, building on a flawed premise rather than a factual constraint. The semantic knowledge base diverges from mechanical reality one PR at a time.

#### Audit task

Reviewers MUST verify symmetry between **stated framing** and **mechanical implementation**:

1. **PR description** — does the architectural narrative accurately describe the boundaries and capabilities of the code? Or does the prose claim more than the diff substantiates?
2. **Anchor & Echo summaries** (`AGENTS.md §15.2`) — does new JSDoc reuse precise codebase terminology, or does it lean on metaphor that overshoots the implementation?
3. **`[RETROSPECTIVE]` tags** (§4) — does the takeaway accurately characterize what shipped, or does it inflate the architectural significance of a routine change?
4. **Linked-anchor accuracy** — when prose claims "implements pattern X from #N" or "similar to PR #M", does the cited reference actually establish that pattern, or is it being cited for borrowed authority?

#### What this audit is NOT

- **Not style-policing of metaphor itself.** Metaphors that accurately bridge a complex concept to a familiar one are fine; metaphors that overstate or misframe are not.
- **Not a redundant Provenance Audit (§7.3).** Provenance audits the *origin* of an abstraction; this audit checks whether the *description* matches the *implementation*. A PR can have legitimate provenance and still drift rhetorically.
- **Not a replacement for Score Justification (§3.2).** Score justifications target reviewer prose; this audit targets author prose.

#### Required Action template

> *"Rhetorical drift detected: the [PR description / anchor summary / `[RETROSPECTIVE]` tag / linked-anchor citation] claims [specific framing], but the code [specific mechanical reality]. Tighten the framing to match the implementation, or scope the implementation to match the framing."*

**Author response options:**

- **Tighten the prose** — rewrite the framing to match the substrate.
- **Expand the implementation** — if the framing reflects intended substrate that the diff doesn't yet deliver, scope-expand or file a follow-up ticket.
- **Defend the metaphor** — argue why the framing accurately bridges to the mechanical reality (reviewer judges).

#### Empirical anchors

- **PR #10298** (`industry-friction-radar`, 2026-04-24): initial framing claimed the radar ingests "SOTA" patterns when the implementation explicitly filters out industry standards (rationale: industry-standard adoption defeats Neo's friction-as-signal heuristic). Caught at review; tightened to "abstracted friction patterns" — no information loss, mechanical accuracy restored.
- **PR #10371** review (2026-04-26): initial Cycle 1 framing of Step 6 (A2A self-ping) and Step 7 (Sandman memory) as "redundant push-pull substrates" drifted from the mechanical reality that the substrates serve distinct lifecycle gaps (push-inbox vs pull-memory-graph). Caught via author calibration; reviewer posted Cycle 2.5 follow-up withdrawing the redundancy challenge with substrate-grounded reasoning.

Two empirical anchors confirm the pattern: rhetorical drift fires both at author-side (PR description framing) and reviewer-side (challenge framing). The §7.4 mandate applies to both surfaces.

### 7.5 Anti-Patterns

| Anti-pattern | Why it fails the Depth Floor |
|---|---|
| Unexplained score (evaluative deduction or descriptive characterization missing) | Cosmetic; §3.1 violated |
| Pre-ticked "All checks pass" placeholder in Required Actions | Null-state dressed as action; §5 Zero-Issue PR Semantics violated |
| Fully affirming review with no challenges or documented search | §7.1 Minimum-One-Challenge violated |
| Approval without cross-skill integration check on PRs introducing new workflow conventions | §8 Cross-Skill Integration Audit violated |
| Style-calibrating toward the other model family's tone | §7.2 — the floor keeps rigor universal, not style convergence |
| Ignoring Chain of Custody | §7.3 Provenance Audit violated on a major abstraction |
| Approval without rhetorical-drift audit on a PR carrying substantive architectural prose | §7.4 Rhetorical-Drift Audit violated; framing drifts from mechanical reality, poisons `ask_knowledge_base` ingestion |
| PR names an epic as close-target without flagging | §5.2 Close-Target Audit violated; risks epic auto-close-with-open-subs (see #9999 sabotage chain) |
| PR adds bloated multi-line OpenAPI tool description without flagging | §5.3 MCP-Tool-Description Budget Audit violated; bloat compounds across the tool surface and competes with agent reasoning budget at runtime |

## 8. Cross-Skill Integration Audit

For PRs that introduce new workflow primitives, skill files, architectural conventions, or MCP tool surfaces, the reviewer MUST verify whether other skills / docs / tools need updating to reference the new pattern.

### 8.1 When This Section Applies

- PR adds or materially changes a skill file (`.agent/skills/**/SKILL.md` or `**/references/*.md`)
- PR introduces a new workflow convention (new commit-message format, new comment template, new ticket-body section)
- PR adds a new MCP tool surface
- PR modifies `AGENTS_STARTUP.md` or `AGENTS.md` (startup conventions change)
- PR introduces a new architectural primitive other subsystems will consume
- PR refactors a substrate or changes a wire format (e.g., event payloads, tool signatures, database schemas)

### 8.2 Verification Checklist

- [ ] Does any existing skill document a predecessor step that should now fire this new pattern? (E.g., if PR adds `epic-review`, does `ticket-intake` need to check for epic-review state as a prerequisite?)
- [ ] Does `AGENTS_STARTUP.md` §9 Workflow skills list need updating to include the new pattern?
- [ ] Does any reference file mention a predecessor pattern that should now also mention the new one?
- [ ] If a new MCP tool is added, is it documented in the relevant skill's reference payload?
- [ ] If a new convention is introduced, is there documentation somewhere explaining when the convention applies and how it fires?
- [ ] If a wire format or substrate contract was changed, does the PR explicitly enumerate downstream consumers and verify they were updated to handle the new format?

If any check surfaces a miss, flag it in Required Actions. A PR that ships a new convention without the cross-skill references creates a **latent integration gap** — the convention exists but won't fire because no other skill knows to invoke it.

### 8.3 Empirical Example

PR #10155 shipped `.agent/skills/epic-review/` with the claim "runs *before* `ticket-intake`." Real integration required `ticket-intake` to check whether the parent epic had been reviewed before proceeding with sub pickup. The PR did NOT update `ticket-intake`. The reviewer did NOT flag the missing integration. Result: `epic-review` ships as a skill but the "runs before ticket-intake" claim is aspirational until `ticket-intake` is updated — a latent gap §8 would have caught.

### 8.4 Empirical Example 2: Wire Format Change

PR #10397 changed the wake substrate wire format from raw events to a coalesced `wake/digest` envelope (Shape A). The PR cleanly migrated the upstream engine, but the reviewer missed the cross-skill integration audit for downstream consumers. Result: the Antigravity IDE wake handler silently failed because it expected raw events, not a digest payload. A §8 integration audit would have explicitly enumerated downstream consumers of the wire format (e.g., IDE client) and flagged the missing handler patch.

## 9. A2A Comment-ID Hand-off Protocol (#10272)

**Problem:** Without commentId-scoped fetch, every review cycle N+1 incurs **cumulative-thread context cost** — full-thread fetch reads all prior cycles, not just the delta. This breaks linear-cost scaling: by cycle three of an Architectural Pillar review, fetching the full conversation burns more tokens on prior rounds than on the new substance. Compounds silently across the swarm — every reviewer pays the cumulative cost per cycle, not just once. **Treat as invariant discipline, not optional optimization** — the cost asymmetry diverges with thread length, and missed pings cascade across reviewers.

**Empirical anchor (PR #10371, 2026-04-26):** Cycle 3 thread reached ~8KB markdown across 6 prior comments. Full-thread fetch by Cycle 4 reviewer reads all 8KB to extract the ~1KB delta from one new comment — **~8× context-budget waste per cycle, ratio diverging with thread length**. CommentId-scoped fetch reads ~1KB. Reviewer-side §9 + author-side `pull-request-workflow §8.1` discipline together close the loop.

**Solution:** `manage_issue_comment` action:`create` returns `{message, commentId, url, createdAt}`. The reviewer captures `commentId` from that response and relays it to the next reviewer (peer or author) via A2A mailbox — the recipient fetches just-this-comment via `get_conversation({pr_number: N, comment_id: COMMENT_ID})`, scaling linearly with new-comment volume rather than cumulative thread size.

### 9.1 Workflow

1. Reviewer posts their review comment via `manage_issue_comment({action: 'create', pr_number, body, agent})`.
2. Reviewer captures `commentId` from the response.
3. Reviewer sends an A2A mailbox DM to the next actor (peer reviewer or author) via `add_message`:
   ```
   subject: 're: PR #N review cycle K'
   body: 'Review posted at PR #N comment <COMMENT_ID>. Substance: <one-line summary>.'
   relatedTickets: ['#N']
   ```
4. Recipient reads the A2A message, extracts `COMMENT_ID`, calls `get_conversation({pr_number: N, comment_id: COMMENT_ID})` — receives only this reviewer's comment, not the whole thread history.

### 9.2 Selector Precedence

`get_conversation` accepts three optional selectors. First match wins:

- `comment_id` — single-comment fetch. Used by the A2A hand-off pattern above.
- `since_comment_id` — fetch comments strictly AFTER the given anchor. Used for incremental polling: track last-seen commentId, fetch only what's new.
- `last_n` — fetch the last N comments. Coarse-grained catch-up when commentIds aren't tracked.
- Omitting all three returns the full conversation (backward-compatible default).

### 9.3 Anti-Patterns

- **Full-conversation-fetch-per-cycle when commentId is available.** If the A2A message carries a commentId, use it. Otherwise the propagation discipline is broken.
- **Mailbox DM without commentId when the message is pointing at a specific comment.** Forces recipient to fetch full thread and grep for the intended passage — negates the efficiency gain.
- **Passing all three selectors at once expecting a merge.** First-match semantics; excess selectors are ignored.
- **Rigidly applying commentId-scoped fetch in a cold-cache case** (e.g., fresh session bootstrap, Cycle 1 review). Lands one isolated comment in a void without the prior context it depends on. See §9.5 below.
- **Skipping the Pre-Flight Check (§9.4) before yielding turn after `manage_issue_comment`.** Empirically the dominant failure mode — agents read this guide, draft the comment, post it, and forget to capture commentId + send A2A ping. Proven mitigation: explicit reasoning-statement mirroring the `AGENTS.md §3 / §4.2` Pre-Flight pattern.

### 9.4 Pre-Flight Check (operational reflex)

The §9 hand-off protocol is mechanical — but reviewers empirically miss it across cycles even after reading this guide (PR #10371 + #10375, 2026-04-26: 5+ missed pings before @tobiu surfaced the gap explicitly). The discipline is reflex-application, not knowledge.

**Pre-Flight Check shape** (mirrors `AGENTS.md §3 / §4.2` proven primitives). After every `manage_issue_comment` create, before yielding turn, you MUST explicitly state in your internal reasoning:

> *"Pre-Flight: I posted review commentId `<ID>` for cycle K. I have (or will) send an A2A ping to `<recipient>` via `add_message` with the literal commentId in the body so they can call `get_conversation({pr_number, comment_id})` for scoped fetch."*

This commitment-statement is the gate that permits yielding turn. The §0.5 `add_memory` discipline already proves this Pre-Flight pattern works as a reflex enforcement primitive when paired with explicit pre-action reasoning. Skipping forces the next cycle's actor to re-read the full thread — the empirical-anchor ~8× cost ratio quantifies the cost.

Cold-cache exception applies when the recipient lacks prior-cycle context — see §9.5 below for when full-thread fetch is the right call instead.

### 9.5 Cold-Cache Exception

CommentId-scoped fetch is the **warm-cache** path — the reviewer or author has continuous prior-cycle context loaded in the current context window. **Cold-cache cases require a different fetch shape:**

| Cold-cache case | Fetch shape | Reason |
|---|---|---|
| **Fresh session bootstrap** | Full-thread fetch + `query_summaries` / `query_raw_memories` for Memory Core grounding | No prior cycle context loaded; commentId-scoped fetch lands one comment in a void |
| **Cycle 1 review** | Full-thread fetch | First ramp on the PR; no prior cycle exists; need full diff + body for grounding |
| **Cross-agent handoff** | Full-thread fetch + memory query against the prior agent's session-id | Different reviewer/author than prior cycle; no shared mental model |
| **Missed/lost A2A ping** | `since_comment_id` from last-known anchor, OR `last_n: 3-5`, OR full-thread fallback | No commentId pointer to scope from |

The dichotomy mirrors the boot-pull-vs-sunset-pull lifecycle distinction (`AGENTS_STARTUP §0` vs `session-sunset` skill body Step 1): **warm path** optimizes for incremental context; **cold path** grounds from scratch. They are NOT symmetric operations — they fill different lifecycle gaps. Don't confuse them: rigidly applying commentId-scoped fetch in a cold-cache case lands one isolated comment without the context it depends on; over-fetching on principle in a warm-cache case defeats the linear-cost scaling.

**The right reflex** — before fetching, ask: *"do I have prior cycle context loaded in this context window?"* If yes → commentId-scoped fetch (or `since_comment_id` for incremental polling across stale-anchor recovery). If no → full-thread fetch + memory query for grounding.

