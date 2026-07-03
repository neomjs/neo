import {computeResidueFingerprint, TERMINAL_REASONS} from './classifyRepairResidue.mjs';

/**
 * @module ai/services/memory-core/helpers/acceptedLossAck
 * @summary Pure constructor for the durable operator acknowledgement of accepted-loss recovery residue.
 * It packages the residue fingerprint — the SAME stable hash the residue classifier uses — plus the
 * operator identity and the acknowledged-at timestamp into a typed, JSON-ready `accepted-loss-ack` record
 * that the durable store persists and the classifier reads. Because the fingerprint binds to the exact
 * terminal residue + recovery strategy/provider/context, a later residue / strategy / provider change
 * makes the stored ack no longer match — so a stale acknowledgement can never silently suppress a NEW
 * loss. Pure: no I/O, no time/randomness (the caller supplies `acknowledgedAt`); the durable persistence,
 * the retrieve-by-fingerprint surface, and the defrag-outcome wiring are separate leaves that consume this.
 */

/**
 * @summary Builds a durable accepted-loss acknowledgement record over a repair's terminal residue.
 *
 * The record's `fingerprint` is computed by the shared `computeResidueFingerprint`, so an ack built here is
 * accepted by the classifier iff the live residue still matches — closing the produce → store → classify loop.
 *
 * @param {Object} options
 * @param {Array<Object>} options.residue `[{id, reason}]` the terminal-unrecoverable rows being acknowledged.
 * @param {String} options.operatorId The acknowledging operator identity.
 * @param {Number} options.acknowledgedAt Epoch milliseconds when the operator acknowledged the loss.
 * @param {String} [options.strategyVersion='']
 * @param {String} [options.provider='']
 * @param {Number|String} [options.contextBudget='']
 * @param {Array<String>} [options.terminalReasons=TERMINAL_REASONS] The terminality-policy set bound into the fingerprint — so a later policy change makes the ack stale.
 * @param {String|null} [options.recoveryRunId=null] Optional originating recovery-run id (provenance).
 * @returns {Object} A typed `accepted-loss-ack` record — the durable suppression key the classifier reads.
 * @throws {TypeError} when `operatorId` is missing/empty or `acknowledgedAt` is not a finite number.
 */
export function createAcceptedLossAckEntry({
    residue,
    operatorId,
    acknowledgedAt,
    strategyVersion = '',
    provider        = '',
    contextBudget   = '',
    terminalReasons = TERMINAL_REASONS,
    recoveryRunId   = null
} = {}) {
    if (typeof operatorId !== 'string' || operatorId.length === 0) {
        throw new TypeError('createAcceptedLossAckEntry: operatorId is required');
    }
    if (!Number.isFinite(acknowledgedAt)) {
        throw new TypeError('createAcceptedLossAckEntry: acknowledgedAt must be a finite number');
    }

    const rows = Array.isArray(residue) ? residue : [];

    return {
        schemaVersion  : 1,
        type           : 'accepted-loss-ack',
        fingerprint    : computeResidueFingerprint({residue: rows, strategyVersion, provider, contextBudget, terminalReasons}),
        acknowledgedIds: rows.map(row => row?.id).sort(),
        residueCount   : rows.length,
        strategyVersion,
        provider,
        contextBudget  : String(contextBudget),
        terminalReasons: [...(Array.isArray(terminalReasons) ? terminalReasons : [])].sort(),
        operatorId,
        acknowledgedAt,
        recoveryRunId
    };
}
