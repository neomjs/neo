import {
    TERMINAL_REASONS,
    classifyRepairResidue,
    computeResidueFingerprint
} from './classifyRepairResidue.mjs';

/**
 * @module ai/services/memory-core/helpers/acceptedLossOutcome
 * @summary Pure decider for whether a Memory Core partial-promotion's residue is operator-acknowledged
 * accepted-loss — the composition leaf that joins the residue classifier, the durable ack store, and the
 * defrag partial-promotion manifest into the single exit-0-vs-escalate decision the repair CLI consults.
 *
 * For each partial-promoted collection it maps the unrecoverable manifest to the classifier's residue
 * shape, computes the shared residue fingerprint, looks up the durable ack (injected — so this stays pure
 * and testable without I/O), and classifies. The whole run is accepted-loss ONLY when there is at least
 * one partial-promoted collection AND every one classifies as accepted-loss (all-terminal residue + a
 * matching durable ack). Any transient/unknown reason, a missing or stale ack, or zero collections leaves
 * the run NOT accepted → the caller escalates (exit 1) exactly as before. An aborted collection is never
 * accepted-loss; the caller must exclude aborted runs before consulting this (no promotion happened, so it
 * is a real failure, not bounded loss).
 *
 * The `recoveryContext` (strategy/provider/context/terminality-policy) is bound into the fingerprint, so it
 * MUST be the same context the operator ack was minted under — both read from one shared recovery-context
 * source so they match by construction.
 */

/**
 * @summary Decides, per partial-promoted collection, whether the residue is operator-acknowledged accepted-loss.
 *
 * @param {Object} options
 * @param {Object[]} [options.partialResults=[]] Partial-promoted repair results (`{collectionName, unrecoverable:[{id,reason}]}`).
 * @param {Object} [options.recoveryContext={}] The recovery context bound into the fingerprint (`{strategyVersion, provider, contextBudget, terminalReasons}`).
 * @param {Function} options.readAck `async fingerprint => ack|null` — the durable ack lookup (injected).
 * @returns {Promise<Object>} `{allAccepted, perCollection:[{collection, outcome, reasonCode, fingerprint}]}`.
 */
export async function evaluateAcceptedLossOutcome({partialResults = [], recoveryContext = {}, readAck} = {}) {
    const {
        strategyVersion = '',
        provider        = '',
        contextBudget   = '',
        terminalReasons = TERMINAL_REASONS
    } = recoveryContext;

    const rows          = Array.isArray(partialResults) ? partialResults : [],
          perCollection = [];

    // Zero partial-promoted collections is NOT an accepted-loss outcome — nothing was acknowledged.
    let allAccepted = rows.length > 0;

    for (const result of rows) {
        const residue = (result?.unrecoverable || []).map(row => ({
            id    : row?.id ?? null,
            reason: row?.reason ?? null
        }));

        const fingerprint = computeResidueFingerprint({residue, strategyVersion, provider, contextBudget, terminalReasons}),
              ack         = typeof readAck === 'function' ? await readAck(fingerprint) : null,
              verdict     = classifyRepairResidue({residue, ack, strategyVersion, provider, contextBudget, terminalReasons});

        perCollection.push({
            collection: result?.collectionName ?? null,
            outcome   : verdict.outcome,
            reasonCode: verdict.reasonCode,
            fingerprint
        });

        if (verdict.outcome !== 'accepted-loss') {
            allAccepted = false;
        }
    }

    return {allAccepted, perCollection};
}
