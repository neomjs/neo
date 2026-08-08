# Review Response Protocol (Anti-Rubber-Stamp Defense)

Once a reviewer posts `Status: Request Changes` (per the `pr-review` skill) or `Status: Comment` with actionable Required Actions on your PR, the author MUST respond via a structured comment on the PR thread. This closes the review-negotiation loop in a way both downstream human re-reviewers and automated consumers (Retrospective daemon, graph ingestion) can parse unambiguously.

**CRITICAL: The Anti-Passive Compliance Mandate**
Agents suffer from "interruption amnesia" when returning to a PR after a delay. You are strictly FORBIDDEN from blindly complying with (rubber-stamping) a reviewer's requested changes without first verifying your original architectural intent.

## 1. Author Pre-Flight Check (when receiving Request Changes)

Before drafting your response, ask: **"Does my original implementation reflect an
empirical-design choice the reviewer doesn't have evidence to refute?"**

If YES, `[REJECTED_WITH_RATIONALE]` is a first-class strategic option, not an
edge-case escape valve. Use it aggressively (per §4). Reviewers are mandated to yield to empirical evidence via the Yield Pre-Flight (`pr-review-guide.md §9.1`). Capitulating to reviewer
authority on questions where YOU have the empirical evidence is the substrate-
silence failure mode (today's anchor: PR #10607 Cycle 1, where Gemini's Cmd+N
primitive matched operator intent but was removed under reviewer pressure
without invoking `[REJECTED_WITH_RATIONALE]`).

If NO, proceed with standard `[ADDRESSED]` / `[DEFERRED]` response shapes.

## 2. The Triangular Evaluation

When receiving change requests, you MUST execute this cognitive routine before touching any code:

1. **Retrieve:** Read the `Origin Session ID` from your PR's body.
2. **Re-hydrate:** Query the Memory Core (using `query_raw_memories` or `get_session_memories` with the origin session ID) to recover your original thought process and architectural intent for the implementation.
3. **Evaluate & Defend (The Triangle):** Perform a dialectic analysis comparing:
   - Your Original Intent (from Memory Core)
   - The Reviewer's Request
   - Your Fresh Analysis of the code

   *If the reviewer's request contradicts the established architecture or your original (valid) intent, you MUST defend the PR. Do not silently comply with a request that degrades the implementation.*

## 3. When to Invoke

Trigger this protocol when any of:
- A reviewer's comment contains a Required Actions checklist
- A reviewer's status is `Request Changes`
- A reviewer's status is `Comment` and they have listed architectural concerns the author agrees warrant response

Skip if the review is `Approved` with zero blocking concerns — a brief thank-you or silence suffices.

## 4. Per-Item Status Tags

Every Required Action from the reviewer's comment MUST receive an explicit status in the author's response comment. Three tags, mirroring `pr-review` §4 Graph Ingestion Notes so the Retrospective daemon sees a unified taxonomy:

- **`[ADDRESSED]`** — fix pushed in commit X; 1-2 sentences on what changed.
- **`[DEFERRED]`** — not addressed in this PR; follow-up ticket # cited + rationale for deferral.
- **`[REJECTED_WITH_RATIONALE]`** — author disagrees with the reviewer's ask; rationale documented for the reviewer's potential counter-challenge. **Do NOT silently skip an item** — if you disagree, say so explicitly. (Use this aggressively when the Triangular Evaluation proves the reviewer is hallucinating or derailing).

## 5. Template

Use the template at `.agents/skills/pull-request/assets/review-response-template.md` as the structural skeleton. Do NOT ad-hoc the format — the per-item tag structure is load-bearing for automated ingestion by the Retrospective daemon.

## 6. Authorship Respect

Post the response as a **NEW comment** on the PR thread. Do NOT edit the reviewer's comment (attribution collapse; authorship-respect violation), and do NOT edit your own prior PR body to address review items — commit history plus this new comment are the canonical record. Aligned with the authorship-respect rule that applies across all surfaces (tickets, PR bodies, review comments).

Restatement RAs on foreign ticket text -> read [foreign-ticket-restatement.md](./foreign-ticket-restatement.md) (comment-proposal default; prescribed-direct-edit path with trail + revert-authority + author-confirm closure).

## 7. Commit Message Convention

Follow-up commits addressing review feedback use the standard Conventional Commits format with the ticket ID. The commit message does NOT need to cite the reviewer or specific Required Action number — the Addressed comment on the PR thread carries the link:

```
fix(scope): <concise description> (#TICKET_ID)
```

Example: `fix(ai): protect SESSION and MEMORY from getOrphanedNodes cleanup (#10151)` — the Addressed comment explicitly maps this commit SHA to the specific Required Action it closes.

## 8. Re-Review Signal

Before ending the Addressed comment with `Re-review requested.`, apply the CI-green gate in [`./ci-green-review-routing.md`](./ci-green-review-routing.md). If CI is pending or failing on the current head, document the CI hold instead and send the actionable re-review request only after green CI. Do NOT add a new commit after posting the Addressed comment unless you are starting another response cycle (in response to the reviewer's follow-up feedback — new round, new comment).

After the second ordinary `CHANGES_REQUESTED`, the next reviewer handoff is closure, not another RC request. Supply the evidence needed for the reviewer's `COMMENTED` RC2 packet (consumer sweep, falsifier/property matrix, carried-vs-new census, truth-fold, frozen semantic surface); the next gate-bearing verdict is `APPROVED` or one complete terminal Drop+Supersede.

## 9. Relationship to Sibling Skills

- **`pr-review` §4 (Graph Ingestion Notes)** — the tag convention here mirrors `[KB_GAP]` / `[TOOLING_GAP]` / `[RETROSPECTIVE]`. Reviewer-side and author-side tags form a unified taxonomy.
- **`pr-review` §5 (Required Actions)** — the author's response provides per-item status against the reviewer's Required Actions.
- **`pull-request` §1 (Stepping Back)** — the pre-PR reflection that catches obvious issues should prevent most Required Actions. If you find yourself responding to many rounds of Request Changes on the same PR, revisit Stepping Back discipline.
- **`ideation-sandbox/references/ideation-sandbox-workflow.md` §4 (Iterative Review Workflow)** — the OQ resolution tags (`[RESOLVED_TO_AC]`, etc.) mirror this symmetric author-side review response protocol for the pre-epic ideation phase.

## 10. Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Passive Compliance (Rubber-Stamping) | Allows hallucinated or derailing reviewer requests to degrade the architecture because the author forgot their original intent. |
| Pushing a follow-up commit without an Addressed comment | Reviewer must discover + match commits to Required Actions manually; breaks re-review efficiency |
| Silently skipping a Required Action | Signals neither agreement (should be `[ADDRESSED]`) nor disagreement (should be `[REJECTED_WITH_RATIONALE]`) — leaves reviewer uncertain |
| Editing the reviewer's comment | Authorship-respect violation; attribution collapse |
| Editing your own prior PR body to "address" items | Commit + Addressed comment is the canonical record; body edits erase the review-negotiation thread |
| Using non-standard status language (*"done"*, *"fixed"*, *"won't fix"*) | Breaks the tag taxonomy; Retrospective daemon cannot ingest consistently |
| Appending to the first Addressed comment across multiple review rounds | Violates the polish-vs-pivot analog from #10109 — new round = new comment preserving the negotiation evolution |

## 11. Empirical Example

PR #10161 (MemorySessionIngestor) received a `Status: Request Changes` review with one Required Action (*add `SESSION` and `MEMORY` labels to `GraphService.getOrphanedNodes` protection list*). The author pushed fix commit `c0cfb08bf`, then posted a structured Addressed comment mapping the commit SHA to the Required Action with the `[ADDRESSED]` tag, ending in `Re-review requested.` This is the first observed instance of the protocol and validates the structural ingestibility of the tag taxonomy.

## 12. The Empirical "Isolation-Test-After-Review" Pattern

When a reviewer challenges an architectural pattern in your PR (e.g., claiming it violates a paradigm or introduces unnecessary complexity), you have two valid paths to resolve the dispute:
1. **Document the Necessity:** Explain theoretically why the pattern is load-bearing.
2. **Empirical Isolation Test (Preferred):** Run a binary isolation test. Disable or strip the challenged pattern, reboot the harness, and observe if the system still functions or if the specific failure mode returns.

If the isolation test proves the pattern is dead weight, remove it and document the empirical finding in your response. If the test proves the pattern is required, document the failure mode that occurred when it was removed. This pattern converts theoretical architectural arguments into clean, empirical results rapidly and respectfully.

## 13. PR Comment Hygiene (Polish vs. Pivot)

When performing self-reviews or responding to feedback across multiple rounds, you must distinguish between "polish" (better execution of the same idea) and "pivot" (a change in architectural direction). On another author's artifact §11 makes comments your only channel; the rows still apply, and editing your own comment respects their authorship.

| Lifecycle stage | Comment pattern |
|---|---|
| **Initial self-review** | ONE comment. Contains the full evaluation metrics + graph linking + required actions. |
| **Polish commits landing** | UPDATE the existing self-review comment in place. Readers see current state, not evolution. |
| **Bug-fix rounds** | NEW comment per round for clarity + traceability. Title the comment with the fix scope. |
| **Scope reductions / architectural pivots** | NEW comment with explicit link to the decision being resumed. Do NOT rewrite the original — the callout preserves the *direction change*, not a withdrawn fact; see the row below. |
| **Withdrawing a published claim** | UPDATE in place — a withdrawal lands no commit, so no commit-keyed row fires for it. If a separate comment is unavoidable, cut the superseded one to a pointer: **exactly one comment is live**, or the economical read (first, stop) returns the withdrawn answer. |
| **Follow-up completion notes** | NEW short comment (e.g., "merged #X, closed by PR"). |

## 14. A2A Comment-ID Propagation (Author Side)

Symmetric with `pr-review §10` (reviewer side). When you post a response comment to reviewer feedback, capture the `commentId` returned by `manage_issue_comment` and relay it to the reviewer via A2A DM so they can fetch just-this-comment via `get_conversation({pr_number, comment_id})`. Scales linearly with new-comment volume rather than cumulative thread size across multi-cycle review.

**Reviewer atomic-primitive note (#11273):** when the *reviewer* uses `manage_pr_review` instead of the legacy two-step `manage_issue_comment` + `gh pr review` chain, they receive `reviewId` (PRR_* node ID). This is the canonical artifact identifier for the formal review entity (the surface that flipped `reviewDecision`). Reviewers SHOULD relay `reviewId` + the response payload (`url`, `state`, `submittedAt`) when handing off to the next actor in the review cycle.

**Contract distinction:** `reviewId` (PRR_*) is NOT a `commentId` (IC_*). `get_conversation({comment_id})` reads `pullRequest.comments` (IssueComment, IC_*) and never fetches `PullRequestReview`, so passing a `reviewId` there returns empty. Fetch a `manage_pr_review` body from its own response payload's `body` field, or via `gh api graphql` with a `node(id: $reviewId)` selection.

**Workflow:**
1. Author posts Addressed-tags response via `manage_issue_comment({action: 'create', pr_number, body, agent})`.
2. Author captures `commentId` from the response.
3. Author sends an A2A DM to the reviewer using canonical `@<identity>` form per #11417:
   ```js
   add_message({
       to     : '@<reviewer-agent>',          // ✅ canonical @<identity>; never 'AGENT:<family>/<model>'
       subject: 're: PR #N addressed',
       body   : 'Response posted at PR #N comment <COMMENT_ID>. ' +
                'Summary: addressed <X>, deferred <Y> to #Z.',
       inReplyTo      : '<reviewer-original-review-commentId-if-known>',
       relatedTickets : ['#N']
   });
   ```
   Pre-#11417 alias confab like `to: 'AGENT:claude/opus'` silently stored as `to: null` (orphan A2A invisible to the reviewer). Post-#11417 the MailboxService rejects unrecognized formats explicitly and attempts `AGENT:<family>/<model>` resolution only when exactly one AgentIdentity matches that `modelFamily`.
4. Reviewer fetches just this response via `get_conversation({pr_number: N, comment_id: COMMENT_ID})`.

**Re-review cycle:** if reviewer posts a follow-up (Request Changes or Approved), they mailbox YOU with their new commentId. You fetch just-their-new-comment, evaluate, commit further polish if needed, and the loop continues with linear-to-new-content context cost rather than cumulative.

Rationale: §10 of `pr-review-guide.md` covers the reviewer-side hand-off discipline; this section covers the author-side symmetric hand-off. Scope the fetch per the `get_conversation` tool description (it owns the selector precedence) — the author-side discipline is identical to the reviewer-side.

**Pre-Flight Check (operational reflex)** — mirrors `AGENTS.md §pre_commit_gates / §memory_core_protocol`. After every author-side `manage_issue_comment` create, before yielding turn, explicitly state in your reasoning: *"Pre-Flight: I posted response commentId `<ID>` addressing reviewer feedback. I have (or will) send an A2A ping to reviewer `<handle>` with the literal commentId in the body."* This commitment-statement is the gate that permits yielding turn. Skipping is empirically the dominant failure mode (PR #10371 + #10375, 2026-04-26: 5+ missed pings before @tobiu surfaced the gap). See `pr-review-guide §10` for the shared warm-cache hand-off discipline; the reasoning template above is the author-side instance.

**Cold-cache exception:** When picking up a PR after a fresh session bootstrap, opening Cycle 1 of a PR, taking a cross-agent handoff, or recovering from a missed/lost reviewer ping, full-thread fetch (or `since_comment_id` from the last-known anchor) is the right call instead — the warm-cache reflex would land one comment in a void without prior-cycle grounding. See `pr-review-guide §10` for the warm-vs-cold-cache dichotomy.
