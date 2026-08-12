/**
 * @module ai/services/shared/vector/generationElectionStore
 * @summary One durable election authority for the vector plane's embedding-generation visibility.
 *
 * Any change to a load-bearing embedding-generation coordinate (provider/engine, model reference,
 * quantization, output dimension, pooling/normalization, distance semantics, preprocessing/chunk
 * strategy) invalidates every existing vector. Per-collection shadow builds may proceed
 * independently, but GENERATION VISIBILITY commits through this one plane-singleton record — never
 * through per-collection flags that can disagree.
 *
 * **The barrier gates PROMOTES, not reads — and transition renames are QUIESCE-BOUNDED.** Readers
 * only ever resolve canonical collection names, so per-collection renames are individually visible
 * the moment they happen. Two mechanisms therefore compose: (1) BEFORE commit, no promote of the
 * candidate is admissible anywhere, so an uncommitted election never advertises; (2) the commit
 * (and any rollback) REQUIRES a declared quiesce window `{scope, startedAt, boundMs}`, and every
 * transition rename — promote after commit, un-park after rollback — refuses to run outside that
 * active window. The mixed-generation interval between the first and last rename exists ONLY inside
 * a declared, bounded window in which the operator has quiesced readers; the record enforces the
 * declaration and the bound, the deployment enforces the quiet. Steady-state same-generation
 * refresh promotes need no window — both sides of their rename are the elected generation.
 *
 * **Fail-safe polarity** (deliberately opposite to `kbEmbeddingPoisonStore`): a MISSING record means
 * the plane pre-dates the election contract — promotes stay admissible in declared legacy mode, and
 * the cutover's first act is {@link declareBaselineVectorGeneration}. A CORRUPT or unreadable record
 * REFUSES promotes: promoting on unprovable state could advertise a wrong generation, which is the
 * exact forbidden outcome, while refusing merely leaves readers on the intact prior generation.
 *
 * **Coordinates are stored verbatim**, unlike the poison store's hashed generation coordinates.
 * That contrast is deliberate: the poison marker is per-tenant-scope state where identity hashes
 * suffice, while this record IS the plane's deployment identity — health surfaces and operators must
 * read WHICH generation is elected and parked to act on it. The coordinates describe deployment
 * software configuration only; tenant identities, content, credentials, endpoints, and client names
 * have no writable field in the schema.
 *
 * **Deployment invariant — the shared mount:** KB and MC processes mutate this one file, so the
 * declared state directory must resolve to the SAME filesystem path on the SAME mount in every
 * process/container of the plane. A per-service copy of the path with per-service storage silently
 * splits the authority in two; the compose mount line is part of this design.
 *
 * Lifecycle (epoch increments on every visibility flip — commit and rollback, nothing else):
 *
 *     accepted ──declareCandidate──▶ candidate ──commit──▶ committed ──accept──▶ accepted
 *                                                             │
 *                                                          rollback ──▶ rolled-back ──declareCandidate──▶ …
 */

import crypto            from 'crypto';
import fs                from 'fs/promises';
import fsExtra           from 'fs-extra';
import path              from 'path';
import {writeFileAtomic} from '../atomicFileWrite.mjs';
import {
    enterLifecycleGuard,
    exitLifecycleGuard,
    verifyLifecycleGuardOwnership
} from '../../../daemons/shared/lifecycleGuard.mjs';

export const VECTOR_GENERATION_ELECTION_SCHEMA_VERSION = 1;

/**
 * @summary The vector-plane collection census — every live embedding collection the election governs.
 *
 * KB serves one unified collection; MC serves memories, session summaries, temporal summaries, and
 * the graph-node embedding collection (`StorageRouter.getGraphCollection()` — resolved through the
 * accessor layer, which an earlier creator-layer sweep missed). A promote for a key outside this
 * census is a caller bug, not a new collection.
 */
export const VECTOR_PLANE_COLLECTION_KEYS = Object.freeze([
    'kb.unified',
    'mc.graph',
    'mc.memory',
    'mc.session',
    'mc.temporalSummary'
]);

export const VECTOR_ELECTION_STATUSES = Object.freeze(['accepted', 'candidate', 'committed', 'rolled-back']);

const ELECTION_FILE_NAME    = 'vector-generation-election.json';
const ELECTION_MAX_BYTES    = 64 * 1024;
const HASH_PATTERN          = /^[a-f0-9]{64}$/;
const MAX_HASH_INPUT_LENGTH = 1024;
const SAFE_COORDINATE_KEYS  = Object.freeze([
    'distance',
    'model',
    'pooling',
    'provider',
    'quantization',
    'strategyVersion',
    'vectorDimension'
]);
const SAFE_GENERATION_KEYS = Object.freeze(['coordinates', 'declaredAt', 'embeddingGenerationId', 'generationId']);
const SAFE_COLLECTION_KEYS = Object.freeze(['promotedAt', 'receipt', 'unparkedAt']);
const SAFE_RECEIPT_KEYS    = Object.freeze(['candidateCollection', 'rowCount', 'validatedAt']);
const SAFE_QUIESCE_KEYS    = Object.freeze(['boundMs', 'declaredAt', 'scope', 'startedAt']);
const SAFE_RECORD_KEYS     = Object.freeze([
    'acceptedAt',
    'candidate',
    'collections',
    'committedAt',
    'createdAt',
    'elected',
    'epoch',
    'parked',
    'quiesce',
    'retired',
    'retiredAt',
    'rolledBack',
    'rolledBackAt',
    'schemaVersion',
    'status',
    'updatedAt'
]);

// A transition window longer than a day is a configuration error, not a long migration — the
// canonical-scale REBUILD happens before commit; only the bounded rename window sits inside quiesce.
const QUIESCE_MAX_BOUND_MS = 24 * 60 * 60 * 1000;

// Identity coordinates that carry no identifying power. Accepting them silently would forfeit the
// exact invalidation guarantee the tuple exists for, so they throw at declaration time.
const PLACEHOLDER_COORDINATE_VALUES = Object.freeze(new Set(['n/a', 'na', 'placeholder', 'tbd', 'todo', 'unknown']));

// Atomic rename prevents torn reads; this queue additionally preserves call order inside one process.
// The lifecycle guard below protects each read-verify-mutate across KB/MC processes and container PID
// namespaces that share the declared plane-state mount.
const writeQueues = new Map();

/**
 * @summary Hashes the poison-store-compatible embedding-generation coordinates.
 *
 * This is the ONE implementation of the four-coordinate id-space shared with
 * `kbEmbeddingPoisonStore` (which re-exports it): the same tuple must always produce the same id in
 * both stores, so poison dispositions and election records join on generation without translation.
 * The full election identity ({@link createVectorGenerationIdentity}) hashes MORE coordinates; this
 * narrower id exists solely as that join key.
 *
 * @param {Object} options
 * @param {String} options.provider Embedding provider identity (never persisted verbatim by the poison store).
 * @param {String} options.model Embedding model identity.
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
 * @summary Builds the complete, validated generation identity the election records.
 *
 * Carries the full coordinate tuple: any change to ANY field yields a new `generationId`, which is
 * what makes a lane/engine switch a new corpus generation by construction. `quantization`,
 * `pooling`, and `distance` are explicit because the live `model` value is a config tag, not an
 * immutable digest — a quantization or pooling change with an unchanged tag must still invalidate.
 * Placeholder values ('unknown', 'n/a', 'tbd', …) THROW: a placeholder coordinate forfeits exactly
 * the invalidation guarantee the tuple exists for. The `model` value must be digest-bearing
 * (contain `@` or a `sha256:` digest), so the identity binds to the immutable selected artifact —
 * the elected coordinate from the envelope election, not a mutable tag.
 *
 * @param {Object} coordinates
 * @param {String} coordinates.provider Embedding provider/engine identity (e.g. 'openAiCompatible').
 * @param {String} coordinates.model Digest-bearing immutable model reference (coordinate or `sha256:` form).
 * @param {String} coordinates.quantization Model quantization (e.g. 'q4_K_M', or 'none').
 * @param {Number} coordinates.vectorDimension Output vector dimension.
 * @param {String} coordinates.pooling Pooling/normalization semantics (e.g. 'last-token-normalized').
 * @param {String} coordinates.distance Distance semantics of the collections (e.g. 'cosine').
 * @param {String} coordinates.strategyVersion Preprocessing/chunk-strategy version.
 * @returns {{coordinates: Object, generationId: String, embeddingGenerationId: String}} Frozen identity.
 */
export function createVectorGenerationIdentity({
    provider,
    model,
    quantization,
    vectorDimension,
    pooling,
    distance,
    strategyVersion
} = {}) {
    assertCoordinateValue(provider, 'createVectorGenerationIdentity: provider');
    assertCoordinateValue(model, 'createVectorGenerationIdentity: model');
    assertCoordinateValue(quantization, 'createVectorGenerationIdentity: quantization');
    assertCoordinateValue(pooling, 'createVectorGenerationIdentity: pooling');
    assertCoordinateValue(distance, 'createVectorGenerationIdentity: distance');
    assertCoordinateValue(strategyVersion, 'createVectorGenerationIdentity: strategyVersion');

    if (!/@|sha256:/.test(model)) {
        throw new TypeError('createVectorGenerationIdentity: model must be digest-bearing (a coordinate containing "@" or a "sha256:" digest); a mutable tag cannot anchor a generation identity')
    }

    if (!Number.isInteger(vectorDimension) || vectorDimension <= 0) {
        throw new TypeError('createVectorGenerationIdentity: vectorDimension must be a positive integer')
    }

    // Canonical order is alphabetical; the hash is stable because the literal fixes key order.
    const coordinates = Object.freeze({
        distance,
        model,
        pooling,
        provider,
        quantization,
        strategyVersion,
        vectorDimension
    });

    return Object.freeze({
        coordinates,
        generationId         : sha256(JSON.stringify(coordinates)),
        embeddingGenerationId: createEmbeddingGenerationId({provider, model, vectorDimension, strategyVersion})
    })
}

/**
 * @summary Resolves the plane-singleton election record path.
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory shared by every KB/MC process.
 * @returns {String} Absolute record path.
 */
export function getVectorGenerationElectionFilePath({dir} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getVectorGenerationElectionFilePath: dir is required')
    }

    return path.resolve(dir, ELECTION_FILE_NAME)
}

export const VECTOR_GENERATION_ELECTION_SUBDIR = 'vector-generation';

/**
 * @summary Resolves the shared election directory beneath the resolved plane data root.
 *
 * `plane.dataRoot` is the one anchor every KB/MC process of a plane already resolves — which is
 * exactly the shared-mount invariant this record requires. Callers read their per-server config at
 * the use site and pass the RESOLVED root; the subpath constant lives here so two entrypoints
 * cannot drift it.
 * @param {Object} options
 * @param {String} options.planeDataRoot Resolved `plane.dataRoot` of the calling process.
 * @returns {String} Absolute election directory.
 */
export function resolveVectorGenerationElectionDir({planeDataRoot} = {}) {
    if (typeof planeDataRoot !== 'string' || planeDataRoot.length === 0) {
        throw new TypeError('resolveVectorGenerationElectionDir: planeDataRoot is required')
    }

    return path.resolve(planeDataRoot, VECTOR_GENERATION_ELECTION_SUBDIR)
}

/**
 * @summary Reads and strictly validates the election record.
 *
 * `missing` means the plane never declared an election (legacy mode for the promote fence).
 * `unavailable` means a record exists but cannot be proven (corrupt, oversized, schema drift,
 * derived-hash mismatch) — promotes must refuse on it while readers stay unaffected.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @returns {Promise<Object>} `{status: 'missing'|'available'|'unavailable', record?}`.
 */
export async function readVectorGenerationElection({dir} = {}) {
    const filePath = getVectorGenerationElectionFilePath({dir});

    try {
        const stat = await fs.stat(filePath);

        if (!stat.isFile() || stat.size <= 0 || stat.size > ELECTION_MAX_BYTES) {
            return {status: 'unavailable'}
        }

        const record = JSON.parse(await fs.readFile(filePath, 'utf8'));

        if (!isValidRecord(record)) {
            return {status: 'unavailable'}
        }

        return {status: 'available', record}
    } catch (error) {
        return {status: error?.code === 'ENOENT' ? 'missing' : 'unavailable'}
    }
}

/**
 * @summary Declares the baseline election on a plane that never had one — records reality, changes nothing.
 *
 * This is the bootstrap act of the cutover runbook: it names the generation the live collections
 * already hold, at epoch 1, already accepted. It refuses when ANY record exists — including a
 * corrupt one, because silently overwriting unprovable state destroys the forensics an operator
 * needs; inspect and remove the file explicitly, then re-declare.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {Object} options.identity Result of {@link createVectorGenerationIdentity}.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function declareBaselineVectorGeneration({dir, identity, now = Date.now()} = {}) {
    const declaredAt = normalizeTimestamp(now, 'declareBaselineVectorGeneration: now');
    const elected    = toGenerationEnvelope(identity, declaredAt, 'declareBaselineVectorGeneration');
    const filePath   = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const prior = await readVectorGenerationElection({dir});

        if (prior.status !== 'missing') {
            throw new Error(`declareBaselineVectorGeneration: a record already exists (status: ${prior.status}); baseline only initializes a plane without one`)
        }

        const record = {
            schemaVersion: VECTOR_GENERATION_ELECTION_SCHEMA_VERSION,
            epoch        : 1,
            status       : 'accepted',
            createdAt    : declaredAt,
            updatedAt    : declaredAt,
            committedAt  : declaredAt,
            acceptedAt   : declaredAt,
            rolledBackAt : null,
            retiredAt    : null,
            elected,
            candidate    : null,
            parked       : null,
            quiesce      : null,
            rolledBack   : null,
            retired      : null,
            collections  : emptyCollectionsState()
        };

        return await persistRecord({filePath, record, guard, label: 'declareBaselineVectorGeneration'})
    })
}

/**
 * @summary Declares the candidate generation a transition intends to elect.
 *
 * Allowed from `accepted` or — once every collection reports its un-park — from `rolled-back`.
 * Resets the per-collection tracking; validation receipts then accumulate via
 * {@link recordCandidateValidationReceipt} until {@link commitVectorGenerationElection}.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {Object} options.identity Result of {@link createVectorGenerationIdentity}.
 * @param {Number} options.expectedEpoch The epoch the caller read; refuses when it moved.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function declareCandidateVectorGeneration({dir, identity, expectedEpoch, now = Date.now()} = {}) {
    const declaredAt = normalizeTimestamp(now, 'declareCandidateVectorGeneration: now');
    const candidate  = toGenerationEnvelope(identity, declaredAt, 'declareCandidateVectorGeneration');
    const filePath   = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'declareCandidateVectorGeneration'});

        if (record.status !== 'accepted' && record.status !== 'rolled-back') {
            throw new Error(`declareCandidateVectorGeneration: refused from status "${record.status}"; accept or roll back the running transition first`)
        }

        if (record.status === 'rolled-back' && !everyCollection(record, entry => entry.unparkedAt !== null)) {
            throw new Error('declareCandidateVectorGeneration: refused; the rolled-back transition has collections that never reported their un-park')
        }

        if (candidate.generationId === record.elected.generationId) {
            throw new Error('declareCandidateVectorGeneration: candidate equals the elected generation; a no-op election is a caller bug')
        }

        Object.assign(record, {
            status      : 'candidate',
            updatedAt   : declaredAt,
            committedAt : null,
            acceptedAt  : null,
            rolledBackAt: null,
            candidate,
            quiesce     : null,
            rolledBack  : null,
            collections : emptyCollectionsState()
        });

        return await persistRecord({filePath, record, guard, label: 'declareCandidateVectorGeneration'})
    })
}

/**
 * @summary Records one collection's candidate-validation receipt — the proof commit requires.
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {String} options.collectionKey One of {@link VECTOR_PLANE_COLLECTION_KEYS}.
 * @param {Object} options.receipt `{candidateCollection, rowCount, validatedAt?}` — re-validation replaces.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function recordCandidateValidationReceipt({dir, collectionKey, receipt, expectedEpoch, now = Date.now()} = {}) {
    assertCollectionKey(collectionKey, 'recordCandidateValidationReceipt');

    const observedAt = normalizeTimestamp(now, 'recordCandidateValidationReceipt: now');
    const normalized = normalizeReceipt(receipt, observedAt);
    const filePath   = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'recordCandidateValidationReceipt'});

        if (record.status !== 'candidate') {
            throw new Error(`recordCandidateValidationReceipt: refused from status "${record.status}"; receipts only accumulate for a declared candidate`)
        }

        record.collections[collectionKey].receipt = normalized;
        record.updatedAt                          = observedAt;

        return await persistRecord({filePath, record, guard, label: 'recordCandidateValidationReceipt'})
    })
}

/**
 * @summary Commits the election — the single durable authority transition, inside a declared quiesce.
 *
 * Refuses unless every census collection carries a validation receipt AND the caller declares the
 * quiesce window the transition renames will run inside. The elected generation parks (full-set
 * rollback authority), the candidate becomes elected, and the epoch increments. No rename has
 * happened yet — the per-collection promotes follow, each refusing to run outside the declared
 * window, and readers must be quiesced by the deployment for exactly that window: the record
 * enforces the declaration and the bound, not the quiet itself.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {Object} options.quiesce `{scope, startedAt?, boundMs}` — the declared reader-quiesce window.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function commitVectorGenerationElection({dir, expectedEpoch, quiesce, now = Date.now()} = {}) {
    const committedAt = normalizeTimestamp(now, 'commitVectorGenerationElection: now');
    const window      = normalizeQuiesce(quiesce, committedAt, 'commitVectorGenerationElection');
    const filePath    = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'commitVectorGenerationElection'});

        if (record.status !== 'candidate') {
            throw new Error(`commitVectorGenerationElection: refused from status "${record.status}"; only a declared candidate commits`)
        }

        const missing = VECTOR_PLANE_COLLECTION_KEYS.filter(key => record.collections[key].receipt === null);

        if (missing.length > 0) {
            throw new Error(`commitVectorGenerationElection: refused; collections without a validation receipt: ${missing.join(', ')}`)
        }

        Object.assign(record, {
            epoch    : record.epoch + 1,
            status   : 'committed',
            updatedAt: committedAt,
            committedAt,
            parked   : record.elected,
            elected  : record.candidate,
            candidate: null,
            quiesce  : window
        });

        return await persistRecord({filePath, record, guard, label: 'commitVectorGenerationElection'})
    })
}

/**
 * @summary Renews the declared quiesce window of a running transition — the stall remediation.
 *
 * A committed or rolled-back transition whose window expired with renames incomplete is stuck by
 * design (renames refuse outside the window). The operator renews with a fresh declared window —
 * an explicit, receipted act — rather than the record silently tolerating late renames.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {Object} options.quiesce `{scope, startedAt?, boundMs}` — the fresh reader-quiesce window.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function renewTransitionQuiesce({dir, expectedEpoch, quiesce, now = Date.now()} = {}) {
    const declaredAt = normalizeTimestamp(now, 'renewTransitionQuiesce: now');
    const window     = normalizeQuiesce(quiesce, declaredAt, 'renewTransitionQuiesce');
    const filePath   = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'renewTransitionQuiesce'});

        if (record.status !== 'committed' && record.status !== 'rolled-back') {
            throw new Error(`renewTransitionQuiesce: refused from status "${record.status}"; only a running transition carries a quiesce window`)
        }

        Object.assign(record, {
            updatedAt: declaredAt,
            quiesce  : window
        });

        return await persistRecord({filePath, record, guard, label: 'renewTransitionQuiesce'})
    })
}

/**
 * @summary The stale-writer fence — every seam calls this immediately before its promote renames.
 *
 * Two rules compose. IDENTITY, for every status: the generation being promoted must be the ELECTED
 * one and the caller's epoch must be the CURRENT one — a writer holding a pre-election view fails
 * both. WINDOW, for transitions only: while the record is `committed` or `rolled-back`, the rename
 * this call admits is a TRANSITION rename (it changes which generation a canonical name serves), so
 * it must additionally fall inside the declared quiesce window; outside the window it refuses, and
 * the remediation is {@link renewTransitionQuiesce}. Steady-state refresh promotes on an `accepted`
 * record need no window — both sides of that rename are the same generation.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {String} options.collectionKey One of {@link VECTOR_PLANE_COLLECTION_KEYS}.
 * @param {String} options.generationId The full election generation id the writer built against.
 * @param {Number} options.epoch The epoch the writer read before building.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam for the window check.
 * @returns {Promise<{mode: 'legacy'}|{mode: 'elected', epoch: Number, generationId: String}>}
 * @throws {Error} When the record is unprovable, the writer is stale, or a transition rename falls
 * outside the declared quiesce window — the promote must not run.
 */
export async function assertVectorPromoteAdmissible({dir, collectionKey, generationId, epoch, now = Date.now()} = {}) {
    assertCollectionKey(collectionKey, 'assertVectorPromoteAdmissible');

    const state = await readVectorGenerationElection({dir});

    if (state.status === 'missing') {
        return {mode: 'legacy'}
    }

    if (state.status === 'unavailable') {
        throw new Error('assertVectorPromoteAdmissible: the election record exists but cannot be proven; refusing to promote on unprovable state')
    }

    assertHash(generationId, 'assertVectorPromoteAdmissible: generationId');

    const {record} = state;

    if (!Number.isInteger(epoch) || epoch !== record.epoch) {
        throw new Error(`assertVectorPromoteAdmissible: stale writer fenced; writer epoch ${epoch} vs elected epoch ${record.epoch}`)
    }

    if (generationId !== record.elected.generationId) {
        throw new Error(`assertVectorPromoteAdmissible: generation ${generationId.slice(0, 12)}… is not the elected generation at epoch ${record.epoch}`)
    }

    if (record.status === 'committed' || record.status === 'rolled-back') {
        const at = normalizeTimestamp(now, 'assertVectorPromoteAdmissible: now');

        if (!isWithinQuiesceWindow(record.quiesce, at)) {
            throw new Error(`assertVectorPromoteAdmissible: transition rename refused outside the declared quiesce window (scope "${record.quiesce.scope}", ${record.quiesce.startedAt} + ${record.quiesce.boundMs}ms); renew the window explicitly to continue`)
        }
    }

    return {mode: 'elected', epoch: record.epoch, generationId: record.elected.generationId, electionStatus: record.status}
}

/**
 * @summary Captures the election view a writer builds against — taken BEFORE the build starts.
 *
 * The stale-writer fence compares this captured view to the live record at the promote moment, so
 * a commit or rollback landing mid-build fences the writer out instead of letting content whose
 * generation was decided under the old view advertise itself into the new one.
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @returns {Promise<Object>} `{mode: 'legacy'}` or `{mode: 'elected', generationId, epoch, electionStatus}`.
 * @throws {Error} When a record exists but cannot be proven — a build must not start on unprovable state.
 */
export async function captureVectorPromoteView({dir} = {}) {
    const state = await readVectorGenerationElection({dir});

    if (state.status === 'missing') {
        return {mode: 'legacy'}
    }

    if (state.status === 'unavailable') {
        throw new Error('captureVectorPromoteView: the election record exists but cannot be proven; refusing to start a build on unprovable state')
    }

    const {record} = state;

    return {mode: 'elected', generationId: record.elected.generationId, epoch: record.epoch, electionStatus: record.status}
}

/**
 * @summary Validates a captured writer view at the promote moment — the seam-facing fence form.
 *
 * A legacy view stays admissible only while the plane still has no record; an election declared
 * after the writer began refuses the promote, because the writer cannot prove which generation it
 * built — the remediation is re-running the build against the elected view. An elected view
 * delegates to {@link assertVectorPromoteAdmissible}.
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {String} options.collectionKey One of {@link VECTOR_PLANE_COLLECTION_KEYS}.
 * @param {Object} options.view Result of {@link captureVectorPromoteView}.
 * @returns {Promise<Object>} The admissible view, with `electionStatus` refreshed for elected mode.
 * @throws {Error} When the writer is stale or the record is unprovable — the promote must not run.
 */
export async function assertCapturedPromoteView({dir, collectionKey, view} = {}) {
    assertCollectionKey(collectionKey, 'assertCapturedPromoteView');

    if (view === null || typeof view !== 'object' || (view.mode !== 'legacy' && view.mode !== 'elected')) {
        throw new TypeError('assertCapturedPromoteView: view must come from captureVectorPromoteView')
    }

    if (view.mode === 'legacy') {
        const state = await readVectorGenerationElection({dir});

        if (state.status === 'missing') {
            return {mode: 'legacy'}
        }

        if (state.status === 'unavailable') {
            throw new Error('assertCapturedPromoteView: the election record exists but cannot be proven; refusing to promote on unprovable state')
        }

        throw new Error('assertCapturedPromoteView: an election was declared after this writer began; re-run the build against the elected view')
    }

    return await assertVectorPromoteAdmissible({dir, collectionKey, generationId: view.generationId, epoch: view.epoch})
}

/**
 * @summary Marks one collection's promote renames as completed for the committed election.
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {String} options.collectionKey One of {@link VECTOR_PLANE_COLLECTION_KEYS}.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function recordPromoteCompletion({dir, collectionKey, expectedEpoch, now = Date.now()} = {}) {
    assertCollectionKey(collectionKey, 'recordPromoteCompletion');

    const promotedAt = normalizeTimestamp(now, 'recordPromoteCompletion: now');
    const filePath   = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'recordPromoteCompletion'});

        if (record.status !== 'committed') {
            throw new Error(`recordPromoteCompletion: refused from status "${record.status}"; promotes only complete under a committed election`)
        }

        record.collections[collectionKey].promotedAt = promotedAt;
        record.updatedAt                             = promotedAt;

        return await persistRecord({filePath, record, guard, label: 'recordPromoteCompletion'})
    })
}

/**
 * @summary Rolls the committed election back — the parked prior generation is re-elected in full.
 *
 * A code-only rollback without the generation restore is impossible by construction: this is the
 * only rollback, it flips the whole plane, and the epoch increments so every writer that built
 * against the abandoned generation is fenced out. The un-park renames that restore the prior
 * generation are transition renames, so rollback carries the SAME quiesce obligation as commit —
 * the caller declares the window the un-parks will run inside, and each un-park refuses outside it.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {Object} options.quiesce `{scope, startedAt?, boundMs}` — the declared reader-quiesce window.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function rollbackVectorGenerationElection({dir, expectedEpoch, quiesce, now = Date.now()} = {}) {
    const rolledBackAt = normalizeTimestamp(now, 'rollbackVectorGenerationElection: now');
    const window       = normalizeQuiesce(quiesce, rolledBackAt, 'rollbackVectorGenerationElection');
    const filePath     = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'rollbackVectorGenerationElection'});

        if (record.status !== 'committed') {
            throw new Error(`rollbackVectorGenerationElection: refused from status "${record.status}"; only a committed, unaccepted election rolls back`)
        }

        Object.assign(record, {
            epoch      : record.epoch + 1,
            status     : 'rolled-back',
            updatedAt  : rolledBackAt,
            committedAt: null,
            rolledBackAt,
            rolledBack : record.elected,
            elected    : record.parked,
            parked     : null,
            quiesce    : window,
            collections: resetPromotesKeepReceipts(record.collections)
        });

        return await persistRecord({filePath, record, guard, label: 'rollbackVectorGenerationElection'})
    })
}

/**
 * @summary Marks one collection's un-park renames as completed after a rollback.
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {String} options.collectionKey One of {@link VECTOR_PLANE_COLLECTION_KEYS}.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function recordUnparkCompletion({dir, collectionKey, expectedEpoch, now = Date.now()} = {}) {
    assertCollectionKey(collectionKey, 'recordUnparkCompletion');

    const unparkedAt = normalizeTimestamp(now, 'recordUnparkCompletion: now');
    const filePath   = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'recordUnparkCompletion'});

        if (record.status !== 'rolled-back') {
            throw new Error(`recordUnparkCompletion: refused from status "${record.status}"; un-parks only complete after a rollback`)
        }

        record.collections[collectionKey].unparkedAt = unparkedAt;
        record.updatedAt                             = unparkedAt;

        return await persistRecord({filePath, record, guard, label: 'recordUnparkCompletion'})
    })
}

/**
 * @summary Accepts the committed election — rollback authority ends, the parked generation retires.
 *
 * Refuses until every census collection reports its promote. After acceptance the parked
 * generation's collections become GC-eligible for the seams; the record keeps the retired identity
 * as rolling forensics.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam.
 * @returns {Promise<Object>} The persisted record.
 */
export async function acceptVectorGenerationElection({dir, expectedEpoch, now = Date.now()} = {}) {
    const acceptedAt = normalizeTimestamp(now, 'acceptVectorGenerationElection: now');
    const filePath   = getVectorGenerationElectionFilePath({dir});

    return await serializeMutation(filePath, async guard => {
        const record = await requireRecord({dir, expectedEpoch, label: 'acceptVectorGenerationElection'});

        if (record.status !== 'committed') {
            throw new Error(`acceptVectorGenerationElection: refused from status "${record.status}"; only a committed election is accepted`)
        }

        const pending = VECTOR_PLANE_COLLECTION_KEYS.filter(key => record.collections[key].promotedAt === null);

        if (pending.length > 0) {
            throw new Error(`acceptVectorGenerationElection: refused; collections without a completed promote: ${pending.join(', ')}`)
        }

        Object.assign(record, {
            status   : 'accepted',
            updatedAt: acceptedAt,
            acceptedAt,
            retiredAt: acceptedAt,
            retired  : record.parked,
            parked   : null,
            quiesce  : null
        });

        return await persistRecord({filePath, record, guard, label: 'acceptVectorGenerationElection'})
    })
}

/**
 * @summary Projects the election for health surfaces — elected + parked identities, per-collection state.
 *
 * Health must never throw on plane-state problems; `missing` and `unavailable` are reportable
 * conditions, not errors. Acceptance reads this projection.
 *
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @returns {Promise<Object>} `{status, epoch?, elected?, parked?, candidate?, collections?}`.
 */
export async function projectVectorGenerationHealth({dir} = {}) {
    const state = await readVectorGenerationElection({dir});

    if (state.status !== 'available') {
        return {status: state.status}
    }

    const {record} = state;

    return {
        status     : record.status,
        epoch      : record.epoch,
        elected    : projectGeneration(record.elected),
        parked     : projectGeneration(record.parked),
        candidate  : projectGeneration(record.candidate),
        quiesce    : record.quiesce === null ? null : {...record.quiesce},
        collections: Object.fromEntries(VECTOR_PLANE_COLLECTION_KEYS.map(key => [key, {
            validated : record.collections[key].receipt !== null,
            promotedAt: record.collections[key].promotedAt,
            unparkedAt: record.collections[key].unparkedAt
        }]))
    }
}

/**
 * @summary Reads the record for a mutation and enforces the caller's epoch view.
 * @param {Object} options
 * @param {String} options.dir Declared plane-state directory.
 * @param {Number} options.expectedEpoch The epoch the caller read.
 * @param {String} options.label Error-message prefix.
 * @returns {Promise<Object>} The live record (mutation-owned copy).
 * @private
 */
async function requireRecord({dir, expectedEpoch, label}) {
    const state = await readVectorGenerationElection({dir});

    if (state.status === 'missing') {
        throw new Error(`${label}: no election record exists; declare the baseline first`)
    }

    if (state.status === 'unavailable') {
        throw new Error(`${label}: the election record exists but cannot be proven; refusing to mutate unprovable state`)
    }

    if (!Number.isInteger(expectedEpoch) || expectedEpoch !== state.record.epoch) {
        throw new Error(`${label}: epoch moved (expected ${expectedEpoch}, live ${state.record.epoch}); re-read before mutating`)
    }

    return state.record
}

/**
 * @summary Validates the persisted projection and writes it through the atomic primitive.
 * @param {Object} options
 * @param {String} options.filePath Canonical record path.
 * @param {Object} options.record The mutated record.
 * @param {Object} options.guard Held lifecycle guard.
 * @param {String} options.label Error-message prefix.
 * @returns {Promise<Object>} The persisted record.
 * @private
 */
async function persistRecord({filePath, record, guard, label}) {
    // Self-check before persisting: a state-machine bug must fail THIS call loudly, not surface
    // later as an unprovable record that freezes every promote on the plane.
    if (!isValidRecord(record)) {
        throw new Error(`${label}: refusing to persist a record that fails its own schema validation`)
    }

    const json = `${JSON.stringify(record, null, 2)}\n`;

    if (Buffer.byteLength(json, 'utf8') > ELECTION_MAX_BYTES) {
        throw new Error(`${label}: record exceeds ${ELECTION_MAX_BYTES} bytes`)
    }

    if (!await verifyLifecycleGuardOwnership({ownerFilePath: guard.ownerFilePath, fsModule: fsExtra})) {
        throw new Error(`${label}: mutation guard ownership was lost`)
    }

    await writeFileAtomic(filePath, json, {fsync: true});

    return record
}

/**
 * @summary Validates the closed record schema, per-status cross-field invariants, and derived-hash
 * consistency (a hand-edited identity fails validation).
 * @param {*} record Parsed JSON value.
 * @returns {Boolean}
 * @private
 */
function isValidRecord(record) {
    if (!isExactObject(record, SAFE_RECORD_KEYS)) return false;
    if (record.schemaVersion !== VECTOR_GENERATION_ELECTION_SCHEMA_VERSION) return false;
    if (!Number.isInteger(record.epoch) || record.epoch <= 0) return false;
    if (!VECTOR_ELECTION_STATUSES.includes(record.status)) return false;
    if (!isCanonicalTimestamp(record.createdAt) || !isCanonicalTimestamp(record.updatedAt)) return false;
    if (record.updatedAt < record.createdAt) return false;

    const {status} = record;

    if (!isValidGenerationEnvelope(record.elected)) return false;
    if (!nullOr(record.candidate, isValidGenerationEnvelope) || (record.candidate !== null) !== (status === 'candidate')) return false;
    if (!nullOr(record.parked, isValidGenerationEnvelope) || (record.parked !== null) !== (status === 'committed')) return false;
    if (!nullOr(record.rolledBack, isValidGenerationEnvelope) || (record.rolledBack !== null) !== (status === 'rolled-back')) return false;
    if (!nullOr(record.retired, isValidGenerationEnvelope)) return false;

    if (!nullOr(record.committedAt, isCanonicalTimestamp) || (record.committedAt !== null) !== (status === 'committed' || status === 'accepted')) return false;
    if (!nullOr(record.acceptedAt, isCanonicalTimestamp) || (record.acceptedAt !== null) !== (status === 'accepted')) return false;
    if (!nullOr(record.rolledBackAt, isCanonicalTimestamp) || (record.rolledBackAt !== null) !== (status === 'rolled-back')) return false;
    if (!nullOr(record.retiredAt, isCanonicalTimestamp) || (record.retiredAt !== null) !== (record.retired !== null)) return false;
    if (!nullOr(record.quiesce, isValidQuiesce) || (record.quiesce !== null) !== (status === 'committed' || status === 'rolled-back')) return false;

    if (!isExactObject(record.collections, VECTOR_PLANE_COLLECTION_KEYS)) return false;

    for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
        const entry = record.collections[key];

        if (!isExactObject(entry, SAFE_COLLECTION_KEYS)) return false;
        if (!nullOr(entry.receipt, isValidReceipt)) return false;
        if (!nullOr(entry.promotedAt, isCanonicalTimestamp)) return false;
        if (!nullOr(entry.unparkedAt, isCanonicalTimestamp)) return false
    }

    return true
}

/**
 * @summary Validates one generation envelope including recomputing both derived hashes.
 * @param {*} envelope Candidate envelope.
 * @returns {Boolean}
 * @private
 */
function isValidGenerationEnvelope(envelope) {
    if (!isExactObject(envelope, SAFE_GENERATION_KEYS)) return false;
    if (!isCanonicalTimestamp(envelope.declaredAt)) return false;
    if (!HASH_PATTERN.test(envelope.generationId) || !HASH_PATTERN.test(envelope.embeddingGenerationId)) return false;

    const {coordinates} = envelope;

    if (!isExactObject(coordinates, SAFE_COORDINATE_KEYS)) return false;

    for (const key of SAFE_COORDINATE_KEYS) {
        if (key === 'vectorDimension') continue;
        const value = coordinates[key];
        if (typeof value !== 'string' || value.length === 0 || value.length > MAX_HASH_INPUT_LENGTH) return false
    }

    if (!Number.isInteger(coordinates.vectorDimension) || coordinates.vectorDimension <= 0) return false;

    let identity;

    try {
        identity = createVectorGenerationIdentity(coordinates)
    } catch {
        return false
    }

    return identity.generationId === envelope.generationId
        && identity.embeddingGenerationId === envelope.embeddingGenerationId
}

/**
 * @summary Validates one closed validation receipt.
 * @param {*} receipt Candidate receipt.
 * @returns {Boolean}
 * @private
 */
function isValidReceipt(receipt) {
    return isExactObject(receipt, SAFE_RECEIPT_KEYS)
        && typeof receipt.candidateCollection === 'string'
        && receipt.candidateCollection.length > 0
        && receipt.candidateCollection.length <= MAX_HASH_INPUT_LENGTH
        && Number.isInteger(receipt.rowCount)
        && receipt.rowCount >= 0
        && isCanonicalTimestamp(receipt.validatedAt)
}

/**
 * @summary Normalizes and re-derives a caller identity into the persistable envelope.
 * @param {*} identity Result of {@link createVectorGenerationIdentity} (or its exact shape).
 * @param {String} declaredAt Canonical declaration timestamp.
 * @param {String} label Error-message prefix.
 * @returns {Object} Envelope with re-derived hashes — a tampered identity cannot enter the record.
 * @private
 */
function toGenerationEnvelope(identity, declaredAt, label) {
    if (identity === null || typeof identity !== 'object' || identity.coordinates === undefined) {
        throw new TypeError(`${label}: identity must come from createVectorGenerationIdentity`)
    }

    const derived = createVectorGenerationIdentity(identity.coordinates);

    return {
        coordinates          : {...derived.coordinates},
        declaredAt,
        embeddingGenerationId: derived.embeddingGenerationId,
        generationId         : derived.generationId
    }
}

/**
 * @summary Normalizes one incoming receipt into the exact persistable projection.
 * @param {*} receipt Candidate receipt.
 * @param {String} defaultValidatedAt Call-level timestamp.
 * @returns {Object}
 * @private
 */
function normalizeReceipt(receipt, defaultValidatedAt) {
    const keys = receipt && typeof receipt === 'object' && !Array.isArray(receipt)
        ? Object.keys(receipt).sort()
        : [];

    if (!sameKeys(keys, ['candidateCollection', 'rowCount']) && !sameKeys(keys, SAFE_RECEIPT_KEYS)) {
        throw new TypeError('recordCandidateValidationReceipt: receipt must contain only candidateCollection, rowCount, and optional validatedAt')
    }

    const normalized = {
        candidateCollection: receipt.candidateCollection,
        rowCount           : receipt.rowCount,
        validatedAt        : receipt.validatedAt === undefined
            ? defaultValidatedAt
            : normalizeTimestamp(receipt.validatedAt, 'recordCandidateValidationReceipt: receipt.validatedAt')
    };

    if (!isValidReceipt(normalized)) {
        throw new TypeError('recordCandidateValidationReceipt: receipt failed validation (bounded string candidateCollection, non-negative integer rowCount)')
    }

    return normalized
}

/**
 * @summary Projects one generation envelope for health surfaces.
 * @param {Object|null} envelope Stored envelope.
 * @returns {Object|null}
 * @private
 */
function projectGeneration(envelope) {
    return envelope === null ? null : {
        generationId         : envelope.generationId,
        embeddingGenerationId: envelope.embeddingGenerationId,
        declaredAt           : envelope.declaredAt,
        coordinates          : {...envelope.coordinates}
    }
}

function emptyCollectionsState() {
    return Object.fromEntries(VECTOR_PLANE_COLLECTION_KEYS.map(key => [key, {
        receipt   : null,
        promotedAt: null,
        unparkedAt: null
    }]))
}

function resetPromotesKeepReceipts(collections) {
    return Object.fromEntries(VECTOR_PLANE_COLLECTION_KEYS.map(key => [key, {
        receipt   : collections[key].receipt,
        promotedAt: null,
        unparkedAt: null
    }]))
}

function everyCollection(record, predicate) {
    return VECTOR_PLANE_COLLECTION_KEYS.every(key => predicate(record.collections[key]))
}

function assertCollectionKey(value, label) {
    if (!VECTOR_PLANE_COLLECTION_KEYS.includes(value)) {
        throw new TypeError(`${label}: collectionKey must be one of ${VECTOR_PLANE_COLLECTION_KEYS.join(', ')}`)
    }
}

function assertHash(value, label) {
    if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
        throw new TypeError(`${label} must be a lowercase SHA-256 hex string`)
    }
}

function assertCoordinateValue(value, label) {
    assertHashInput(value, label);

    if (PLACEHOLDER_COORDINATE_VALUES.has(value.trim().toLowerCase())) {
        throw new TypeError(`${label} is a placeholder ("${value}") — a placeholder coordinate forfeits the invalidation guarantee; declare the real value`)
    }
}

/**
 * @summary Validates one stored quiesce window declaration.
 * @param {*} quiesce Candidate window.
 * @returns {Boolean}
 * @private
 */
function isValidQuiesce(quiesce) {
    return isExactObject(quiesce, SAFE_QUIESCE_KEYS)
        && typeof quiesce.scope === 'string'
        && quiesce.scope.length > 0
        && quiesce.scope.length <= MAX_HASH_INPUT_LENGTH
        && isCanonicalTimestamp(quiesce.startedAt)
        && isCanonicalTimestamp(quiesce.declaredAt)
        && Number.isInteger(quiesce.boundMs)
        && quiesce.boundMs > 0
        && quiesce.boundMs <= QUIESCE_MAX_BOUND_MS
}

/**
 * @summary Normalizes a caller quiesce declaration into the persistable window.
 * @param {*} quiesce `{scope, startedAt?, boundMs}`.
 * @param {String} declaredAt Canonical declaration timestamp; also the default window start.
 * @param {String} label Error-message prefix.
 * @returns {Object}
 * @private
 */
function normalizeQuiesce(quiesce, declaredAt, label) {
    const keys = quiesce && typeof quiesce === 'object' && !Array.isArray(quiesce)
        ? Object.keys(quiesce).sort()
        : [];

    if (!sameKeys(keys, ['boundMs', 'scope']) && !sameKeys(keys, ['boundMs', 'scope', 'startedAt'])) {
        throw new TypeError(`${label}: quiesce must declare exactly {scope, boundMs, startedAt?} — a transition without a declared reader-quiesce window is refused`)
    }

    const normalized = {
        boundMs  : quiesce.boundMs,
        declaredAt,
        scope    : quiesce.scope,
        startedAt: quiesce.startedAt === undefined
            ? declaredAt
            : normalizeTimestamp(quiesce.startedAt, `${label}: quiesce.startedAt`)
    };

    if (!isValidQuiesce(normalized)) {
        throw new TypeError(`${label}: quiesce failed validation (bounded scope string, positive integer boundMs ≤ ${QUIESCE_MAX_BOUND_MS})`)
    }

    return normalized
}

function isWithinQuiesceWindow(quiesce, at) {
    return at >= quiesce.startedAt
        && Date.parse(at) <= Date.parse(quiesce.startedAt) + quiesce.boundMs
}

function assertHashInput(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_HASH_INPUT_LENGTH) {
        throw new TypeError(`${label} must be a non-empty string of at most ${MAX_HASH_INPUT_LENGTH} characters`)
    }
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

function nullOr(value, predicate) {
    return value === null || predicate(value)
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
 * @summary Serializes one record mutation across async calls, processes, and container PID namespaces.
 * @param {String} filePath Canonical record path.
 * @param {Function} operation Guarded read-verify-mutate callback.
 * @returns {Promise<*>}
 * @private
 */
function serializeMutation(filePath, operation) {
    return serializeWrite(filePath, async () => {
        await fsExtra.ensureDir(path.dirname(filePath));

        const guard = await enterLifecycleGuard({leasePath: filePath, fsModule: fsExtra});

        if (!guard) {
            throw new Error('generationElectionStore: mutation guard unavailable')
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
