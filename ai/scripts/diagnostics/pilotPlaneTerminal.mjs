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
 * No entry point takes a `terminal` argument. If a caller could pass one, the receipt would attest to
 * the caller's belief rather than to the evidence, and an audit trail whose facts are caller-supplied
 * proves nothing it did not already assume.
 *
 * ## Unprovable settles contained — including malformed input
 *
 * Every other module in this leaf *refuses* on bad input. This one must not, because **a refusal is the
 * silent abandon.** A promotion that died mid-replay produces exactly the same thing a typo does —
 * absent or malformed evidence — and the governing rule is stated over provability, not over intent:
 * once promotion has begun the safe direction is forward completion, and if reconciliation cannot prove
 * it, the run settles `failed-contained`, quarantines, and leaves eligibility denied.
 *
 * So unprovable resolves to `failed-contained` whatever the cause. That direction fails safe (a
 * mistyped key denies eligibility rather than granting it), and the `reason` string still distinguishes
 * the cases for the human who has to act.
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
 * - `committed`      — promotion replayed onto the durable plane with continuity proven.
 * - `demoted-clean`  — pilot ended with no overlay write proven to have reached the durable plane.
 * - `failed-contained` — the claim could not be proven; the overlay is quarantined, not deleted, and
 *                        data-consuming eligibility stays closed until a human attributes the gap.
 * @type {String[]}
 */
export const PILOT_TERMINALS = Object.freeze(['committed', 'demoted-clean', 'failed-contained']);

/**
 * @summary True when a terminal permits data-consuming services to treat the durable plane as authoritative.
 *
 * `committed` per the committed-only rule. `demoted-clean` also qualifies, and that is an
 * application of the same rule rather than a widening of it: a clean demotion is a run whose mutation
 * set against the durable plane is **empty**, so there is no promoted state whose consumption could be
 * unsafe. `failed-contained` denies, which is the whole point of naming it.
 * @param {String} terminal
 * @returns {Boolean}
 */
export function isEligibilityOpen(terminal) {
    return terminal === 'committed' || terminal === 'demoted-clean';
}

/**
 * @summary Builds a terminal record. Internal, so `terminal` can never arrive from a caller.
 * @param {String} terminal
 * @param {String} reason
 * @param {Object} [receipt]
 * @returns {Object}
 */
function settle(terminal, reason, receipt = null) {
    return {terminal, reason, eligibilityOpen: isEligibilityOpen(terminal), receipt};
}

/**
 * @summary Settles a promotion: pilot writes replayed onto the durable plane.
 *
 * Promotion **mutates the durable plane**, which is what makes it the forward-only branch — once replay
 * has begun there is no rollback to offer, so the only honest terminals are "continuity proven" and
 * "contained".
 *
 * Consumes `verifyReplayContinuity`'s verdict (AC3) rather than re-deriving continuity, because that
 * verifier is already bound to the pre-state digest and can therefore distinguish a genuine replay from
 * a double-apply. Re-deriving it here would produce a second opinion with less evidence.
 * @param {Object} spec
 * @param {Object} spec.continuity `verifyReplayContinuity(...)` output.
 * @returns {Object} `{terminal, reason, eligibilityOpen, receipt}`
 */
export function evaluatePromotion(spec) {
    // Nullish-coalesced rather than a `= {}` default parameter, which fires only for `undefined` and
    // would let `evaluatePromotion(null)` THROW. A throw is an exit without a terminal — the exact
    // silent abandon this module exists to make impossible — so the guard has to cover null too.
    const {continuity} = spec ?? {};

    if (!continuity || typeof continuity !== 'object') {
        return settle(
            'failed-contained',
            'no continuity verdict was supplied, so the replay cannot be proven. A promotion that died ' +
            'mid-replay reaches this branch identically to a mis-wired caller — both are unprovable, and ' +
            'ADR-0027 settles unprovable as contained.'
        );
    }

    if (!continuity.ok) {
        return settle(
            'failed-contained',
            `continuity verification refused: ${continuity.reason ?? 'no reason given'}`
        );
    }

    // Belt-and-braces against a hand-built or partially-populated verdict: `ok` alone is not the claim
    // being relied on here, `monotonic` is. Trusting `ok` and ignoring `monotonic` would let a verdict
    // that verified *something* stand in for one that verified no-loss-no-double-apply.
    if (continuity.monotonic !== true) {
        return settle(
            'failed-contained',
            'continuity verdict did not assert monotonic replay, so loss or double-apply is not excluded'
        );
    }

    return settle('committed', 'replay onto the durable plane verified monotonic', continuity.receipt ?? null);
}

/**
 * @summary Settles a demotion: the pilot ends and the overlay is retired.
 *
 * ## Why this does NOT compare durable-plane fingerprints
 *
 * The obvious proof — re-fingerprint the durable plane and require it to equal `preCloneFingerprint` —
 * is wrong, and wrong in the direction that looks rigorous. **The durable plane has other writers:** the
 * pilot occupies one seat for one-to-two weeks while the rest of the institution keeps writing. Its
 * digest is therefore *expected* to move, so an equality check would report `failed-contained` on every
 * healthy demotion, and an instrument that fails on the happy path gets disabled rather than believed.
 *
 * The decidable claim is narrower and is the one that actually matters: **no overlay-tagged segment
 * reached the durable plane.** That is independent of how much other seats wrote, which is precisely why
 * it survives a real pilot.
 *
 * Nothing-lost is checked as well, since a *shrinking* durable corpus is not explainable by concurrent
 * writers and means something removed committed history.
 * @param {Object} spec
 * @param {String[]} spec.durableOverlayTaggedSegments Segments found in the durable corpus bearing the
 *        overlay `planeId`. Expected empty. REQUIRED — absent means unscanned, and unscanned is
 *        unproven, not clean.
 * @param {Number} spec.preCloneSegmentCount  Durable segment count recorded at clone time.
 * @param {Number} spec.postPilotSegmentCount Durable segment count at demotion.
 * @returns {Object} `{terminal, reason, eligibilityOpen, receipt}`
 */
export function evaluateDemotion(spec) {
    // See `evaluatePromotion`: nullish-coalesced so a null argument settles contained instead of throwing.
    const {durableOverlayTaggedSegments, preCloneSegmentCount, postPilotSegmentCount} = spec ?? {};

    if (!Array.isArray(durableOverlayTaggedSegments)) {
        return settle(
            'failed-contained',
            'durableOverlayTaggedSegments must be an array (empty when the scan found no overlay-tagged ' +
            'segment in the durable corpus). It is absent, and an unscanned durable plane is unproven, ' +
            'not clean — the distinction this argument exists to force.'
        );
    }

    const counted = [preCloneSegmentCount, postPilotSegmentCount].every(
        value => typeof value === 'number' && Number.isInteger(value) && value >= 0
    );

    if (!counted) {
        return settle(
            'failed-contained',
            `segment counts must both be non-negative integers, received ` +
            `${JSON.stringify(preCloneSegmentCount)} and ${JSON.stringify(postPilotSegmentCount)}`
        );
    }

    if (durableOverlayTaggedSegments.length > 0) {
        return settle(
            'failed-contained',
            `${durableOverlayTaggedSegments.length} overlay-tagged segment(s) found in the durable ` +
            `corpus, so an overlay write reached the durable plane: ` +
            `${durableOverlayTaggedSegments.slice(0, 5).join(', ')}. Quarantine the overlay rather than ` +
            'deleting it — it is the only remaining evidence of what leaked.',
            {overlayTaggedTotal: durableOverlayTaggedSegments.length}
        );
    }

    if (postPilotSegmentCount < preCloneSegmentCount) {
        return settle(
            'failed-contained',
            `durable corpus shrank from ${preCloneSegmentCount} to ${postPilotSegmentCount} segment(s). ` +
            'Concurrent writers explain growth, never loss, so committed history went missing and the ' +
            'demotion cannot be called clean.',
            {preCloneSegmentCount, postPilotSegmentCount}
        );
    }

    return settle(
        'demoted-clean',
        'no overlay-tagged segment reached the durable corpus and no committed history was lost',
        {
            preCloneSegmentCount,
            postPilotSegmentCount,
            // Reported rather than asserted about: this is other seats' work, and the number is here so a
            // reader can sanity-check that a pilot-length window of institutional writing actually shows up.
            concurrentGrowth  : postPilotSegmentCount - preCloneSegmentCount,
            overlayTaggedTotal: 0
        }
    );
}
