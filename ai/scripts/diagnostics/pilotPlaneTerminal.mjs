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
 * ## Demotion now has an invoked producer; promotion remains closed
 *
 * Memory and message accepted-write boundaries now stamp the resolved plane identity after caller fields,
 * and their owning stores expose strict evidence readers. {@link evaluateDemotion} invokes both readers and
 * derives the scan itself, so `demoted-clean` is reachable only from durable provenance — never from a
 * caller-authored receipt.
 *
 * Promotion still has **no gate and no branch at all** — {@link evaluatePromotion} settles contained
 * unconditionally and takes no argument. A gate was tried there first and was wrong: type-checking a
 * capability proves it exists, never that it ran, so a no-op stub satisfied the check and handed caller
 * observations to the derivation behind it. Where a capability must *do* something rather than merely *be*
 * something, a conditional is a dormant success path pretending to be a guard.
 *
 * So clean demotion is now evidence-reachable while promotion remains honestly `failed-contained` until a
 * complete dual-corpus replay adapter owns the source denominator and target observations.
 *
 * ## Where the authority is recorded
 *
 * `learn/agentos/tooling/PilotPlaneRunbook.md` carries the provenance — which rule is adopted, which
 * converging proposal is not yet adopted, and permalinks to both. It lives there rather than here so a
 * reader gets one citation that is maintained, instead of decaying references scattered through code.
 * @plane in-plane
 */

import {UNKNOWN_PLANE_ID, isOpaquePlaneId}     from '../../planeConfig.mjs';
import {readMemoryWalProvenanceSegments}       from '../../services/memory-core/helpers/memoryWalStore.mjs';
import {readMessageWalProvenanceSegments}      from '../../services/memory-core/helpers/messageWalStore.mjs';
import {planWalReplay, verifyReplayContinuity} from './walReplayPlan.mjs';

/**
 * @summary Names the server-stamped durable source used by the demotion evidence producer.
 *
 * This is no longer a caller assertion. {@link produceOverlayScan} invokes the strict readers owned by the
 * memory and message WAL stores, and those readers surface the `planeId` written after caller fields at the
 * accepted-write boundary. `evaluateDemotion` invokes that producer itself; callers supply roots and the
 * cutover boundary, never a receipt-shaped scan.
 * @type {String}
 */
export const OVERLAY_TAGGING_PRODUCER = 'wal-record.planeId';

/**
 * Whether an executable producer exists that can replay the plane's complete mutation source.
 *
 * **`null` because no such producer exists**, and the audit that established this found five independent
 * reasons — each of which alone is disqualifying:
 *
 * 1. **No consumed source-read boundary.** An exact-tree search finds no production caller for
 *    `evaluatePromotion`, `planWalReplay`, `verifyReplayContinuity` or `parseJsonl`. There is no place in the
 *    running system that reads the source corpus and could issue a receipt for having read all of it.
 * 2. **The owning store readers cannot be promoted into that authority.** Their operational reads
 *    deliberately **skip** malformed and torn rows, which is correct for serving and fatal for a completeness
 *    proof: a promotion proof must *refuse* on a row it cannot parse, because an unreadable row is
 *    potentially the one that was lost.
 * 3. **The plane has TWO WAL families, and the corpus scan does not distinguish them.** `messageWal.dir`
 *    derives to `path.join(memoryWal.dir, 'messages')`, so `readWalSegments` returns memory and message
 *    segments in one undifferentiated list. Replay assumes `embedded + graph`; the message family is
 *    graph-only. A receipt bound to memory records alone would certify an **incomplete** plane. Worse, that
 *    family's `dirProd` is a nullable override, so a deployment can relocate it out of the scanned root —
 *    the denominator moves with configuration.
 * 4. **Naïve message replay emits stale wakes.** `MailboxService._projectMessageWalRecord` defaults
 *    `pumpWake = true`, and the codebase already knows this: its recovery path passes `pumpWake: false`
 *    explicitly. A replay reaching the default would re-fire historical wakes as if they were new.
 * 5. **There is no plane-wide writer fence.** During the audit the live memory corpus moved from 8,233 to
 *    8,234 rows *between two scans*. A stable double-read is not quiescence — the append lock is per-file and
 *    fail-open by design — so no scan can claim to have seen a whole plane.
 *
 * The governing bound is stated in the runbook's provenance section: journal replay has no source authority,
 * and count evidence never supplies row identity. Counts are the trap worth naming here, because they look
 * like measurement — `8,234 rows replayed` is a true sentence that establishes nothing about *which* rows.
 *
 * **This constant does not gate anything, and that is the correction.** {@link evaluatePromotion} does not read
 * it — the terminal is unconditionally contained. An earlier revision made it a gate via
 * `typeof PROMOTION_REPLAY_PRODUCER !== 'function'`, reasoning that a function slot was stronger than
 * {@link OVERLAY_TAGGING_PRODUCER}'s string slot because "a function cannot be forged by a name." That was
 * wrong: `typeof x === 'function'` is exactly as satisfiable-by-typing as `typeof x === 'string'`, so a no-op
 * stub passed the check and reopened the caller-owned path behind it. **Requiring a thing is not proving a
 * fact, whatever the thing's type.** The slot therefore documents a missing capability rather than guarding a
 * branch, because the honest number of reachable success paths today is zero, not one-behind-a-check.
 *
 * The producer that may replace this null must be **invoked**, and must **own the observations** it reports —
 * existing is not enough, and a caller handing in observations is the defect, not the interface. It has to
 * resolve both configured WAL roots, fence both source writers, have each owning store strictly enumerate its
 * own canonical payload files, bind per-family content and record digests, derive the memory and message plans
 * separately, replay messages without wake pumping or mutable-state overwrite, **observe the target before and
 * after itself**, and emit one composite receipt. Wiring it is therefore a deliberate change to
 * {@link evaluatePromotion}'s contract — not a constant flip, which is the whole point of leaving no branch for
 * a constant flip to open.
 * @type {Function|null}
 */
export const PROMOTION_REPLAY_PRODUCER = null;

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
export function evaluatePromotion() {
    // UNCONDITIONALLY CONTAINED. No branch, and NO PARAMETER — `spec` is not even accepted, because a
    // signature that reads caller observations is the thing being refused.
    //
    // An earlier shape of this repair wrote the gate as `if (typeof PROMOTION_REPLAY_PRODUCER !== 'function')`
    // and fell through to the derivation otherwise. The reviewer killed it in one line: **the producer was
    // type-checked but never invoked**, so any function-shaped stub — `() => {}` — passed the check and handed
    // caller-owned observations straight to `deriveReplayCompletion`, reopening the unknown denominator.
    //
    // That was the SAME defect one level up from the one this module already fixed once. The predecessor gate
    // asked a caller to name a `planeIdSource` and only checked a string was present; I replaced a string slot
    // with a function slot and argued a function "cannot be forged by a name." It can: `typeof x === 'function'`
    // is exactly as satisfiable-by-typing as `typeof x === 'string'`. Requiring a THING is not proving a FACT,
    // whatever the thing's type — and a conditional implies a reachable other branch, which was the lie.
    //
    // So there is no dormant success path to rot behind a check. When a real adapter lands it must be
    // **invoked** and must **own the observations** it reports; wiring that is a deliberate change to this
    // function's contract, not a constant flip. The math it will need is already proven — see
    // {@link deriveReplayCompletion}, which is exported and directly controlled precisely so that removing the
    // branch does not also remove the coverage.
    return settle(
        'failed-contained',
        'no complete dual-corpus replay producer exists, so a promotion cannot be certified at all. Without ' +
        'one, the source corpus is whatever a caller chose to pass, and any SUBSET of the real corpus verifies ' +
        'exactly as cleanly as the whole of it — a proof over an unknown denominator is not a proof. The plane ' +
        'also has two WAL families (memory and the nested message family, which is graph-only), no writer ' +
        'fence, and store readers that skip torn rows where a completeness proof must refuse. See ' +
        'PROMOTION_REPLAY_PRODUCER for the five findings and the adapter that would replace this null; it must ' +
        'be invoked and own its observations, not merely exist. The overlay is quarantined and eligibility ' +
        'stays denied — which is the true state of every promotion attempted today, not a failure of this call.'
    );
}

/**
 * @summary Derives whether a corpus's replay is provably complete — the math, carrying no authority.
 *
 * **Exported because the gate would otherwise hide it.** While {@link PROMOTION_REPLAY_PRODUCER} is `null`
 * nothing reaches this code through {@link evaluatePromotion}, and a gate that makes a path unreachable also
 * makes it unverifiable — a defect behind it is invisible to every test. That is not hypothetical: the sibling
 * capture module's post-gate block was left referencing four renamed variables, its suite stayed green because
 * the gate short-circuited first, and the reviewer found the `ReferenceError` only by forcing the capability on
 * in memory. So this is reachable directly and carries its own positive controls.
 *
 * **It is a component proof, not a terminal.** It returns `{ok, reason, receipt}` — no `terminal`, no
 * `eligibility`. It may prove that the planner and the continuity verifier agree; it must never mint
 * data-consuming eligibility, because agreeing about a corpus says nothing about whether that corpus was the
 * whole plane. Only {@link evaluatePromotion} converts this into a terminal, and only past the gate.
 * @param {Object} spec See {@link evaluatePromotion}.
 * @returns {Object} `{ok, reason, receipt?}`
 */
export function deriveReplayCompletion(spec) {
    // Nullish-coalesced rather than a `= {}` default parameter, which fires only for `undefined` and would
    // let `deriveReplayCompletion(null)` THROW. A throw is an exit without a verdict — the exact silent
    // abandon this module exists to make impossible — so the guard has to cover null too.
    const {payloadEntries, appliedStagesBefore, appliedStagesAfter, requiredStages} = spec ?? {};

    if (!Array.isArray(payloadEntries)) {
        return {
            ok    : false,
            reason: 'payloadEntries must be the source corpus this promotion replayed. A promotion terminal ' +
                    'cannot accept a pre-built plan: a self-consistent plan proves only that its own ' +
                    'projection matches its own receipt, never that it was derived from the corpus it claims ' +
                    'to describe.'
        };
    }

    if (payloadEntries.length === 0) {
        return {
            ok    : false,
            reason: 'the source corpus is empty, so there is nothing to promote. An empty replay is not a ' +
                    'promotion that moved nothing — it is not a promotion, and certifying it would be the ' +
                    'zero-effect certification this leaf exists to prevent.'
        };
    }

    // THE PLAN IS DERIVED, NOT ACCEPTED. `planWalReplay` refuses duplicate source ids and unusable ids, and
    // returns a frozen plan whose receipt is computed from THIS corpus against THIS pre-state.
    const plan = planWalReplay({
        payloadEntries,
        appliedStages: appliedStagesBefore,
        ...(requiredStages ? {requiredStages} : {})
    });

    if (!plan.ok) {
        return {ok: false, reason: `the corpus could not be planned: ${plan.reason ?? 'no reason given'}`};
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
        return {ok: false, reason: `continuity verification refused: ${continuity.reason ?? 'no reason given'}`};
    }

    // Belt-and-braces on the verifier's own contract rather than on a caller's assertion: if a future change
    // let it return `ok` without establishing monotonicity, this must not silently become a commit.
    if (continuity.monotonic !== true) {
        return {
            ok    : false,
            reason: 'continuity verification did not establish monotonic replay, so loss or double-apply is ' +
                    'not excluded'
        };
    }

    const receiptFault = validateContinuityReceipt(continuity);

    if (receiptFault) return {ok: false, reason: receiptFault};

    return {
        ok     : true,
        reason : `replay onto the durable plane verified monotonic across ${continuity.receipt.requiredStages.join(' + ')}`,
        receipt: continuity.receipt
    };
}

/**
 * @summary Verifies one WAL family's replay math for a composite receipt, including an honestly empty family.
 *
 * `deriveReplayCompletion` correctly refuses an empty corpus as a standalone promotion. In a complete
 * two-family plane, however, either the memory or message family may genuinely be empty while the other
 * carries work. The composite proof therefore permits a zero-row family only inside a non-empty dual-corpus
 * receipt and still binds its stage pre/post state.
 * @param {Object} spec Family replay evidence.
 * @param {String[]} requiredStages Stages this WAL family requires.
 * @returns {Object} `{ok, reason, receipt?}`.
 * @private
 */
function deriveFamilyReplayForComposite(spec, requiredStages) {
    const {payloadEntries, appliedStagesBefore, appliedStagesAfter} = spec ?? {};

    if (!Array.isArray(payloadEntries)) {
        return {ok: false, reason: 'payloadEntries must be an array'}
    }

    const plan = planWalReplay({payloadEntries, appliedStages: appliedStagesBefore, requiredStages});

    if (!plan.ok) return {ok: false, reason: plan.reason};

    const continuity = verifyReplayContinuity({appliedStagesBefore, appliedStagesAfter, plan});

    if (!continuity.ok) return {ok: false, reason: continuity.reason};
    if (continuity.monotonic !== true) {
        return {ok: false, reason: 'continuity verification did not establish monotonic replay'}
    }

    const receiptFault = validateContinuityReceipt(continuity);

    return receiptFault
        ? {ok: false, reason: receiptFault}
        : {ok: true, receipt: continuity.receipt}
}

/**
 * @summary Derives a source/target-bound fork-then-replay receipt across memory and message WAL families.
 *
 * This remains a component proof, never a promotion terminal: the complete-corpus producer is still absent.
 * It closes the provenance seam the later producer will consume by requiring every source row to carry the
 * source plane, every selected target row to carry the target plane, and by retaining the exact family-typed
 * record sets beside the existing stage-continuity receipts. Replayed source provenance is therefore never
 * mistaken for the identity of the plane that accepted the target write.
 * @param {Object} spec
 * @param {String} spec.sourcePlaneId Overlay/source plane identity.
 * @param {String} spec.targetPlaneId Durable target plane identity.
 * @param {Object} spec.memory Memory family `{payloadEntries,targetEntriesAfter,appliedStagesBefore,appliedStagesAfter}`.
 * @param {Object} spec.messages Message family with the same fields (graph stage only).
 * @returns {Object} `{ok, reason, receipt?}` without terminal or eligibility authority.
 */
export function deriveDualCorpusReplayReceipt({sourcePlaneId, targetPlaneId, memory, messages} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!isOpaquePlaneId(sourcePlaneId) || !isOpaquePlaneId(targetPlaneId)) {
        return refuse('sourcePlaneId and targetPlaneId must be valid opaque plane identities');
    }
    if (sourcePlaneId === targetPlaneId) {
        return refuse('sourcePlaneId and targetPlaneId must be distinct for a fork-then-replay receipt');
    }

    const families = [
        ['memory', memory, ['embedded', 'graph']],
        ['messages', messages, ['graph']]
    ];

    if (families.every(([, family]) => Array.isArray(family?.payloadEntries) && family.payloadEntries.length === 0)) {
        return refuse('the dual-corpus source is empty, so a zero-effect replay receipt would certify nothing');
    }

    const familyReceipts = {};

    for (const [familyName, family, requiredStages] of families) {
        const {payloadEntries, targetEntriesAfter} = family ?? {};

        if (!Array.isArray(payloadEntries) || !Array.isArray(targetEntriesAfter)) {
            return refuse(`${familyName} payloadEntries and targetEntriesAfter must be arrays`);
        }

        const badSourcePlane = payloadEntries.findIndex(entry => entry?.planeId !== sourcePlaneId);

        if (badSourcePlane !== -1) {
            return refuse(
                `${familyName} source row at index ${badSourcePlane} is not stamped by source plane ` +
                `"${sourcePlaneId}" — unknown or mixed source provenance cannot be replay-certified`
            );
        }

        const targetById = new Map();

        for (let index = 0; index < targetEntriesAfter.length; index++) {
            const targetEntry = targetEntriesAfter[index],
                  id          = targetEntry?.id;

            if (typeof id !== 'string' || id === '') {
                return refuse(`${familyName} target row at index ${index} has no usable id`);
            }
            if (targetById.has(id)) {
                return refuse(`${familyName} target corpus repeats id "${id}", so double-apply cannot be excluded`);
            }
            targetById.set(id, targetEntry);
        }

        for (const sourceEntry of payloadEntries) {
            const targetEntry = targetById.get(sourceEntry.id);

            if (!targetEntry) {
                return refuse(`${familyName} source id "${sourceEntry.id}" is absent from the target WAL`);
            }
            if (targetEntry.planeId !== targetPlaneId) {
                return refuse(
                    `${familyName} target id "${sourceEntry.id}" carries planeId ` +
                    `${JSON.stringify(targetEntry.planeId)} instead of accepting plane "${targetPlaneId}" — ` +
                    'replayed origin identity must not masquerade as target write identity'
                );
            }
        }

        const continuity = deriveFamilyReplayForComposite(family, requiredStages);

        if (!continuity.ok) {
            return refuse(`${familyName} continuity refused: ${continuity.reason}`)
        }

        const sourceRecordIds = payloadEntries.map(entry => entry.id).sort(),
              selectedSet     = new Set(sourceRecordIds);

        familyReceipts[familyName] = {
            sourceRecordIds,
            targetRecordIds         : [...selectedSet].sort(),
            unrelatedTargetRecordIds: [...targetById.keys()].filter(id => !selectedSet.has(id)).sort(),
            continuity              : continuity.receipt
        };
    }

    return {
        ok     : true,
        reason : 'memory and message replay continuity is bound to exact source/target plane record sets',
        receipt: {
            sourcePlaneId,
            targetPlaneId,
            families: familyReceipts
        }
    }
}

/**
 * @summary Reads both durable WAL families and produces the cutover-bounded plane-provenance scan.
 *
 * The strict readers are owned by their respective stores, so this function never guesses file grammars or
 * plane identity from paths. Records before `cutoverStartedAt` may honestly remain legacy `unknown`; an
 * unknown/invalid timestamp cannot prove that exemption and therefore joins the blocking unknown set.
 * @param {Object} spec
 * @param {String} spec.memoryWalDir Durable memory WAL directory.
 * @param {String} spec.messageWalDir Durable message WAL directory.
 * @param {String} spec.overlayPlaneId Plane identity whose durable writes would be a pilot leak.
 * @param {Number} spec.cutoverStartedAt Inclusive epoch-ms start of the pilot cutover evidence window.
 * @returns {Promise<Object>} `{ok, ...overlayScan}` or `{ok:false, reason}`.
 */
export async function produceOverlayScan({
    memoryWalDir,
    messageWalDir,
    overlayPlaneId,
    cutoverStartedAt
} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!memoryWalDir || !messageWalDir) {
        return refuse('memoryWalDir and messageWalDir are required for a dual-WAL provenance scan');
    }
    if (!isOpaquePlaneId(overlayPlaneId)) {
        return refuse('overlayPlaneId must be a valid opaque plane identity');
    }
    if (!Number.isFinite(cutoverStartedAt)) {
        return refuse('cutoverStartedAt must be a finite epoch-ms boundary');
    }

    let memory, messages;

    try {
        [memory, messages] = await Promise.all([
            readMemoryWalProvenanceSegments({dir: memoryWalDir}),
            readMessageWalProvenanceSegments({dir: messageWalDir})
        ]);
    } catch (e) {
        return refuse(`dual-WAL provenance scan failed: ${e?.message || String(e)}`)
    }

    if (!memory.ok) return refuse(`memory WAL provenance scan failed: ${memory.reason}`);
    if (!messages.ok) return refuse(`message WAL provenance scan failed: ${messages.reason}`);

    const taggedSegments   = new Set(),
          unknownRecords   = [],
          legacyUnknown    = [],
          recordIds        = {memory: [], messages: []},
          knownPlaneCounts = new Map(),
          segments         = [
              ...memory.segments.map(segment => ({...segment, family: 'memory'})),
              ...messages.segments.map(segment => ({
                  ...segment,
                  family   : 'messages',
                  segmentId: `messages/${segment.segmentId}`
              }))
          ];

    let scannedRecordCount = 0;

    for (const segment of segments) {
        for (let index = 0; index < segment.records.length; index++) {
            const record    = segment.records[index],
                  hasId     = typeof record?.id === 'string' && record.id !== '',
                  recordId  = hasId ? record.id : `${segment.segmentId}#row-${index + 1}`,
                  recordKey = `${segment.family}:${recordId}`,
                  timestamp = record?.timestamp,
                  knownTime = Number.isFinite(timestamp),
                  inWindow  = knownTime && timestamp >= cutoverStartedAt;

            scannedRecordCount++;

            if (!knownTime || !hasId || record.planeId === UNKNOWN_PLANE_ID) {
                if (knownTime && timestamp < cutoverStartedAt) {
                    legacyUnknown.push(recordKey);
                } else {
                    unknownRecords.push(recordKey);
                }
                continue;
            }

            if (!inWindow) continue;

            recordIds[segment.family].push(recordId);
            knownPlaneCounts.set(record.planeId, (knownPlaneCounts.get(record.planeId) ?? 0) + 1);

            if (record.planeId === overlayPlaneId) {
                taggedSegments.add(segment.segmentId);
            }
        }
    }

    return {
        ok                  : true,
        planeIdSource       : OVERLAY_TAGGING_PRODUCER,
        scannedSegmentCount : segments.length,
        scannedRecordCount,
        segmentIds          : segments.map(segment => segment.segmentId).sort(),
        taggedSegments      : [...taggedSegments].sort(),
        unknownRecords      : unknownRecords.sort(),
        legacyUnknownRecords: legacyUnknown.sort(),
        knownPlaneCounts    : Object.fromEntries([...knownPlaneCounts].sort(([a], [b]) => a.localeCompare(b))),
        recordIds           : {
            memory  : recordIds.memory.sort(),
            messages: recordIds.messages.sort()
        }
    }
}

/**
 * @summary Validates the overlay-leak scan and returns a refusal reason, or `null`.
 *
 * Exported so the pure derivation remains directly testable, but validation does not mint provenance:
 * {@link evaluateDemotion} invokes {@link produceOverlayScan} and never accepts this structure from a caller.
 * Shape is checkable; source authority comes only from that call graph.
 * @param {Object} overlayScan Producer-owned scan returned by {@link produceOverlayScan}.
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

    const {
        planeIdSource,
        scannedSegmentCount,
        scannedRecordCount,
        segmentIds,
        taggedSegments,
        unknownRecords,
        legacyUnknownRecords,
        recordIds
    } = overlayScan;

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
    if (!Number.isInteger(scannedRecordCount) || scannedRecordCount < 0) {
        return 'overlayScan.scannedRecordCount must be a non-negative integer';
    }
    if (!Array.isArray(segmentIds) || segmentIds.length !== scannedSegmentCount) {
        return 'overlayScan.segmentIds must name exactly every scanned payload segment';
    }
    if (!Array.isArray(unknownRecords) || !Array.isArray(legacyUnknownRecords)) {
        return 'overlayScan must distinguish blocking unknownRecords from pre-cutover legacyUnknownRecords';
    }
    if (!recordIds || !Array.isArray(recordIds.memory) || !Array.isArray(recordIds.messages)) {
        return 'overlayScan.recordIds must retain exact memory and message record sets';
    }

    return null;
}

/**
 * @summary Compares pre-clone and post-pilot segment id sets, returning `{lost, gained}` or a refusal reason.
 *
 * Exported for direct testing behind the invoked producer. **Identity, not cardinality:** `3 → 3` looks stable
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
 * This pure derivation accepts only the producer's complete scan shape and carries no source authority by
 * itself. The authoritative entry point is {@link evaluateDemotion}, which invokes
 * {@link produceOverlayScan} rather than accepting a caller-authored scan.
 * @param {Object} spec
 * @param {Object} spec.overlayScan           Producer-owned dual-WAL provenance scan.
 * @param {String[]} spec.preCloneSegmentIds  Durable segment ids recorded at clone time.
 * @param {String[]} spec.postPilotSegmentIds Durable segment ids at demotion.
 * @returns {Object} `{terminal, reason, eligibility, receipt}`
 */
export function deriveDemotionTerminal(spec) {
    const {overlayScan, preCloneSegmentIds, postPilotSegmentIds} = spec ?? {},
          scanFault                                              = validateOverlayScan(overlayScan);

    if (scanFault) return settle('failed-contained', scanFault);

    const {taggedSegments, unknownRecords} = overlayScan;

    if (taggedSegments.length > 0) {
        return settle(
            'failed-contained',
            `${taggedSegments.length} overlay-tagged segment(s) found in the durable corpus, so an overlay ` +
            `write reached the durable plane: ${taggedSegments.slice(0, 5).join(', ')}. Quarantine the ` +
            'overlay rather than deleting it — it is the only remaining evidence of what leaked.',
            {overlayTaggedTotal: taggedSegments.length, planeIdSource: overlayScan.planeIdSource}
        );
    }

    if (unknownRecords.length > 0) {
        return settle(
            'failed-contained',
            `${unknownRecords.length} durable record(s) inside the cutover window have unknown plane ` +
            `provenance (e.g. ${unknownRecords[0]}). Legacy ignorance may be context before cutover, but ` +
            'inside the proof window it cannot be turned into a clean claim.',
            {
                planeIdSource     : overlayScan.planeIdSource,
                unknownRecordTotal: unknownRecords.length,
                unknownSample     : unknownRecords.slice(0, 5)
            }
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
            unknownRecordTotal : 0,
            legacyUnknownTotal : overlayScan.legacyUnknownRecords.length,
            planeIdSource      : overlayScan.planeIdSource,
            scannedSegmentCount: overlayScan.scannedSegmentCount,
            scannedRecordCount : overlayScan.scannedRecordCount,
            knownPlaneCounts   : overlayScan.knownPlaneCounts,
            recordIds          : overlayScan.recordIds
        }
    );
}

/**
 * @summary Settles demotion from a scan this module obtains from both WAL stores itself.
 *
 * Callers provide configured roots, the overlay identity, the cutover boundary, and the clone-time segment
 * ids. They cannot provide `overlayScan` or the post-pilot segment set: both are observed by the invoked
 * producer, closing the earlier receipt-shaped-input loophole.
 * @param {Object} spec
 * @param {String} spec.memoryWalDir Durable memory WAL directory.
 * @param {String} spec.messageWalDir Durable message WAL directory.
 * @param {String} spec.overlayPlaneId Overlay identity under test.
 * @param {Number} spec.cutoverStartedAt Inclusive epoch-ms evidence boundary.
 * @param {String[]} spec.preCloneSegmentIds Clone-time durable payload segment identities.
 * @returns {Promise<Object>} `{terminal, reason, eligibility, receipt}`.
 */
export async function evaluateDemotion(spec) {
    const {
        memoryWalDir,
        messageWalDir,
        overlayPlaneId,
        cutoverStartedAt,
        preCloneSegmentIds
    } = spec ?? {};
    const overlayScan = await produceOverlayScan({
        memoryWalDir,
        messageWalDir,
        overlayPlaneId,
        cutoverStartedAt
    });

    if (!overlayScan.ok) {
        return settle(
            'failed-contained',
            `${overlayScan.reason}. The overlay remains quarantined because an unproduced scan is unproven, ` +
            'not clean.'
        );
    }

    return deriveDemotionTerminal({
        overlayScan,
        preCloneSegmentIds,
        postPilotSegmentIds: overlayScan.segmentIds
    })
}
