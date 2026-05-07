# PR Review Follow-Up Summary

**Status:** [Approved / Approve+Follow-Up / Request Changes / Drop+Supersede / Comment]

**Cycle:** [Cycle N follow-up / re-review]

**Opening:** [One concise sentence naming the prior review state and the delta being re-checked.]

---

### Strategic-Fit Decision

Per §9 Strategic-Fit Step-Back:
- **Decision**: [Approve / Approve+Follow-Up / Request Changes / Drop+Supersede]
- **Rationale**: [1-2 sentences on why this meta-decision fits the current delta context.]

---

### Prior Review Anchor

*   **PR:** #[PR Number]
*   **Target Issue:** #[Issue Number]
*   **Prior Review Comment ID:** [commentId / URL / N/A]
*   **Author Response Comment ID:** [commentId / URL / N/A]
*   **Latest Head SHA:** [short SHA]

---

### Delta Scope

Summarize what changed since the prior review:

*   **Files changed:** [list files, or "PR body only"]
*   **PR body / close-target changes:** [pass / changed / N/A]
*   **Branch freshness / merge state:** [clean / stale / unknown]

---

### Previous Required Actions Audit

For each prior Required Action, mark the current state:

*   **Addressed:** [prior RA text] — [evidence: file/commit/comment]
*   **Still open:** [prior RA text] — [remaining gap]
*   **Rejected with rationale:** [prior RA text] — [author rationale + reviewer assessment]

---

### Delta Depth Floor

Provide ONE of the following:

*   **Delta challenge:** [new concern introduced by the latest delta, even if non-blocking]

OR

*   **Documented delta search:** *"I actively checked [changed surface 1], [prior blocker 2], and [metadata/close-target 3] and found no new concerns."*

This is the follow-up form of the Depth Floor. Do not omit it because the prior cycle already had a challenge.

---

### Test-Execution & Location Audit

*   **Changed surface class:** [code / test / docs-template only / PR body only]
*   **Location check:** [pass / incorrect placement flagged / N/A]
*   **Related verification run:** [command + result, or "No tests required: docs/template-only delta"]
*   **Findings:** [pass / fail / not applicable with reason]

---

### Contract Completeness Audit

*(Required per guide §5.4 if the delta touches public/consumed surfaces)*

*   **Findings:** [Pass / new contract drift flagged / N/A]

---

### Metrics Delta

Update only metrics whose score changed since the prior review. Carry unchanged metrics forward by reference.

*   **`[ARCH_ALIGNMENT]`**: [previous -> current, or "unchanged from prior review"] - [reason]
*   **`[CONTENT_COMPLETENESS]`**: [previous -> current, or "unchanged from prior review"] - [reason]
*   **`[EXECUTION_QUALITY]`**: [previous -> current, or "unchanged from prior review"] - [reason]
*   **`[PRODUCTIVITY]`**: [previous -> current, or "unchanged from prior review"] - [reason]
*   **`[IMPACT]`**: [previous -> current, or "unchanged from prior review"] - [reason]
*   **`[COMPLEXITY]`**: [previous -> current, or "unchanged from prior review"] - [reason]
*   **`[EFFORT_PROFILE]`**: [previous -> current, or "unchanged from prior review"] - [reason]

---

### Required Actions

**For follow-ups with new or remaining required actions:**

To proceed with merging, please address the following:

*   [ ] Item 1
*   [ ] Item 2

**For zero-issue follow-ups:**

No required actions — eligible for human merge.

---

### A2A Hand-Off

After posting this follow-up review, capture the new `commentId` and send it via A2A to the next actor so they can fetch the delta directly.
