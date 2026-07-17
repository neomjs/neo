import crypto from 'crypto';
import path   from 'path';

/**
 * @module ai/mcp/server/neural-link/diagnosticPathAttestation
 * @summary Creates secret-free commitments that prove a diagnostic child resolved every writable
 * sink to the disposable paths selected by its launcher.
 */

/** @type {String} Entrypoint-only environment channel carrying the launcher's expected commitment. */
export const GENESIS_DIAGNOSTIC_ATTESTATION_ENV = 'NEO_GENESIS_DIAGNOSTIC_ATTESTATION';

/** @type {String} Secret-free child readiness marker prefix. */
export const GENESIS_DIAGNOSTIC_PATHS_MARKER = 'GENESIS_DIAGNOSTIC_PATHS';

/** @type {String} Stable public error code for a failed diagnostic isolation contract. */
export const GENESIS_DIAGNOSTIC_PATH_MISMATCH = 'GENESIS_DIAGNOSTIC_PATH_MISMATCH';

/** @type {Object<String,String[]>} Complete writable-sink role contract for each probe child. */
export const GENESIS_DIAGNOSTIC_SINK_ROLES = Object.freeze({
    bridge: Object.freeze(['logs']),
    mcp   : Object.freeze(['database', 'logs'])
});

const COMMITMENT_PATTERN = /^[a-f0-9]{64}$/;
const NAME_PATTERN       = /^[a-z][a-z0-9-]*$/;

/**
 * @summary Creates one safe, path-free mismatch error. Neither resolved paths nor commitments are
 * included because this error can cross the public probe boundary.
 * @returns {Error}
 */
function createMismatchError() {
    const error = new Error('Genesis diagnostic paths do not match the disposable launch contract.');

    error.code = GENESIS_DIAGNOSTIC_PATH_MISMATCH;

    return error
}

/**
 * @summary Commits to one child's role and its fully resolved writable sinks. The returned marker
 * exposes only the role, sink-role names, and SHA-256 commitment; absolute paths stay private.
 * @param {Object} options
 * @param {String} options.role Stable child role.
 * @param {Object<String,String>} options.sinks Writable sink role to configured path.
 * @returns {{commitment:String, marker:String, role:String, sinkRoles:String[]}}
 */
export function createDiagnosticPathAttestation({role, sinks}) {
    const requiredSinkRoles = GENESIS_DIAGNOSTIC_SINK_ROLES[role];

    if (typeof role !== 'string' || !NAME_PATTERN.test(role) || !requiredSinkRoles) {
        throw new TypeError('Diagnostic attestation requires a stable child role.')
    }
    if (!sinks || typeof sinks !== 'object' || Array.isArray(sinks)) {
        throw new TypeError('Diagnostic attestation requires named writable sinks.')
    }

    const entries = Object.entries(sinks).sort(([left], [right]) => left.localeCompare(right));

    if (entries.length === 0 || entries.some(([name, value]) =>
        !NAME_PATTERN.test(name) || typeof value !== 'string' || value.length === 0
    ) || entries.some(([name], index) => name !== requiredSinkRoles[index]) ||
        entries.length !== requiredSinkRoles.length
    ) {
        throw new TypeError('Diagnostic attestation requires the complete writable-sink role set.')
    }

    const
        resolvedSinks = entries.map(([name, value]) => [name, path.resolve(value)]),
        sinkRoles     = resolvedSinks.map(([name]) => name),
        commitment    = crypto.createHash('sha256')
            .update(JSON.stringify({role, sinks: resolvedSinks}), 'utf8')
            .digest('hex'),
        marker        = `${GENESIS_DIAGNOSTIC_PATHS_MARKER} ${JSON.stringify({
            role,
            sinkRoles,
            commitment
        })}`;

    return {commitment, marker, role, sinkRoles}
}

/**
 * @summary Verifies a child's resolved AiConfig sinks against the launcher commitment. Normal
 * launches omit the expected commitment and receive `null`; probe launches either return the exact
 * secret-free readiness marker or fail before any configured diagnostic writer starts.
 * @param {Object} options
 * @param {String|null} [options.expectedCommitment]
 * @param {String} options.role Stable child role.
 * @param {Object<String,String>} options.sinks Writable sink role to resolved AiConfig path.
 * @returns {String|null}
 */
export function attestDiagnosticPaths({expectedCommitment, role, sinks}) {
    if (expectedCommitment == null) return null;

    if (typeof expectedCommitment !== 'string' || !COMMITMENT_PATTERN.test(expectedCommitment)) {
        throw createMismatchError()
    }

    let attestation;

    try {
        attestation = createDiagnosticPathAttestation({role, sinks})
    } catch {
        throw createMismatchError()
    }

    if (attestation.commitment !== expectedCommitment) {
        throw createMismatchError()
    }

    return attestation.marker
}
