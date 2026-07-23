/**
 * @module ai/daemons/orchestrator/services/dataIntegrityModeClassifier
 * @summary The data-integrity runner-terminal's mode-classifier — the single source of the corruption-mode
 * taxonomy. It consumes the raw per-collection evidence the detect-producers emit and derives the corruption
 * MODE plus the AUTONOMOUS terminal action.
 *
 * There is no `escalate` outcome and no operator in the loop: in a cloud deployment there is no human to page
 * or acknowledge, so every mode routes to an autonomous heal action (the safe-default being `quarantine`
 * when a specific repair action is not yet built). Safety comes from the action envelope (snapshot,
 * reversibility, durable audit record, rate-limit), not from a human gate that does not exist.
 *
 * The classifier is pure (no I/O): producers gather the evidence, the recovery actuator executes the action;
 * this only decides. Single-sourcing the mode taxonomy here means adding a mode never touches the producers —
 * they stay dumb raw-evidence emitters.
 *
 * @see ai/daemons/orchestrator/services/dataIntegrityCoverageDiagnosis.mjs
 * @see ai/daemons/orchestrator/services/dimensionConsistencyDiagnosis.mjs
 * @see ai/daemons/orchestrator/services/DataIntegrityDiagnosisService.mjs
 */

import {
    normalizeRestoreTargetSetDescriptor,
    RESTORE_EMPTY_TARGET_ACTION
} from '../../../services/memory-core/helpers/restoreTargetSetContract.mjs';
import {
    normalizeRestoreTargetSetAdmission
} from '../../../services/memory-core/helpers/restoreTargetSetAdmission.mjs';

/**
 * @summary The autonomous terminal actions a corruption mode routes to. There is deliberately NO `escalate`
 * or `page` action — every terminal is autonomous and bounded. Where the specific repair action is not yet
 * implemented, the classifier routes to `quarantine`, the safe-default terminal. The classifier only DECIDES
 * the action; the actuator EXECUTES it — quarantine fences a corrupt index from similarity-serving once that
 * op is wired, while the interim actuator defers every action (detected + recorded autonomously, never a page).
 * @enum {String}
 */
export const DataIntegrityTerminal = Object.freeze({
    /** WAL-stall: metadata-without-vector, documents intact — re-embed the missing rows from the surviving documents (lossless). */
    REEMBED_MISSING    : 're-embed-missing',
    /** Dimension-targeted: a few wrong-dimension vectors — re-embed exactly those rows. */
    REEMBED_ROWS       : 're-embed-rows',
    /** Typed, default-off fresh-empty bootstrap only: restore one admitted three-destination target set. */
    RESTORE_EMPTY_TARGET: RESTORE_EMPTY_TARGET_ACTION,
    /** Safe-default terminal: when the actuator executes it, fences the collection from similarity-serving (a corrupt index is never served). Bounded, lossless, reversible. The interim actuator defers it. */
    QUARANTINE         : 'quarantine',
    /** Systemic false-storm (mass mismatch): freeze the collection — never trigger a mass auto-re-embed. */
    FREEZE             : 'freeze',
    /** Store-bloat maintenance: autonomous defrag/compact. */
    DEFRAG             : 'defrag',
    /** Clean: no integrity signal, no action. */
    NONE               : 'none'
});

/**
 * @summary Default mismatch-rate at/above which a dimension mismatch is treated as a systemic false-storm
 * (freeze) rather than a targeted re-embed. Overridable from the orchestrator config leaf at the use-site.
 * @type {Number}
 */
export const DEFAULT_FALSE_STORM_RATE = 0.5;

/**
 * @summary Derives the corruption mode and its autonomous terminal action from one collection's raw evidence.
 *
 * Precedence is most-systemic-first: a systemic fault (SQLite corruption, a dimension false-storm) must never
 * fall through to a row-level auto-repair. `documentsPresentCount` is the load-bearing discriminator between
 * WAL-stall (documents survive → lossless re-embed) and wipe (documents gone → restore/contain) — only the
 * producer can gather it, but the decision lives here.
 *
 * @param {Object} evidence
 * @param {String}  [evidence.collection=null] Collection name (passed through into the decision record).
 * @param {Number}  [evidence.rowCount=0] Total metadata rows.
 * @param {Number}  [evidence.missingFromVectorCount=0] Metadata rows with no stored vector (coverage gap).
 * @param {Number}  [evidence.documentsPresentCount=0] Of the gap rows, how many still have their source document.
 * @param {Boolean} [evidence.countRegressed=false] The stored row count decreased versus the prior observation.
 * @param {Number}  [evidence.mismatchedVectorCount=0] Stored vectors whose dimension differs from the expected dimension.
 * @param {Boolean} [evidence.sqliteIntegrityOk=true] SQLite PRAGMA integrity result (false = corrupt).
 * @param {Boolean} [evidence.sizeAnomaly=false] Store-size anomaly (bloat) detected.
 * @param {Number}  [evidence.falseStormRate=DEFAULT_FALSE_STORM_RATE] Mismatch-rate threshold for systemic.
 * @returns {{collection: String, mode: String, terminalAction: String, autonomous: Boolean, reason: String}}
 */
export function classifyDataIntegrityMode({
    collection             = null,
    rowCount               = 0,
    missingFromVectorCount = 0,
    documentsPresentCount  = 0,
    countRegressed         = false,
    mismatchedVectorCount  = 0,
    sqliteIntegrityOk      = true,
    sizeAnomaly            = false,
    falseStormRate         = DEFAULT_FALSE_STORM_RATE
} = {}) {
    // Most-systemic first: a systemic fault must not be auto-repaired row-by-row.
    if (sqliteIntegrityOk === false) {
        return decision(collection, 'sqlite-integrity', DataIntegrityTerminal.QUARANTINE,
            'SQLite PRAGMA integrity failure — restore-class, not row-level repairable');
    }

    if (mismatchedVectorCount > 0) {
        const rate = rowCount > 0 ? mismatchedVectorCount / rowCount : 1;
        if (rate >= falseStormRate) {
            return decision(collection, 'dimension-systemic', DataIntegrityTerminal.FREEZE,
                'mass dimension mismatch (false-storm) — freeze, never a mass auto-re-embed');
        }
        return decision(collection, 'dimension-targeted', DataIntegrityTerminal.REEMBED_ROWS,
            'few wrong-dimension vectors — autonomous targeted re-embed');
    }

    if (countRegressed) {
        return decision(collection, 'count-loss', DataIntegrityTerminal.QUARANTINE,
            'stored row count regressed — data already left; nothing row-level to re-embed');
    }

    if (missingFromVectorCount > 0) {
        // The load-bearing discriminator: re-embed is lossless iff the documents survive.
        if (documentsPresentCount >= missingFromVectorCount) {
            return decision(collection, 'wal-stall', DataIntegrityTerminal.REEMBED_MISSING,
                'metadata-without-vector, documents intact — lossless autonomous re-embed');
        }
        return decision(collection, 'wipe', DataIntegrityTerminal.QUARANTINE,
            'metadata-without-vector, documents also gone — contain; count/loss evidence cannot select target-set restore');
    }

    if (sizeAnomaly) {
        return decision(collection, 'store-bloat', DataIntegrityTerminal.DEFRAG,
            'size anomaly — autonomous defrag/compact (maintenance, not corruption)');
    }

    return decision(collection, 'clean', DataIntegrityTerminal.NONE, 'no integrity signal');
}

/**
 * @summary Maps only the typed, default-off fresh-empty bootstrap diagnosis to
 * `restore-empty-target`.
 *
 * This classifier-owned boundary admits only an explicitly typed fresh-bootstrap
 * recovery. Ordinary wipe or count-loss evidence cannot enter this route, and a
 * malformed target set fails closed to `none`.
 *
 * @param {Object} diagnosis
 * @param {'fresh-empty-bootstrap'} diagnosis.type Typed diagnosis discriminator.
 * @param {Boolean} diagnosis.enabled Explicit default-off opt-in.
 * @param {Object} diagnosis.targetSet Canonical v1 target-set descriptor.
 * @returns {Object} Classification decision with the admitted target set only
 * when the route is accepted.
 */
export function classifyFreshEmptyBootstrapDiagnosis({
    type,
    enabled = false,
    targetSet
} = {}) {
    if (type !== 'fresh-empty-bootstrap' || enabled !== true) {
        return {
            accepted      : false,
            autonomous    : true,
            mode          : 'not-fresh-empty-bootstrap',
            terminalAction: DataIntegrityTerminal.NONE,
            reason        : 'restore-empty-target requires an explicitly enabled typed fresh-empty bootstrap diagnosis'
        }
    }

    try {
        const
            descriptor = normalizeRestoreTargetSetDescriptor(targetSet),
            admission  = normalizeRestoreTargetSetAdmission(
                targetSet?.admission,
                descriptor
            );

        return {
            accepted      : true,
            autonomous    : true,
            mode          : 'fresh-empty-bootstrap',
            terminalAction: DataIntegrityTerminal.RESTORE_EMPTY_TARGET,
            reason        : 'typed fresh-empty bootstrap diagnosis admitted for target-set recovery',
            targetSet     : {...descriptor, admission}
        }
    } catch (error) {
        return {
            accepted      : false,
            autonomous    : true,
            mode          : 'invalid-fresh-empty-bootstrap',
            terminalAction: DataIntegrityTerminal.NONE,
            reason        : error.message
        }
    }
}

/**
 * @summary Builds the immutable classifier decision record. `autonomous` is always true — there is no
 * operator-gated or escalate outcome by construction.
 * @param {String} collection
 * @param {String} mode
 * @param {String} terminalAction
 * @param {String} reason
 * @returns {{collection: String, mode: String, terminalAction: String, autonomous: Boolean, reason: String}}
 */
function decision(collection, mode, terminalAction, reason) {
    return {collection, mode, terminalAction, autonomous: true, reason};
}
