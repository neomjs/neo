import {isKnownKnob, knobEnvBindings, RECOVERY_KNOBS, validateKnobTransaction} from './recoveryKnobRegistry.mjs';

/**
 * Admits ledger records into the active prescription set the env renderer materializes.
 *
 * **This module exists because the ledger is an untrusted transport and the registry is the authority.**
 * A record arrives having been validated once, by a producer, against a context that has since moved.
 * Rendering it on that strength would make the ledger the security boundary — and the ledger is a file.
 * So every record is revalidated here against the *current* registry: the knob must still exist, still
 * address the target it names, still bound the values it carries, and still bind the env keys the
 * renderer will write. Admission is computed, never accepted.
 *
 * **The env key is taken from the registry and never from the record.** The renderer downstream accepts
 * any uppercase identifier with a positive finite value, so a record permitted to name its own `env`
 * could turn a bounded heap prescription into an arbitrary numeric config mutation — the whole knob
 * abstraction bypassed by one extra field. `knobEnvBindings()` is the only source consulted, which is
 * also why a rebinding in the registry propagates here with no edit.
 *
 * **Ordering is `sequence`, never `prescribedAt`.** `prescribedAt` is audit metadata written by whoever
 * produced the record, so letting it order deployment state lets a wrong clock choose which ceiling is
 * live. `sequence` is sink-assigned and monotonic, so it is the only field with the authority to say
 * which of two prescriptions for the same target supersedes the other.
 *
 * Scope: this is the READ side. It admits and folds; it does not append, and it does not write files.
 * The trusted append ingress — compare-and-append per target, sink-stamped producer provenance,
 * forged-producer rejection — is a separate boundary and deliberately not reachable from here.
 */

/**
 * The record shape this module admits. Fields the registry already owns — the leaf→env binding, bounds,
 * required context, the target service — are deliberately absent: a record that restated them could
 * disagree with the authority, and then the disagreement would have to be adjudicated rather than
 * simply not existing.
 * @typedef {Object} LedgerPrescriptionRecord
 * @property {String} recordType            Must be `deployment-prescription`.
 * @property {String} prescriptionId        Identity, used for idempotent replay.
 * @property {Number} sequence              Sink-assigned monotonic ordering authority.
 * @property {String} knob                  A key of `RECOVERY_KNOBS`.
 * @property {Object} targetIdentity        `{kind, id}`; `id` must match the knob's declared service.
 * @property {Object} values                Keyed by the knob's registry leaf paths.
 * @property {Object} [validatedAgainst]    `{context, observationFingerprint, observedAt}`.
 */

/**
 * The target kinds a prescription may address. Closed rather than open because `competitionKey()`
 * includes `kind`: an unbounded kind is a way to mint extra competitions for one env variable, so the
 * set is the guard and not documentation. Widening it is a deliberate edit with its own delivery story.
 * @type {Set<String>}
 */
const DEPLOYMENT_CAPABLE_TARGET_KINDS = new Set(['compose-service']);

/**
 * Refusal reasons, named rather than free-text so a caller can act on them and a ledger audit can count
 * them. A refused record is a fact worth recording — the alternative is a materialization that is
 * quietly narrower than the ledger it claims to represent.
 * @type {Object}
 */
export const LEDGER_REFUSALS = Object.freeze({
    conflictingSequence: 'conflicting-sequence',
    invalidTransaction : 'invalid-transaction',
    notAPrescription   : 'not-a-prescription',
    targetMismatch     : 'target-mismatch',
    unknownKnob        : 'unknown-knob',
    unorderable        : 'unorderable'
});

/**
 * @summary Groups records by the target they compete for.
 *
 * Supersession is per `{target, knob}` and not global: two knobs on the same service are independent
 * prescriptions, and the same knob on two services must not have one silently outrank the other.
 * @param {LedgerPrescriptionRecord} record
 * @returns {String}
 */
function competitionKey(record) {
    return `${record.knob}::${record.targetIdentity?.kind ?? '?'}:${record.targetIdentity?.id ?? '?'}`
}

/**
 * @summary Canonicalizes the registry leaf map for semantic payload comparison.
 *
 * Object insertion order is transport trivia. Comparing raw `JSON.stringify(values)` would poison an
 * equal-sequence replay whose two registry leaves were serialized in a different order, even though
 * the transaction was identical. Registry leaf values are JSON primitives, so sorting their paths is
 * the complete semantic projection.
 * @param {Object} values
 * @returns {String}
 * @private
 */
function canonicalValues(values) {
    return JSON.stringify(Object.keys(values ?? {}).sort().map(key => [key, values[key]]))
}

/**
 * @summary Revalidates one record against the current registry, returning a refusal reason or null.
 *
 * Ordered cheapest-first and deliberately total: a record that fails anything is admitted for nothing.
 * Partial admission is the same failure `validateKnobTransaction` refuses partial application for — a
 * half-applied knob leaves state that depends on what the target happened to hold.
 * @param {LedgerPrescriptionRecord} record
 * @returns {{reason: String, detail: String[]}|null}
 */
export function refuseLedgerRecord(record) {
    if (record?.recordType !== 'deployment-prescription') {
        return {reason: LEDGER_REFUSALS.notAPrescription, detail: [`recordType '${record?.recordType}'`]}
    }

    // A record the sink never ordered cannot be folded, and defaulting it to 0 or to arrival order would
    // hand ordering authority back to the transport this module exists to distrust.
    if (!Number.isInteger(record.sequence) || record.sequence < 0) {
        return {reason: LEDGER_REFUSALS.unorderable, detail: [`sequence ${JSON.stringify(record.sequence)} is not a non-negative integer`]}
    }

    if (!isKnownKnob(record.knob)) {
        return {reason: LEDGER_REFUSALS.unknownKnob, detail: [`'${record.knob}'`]}
    }

    // `kind` is validated against a closed set BEFORE `id`, because the competition key includes it:
    // an unvalidated kind lets one `id` open a SECOND competition for the same env key, and then two
    // winners render for one variable and the last one written wins by array position. Measured on the
    // superseded revision — `{kind: 'anything', id: 'chroma'}` beside the declared kind produced two
    // entries whose order flipped with read order. A field the competition key reads is a field
    // admission must bound.
    if (!DEPLOYMENT_CAPABLE_TARGET_KINDS.has(record.targetIdentity?.kind)) {
        return {
            reason: LEDGER_REFUSALS.targetMismatch,
            detail: [`target kind '${record.targetIdentity?.kind}' is not deployment-capable`]
        }
    }

    // The registry declares the one service a knob addresses. A record aiming a chroma ceiling at
    // another container is refused here rather than rendered, because the env binding would resolve
    // from the registry and silently move the service the knob DOES own.
    const declaredService = RECOVERY_KNOBS[record.knob].serviceKey;

    if (record.targetIdentity?.id !== declaredService) {
        return {
            reason: LEDGER_REFUSALS.targetMismatch,
            detail: [`knob '${record.knob}' addresses '${declaredService}', record names '${record.targetIdentity?.id}'`]
        }
    }

    const {valid, violations} = validateKnobTransaction({
        knob  : record.knob,
        values: record.values,
        // The producer's resolved bounds travel with the record; they are re-evaluated, not trusted. A
        // context that has gone stale surfaces as a violation, which is a disposition — not a new line.
        context: record.validatedAgainst?.context
    });

    return valid ? null : {reason: LEDGER_REFUSALS.invalidTransaction, detail: violations}
}

/**
 * @summary Folds a ledger into the active prescription set, ready for the env renderer.
 *
 * **Last-write-wins is decided by `sequence` here rather than left to the renderer.** The renderer's
 * own duplicate collapse is a rendering detail — it cannot tell a legitimate successor from a replay,
 * a conflict, or a late arrival with a stale watermark, because it never sees the ordering field. So the
 * ledger resolves supersession and hands the renderer a set with one entry per key.
 * @param {LedgerPrescriptionRecord[]} records Ledger order as read; arrival order is NOT trusted.
 * @returns {{prescriptions: Array<{key: String, value: Number}>, admitted: Object[], refused: Array<{record: Object, reason: String, detail: String[]}>}}
 */
export function admitLedgerPrescriptions(records) {
    const
        conflicted = new Set(),
        refused    = [],
        winners    = new Map();

    for (const record of records ?? []) {
        const refusal = refuseLedgerRecord(record);

        if (refusal) {
            refused.push({record, ...refusal});
            continue
        }

        const
            key       = competitionKey(record),
            incumbent = winners.get(key);

        if (!incumbent) {
            winners.set(key, record);
            continue
        }

        if (record.sequence > incumbent.sequence) {
            winners.set(key, record);
            continue
        }

        // Equal watermark, different payload: the sink assigned one ordering position to two different
        // intents, so NEITHER can be shown to supersede the other.
        //
        // **The whole competition fails closed — refusing only the newcomer was the bug.** That kept the
        // incumbent, and the incumbent is whichever record was READ FIRST, so deployment state depended
        // on read order: the same two records rendered 10 GiB in one order and 12 GiB in the other. A
        // fold whose output depends on input order has not resolved the conflict, it has hidden it
        // behind an arbitrary winner. Poisoning the key means the env variable is simply not
        // materialized until the ledger is repaired, which is the honest state.
        if (record.sequence === incumbent.sequence
            && canonicalValues(record.values) !== canonicalValues(incumbent.values)) {
            conflicted.add(key);

            refused.push({
                record,
                reason: LEDGER_REFUSALS.conflictingSequence,
                detail: [`sequence ${record.sequence} contested with '${incumbent.prescriptionId}'; the whole competition is refused`]
            });
            continue
        }

        // Lower sequence, or an idempotent replay of the same payload. Both are non-events: a stale
        // watermark completing late must not unwind a newer admitted prescription.
        refused.push({
            record,
            reason: LEDGER_REFUSALS.conflictingSequence,
            detail: [`superseded by sequence ${incumbent.sequence}`]
        })
    }

    // The poisoned keys are dropped AFTER the fold, not during it: a conflict can be discovered by a
    // record that arrives after the incumbent was already admitted, so the incumbent must be withdrawn
    // retroactively. Deciding at admission time would make the outcome depend on when the conflict was
    // seen — the same read-order dependence one step removed.
    for (const key of conflicted) {
        const loser = winners.get(key);

        if (loser) {
            winners.delete(key);
            refused.push({
                record: loser,
                reason: LEDGER_REFUSALS.conflictingSequence,
                detail: [`withdrawn: competition '${key}' is contested at sequence ${loser.sequence}`]
            })
        }
    }

    const
        admitted      = [...winners.values()],
        prescriptions = [];

    for (const record of admitted) {
        for (const {path, env} of knobEnvBindings(record.knob)) {
            prescriptions.push({key: env, value: record.values[path]})
        }
    }

    return {prescriptions, admitted, refused}
}
