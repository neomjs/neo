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

const MATERIALIZATION_ATTEMPT_ID_PATTERN = /^[a-f0-9]{32}$/u;

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
            lastErrorAt        : null
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
        lastErrorAt        : normalizeNonNegativeNumber(value.lastErrorAt) || null
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
