# PR Review Follow-Up Summary

**Status:** [Approved / Approve+Follow-Up / Request Changes / Drop+Supersede / Comment]

**Cycle:** [Cycle N follow-up / re-review]

**Opening:** [One concise sentence naming the prior review state and the delta being re-checked.]

---

### Patch-Blind Premise Snapshot

*For follow-ups, ground the expected shape in the prior review anchor plus the current delta. Do not let the author's response framing replace the source-of-authority substrate.*

*   **Inputs Read Before Patch:** [Prior review anchor / author response / changed-file list / current `dev` source / source-of-authority substrate checked before treating the delta as evidence.]
*   **Expected Solution Shape:** [1-3 sentences naming the expected delta shape, what boundary this must NOT hardcode, and what test isolation should exist.]
*   **Patch Verdict:** [Matches / improves / contradicts the expected shape, with the evidence that confirmed or changed your premise.]

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

### Conditional Audit Delta

Expand only audits affected by the delta. If 2+ dimensions would otherwise render N/A, collapse them:

```
### N/A Audits — 🧪 📑
N/A across listed dimensions: <one-line reason for the delta-scope justification>.
```

(Substantive dimensions expand individually under their canonical header.)

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

Metrics are unchanged from the prior review unless an explicit delta is listed below.

*   **`[ARCH_ALIGNMENT]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[CONTENT_COMPLETENESS]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[EXECUTION_QUALITY]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[PRODUCTIVITY]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[IMPACT]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[COMPLEXITY]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[EFFORT_PROFILE]`**: [unchanged from prior review, or previous -> current + reason]

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
