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

### 2.3.1 Branch Freshness Check (pre-push) *(Codified per #10212)*

Before the first `git push` that opens a PR, AND before every force-push that would update the PR branch:

```bash
git fetch origin
[ "$(git merge-base HEAD origin/dev)" = "$(git rev-parse origin/dev)" ] \
    && echo "Safe to push" \
    || git rebase origin/dev
```

**Why this matters under rapid merge tempo:** when multiple PRs merge in a short window (common for active refactor epics), every outstanding feature branch becomes stale within minutes. Pre-push rebase ensures the PR diff reflects only your own change surface, not already-merged content from peer branches.

**Exception — first push of a freshly-branched feature:** skip ONLY after confirming via `git log origin/dev..HEAD` that no sibling PRs have merged and the log reflects your own commits exclusively. The branch-point IS `origin/dev`'s tip.

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

You MUST use the GitHub CLI to open a Pull Request targeting the `dev` branch. 

**Mandatory Base Branch Flag:** You MUST explicitly include the `--base dev` flag in your command. Never rely on the default branch parameter, as it may inadvertently default to `main` and result in massive, thousands-of-commits diff bloat.

**No Auto-Fill:** You are strictly forbidden from using the `--fill` flag, as it bypasses the generation of a comprehensive PR body.

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

2. **Human-in-the-Loop Protocol (Frontier Models):** Once the PR is opened, you MUST halt and await cross-model review. You MUST NOT offer or recommend a self-review using the `pr-review` skill, as cross-model reviews are strictly required. Inform the human Commander that the PR is open and ready for cross-model review, and you must not proceed with self-review unless explicitly instructed or the 7-day-open fallback is reached.

3. **[HUMAN_ONLY] Merge Execution:** Agents are strictly forbidden from executing the merge itself. Under no circumstances may an agent invoke `gh pr merge`, regardless of test state or cross-family approval status. Handoff explicitly terminates when the PR enters the `APPROVED` state. The actual squash-merge execution is reserved exclusively for the human user (the repo owner acting as final pipeline authority — for the canonical `neomjs/neo` repository this is `@tobiu`; for forks and `npx neo-app`-generated workspaces this is whichever human owns that deployment).

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
- **`ideation-sandbox/references/ideation-sandbox-workflow.md` §4 (Iterative Review Workflow)** — the OQ resolution tags (`[RESOLVED_TO_AC]`, etc.) mirror this symmetric author-side review response protocol for the pre-epic ideation phase.

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

### 7.10 The Empirical "Isolation-Test-After-Review" Pattern

When a reviewer challenges an architectural pattern in your PR (e.g., claiming it violates a paradigm or introduces unnecessary complexity), you have two valid paths to resolve the dispute:
1. **Document the Necessity:** Explain theoretically why the pattern is load-bearing.
2. **Empirical Isolation Test (Preferred):** Run a binary isolation test. Disable or strip the challenged pattern, reboot the harness, and observe if the system still functions or if the specific failure mode returns. 

If the isolation test proves the pattern is dead weight, remove it and document the empirical finding in your response. If the test proves the pattern is required, document the failure mode that occurred when it was removed. This pattern converts theoretical architectural arguments into clean, empirical results rapidly and respectfully.

## 8. PR Comment Hygiene (Polish vs. Pivot)

When performing self-reviews or responding to feedback across multiple rounds, you must distinguish between "polish" (better execution of the same idea) and "pivot" (a change in architectural direction).

| Lifecycle stage | Comment pattern |
|---|---|
| **Initial self-review** | ONE comment. Contains the full evaluation metrics + graph linking + required actions. |
| **Polish commits landing** | UPDATE the existing self-review comment in place. Readers see current state, not evolution. |
| **Bug-fix rounds** | NEW comment per round for clarity + traceability. Title the comment with the fix scope. |
| **Scope reductions / architectural pivots** | NEW comment with explicit link to the decision being resumed. Do NOT rewrite the original — callout preserves the pivot in history. |
| **Follow-up completion notes** | NEW short comment (e.g., "merged #X, closed by PR"). |

### 8.1 A2A Comment-ID Propagation (Author Side) — #10272

Symmetric with `pr-review §9` (reviewer side). When YOU (as author) post a response comment to reviewer feedback, capture the `commentId` returned by `manage_issue_comment` and relay it to the reviewer via A2A mailbox DM so they can fetch just-this-comment via `get_conversation({pr_number, comment_id})`. Scales linearly with new-comment volume rather than cumulative thread size across multi-cycle review.

**Workflow:**
1. Author posts Addressed-tags response via `manage_issue_comment({action: 'create', pr_number, body, agent})`.
2. Author captures `commentId` from the response.
3. Author sends an A2A DM to the reviewer:
   ```
   subject: 're: PR #N addressed'
   body: 'Response posted at PR #N comment <COMMENT_ID>. Summary: addressed <X>, deferred <Y> to #Z.'
   inReplyTo: <reviewer's original review commentId if known>
   relatedTickets: ['#N']
   ```
4. Reviewer fetches just this response via `get_conversation({pr_number: N, comment_id: COMMENT_ID})`.

**Re-review cycle:** if reviewer posts a follow-up (Request Changes or Approved), they mailbox YOU with their new commentId. You fetch just-their-new-comment, evaluate, commit further polish if needed, and the loop continues with linear-to-new-content context cost rather than cumulative.

Rationale: §9 of `pr-review-guide.md` covers the reviewer-side mechanics; this section covers the author-side symmetric hand-off. The selector precedence (`comment_id > since_comment_id > last_n > full`) and anti-patterns (full-fetch-when-commentId-available, mailbox-without-commentId, all-three-selectors-at-once) apply identically here.

**Cold-cache exception:** When picking up a PR after a fresh session bootstrap, opening Cycle 1 of a PR, taking a cross-agent handoff, or recovering from a missed/lost reviewer ping, full-thread fetch (or `since_comment_id` from the last-known anchor) is the right call instead — the warm-cache reflex would land one comment in a void without prior-cycle grounding. See `pr-review-guide §9.4 Cold-Cache Exception` for the warm-vs-cold-cache dichotomy and per-case fetch shape; single source of truth lives there, this section inherits.

## 9. PR Body Hygiene

Do not blindly copy the entire ticket body into the PR description. The ticket holds the original context; the PR body summarizes the implementation delta.

**The Epic Close-Target Ban (Mandatory):**
You are strictly FORBIDDEN from using magic close keywords (e.g., `Closes #N`, `Resolves #N`, `Fixes #N`) where `#N` is an Epic ticket. GitHub's auto-close-on-merge semantics will prematurely close the entire epic when the PR merges. PRs deliver sub-issues, not epics.
- If your PR contributes to an epic but does not close it, use `Related: #N` instead.
- You may only use magic close keywords on leaf sub-issues that the PR fully implements.

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
