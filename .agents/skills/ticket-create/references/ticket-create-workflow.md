# Ticket Create Workflow

The authoritative protocol for creating Neo.mjs GitHub issues. Enforced before any `create_issue` MCP tool invocation. This is the creation-side dual of `ticket-intake` (which consumes existing tickets).

Tickets are **A2A (Agent-to-Agent) memory bridges**, not just human tracking artifacts. A poorly-formed ticket loses architectural context the Swarm will re-derive every session. Every rule below exists because an earlier session re-derived the discipline and got it wrong.

## 1. Pre-Authoring Adjacency Sweeps (Gate 0)

**Before drafting any title or body**, you MUST execute two specific sweeps to ensure swarm synchronicity and architectural discipline:

### 1a. The Content Sweep (Duplicate Detection)
Verify no equivalent ticket already exists. Redundant tickets pollute the Knowledge Base.

```
grep on resources/content/issues/       # open tickets
grep on resources/content/issue-archive/ # closed + archived
grep on resources/content/discussions/   # ideation / brainstorming
```

Primary: `ask_knowledge_base(query='...', type='ticket')` — semantic search surfaces conceptual duplicates that grep misses.
Fallback: `grep` / `query_documents` for exact keyword verification.

If an equivalent ticket exists: do NOT file a duplicate. Either comment on the existing ticket, extend its scope, or reject the new request.

### 1b. The Meta-Skill Sweep (Progressive Disclosure)
If the proposed ticket involves modifying any agent skill (i.e., any file within `.agents/skills/`), you MUST explicitly consult `.agents/skills/create-skill/SKILL.md` before finalizing the ticket body.
**Pre-flight check:** *Have I verified this proposal adheres to the Progressive Disclosure routing pattern and does not bloat the top-level SKILL.md router?*

### 1c. The Ungraduated-Discussion Cross-Check (High-Blast-Radius Mandatory)

**Trigger:** if the proposed ticket is high-blast-radius (Epic, new skill / rule / workflow change, substrate-level architecture change) AND cites a Discussion (`#NNNN`) that has **not yet been formally graduated** (no `GRADUATED` marker in body, Discussion still open or graduation incomplete), the default action is **BLOCK ticket creation**.

**Why the gate exists:** allowing the ticket to be created and relying only on `epic-review` Stage 2 backstop or `ticket-intake` validation lets the ticket exist in the backlog as a **center of gravity** that pulls velocity-biased agents toward execution. Preventing creation at-source is the most robust defense against premature convergence, paired with `ideation-sandbox-workflow.md` §5.1 Double Diamond Divergence Guard (which gates the Discussion side).

**Substantive-rationale exception (3-part):** the block can be passed if the ticket body contains **all three** of the following — note that rationale-content, not author-identity, is what passes the gate:

1. **Explicit substantive-rationale declaration** with cite-able context (e.g., session-mode urgency, time-critical empirical evidence, lane-coordination need that legitimately blocks waiting for graduation, operator-directed sequence with documented reasoning). The author identifies who made the substantive call — peer, operator, or self — for attribution-metadata, but the **rationale-content is what is audit-able by any reviewer**, not the identity. (Per `AGENTS.md §15.6` Flat Peer-Team: operator-identity grants merge-gate authority, not substrate-discipline authority — substantive rationale is the load-bearing gate.)
2. **Inline divergence-matrix substance** preempting the cited Discussion's expected gap. The matrix should include at least the recommended option + 2 alternative shapes with falsifying sources, mirroring what the Discussion would have produced once graduated. Bare 1-line rationales are paperwork, not preemption.
3. **Acknowledgment that downstream amendments may be required** once the cited Discussion graduates — the ticket explicitly states which sections may need refresh post-Discussion-graduation, so future agents do not treat the early-filing as final.

**Empirical anchors:** #11084 (filed 2026-05-10 under @tobiu's "e.g. a new ticket" directive, before #11079 graduated; included inline divergence matrix in Avoided Traps preempting Option E's gap; explicitly acknowledged downstream-amendment) is the **right shape** of the exception path. #11082 / PR #11083 (Gemini's premature implementation before #11079 graduated, no inline rationale, no preempting matrix) is the **wrong shape** — caught + retracted within ~10 minutes.

**Sunset clause (per AGENTS.md §13):** review this cross-check's effectiveness after **6 months OR 5 qualifying high-blast-radius graduations**, whichever comes first. Symmetric to `ideation-sandbox-workflow.md` §5.1 sunset; both gates should retire / rewrite / compress together if neither catches premature-convergence patterns over the review window.

## 2. Five-Stage Challenge Chain

Apply at creation time — not just at intake. Every stage must pass before the ticket is drafted.

1. **Premise** — is the stated problem real and reproducible? Has the underlying symptom been independently verified, or is it secondhand?
2. **Prescription** — is the stated fix the right substrate for the problem, or does it treat a symptom? Could a different layer (config, service, daemon, schema) solve it better?
   **Verify-Before-Assert Integration:** Before making architectural claims or prescribing solutions in your Fat Ticket body (Stage 2 Prescription), you MUST apply the **Verify-Before-Assert Pre-Flight Check** (`AGENTS.md` §2.3). You cannot assert that a bug exists or a pattern is flawed without empirical confirmation (a falsifying tool call) prior to filing the ticket.
3. **Substrate** — where does this work belong? Service layer? Build script? CI workflow? Framework core? Documentation? Match the fix to the substrate that owns the concern.
   **Structural Pre-Flight Integration:** when the prescription introduces or relocates a `.mjs` file, the directory choice MUST be validated via `.agents/skills/structural-pre-flight/` before drafting the ticket body. Stage 0 mechanical trigger fires; Stage 1 fast-path handles sibling-pattern matches in 30 seconds; novel directory choices route through full Pre-Flight (ArchitectureOverview.md + ADR consultation). The empirical anchors PR #11008 (`orchestrator-daemon.mjs` misplaced in `ai/scripts/`) and earlier `bridge-daemon.mjs` demonstrate the cost of skipping this check at ticket-creation time.
4. **Consumer** — who reads the output of this change? Human developer, agent, Memory Core, Native Edge Graph, Knowledge Base? Different consumers need different shapes (markdown prose vs structured metadata vs MCP payload).
5. **Service-Boundary** — does the fix cross a service boundary it shouldn't? Config added to the wrong owning service creates future migration debt.

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

## 5. Fat Ticket Body Structure

Skeleton tickets are forbidden. Every ticket body MUST contain:

- **Context** — why this ticket exists now. What prompted it. What observational evidence supports the premise.
- **The Problem** — deep background, insights from recent Memory Core explorations, reproducer if applicable. Historical "why" for the agent picking up the ticket later.
- **The Architectural Reality** — exactly which Neo.mjs patterns, class topologies, or service boundaries this issue interacts with. Cite file:line when known. Distinguishes intent-level framing (Problem) from structural specificity (Reality).
- **The Fix** — concrete prescription: files, symbols, architectural primitives touched. What changes, and where.
- **Contract Ledger Matrix** *(when applicable)* — For any ticket introducing, modifying, or deprecating a surface consumed by humans, agents, or external systems (e.g. public methods, configs, MCP tools), you MUST include a formal Contract Ledger matrix. This matrix defines Target Surface, Source of Authority, Proposed Behavior, Fallback, Docs, and Evidence. See `learn/agentos/contract-ledger.md` for schema.
- **Acceptance Criteria** — bulleted checklist. Each item independently verifiable. Post-merge-only items explicitly flagged.
- **Out of Scope** — what this ticket deliberately does NOT do. Prevents scope creep during implementation.
- **Avoided Traps** / **Gold Standards Rejected** *(when applicable)* — alternatives considered and rejected, with rationale. Especially critical when rejecting a generic industry/LLM "best practice" (e.g. standard React patterns, generic node workflows) that is a trap in Neo.mjs's multi-threaded architecture.
- **Related** — sibling tickets, superseded tickets, dependencies, PRs.
- **Origin Session ID** — Memory Core session ID that produced the ticket. **Optional, but highly recommended** for genuinely single-session tickets. Serves as a direct pointer for the A2A Contextual Bridge Protocol (`AGENTS.md §14`). Format: `Origin Session ID: <uuid>` on its own line near the end of the body.
- **Handoff Retrieval Hints** — Semantic query patterns (`query_raw_memories`, `query_summaries`) or exact Git commit-range anchors to assist subsequent agents in resuming the workstream across fragmented session IDs post-restart. **REQUIRED for architecturally substantive tickets or multi-session workflows.** Example: `Retrieval Hint: "cross-harness MCP singleton cache divergence"` or `Retrieval Hint: Commit SHA 1234abcd..5678efgh`.

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

## 9. When to Escalate to Discussion Instead

If the "ticket" is really an architectural question, brainstorming, or pre-PR exploration, file a **Discussion**, not an Issue. The `ideation-sandbox` skill covers this path. Issues are for actionable work with a defined success criterion; Discussions are for shaping the question.

## 10. After Creation (Chained MCP Tool Usage)

The `create_issue` tool returns the new issue number. Typical immediate follow-ups:

- **`manage_issue_labels(action: 'add', ...)`** — only if the label set needs adjustment post-creation (e.g., label list was incomplete at `create_issue` time). Prefer getting labels right in the initial call.
- **`update_issue_relationship(parent_id: N, child_id: M, type: 'SUB_ISSUE')`** — required when filing sub-issues under an Epic. Native graph linkage only; do NOT rely on inline `- [ ] #N` markdown checkboxes (see §6).
- **Ticket body edits:** Edit the local `.md` file and use the `sync_all` tool to push the local version back to GitHub. The local `.md` file is canonical after `sync_all`.
- **Picking up the ticket:** If you intend to start working on this newly created ticket immediately, you MUST run the `ticket-intake` skill next. Assignment (`manage_issue_assignees`) belongs to the intake process, not the creation process.

Minimize chained calls where possible — a well-formed `create_issue` call with complete `title`, `body`, and `labels` at creation time avoids all of the above except `update_issue_relationship` (which can only run after the issue exists).

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
