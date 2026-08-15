# PR Review — Round 2 (disposition only)

**Status:** [Approved / Approve+Follow-Up / Request Changes]

**Opening:** [One sentence: which prior actions this dispositions, at which head.]

### ⚓ Anchor

*   **PR / Target Issue:** #[PR] / #[Issue]
*   **Round-1 Review ID:** [reviewId or URL] · **Author Response:** [commentId or URL]
*   **Head under review:** [short SHA]
*   **Origin Session ID:** [Memory Core UUID — its own line, and the full UUID; provenance is checked mechanically across every documented review format]

### 📋 Disposition

One row per Round-1 required action, **quoted verbatim** — no re-wording, no re-ordering, no additions.

| # | Required Action (verbatim from Round 1) | Disposition | Evidence |
|---|---|---|---|
| RA-1 | [exact prior text] | ADDRESSED / DEFENDED / STILL_OPEN | [file:line, commit, or the author's rationale you accepted] |

*   **ADDRESSED** — the action is discharged; name where.
*   **DEFENDED** — the author argued it should not be done and you accept the argument. Record the argument, not just the outcome.
*   **STILL_OPEN** — the original Round-1 review stays authoritative for this item. It does **not** become a new action list, and the item keeps its original number.

### 🔚 Verdict

[Approve · Approve+Follow-Up (only if it passes the standalone-ticket counterfactual) · **COMMENT** if any item is STILL_OPEN]

**A `STILL_OPEN` round submits as `COMMENT`, never `Request Changes`.** The whole claim of `STILL_OPEN`
is that the Round-1 review remains authoritative for that item — a new `Request Changes` would replace
it with this round's verdict, and would spend a second round the per-family budget does not have. The
managed path enforces this pairing, so an APPROVED round carrying a `STILL_OPEN` is refused rather
than silently discharging the item it just declared unresolved.

After posting, send the new **review ID or URL** to the author via A2A — `manage_pr_review` returns
`reviewId` / `url`, not a `commentId`, and an author handed the wrong identifier cannot fetch the round.

---

No premise snapshot, Depth Floor, audit rerun, or metrics restatement belongs here — guide §6.2 carries why, and §6.3 the budget. Needing the full structure means this is not an ordinary Round 2.

🖖 Sign with your Social Name, model, harness, and Memory Core session id.
