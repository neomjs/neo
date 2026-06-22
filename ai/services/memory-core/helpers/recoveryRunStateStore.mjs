import fs   from 'fs/promises';
import path from 'path';

import {getWallClockMs} from './remRunStateStore.mjs';

export const RECOVERY_CLASSES = Object.freeze([
    'ambiguous',
    'config-drift',
    'contention',
    'crash',
    'exhaustion',
    'external-load'
]);

export const RECOVERY_RUN_RUNG_IDS = Object.freeze([
    'rung-0',
    'rung-1',
    'rung-2',
    'rung-3',
    'page'
]);

export const RECOVERY_RUN_STATUSES = Object.freeze([
    'actioned',
    'cooldown',
    'escalated',
    'failed',
    'no-action',
    'pending',
    'recovered',
    'reobserve-requested'
]);

export const RECOVERY_TARGET_IDENTITY_KINDS = Object.freeze([
    'compose-service',
    'deploy-target',
    'supervised-task'
]);

/**
 * @summary Builds the gitignored file name used for one recovery-run state artifact.
 *
 * @param {String} recoveryRunId Stable recovery run id.
 * @returns {String} JSONL file name.
 */
export function getRecoveryRunStateFileName(recoveryRunId) {
    if (typeof recoveryRunId !== 'string' || recoveryRunId.length === 0) {
        throw new TypeError('getRecoveryRunStateFileName: recoveryRunId is required');
    }

    return `${recoveryRunId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.jsonl`;
}

/**
 * @summary Creates the typed recovery target identity used to route B0 vs external actuators.
 *
 * @param {Object} options
 * @param {String} options.kind supervised-task | compose-service | deploy-target.
 * @param {String} options.id Stable task/service/deploy target id.
 * @returns {Object} Typed target identity.
 */
export function createRecoveryTargetIdentity({kind, id} = {}) {
    validateEnum(kind, RECOVERY_TARGET_IDENTITY_KINDS, 'kind', 'createRecoveryTargetIdentity');

    if (typeof id !== 'string' || id.length === 0) {
        throw new TypeError('createRecoveryTargetIdentity: id is required');
    }

    return {kind, id};
}

/**
 * @summary Creates the diagnosis event handed from diagnostics to recovery.
 *
 * @param {Object} options
 * @param {String} options.diagnosisId Stable diagnosis event id.
 * @param {String} options.recoveryClass Recovery class enum.
 * @param {Number} options.confidence Diagnostic confidence in the inclusive 0..1 range.
 * @param {Object} options.targetIdentity Typed target identity.
 * @param {Object[]} [options.evidenceFacts=[]] Structured evidence facts.
 * @param {Number} options.observedAt Epoch milliseconds when diagnostics observed the fault.
 * @param {String} [options.source='diagnostics'] Event producer.
 * @param {Object} [options.details={}] Additional diagnostics-owned details.
 * @returns {Object} JSON-ready diagnosis event.
 */
export function createRecoveryDiagnosisEvent({
    diagnosisId,
    recoveryClass,
    confidence,
    targetIdentity,
    evidenceFacts = [],
    observedAt,
    source = 'diagnostics',
    details = {}
} = {}) {
    if (typeof diagnosisId !== 'string' || diagnosisId.length === 0) {
        throw new TypeError('createRecoveryDiagnosisEvent: diagnosisId is required');
    }
    validateEnum(recoveryClass, RECOVERY_CLASSES, 'recoveryClass', 'createRecoveryDiagnosisEvent');
    validateConfidence(confidence, 'createRecoveryDiagnosisEvent');
    validateTimestamp(observedAt, 'observedAt', 'createRecoveryDiagnosisEvent');
    validateArray(evidenceFacts, 'evidenceFacts', 'createRecoveryDiagnosisEvent');
    validateObject(details, 'details', 'createRecoveryDiagnosisEvent');

    return {
        schemaVersion : 1,
        type          : 'recovery-diagnosis',
        diagnosisId,
        recoveryClass,
        confidence,
        targetIdentity: createRecoveryTargetIdentity(targetIdentity),
        evidenceFacts,
        observedAt,
        source,
        details
    };
}

/**
 * @summary Creates the explicit cooldown-to-reobserve handshake owned by the recovery run.
 *
 * @param {Object} options
 * @param {String} options.recoveryRunId Stable recovery run id.
 * @param {Object} options.diagnosisEvent Typed diagnosis event.
 * @param {Number} options.requestedAt Epoch milliseconds for the request.
 * @param {Number} options.cooldownMs Non-negative cooldown before re-observation.
 * @param {Number} [options.healthyObservationThreshold=1] Required consecutive healthy observations.
 * @param {String} [options.reason='cooldown-expired'] Recovery-owned reason.
 * @returns {Object} JSON-ready reobserve request.
 */
export function createRecoveryReobserveRequest({
    recoveryRunId,
    diagnosisEvent,
    requestedAt,
    cooldownMs,
    healthyObservationThreshold = 1,
    reason = 'cooldown-expired'
} = {}) {
    if (typeof recoveryRunId !== 'string' || recoveryRunId.length === 0) {
        throw new TypeError('createRecoveryReobserveRequest: recoveryRunId is required');
    }
    validateDiagnosisEvent(diagnosisEvent, 'createRecoveryReobserveRequest');
    validateTimestamp(requestedAt, 'requestedAt', 'createRecoveryReobserveRequest');
    validateNonNegativeNumber(cooldownMs, 'cooldownMs', 'createRecoveryReobserveRequest');

    if (!Number.isInteger(healthyObservationThreshold) || healthyObservationThreshold < 1) {
        throw new TypeError('createRecoveryReobserveRequest: healthyObservationThreshold must be a positive integer');
    }

    return {
        schemaVersion        : 1,
        type                 : 'recovery-reobserve-request',
        recoveryRunId,
        diagnosisId          : diagnosisEvent.diagnosisId,
        recoveryClass        : diagnosisEvent.recoveryClass,
        targetIdentity       : diagnosisEvent.targetIdentity,
        requestedAt,
        cooldownMs,
        earliestObservationAt: requestedAt + cooldownMs,
        healthyObservationThreshold,
        reason
    };
}

/**
 * @summary Creates one durable recovery-run ledger entry.
 *
 * @param {Object} options
 * @param {String} options.recoveryRunId Stable recovery run id.
 * @param {Object} options.diagnosisEvent Typed diagnosis event.
 * @param {String} options.rung Recovery rung id.
 * @param {Number} options.attempt Positive attempt number for this target/rung.
 * @param {String} options.status Recovery run status.
 * @param {Number} options.startedAt Epoch milliseconds for the run/rung start.
 * @param {Number} options.updatedAt Epoch milliseconds for this ledger update.
 * @param {Number|null} [options.completedAt=null] Epoch milliseconds for terminal entries.
 * @param {Number|null} [options.backoffUntil=null] Epoch milliseconds for persisted anti-thrash.
 * @param {Object|null} [options.reobserveRequest=null] Optional reobserve request.
 * @param {Object} [options.details={}] Additional recovery-owned details.
 * @returns {Object} JSONL-ready recovery run state entry.
 */
export function createRecoveryRunStateEntry({
    recoveryRunId,
    diagnosisEvent,
    rung,
    attempt,
    status,
    startedAt,
    updatedAt,
    completedAt = null,
    backoffUntil = null,
    reobserveRequest = null,
    details = {}
} = {}) {
    if (typeof recoveryRunId !== 'string' || recoveryRunId.length === 0) {
        throw new TypeError('createRecoveryRunStateEntry: recoveryRunId is required');
    }
    validateDiagnosisEvent(diagnosisEvent, 'createRecoveryRunStateEntry');
    validateEnum(rung, RECOVERY_RUN_RUNG_IDS, 'rung', 'createRecoveryRunStateEntry');
    validateEnum(status, RECOVERY_RUN_STATUSES, 'status', 'createRecoveryRunStateEntry');
    validateTimestamp(startedAt, 'startedAt', 'createRecoveryRunStateEntry');
    validateTimestamp(updatedAt, 'updatedAt', 'createRecoveryRunStateEntry');
    validateObject(details, 'details', 'createRecoveryRunStateEntry');

    if (!Number.isInteger(attempt) || attempt < 1) {
        throw new TypeError('createRecoveryRunStateEntry: attempt must be a positive integer');
    }
    if (completedAt !== null) {
        validateTimestamp(completedAt, 'completedAt', 'createRecoveryRunStateEntry');
    }
    if (backoffUntil !== null) {
        validateTimestamp(backoffUntil, 'backoffUntil', 'createRecoveryRunStateEntry');
    }
    if (reobserveRequest !== null) {
        validateReobserveRequest(reobserveRequest, recoveryRunId, 'createRecoveryRunStateEntry');
    }

    return {
        schemaVersion : 1,
        type          : 'recovery-run-state',
        recoveryRunId,
        diagnosisId   : diagnosisEvent.diagnosisId,
        recoveryClass : diagnosisEvent.recoveryClass,
        targetIdentity: diagnosisEvent.targetIdentity,
        rung,
        attempt,
        status,
        startedAt,
        updatedAt,
        completedAt,
        wallClockMs   : completedAt === null ? null : getWallClockMs(startedAt, completedAt),
        backoffUntil,
        reobserveRequest,
        details
    };
}

/**
 * @summary Prunes the recovery-run state directory to the newest retained artifacts.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} options.retentionLimit Maximum artifacts to retain.
 * @returns {Promise<Number>} Count of artifacts removed.
 */
export async function pruneRecoveryRunStates({dir, retentionLimit} = {}) {
    if (!dir || !Number.isFinite(retentionLimit) || retentionLimit <= 0) {
        return 0;
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return 0;
        throw e;
    }

    const jsonlNames = names.filter(name => name.endsWith('.jsonl'));
    if (jsonlNames.length <= retentionLimit) {
        return 0;
    }

    const files = await Promise.all(jsonlNames.map(async name => {
        const filePath = path.join(dir, name);
        const stat     = await fs.stat(filePath);
        return {filePath, mtimeMs: stat.mtimeMs};
    }));

    const toRemove = files
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(retentionLimit);

    await Promise.all(toRemove.map(file => fs.rm(file.filePath, {force: true})));

    return toRemove.length;
}

/**
 * @summary Appends one recovery-run ledger entry and applies optional write-side retention.
 *
 * @param {Object} entry JSONL-ready recovery run state entry.
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} [options.retentionLimit] Maximum artifacts to retain.
 * @returns {Promise<String>} Written file path.
 */
export async function appendRecoveryRunState(entry, {dir, retentionLimit} = {}) {
    if (!dir) {
        throw new TypeError('appendRecoveryRunState: dir is required');
    }
    if (!entry || typeof entry.recoveryRunId !== 'string' || entry.recoveryRunId.length === 0) {
        throw new TypeError('appendRecoveryRunState: entry.recoveryRunId is required');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getRecoveryRunStateFileName(entry.recoveryRunId));
    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');

    if (Number.isFinite(retentionLimit) && retentionLimit > 0) {
        await pruneRecoveryRunStates({dir, retentionLimit});
    }

    return filePath;
}

/**
 * @summary Reads the most recent recovery-run ledger entries from the JSONL store.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} options.limit Maximum entries to return.
 * @returns {Promise<Object[]>} Most recent state entries, newest first.
 */
export async function readRecentRecoveryRunStates({dir, limit} = {}) {
    if (!dir || !Number.isFinite(limit) || limit <= 0) {
        return [];
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }

    const files = await Promise.all(names
        .filter(name => name.endsWith('.jsonl'))
        .map(async name => {
            const filePath = path.join(dir, name);
            const stat     = await fs.stat(filePath);
            return {filePath, mtimeMs: stat.mtimeMs};
        }));

    const entries = [];

    for (const file of files.sort((a, b) => b.mtimeMs - a.mtimeMs)) {
        if (entries.length >= limit) break;

        const text  = await fs.readFile(file.filePath, 'utf8');
        const lines = text.trim().split('\n').filter(Boolean);
        const line  = lines.length > 0 ? lines[lines.length - 1] : null;
        if (!line) continue;

        try {
            entries.push(JSON.parse(line));
        } catch (e) {
            // A corrupt recovery artifact should not take down the healthcheck surface.
        }
    }

    return entries
        .sort((a, b) => getEntrySortTime(b) - getEntrySortTime(a))
        .slice(0, limit);
}

function getEntrySortTime(entry) {
    if (Number.isFinite(entry.updatedAt)) return entry.updatedAt;
    if (Number.isFinite(entry.completedAt)) return entry.completedAt;
    if (Number.isFinite(entry.startedAt)) return entry.startedAt;
    return 0;
}

function validateArray(value, name, callerName) {
    if (!Array.isArray(value)) {
        throw new TypeError(`${callerName}: ${name} must be an array`);
    }
}

function validateConfidence(value, callerName) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new TypeError(`${callerName}: confidence must be a finite number between 0 and 1`);
    }
}

function validateDiagnosisEvent(value, callerName) {
    validateObject(value, 'diagnosisEvent', callerName);

    if (value.type !== 'recovery-diagnosis') {
        throw new TypeError(`${callerName}: diagnosisEvent.type must be 'recovery-diagnosis'`);
    }

    createRecoveryDiagnosisEvent(value);
}

function validateEnum(value, allowed, name, callerName) {
    if (!allowed.includes(value)) {
        throw new TypeError(`${callerName}: invalid ${name} '${value}'`);
    }
}

function validateNonNegativeNumber(value, name, callerName) {
    if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(`${callerName}: ${name} must be a non-negative number`);
    }
}

function validateObject(value, name, callerName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${callerName}: ${name} must be an object`);
    }
}

function validateReobserveRequest(value, recoveryRunId, callerName) {
    validateObject(value, 'reobserveRequest', callerName);

    if (value.type !== 'recovery-reobserve-request') {
        throw new TypeError(`${callerName}: reobserveRequest.type must be 'recovery-reobserve-request'`);
    }
    if (value.recoveryRunId !== recoveryRunId) {
        throw new TypeError(`${callerName}: reobserveRequest.recoveryRunId must match recoveryRunId`);
    }
}

function validateTimestamp(value, name, callerName) {
    if (!Number.isFinite(value)) {
        throw new TypeError(`${callerName}: ${name} must be a finite number`);
    }
}
