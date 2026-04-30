# Review Response Protocol (Anti-Rubber-Stamp Defense)

Once a reviewer posts `Status: Request Changes` (per the `pr-review` skill) or `Status: Comment` with actionable Required Actions on your PR, the author MUST respond via a structured comment on the PR thread. This closes the review-negotiation loop in a way both downstream human re-reviewers and automated consumers (Retrospective daemon, graph ingestion) can parse unambiguously.

**CRITICAL: The Anti-Passive Compliance Mandate**
Agents suffer from "interruption amnesia" when returning to a PR after a delay. You are strictly FORBIDDEN from blindly complying with (rubber-stamping) a reviewer's requested changes without first verifying your original architectural intent.

## 1. The Triangular Evaluation

When receiving change requests, you MUST execute this cognitive routine before touching any code:

1. **Retrieve:** Read the `Origin Session ID` from your PR's body.
2. **Re-hydrate:** Query the Memory Core (using `query_raw_memories` or `get_session_memories` with the origin session ID) to recover your original thought process and architectural intent for the implementation.
3. **Evaluate & Defend (The Triangle):** Perform a dialectic analysis comparing:
   - Your Original Intent (from Memory Core)
   - The Reviewer's Request
   - Your Fresh Analysis of the code

   *If the reviewer's request contradicts the established architecture or your original (valid) intent, you MUST defend the PR. Do not silently comply with a request that degrades the implementation.*

## 2. When to Invoke

Trigger this protocol when any of:
- A reviewer's comment contains a Required Actions checklist
- A reviewer's status is `Request Changes`
- A reviewer's status is `Comment` and they have listed architectural concerns the author agrees warrant response

Skip if the review is `Approved` with zero blocking concerns — a brief thank-you or silence suffices.

## 3. Per-Item Status Tags

Every Required Action from the reviewer's comment MUST receive an explicit status in the author's response comment. Three tags, mirroring `pr-review` §4 Graph Ingestion Notes so the Retrospective daemon sees a unified taxonomy:

- **`[ADDRESSED]`** — fix pushed in commit X; 1-2 sentences on what changed.
- **`[DEFERRED]`** — not addressed in this PR; follow-up ticket # cited + rationale for deferral.
- **`[REJECTED_WITH_RATIONALE]`** — author disagrees with the reviewer's ask; rationale documented for the reviewer's potential counter-challenge. **Do NOT silently skip an item** — if you disagree, say so explicitly. (Use this aggressively when the Triangular Evaluation proves the reviewer is hallucinating or derailing).

## 4. Template

Use the template at `.agents/skills/pull-request/assets/review-response-template.md` as the structural skeleton. Do NOT ad-hoc the format — the per-item tag structure is load-bearing for automated ingestion by the Retrospective daemon.

## 5. Authorship Respect

Post the response as a **NEW comment** on the PR thread. Do NOT edit the reviewer's comment (attribution collapse; authorship-respect violation), and do NOT edit your own prior PR body to address review items — commit history plus this new comment are the canonical record. Aligned with the authorship-respect rule that applies across all surfaces (tickets, PR bodies, review comments).

## 6. Commit Message Convention

Follow-up commits addressing review feedback use the standard Conventional Commits format with the ticket ID. The commit message does NOT need to cite the reviewer or specific Required Action number — the Addressed comment on the PR thread carries the link:

```
fix(scope): <concise description> (#TICKET_ID)
```

Example: `fix(ai): protect SESSION and MEMORY from getOrphanedNodes cleanup (#10151)` — the Addressed comment explicitly maps this commit SHA to the specific Required Action it closes.

## 7. Re-Review Signal

End the Addressed comment with `Re-review requested.` to signal the reviewer that the author's response cycle is complete. Do NOT add a new commit after posting the Addressed comment unless you are starting another response cycle (in response to the reviewer's follow-up feedback — new round, new comment).

## 8. Relationship to Sibling Skills

- **`pr-review` §4 (Graph Ingestion Notes)** — the tag convention here mirrors `[KB_GAP]` / `[TOOLING_GAP]` / `[RETROSPECTIVE]`. Reviewer-side and author-side tags form a unified taxonomy.
- **`pr-review` §5 (Required Actions)** — the author's response provides per-item status against the reviewer's Required Actions.
- **`pull-request` §1 (Stepping Back)** — the pre-PR reflection that catches obvious issues should prevent most Required Actions. If you find yourself responding to many rounds of Request Changes on the same PR, revisit Stepping Back discipline.
- **`ideation-sandbox/references/ideation-sandbox-workflow.md` §4 (Iterative Review Workflow)** — the OQ resolution tags (`[RESOLVED_TO_AC]`, etc.) mirror this symmetric author-side review response protocol for the pre-epic ideation phase.

## 9. Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Passive Compliance (Rubber-Stamping) | Allows hallucinated or derailing reviewer requests to degrade the architecture because the author forgot their original intent. |
| Pushing a follow-up commit without an Addressed comment | Reviewer must discover + match commits to Required Actions manually; breaks re-review efficiency |
| Silently skipping a Required Action | Signals neither agreement (should be `[ADDRESSED]`) nor disagreement (should be `[REJECTED_WITH_RATIONALE]`) — leaves reviewer uncertain |
| Editing the reviewer's comment | Authorship-respect violation; attribution collapse |
| Editing your own prior PR body to "address" items | Commit + Addressed comment is the canonical record; body edits erase the review-negotiation thread |
| Using non-standard status language (*"done"*, *"fixed"*, *"won't fix"*) | Breaks the tag taxonomy; Retrospective daemon cannot ingest consistently |
| Appending to the first Addressed comment across multiple review rounds | Violates the polish-vs-pivot analog from #10109 — new round = new comment preserving the negotiation evolution |

## 10. Empirical Example

PR #10161 (MemorySessionIngestor) received a `Status: Request Changes` review with one Required Action (*add `SESSION` and `MEMORY` labels to `GraphService.getOrphanedNodes` protection list*). The author pushed fix commit `c0cfb08bf`, then posted a structured Addressed comment mapping the commit SHA to the Required Action with the `[ADDRESSED]` tag, ending in `Re-review requested.` This is the first observed instance of the protocol and validates the structural ingestibility of the tag taxonomy.

## 11. The Empirical "Isolation-Test-After-Review" Pattern

When a reviewer challenges an architectural pattern in your PR (e.g., claiming it violates a paradigm or introduces unnecessary complexity), you have two valid paths to resolve the dispute:
1. **Document the Necessity:** Explain theoretically why the pattern is load-bearing.
2. **Empirical Isolation Test (Preferred):** Run a binary isolation test. Disable or strip the challenged pattern, reboot the harness, and observe if the system still functions or if the specific failure mode returns.

If the isolation test proves the pattern is dead weight, remove it and document the empirical finding in your response. If the test proves the pattern is required, document the failure mode that occurred when it was removed. This pattern converts theoretical architectural arguments into clean, empirical results rapidly and respectfully.
