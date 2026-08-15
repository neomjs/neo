# PR Review Follow-Up — exceptional verdicts only

**Ordinary Round 2 does not use this template.** It uses `pr-review-round-2-template.md`, which is a
disposition table over the Round-1 actions and nothing else. This asset is for the two cases that
genuinely need full structure: a validated **Drop+Supersede**, or a guarded **repair-minted re-entry**
whose four-field receipt has already been accepted. Reaching for it in an ordinary round re-opens the
unbounded loop the terminal-round decision exists to close.

**Status:** [Drop+Supersede / Request Changes (repair-minted re-entry)]

**Opening:** [One concise sentence naming the prior review state and why this round is exceptional.]

---

### 🧭 Patch-Blind Premise Snapshot

*For follow-ups, ground the expected shape in the prior review anchor plus the current delta. Do not let the author's response framing replace the source-of-authority substrate.*

*   **Inputs Read Before Patch:** [Prior review anchor / author response / changed-file list / current `dev` source / source-of-authority substrate checked before treating the delta as evidence.]
*   **Expected Solution Shape:** [1-3 sentences naming the expected delta shape, what boundary this must NOT hardcode, and what test isolation should exist.]
*   **Patch Verdict:** [Matches / improves / contradicts the expected shape, with the evidence that confirmed or changed your premise.]
*   **Premise Coherence:** [Does this delta's premise cohere with our core values — verify-before-assert · friction→gold · flat-peer-team · no-hold · the two-hemisphere organism? A specific verdict naming the value ("coheres: ..." / "conflicts: ..."), NOT a bare yes/no. OR a scoped "N/A — no value-surface (scope: ...)". A green checklist over a wrong premise is theater.]

---

### 🪜 Strategic-Fit Decision

Per §9 Strategic-Fit Step-Back:
- **Decision**: [Approve / Approve+Follow-Up / Request Changes / Drop+Supersede]
- **Rationale**: [1-2 sentences on why this meta-decision fits the current delta context. Treat Approve+Follow-Up as the worst normal outcome, not a convenient residual bucket.]

**Required only when Decision is Drop+Supersede:**

- **Disposition:** [implementation-off | ticket-prescription-off | ticket-premise-dead]
- **Source-coordinate falsifiers:** [exact paths/lines/anchors proving the premise failure]
- **Salvage map:** [what is reusable, where it lands, and what is discarded]
- **Successor landing pad:** [ticket / amended ticket / closure artifact]
- **Successor map citation:** [successor URL or anchor that cites this salvage map]

---

### ⚓ Prior Review Anchor

*   **PR:** #[PR Number]
*   **Target Issue:** #[Issue Number]
*   **Prior Review Comment ID:** [commentId / URL / N/A]
*   **Author Response Comment ID:** [commentId / URL / N/A]
*   **Latest Head SHA:** [short SHA]
*   **Origin Session ID:** [Neo Memory Core UUID, not harness/task/transcript]

---

### 🔁 Delta Scope

Summarize what changed since the prior review:

*   **Files changed:** [list files, or "PR body only"]
*   **PR body / close-target changes:** [pass / changed / N/A]
*   **Branch freshness / merge state:** [clean / stale / unknown]

---

### ✅ Previous Required Actions Audit

For each prior Required Action, mark the current state:

*   **Addressed:** [prior RA text] — [evidence: file/commit/comment]
*   **Still open:** [prior RA text] — [remaining gap]
*   **Rejected with rationale:** [prior RA text] — [author rationale + reviewer assessment]

---

### 🔬 Delta Depth Floor

Retained for exceptional verdicts only. Ordinary Round 2 drops it — a round that must find a new concern will find one — but retiring or re-routing someone's work is precisely where a depth floor earns its cost.

*   **Delta challenge:** [the concern that makes this verdict exceptional]

OR

*   **Documented search:** *"I actively checked [surface], [prior blocker], and [close-target] before reaching this verdict."*

---

### 🔬 Premise Falsifiers

A Drop+Supersede is a verdict about the PREMISE, so this section carries the evidence that the premise failed — not a fresh scan for new concerns.

*   **Source-coordinate falsifiers:** [exact paths/lines/anchors, already listed under Strategic-Fit; restate only what a reader needs here]
*   **What survives:** [the salvage, so the successor inherits it rather than rediscovering it]

---

### 📊 Metrics Delta

Retained deliberately. An exceptional verdict is a full-structure review — it retires or re-routes the work, so it owes the scoring surface that justifies doing so. Ordinary Round 2 is where metrics are *not* restated, and it has its own template.

*   **`[ARCH_ALIGNMENT]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[CONTENT_COMPLETENESS]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[EXECUTION_QUALITY]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[PRODUCTIVITY]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[IMPACT]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[COMPLEXITY]`**: [unchanged from prior review, or previous -> current + reason]
*   **`[EFFORT_PROFILE]`**: [unchanged from prior review, or previous -> current + reason]

---

### 📋 Required Actions

**For follow-ups with new or remaining required actions:**

To proceed with merging, please address the following:

*   [ ] Item 1
*   [ ] Item 2

**For zero-issue follow-ups:**

No required actions — eligible for human merge.

---

### 📨 A2A Hand-Off

After posting this follow-up review, capture the new `commentId` and send it via A2A to the next actor so they can fetch the delta directly.
