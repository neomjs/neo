/**
 * @module ai/services/knowledge-base/helpers/kbEmbeddingPoisonStore
 * @summary Durable, content-scoped disposition for a proven embedding poison.
 *
 * The file is an intentionally narrow retry fence, not a provider-error log. Tenant/repository and
 * embedding-generation coordinates are SHA-256 hashes, entry identities are tenant-aware chunk
 * hashes, and reason codes come from the closed embed-failure vocabulary. Raw content, provider
 * messages, endpoints, credentials, tenant ids, and repository slugs therefore have no writable
 * field in the schema. A corrupt or unreadable marker returns `unavailable` with no entries: retrying
 * provider work is safer than silently suppressing content on state we cannot prove.
 */

import crypto  from 'crypto';
import fs      from 'fs/promises';
import fsExtra from 'fs-extra';
import path    from 'path';
import {isEmbedFailureCode}
                         from './embedFailureClassification.mjs';
import {writeFileAtomic} from '../../shared/atomicFileWrite.mjs';
import {
    enterLifecycleGuard,
    exitLifecycleGuard,
    verifyLifecycleGuardOwnership
} from '../../../daemons/shared/lifecycleGuard.mjs';

export const EMBEDDING_POISON_SCHEMA_VERSION = 1;
export const EMBEDDING_POISON_MAX_ENTRIES    = 256;

const EMBEDDING_POISON_MAX_BYTES = 256 * 1024;
const HASH_PATTERN               = /^[a-f0-9]{64}$/;
const MAX_HASH_INPUT_LENGTH      = 1024;
const SAFE_ENTRY_KEYS            = Object.freeze(['chunkId', 'observedAt', 'reasonCode']);
const SAFE_ENVELOPE_KEYS         = Object.freeze([
    'createdAt',
    'entries',
    'generationId',
    'schemaVersion',
    'scopeId',
    'updatedAt'
]);

// Atomic rename prevents torn reads; this queue additionally preserves call order inside one process.
// A lifecycle guard below protects the read-merge-write across KB server/orchestrator processes and
// container PID namespaces that share the declared plane-state mount.
const writeQueues = new Map();

/**
 * @summary Hashes the authoritative tenant/repository tuple used to name one poison-state file.
 * @param {Object} options
 * @param {String} options.tenantId Authoritative tenant identity (never persisted verbatim).
 * @param {String} options.repoSlug Authoritative repository identity (never persisted verbatim).
 * @returns {String} Lowercase SHA-256 scope id.
 */
export function createEmbeddingPoisonScopeId({tenantId, repoSlug} = {}) {
    assertHashInput(tenantId, 'createEmbeddingPoisonScopeId: tenantId');
    assertHashInput(repoSlug, 'createEmbeddingPoisonScopeId: repoSlug');

    return sha256(JSON.stringify({tenantId, repoSlug}))
}

/**
 * @summary Hashes every coordinate whose change must make poisoned content eligible again.
 * @param {Object} options
 * @param {String} options.provider Embedding provider identity (never persisted verbatim).
 * @param {String} options.model Embedding model identity (never persisted verbatim).
 * @param {Number} options.vectorDimension Expected vector dimension.
 * @param {String} options.strategyVersion Input/chunking strategy version.
 * @returns {String} Lowercase SHA-256 generation id.
 */
export function createEmbeddingGenerationId({provider, model, vectorDimension, strategyVersion} = {}) {
    assertHashInput(provider, 'createEmbeddingGenerationId: provider');
    assertHashInput(model, 'createEmbeddingGenerationId: model');
    assertHashInput(strategyVersion, 'createEmbeddingGenerationId: strategyVersion');

    if (!Number.isInteger(vectorDimension) || vectorDimension <= 0) {
        throw new TypeError('createEmbeddingGenerationId: vectorDimension must be a positive integer')
    }

    return sha256(JSON.stringify({provider, model, vectorDimension, strategyVersion}))
}

/**
 * @summary Resolves the per-scope poison marker path without exposing the raw scope tuple.
 * @param {Object} options
 * @param {String} options.dir Declared KB embedding state directory.
 * @param {String} options.scopeId SHA-256 value from {@link createEmbeddingPoisonScopeId}.
 * @returns {String} Absolute marker path.
 */
export function getEmbeddingPoisonStateFilePath({dir, scopeId} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getEmbeddingPoisonStateFilePath: dir is required')
    }

    assertHash(scopeId, 'getEmbeddingPoisonStateFilePath: scopeId');

    return path.resolve(dir, `kb-embedding-poison-${scopeId}.json`)
}

/**
 * @summary Reads poison entries for one exact embedding generation.
 *
 * `unavailable` and `stale` deliberately return no entries. Callers may suppress provider work only
 * from an `available` result whose full schema, scope, generation, and safe-entry vocabulary passed.
 *
 * @param {Object} options
 * @param {String} options.dir Declared KB embedding state directory.
 * @param {String} options.scopeId Hashed tenant/repository scope.
 * @param {String} options.generationId Hashed embedding-generation coordinates.
 * @returns {Promise<{status: 'missing'|'available'|'stale'|'unavailable', entries: Object[]}>}
 */
export async function readEmbeddingPoisonState({dir, scopeId, generationId} = {}) {
    assertHash(generationId, 'readEmbeddingPoisonState: generationId');

    const state = await readEnvelope({dir, scopeId});

    if (state.status !== 'available') {
        return {status: state.status, entries: []}
    }

    if (state.envelope.generationId !== generationId) {
        return {status: 'stale', entries: []}
    }

    return {status: 'available', entries: state.envelope.entries.map(entry => ({...entry}))}
}

/**
 * @summary Atomically merges proven poison rows for one scope and generation.
 *
 * The newest observation wins for a repeated chunk id. When the fixed retention cap is exceeded,
 * the oldest rows fall out and become provider-eligible again; bounded rework is safer than an
 * unbounded permanent deny-list. A generation mismatch starts a fresh envelope.
 *
 * @param {Object} options
 * @param {String} options.dir Declared KB embedding state directory.
 * @param {String} options.scopeId Hashed tenant/repository scope.
 * @param {String} options.generationId Hashed embedding-generation coordinates.
 * @param {Array<Object>} options.entries Safe `{chunkId, reasonCode, observedAt?}` rows.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<{status: 'available', entries: Object[]}>} The bounded stored projection.
 */
export async function upsertEmbeddingPoisonEntries({
    dir,
    scopeId,
    generationId,
    entries,
    now = Date.now()
} = {}) {
    assertHash(generationId, 'upsertEmbeddingPoisonEntries: generationId');

    if (!Array.isArray(entries) || entries.length === 0) {
        throw new TypeError('upsertEmbeddingPoisonEntries: entries must be a non-empty array')
    }

    const observedAt = normalizeTimestamp(now, 'upsertEmbeddingPoisonEntries: now');
    const incoming   = entries.map(entry => normalizeEntry(entry, observedAt));
    const filePath   = getEmbeddingPoisonStateFilePath({dir, scopeId});

    return await serializeMutation(filePath, async guard => {
        const prior          = await readEnvelope({dir, scopeId});
        const sameGeneration = prior.status === 'available' && prior.envelope.generationId === generationId;
        const createdAt      = sameGeneration ? prior.envelope.createdAt : observedAt;
        const merged         = new Map();

        if (sameGeneration) {
            for (const entry of prior.envelope.entries) {
                merged.set(entry.chunkId, entry)
            }
        }

        for (const entry of incoming) {
            merged.set(entry.chunkId, entry)
        }

        const boundedEntries = Array.from(merged.values())
            .sort(compareByAgeThenId)
            .slice(-EMBEDDING_POISON_MAX_ENTRIES)
            .sort((left, right) => left.chunkId.localeCompare(right.chunkId));

        const envelope = {
            schemaVersion: EMBEDDING_POISON_SCHEMA_VERSION,
            scopeId,
            generationId,
            createdAt,
            updatedAt    : observedAt,
            entries      : boundedEntries
        };

        const json = `${JSON.stringify(envelope, null, 2)}\n`;

        if (Buffer.byteLength(json, 'utf8') > EMBEDDING_POISON_MAX_BYTES) {
            throw new Error(`upsertEmbeddingPoisonEntries: state exceeds ${EMBEDDING_POISON_MAX_BYTES} bytes`)
        }

        if (!await verifyLifecycleGuardOwnership({
            ownerFilePath: guard.ownerFilePath,
            fsModule     : fsExtra
        })) {
            throw new Error('upsertEmbeddingPoisonEntries: mutation guard ownership was lost')
        }

        await writeFileAtomic(filePath, json, {fsync: true});

        return {status: 'available', entries: boundedEntries.map(entry => ({...entry}))}
    })
}

/**
 * @summary Clears one scope marker so an explicit operator replay offers every chunk again.
 * @param {Object} options
 * @param {String} options.dir Declared KB embedding state directory.
 * @param {String} options.scopeId Hashed tenant/repository scope.
 * @returns {Promise<Boolean>} True when a marker existed and was removed.
 */
export async function clearEmbeddingPoisonState({dir, scopeId} = {}) {
    const filePath = getEmbeddingPoisonStateFilePath({dir, scopeId});

    return await serializeMutation(filePath, async guard => {
        try {
            if (!await verifyLifecycleGuardOwnership({
                ownerFilePath: guard.ownerFilePath,
                fsModule     : fsExtra
            })) {
                throw new Error('clearEmbeddingPoisonState: mutation guard ownership was lost')
            }

            await fs.unlink(filePath);
            return true
        } catch (error) {
            if (error?.code === 'ENOENT') return false;
            throw error
        }
    })
}

/**
 * @summary Reads and strictly validates a poison-state envelope.
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @param {String} options.scopeId Expected scope hash.
 * @returns {Promise<Object>} `{status: 'missing'|'available'|'unavailable', envelope?}`.
 * @private
 */
async function readEnvelope({dir, scopeId}) {
    const filePath = getEmbeddingPoisonStateFilePath({dir, scopeId});

    try {
        const stat = await fs.stat(filePath);

        if (!stat.isFile() || stat.size <= 0 || stat.size > EMBEDDING_POISON_MAX_BYTES) {
            return {status: 'unavailable'}
        }

        const envelope = JSON.parse(await fs.readFile(filePath, 'utf8'));

        if (!isValidEnvelope(envelope, scopeId)) {
            return {status: 'unavailable'}
        }

        return {status: 'available', envelope}
    } catch (error) {
        return {status: error?.code === 'ENOENT' ? 'missing' : 'unavailable'}
    }
}

/**
 * @summary Validates the closed schema before any entry may suppress provider work.
 * @param {*} envelope Parsed JSON value.
 * @param {String} expectedScopeId Expected per-file scope hash.
 * @returns {Boolean}
 * @private
 */
function isValidEnvelope(envelope, expectedScopeId) {
    if (!isExactObject(envelope, SAFE_ENVELOPE_KEYS)) return false;
    if (envelope.schemaVersion !== EMBEDDING_POISON_SCHEMA_VERSION) return false;
    if (envelope.scopeId !== expectedScopeId || !HASH_PATTERN.test(envelope.scopeId)) return false;
    if (!HASH_PATTERN.test(envelope.generationId)) return false;
    if (!isCanonicalTimestamp(envelope.createdAt) || !isCanonicalTimestamp(envelope.updatedAt)) return false;
    if (envelope.updatedAt < envelope.createdAt) return false;
    if (!Array.isArray(envelope.entries) || envelope.entries.length > EMBEDDING_POISON_MAX_ENTRIES) return false;

    const seen = new Set();

    for (const entry of envelope.entries) {
        if (!isExactObject(entry, SAFE_ENTRY_KEYS)) return false;
        if (!HASH_PATTERN.test(entry.chunkId) || !isEmbedFailureCode(entry.reasonCode) || !isCanonicalTimestamp(entry.observedAt)) {
            return false
        }
        if (seen.has(entry.chunkId)) return false;
        seen.add(entry.chunkId)
    }

    return true
}

/**
 * @summary Normalizes one incoming row into the exact persistable projection.
 * @param {*} entry Candidate row.
 * @param {String} defaultObservedAt Call-level observation timestamp.
 * @returns {{chunkId: String, reasonCode: String, observedAt: String}}
 * @private
 */
function normalizeEntry(entry, defaultObservedAt) {
    const allowedInputKeys = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.keys(entry).sort()
        : [];
    const expectedWithoutTimestamp = ['chunkId', 'reasonCode'];
    const expectedWithTimestamp    = SAFE_ENTRY_KEYS;

    if (!sameKeys(allowedInputKeys, expectedWithoutTimestamp) && !sameKeys(allowedInputKeys, expectedWithTimestamp)) {
        throw new TypeError('upsertEmbeddingPoisonEntries: each entry must contain only chunkId, reasonCode, and optional observedAt')
    }

    assertHash(entry.chunkId, 'upsertEmbeddingPoisonEntries: entry.chunkId');

    if (!isEmbedFailureCode(entry.reasonCode)) {
        throw new TypeError('upsertEmbeddingPoisonEntries: entry.reasonCode must be a declared bounded embed-failure code')
    }

    return {
        chunkId   : entry.chunkId,
        reasonCode: entry.reasonCode,
        observedAt: entry.observedAt === undefined
            ? defaultObservedAt
            : normalizeTimestamp(entry.observedAt, 'upsertEmbeddingPoisonEntries: entry.observedAt')
    }
}

function assertHash(value, label) {
    if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
        throw new TypeError(`${label} must be a lowercase SHA-256 hex string`)
    }
}

function assertHashInput(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_HASH_INPUT_LENGTH) {
        throw new TypeError(`${label} must be a non-empty string of at most ${MAX_HASH_INPUT_LENGTH} characters`)
    }
}

function compareByAgeThenId(left, right) {
    return left.observedAt.localeCompare(right.observedAt) || left.chunkId.localeCompare(right.chunkId)
}

function isCanonicalTimestamp(value) {
    if (typeof value !== 'string') return false;

    const time = Date.parse(value);

    return Number.isFinite(time) && new Date(time).toISOString() === value
}

function isExactObject(value, expectedKeys) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && sameKeys(Object.keys(value).sort(), expectedKeys)
}

function normalizeTimestamp(value, label) {
    const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;

    if (!Number.isFinite(time)) {
        throw new TypeError(`${label} must be a finite timestamp`)
    }

    return new Date(time).toISOString()
}

function sameKeys(actual, expected) {
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function serializeWrite(filePath, operation) {
    const previous = writeQueues.get(filePath) || Promise.resolve();
    const current  = previous.catch(() => {}).then(operation);

    writeQueues.set(filePath, current);

    return current.finally(() => {
        if (writeQueues.get(filePath) === current) {
            writeQueues.delete(filePath)
        }
    })
}

/**
 * @summary Serializes one state mutation across async calls, processes, and container PID namespaces.
 * @param {String} filePath Canonical per-scope marker path.
 * @param {Function} operation Guarded read-verify-mutate callback.
 * @returns {Promise<*>}
 * @private
 */
function serializeMutation(filePath, operation) {
    return serializeWrite(filePath, async () => {
        await fsExtra.ensureDir(path.dirname(filePath));

        const guard = await enterLifecycleGuard({leasePath: filePath, fsModule: fsExtra});

        if (!guard) {
            throw new Error('kbEmbeddingPoisonStore: mutation guard unavailable')
        }

        try {
            return await operation(guard)
        } finally {
            await exitLifecycleGuard({ownerFilePath: guard.ownerFilePath, fsModule: fsExtra})
        }
    })
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}
