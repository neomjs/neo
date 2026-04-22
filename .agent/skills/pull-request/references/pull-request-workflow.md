# Pull Request Workflow

This document outlines the authoritative protocol for structuring and executing Pull Requests within the Neo.mjs project. **This protocol applies to all agents, including headless autonomous sub-agents.**

By consolidating the PR creation logic here, we prevent our agents from falling into tactical loops and enforce architectural reflection before any code is merged.

## 1. The "Stepping Back" Reflection Protocol (Pre-Commit Gate)

The act of opening a PR is an irreversible state transition in the Agent OS. Before executing the final `git commit` and `gh pr create`, you MUST step back from the tactical implementation and assume the persona of an Architect.

**Scope Creep vs. Iteration:** You must explicitly "think outside the box" and challenge your initial tactical assumptions:
- **Minor Gaps:** If your reflection uncovers minor misses (e.g., missed JSDoc, missing Anchor & Echo context, logical edge cases, or missing unit tests validating new logic), you MUST fix them and add rapid successive commits to your local branch to polish the execution *before* opening the PR.
- **Major Refactors:** If you realize a mathematically superior architecture exists (e.g., massive GC optimization) that is *out-of-scope* for the current ticket, DO NOT attempt to scope-creep and cram it into the active branch. Secure the "good enough" execution, and instead formally propose a **Follow-Up System Enhancement Ticket** conceptually linked to the original.

*If and only if* you pass this reflection phase, proceed to the Git execution sequence.

## 2. Git Branching Mandate

You are strictly forbidden from committing or pushing directly to `main` (release-only) or `dev` (default working). The *mechanism* for satisfying this rule differs by harness class.

### 2.1 Worktree-isolated harnesses (e.g., Claude Code)

Claude Code and similar harnesses create a git worktree per session at `.claude/worktrees/<name>/` on an auto-generated branch. Git's worktree branch-exclusivity mechanically prevents accidental commits to `main`/`dev` — another worktree already holds those branches, and git refuses to share.

Any non-`main`/`dev` branch name is acceptable, including harness-generated defaults like `claude/goofy-tu-f83d87`. No explicit branching action is required — the harness already satisfies the mandate.

### 2.2 Shared-checkout harnesses (e.g., Gemini CLI, Antigravity)

Harnesses without worktree isolation operate directly inside the main checkout's working tree. The first `git commit` without an explicit branch lands on the currently checked-out branch — typically `dev`, which is a protocol violation.

You MUST branch off *before* any code change:

```bash
git checkout -b agent/[ticket-id]-[descriptor]
# Example: git checkout -b agent/9957-pull-request-skill
```

> **Note:** If you followed the `ticket-intake` skill (Section 3: Acceptance Protocol), the feature branch should already exist.

### 2.3 Universal safety net

Regardless of harness class, before your first commit verify:

```bash
git branch --show-current
```

If it returns `main` or `dev`, STOP and branch off using the §2.2 procedure. This check costs nothing and catches edge cases where a harness's isolation assumption has broken (e.g. symlink detach, manual `git checkout`).

### 2.3.1 Branch Freshness Check (pre-push)

Before the first `git push` that opens a PR, AND before every force-push that would update the PR branch:

    git fetch origin
    git merge-base HEAD origin/dev | diff - <(git rev-parse origin/dev)
    # Empty output = branch is based on current dev tip. Safe to push.
    # Non-empty = origin/dev has advanced since branch-point. Rebase first:
    git rebase origin/dev

**Why this matters under rapid merge tempo:** when multiple PRs merge in a short window (common for active refactor epics), every outstanding feature branch becomes stale within minutes. Pre-push rebase ensures the PR diff reflects only your own change surface, not already-merged content from peer branches.

**Exception — first push of a freshly-branched feature:** if the branch was just created via `git checkout -b agent/[ticket-id] origin/dev` and no sibling PRs have merged since, skip this check. The branch-point IS `origin/dev`'s tip.

## 3. Commit Sequence

Your commit messages MUST follow Conventional Commits and MUST append the ticket ID so that the GitHub API and our internal memory cores can track outcomes.

### 3.1 Type Selection

- **`feat`** — the change unlocks a new capability that did not exist before. Harness integrations, new workflows, new tooling surfaces, and any agent- or user-facing feature all fall here.
- **`fix`** — restores broken behavior. Use when a regression, race condition, or incorrect output is being corrected.
- **`chore`** — pure maintenance with zero behavioral or capability delta. Dependency bumps, auto-generated syncs, typo fixes, and similar housekeeping only.

Decision rule: *"Does this enable a new capability that did not exist before?"* → `feat`. When ambiguous, default to `feat`; `chore` is the narrowest category.

### 3.2 Commit Message Hygiene

- **FORBIDDEN:** `Co-Authored-By: <name> <noreply@*>` footers. Some AI harnesses (notably Claude Code) inject these by default — you MUST override that behavior. Agent participation is tracked via the linked ticket body, PR labels (`ai`, `ai-generated`), and Memory Core origin-session IDs, not via fake git identities in commit trailers.
- **MANDATORY:** append the ticket ID to the subject line in `(#TICKET_ID)` form — e.g. `feat(claude): wire harness (#10059)`. A trailing paragraph like `Refs #N` is non-compliant. The `Resolves #N` keyword belongs in the PR body, not the commit.

### 3.3 Steps

1.  Stage your files: `git add [file paths]`
2.  Commit the changes:
    ```bash
    git commit -m "type(scope): descriptive message (#TICKET_ID)"
    ```
3.  Push the branch to remote:
    ```bash
    git push origin [branch-name]
    ```

## 4. Pull Request Creation

You MUST use the GitHub CLI to open a Pull Request targeting the `dev` branch. You are strictly forbidden from using the `--fill` flag, as it bypasses the generation of a comprehensive PR body.

```bash
gh pr create --title "feat/fix/chore: Your Title (#TICKET_ID)" --body "Comprehensive markdown body explaining architectural impact, edge cases, and explicitly stating Resolves #TICKET_ID" --base dev
```
*(Passing the body directly ensures the PR contains the required context and aligns with the "Fat Ticket" protocol.)*

## 5. Self-Identification (Mandatory Authorship)

To ensure symmetric discipline across the PR lifecycle and enable accurate cross-model convergence tracking, you MUST explicitly self-identify within the PR body you generate. This mirrors the authorship requirements in the `pr-review` skill.

Your PR body MUST include a self-identification block near the top, formatted exactly as follows:
`Authored by [Model Name] ([Agent Wrapper]). Session <Origin Session ID>.`

**Cross-Harness Authorship Convention:**
When you author a PR based on a handoff, ticket, or artifact synthesized by a *different* model in a *different* session (e.g., executing an implementation plan created by another agent), you MUST attribute the full provenance:
`Authored by [Model-B] ([Harness-B]) consuming [Model-A]'s handoff — session A <id>, session B <id>.`

This ensures A2A provenance remains graph-extractable even if you do not have a dedicated GitHub service account.

## 6. Definition of Done & The Handoff State

The agent's task is strictly considered "Done" once the PR is opened. A PR is a request for validation by an external entity (Human or QA Agent). **An agent MUST NOT autonomously run the `pr-review` skill against its own PR in headless mode.** 

**Iterative Polish (Pre-PR):** Autonomous agents must act as their own harshest critic *before* the handoff. Get the codebase to the best possible state. If you identify minor gaps (missing JSDoc, logical edge cases) during your reflection, you MUST push follow-up polish commits to your branch *prior* to executing the final PR creation.

You MUST follow this exact handoff protocol:

1. **Autonomous Protocol (Headless):** Immediately after the PR is successfully opened, you MUST invoke the state transition trap to terminate the swarm intelligence loop:
   `signal_state_transition(state: 'PR_OPENED', target: "[pr-number]")`

2. **Human-in-the-Loop Protocol (Frontier Models):** Once the PR is opened, you MUST halt and await human QA. **DO NOT** execute `gh pr merge` yourself. You may ask the human Commander: *"PR opened. Shall I execute the `pr-review` skill to assist with your evaluation?"* but you must not proceed without explicit consent.

**Cross-Review Response Cycle:** If an external reviewer posts `Status: Request Changes` on your PR, you re-enter the author loop per §7 (Review Response Protocol). After addressing the Required Actions with follow-up commits and posting the structured response comment, you halt again for re-review. Done-ness is per-handoff, not per-lifetime.

### 6.1 The Cross-Family Mandate

*(Codified per #10208)*

**No PR may be merged without at least one cross-family Approved review** (Claude-family ↔ Gemini-family, identified by the `agent` field in the Approved review comment). See `pr-review §7.2` for the empirical rationale.

**Exceptions Matrix:**
- **Micro-change exemption**: Commit type `chore` AND `< 20 lines` changed, OR pure documentation with no runtime impact.
- **7-day-open fallback**: The PR itself has been OPEN for >= 7 days AND no cross-family reviewer has engaged on the thread. Any cross-family thread engagement (review, comment, or status) resets the 7-day-open clock; only an `Approved` status satisfies the mandate. Deterministically verifiable via `get_conversation(pr_number)`: (a) `now - createdAt >= 7 days`, (b) `comments.nodes` contains no entry whose `author.login` resolves to the cross-family pattern. Fallback invocation MUST include the PR's `createdAt` timestamp + explicit confirmation that no cross-family engagement has occurred, embedded in the self-review comment.
- **Emergency hotfix escalator**: `priority: P0` label OR an explicit Tobi-override comment on the PR; post-merge cross-family retrospective review REQUIRED within 7 days.

## 7. Review Response Protocol

Once a reviewer posts `Status: Request Changes` (per the `pr-review` skill) or `Status: Comment` with actionable Required Actions, the author MUST respond via a structured comment on the PR thread. This closes the review-negotiation loop in a way both downstream human re-reviewers and automated consumers (Retrospective daemon, graph ingestion) can parse unambiguously.

### 7.1 When to Invoke

Trigger this protocol when any of:

- A reviewer's comment contains a Required Actions checklist
- A reviewer's status is `Request Changes`
- A reviewer's status is `Comment` and they have listed architectural concerns the author agrees warrant response

Skip if the review is `Approved` with zero blocking concerns — a brief thank-you or silence suffices.

### 7.2 Per-Item Status Tags

Every Required Action from the reviewer's comment MUST receive an explicit status in the author's response comment. Three tags, mirroring `pr-review` §4 Graph Ingestion Notes so the Retrospective daemon sees a unified taxonomy:

- **`[ADDRESSED]`** — fix pushed in commit X; 1-2 sentences on what changed.
- **`[DEFERRED]`** — not addressed in this PR; follow-up ticket # cited + rationale for deferral.
- **`[REJECTED_WITH_RATIONALE]`** — author disagrees with the reviewer's ask; rationale documented for the reviewer's potential counter-challenge. **Do NOT silently skip an item** — if you disagree, say so explicitly.

### 7.3 Template

Use the template at `.agent/skills/pull-request/assets/review-response-template.md` as the structural skeleton. Do NOT ad-hoc the format — the per-item tag structure is load-bearing for automated ingestion by the Retrospective daemon.

### 7.4 Authorship Respect

Post the response as a **NEW comment** on the PR thread. Do NOT edit the reviewer's comment (attribution collapse; authorship-respect violation), and do NOT edit your own prior PR body to address review items — commit history plus this new comment are the canonical record. Aligned with the authorship-respect rule that applies across all surfaces (tickets, PR bodies, review comments).

### 7.5 Commit Message Convention

Follow-up commits addressing review feedback use the standard Conventional Commits format with the ticket ID. The commit message does NOT need to cite the reviewer or specific Required Action number — the Addressed comment on the PR thread carries the link:

```
fix(scope): <concise description> (#TICKET_ID)
```

Example: `fix(ai): protect SESSION and MEMORY from getOrphanedNodes cleanup (#10151)` — the Addressed comment explicitly maps this commit SHA to the specific Required Action it closes.

### 7.6 Re-Review Signal

End the Addressed comment with `Re-review requested.` to signal the reviewer that the author's response cycle is complete. Do NOT add a new commit after posting the Addressed comment unless you are starting another response cycle (in response to the reviewer's follow-up feedback — new round, new comment).

### 7.7 Relationship to Sibling Skills

- **`pr-review` §4 (Graph Ingestion Notes)** — the tag convention here mirrors `[KB_GAP]` / `[TOOLING_GAP]` / `[RETROSPECTIVE]`. Reviewer-side and author-side tags form a unified taxonomy.
- **`pr-review` §5 (Required Actions)** — the author's response provides per-item status against the reviewer's Required Actions.
- **`pull-request` §1 (Stepping Back)** — the pre-PR reflection that catches obvious issues should prevent most Required Actions. If you find yourself responding to many rounds of Request Changes on the same PR, revisit Stepping Back discipline.

### 7.8 Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Pushing a follow-up commit without an Addressed comment | Reviewer must discover + match commits to Required Actions manually; breaks re-review efficiency |
| Silently skipping a Required Action | Signals neither agreement (should be `[ADDRESSED]`) nor disagreement (should be `[REJECTED_WITH_RATIONALE]`) — leaves reviewer uncertain |
| Editing the reviewer's comment | Authorship-respect violation; attribution collapse |
| Editing your own prior PR body to "address" items | Commit + Addressed comment is the canonical record; body edits erase the review-negotiation thread |
| Using non-standard status language (*"done"*, *"fixed"*, *"won't fix"*) | Breaks the tag taxonomy; Retrospective daemon cannot ingest consistently |
| Appending to the first Addressed comment across multiple review rounds | Violates the polish-vs-pivot analog from #10109 — new round = new comment preserving the negotiation evolution |

### 7.9 Empirical Example

PR #10161 (MemorySessionIngestor) received a `Status: Request Changes` review with one Required Action (*add `SESSION` and `MEMORY` labels to `GraphService.getOrphanedNodes` protection list*). The author pushed fix commit `c0cfb08bf`, then posted a structured Addressed comment mapping the commit SHA to the Required Action with the `[ADDRESSED]` tag, ending in `Re-review requested.` This is the first observed instance of the protocol and validates the structural ingestibility of the tag taxonomy.

## 8. PR Comment Hygiene (Polish vs. Pivot)

When performing self-reviews or responding to feedback across multiple rounds, you must distinguish between "polish" (better execution of the same idea) and "pivot" (a change in architectural direction).

| Lifecycle stage | Comment pattern |
|---|---|
| **Initial self-review** | ONE comment. Contains the full evaluation metrics + graph linking + required actions. |
| **Polish commits landing** | UPDATE the existing self-review comment in place. Readers see current state, not evolution. |
| **Bug-fix rounds** | NEW comment per round for clarity + traceability. Title the comment with the fix scope. |
| **Scope reductions / architectural pivots** | NEW comment with explicit link to the decision being resumed. Do NOT rewrite the original — callout preserves the pivot in history. |
| **Follow-up completion notes** | NEW short comment (e.g., "merged #X, closed by PR"). |

## 9. PR Body Hygiene

Do not blindly copy the entire ticket body into the PR description. The ticket holds the original context; the PR body summarizes the implementation delta.

**Minimum-viable PR body structure:**
```markdown
Resolves #N

<one-paragraph outcome summary — what actually shipped, not restating ticket>

## Deltas from ticket (if any)
<scope additions, better solutions, discovered edge cases>

## Test Evidence
<commands run, results, coverage>

## Post-Merge Validation
- [ ] <items verifiable only after merge>

## Commits (if multi-commit)
- <sha> — <purpose>

## Evolution (optional, only if pivots occurred during implementation)
<one compressed paragraph per pivot — why direction changed, not the old text>
```

## 10. Authorship Respect

**You update your own authored artifacts in place. You never override another author's.**

| Surface | Own artifact | Other author's artifact |
|---|---|---|
| PR body | Update in place | Respond via comment (never rewrite) |
| Self-review comment | Update (polish) / new comment (pivot) | Respond via NEW comment |
| Ticket body | Update in place | Comment on the ticket |
| Ticket AC list | Extend own "Evolution" trail | Comment — do NOT mutate their AC list |

**Exceptions:**
- PR author explicitly invites co-authorship on the body.
- Abandoned PR salvaged by a maintainer (documented in a comment first).

## 11. Substrate Awareness ("Assume No Private Memory")

When writing public artifacts (PRs, Tickets, comments), **assume the reader has access to nothing private**.

**Fair-game references:**
- Committed repo paths (`learn/...`, `.agent/skills/...`)
- GitHub resources (`#N`, PR URLs, commit SHAs)
- Neo Memory Core session IDs (`Origin Session ID: <uuid>`)

**FORBIDDEN load-bearing citations:**
- Harness-private filenames (e.g., `feedback_*.md` from Claude Code, or private Antigravity stores)
- Local filesystem paths outside the repo
- Machine-specific identifiers
