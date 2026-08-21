/**
 * @module ai/daemons/orchestrator/services/tenantRepoCheckpointValidity
 * @summary Pure checkpoint-contract normalization and revalidation classification
 * for the orchestrator-owned tenant-repo ingestion lane.
 *
 * A persisted repository head is trusted as an incremental base only when
 * `ingestContractVersion` proves it was written after the current ingestion
 * commit contract. Older records remain usable recovery evidence, but require
 * one bounded null-base replay before they become current.
 *
 * @see https://github.com/neomjs/neo/issues/16045
 */

// The state vocabulary is imported from the PRODUCER rather than re-declared. A reader holding its own
// copy of a closed set is one rename away from silently accepting a state the writer no longer emits,
// or rejecting one it does — the drift this normalizer exists to catch.
import {OUTSTANDING_STATE} from '../../../services/knowledge-base/helpers/corpusOutstanding.mjs';

/**
 * @summary Current success contract for tenant-repo ingestion checkpoints.
 *
 * Version 1 means the persisted head advanced after an error-free Knowledge Base
 * summary. Version 2 additionally requires a durable positive-effect receipt for
 * manifest-bearing full materializations; the checkpoint acknowledges its opaque
 * attempt id so an interrupted commit can retry without stale-proof reuse.
 *
 * @type {Number}
 */
export const TENANT_REPO_INGEST_CONTRACT_VERSION = 2;

const
    EMBEDDING_RECOVERY_ID_PATTERN      = /^[a-f0-9]{32}$/u,
    MATERIALIZATION_ATTEMPT_ID_PATTERN = /^[a-f0-9]{32}$/u;

/**
 * @summary Closed source-code family that can arm an embedding-recovery episode.
 *
 * These codes are minted by the Knowledge Base embed-failure boundary. The prefix is both bounded
 * by the checkpoint's general `KB_*` reader gate and specific enough that a Git/access/parser fault
 * cannot accidentally inherit an embedding recovery grant.
 * @type {RegExp}
 */
export const EMBEDDING_RECOVERY_SOURCE_CODE_PATTERN = /^KB_VECTOR_EMBED_[A-Z0-9_]{1,100}$/u;

/**
 * Bounded diagnostic-code vocabulary for the retained failure cause.
 *
 * This is the read-side half of the redaction boundary, and it is deliberately redundant with the
 * writer's own filter. A failure's underlying error carries `stderr`, a remote URL and — for a
 * credential-bearing clone URL — the credential itself, so the cause has to travel as a CODE and
 * nothing else. Validating on read as well as on write means a record hand-edited on disk, or written
 * by an older build with a looser writer, still cannot project free text into a diagnostic surface.
 * @type {RegExp}
 */
const BOUNDED_ERROR_CODE_PATTERN = /^KB_[A-Z0-9_]{1,120}$/u;

/**
 * @summary Admits a bounded `KB_*` diagnostic code, or nothing.
 * @param {*} value Candidate code from persisted state.
 * @returns {String|null}
 * @private
 */
function normalizeBoundedErrorCode(value) {
    return typeof value === 'string' && BOUNDED_ERROR_CODE_PATTERN.test(value) ? value : null;
}

/**
 * @summary Internal checkpoint-revalidation classifications.
 *
 * `INVALID` is a fail-closed reader sentinel, not a per-repo deployment
 * diagnostic: the canonical strict reader makes the aggregate unavailable
 * instead of projecting a partially trusted manifest.
 *
 * @enum {String}
 */
export const TenantRepoCheckpointStatus = Object.freeze({
    COMPLETE     : 'complete',
    FAILED       : 'failed',
    INVALID      : 'invalid',
    PENDING      : 'pending',
    UNINITIALIZED: 'uninitialized',
    UNSUPPORTED  : 'unsupported'
});

/**
 * @summary Normalizes one persisted tenant-repo checkpoint without upgrading its
 * success proof.
 *
 * Bare SHA strings and object records without version fields remain unproved.
 * This is deliberate: shape migration must never manufacture evidence that the
 * historical ingestion completed without errors.
 *
 * @param {String|Object} value Persisted revision-map entry.
 * @returns {Object|null} Normalized checkpoint state, or `null` for an invalid entry.
 */
export function normalizeTenantRepoCheckpointState(value) {
    if (typeof value === 'string') {
        return {
            lastIngestedRev                      : value || null,
            lastRunAttemptAt                     : 0,
            consecutiveFailures                  : 0,
            ingestContractVersion                : null,
            lastAttemptedIngestContractVersion   : null,
            lastCommittedMaterializationAttemptId: null,
            // A bare SHA predates the retained-cause contract, so there is no cause to recover.
            lastErrorCode      : null,
            lastSourceErrorCode: null,
            lastAccessCode     : null,
            lastErrorAt        : null,
            embeddingRecovery  : null,
            // A bare SHA also predates the outstanding-work observable. Null means "never measured",
            // which is the honest reading — not a corpus with nothing left to do.
            corpusOutstanding  : null,
            // And the fence censuses: null is "never observed", never "zero fenced".
            undeliverableChunks: null,
            contentPoisonChunks: null,
            // A bare SHA predates the operator-clear marker too, so no intervention was recorded.
            backoffClearedAt          : null,
            backoffClearedFromFailures: null
        };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    if (hasMalformedContractVersion(value) || hasMalformedMaterializationAttemptId(value)) {
        return null;
    }

    return {
        lastIngestedRev                    : typeof value.lastIngestedRev === 'string' && value.lastIngestedRev
            ? value.lastIngestedRev
            : null,
        lastRunAttemptAt                     : normalizeNonNegativeNumber(value.lastRunAttemptAt),
        consecutiveFailures                  : normalizeFailureCount(value.consecutiveFailures),
        ingestContractVersion                : normalizeContractVersion(value.ingestContractVersion),
        lastAttemptedIngestContractVersion   : normalizeContractVersion(value.lastAttemptedIngestContractVersion),
        lastCommittedMaterializationAttemptId: normalizeMaterializationAttemptId(
            value.lastCommittedMaterializationAttemptId
        ),
        // The retained failure cause. Absent on records written before it existed, which normalizes to
        // null rather than dropping the record — a missing reason is not a malformed checkpoint.
        // `lastAccessCode` carries the DISCRIMINATING cause (under-scoped credential vs rejected
        // credential vs absent-or-denied repository vs unreachable host); the other two name the outer
        // code and the failed operation. All three pass the same bounded-code gate, so the additional
        // discrimination costs no widening of what may reach a remote client.
        lastErrorCode      : normalizeBoundedErrorCode(value.lastErrorCode),
        lastSourceErrorCode: normalizeBoundedErrorCode(value.lastSourceErrorCode),
        lastAccessCode     : normalizeBoundedErrorCode(value.lastAccessCode),
        lastErrorAt        : normalizeNonNegativeNumber(value.lastErrorAt) || null,
        embeddingRecovery  : normalizeEmbeddingRecovery(value.embeddingRecovery),
        corpusOutstanding  : normalizeCorpusOutstanding(value.corpusOutstanding),
        // Two fence families, two censuses, one reader. A record written before the content-poison
        // census existed normalizes to null — "never observed", which is exactly what it is.
        undeliverableChunks: normalizeFenceCensus(value.undeliverableChunks),
        contentPoisonChunks: normalizeFenceCensus(value.contentPoisonChunks),
        // Operator-consumed backoff clear. This normalizer is an ALLOWLIST — a field absent from it
        // is silently dropped on read, so a marker written by the clear path would vanish before any
        // reader saw it. Kept as a plain ISO string / count rather than parsed: the snapshot renders
        // it, nothing branches on it, and a stricter shape would turn an old record into a malformed
        // checkpoint over a field that is purely informational.
        backoffClearedAt          : typeof value.backoffClearedAt === 'string' && value.backoffClearedAt
            ? value.backoffClearedAt
            : null,
        backoffClearedFromFailures: normalizeFailureCount(value.backoffClearedFromFailures) || null
    };
}

/**
 * @summary Normalizes one persisted fence census without manufacturing an observation.
 *
 * The census carries "N chunks are fenced, these are (up to a cap) their ids". It is family-neutral
 * by construction and is the reader for BOTH persisted censuses — undeliverable-at-geometry and
 * proven-content-poison. The families stay separate FIELDS (a merged count would tell an operator to
 * fix a file whose only fault is the plane's ceiling) but share this one shape and this one reader.
 *
 * Same reader discipline as `normalizeCorpusOutstanding`: a record that does not cohere degrades
 * WHOLE to `null` (unobserved), never to a smaller census — repairing a torn row into a count would
 * assert an observation nobody made. Ids are tenant-aware chunk hashes and pass the same bounded gate
 * the writer applied; the id list may be shorter than the count (the writer caps enumeration) but
 * never longer, and never contains a non-hash or a duplicate.
 *
 * @param {*} value Candidate persisted census.
 * @returns {{count: Number, ids: String[]}|null}
 */
function normalizeFenceCensus(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const {count, ids} = value;

    if (!Number.isInteger(count) || count <= 0)  return null;
    if (!Array.isArray(ids) || ids.length > count) return null;

    const seen = new Set();

    for (const id of ids) {
        if (typeof id !== 'string' || !/^[a-f0-9]{64}$/u.test(id) || seen.has(id)) {
            return null;
        }
        seen.add(id);
    }

    return {count, ids: [...ids]};
}

/**
 * @summary Normalizes one persisted corpus-outstanding observation without manufacturing one.
 *
 * The whole value of this field is the distinction between "N chunks still to embed", "nothing left",
 * and "nobody measured". A normalizer that repaired a torn record into a zero would erase the third
 * case at the exact layer meant to protect it — a hand-edited or half-written record would read as a
 * finished corpus. So a record that does not carry a coherent observation degrades to `null`
 * (unmeasured), never to a count.
 *
 * An unobservable observation is legitimate and passes through with null counts: that is the producer
 * honestly reporting its own blindness, which only the producer has standing to do.
 *
 * @param {*} value Candidate persisted observation.
 * @returns {Object|null}
 */
function normalizeCorpusOutstanding(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    // RAW reads, deliberately NOT `normalizeNonNegativeNumber` — that helper collapses
    // null/undefined/negative to `0`, which destroys the exact distinction this field exists to carry.
    // Built on it, the coherence check below could neither DETECT a missing count (a torn
    // `{state:'complete', observable:true}` laundered to `complete/0` — a finished corpus asserted from
    // an absent number) nor RECOGNISE a legitimate all-null settlement tuple, so every valid
    // `unobservable` the producer emits was rejected and could never round-trip. One helper, both
    // residuals.
    const
        {state}     = value,
        observable  = value.observable === true,
        settled     = Number.isSafeInteger(value.settled) && value.settled >= 0 ? value.settled : null,
        remaining   = Number.isSafeInteger(value.remaining) && value.remaining >= 0 ? value.remaining : null,
        outstanding = Number.isSafeInteger(value.outstanding) && value.outstanding >= 0 ? value.outstanding : null,
        observedAt  = Number.isFinite(value.observedAt)  && value.observedAt  >  0 ? value.observedAt  : null;

    // CLOSED vocabulary. An arbitrary string was previously admitted, which let a hand-edited or
    // partially-migrated record name a state no writer emits and still project as authoritative.
    if (state !== OUTSTANDING_STATE.complete
        && state !== OUTSTANDING_STATE.outstanding
        && state !== OUTSTANDING_STATE.unobservable) {
        return null;
    }

    // An observation claiming to be observable must carry the complete partition, its compatibility
    // alias, and the moment it was taken. A partial tuple cannot support either the number or its
    // staleness, so it degrades whole.
    if (observable && !(
        settled !== null
        && remaining !== null
        && outstanding === remaining
        && observedAt !== null
    )) {
        return null;
    }

    // COHERENCE, not merely presence. Each state admits exactly one tuple, so a record whose fields
    // contradict each other degrades WHOLE rather than being published field-by-field. The dangerous
    // specimen is `{state:'complete', observable:true, settled:0, remaining:42, outstanding:42}`:
    // every field is individually well-typed, and together they assert a finished corpus with 42
    // chunks left. Repairing that to a count would invent an observation; rejecting it is the only
    // honest reading.
    const coherent = state === OUTSTANDING_STATE.unobservable
        ? (!observable && settled === null && remaining === null && outstanding === null)
        : (observable && outstanding !== null
            && (state === OUTSTANDING_STATE.complete ? remaining === 0 : remaining > 0));

    if (!coherent) {
        return null;
    }

    return {
        state,
        observable,
        settled        : observable ? settled : null,
        remaining      : observable ? remaining : null,
        outstanding    : observable ? outstanding : null,
        lastDecreasedAt: Number.isFinite(value.lastDecreasedAt) && value.lastDecreasedAt > 0 ? value.lastDecreasedAt : null,
        observedAt
    };
}

/**
 * @summary Returns whether a bounded checkpoint cause belongs to the embedding dependency.
 * @param {*} value Candidate retained source code.
 * @returns {Boolean}
 */
export function isEmbeddingRecoverySourceCode(value) {
    return typeof value === 'string' && EMBEDDING_RECOVERY_SOURCE_CODE_PATTERN.test(value);
}

/**
 * @summary Normalizes one durable embedding recovery episode without manufacturing an observation.
 *
 * An episode requires its own opaque id, embedding-class cause, and detected timestamp. A recovery
 * generation exists only when both its opaque id and observed timestamp are present; consumption
 * exists only behind that proved generation. Any partial or malformed branch degrades by omission,
 * so a restart can never synthesize a due-bypass from torn or hand-edited state.
 *
 * @param {*} value Candidate persisted episode.
 * @returns {Object|null}
 * @private
 */
function normalizeEmbeddingRecovery(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const
        episodeId  = normalizeEmbeddingRecoveryId(value.episodeId),
        causeCode  = isEmbeddingRecoverySourceCode(value.causeCode) ? value.causeCode : null,
        detectedAt = normalizeNonNegativeNumber(value.detectedAt) || null;

    if (!episodeId || !causeCode || !detectedAt) {
        return null;
    }

    const
        candidateGenerationId = normalizeEmbeddingRecoveryId(value.generationId),
        candidateObservedAt   = normalizeNonNegativeNumber(value.observedAt) || null,
        generationProved      = Boolean(candidateGenerationId && candidateObservedAt),
        candidateConsumedAt   = generationProved
            ? (normalizeNonNegativeNumber(value.bypassConsumedAt) || null)
            : null,
        historyGenerationId   = normalizeEmbeddingRecoveryId(value.lastConsumedGenerationId),
        historyConsumedAt     = normalizeNonNegativeNumber(value.lastConsumedAt) || null,
        historyProved         = Boolean(historyGenerationId && historyConsumedAt);

    // A consumed current generation is stable history, not a pending grant. Canonicalizing it here
    // makes a restart re-arm the canary generation while retaining the exact receipt that rotates
    // the process-local gate key; it can never reuse the consumed bypass.
    const
        generationId             = generationProved && !candidateConsumedAt ? candidateGenerationId : null,
        observedAt               = generationProved && !candidateConsumedAt ? candidateObservedAt : null,
        lastConsumedGenerationId = candidateConsumedAt
            ? candidateGenerationId
            : (historyProved ? historyGenerationId : null),
        lastConsumedAt = candidateConsumedAt
            ? candidateConsumedAt
            : (historyProved ? historyConsumedAt : null);

    return {
        episodeId,
        causeCode,
        detectedAt,
        generationId,
        observedAt,
        bypassConsumedAt: null,
        lastConsumedGenerationId,
        lastConsumedAt
    };
}

/**
 * @summary Classifies whether a checkpoint is pending, failed, complete,
 * uninitialized, invalid, or from an unsupported future contract.
 *
 * `lastAttemptedIngestContractVersion` distinguishes a legacy checkpoint that
 * has never been tried by this contract (`pending`) from one whose bounded replay
 * failed (`failed`) without relying on historical failure counters.
 *
 * @param {String|Object|null} state Persisted checkpoint state.
 * @returns {String} One `TenantRepoCheckpointStatus` value.
 */
export function classifyTenantRepoCheckpoint(state) {
    if (hasMalformedContractVersion(state) || hasMalformedMaterializationAttemptId(state)) {
        return TenantRepoCheckpointStatus.INVALID;
    }

    const normalizedState = normalizeTenantRepoCheckpointState(state);

    if (state !== null && state !== undefined && !normalizedState) {
        return TenantRepoCheckpointStatus.INVALID;
    }

    const
        ingestVersion                     = normalizedState?.ingestContractVersion ?? null,
        attemptVersion                    = normalizedState?.lastAttemptedIngestContractVersion ?? null,
        committedMaterializationAttemptId = normalizedState?.lastCommittedMaterializationAttemptId ?? null;

    if (
        ingestVersion > TENANT_REPO_INGEST_CONTRACT_VERSION
        || attemptVersion > TENANT_REPO_INGEST_CONTRACT_VERSION
    ) {
        return TenantRepoCheckpointStatus.UNSUPPORTED;
    }

    if (!normalizedState?.lastIngestedRev) {
        return TenantRepoCheckpointStatus.UNINITIALIZED;
    }

    if (
        ingestVersion === TENANT_REPO_INGEST_CONTRACT_VERSION
        && committedMaterializationAttemptId
    ) {
        return TenantRepoCheckpointStatus.COMPLETE;
    }

    if (attemptVersion === TENANT_REPO_INGEST_CONTRACT_VERSION) {
        return TenantRepoCheckpointStatus.FAILED;
    }

    return TenantRepoCheckpointStatus.PENDING;
}

/**
 * @summary Returns whether the stored head must be replayed from a null base
 * before it may be trusted by the current ingestion contract.
 *
 * @param {Object|null} state Normalized persisted checkpoint state.
 * @returns {Boolean}
 */
export function requiresTenantRepoCheckpointRevalidation(state) {
    const status = classifyTenantRepoCheckpoint(state);

    return status === TenantRepoCheckpointStatus.PENDING
        || status === TenantRepoCheckpointStatus.FAILED;
}

/**
 * @summary Detects present-but-invalid checkpoint contract markers.
 *
 * An absent field or explicit `null` means the checkpoint predates that proof
 * field. Any other non-positive-integer representation is corrupt persisted
 * state and must never be downgraded into the legacy replay path.
 *
 * @param {*} state Candidate persisted checkpoint state.
 * @returns {Boolean}
 */
function hasMalformedContractVersion(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return false;
    }

    return [
        'ingestContractVersion',
        'lastAttemptedIngestContractVersion'
    ].some(key =>
        Object.hasOwn(state, key)
        && state[key] !== null
        && normalizeContractVersion(state[key]) === null
    );
}

/**
 * @summary Detects a present-but-invalid full-materialization receipt acknowledgement.
 * @param {*} state Candidate persisted checkpoint state.
 * @returns {Boolean}
 */
function hasMalformedMaterializationAttemptId(state) {
    return Boolean(
        state
        && typeof state === 'object'
        && !Array.isArray(state)
        && Object.hasOwn(state, 'lastCommittedMaterializationAttemptId')
        && state.lastCommittedMaterializationAttemptId !== null
        && normalizeMaterializationAttemptId(state.lastCommittedMaterializationAttemptId) === null
    );
}

/**
 * @summary Accepts only positive integer checkpoint-contract versions.
 * @param {*} value Candidate persisted version.
 * @returns {Number|null}
 */
function normalizeContractVersion(value) {
    return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * @summary Accepts only bounded opaque ids emitted for full-materialization attempts.
 * @param {*} value Candidate attempt id.
 * @returns {String|null}
 */
function normalizeMaterializationAttemptId(value) {
    return typeof value === 'string' && MATERIALIZATION_ATTEMPT_ID_PATTERN.test(value)
        ? value
        : null;
}

/**
 * @summary Accepts only opaque ids minted for embedding recovery episodes and generations.
 * @param {*} value Candidate id.
 * @returns {String|null}
 */
function normalizeEmbeddingRecoveryId(value) {
    return typeof value === 'string' && EMBEDDING_RECOVERY_ID_PATTERN.test(value)
        ? value
        : null;
}

/**
 * @summary Normalizes persisted failure counts to non-negative integers.
 * @param {*} value Candidate persisted failure count.
 * @returns {Number}
 */
function normalizeFailureCount(value) {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * @summary Normalizes persisted epoch values to non-negative finite numbers.
 * @param {*} value Candidate persisted epoch.
 * @returns {Number}
 */
function normalizeNonNegativeNumber(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
}
