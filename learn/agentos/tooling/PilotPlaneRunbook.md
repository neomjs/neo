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
| `demoted-clean` | No overlay-stamped or provenance-unknown cutover-window write reached the durable corpus; no committed history lost | `unchanged` | ✅ through the invoked dual-WAL provenance producer |
| `failed-contained` | The claim could not be proven, whatever the cause | `denied` | ✅ |

Demotion now has a **producer of fact**: both accepted-write services pass resolved `AiConfig.plane.id`,
both WAL appenders stamp it after caller fields, and `evaluateDemotion` invokes strict readers owned by
the memory and message stores. Promotion remains closed because a complete ordered mutation-source actor
still does not exist. The distinction is source authority, not stronger validation: a caller cannot submit
an `overlayScan`, and no receipt-shaped argument can open `committed`.

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
> 2. **Strict store readers now exist, but no actor consumes them as a complete source.** Operational reads
>    still correctly skip malformed/torn rows; each store now also owns a strict provenance reader for
>    demotion. Promotion still lacks the actor that resolves both configured roots, fences writers, consumes
>    every strict row, and binds content digests.
> 3. **The plane has two WAL families.** `messageWal.dir` derives to `path.join(memoryWal.dir, 'messages')`
>    by default but may be explicitly relocated. `deriveDualCorpusReplayReceipt` now keeps memory
>    (`embedded + graph`) and message (`graph`) records distinct and binds exact ids plus source/target plane
>    identities; no invoked executor yet proves that those arrays were the complete configured plane.
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
> Demotion demonstrates the required shape: it invokes the producer and owns the scan. Promotion has no
> branch because its complete source-and-replay actor is still missing.
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
6. **Bind the component receipt.** `deriveDualCorpusReplayReceipt(...)` verifies separate memory/message
   continuity, exact record sets, and source/target plane identities. It deliberately emits no terminal.
7. **Settle only through the future invoked actor.** `evaluatePromotion()` still returns
   `failed-contained`; it accepts no observations until that actor owns the complete source and target reads.

> **There is no caller-supplied plan or verification verdict, deliberately.** The component helpers derive
> the plan from each source corpus and run continuity verification internally. Both intermediates were once
> arguments, and both were forgeable. A structurally complete continuity verdict is a thing a caller can
> simply type; and a self-consistent *plan* proved only that its own projection matched its own receipt, never
> that it was derived from the corpus it claimed to describe.
>
> Deriving from the corpus removes both forgeable intermediates. What it does **not** remove is the unknown
> denominator — hence `evaluatePromotion()` remains unconditionally contained.
>
> Concurrent gains from other seats are permitted and reported separately, not treated as corruption.

## Demotion

Newly accepted memory and message WAL records carry immutable `planeId` provenance:

- `MemoryService` / `MailboxService` supply resolved `AiConfig.plane.id`;
- the store validates it and serializes `{...record, segmentKey, planeId}`, so a caller field loses;
- missing/invalid identities reject before append;
- operational readers surface an absent historical field as `unknown` without rewriting the file.

The demotion procedure is now:

1. **Invoke the producer.** `evaluateDemotion` takes the two configured WAL roots, overlay plane id,
   cutover start, and clone-time segment ids. It does **not** accept `overlayScan` or post-pilot ids.
2. **Strictly scan both WAL families.** Store-owned readers refuse malformed/torn rows. The producer retains
   exact memory/message record sets and obtains post-pilot segment ids from the scan itself.
3. **Bound legacy ignorance.** An unstamped record proven older than `cutoverStartedAt` is reported as legacy
   context. An unknown identity inside the window—or an unknown timestamp that cannot prove it predates the
   window—forces `failed-contained`.
4. **Reject overlay writes.** Any in-window record stamped with the overlay plane id names its containing
   segment and forces `failed-contained`. Concurrent canonical-plane writes are allowed and counted.
5. **Prove no segment loss.** Clone-time ids must remain a subset of the producer-observed post-pilot ids.
   Cardinality is not identity: `3 → 3` can hide delete-and-add.
6. **Retire the overlay** only on `demoted-clean`.

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
