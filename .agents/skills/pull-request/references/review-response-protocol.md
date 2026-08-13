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

If NO, use `[ADDRESSED]`. If the request is wrong, use
`[REJECTED_WITH_RATIONALE]`. An accepted-but-unimplemented Required Action stays
OPEN; difficulty is not a fourth disposition.

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

After an actionable review, every Required Action MUST be discharged before any
subsequent push/update to the PR branch, author response, or re-review request:

- **A** = open Required Actions.
- **B** = the current delivered-scope authority: retained close-target ticket
  ACs, PR-body claims, and the actual diff.
- **Gate:** A must be empty relative to B. GitHub may still show the old review;
  the candidate head and evidence determine whether an item is discharged.

The terminal tags are:

- **`[ADDRESSED]`** — the candidate head contains the fix and evidence; cite the commit.
- **`[REJECTED_WITH_RATIONALE]`** — author disagrees with the reviewer's ask; rationale documented for the reviewer's potential counter-challenge. **Do NOT silently skip an item** — if you disagree, say so explicitly. (Use this aggressively when the Triangular Evaluation proves the reviewer is hallucinating or derailing).
- **`[SCOPE_TRANSFERRED]`** — B was already narrowed before this response. Cite
  the linked implementation leaf, the source-ticket and PR-body/close-target
  edits, and evidence that the remaining head is merge-safe and independently
  valuable with no surviving AC or claim depending on the transferred work.

Scope transfer is exceptional. Ordinary bounded repair stays in the current PR;
hundreds of lines, CI duration, token/rate limits, an awkward seam, or reviewer
preference do not change authority. If underestimated work reveals an epic,
split ticket authority first; if no coherent merge-safe slice remains, supersede
it. The tag records that completed authority change—it never substitutes for it.

## 5. Template

Use the template at `.agents/skills/pull-request/assets/review-response-template.md` as the structural skeleton. Do NOT ad-hoc the format — the per-item tag structure is load-bearing for automated ingestion by the Retrospective daemon.

## 6. Authorship Respect

Post the response as a **NEW comment** on the PR thread. Do NOT edit the reviewer's comment (attribution collapse; authorship-respect violation). Your own body splits on **what the edit changes, never on whether a reviewer answered it** — so the two cases stay disjoint and the overlap has one answer: a **fact** (number, path, count, state) is corrected in place, *including* when the RA is what found it wrong, because the lint demands an accurate body and a false number erases no negotiation — disclose old→new in the response comment and map it to the RA; a **position** (a claim under negotiation) is never rewritten or sanitised, and a body-only edit never makes implementation work look addressed — that belongs in the comment thread.

Restatement RAs on foreign ticket text -> read [foreign-ticket-restatement.md](./foreign-ticket-restatement.md) (comment-proposal default; prescribed-direct-edit path with trail + revert-authority + author-confirm closure).

## 7. Commit Message Convention

Follow-up commits addressing review feedback use the standard Conventional Commits format with the ticket ID. The commit message does NOT need to cite the reviewer or specific Required Action number — the Addressed comment on the PR thread carries the link:

```
fix(scope): <concise description> (#TICKET_ID)
```

Example: `fix(ai): protect SESSION and MEMORY from getOrphanedNodes cleanup (#10151)` — the Addressed comment explicitly maps this commit SHA to the specific Required Action it closes.

## 8. Re-Review Signal

End with `Re-review requested.` only after every item passes the §4 gate, then
apply the CI-green gate in [`./ci-green-review-routing.md`](./ci-green-review-routing.md).
If CI is pending or failing, document the CI hold and request re-review only
after green CI. A later commit starts a new response cycle and needs a new comment.

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
| Pushing a partial response head while an accepted RA remains open | Burns CI/review cost on a candidate the author already knows cannot pass |
| Creating a follow-up without changing B | Renames unfinished declared scope instead of transferring an independent slice |
| Editing the reviewer's comment | Authorship-respect violation; attribution collapse |
| Rewriting a contested *position* in your own PR body, or a body-only edit that makes work look addressed | Commit + Addressed comment is the canonical record. Correcting a *fact* stays required even when the RA is what found it — the axis is fact-vs-position, not answered-vs-unanswered; see §6 |
| Using non-standard status language (*"done"*, *"fixed"*, *"won't fix"*) | Breaks the tag taxonomy; Retrospective daemon cannot ingest consistently |
| Appending to the first Addressed comment across multiple review rounds | Violates the polish-vs-pivot analog from #10109 — new round = new comment preserving the negotiation evolution |

## 11. Empirical Example

PR #10161 (MemorySessionIngestor) received a `Status: Request Changes` review with one Required Action (*add `SESSION` and `MEMORY` labels to `GraphService.getOrphanedNodes` protection list*). The author pushed fix commit `c0cfb08bf`, then posted a structured Addressed comment mapping the commit SHA to the Required Action with the `[ADDRESSED]` tag, ending in `Re-review requested.` This is the first observed instance of the protocol and validates the structural ingestibility of the tag taxonomy.

## 12. The Empirical "Isolation-Test-After-Review" Pattern

When a reviewer challenges an architectural pattern, two paths resolve the dispute:
1. **Document the Necessity:** explain why the pattern is load-bearing.
2. **Empirical Isolation Test (Preferred):** strip the challenged pattern, reboot the harness, observe whether the system still functions or the failure mode returns.

Dead weight → remove it and document the finding. Required → document the failure mode that occurred when it was removed. This converts theoretical argument into empirical result, rapidly and respectfully.

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

This is the author-side mirror of `pr-review §10`:

1. Create the response comment and capture its `commentId` (IC_*).
2. DM the reviewer at canonical `@<identity>` with the PR number, literal
   `commentId`, and disposition summary.
3. The reviewer fetches only that comment with
   `get_conversation({pr_number, comment_id})`.

A `manage_pr_review` `reviewId` (PRR_*) is not a `commentId`; relay its returned
review payload instead. Use a full-thread or `since_comment_id` fetch for a cold
cache; the scoped fetch is only for a grounded warm-cache cycle.

**Pre-Flight:** after creating the response comment, state that its literal
`commentId` was or will be sent to the reviewer before yielding.
