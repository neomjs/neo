import {randomUUID} from 'node:crypto';
import fs           from 'node:fs/promises';
import path         from 'node:path';

import {refuseLedgerRecord} from './deploymentPrescriptionLedger.mjs';

/**
 * @module ai/services/memory-core/helpers/deploymentPrescriptionStore
 * @summary Trusted, durable append ingress for semantic deployment prescriptions.
 *
 * The caller supplies intent; this sink owns transport authority. It therefore rejects caller-provided
 * sequence, provenance, schema, record-type, and audit-time fields, stamps them only after holding the
 * ledger lock, and revalidates the resulting record against the current recovery-knob registry through
 * {@link module:ai/services/memory-core/helpers/deploymentPrescriptionLedger.refuseLedgerRecord}.
 *
 * Compare-and-append and sequence assignment happen under one bounded, atomic `wx` lock. A live holder is
 * waited out; a lock that cannot be acquired within the bound refuses without falling through unlocked.
 * This is intentionally stricter than the best-effort Memory WAL lock: an interleaved WAL line can be
 * skipped, while an interleaved prescription can select the wrong deployment state.
 */

const
    DEFAULT_LOCK_RETRY_MS   = 10,
    DEFAULT_LOCK_TIMEOUT_MS = 2_000,
    RECORD_TYPE             = 'deployment-prescription',
    SCHEMA_VERSION          = 1;

const SINK_OWNED_FIELDS = new Set([
    'prescribedAt',
    'producerPrincipal',
    'recordType',
    'schemaVersion',
    'sequence'
]);

const SEMANTIC_FIELDS = new Set([
    'diagnosisId',
    'knob',
    'prescriptionId',
    'recoveryRunId',
    'supersedesPrescriptionId',
    'targetIdentity',
    'validatedAgainst',
    'values'
]);

const STORED_FIELDS = new Set([...SINK_OWNED_FIELDS, ...SEMANTIC_FIELDS]);

/**
 * @summary Returns the four-field result contract used for both appends and refusals.
 * @param {Object} [options]
 * @param {Boolean} [options.appended=false]
 * @param {Boolean} [options.replayed=false]
 * @param {Object|null} [options.record=null]
 * @param {String|null} [options.reason=null]
 * @returns {{appended: Boolean, replayed: Boolean, record: Object|null, reason: String|null}}
 */
function appendResult({appended = false, replayed = false, record = null, reason = null} = {}) {
    return {appended, replayed, record, reason}
}

/**
 * @summary Converts JSON-safe data into a recursively key-sorted value.
 *
 * This is the idempotence boundary. Object insertion order is not semantic, so two callers expressing
 * the same context or values in a different key order must compare equal. Non-JSON values are refused
 * instead of relying on `JSON.stringify()`'s lossy coercions (`NaN` to `null`, functions to absence).
 * @param {*} value
 * @param {Set<Object>} [ancestors]
 * @returns {*}
 */
function canonicalizeJson(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError('semantic prescription contains a non-finite number')
        }

        return value
    }

    if (typeof value !== 'object') {
        throw new TypeError(`semantic prescription contains unsupported ${typeof value}`)
    }

    if (ancestors.has(value)) {
        throw new TypeError('semantic prescription contains a circular reference')
    }

    ancestors.add(value);

    let canonical;

    if (Array.isArray(value)) {
        canonical = value.map(item => {
            if (item === undefined) {
                throw new TypeError('semantic prescription contains undefined in an array')
            }

            return canonicalizeJson(item, ancestors)
        })
    } else {
        const prototype = Object.getPrototypeOf(value);

        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError('semantic prescription contains a non-plain object')
        }

        canonical = {};

        for (const key of Object.keys(value).sort()) {
            if (value[key] !== undefined) {
                canonical[key] = canonicalizeJson(value[key], ancestors)
            }
        }
    }

    ancestors.delete(value);

    return canonical
}

/**
 * @summary Produces the stable byte representation used for semantic replay comparison.
 * @param {Object} value
 * @returns {String}
 */
function canonicalJson(value) {
    return JSON.stringify(canonicalizeJson(value))
}

/**
 * @summary Validates and canonicalizes the caller-owned portion of a prescription.
 * @param {Object} prescription
 * @returns {{prescription: Object|null, reason: String|null}}
 */
function normalizeSemanticPrescription(prescription) {
    if (!prescription || typeof prescription !== 'object' || Array.isArray(prescription)) {
        return {prescription: null, reason: 'invalid-prescription'}
    }

    for (const field of SINK_OWNED_FIELDS) {
        if (Object.hasOwn(prescription, field)) {
            return {prescription: null, reason: `caller-field-forbidden:${field}`}
        }
    }

    for (const field of Object.keys(prescription)) {
        if (!SEMANTIC_FIELDS.has(field)) {
            return {prescription: null, reason: `unsupported-field:${field}`}
        }
    }

    if (typeof prescription.prescriptionId !== 'string' || prescription.prescriptionId.trim().length === 0) {
        return {prescription: null, reason: 'invalid-prescription-id'}
    }

    const supersedesPrescriptionId = prescription.supersedesPrescriptionId ?? null;

    if (supersedesPrescriptionId !== null
        && (typeof supersedesPrescriptionId !== 'string' || supersedesPrescriptionId.trim().length === 0)) {
        return {prescription: null, reason: 'invalid-supersedes-prescription-id'}
    }

    const observedAt = prescription.validatedAgainst?.observedAt;

    if (observedAt !== undefined && !Number.isFinite(observedAt)) {
        return {prescription: null, reason: 'invalid-observation-watermark'}
    }

    try {
        const semantic = {supersedesPrescriptionId};

        for (const field of SEMANTIC_FIELDS) {
            if (field !== 'supersedesPrescriptionId' && Object.hasOwn(prescription, field)) {
                semantic[field] = prescription[field]
            }
        }

        return {
            prescription: JSON.parse(canonicalJson(semantic)),
            reason      : null
        }
    } catch {
        return {prescription: null, reason: 'invalid-semantic-payload'}
    }
}

/**
 * @summary Projects a stored record back to its caller-owned semantic payload.
 * @param {Object} record
 * @returns {Object}
 */
function semanticPayload(record) {
    const payload = {};

    for (const field of SEMANTIC_FIELDS) {
        if (Object.hasOwn(record, field)) {
            payload[field] = record[field]
        }
    }

    const normalized = normalizeSemanticPrescription(payload);

    if (normalized.reason) {
        throw new Error(`Deployment prescription ledger contains invalid semantic payload: ${normalized.reason}`)
    }

    return normalized.prescription
}

/**
 * @summary Returns the target-and-knob competition key guarded by compare-and-append.
 * @param {Object} record
 * @returns {String}
 */
function competitionKey(record) {
    return `${record.knob}::${record.targetIdentity.kind}:${record.targetIdentity.id}`
}

/**
 * @summary Reads a JSONL prescription ledger in append order.
 *
 * Absence means no prescriptions and returns `[]`. A malformed or non-object line throws with its line
 * number: silently skipping a torn line could skip the active predecessor and make a later CAS appear valid.
 * @param {String} ledgerPath Durable JSONL path.
 * @param {Object} [fsModule=fs] Injectable `node:fs/promises`-compatible module.
 * @returns {Promise<Object[]>}
 */
export async function readDeploymentPrescriptions(ledgerPath, fsModule = fs) {
    if (typeof ledgerPath !== 'string' || ledgerPath.length === 0) {
        throw new TypeError('readDeploymentPrescriptions: ledgerPath is required')
    }

    let text;

    try {
        text = await fsModule.readFile(ledgerPath, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return []
        }

        throw error
    }

    const records = [];

    for (const [index, line] of text.split('\n').entries()) {
        if (line.trim().length === 0) continue;

        let record;

        try {
            record = JSON.parse(line)
        } catch (cause) {
            throw new SyntaxError(`Invalid deployment prescription JSONL at line ${index + 1}`, {cause})
        }

        if (!record || typeof record !== 'object' || Array.isArray(record)) {
            throw new SyntaxError(`Invalid deployment prescription record at line ${index + 1}: object required`)
        }

        records.push(record)
    }

    return records
}

/**
 * @summary Audits sink-owned invariants in an existing ledger and rebuilds its active CAS index.
 * @param {Object[]} records
 * @returns {{activeByKey: Map<String, Object>, byId: Map<String, Object>, maxSequence: Number}}
 */
function inspectTrustedLedger(records) {
    const
        activeByKey = new Map(),
        byId        = new Map();

    let maxSequence = 0;

    for (const [index, record] of records.entries()) {
        const line = index + 1;

        for (const field of Object.keys(record)) {
            if (!STORED_FIELDS.has(field)) {
                throw new Error(`Deployment prescription ledger line ${line} contains unsupported field '${field}'`)
            }
        }

        if (record.schemaVersion !== SCHEMA_VERSION || record.recordType !== RECORD_TYPE) {
            throw new Error(`Deployment prescription ledger line ${line} has an unsupported schema or record type`)
        }

        if (!Number.isSafeInteger(record.sequence) || record.sequence < 1 || record.sequence <= maxSequence) {
            throw new Error(`Deployment prescription ledger line ${line} breaks monotonic sequence ordering`)
        }

        if (typeof record.producerPrincipal !== 'string' || record.producerPrincipal.trim().length === 0) {
            throw new Error(`Deployment prescription ledger line ${line} has no sink-stamped producer principal`)
        }

        if (!Number.isFinite(record.prescribedAt)) {
            throw new Error(`Deployment prescription ledger line ${line} has no finite sink-stamped audit time`)
        }

        const refusal = refuseLedgerRecord(record);

        if (refusal) {
            throw new Error(`Deployment prescription ledger line ${line} is refused by current authority: ${refusal.reason}`)
        }

        if (byId.has(record.prescriptionId)) {
            throw new Error(`Deployment prescription ledger repeats prescriptionId '${record.prescriptionId}'`)
        }

        const
            semantic = semanticPayload(record),
            key      = competitionKey(record),
            active   = activeByKey.get(key),
            expected = active?.prescriptionId ?? null;

        if (semantic.supersedesPrescriptionId !== expected) {
            throw new Error(`Deployment prescription ledger line ${line} breaks predecessor CAS for '${key}'`)
        }

        const
            activeObservedAt = active?.validatedAgainst?.observedAt,
            observedAt       = record.validatedAgainst?.observedAt;

        if (Number.isFinite(activeObservedAt)
            && (!Number.isFinite(observedAt) || observedAt < activeObservedAt)) {
            throw new Error(`Deployment prescription ledger line ${line} regresses validation watermark for '${key}'`)
        }

        activeByKey.set(key, record);
        byId.set(record.prescriptionId, record);
        maxSequence = record.sequence
    }

    return {activeByKey, byId, maxSequence}
}

/**
 * @summary Validates the complete sink-owned ledger contract before any record may be admitted or rendered.
 *
 * Reading JSONL proves only that bytes parse. This audit additionally proves the schema and producer fields
 * were sink-stamped, sequence is globally monotonic, every record still clears current registry authority,
 * ids are unique, predecessor CAS is continuous per target-and-knob, and observation watermarks never regress.
 * It returns only bounded counts; callers that need records retain the array they supplied.
 * @param {Object[]} records Parsed records from {@link readDeploymentPrescriptions}.
 * @returns {{valid: true, recordCount: Number, activeCount: Number, maxSequence: Number}}
 * @throws {TypeError} when `records` is not an array.
 * @throws {Error} when any record breaks the trusted-ledger contract.
 */
export function validateDeploymentPrescriptionLedger(records) {
    if (!Array.isArray(records)) {
        throw new TypeError('validateDeploymentPrescriptionLedger: records must be an array')
    }

    const {activeByKey, maxSequence} = inspectTrustedLedger(records);

    return {
        valid      : true,
        recordCount: records.length,
        activeCount: activeByKey.size,
        maxSequence
    }
}

/**
 * @summary Claims a bounded exclusive lock via atomic `wx`, returning an idempotent release callback.
 *
 * There is deliberately no unlocked fall-through and no content-blind stale reclaim. On a live collision
 * the caller waits only to `timeoutMs`; on an abandoned lock it returns `null`, leaving an explicit operator
 * repair rather than risking removal of a successor's lock through a path-level TOCTOU race.
 * @param {String} ledgerPath
 * @param {Object} fsModule
 * @param {Number} timeoutMs
 * @param {Number} retryMs
 * @returns {Promise<Function|null>}
 */
async function acquireAppendLock(ledgerPath, fsModule, timeoutMs, retryMs) {
    const
        lockPath = `${ledgerPath}.lock`,
        started  = Date.now(),
        token    = `${process.pid}:${randomUUID()}`;

    while (true) {
        try {
            await fsModule.writeFile(lockPath, token, {encoding: 'utf8', flag: 'wx', mode: 0o600});

            return async () => {
                try {
                    if (await fsModule.readFile(lockPath, 'utf8') === token) {
                        await fsModule.unlink(lockPath)
                    }
                } catch (error) {
                    if (error?.code !== 'ENOENT') throw error
                }
            }
        } catch (error) {
            if (error?.code !== 'EEXIST') {
                throw error
            }

            const elapsed = Date.now() - started;

            if (elapsed >= timeoutMs) {
                return null
            }

            await new Promise(resolve => setTimeout(resolve, Math.min(retryMs, timeoutMs - elapsed)))
        }
    }
}

/**
 * @summary Appends one complete JSONL record and fsyncs it before reporting success.
 * @param {String} ledgerPath
 * @param {Object} record
 * @param {Object} fsModule
 * @returns {Promise<void>}
 */
async function appendDurably(ledgerPath, record, fsModule) {
    const handle = await fsModule.open(ledgerPath, 'a', 0o600);

    try {
        await handle.appendFile(`${JSON.stringify(record)}\n`, 'utf8');
        await handle.sync()
    } finally {
        await handle.close()
    }
}

/**
 * @summary Validates, compare-and-appends, and durably records one semantic deployment prescription.
 *
 * A domain refusal always returns `{appended:false, replayed:false, record:null, reason}` and writes zero
 * ledger bytes. Exact idempotent replay returns the original sink-stamped record without appending. I/O
 * errors and a corrupt existing ledger throw because reporting those as an ordinary refusal would hide a
 * broken authority surface.
 * @param {Object} options
 * @param {String} options.ledgerPath Durable JSONL path.
 * @param {Object} options.prescription Caller-owned semantic prescription.
 * @param {String} [options.producerPrincipal='operator-local'] Principal injected by the trusted sink.
 * @param {Function|Number} [options.now=Date.now] Sink audit clock.
 * @param {Object} [options.fsModule=fs] Injectable `node:fs/promises`-compatible module.
 * @param {Number} [options.lockTimeoutMs=2000] Maximum live-lock wait before a no-write refusal.
 * @param {Number} [options.lockRetryMs=10] Retry interval while a live holder completes.
 * @returns {Promise<{appended: Boolean, replayed: Boolean, record: Object|null, reason: String|null}>}
 */
export async function appendDeploymentPrescription({
    ledgerPath,
    prescription,
    producerPrincipal = 'operator-local',
    now               = Date.now,
    fsModule          = fs,
    lockTimeoutMs     = DEFAULT_LOCK_TIMEOUT_MS,
    lockRetryMs       = DEFAULT_LOCK_RETRY_MS
} = {}) {
    if (typeof ledgerPath !== 'string' || ledgerPath.length === 0) {
        throw new TypeError('appendDeploymentPrescription: ledgerPath is required')
    }

    const normalized = normalizeSemanticPrescription(prescription);

    if (normalized.reason) {
        return appendResult({reason: normalized.reason})
    }

    if (typeof producerPrincipal !== 'string' || producerPrincipal.trim().length === 0) {
        return appendResult({reason: 'invalid-producer-principal'})
    }

    if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs < 0
        || !Number.isFinite(lockRetryMs) || lockRetryMs <= 0) {
        throw new TypeError('appendDeploymentPrescription: lock bounds must be finite and non-negative')
    }

    const prescribedAt = typeof now === 'function' ? now() : now;

    if (!Number.isFinite(prescribedAt)) {
        return appendResult({reason: 'invalid-prescribed-at'})
    }

    await fsModule.mkdir(path.dirname(ledgerPath), {recursive: true});

    const releaseLock = await acquireAppendLock(
        ledgerPath,
        fsModule,
        lockTimeoutMs,
        lockRetryMs
    );

    if (!releaseLock) {
        return appendResult({reason: 'append-lock-timeout'})
    }

    try {
        const
            records                          = await readDeploymentPrescriptions(ledgerPath, fsModule),
            {activeByKey, byId, maxSequence} = inspectTrustedLedger(records),
            semantic                         = normalized.prescription,
            existing                         = byId.get(semantic.prescriptionId);

        if (existing) {
            if (canonicalJson(semanticPayload(existing)) === canonicalJson(semantic)) {
                return appendResult({replayed: true, record: existing})
            }

            return appendResult({reason: 'prescription-id-conflict'})
        }

        const nextSequence = maxSequence + 1;

        if (!Number.isSafeInteger(nextSequence)) {
            return appendResult({reason: 'sequence-exhausted'})
        }

        const record = {
            schemaVersion: SCHEMA_VERSION,
            recordType   : RECORD_TYPE,
            ...semantic,
            sequence     : nextSequence,
            producerPrincipal,
            prescribedAt
        };

        const refusal = refuseLedgerRecord(record);

        if (refusal) {
            return appendResult({reason: `ledger-refused:${refusal.reason}`})
        }

        const
            key                 = competitionKey(record),
            active              = activeByKey.get(key),
            expectedPredecessor = active?.prescriptionId ?? null;

        if (semantic.supersedesPrescriptionId !== expectedPredecessor) {
            return appendResult({reason: 'predecessor-mismatch'})
        }

        const
            activeObservedAt = active?.validatedAgainst?.observedAt,
            observedAt       = record.validatedAgainst?.observedAt;

        if (Number.isFinite(activeObservedAt) && !Number.isFinite(observedAt)) {
            return appendResult({reason: 'observation-watermark-required'})
        }

        if (Number.isFinite(activeObservedAt) && observedAt < activeObservedAt) {
            return appendResult({reason: 'stale-observation-watermark'})
        }

        await appendDurably(ledgerPath, record, fsModule);

        return appendResult({appended: true, record})
    } finally {
        await releaseLock()
    }
}
