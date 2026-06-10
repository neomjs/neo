# Ticket Create Workflow

The authoritative protocol for creating Neo.mjs GitHub issues. Enforced before any `create_issue` MCP tool invocation. This is the creation-side dual of `ticket-intake` (which consumes existing tickets).

Tickets are **A2A (Agent-to-Agent) memory bridges**, not just human tracking artifacts. A poorly-formed ticket loses architectural context the Swarm will re-derive every session. Every rule below exists because an earlier session re-derived the discipline and got it wrong.

## §0 — Understand the intent before you write the ticket

Before the duplicate sweep or the Fat-Ticket body: is this the right work — does it fit the current architecture and goals? Understand what it's *for* (from the affected files and their neighbors / imports — intent belongs in their JSDoc, `src/core/Base.mjs` is the bar — plus `memory-mining` / `ask_knowledge_base`) before you structure it. A perfectly-formed ticket for the wrong work is still the wrong work. If the intent it relies on is documented nowhere, that gap is itself worth a ticket.

## 1. Pre-Authoring Adjacency Sweeps (Gate 0)

**Before drafting any title or body**, you MUST execute two specific sweeps to ensure swarm synchronicity and architectural discipline:

### 1a. The Content Sweep (Duplicate Detection)
Verify no equivalent ticket already exists. Redundant tickets pollute the Knowledge Base.

Duplicates hide in **two substrates**, and you MUST sweep **both as the LAST step immediately before `create_issue`** — not at turn-start, not when you begin drafting. A sweep run before authoring goes stale while you write the Fat Ticket: in a thundering herd (multiple agents booting on the same prompt), a peer's ticket can land in the minutes between your sweep and your create call. The turn-start mailbox check (`§mailbox_check_protocol`) is for general coordination — it is **not** the dup gate.

> **Empirical anchor (`#12856`, 2026-06-10):** four agents raced an operator's "one (not all!)" prompt → three duplicate tickets, despite every agent running the GitHub sweep honestly. The one agent who used a two-phase *claim → re-check → execute* filed zero. Check-at-start freshness decays across a multi-minute protocol; check-at-last collapses the stale window to the create-call gap.

**(i) GitHub live freshness sweep (mandatory) — catches already-FILED duplicates:** read at least the latest 20 open GitHub issues from the live tracker, including issue number, title, author, labels, and URL.

```bash
gh issue list --state open --limit 20 --json number,title,author,labels,url
```

An equivalent GitHub Workflow MCP or GitHub API call is acceptable when it returns the same fields. This live sweep is required even when KB and local searches return no duplicates: the most likely active-swarm duplicate can exist on GitHub before Knowledge Base or `resources/content/**` sync has ingested it.

If the live latest-open sweep fails because of sandbox, network, or auth state, retry through the appropriate approved/escalated path. If live GitHub state still cannot be fetched, stop before `create_issue` and report the blocker; do not file from stale-only evidence.

Record the live-open sweep result in the ticket body or creation notes, e.g. `Live latest-open sweep: checked latest 20 open issues at <timestamp>; no equivalent found` or link the existing ticket you found instead of filing a duplicate.

**(ii) A2A in-flight claim sweep (mandatory) — catches IN-FLIGHT duplicates not yet on GitHub:** for the first minutes of a thundering herd a peer's intent exists only as an A2A `[lane-claim]`/`[lane-intent]`, not yet a GitHub ticket — the `(i)` sweep above cannot see it. Immediately before `create_issue`, scan the mailbox for recent claims on the same scope:

```js
list_messages({ status: 'unread' })  // scan recent [lane-claim] / [lane-intent] on the same subject / write-surface
```

**Tiebreak — first-claim-timestamp-wins:** if a competing claim or a just-filed ticket surfaces, the **earliest claim/file timestamp wins**; the later claimant stands down (or closes its duplicate, porting any unique substance as a comment onto the survivor). Deterministic and self-healing — resolves simultaneous filings without lead mediation. Never `wakeSuppress` a contested-lane resolution: the "do-not-re-file" signal must wake, or it reaches no one in time.

```
grep on resources/content/issues/       # active + archived tickets
grep on resources/content/discussions/   # ideation / brainstorming
```

Semantic sweep: `ask_knowledge_base(query='...', type='ticket')` — semantic search surfaces conceptual duplicates that title scanning misses.
Exact/historical sweep: `grep` / `query_documents` over issues, archived issues, and discussions for exact keyword verification.

If an equivalent ticket exists: do NOT file a duplicate. Either comment on the existing ticket, extend its scope, or reject the new request.

### 1b. The Meta-Skill Sweep (Progressive Disclosure)
If the proposed ticket involves modifying any agent skill (i.e., any file within `.agents/skills/`), you MUST explicitly consult `.agents/skills/create-skill/SKILL.md` before finalizing the ticket body.
**Pre-flight check:** *Have I verified this proposal adheres to the Progressive Disclosure routing pattern and does not bloat the top-level SKILL.md router?*

### 1c. The Ungraduated-Discussion Cross-Check (High-Blast-Radius Mandatory)

**Trigger:** if the proposed ticket is high-blast-radius (Epic, new skill / rule / workflow change, substrate-level architecture change) AND cites a Discussion (`#NNNN`) that has **not yet been formally graduated** (no `GRADUATED` marker in body, Discussion still open or graduation incomplete), the default action is **BLOCK ticket creation**.

**Why the gate exists:** creating the ticket gives premature convergence a backlog center-of-gravity. Preventing creation at-source pairs with `ideation-sandbox-workflow.md` §5.1, which gates the Discussion side.

**Substantive-rationale exception (3-part):** the block can be passed if the ticket body contains **all three** of the following:

1. **Explicit substantive-rationale declaration** with cite-able context. The author identifies who made the call — peer, operator, or self — for attribution metadata, but rationale-content is the reviewable gate, not identity.
2. **Inline divergence-matrix substance** preempting the cited Discussion's expected gap. The matrix should include at least the recommended option + 2 alternative shapes with falsifying sources.
3. **Acknowledgment that downstream amendments may be required** once the cited Discussion graduates — the ticket explicitly states which sections may need refresh post-Discussion-graduation, so future agents do not treat the early-filing as final.

For source anchors (`#11078` / `#11082` / `#11083` / `#11084`), Discussion `#11091` authority context, and substrate-decay review, read [`../../ideation-sandbox/audits/double-diamond-divergence-guard.md`](../../ideation-sandbox/audits/double-diamond-divergence-guard.md).

### 1d. Project Attachment Pre-Flight (during release cycle)

Before draft, confirm the target project number is current (cite the project number in your Pre-Flight reasoning statement, e.g., *"Will attach to Project 12 per §4."*). Prevents stale-project-number drift across release cycles. Pairs mechanically with the §4 mandate below.

## 2. Six-Stage Challenge Chain

Apply at creation time — not just at intake. Every stage must pass before the ticket is drafted.

1. **Premise** — is the stated problem real and reproducible? Has the underlying symptom been independently verified, or is it secondhand?
2. **Prescription** — is the stated fix the right substrate for the problem, or does it treat a symptom? Could a different layer (config, service, daemon, schema) solve it better?
   **Verify-Before-Assert Integration:** Before making architectural claims or prescribing solutions in your Fat Ticket body (Stage 2 Prescription), you MUST apply the **Verify-Before-Assert Pre-Flight Check** (`AGENTS.md` §verify_before_assert). You cannot assert that a bug exists or a pattern is flawed without empirical confirmation (a falsifying tool call) prior to filing the ticket.
3. **Substrate** — where does this work belong? Service layer? Build script? CI workflow? Framework core? Documentation? Match the fix to the substrate that owns the concern.
   **Structural Pre-Flight Integration:** when the prescription introduces or relocates a `.mjs` file, the directory choice MUST be validated via `.agents/skills/structural-pre-flight/` before drafting the ticket body. Stage 0 mechanical trigger fires; Stage 1 fast-path handles sibling-pattern matches in 30 seconds; novel directory choices route through full Pre-Flight (ArchitectureOverview.md + ADR consultation). The empirical anchors PR `#11008` (`orchestrator-daemon.mjs` misplaced in `ai/scripts/`) and earlier `ai/daemons/wake/daemon.mjs` (originally misplaced in `ai/scripts/` as `bridge-daemon.mjs`) demonstrate the cost of skipping this check at ticket-creation time.
4. **Consumer** — who reads the output of this change? Human developer, agent, Memory Core, Native Edge Graph, Knowledge Base? Different consumers need different shapes (markdown prose vs structured metadata vs MCP payload).
5. **Service-Boundary** — does the fix cross a service boundary it shouldn't? Config added to the wrong owning service creates future migration debt.
6. **Decision Record impact** — for architecture/substrate tickets, declare whether the work is `none`, `aligned-with`, `depends-on`, `amends`, `supersedes`, or `challenges` an ADR. If it challenges or supersedes an accepted ADR, apply the ADR successor-risk audit in [`../../ticket-intake/references/adr-successor-risk-audit.md`](../../ticket-intake/references/adr-successor-risk-audit.md) before filing.

A ticket that fails any stage should be reshaped OR rejected, not filed.

## 3. Title Hygiene

**Titles describe the subject, not the category.** Category lives in labels.

- ❌ `[enhancement] Add config for X`
- ❌ `[bug] Y fails when Z`
- ❌ `[epic] Modernize W`
- ✅ `Add config for X`
- ✅ `Y fails when Z`
- ✅ `Modernize W`

The `[enhancement]` / `[bug]` / `[epic]` prefix duplicates the label taxonomy — it also eats title budget. Use the budget for subject specificity instead.

Keep titles under ~70 characters. PR titles derive from ticket titles; length discipline compounds.

## 4. Label Rules

- **`ai` — MANDATORY on every ticket created by an agent.** Signals provenance for downstream graph/memory systems.
- **Primary — exactly one:** `epic`, `enhancement`, or `bug`.
- **Secondary — as applicable:** `architecture`, `performance`, `regression`, `refactoring`, `documentation`, `testing`, plus domain labels (`core`, `grid`, `build`, etc.).
- Before filing: call `list_labels` to confirm the labels exist. Do not invent label names.
- **Project attachment is MANDATORY on every ticket during the v13 release cycle.** Visibility primitive: every new ticket goes onto Project 12 ([Neo v13 Release board](https://github.com/orgs/neomjs/projects/12)) so the swarm + operator have a single overview. ProjectV2 memberships supersede the deprecated `release:v*` label family per [ProjectV2 migration ticket](https://github.com/neomjs/neo/issues/11233).
  - **`create_issue` MCP tool path:** pass `projects: [{projectNumber: 12}]` atomically with the create.
  - **`gh issue create` CLI bypass path:** ALWAYS follow with `gh project item-add 12 --owner neomjs --url <new-issue-url>` immediately. Treat the two-step as inseparable.
  - **Project anchor** is currently `12` (v13). When v14 release work begins, update the project number in this section AND any hard-coded `create_issue` examples or call-sites that name the release project (the MCP tool's `projects` parameter is caller-supplied with `[]` default — not a configurable tool-side default to update). Sunset condition: once v13 release ships, this rule needs disposition review (`keep` with updated project number, OR `compress-to-trigger` if mid-release ambiguity arises).

## 5. Fat Ticket Body Structure

Skeleton tickets are forbidden. Every ticket body MUST contain:

- **Context** — why this ticket exists now. What prompted it. What observational evidence supports the premise.
- **The Problem** — deep background, insights from recent Memory Core explorations, reproducer if applicable. Historical "why" for the agent picking up the ticket later.
- **The Architectural Reality** — exactly which Neo.mjs patterns, class topologies, or service boundaries this issue interacts with. Cite file:line when known. Distinguishes intent-level framing (Problem) from structural specificity (Reality).
- **The Fix** — concrete prescription: files, symbols, architectural primitives touched. What changes, and where.
- **Contract Ledger Matrix** *(when applicable)* — For any ticket introducing, modifying, or deprecating a surface consumed by humans, agents, or external systems (e.g. public methods, configs, MCP tools), you MUST include a formal Contract Ledger matrix. This matrix defines Target Surface, Source of Authority, Proposed Behavior, Fallback, Docs, and Evidence. Rows that name existing fields, methods, helpers, tools, config keys, docs paths, or runtime surfaces must satisfy the row-level Surface-Anchor V-B-A discipline in `learn/agentos/process/contract-ledger.md` before the ticket asserts them.
- **Decision Record impact** *(architecture/substrate tickets)* — Declare `none`, `aligned-with ADR ####`, `depends-on ADR ####`, `amends ADR ####`, `supersedes ADR ####`, or `challenges ADR ####`. Use the ADR successor-risk audit when the ticket conflicts with or depends on accepted ADR authority.
- **Discussion Criteria Mapping** *(when graduating from a Discussion)* — A section mapping the upstream Discussion's `[RESOLVED_TO_AC]` criteria to this Epic's ACs. See `ideation-sandbox-workflow.md §6.6` for the required format. This satisfies the `epic-resolution` Closeout Gates upfront.
- **Acceptance Criteria** — bulleted checklist. Each item independently verifiable. Post-merge-only items explicitly flagged. **Epic exception:** for `epic`-labeled tickets, ACs live in the **SUB** tickets (not the epic body) — author the epic per `epic-create` (epic body = problem-scope + intended-solution; subs linked via `update_issue_relationship`, each a one-PR-deliverable leaf). See `.agents/skills/epic-create/`.
- **Out of Scope** — what this ticket deliberately does NOT do. Prevents scope creep during implementation.
- **Avoided Traps** / **Gold Standards Rejected** *(when applicable)* — alternatives considered and rejected, with rationale. Especially critical when rejecting a generic industry/LLM "best practice" (e.g. standard React patterns, generic node workflows) that is a trap in Neo.mjs's multi-threaded architecture.
- **Related** — sibling tickets, superseded tickets, dependencies, PRs.
- **Origin Session ID** — Memory Core session ID that produced the ticket. **Optional, but highly recommended** for genuinely single-session tickets. Serves as a direct pointer for the A2A Contextual Bridge Protocol (`AGENTS.md §14`). Format: `Origin Session ID: <uuid>` on its own line near the end of the body.
- **Handoff Retrieval Hints** — Semantic query patterns (`query_raw_memories`, `query_summaries`) or exact Git commit-range anchors to assist subsequent agents in resuming the workstream across fragmented session IDs post-restart. **REQUIRED for architecturally substantive tickets or multi-session workflows.** Example: `Retrieval Hint: "cross-harness MCP singleton cache divergence"` or `Retrieval Hint: Commit SHA 1234abcd..5678efgh`.

### 5.1 Reference Hygiene: Backtick-Escape for Descriptive `#N`

When drafting ticket bodies, read [`learn/agentos/process/reference-hygiene.md`](../../../../learn/agentos/process/reference-hygiene.md): structural issue references stay bare; descriptive prose references use backticks.

## 6. Linkage

- **Epic ↔ sub-issue:** use the `update_issue_relationship` MCP tool to natively link sub-issues to their parent. Do NOT rely on inline Markdown checkboxes (`- [ ] #N`) as the tracking mechanism. Native links feed the Native Edge Graph; Markdown does not.
- **Blocking / blocked-by:** same tool. Sets `blockedBy` / `blocking` fields on the ticket frontmatter after sync.
- **Origin Session ID:** embeds the current session as textual provenance. Complements native linkage by preserving the reasoning trail across swarm instances.

## 7. Pre-Execution Gates

*These gates apply to the commit step (see `AGENTS.md §3`), not ticket creation. However, you must ensure the ticket body is rich enough that a future commit can satisfy Gate 2 (Contextual Completeness) without requiring a separate documentation pass.*

## 8. Anti-Patterns (Non-Exhaustive)

| Anti-pattern | Why it harms |
|---|---|
| `[enhancement]` / `[bug]` / `[epic]` prefix in title | Duplicates label taxonomy; wastes title budget |
| Skeleton body (1-2 sentences) | Breaks A2A — next agent has no context to act on |
| Missing Origin Session ID | Breaks A2A Contextual Bridge; no provenance trail |
| Skipping duplicate sweep | Pollutes Knowledge Base; splits swarm attention |
| Inventing label names | Breaks label taxonomy; causes silent GitHub API rejections |
| Precedent-following without skill check | Propagates anti-patterns from prior sessions (e.g., `[enhancement]` prefix spread this way) |
| Cross-scope bundling | `epic` label on a single-commit ticket; hurts granularity |
| Using `gh issue create` without follow-up `gh project item-add` (during release cycle) | Bypasses §4 v13 release-board attachment; ticket invisible in swarm/operator overview; two-step CLI path MUST be treated as inseparable per §4 |

## 9. When to Escalate to Discussion Instead

If the "ticket" is really an architectural question, brainstorming, or pre-PR exploration, file a **Discussion**, not an Issue. The `ideation-sandbox` skill covers this path. Issues are for actionable work with a defined success criterion; Discussions are for shaping the question.

## 10. After Creation (Chained MCP Tool Usage)

The `create_issue` tool returns the new issue number. Typical immediate follow-ups:

- **`manage_issue_assignees(action: 'add', issue_number: N, assignees: ['@me'])`** — **MANDATORY** if you intend to start working immediately (AGENTS.md §0 Invariant 7). Do this *before* editing any tracked files. (Note: once `#11308` is resolved, atomic assignee injection at creation will replace this post-hoc call).
- **`manage_issue_labels(action: 'add', ...)`** — only if the label set needs adjustment post-creation (e.g., label list was incomplete at `create_issue` time). Prefer getting labels right in the initial call.
- **`manage_issue_projects(action: 'add', issue_number, projectNumbers: [12])`** — only if project membership needs adjustment post-creation. Prefer the `projects` parameter on `create_issue` for atomic attach. Use `action: 'update_field'` to set Status/Priority on the project board after creation.
- **`update_issue_relationship(parent_id: N, child_id: M, type: 'SUB_ISSUE')`** — required when filing sub-issues under an Epic. Native graph linkage only; do NOT rely on inline `- [ ] #N` markdown checkboxes (see §6).
- **Ticket body edits:** Edit the local `.md` file and use the `sync_all` tool to push the local version back to GitHub. The local `.md` file is canonical after `sync_all`.
- **Picking up the ticket:** If you intend to start working on this newly created ticket immediately, you MUST run the `ticket-intake` skill next (your assignee claim fulfills the primary gate).

Minimize chained calls where possible — a well-formed `create_issue` call with complete `title`, `body`, `labels`, and `projects` at creation time avoids all of the above except `update_issue_relationship` (which can only run after the issue exists).

## 11. Authorship Respect

**You update your own authored artifacts in place. You never override another author's.**

When editing tickets:
- **Ticket body:** Update your own in place. If it's someone else's ticket, respond via a NEW comment.
- **Ticket AC list:** Extend your own list. If it's someone else's ticket, do NOT mutate their AC list; propose additions via comment.

*Why:* Rewriting someone else's prose causes attribution collapse and breaks Native Edge Graph ingestion.

## 12. Substrate Awareness ("Assume No Private Memory")

When writing tickets, **assume the reader has access to nothing private**.

**Fair-game citations:**
- Committed repo paths (`learn/...`, `.agents/skills/...`)
- GitHub resources (`#N`, PR URLs, commit SHAs)
- Neo Memory Core session IDs (`Origin Session ID: <uuid>`)

**FORBIDDEN load-bearing citations:**
- Harness-private filenames (e.g., `feedback_*.md` from Claude Code, or private Antigravity stores)
- Local filesystem paths outside the repo
- Machine-specific identifiers
