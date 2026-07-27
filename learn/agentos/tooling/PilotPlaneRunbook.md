# Pilot Plane Runbook — Promotion & Demotion

How a parity pilot on a **cloned-snapshot plane** ends. Both endings are transitions of durable state, so
both terminate in a receipt, and neither has an unnamed exit.

Companion to the [Restoration Runbook](./RestorationRunbook.md), which covers disaster recovery. This one
covers a *planned* transition that can still fail.

## The two endings are not mirror images

The asymmetry is the whole design, and getting it backwards is the expensive mistake:

| | What it does to the durable plane | Branch | Terminals |
|---|---|---|---|
| **Promotion** — parity becomes the seat's reality | **Mutates it** (replays pilot writes onto it) | forward-only | `committed` · `failed-contained` |
| **Demotion** — the pilot ends, overlay retired | **Leaves it alone** (overlay is fail-closed against the durable root, [#15799](https://github.com/neomjs/neo/issues/15799)) | reversible-by-proof | `demoted-clean` · `failed-contained` |

Promotion is forward-only because of ADR-0027 §2.7.4:

> "After promotion begins, the safe direction is forward completion; if reconciliation cannot prove it,
> the run settles `failed-contained` / quarantine and eligibility remains denied. It never overwrites
> independently observed live state or claims cross-store rollback."

So **there is no "undo a promotion" procedure in this runbook, and its absence is deliberate.** If you
are looking for one, the situation you are in is `failed-contained`.

Demotion is the cheap ending precisely *because* the pilot never wrote to the durable plane. It needs no
rollback — it needs a **proof that nothing leaked**.

## Terminals

Derived by [`ai/scripts/diagnostics/pilotPlaneTerminal.mjs`](../../../ai/scripts/diagnostics/pilotPlaneTerminal.mjs).
No entry point accepts a terminal as an argument: the receipt attests to evidence, not to the operator's
reading of it.

| Terminal | Meaning | Eligibility effect |
|---|---|---|
| `committed` | Replay onto the durable plane verified monotonic by a receipt — no loss, no double-apply | `opened` |
| `demoted-clean` | No overlay-tagged segment reached the durable corpus, no committed history lost | `unchanged` |
| `failed-contained` | The claim could not be proven, whatever the cause | `denied` |

Eligibility is **three-valued on purpose.** Only a strict `committed` *opens* data-consuming eligibility.
A clean demotion does not open it — it never closed it, because the pilot never mutated the durable plane.
Collapsing those two into one boolean read as a widening of the committed-only rule, which it must not be.

`failed-contained` is not an error code, it is a **state you are allowed to stay in.** It is the correct
outcome of a run that could not prove itself, and it is strictly better than the two things operators
reach for instead: deleting the overlay ("it's over anyway") or asserting success ("it looked fine").

## Promotion

1. **Baseline the replay volume.** `walVolumeBaseline.mjs` decides fork-then-replay vs dual-journal from
   measured per-seat WAL volume. Supply the three factual inputs — replay throughput, concurrent native
   inflow, and the accepted cutover window — and the budget is **derived** as
   `(throughput − inflow) × window`. It does not accept a precomputed budget: a supplied figure could pick
   the cheap posture while contradicting that arithmetic, and requiring a number is not deriving one.
   Two refusals worth knowing: an empty measurement window **refuses** rather than reporting zero, and an
   omitted inflow **refuses** rather than assuming a quiesced plane (pass `0` explicitly).
   If inflow meets or exceeds throughput the posture is `dual-journal` — replay never converges, so
   fork-then-replay is impossible at *any* window rather than merely over budget.
2. **Plan the replay.** `walReplayPlan.mjs` → `planWalReplay(...)`. Duplicate source ids refuse: a
   payload that cannot be uniquely keyed cannot be proven non-double-applied.
3. **Capture the pre-state digest.** `digestAppliedStages(...)` **before** applying anything. The
   verifier in step 5 is bound to this digest — skip it and the verification has no baseline.
4. **Apply** the planned entries to the durable plane.
5. **Verify continuity.** `verifyReplayContinuity({appliedStagesBefore, appliedStagesAfter, plan})`.
   Concurrent gains from other seats are permitted and reported separately, not treated as corruption.
6. **Settle.** `evaluatePromotion({continuity})` → the terminal and the receipt. Record both.

> **Do not re-derive continuity by eye at step 6.** The verifier distinguishes a genuine replay from a
> double-apply because it holds the pre-state digest; a fresh look at the post-state cannot.

## Demotion

> ### ⚠️ `demoted-clean` is not reachable yet, and that is the honest state
>
> The leak scan needs each durable segment's **plane id**. No producer for it exists: the WAL appender
> writes `{...record, segmentKey}` and carries no plane id, so nothing can currently distinguish an
> overlay-written segment from a natively-written one. Until that producer lands, `overlayScan.planeIdSource`
> cannot be populated honestly and **every demotion settles `failed-contained`**.
>
> That is the correct terminal for an unprovable claim, not a bug to work around. The earlier shape of this
> evaluator accepted a bare empty array as "no leak", which let a caller claim a scan the substrate cannot
> perform — converting a missing capability into a clean bill of health. Do not pass a synthetic
> `planeIdSource` to get a green terminal; the terminal would be false and the receipt would attest to
> nothing.

1. **Scan the durable corpus for overlay-tagged segments.** The evaluator requires a *structure*, not a
   list: `{planeIdSource, scannedSegmentCount, taggedSegments}`. A bare array is refused, because `[]` is
   indistinguishable from "nobody looked". **Unscanned is unproven, not clean.**
2. **Record durable segment IDs** at clone time and now — *ids*, not counts. Cardinality is not identity:
   `3 → 3` looks stable while a delete-and-add has destroyed committed history, so the check is set
   inclusion over every pre-clone id.
3. **Settle.** `evaluateDemotion({overlayScan, preCloneSegmentIds, postPilotSegmentIds})`.
4. **Retire the overlay** — only on `demoted-clean`.

> ### Why demotion does NOT compare durable-plane fingerprints
>
> The intuitive proof is to re-fingerprint the durable plane and require it to equal the pre-clone
> fingerprint. **That check is wrong, and wrong in the direction that looks rigorous.** The durable plane
> has other writers: the pilot occupies one seat for one to two weeks while the rest of the institution
> keeps writing. Its digest is *expected* to move. An equality check would report `failed-contained` on
> every healthy demotion — and an instrument that fails on the happy path gets switched off rather than
> believed.
>
> A digest diff also cannot answer the actual question. It cannot distinguish "other seats wrote" from
> "the pilot leaked," which is the only distinction that matters here.
>
> So the proven claim is narrower and survives a real pilot: **no overlay-tagged segment reached the
> durable plane.** Shrinkage is still a failure, because concurrent writers explain growth and never loss.

## On `failed-contained`

**Do:** leave eligibility denied · **quarantine** the overlay, do not delete it (it is the only surviving
evidence of what leaked) · record the receipt with its reason · escalate for human attribution.

**Do not:** retry hoping for a different terminal · start an old cohort against unproven new state · treat
a diagnostic log line as completion authority. Per ADR-0027, *"best-effort telemetry is never completion
authority"* — only the derived terminal is.

## Authority

- **ADR-0027 §2.7.4** — [committed-only eligibility, forward completion, no cross-store rollback](../decisions/0027-autonomous-data-recovery-actuator.md).
  This is the adopted authority for everything above.
- **D#15758 Option G** reaches the same shape for cloud cohorts, phrased as *"post-mutation but
  reversible-by-proof"*. It is an **unadopted divergence row** in an open divergence window, so it is
  cited here as converging evidence and never as a source of authority. If that Discussion adopts a
  different option, nothing in this runbook needs retracting.
