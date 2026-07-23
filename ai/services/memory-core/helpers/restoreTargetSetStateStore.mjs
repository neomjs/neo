import fs   from 'fs/promises';
import path from 'path';

/**
 * @module ai/services/memory-core/helpers/restoreTargetSetStateStore
 * @summary Strict append-only component ledger for one
 * `restore-empty-target` attempt.
 *
 * Storage observations never create transitions. The writer must append each
 * semantic boundary explicitly, and only `committed` opens service eligibility.
 */

export const RESTORE_TARGET_SET_STATES = Object.freeze([
    'admitted',
    'fenced',
    'staged',
    'promoted:memories',
    'promoted:summaries',
    'promoted:graph',
    'validated',
    'committed',
    'deferred-target-not-empty',
    'interrupted',
    'failed-contained'
]);

export const RESTORE_TARGET_SET_TERMINALS = Object.freeze([
    'committed',
    'deferred-target-not-empty',
    'failed-contained'
]);

const ALLOWED_NEXT_STATES = Object.freeze({
    '<start>'                  : Object.freeze(['admitted']),
    admitted                   : Object.freeze(['fenced', 'interrupted', 'failed-contained']),
    fenced                     : Object.freeze(['staged', 'deferred-target-not-empty', 'interrupted', 'failed-contained']),
    staged                     : Object.freeze(['promoted:memories', 'interrupted', 'failed-contained']),
    'promoted:memories'        : Object.freeze(['promoted:summaries', 'failed-contained']),
    'promoted:summaries'       : Object.freeze(['promoted:graph', 'failed-contained']),
    'promoted:graph'           : Object.freeze(['validated', 'failed-contained']),
    validated                  : Object.freeze(['committed', 'failed-contained']),
    interrupted                : Object.freeze(['fenced', 'failed-contained']),
    committed                  : Object.freeze([]),
    'deferred-target-not-empty': Object.freeze([]),
    'failed-contained'         : Object.freeze([])
});

/**
 * @summary Builds the gitignored per-attempt ledger file name.
 *
 * @param {String} attemptFingerprint Canonical SHA-256 attempt fingerprint.
 * @returns {String}
 */
export function getRestoreTargetSetStateFileName(attemptFingerprint) {
    validateFingerprint(attemptFingerprint, 'attemptFingerprint');
    return `${attemptFingerprint.slice('sha256:'.length)}.jsonl`
}

/**
 * @summary Reads and validates every transition for one attempt.
 *
 * A malformed line, identity drift, sequence gap, or illegal state edge fails
 * loud. Recovery cannot silently skip a broken authority record.
 *
 * @param {Object} options
 * @param {String} options.dir Ledger directory.
 * @param {String} options.attemptFingerprint Attempt identity.
 * @returns {Promise<Object[]>}
 */
export async function readRestoreTargetSetTransitions({dir, attemptFingerprint} = {}) {
    validateDir(dir, 'readRestoreTargetSetTransitions');
    validateFingerprint(attemptFingerprint, 'attemptFingerprint');

    const filePath = path.join(dir, getRestoreTargetSetStateFileName(attemptFingerprint));

    let text;
    try {
        text = await fs.readFile(filePath, 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return []
        }
        throw error
    }

    const transitions = text
        .split('\n')
        .filter(Boolean)
        .map((line, index) => {
            try {
                return JSON.parse(line)
            } catch (error) {
                throw new Error(`restore target-set ledger line ${index + 1} is invalid JSON: ${error.message}`)
            }
        });

    validateTransitionChain(transitions, {attemptFingerprint});
    return transitions
}

/**
 * @summary Strict-appends one semantic transition after validating the complete
 * existing chain.
 *
 * @param {Object} transition
 * @param {String} transition.attemptFingerprint Attempt identity.
 * @param {String} transition.recoveryUnitKey Bundle-independent recovery unit.
 * @param {String} transition.state Next strict state.
 * @param {Number} transition.at Epoch milliseconds.
 * @param {Object} [transition.details={}] Bounded state detail.
 * @param {Object} options
 * @param {String} options.dir Ledger directory.
 * @returns {Promise<Object>} Appended transition.
 */
export async function appendRestoreTargetSetTransition({
    attemptFingerprint,
    recoveryUnitKey,
    state,
    at,
    details = {}
} = {}, {dir} = {}) {
    validateDir(dir, 'appendRestoreTargetSetTransition');
    validateFingerprint(attemptFingerprint, 'attemptFingerprint');
    validateRecoveryUnitKey(recoveryUnitKey);
    validateState(state);
    validateTimestamp(at);
    validateDetails(details);

    await fs.mkdir(dir, {recursive: true});

    const
        transitions = await readRestoreTargetSetTransitions({dir, attemptFingerprint}),
        previous    = transitions.at(-1) ?? null,
        allowed     = ALLOWED_NEXT_STATES[previous?.state ?? '<start>'];

    if (!allowed.includes(state)) {
        throw new Error(`illegal restore target-set transition ${previous?.state ?? '<start>'} -> ${state}`)
    }
    if (previous && previous.recoveryUnitKey !== recoveryUnitKey) {
        throw new Error('restore target-set recoveryUnitKey drift inside one attempt ledger')
    }

    const entry = {
        schemaVersion: 1,
        type         : 'restore-target-set-transition',
        attemptFingerprint,
        recoveryUnitKey,
        sequence     : transitions.length + 1,
        previousState: previous?.state ?? null,
        state,
        at,
        details
    };

    const filePath = path.join(dir, getRestoreTargetSetStateFileName(attemptFingerprint));
    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');

    return entry
}

/**
 * @summary Returns true only when the latest strict transition is `committed`.
 *
 * @param {Object[]} transitions Validated transition chain.
 * @returns {Boolean}
 */
export function isRestoreTargetSetCommitted(transitions = []) {
    return transitions.at(-1)?.state === 'committed'
}

/**
 * @summary Builds the bounded, redacted recovery receipt projected to
 * diagnostics and selector consumers.
 *
 * @param {Object} options
 * @param {Object[]} options.transitions Strict transition chain.
 * @param {String} options.recoveryUnitKey Recovery unit identity.
 * @param {String} options.attemptFingerprint Attempt identity.
 * @param {Object} options.descriptor Canonical target-set descriptor.
 * @param {Object|null} [options.validationResult=null] Final validation summary.
 * @param {Object|null} [options.failure=null] Redacted terminal failure.
 * @returns {Object}
 */
export function createRestoreTargetSetReceipt({
    transitions = [],
    recoveryUnitKey,
    attemptFingerprint,
    descriptor,
    validationResult = null,
    failure = null
} = {}) {
    validateTransitionChain(transitions, {attemptFingerprint, recoveryUnitKey});

    const
        first           = transitions[0] ?? null,
        last            = transitions.at(-1) ?? null,
        serviceEligible = isRestoreTargetSetCommitted(transitions);

    return {
        schemaVersion                 : 1,
        action                        : 'restore-empty-target',
        recoveryUnitKey,
        attemptFingerprint,
        targetSetVersion              : descriptor?.version ?? null,
        destinationTopologyFingerprint: descriptor?.destinationTopologyFingerprint ?? null,
        destinationTransitions        : transitions.map(({sequence, state, at}) => ({sequence, state, at})),
        validationResult,
        terminal                      : RESTORE_TARGET_SET_TERMINALS.includes(last?.state) ? last.state : null,
        serviceEligible,
        startedAt                     : first?.at ?? null,
        completedAt                   : RESTORE_TARGET_SET_TERMINALS.includes(last?.state) ? last.at : null,
        wallClockMs                   : first && last ? Math.max(0, last.at - first.at) : null,
        failure                       : redactFailure(failure)
    }
}

/**
 * @summary Validates a full transition chain without reading storage.
 *
 * @param {Object[]} transitions Candidate transitions.
 * @param {Object} [expected={}]
 * @param {String} [expected.attemptFingerprint] Expected attempt.
 * @param {String} [expected.recoveryUnitKey] Expected recovery unit.
 * @returns {void}
 */
export function validateTransitionChain(transitions, {
    attemptFingerprint,
    recoveryUnitKey
} = {}) {
    if (!Array.isArray(transitions)) {
        throw new TypeError('restore target-set transitions must be an array')
    }

    let previous = null;

    transitions.forEach((entry, index) => {
        if (!entry || entry.schemaVersion !== 1 || entry.type !== 'restore-target-set-transition') {
            throw new Error(`restore target-set transition ${index + 1} has an invalid envelope`)
        }

        validateFingerprint(entry.attemptFingerprint, 'attemptFingerprint');
        validateRecoveryUnitKey(entry.recoveryUnitKey);
        validateState(entry.state);
        validateTimestamp(entry.at);
        validateDetails(entry.details);

        if (entry.sequence !== index + 1) {
            throw new Error(`restore target-set transition sequence gap at ${index + 1}`)
        }
        if (entry.previousState !== (previous?.state ?? null)) {
            throw new Error(`restore target-set previousState mismatch at sequence ${entry.sequence}`)
        }
        if (!ALLOWED_NEXT_STATES[previous?.state ?? '<start>'].includes(entry.state)) {
            throw new Error(`illegal restore target-set transition ${previous?.state ?? '<start>'} -> ${entry.state}`)
        }
        if (previous && (
            previous.attemptFingerprint !== entry.attemptFingerprint ||
            previous.recoveryUnitKey !== entry.recoveryUnitKey
        )) {
            throw new Error(`restore target-set identity drift at sequence ${entry.sequence}`)
        }
        if (attemptFingerprint && entry.attemptFingerprint !== attemptFingerprint) {
            throw new Error('restore target-set attemptFingerprint does not match requested ledger')
        }
        if (recoveryUnitKey && entry.recoveryUnitKey !== recoveryUnitKey) {
            throw new Error('restore target-set recoveryUnitKey does not match requested receipt')
        }

        previous = entry
    })
}

function redactFailure(failure) {
    if (!failure) {
        return null
    }

    return {
        code   : typeof failure.code === 'string' ? failure.code.slice(0, 120) : 'restore-target-set-failed',
        message: String(failure.message ?? failure).replaceAll(/(token|secret|password|key)=\S+/gi, '$1=[redacted]').slice(0, 500)
    }
}

function validateDir(dir, caller) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError(`${caller}: dir is required`)
    }
}

function validateFingerprint(value, name) {
    if (!/^sha256:[0-9a-f]{64}$/i.test(value ?? '')) {
        throw new TypeError(`${name} must be a sha256:<64-hex> fingerprint`)
    }
}

function validateRecoveryUnitKey(value) {
    if (typeof value !== 'string' || !value.startsWith('restore-empty-target:v1:')) {
        throw new TypeError('recoveryUnitKey must be a canonical restore-empty-target:v1 key')
    }
}

function validateState(value) {
    if (!RESTORE_TARGET_SET_STATES.includes(value)) {
        throw new TypeError(`unknown restore target-set state '${value}'`)
    }
}

function validateTimestamp(value) {
    if (!Number.isFinite(value) || value < 0) {
        throw new TypeError('restore target-set transition timestamp must be a non-negative finite number')
    }
}

function validateDetails(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('restore target-set transition details must be an object')
    }
}
