import {TERMINAL_REASONS, computeResidueFingerprint} from './classifyRepairResidue.mjs';

/**
 * @module ai/services/memory-core/helpers/acceptedLossSettlement
 * @summary Pure decider for the AUTONOMOUS accepted-loss settlement — the value-delivering leaf of the
 * Memory Core accepted-loss recovery, re-scoped from operator-acknowledged to fully-autonomous per the
 * v13.1 self-heal mandate (zero operator-ack; no runtime escalate). Given a repair's unrecoverable residue,
 * the collection size, and a systemic-fault bound, it decides — with NO operator and NO runtime escalate —
 * one of:
 *
 *   - `clean`         — no residue;
 *   - `heal-path`     — any transient / healable reason is present → route to the autonomous data-recovery
 *                       actuator (it is NOT accepted loss; never silent-accept recoverable loss);
 *   - `systemic-fault`— every row is deterministically-terminal BUT the loss exceeds the systemic-fault
 *                       bound → a misconfigured embedder reporting everything terminal, not bounded accepted
 *                       loss → FREEZE + record telemetry; NEVER a mass auto-settle;
 *   - `auto-settle`   — every row is deterministically-terminal AND the loss is bounded → record a durable
 *                       `auto-accepted-loss` audit entry and let the run exit clean, autonomously.
 *
 * The terminal reasons (`embedding-context-exceeded` / `document-absent`) are facts from the embed attempt,
 * not judgments, so a bounded set is safe to settle without a human. The audit record carries the shared
 * residue fingerprint, so a later embedding-capability change (chunking, larger context) re-opens the
 * residue by construction. Pure + deterministic (no I/O, no time/randomness): the durable audit-log
 * persistence and the `defragChromaDB` exit-wiring are separate consumers.
 */

/**
 * Default systemic-fault bound: a terminal-residue ratio above 5% OR more than 100 absolute rows is treated
 * as a systemic fault (a misconfigured embedder / mass corruption), not bounded accepted loss.
 * @type {{maxRatio: Number, maxAbsolute: Number}}
 */
export const DEFAULT_SYSTEMIC_FAULT_BOUND = Object.freeze({maxRatio: 0.05, maxAbsolute: 100});

/**
 * @summary Decides the autonomous disposition of a repair's unrecoverable residue: `auto-settle`,
 * `systemic-fault`, `heal-path`, or `clean`. No operator, no runtime escalate.
 *
 * @param {Object} options
 * @param {Array<Object>} [options.residue=[]] `[{id, reason}]` unrecoverable rows.
 * @param {Number} [options.collectionSize=0] Total rows in the collection (the ratio denominator). `0` → ratio is treated as infinite (any terminal residue is over-bound unless `maxAbsolute` saves it).
 * @param {Array<String>} [options.terminalReasons=TERMINAL_REASONS] The deterministic-terminal reason whitelist.
 * @param {{maxRatio: Number, maxAbsolute: Number}} [options.systemicFaultBound=DEFAULT_SYSTEMIC_FAULT_BOUND] The bounded-vs-systemic threshold.
 * @param {String} [options.strategyVersion='']
 * @param {String} [options.provider='']
 * @param {Number|String} [options.contextBudget='']
 * @returns {Object} `{disposition, reasonCode, auditRecord, ...}`. `auditRecord` is populated only for `auto-settle`.
 */
export function decideAcceptedLossSettlement({
    residue            = [],
    collectionSize     = 0,
    terminalReasons    = TERMINAL_REASONS,
    systemicFaultBound = DEFAULT_SYSTEMIC_FAULT_BOUND,
    strategyVersion    = '',
    provider           = '',
    contextBudget      = ''
} = {}) {
    const rows = Array.isArray(residue) ? residue : [];

    if (rows.length === 0) {
        return {disposition: 'clean', reasonCode: 'no-residue', auditRecord: null};
    }

    const nonTerminalReasons = [...new Set(rows
        .map(row => row?.reason)
        .filter(reason => !terminalReasons.includes(reason)))];

    // Any transient / healable reason → the autonomous data-recovery actuator owns it; never silent-accept.
    if (nonTerminalReasons.length > 0) {
        return {disposition: 'heal-path', reasonCode: 'transient-or-healable-residue', nonTerminalReasons, auditRecord: null};
    }

    // All deterministically-terminal: bounded → auto-settle; mass → systemic-fault (freeze + record).
    const {maxRatio, maxAbsolute} = systemicFaultBound,
          ratio                   = collectionSize > 0 ? rows.length / collectionSize : Infinity,
          overBound               = rows.length > maxAbsolute || ratio > maxRatio;

    if (overBound) {
        return {
            disposition: 'systemic-fault',
            reasonCode : 'terminal-residue-over-systemic-fault-bound',
            auditRecord: null,
            bound      : {residueCount: rows.length, collectionSize, ratio, maxRatio, maxAbsolute}
        };
    }

    return {
        disposition: 'auto-settle',
        reasonCode : 'bounded-terminal-residue-auto-accepted',
        auditRecord: {
            schemaVersion  : 1,
            type           : 'auto-accepted-loss',
            fingerprint    : computeResidueFingerprint({residue: rows, strategyVersion, provider, contextBudget, terminalReasons}),
            acceptedIds    : rows.map(row => row?.id).sort(),
            residueCount   : rows.length,
            collectionSize,
            terminalReasons: [...(Array.isArray(terminalReasons) ? terminalReasons : [])].sort(),
            strategyVersion,
            provider,
            contextBudget  : String(contextBudget)
        }
    };
}

/**
 * @summary Resolves the autonomous exit decision for a full set of per-collection repair results — the
 * pure heart of the `defragChromaDB` non-clean exit path under the zero-ack / no-escalate mandate. Runs
 * `decideAcceptedLossSettlement` over each non-clean collection's residue and reports whether EVERY
 * non-clean collection autonomously accepted-loss-settled (so the run may exit clean) or any collection
 * needs the heal-path (transient → the data-recovery actuator) or hit a systemic-fault (freeze). Pure: no
 * I/O — the caller persists each `auditRecord` and chooses the exit code.
 *
 * @param {Object} options
 * @param {Object[]} [options.results=[]] Per-collection repair results (`{collectionName, aborted, partialPromoted, unrecoverable, sourceCount}`).
 * @param {Function} [options.normalizeResidue] Maps a raw `unrecoverable` entry to `{id, reason}` (the caller's `normalizeUnrecoverableEntry`).
 * @param {Array<String>} [options.terminalReasons=TERMINAL_REASONS]
 * @param {{maxRatio: Number, maxAbsolute: Number}} [options.systemicFaultBound=DEFAULT_SYSTEMIC_FAULT_BOUND]
 * @param {String} [options.strategyVersion='']
 * @param {String} [options.provider='']
 * @param {Number|String} [options.contextBudget='']
 * @returns {Object} `{allSettled, perCollection: [{collectionName, disposition, reasonCode, auditRecord}]}`. `allSettled` is true iff there is ≥1 non-clean collection and EVERY one's disposition is `auto-settle`.
 */
export function resolveAutonomousRepairExit({
    results            = [],
    normalizeResidue   = row => ({id: row?.id, reason: row?.reason}),
    terminalReasons    = TERMINAL_REASONS,
    systemicFaultBound = DEFAULT_SYSTEMIC_FAULT_BOUND,
    strategyVersion    = '',
    provider           = '',
    contextBudget      = ''
} = {}) {
    const nonClean = (Array.isArray(results) ? results : []).filter(result => result?.aborted || result?.partialPromoted);

    const perCollection = nonClean.map(result => {
        const residue  = (Array.isArray(result.unrecoverable) ? result.unrecoverable : []).map(normalizeResidue),
              decision = decideAcceptedLossSettlement({
                  residue,
                  collectionSize: result.sourceCount ?? 0,
                  terminalReasons,
                  systemicFaultBound,
                  strategyVersion,
                  provider,
                  contextBudget
              });

        return {collectionName: result.collectionName, disposition: decision.disposition, reasonCode: decision.reasonCode, auditRecord: decision.auditRecord};
    });

    return {
        allSettled   : perCollection.length > 0 && perCollection.every(entry => entry.disposition === 'auto-settle'),
        perCollection
    };
}
