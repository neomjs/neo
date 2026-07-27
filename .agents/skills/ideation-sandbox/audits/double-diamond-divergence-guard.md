# Double Diamond Divergence Guard Audit

Use this audit when the concise workflow-map trigger points here:

- ideation-sandbox-workflow.md §5.1 for high-blast-radius Discussion graduation.
- ticket-create-workflow.md §1d for high-blast-radius tickets citing ungraduated Discussions.
- `epic-review-workflow.md` Stage 2 for Discussion-origin Epic backstops.

## Why This Exists

ideation-sandbox-workflow.md §1 already names the rubber-stamp anti-pattern, but the old §5 mechanics still optimized for convergence: proposal -> OQ resolution -> graduation. PR #11095 added the Double Diamond guard so the divergent half of design is visible before convergence is locked.

Empirical anchors:

- #11076 -> #11077: M4 daemon epic graduated before alternatives were preserved.
- #11078: earlier abandoned Double Diamond approach, closed `not_planned`.
- #11082 / PR #11083: premature implementation before #11079 graduated, closed/retracted.
- #11084: right-shape exception path; filed before #11079 graduated with operator-directed rationale, inline divergence substance, and downstream-amendment acknowledgment.
- #11091: public source for the operator-as-peer / context-asymmetry refinement used by the identity-neutral `ticket-create` exception.

## Guard Semantics

Mandatory high-blast-radius Discussion graduations cover Epics, new skill/rule/workflow changes, and substrate-level architecture changes. Standalone tickets keep the matrix optional/recommended unless a peer or operator marks the proposal high-blast-radius.

Divergence matrix floor (pure-divergence — NO adopt/reject, NO author-lean column):

| Option | When this would be right | Evidence / falsifier |
|---|---|---|

Each option (incl. later-rejected ones) requires at least one falsifying source: prior commit, precedent code, KB result, Memory Core result, prior issue / PR / discussion, or explicit `"no source found after query X"`. Include at least two alternative shapes beside the recommended one. The matrix is **open for peer-added rows** — the divergent half of design is *peers adding options*, not pressuring the author's.

**Valid options only (reject-at-entry).** A matrix row must be a plausible/valid candidate. Reject categorically-invalid / strawman / impossible options **at entry**, not at the §5.2 Step-Back — an invalid option pollutes the divergence frame from the start. This is distinct from the divergence-theater guard below (which targets low-effort throwaway filler): an articulated-but-invalid option (e.g. "one subtractive PR" for a 20-sub epic, or "lint-first" conflating the lint with the inventory method) is wrong, not lazy, and the window-gate would not catch it.

**Divergence window, not per-peer count.** Gate the convergence pass on a divergence **window**, never a per-peer option count — a count breeds divergence-*theater* (low-effort filler to clear the gate). Quality is enforced at the §5.2 Step-Back.

**Why neither a clock nor a count can close a window (#15996, graduated D#15998).** A clock cannot be shortened by evidence; a count rewards producing the counted artifact. A third shape also failed and is recorded so it is not re-proposed: closing on *consecutive non-substantive comments* makes the rule's own closing witnesses the filler it claims not to reward, and hands the trigger to the **least engaged** peer — inversely correlated with the engagement it exists to obtain. **The closure rule itself — the `[DIVERGENCE_FOLDED]` marker — lives ONLY in ideation-sandbox-workflow.md §5.1; this file states no predicate, so the two cannot drift.** Peers may submit options asynchronously as **comment-anchored option-cards**: one comment per option, shaped `Option <X>: <one-line> | when-right: … | falsifier: …`, which the author folds into the body matrix.

**Correlation-ceiling.** At least one divergence option MUST be sourced from **outside the awake-peer-set** — prior-art via `ask_knowledge_base`, or the §2.2 precedent sweep elevated to a required option-source. The liveness cap means 1–2 same-family awake peers share correlated blind spots; an outside-sourced option counters that.

Gated convergence pass (opens only after the window closes):

| Option | Adoption / rejection rationale | Residual risk |
|---|---|---|

The convergence columns (adopt/reject + author-lean + residual-risk) are filled **after** the divergence window closes. Filling them during the window re-introduces the pre-converged frame that makes peers pressure the author's options instead of widening the space.

Process gate:

- The divergence matrix appears in the Discussion body before any `[RESOLVED_TO_AC]` tags.
- At least one non-author peer cycle occurs during the divergence window (after matrix insertion, before the window closes and `GRADUATED`).
- Retro-fitted matrices after OQ resolution are paperwork; they capture convergence, not divergence.

## Ticket-Create Exception

High-blast-radius tickets citing ungraduated Discussions are blocked by default because the ticket itself creates backlog center-of-gravity. The 3-part substantive-rationale exception passes only when the ticket body contains all three:

1. Cite-able substantive-rationale declaration. The author identifies peer/operator/self for attribution, but rationale-content is the reviewable gate, not identity.
2. Inline divergence-matrix substance preempting the cited Discussion's expected gap.
3. Acknowledgment that downstream amendments may be required once the cited Discussion graduates.

This preserves #11079 OQ3's operator-override path as one valid case while applying AGENTS.md §15.6 + Discussion #11091: operator identity grants merge-gate authority, not substrate-discipline authority.

## Epic-Review Backstop

If a Discussion-origin Epic lacks the required upstream matrix or peer cycle, reject the Epic and route divergence back to the Discussion. Do not accept a matrix authored directly in the Epic body as equivalent; #11077 demonstrated that retro-fitted Epic matrices capture convergence after the fact.

## Disposition

- ideation-sandbox-workflow.md §5.1: `compress-to-trigger`
- ticket-create-workflow.md §1d: `compress-to-trigger`
- `epic-review-workflow.md` Stage 2 backstop: `compress-to-trigger`
- This file: `move`
- Tag: `DISCIPLINE-ONLY`

## Substrate-Decay Control

Review the guard after 6 months or 5 qualifying high-blast-radius graduations, whichever comes first. Retire, rewrite, or compress if it catches no premature convergence or measurably increases review churn without preventing wrong-shape epics.
