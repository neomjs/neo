# Ticket Create Workflow

The authoritative protocol for creating Neo.mjs GitHub issues. Enforced before any `create_issue` MCP tool invocation. This is the creation-side dual of `ticket-intake` (which consumes existing tickets).

Tickets are **A2A (Agent-to-Agent) memory bridges**, not just human tracking artifacts. A poorly-formed ticket loses architectural context the Swarm will re-derive every session. Every rule below exists because an earlier session re-derived the discipline and got it wrong.

## 1. Pre-Creation Duplicate Sweep (Gate 0)

**Before drafting any title or body**, verify no equivalent ticket already exists. Redundant tickets pollute the Knowledge Base and disrupt swarm synchronicity.

```
grep on resources/content/issues/       # open tickets
grep on resources/content/issue-archive/ # closed + archived
grep on resources/content/discussions/   # ideation / brainstorming
```

Primary: `ask_knowledge_base(query='...', type='ticket')` — semantic search surfaces conceptual duplicates that grep misses.
Fallback: `grep` / `query_documents` for exact keyword verification.

If an equivalent ticket exists: do NOT file a duplicate. Either comment on the existing ticket, extend its scope, or reject the new request.

## 2. Five-Stage Challenge Chain

Apply at creation time — not just at intake. Every stage must pass before the ticket is drafted.

1. **Premise** — is the stated problem real and reproducible? Has the underlying symptom been independently verified, or is it secondhand?
2. **Prescription** — is the stated fix the right substrate for the problem, or does it treat a symptom? Could a different layer (config, service, daemon, schema) solve it better?
3. **Substrate** — where does this work belong? Service layer? Build script? CI workflow? Framework core? Documentation? Match the fix to the substrate that owns the concern.
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
- **Acceptance Criteria** — bulleted checklist. Each item independently verifiable. Post-merge-only items explicitly flagged.
- **Out of Scope** — what this ticket deliberately does NOT do. Prevents scope creep during implementation.
- **Avoided Traps** / **Gold Standards Rejected** *(when applicable)* — alternatives considered and rejected, with rationale. Especially critical when rejecting a generic industry/LLM "best practice" (e.g. standard React patterns, generic node workflows) that is a trap in Neo.mjs's multi-threaded architecture.
- **Related** — sibling tickets, superseded tickets, dependencies, PRs.
- **Origin Session ID** — Memory Core session ID that produced the ticket. Required for A2A Contextual Bridge Protocol (`AGENTS.md §14`). Format: `Origin Session ID: <uuid>` on its own line near the end of the body.

## 6. Visible Proposal Protocol (MANDATORY)

You MUST show the proposed ticket content **in the chat**, to the human, before calling `create_issue`. This is not optional. Pattern (see `assets/ticket-proposal-template.md` for the full template):

```
Title: [Proposed title — no [enhancement]/[bug]/[epic] prefix]
Labels: [ai, primary-label, secondary-labels...]
Body:
[Full Fat Ticket body]
```

After displaying, **immediately call `create_issue`**. Do not ask for permission first — the user can decline the tool invocation. Asking wastes a turn.

## 7. Linkage

- **Epic ↔ sub-issue:** use the `update_issue_relationship` MCP tool to natively link sub-issues to their parent. Do NOT rely on inline Markdown checkboxes (`- [ ] #N`) as the tracking mechanism. Native links feed the Native Edge Graph; Markdown does not.
- **Blocking / blocked-by:** same tool. Sets `blockedBy` / `blocking` fields on the ticket frontmatter after sync.
- **Origin Session ID:** embeds the current session as textual provenance. Complements native linkage by preserving the reasoning trail across swarm instances.

## 8. Pre-Execution Gates (from `CLAUDE.md §3`)

Before any `git commit` associated with the new ticket:

- **Gate 1 (Ticket):** ticket ID must exist, appended to commit subject as `(#ID)`.
- **Gate 2 (Contextual Completeness):** Anchor & Echo JSDoc on all new or modified classes, methods, properties.
- **Gate 3 (Commit Format):** Conventional Commits `type(scope): message (#ID)`. No `<noreply@*>` Co-Authored-By footers.

These belong to the commit step, not the creation step — but the ticket's body must be rich enough that a future commit can satisfy Gate 2 without needing a separate documentation pass.

## 9. Anti-Patterns (Non-Exhaustive)

| Anti-pattern | Why it harms |
|---|---|
| `[enhancement]` / `[bug]` / `[epic]` prefix in title | Duplicates label taxonomy; wastes title budget |
| Skeleton body (1-2 sentences) | Breaks A2A — next agent has no context to act on |
| Missing Origin Session ID | Breaks A2A Contextual Bridge; no provenance trail |
| Skipping duplicate sweep | Pollutes Knowledge Base; splits swarm attention |
| Inventing label names | Breaks label taxonomy; causes silent GitHub API rejections |
| Precedent-following without skill check | Propagates anti-patterns from prior sessions (e.g., `[enhancement]` prefix spread this way) |
| Cross-scope bundling | `epic` label on a single-commit ticket; hurts granularity |
| Bypassing visible proposal | User cannot redirect before remote state changes |

## 10. When to Escalate to Discussion Instead

If the "ticket" is really an architectural question, brainstorming, or pre-PR exploration, file a **Discussion**, not an Issue. The `ideation-sandbox` skill covers this path. Issues are for actionable work with a defined success criterion; Discussions are for shaping the question.

## 11. After Creation (Chained MCP Tool Usage)

The `create_issue` tool returns the new issue number. Typical immediate follow-ups:

- **`manage_issue_assignees(action: 'add', issue_number: N, assignees: ['@me'])`** — claim ownership when you intend to pick up the ticket immediately (per `ticket-intake` §3a Acceptance Protocol). Skip if the ticket is for someone else or deferred.
- **`manage_issue_labels(action: 'add', ...)`** — only if the label set needs adjustment post-creation (e.g., label list was incomplete at `create_issue` time). Prefer getting labels right in the initial call.
- **`update_issue_relationship(parent_id: N, child_id: M, type: 'SUB_ISSUE')`** — required when filing sub-issues under an Epic. Native graph linkage only; do NOT rely on inline `- [ ] #N` markdown checkboxes (see §7).
- **Ticket body edits:** `gh issue edit N --body "..."` via shell, since `create_issue` does not have an update mode. The local `.md` file is canonical after `sync_all`; edits can happen either remotely via `gh` or locally with `sync_all` pushing the local version back.

Minimize chained calls where possible — a well-formed `create_issue` call with complete `title`, `body`, `labels`, and `assignees` at creation time avoids all of the above except `update_issue_relationship` (which can only run after the issue exists).

## 12. Authorship Respect

**You update your own authored artifacts in place. You never override another author's.**

When editing tickets:
- **Ticket body:** Update your own in place. If it's someone else's ticket, respond via a NEW comment.
- **Ticket AC list:** Extend your own list. If it's someone else's ticket, do NOT mutate their AC list; propose additions via comment.

*Why:* Rewriting someone else's prose causes attribution collapse and breaks Native Edge Graph ingestion.

## 13. Substrate Awareness ("Assume No Private Memory")

When writing tickets, **assume the reader has access to nothing private**.

**Fair-game citations:**
- Committed repo paths (`learn/...`, `.agent/skills/...`)
- GitHub resources (`#N`, PR URLs, commit SHAs)
- Neo Memory Core session IDs (`Origin Session ID: <uuid>`)

**FORBIDDEN load-bearing citations:**
- Harness-private filenames (e.g., `feedback_*.md` from Claude Code, or private Antigravity stores)
- Local filesystem paths outside the repo
- Machine-specific identifiers
