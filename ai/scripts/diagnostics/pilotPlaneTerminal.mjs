/**
 * @module ai/scripts/diagnostics/pilotPlaneTerminal
 * @summary Derives the named terminal of a pilot-plane promotion or demotion, so a pilot can never end
 * in a silent abandon and an unprovable run holds data-consuming eligibility closed.
 *
 * ## Why a module and not just a runbook
 *
 * A runbook step that reads *"if you cannot prove continuity, record `failed-contained`"* is prose, and
 * prose is discretionary at exactly the moment discretion is worst: the operator is tired, the pilot is
 * over, and the tempting move is to delete the overlay and move on. The terminal therefore has to be
 * **derived from evidence by something that cannot be talked out of it**, and the runbook's job shrinks
 * to *"run this and record what it returns."*
 *
 * ## The terminal is derived, never accepted
 *
 * No entry point takes a `terminal` argument. If a caller could pass one, the receipt would attest to the
 * caller's belief rather than to the evidence. The same reasoning applies one level down and is why an
 * earlier shape of this module was wrong: accepting `{ok: true, monotonic: true}` as proof of replay let
 * two caller-set booleans stand in for a verifier's receipt. Evidence means a **structurally validated
 * receipt**, not a claim about one.
 *
 * ## Unprovable settles contained — including malformed input
 *
 * Every other module in this leaf *refuses* on bad input. This one must not, because **a refusal is the
 * silent abandon.** A promotion that died mid-replay produces exactly the same thing a typo does — absent
 * or malformed evidence — and the governing rule is stated over provability, not over intent: once
 * promotion has begun the safe direction is forward completion, and if reconciliation cannot prove it, the
 * run settles `failed-contained`, quarantines, and leaves eligibility denied.
 *
 * So unprovable resolves to `failed-contained` whatever the cause. That direction fails safe (a mistyped
 * key denies eligibility rather than granting it), and the `reason` string still distinguishes the cases
 * for the human who has to act.
 *
 * ## Eligibility is three-valued, not a boolean
 *
 * A boolean conflated two different facts and contradicted the governing rule, which reserves *opening*
 * data-consuming eligibility for strict `committed` alone. A clean demotion does not **open** eligibility —
 * it never closed it, because the pilot never mutated the durable plane. Modelling that as `unchanged`
 * keeps the strictness intact instead of quietly widening it.
 *
 * ## Where the authority is recorded
 *
 * `learn/agentos/tooling/PilotPlaneRunbook.md` carries the provenance — which rule is adopted, which
 * converging proposal is not yet adopted, and permalinks to both. It lives there rather than here so a
 * reader gets one citation that is maintained, instead of decaying references scattered through code.
 */

import {planWalReplay, verifyReplayContinuity} from './walReplayPlan.mjs';

/**
 * Whether the substrate can attribute a durable WAL segment to the plane that wrote it.
 *
 * **`null` because no such producer exists.** The WAL appender writes `{...record, segmentKey}` and carries
 * no plane id, and nothing downstream supplies one — so no scan can distinguish an overlay-written segment
 * from a natively-written one.
 *
 * This is a **constant, not a parameter**, and that is the point. An earlier shape asked the caller to name
 * a `planeIdSource`, which only checked that a *string was present* — so an invented one unlocked
 * `demoted-clean`. Requiring a field is not proving a fact, and the fabricable field was worse than no
 * check because it made the impossibility look satisfied. Holding the capability here makes clean demotion
 * **mechanically unreachable** until a real producer lands, whatever a caller passes.
 *
 * When a producer exists, set this to a string naming it. The validation and set-inclusion logic behind the
 * gate is already written and directly tested, so opening the path is a one-line change with coverage
 * already in place.
 * @type {String|null}
 */
export const OVERLAY_TAGGING_PRODUCER = null;

/**
 * The complete terminal set. A pilot transition ends in exactly one of these — there is no unnamed exit.
 *
 * - `committed`      — promotion replayed onto the durable plane with continuity proven by a receipt.
 * - `demoted-clean`  — pilot ended with no overlay write proven to have reached the durable plane.
 * - `failed-contained` — the claim could not be proven; the overlay is quarantined, not deleted, and
 *                        data-consuming eligibility stays closed until a human attributes the gap.
 * @type {String[]}
 */
export const PILOT_TERMINALS = Object.freeze(['committed', 'demoted-clean', 'failed-contained']);

/**
 * How a terminal affects data-consuming eligibility for the durable plane.
 *
 * `opened` is reserved for `committed`, per the governing rule that only a strict commit opens eligibility.
 * `unchanged` says the pilot never mutated the plane, so there was nothing to open. `denied` is the point
 * of naming `failed-contained` at all.
 * @type {Object}
 */
export const ELIGIBILITY_EFFECT = Object.freeze({
    'committed'       : 'opened',
    'demoted-clean'   : 'unchanged',
    'failed-contained': 'denied'
});

/**
 * @summary The eligibility effect of a terminal, or `denied` for anything unrecognised.
 *
 * Fails closed on an unknown terminal so a future addition cannot silently inherit consumption rights.
 * @param {String} terminal
 * @returns {String} `'opened' | 'unchanged' | 'denied'`
 */
export function eligibilityEffect(terminal) {
    return ELIGIBILITY_EFFECT[terminal] ?? 'denied';
}

/**
 * @summary Builds a terminal record. Internal, so `terminal` can never arrive from a caller.
 * @param {String} terminal
 * @param {String} reason
 * @param {Object} [receipt]
 * @returns {Object}
 */
function settle(terminal, reason, receipt = null) {
    return {terminal, reason, eligibility: eligibilityEffect(terminal), receipt};
}

/**
 * @summary Validates that a continuity verdict carries a structurally complete receipt.
 *
 * Returns a refusal reason, or `null` when the receipt is usable. Checking the receipt rather than the
 * verdict's boolean flags is the whole point: `{ok: true, monotonic: true}` is two assertions a caller can
 * type, whereas a receipt naming its stages, its planned total, and its per-stage applied counts is a
 * structure only a real verification run produces.
 * @param {Object} continuity
 * @returns {String|null}
 */
function validateContinuityReceipt(continuity) {
    const {receipt} = continuity;

    if (!receipt || typeof receipt !== 'object') {
        return 'continuity verdict carries no receipt. A promotion terminal must rest on the verifier\'s ' +
               'receipt, not on its boolean flags — two caller-set booleans are not evidence, and the ' +
               'acceptance criterion requires the terminal to END IN a continuity receipt.';
    }

    const {requiredStages, plannedTotal, appliedByStage} = receipt;

    if (!Array.isArray(requiredStages) || requiredStages.length === 0) {
        return 'continuity receipt names no required stages, so there is nothing it can attest to';
    }

    if (!Number.isInteger(plannedTotal) || plannedTotal < 0) {
        return `continuity receipt has no usable plannedTotal (${JSON.stringify(plannedTotal)})`;
    }

    if (!appliedByStage || typeof appliedByStage !== 'object') {
        return 'continuity receipt carries no per-stage applied counts';
    }

    for (const stage of requiredStages) {
        const applied = appliedByStage[stage];

        if (!Number.isInteger(applied) || applied < 0) {
            return `continuity receipt has no usable applied count for stage "${stage}" ` +
                   `(${JSON.stringify(applied)}) — a stage the receipt cannot account for is not proven`;
        }
    }

    return null;
}

/**
 * @summary Settles a promotion: pilot writes replayed onto the durable plane.
 *
 * Promotion **mutates the durable plane**, which is what makes it the forward-only branch — once replay
 * has begun there is no rollback to offer, so the only honest terminals are "continuity proven by a
 * receipt" and "contained".
 *
 * ## Why this PLANS as well as verifies
 *
 * An earlier shape accepted a caller-supplied plan and reconciled it against its own receipt. That proved
 * **internal self-consistency, not provenance** — a fully self-consistent *empty* plan
 * (`toApply: []`, `plannedIdsByStage: {embedded: [], graph: []}`, a `targetStateDigest` computed from the
 * real pre-state) reconciled cleanly, landed nothing, lost nothing, and settled `committed`. A fabricated
 * "there was nothing to do" was indistinguishable from a genuine no-op.
 *
 * So the plan is now **derived here from the source corpus**. There is no plan argument to forge: the only
 * inputs are the payload entries and the two observed stage states, and forging a commit would require
 * supplying a corpus whose every planned id appears in the after-state — which is performing the replay.
 *
 * An **empty corpus refuses**. Nothing to replay is not a promotion that moved nothing; it is not a
 * promotion. Certifying it would reintroduce the zero-effect certification this leaf exists to prevent, one
 * layer up from where the reviewer first found it.
 * @param {Object} spec
 * @param {Object[]} spec.payloadEntries      Parsed WAL records from the SOURCE plane — the authority.
 * @param {Object} spec.appliedStagesBefore   `{<stage>: Set}` observed before replay.
 * @param {Object} spec.appliedStagesAfter    `{<stage>: Set}` observed after replay.
 * @param {String[]} [spec.requiredStages]    Stages a row must carry to count as applied.
 * @returns {Object} `{terminal, reason, eligibility, receipt}`
 */
export function evaluatePromotion(spec) {
    // Nullish-coalesced rather than a `= {}` default parameter, which fires only for `undefined` and would
    // let `evaluatePromotion(null)` THROW. A throw is an exit without a terminal — the exact silent abandon
    // this module exists to make impossible — so the guard has to cover null too.
    const {payloadEntries, appliedStagesBefore, appliedStagesAfter, requiredStages} = spec ?? {};

    if (!Array.isArray(payloadEntries)) {
        return settle(
            'failed-contained',
            'payloadEntries must be the source corpus this promotion replayed. A promotion terminal cannot ' +
            'accept a pre-built plan: a self-consistent plan proves only that its own projection matches its ' +
            'own receipt, never that it was derived from the corpus it claims to describe.'
        );
    }

    if (payloadEntries.length === 0) {
        return settle(
            'failed-contained',
            'the source corpus is empty, so there is nothing to promote. An empty replay is not a promotion ' +
            'that moved nothing — it is not a promotion, and certifying it would be the zero-effect ' +
            'certification this leaf exists to prevent.'
        );
    }

    // THE PLAN IS DERIVED, NOT ACCEPTED. `planWalReplay` refuses duplicate source ids and unusable ids, and
    // returns a frozen plan whose receipt is computed from THIS corpus against THIS pre-state.
    const plan = planWalReplay({
        payloadEntries,
        appliedStages: appliedStagesBefore,
        ...(requiredStages ? {requiredStages} : {})
    });

    if (!plan.ok) {
        return settle('failed-contained', `the corpus could not be planned: ${plan.reason ?? 'no reason given'}`);
    }

    // THE VERIFICATION RUNS HERE. An earlier shape accepted `verifyReplayContinuity`'s OUTPUT, and a
    // structurally complete receipt is a thing a caller can simply type — validating its shape checked the
    // shape of a claim, never its provenance. Calling the verifier removes the forgeable intermediate
    // entirely: the only remaining input is the plan plus the observed before/after states, and the verifier
    // binds those to each other (pre-state digest, receipted planned work, monotonic post-state). Forging a
    // `committed` now requires constructing a self-consistent plan whose planned ids all appear in the
    // after-state — which is doing the replay, not claiming it.
    const continuity = verifyReplayContinuity({appliedStagesBefore, appliedStagesAfter, plan});

    if (!continuity.ok) {
        return settle('failed-contained', `continuity verification refused: ${continuity.reason ?? 'no reason given'}`);
    }

    // Belt-and-braces on the verifier's own contract rather than on a caller's assertion: if a future change
    // let it return `ok` without establishing monotonicity, this must not silently become a commit.
    if (continuity.monotonic !== true) {
        return settle(
            'failed-contained',
            'continuity verification did not establish monotonic replay, so loss or double-apply is not excluded'
        );
    }

    const receiptFault = validateContinuityReceipt(continuity);

    if (receiptFault) return settle('failed-contained', receiptFault);

    return settle(
        'committed',
        `replay onto the durable plane verified monotonic across ${continuity.receipt.requiredStages.join(' + ')}`,
        continuity.receipt
    );
}

/**
 * @summary Validates the overlay-leak scan and returns a refusal reason, or `null`.
 *
 * Exported so the logic behind the capability gate stays directly testable with positive controls. It is
 * deliberately **not** the thing that decides a terminal: while {@link OVERLAY_TAGGING_PRODUCER} is `null`
 * no caller can reach this at all, because a well-formed scan structure is still only a *claim* that a scan
 * happened. Shape is checkable; provenance is not.
 * @param {Object} overlayScan `{planeIdSource, scannedSegmentCount, taggedSegments}`
 * @returns {String|null}
 */
export function validateOverlayScan(overlayScan) {
    if (Array.isArray(overlayScan)) {
        return 'overlayScan must be an object describing HOW the durable corpus was scanned for ' +
               'overlay-tagged segments, not a bare array. An empty array is indistinguishable from "nobody ' +
               'looked".';
    }

    if (!overlayScan || typeof overlayScan !== 'object') {
        return 'overlayScan is absent. An unscanned durable plane is unproven, not clean — the distinction ' +
               'this argument exists to force.';
    }

    const {planeIdSource, scannedSegmentCount, taggedSegments} = overlayScan;

    if (typeof planeIdSource !== 'string' || planeIdSource.trim() === '') {
        return 'overlayScan.planeIdSource must name where each durable segment\'s plane id was read from';
    }

    // The producer is the authority on what a valid source IS. A caller-invented name is not one, which is
    // why this comparison exists rather than a mere non-empty-string check: the earlier shape accepted any
    // string, so an invented source unlocked a clean terminal.
    if (planeIdSource !== OVERLAY_TAGGING_PRODUCER) {
        return `overlayScan.planeIdSource "${planeIdSource}" is not the substrate's plane-id producer ` +
               `(${JSON.stringify(OVERLAY_TAGGING_PRODUCER)}). A source the substrate does not provide is an ` +
               'invented one, and naming a field is not producing the fact it claims.';
    }

    if (!Number.isInteger(scannedSegmentCount) || scannedSegmentCount < 0) {
        return `overlayScan.scannedSegmentCount must be a non-negative integer, received ` +
               `${JSON.stringify(scannedSegmentCount)} — a scan that cannot say how much it examined is ` +
               'not a scan.';
    }

    if (!Array.isArray(taggedSegments)) {
        return 'overlayScan.taggedSegments must be an array (empty when the scan found no overlay-tagged segment)';
    }

    return null;
}

/**
 * @summary Compares pre-clone and post-pilot segment id sets, returning `{lost, gained}` or a refusal reason.
 *
 * Exported for direct testing behind the capability gate. **Identity, not cardinality:** `3 → 3` looks stable
 * while a delete-old-and-add-new has destroyed committed history, so the claim "no committed history was
 * lost" is set inclusion over every pre-clone id and nothing weaker.
 * @param {String[]} preCloneSegmentIds
 * @param {String[]} postPilotSegmentIds
 * @returns {Object} `{reason}` or `{lost, gained}`
 */
export function diffSegmentIdentity(preCloneSegmentIds, postPilotSegmentIds) {
    for (const [label, value] of [['preCloneSegmentIds', preCloneSegmentIds], ['postPilotSegmentIds', postPilotSegmentIds]]) {
        if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || id === '')) {
            return {
                reason: `${label} must be an array of non-empty segment id strings. Counts cannot prove that ` +
                        'no committed history was lost — a delete-and-add keeps cardinality identical — so ' +
                        'identity is required.'
            };
        }
    }

    const postSet = new Set(postPilotSegmentIds),
          preSet  = new Set(preCloneSegmentIds);

    return {
        lost  : preCloneSegmentIds.filter(id => !postSet.has(id)),
        gained: postPilotSegmentIds.filter(id => !preSet.has(id))
    };
}

/**
 * @summary Settles a demotion: the pilot ends and the overlay is retired.
 *
 * ## Why this compares segment IDENTITY, not fingerprints and not counts
 *
 * Two weaker proofs were tried and both are wrong:
 *
 * **A durable-plane fingerprint equality check** fails on the happy path. The durable plane has *other
 * writers* — the pilot occupies one seat for one to two weeks while the institution keeps writing — so its
 * digest is *expected* to move. Equality would report `failed-contained` on every healthy demotion, and an
 * instrument that fails when nothing is wrong gets switched off rather than believed.
 *
 * **Segment counts** are weaker still: cardinality is not identity. `1 → 1` looks stable while a
 * delete-old-and-add-new has silently destroyed committed history. So the check is **set inclusion** — every
 * pre-clone segment must still be present by id — which is what "no committed history was lost" actually
 * asserts. Growth beyond that is other seats' work and is reported, not judged.
 * ## `demoted-clean` is currently unreachable, by construction
 *
 * The **capability gate fires first**, before any caller input is consulted. While
 * {@link OVERLAY_TAGGING_PRODUCER} is `null` there is no honest scan, so no argument combination can produce
 * a clean terminal. An earlier shape asked the caller to *name* a `planeIdSource` and only checked that a
 * string was present — so an invented name unlocked `demoted-clean`. **Requiring a field is not proving a
 * fact**, and a fabricable field is worse than no field, because it makes an impossibility look satisfied.
 * @param {Object} spec
 * @param {Object} spec.overlayScan           `{planeIdSource, scannedSegmentCount, taggedSegments}`.
 * @param {String[]} spec.preCloneSegmentIds  Durable segment ids recorded at clone time.
 * @param {String[]} spec.postPilotSegmentIds Durable segment ids at demotion.
 * @returns {Object} `{terminal, reason, eligibility, receipt}`
 */
export function evaluateDemotion(spec) {
    // THE CAPABILITY GATE, FIRST AND UNCONDITIONALLY. Placed ahead of every other check so that no
    // caller-supplied value is even read while the producer is absent: a gate that ran after input validation
    // would still let the shape of the input decide which refusal a reader sees, and the honest message here
    // is about the substrate, not about the caller.
    if (typeof OVERLAY_TAGGING_PRODUCER !== 'string' || OVERLAY_TAGGING_PRODUCER === '') {
        return settle(
            'failed-contained',
            'the substrate cannot attribute a durable WAL segment to the plane that wrote it: the WAL appender ' +
            'writes {...record, segmentKey} with no plane id, so no scan can distinguish an overlay-written ' +
            'segment from a natively-written one. A clean demotion is therefore UNPROVABLE, not merely ' +
            'unproven, and no argument can change that — the blocker is the missing producer. Quarantine the ' +
            'overlay and leave eligibility closed until one exists.'
        );
    }

    // See `evaluatePromotion`: nullish-coalesced so a null argument settles contained instead of throwing.
    const {overlayScan, preCloneSegmentIds, postPilotSegmentIds} = spec ?? {},
          scanFault                                              = validateOverlayScan(overlayScan);

    if (scanFault) return settle('failed-contained', scanFault);

    const {taggedSegments} = overlayScan;

    if (taggedSegments.length > 0) {
        return settle(
            'failed-contained',
            `${taggedSegments.length} overlay-tagged segment(s) found in the durable corpus, so an overlay ` +
            `write reached the durable plane: ${taggedSegments.slice(0, 5).join(', ')}. Quarantine the ` +
            'overlay rather than deleting it — it is the only remaining evidence of what leaked.',
            {overlayTaggedTotal: taggedSegments.length, planeIdSource: overlayScan.planeIdSource}
        );
    }

    const identity = diffSegmentIdentity(preCloneSegmentIds, postPilotSegmentIds);

    if (identity.reason) return settle('failed-contained', identity.reason);

    if (identity.lost.length > 0) {
        return settle(
            'failed-contained',
            `${identity.lost.length} pre-clone segment(s) are no longer present in the durable corpus (e.g. ` +
            `${identity.lost[0]}). Concurrent writers explain growth, never loss, so committed history went ` +
            'missing and the demotion cannot be called clean.',
            {lostSegmentTotal: identity.lost.length, lostSample: identity.lost.slice(0, 5)}
        );
    }

    return settle(
        'demoted-clean',
        `no overlay-tagged segment reached the durable corpus (scanned ${overlayScan.scannedSegmentCount} ` +
        `via ${overlayScan.planeIdSource}) and all ${preCloneSegmentIds.length} pre-clone segment(s) are ` +
        'still present',
        {
            preCloneSegmentTotal : preCloneSegmentIds.length,
            postPilotSegmentTotal: postPilotSegmentIds.length,
            // Reported rather than asserted about: this is other seats' work, and the number is here so a
            // reader can sanity-check that a pilot-length window of institutional writing shows up at all.
            concurrentGainTotal: identity.gained.length,
            overlayTaggedTotal : 0,
            planeIdSource      : overlayScan.planeIdSource,
            scannedSegmentCount: overlayScan.scannedSegmentCount
        }
    );
}
