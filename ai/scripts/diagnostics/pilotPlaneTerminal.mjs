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
 * Consumes `verifyReplayContinuity`'s verdict rather than re-deriving continuity, because that verifier is
 * bound to the pre-state digest and the receipted plan, and can therefore distinguish a genuine replay
 * from a double-apply or a drained work list. Re-deriving it here would produce a second opinion with less
 * evidence.
 * @param {Object} spec
 * @param {Object} spec.continuity `verifyReplayContinuity(...)` output, receipt included.
 * @returns {Object} `{terminal, reason, eligibility, receipt}`
 */
export function evaluatePromotion(spec) {
    // Nullish-coalesced rather than a `= {}` default parameter, which fires only for `undefined` and would
    // let `evaluatePromotion(null)` THROW. A throw is an exit without a terminal — the exact silent abandon
    // this module exists to make impossible — so the guard has to cover null too.
    const {continuity} = spec ?? {};

    if (!continuity || typeof continuity !== 'object') {
        return settle(
            'failed-contained',
            'no continuity verdict was supplied, so the replay cannot be proven. A promotion that died ' +
            'mid-replay reaches this branch identically to a mis-wired caller — both are unprovable, and ' +
            'the governing rule settles unprovable as contained.'
        );
    }

    if (!continuity.ok) {
        return settle('failed-contained', `continuity verification refused: ${continuity.reason ?? 'no reason given'}`);
    }

    // `ok` alone is not the claim being relied on; monotonicity is. Trusting `ok` and ignoring `monotonic`
    // would let a verdict that verified *something* stand in for one that excluded loss and double-apply.
    if (continuity.monotonic !== true) {
        return settle(
            'failed-contained',
            'continuity verdict did not assert monotonic replay, so loss or double-apply is not excluded'
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
 * ## Why a bare array is refused
 *
 * An earlier shape took `durableOverlayTaggedSegments` as an array and treated `[]` as "no leak". But `[]`
 * is indistinguishable from "nobody looked", and — more seriously — **the current substrate cannot produce
 * this scan at all**: WAL records carry a `segmentKey` but no plane id, so there is nothing to match an
 * overlay against. Accepting `[]` therefore let a caller claim a scan that cannot be performed, which is
 * worse than having no check: it converts a missing capability into a clean bill of health.
 *
 * So the scan must arrive as a structure that states **how** it was performed. Until WAL segments carry a
 * plane id, no honest caller can populate `planeIdSource`, and demotion settles `failed-contained` — which
 * is the correct terminal for an unprovable claim, and names the missing producer as the blocker rather
 * than papering over it.
 * @param {Object} overlayScan
 * @returns {String|null}
 */
function validateOverlayScan(overlayScan) {
    if (Array.isArray(overlayScan)) {
        return 'overlayScan must be an object describing HOW the durable corpus was scanned for ' +
               'overlay-tagged segments, not a bare array. An empty array is indistinguishable from "nobody ' +
               'looked", and the plane-id producer this scan needs does not exist yet: WAL records carry a ' +
               'segmentKey but no plane id. Passing [] would claim a scan the substrate cannot perform.';
    }

    if (!overlayScan || typeof overlayScan !== 'object') {
        return 'overlayScan is absent. An unscanned durable plane is unproven, not clean — the distinction ' +
               'this argument exists to force.';
    }

    const {planeIdSource, scannedSegmentCount, taggedSegments} = overlayScan;

    if (typeof planeIdSource !== 'string' || planeIdSource.trim() === '') {
        return 'overlayScan.planeIdSource must name where each durable segment\'s plane id was read from. ' +
               'No such producer exists today — WAL records carry a segmentKey but no plane id — so this ' +
               'refusal is the honest terminal for a demotion, and the blocker is the missing producer, ' +
               'not the caller.';
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
 * @param {Object} spec
 * @param {Object} spec.overlayScan        `{planeIdSource, scannedSegmentCount, taggedSegments}` — see
 *        {@link validateOverlayScan}. REQUIRED as a structure, because a bare empty array claims a scan
 *        the substrate cannot currently perform.
 * @param {String[]} spec.preCloneSegmentIds  Durable segment ids recorded at clone time.
 * @param {String[]} spec.postPilotSegmentIds Durable segment ids at demotion.
 * @returns {Object} `{terminal, reason, eligibility, receipt}`
 */
export function evaluateDemotion(spec) {
    // See `evaluatePromotion`: nullish-coalesced so a null argument settles contained instead of throwing.
    const {overlayScan, preCloneSegmentIds, postPilotSegmentIds} = spec ?? {};
    const scanFault                                              = validateOverlayScan(overlayScan);

    if (scanFault) return settle('failed-contained', scanFault);

    for (const [label, value] of [['preCloneSegmentIds', preCloneSegmentIds], ['postPilotSegmentIds', postPilotSegmentIds]]) {
        if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || id === '')) {
            return settle(
                'failed-contained',
                `${label} must be an array of non-empty segment id strings. Counts cannot prove that no ` +
                'committed history was lost — a delete-and-add keeps cardinality identical — so identity is ' +
                'required.'
            );
        }
    }

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

    const postSet = new Set(postPilotSegmentIds),
          lost    = preCloneSegmentIds.filter(id => !postSet.has(id));

    if (lost.length > 0) {
        return settle(
            'failed-contained',
            `${lost.length} pre-clone segment(s) are no longer present in the durable corpus (e.g. ` +
            `${lost[0]}). Concurrent writers explain growth, never loss, so committed history went missing ` +
            'and the demotion cannot be called clean.',
            {lostSegmentTotal: lost.length, lostSample: lost.slice(0, 5)}
        );
    }

    const gained = postPilotSegmentIds.filter(id => !preCloneSegmentIds.includes(id));

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
            concurrentGainTotal: gained.length,
            overlayTaggedTotal : 0,
            planeIdSource      : overlayScan.planeIdSource,
            scannedSegmentCount: overlayScan.scannedSegmentCount
        }
    );
}
