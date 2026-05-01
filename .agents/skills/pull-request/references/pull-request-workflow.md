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

**Cross-Review Response Cycle:** If an external reviewer posts `Status: Request Changes` on your PR, you re-enter the author loop per `.agents/skills/pull-request/references/review-response-protocol.md`. After addressing the Required Actions with follow-up commits and posting the structured response comment, you halt again for re-review. Done-ness is per-handoff, not per-lifetime.

### 6.1 The Cross-Family Mandate

*(Codified per #10208)*

**No PR may be merged without at least one cross-family Approved review** (Claude-family ↔ Gemini-family, identified by the `agent` field in the Approved review comment). See `pr-review §7.2` for the empirical rationale.

**Exceptions Matrix:**
- **Micro-change exemption**: Commit type `chore` AND `< 20 lines` changed, OR pure documentation with no runtime impact.
- **7-day-open fallback**: The PR itself has been OPEN for >= 7 days AND no cross-family reviewer has engaged on the thread. Any cross-family thread engagement (review, comment, or status) resets the 7-day-open clock; only an `Approved` status satisfies the mandate. Deterministically verifiable via `get_conversation(pr_number)`: (a) `now - createdAt >= 7 days`, (b) `comments.nodes` contains no entry whose `author.login` resolves to the cross-family pattern. Fallback invocation MUST include the PR's `createdAt` timestamp + explicit confirmation that no cross-family engagement has occurred, embedded in the self-review comment.
- **Emergency hotfix escalator**: `priority: P0` label OR an explicit Tobi-override comment on the PR; post-merge cross-family retrospective review REQUIRED within 7 days.

**Invitation Layer (`manage_pr_reviewers`):** the cross-family mandate is the **validation** mechanism (Approved-status before merge). The MCP tool `manage_pr_reviewers` (`github-workflow` server) is the corresponding **invitation** mechanism — surfaces GitHub's `requested_reviewers` API for active review-requests. If no cross-family reviewer has engaged ~2 hours after PR open, the author SHOULD formally invite the opposite family via `manage_pr_reviewers({action: 'add', pr_number, reviewers: ['<opposite-family-login>']})`. Invitation precedes the 7-day-open fallback — it's the natural escalation step BEFORE that fallback fires. Codified per #10217.

### 6.2 The Core Swarm A2A Notification Mandate (Review Routing Protocol)

If you are operating inside the canonical `neomjs/neo` repository as a core swarm member (e.g., `@neo-opus-4-7`, `@neo-gemini-3-1-pro`, `@neo-gpt`), immediately after successfully opening a PR, you MUST route a review request via the `add_message` tool.

To prevent redundant parallel effort and reviewer collision, you MUST adhere to this explicit role-routing protocol rather than broadcasting naked multi-peer pings:

1. **Default PR Handoff (Single-Peer Ping):** 
   - **GitHub Layer (Assignment):** Author chooses exactly ONE `primary-reviewer` and immediately calls the `manage_pr_reviewers` MCP tool (`action: 'add'`) to make ownership visible in the PR UI.
   - **A2A Layer (Wake):** Author sends ONE actionable A2A ping *only* to that same primary reviewer.
     - Include `Review role: primary-reviewer`.
     - Include `Requested action: review PR #N`.
     - Do NOT send an actionable request to the second peer (unless using the `AGENT:*` broadcast primitive for general awareness, which does not convey primary ownership).
   - *Primary-reviewer selection heuristic:* Default to round-robin (rotation) to prevent static silos (provenance: #10483). Subsystem familiarity should only be used as an explicit override with stated rationale (e.g., "Assigning @neo-gpt because they authored this abstraction in PR #X"). Do not use pure random selection.

2. **Reviewer SLA & Decline Protocol:**
   - **24-Hour Response Window:** The assigned `primary-reviewer` has 24 hours to provide an initial review.
   - **Decline Protocol:** If a peer cannot review within 24 hours (due to queue load, context-mismatch, or loop exhaustion), they MUST formally decline via an A2A ping back to the author with `Requested action: unassign` and use `manage_pr_reviewers` to remove themselves. The author then assigns the remaining peer.
   - **Silence Timeout Path:** If the assigned reviewer is completely silent for 24 hours, the author MUST unilaterally unassign them via `manage_pr_reviewers`, assign the third peer, and note the timeout in a PR comment.

3. **Optional Visibility (The Observer):** If the second peer requires awareness without action, send an explicit no-action note.
   - Include `Review role: observer` and `Requested action: none`.
   - *Note:* This should be rare. Most PRs do not need observer notification.

4. **Tie-Breaker Routing:** If the author and primary reviewer disagree after one full response cycle, ping the third peer.
   - **PR Comment Layer:** Post a comment on the PR containing the tag `[TIE_BREAKER_REQUEST]` along with a 1-line summary of both positions. This serves as the durable graph-reconstruction record.
   - **A2A Layer:** Send an A2A ping to the third peer.
     - Include `Review role: tie-breaker`.
     - Include the `commentId` for the contested review so the tie-breaker reviews only the disagreement, not the entire PR from scratch.

5. **Architectural-Pillar Exception:** For broad structural framework changes, dual review is allowed but MUST be explicit.
   - Use `Review role: independent-reviewer` for both peers.
   - State `Dual independent review requested due architectural-pillar scope`.
   - Naked multi-peer review requests remain strictly forbidden.

6. **Cross-Reviewer Divergence Routing:** When a PR uses the Architectural-Pillar Exception and the two `independent-reviewer`s formally disagree (e.g., one issues `Approved`, the other issues `Request Changes`), the swarm has reached a deadlock. Because the core Triad Swarm consists of exactly three members (Author + 2 Reviewers), there is no remaining peer to act as a tie-breaker. Trigger fires when divergence PERSISTS after one calibration cycle. If either reviewer self-corrects within their next turn (per `feedback_pr_review_iteration_calibration.md` audit-letter discipline), escalation is not yet warranted. Escalate only when both reviewers have re-engaged after seeing each other's positions and still hold divergent verdicts.
   - **Escalation Mandate:** The Author MUST escalate the divergence to human review. The Author is strictly forbidden from breaking the tie themselves.
   - **GitHub Layer:** 
     - The Author MUST post a comment on the PR containing the tag `[CROSS_REVIEWER_DIVERGENCE_ESCALATION]`, objectively summarizing the architectural tension between both reviewers' positions.
     - The Author MUST call `manage_pr_reviewers` (`action: 'add'`) to explicitly request review from the human repository owner (`@tobiu`).
   - **A2A Layer:** The Author MUST send an A2A ping to both independent reviewers notifying them of the escalation.
     - Include `Review role: observer`.
     - Include `Requested action: hold for human resolution`. Reviewers in observer state pause new Required Actions and verdict updates pending @tobiu's resolution. They MAY post factual observation comments (e.g., commit-level updates) but MUST NOT post new substantive review cycles that would shift the divergence ground.
   - **Post-Resolution:** @tobiu's ruling is binding. Author pushes any changes warranted by the ruling, posts a `[DIVERGENCE_RESOLVED]` PR comment summarizing the resolution, and notifies both observer-reviewers via A2A. Reviewers exit observer state; standard merge-eligibility per §6.1 applies.

This strict role-based feedback loop prevents duplicated work and confusion over PR ownership when multiple agents are running concurrently. This rule strictly applies only to the `neomjs/neo` repo for the core team; it does NOT affect external contributors, forks, or users of `npx neo-app` workspaces.

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

**Pre-Flight Check (operational reflex)** — mirrors `AGENTS.md §3 / §4.2` proven primitive. After every author-side `manage_issue_comment` create, before yielding turn, explicitly state in your reasoning: *"Pre-Flight: I posted response commentId `<ID>` addressing reviewer feedback. I have (or will) send an A2A ping to reviewer `<handle>` with the literal commentId in the body."* This commitment-statement is the gate that permits yielding turn. Skipping is empirically the dominant failure mode (PR #10371 + #10375, 2026-04-26: 5+ missed pings before @tobiu surfaced the gap). See `pr-review-guide §9.4 Pre-Flight Check` for the full reasoning template; single source of truth lives there, this section inherits.

**Cold-cache exception:** When picking up a PR after a fresh session bootstrap, opening Cycle 1 of a PR, taking a cross-agent handoff, or recovering from a missed/lost reviewer ping, full-thread fetch (or `since_comment_id` from the last-known anchor) is the right call instead — the warm-cache reflex would land one comment in a void without prior-cycle grounding. See `pr-review-guide §9.5 Cold-Cache Exception` for the warm-vs-cold-cache dichotomy and per-case fetch shape; single source of truth lives there, this section inherits.

## 9. PR Body Hygiene

Do not blindly copy the entire ticket body into the PR description. The ticket holds the original context; the PR body summarizes the implementation delta.

**The Epic Close-Target Ban (Mandatory):**
You are strictly FORBIDDEN from using magic close keywords (e.g., `Closes #N`, `Resolves #N`, `Fixes #N`) where `#N` is an Epic ticket. GitHub's auto-close-on-merge semantics will prematurely close the entire epic when the PR merges. PRs deliver sub-issues, not epics.
- If your PR contributes to an epic but does not close it, use `Related: #N` instead.
- You may only use magic close keywords on leaf sub-issues that the PR fully implements.

**The Syntax-Exact Keyword Mandate (Mandatory):**
When your PR fully implements a ticket, you MUST use the exact GitHub-supported magic keyword syntax (e.g., `Resolves #N` or `Closes #N`) on its own line. 
You are strictly FORBIDDEN from embedding the closing keyword in a conversational sentence (e.g., "Closes Sub 3 of Epic #X (#Y)"). GitHub's parser requires strict syntax to establish the automatic close link. If you fail to use the exact syntax, the ticket will remain open after merge.
**Multiple Tickets Loophole:** While we strive for a 1-Ticket-to-1-PR ratio, if your PR fully resolves multiple tickets, you MUST flag each one individually. Do NOT use comma-separated lists like `Resolves #X, #Y`. Instead, use a distinct line for each ticket:
`Resolves #X`
`Resolves #Y`

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
- Committed repo paths (`learn/...`, `.agents/skills/...`)
- GitHub resources (`#N`, PR URLs, commit SHAs)
- Neo Memory Core session IDs (`Origin Session ID: <uuid>`)

**FORBIDDEN load-bearing citations:**
- Harness-private filenames (e.g., `feedback_*.md` from Claude Code, or private Antigravity stores)
- Local filesystem paths outside the repo
- Machine-specific identifiers
