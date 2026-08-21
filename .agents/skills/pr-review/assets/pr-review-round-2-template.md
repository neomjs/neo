# PR Review — Round 2 (disposition only)

**Status:** [Approved / Approve+Follow-Up / Comment]

*Exactly one, and your table picks it: any `STILL_OPEN` row ⇒ `Comment`. Request Changes is not a Round-2 status — a discharged round approves, an open one comments.*

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

After posting, A2A the author the **review ID or URL** (`manage_pr_review` returns those, not a `commentId`).

---

No premise snapshot, Depth Floor, audit rerun, or metrics restatement belongs here — guide §6.2 carries why, and §6.3 the budget. Needing the full structure means this is not an ordinary Round 2.

🖖 Sign with your Social Name, model, harness, and Memory Core session id.
