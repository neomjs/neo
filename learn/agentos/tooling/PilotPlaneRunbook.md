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

| Terminal | Meaning | Eligibility effect | Reachable today |
|---|---|---|---|
| `committed` | Replay onto the durable plane verified monotonic by a receipt — no loss, no double-apply | `opened` | ❌ no branch reaches it; needs an invoked replay adapter |
| `demoted-clean` | No overlay-tagged segment reached the durable corpus, no committed history lost | `unchanged` | ❌ gated on `OVERLAY_TAGGING_PRODUCER` |
| `failed-contained` | The claim could not be proven, whatever the cause | `denied` | ✅ the only terminal any run reaches |

**Both certifying terminals are closed**, and neither by a validation rule. In both cases the missing thing is
a **producer of fact**, and no amount of argument validation substitutes for one. They are closed
*differently* — demotion by a capability gate, promotion by having no branch at all — and the section below
explains why that asymmetry is the right shape rather than an inconsistency. So today *every* pilot settles
`failed-contained` — eligibility denied, overlay quarantined. That is not the tooling failing to do its job;
it is the honest statement about pilot-plane transitions at this head, and each section below names the
adapter that would open its path.

Eligibility is **three-valued on purpose.** Only a strict `committed` *opens* data-consuming eligibility.
A clean demotion does not open it — it never closed it, because the pilot never mutated the durable plane.
Collapsing those two into one boolean read as a widening of the committed-only rule, which it must not be.

`failed-contained` is not an error code, it is a **state you are allowed to stay in.** It is the correct
outcome of a run that could not prove itself, and it is strictly better than the two things operators
reach for instead: deleting the overlay ("it's over anyway") or asserting success ("it looked fine").

## Promotion

> ### ⚠️ `committed` is MECHANICALLY UNREACHABLE today, and that is the honest state
>
> A promotion proof needs a **complete ordered mutation source**. No producer for one exists, and five
> independent findings each block it on their own:
>
> 1. **No consumed source-read boundary.** No production caller exists for `evaluatePromotion`,
>    `planWalReplay`, `verifyReplayContinuity` or `parseJsonl` — nothing in the running system reads the
>    corpus and could issue a receipt for having read all of it.
> 2. **The owning store readers cannot become that authority.** Their operational reads deliberately *skip*
>    malformed and torn rows. Correct for serving; fatal for a completeness proof, which must refuse on a row
>    it cannot parse — that row is potentially the one that was lost.
> 3. **The plane has two WAL families.** `messageWal.dir` derives to `path.join(memoryWal.dir, 'messages')`,
>    so a corpus scan returns memory and message segments in one undifferentiated list. Replay assumes
>    `embedded + graph`; the message family is graph-only. A receipt over memory records alone certifies an
>    **incomplete** plane — and because that family's `dirProd` is a nullable override, a deployment can move
>    it out of the scanned root, so the denominator moves with configuration.
> 4. **Naïve message replay emits stale wakes.** `MailboxService._projectMessageWalRecord` defaults
>    `pumpWake = true`; its own recovery path passes `pumpWake: false` explicitly. A replay reaching the
>    default re-fires historical wakes as if they were new.
> 5. **No plane-wide writer fence.** During the audit the live memory corpus moved 8,233 → 8,234 rows
>    *between two scans*. A stable double-read is not quiescence; the append lock is per-file and fail-open.
>
> ADR-0027 OQ8 states the bound: journal replay has no source authority, and count evidence never supplies
> row identity.
>
> `evaluatePromotion` therefore **takes no argument and contains no branch**: every promotion settles
> `failed-contained`, regardless of what you pass. No producer name, path, array, count, digest, manifest or
> receipt unlocks it, because nothing is read.
>
> **It was a gate first, and that was wrong — worth recording, because the mistake is subtle.** The first
> version checked `typeof PROMOTION_REPLAY_PRODUCER !== 'function'` and fell through to the derivation
> otherwise, on the reasoning that a *function* slot was stronger than the demotion gate's *string* slot since
> "a function cannot be forged by a name." It can: the producer was type-checked but never **invoked**, so a
> no-op stub `() => {}` satisfied the check and handed caller-owned observations straight through. That is the
> same defect the demotion gate already fixed once, one level up — **requiring a thing is not proving a fact,
> whatever the thing's type.** Where a capability must *act* rather than merely *exist*, a conditional is a
> dormant success path pretending to be a guard, so the branch is gone entirely.
>
> This is why the two closures differ, and the asymmetry is deliberate rather than untidy. Demotion keeps a
> gate because its logic is complete and only its *input* is missing. Promotion has no branch because what is
> missing is an *actor*.
>
> **Why a gate and not a stricter check.** The previous shape settled `committed` on a one-entry corpus with an
> unchanged before/after — a truthful, self-consistent, entirely zero-effect certification. Refusing that
> specific case would have closed one probe while leaving **arbitrary non-empty truncation** alive: a caller
> passing half the real corpus verifies exactly as cleanly, because nothing inside the module can know what the
> whole corpus was. A proof over an unknown denominator is not a proof, and the missing thing is a producer of
> fact, not a rule.
>
> **The producer that may replace the null** must resolve both configured WAL roots, fence both source writers,
> have each owning store strictly enumerate its own canonical payload files, bind per-family content *and*
> record digests, derive the memory and message plans separately, replay messages without wake pumping or
> mutable-state overwrite, observe the target before and after, and emit one composite receipt. That is an
> executable adapter, not a receipt-shaped object.
>
> Steps 1–6 below therefore describe the procedure a landed producer would follow. Its arithmetic is not
> hypothetical: `deriveReplayCompletion` is exported and directly tested, because **a gate that makes a path
> unreachable also makes it unverifiable** — a defect behind one is invisible to every test. That is not a
> theoretical worry; the sibling capture module's post-gate block was left referencing four renamed variables
> and its suite stayed green because the gate short-circuited first. `deriveReplayCompletion` returns
> `{ok, reason, receipt}` and deliberately **no terminal and no eligibility**: it may prove the math, and it
> must never mint authority, because agreeing about a corpus says nothing about whether that corpus was the
> whole plane.

1. **Baseline the replay volume.** `walVolumeBaseline.mjs` decides fork-then-replay vs dual-journal from
   measured per-seat WAL volume. Supply the three factual inputs — replay throughput, concurrent native
   inflow, and the accepted cutover window — and the budget is **derived** as
   `(throughput − inflow) × window`. It does not accept a precomputed budget: a supplied figure could pick
   the cheap posture while contradicting that arithmetic, and requiring a number is not deriving one.
   Two refusals worth knowing: an empty measurement window **refuses** rather than reporting zero, and an
   omitted inflow **refuses** rather than assuming a quiesced plane (pass `0` explicitly).
   If inflow meets or exceeds throughput the posture is `dual-journal` — replay never converges, so
   fork-then-replay is impossible at *any* window rather than merely over budget.
2. **Read the source corpus.** The producer enumerates its canonical payload files and refuses on any row it
   cannot parse. Duplicate source ids also refuse: a payload that cannot be uniquely keyed cannot be proven
   non-double-applied.
3. **Record the applied-stage sets** for the durable plane **before** applying anything. The verification is
   bound to this pre-state — without it there is no baseline and nothing can be proven.
4. **Apply** the planned entries to the durable plane.
5. **Record the applied-stage sets again**, after.
6. **Settle.** `evaluatePromotion({payloadEntries, appliedStagesBefore, appliedStagesAfter})` → the terminal
   and the receipt. Record both. (Today this returns `failed-contained` from the capability gate above,
   whatever you pass.)

> **There is no separate "plan" or "verify" step, deliberately.** `evaluatePromotion` takes the **source
> corpus** and derives the plan itself, then runs the continuity verification — rather than accepting either.
> Both were once arguments, and both were forgeable. A structurally complete continuity verdict is a thing a
> caller can simply type; and a self-consistent *plan* proved only that its own projection matched its own
> receipt, never that it was derived from the corpus it claimed to describe — a forged empty plan with a
> `targetStateDigest` computed from the real pre-state reconciled cleanly, landed nothing, and settled
> `committed`. Validating a claim's shape checks the shape, never the provenance.
>
> Deriving from the corpus removes both forgeable intermediates: a `committed` now needs a corpus whose every
> planned id appears in the after-state, which is *doing* the replay rather than claiming it. What it does
> **not** remove is the unknown denominator — hence the gate above.
>
> Concurrent gains from other seats are permitted and reported separately, not treated as corruption.

## Demotion

> ### ⚠️ `demoted-clean` is MECHANICALLY UNREACHABLE today, and that is the honest state
>
> The leak scan needs each durable segment's **plane id**. No producer for it exists: the WAL appender writes
> `{...record, segmentKey}` and carries no plane id, so nothing can distinguish an overlay-written segment
> from a natively-written one.
>
> `evaluateDemotion` therefore consults `OVERLAY_TAGGING_PRODUCER` **before it reads a single argument**, and
> while that constant is `null` **every demotion settles `failed-contained` regardless of what you pass.**
> This is a gate, not a validation: there is no input that unlocks a clean terminal.
>
> **That is deliberate, and it replaced two weaker attempts** — each of which asked the *caller* to assert
> the fact rather than establishing it. First a bare `[]` was accepted as "no leak". Then a named
> `planeIdSource` was required — but only checked for being a non-empty string, so an invented name unlocked
> `demoted-clean`. **Requiring a field is not proving a fact**, and a fabricable field is worse than none,
> because it makes an impossibility look satisfied.
>
> Do not try to satisfy the gate. A green terminal here would be false and its receipt would attest to
> nothing. When a producer lands, set the constant to name it: the validation and set-inclusion logic behind
> the gate is already written and directly tested, so opening the path is a one-line change with coverage in
> place.

The procedure below is what runs **once a producer exists**:

1. **Scan the durable corpus for overlay-tagged segments.** The evaluator requires a *structure*, not a
   list: `{planeIdSource, scannedSegmentCount, taggedSegments}`, and `planeIdSource` must **be** the
   substrate's producer rather than merely a non-empty string. A bare array is refused, because `[]` is
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
- **ADR-0027 OQ8** — the bound behind the promotion gate: journal replay has **no source authority**, and any
  later replay action requires a *complete ordered mutation source*. Count evidence never supplies row
  identity — which is the trap worth naming, because a count looks like a measurement. *"8,234 rows replayed"*
  is a true sentence that establishes nothing about **which** rows. `pilotPlaneTerminal` defers to this
  citation rather than repeating it in JSDoc, so the reference has one maintained home instead of decaying
  copies in code.
- **D#15758 Option G** reaches the same shape for cloud cohorts, phrased as *"post-mutation but
  reversible-by-proof"*. It is an **unadopted divergence row** in an open divergence window, so it is
  cited here as converging evidence and never as a source of authority. If that Discussion adopts a
  different option, nothing in this runbook needs retracting.
