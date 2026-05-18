# Double Diamond Divergence Guard Audit

Use this audit when the concise workflow-map trigger points here:

- `ideation-sandbox-workflow.md` §5.1 for high-blast-radius Discussion graduation.
- `ticket-create-workflow.md` [Communication Style & Pipeline Authority DISCIPLINE-ONLY](../../../../learn/agentos/AGENTS_ATLAS.md#communication-style-pipeline-authority-discipline-only)c for high-blast-radius tickets citing ungraduated Discussions.
- `epic-review-workflow.md` Stage 2 for Discussion-origin Epic backstops.

## Why This Exists

`ideation-sandbox-workflow.md` [Communication Style & Pipeline Authority DISCIPLINE-ONLY](../../../../learn/agentos/AGENTS_ATLAS.md#communication-style-pipeline-authority-discipline-only) already names the rubber-stamp anti-pattern, but the old §5 mechanics still optimized for convergence: proposal -> OQ resolution -> graduation. PR #11095 added the Double Diamond guard so the divergent half of design is visible before convergence is locked.

Empirical anchors:

- #11076 -> #11077: M4 daemon epic graduated before alternatives were preserved.
- #11078: earlier abandoned Double Diamond approach, closed `not_planned`.
- #11082 / PR #11083: premature implementation before #11079 graduated, closed/retracted.
- #11084: right-shape exception path; filed before #11079 graduated with operator-directed rationale, inline divergence substance, and downstream-amendment acknowledgment.
- #11091: public source for the operator-as-peer / context-asymmetry refinement used by the identity-neutral `ticket-create` exception.

## Guard Semantics

Mandatory high-blast-radius Discussion graduations cover Epics, new skill/rule/workflow changes, and substrate-level architecture changes. Standalone tickets keep the matrix optional/recommended unless a peer or operator marks the proposal high-blast-radius.

Matrix floor:

| Option | When this would be right | Evidence / falsifier | Rationale | Residual risk |
|---|---|---|---|---|

Rejected options require at least one falsifying source: prior commit, precedent code, KB result, Memory Core result, prior issue / PR / discussion, or explicit `"no source found after query X"`. Include at least two alternative shapes beside the recommended one.

Process gate:

- Matrix appears in the Discussion body before any `[RESOLVED_TO_AC]` tags.
- At least one non-author peer review cycle occurs after matrix insertion and before `GRADUATED`.
- Retro-fitted matrices after OQ resolution are paperwork; they capture convergence, not divergence.

## Ticket-Create Exception

High-blast-radius tickets citing ungraduated Discussions are blocked by default because the ticket itself creates backlog center-of-gravity. The 3-part substantive-rationale exception passes only when the ticket body contains all three:

1. Cite-able substantive-rationale declaration. The author identifies peer/operator/self for attribution, but rationale-content is the reviewable gate, not identity.
2. Inline divergence-matrix substance preempting the cited Discussion's expected gap.
3. Acknowledgment that downstream amendments may be required once the cited Discussion graduates.

This preserves #11079 OQ3's operator-override path as one valid case while applying AGENTS.md [Swarm Topology Anchor](../../../../AGENTS.md#swarm-topology-anchor) + Discussion #11091: operator identity grants merge-gate authority, not substrate-discipline authority.

## Epic-Review Backstop

If a Discussion-origin Epic lacks the required upstream matrix or peer cycle, reject the Epic and route divergence back to the Discussion. Do not accept a matrix authored directly in the Epic body as equivalent; #11077 demonstrated that retro-fitted Epic matrices capture convergence after the fact.

## Disposition

- `ideation-sandbox-workflow.md` §5.1: `compress-to-trigger`
- `ticket-create-workflow.md` [Communication Style & Pipeline Authority DISCIPLINE-ONLY](../../../../learn/agentos/AGENTS_ATLAS.md#communication-style-pipeline-authority-discipline-only)c: `compress-to-trigger`
- `epic-review-workflow.md` Stage 2 backstop: `compress-to-trigger`
- This file: `move`
- Tag: `DISCIPLINE-ONLY`

## Substrate-Decay Control

Review the guard after 6 months or 5 qualifying high-blast-radius graduations, whichever comes first. Retire, rewrite, or compress if it catches no premature convergence or measurably increases review churn without preventing wrong-shape epics.
