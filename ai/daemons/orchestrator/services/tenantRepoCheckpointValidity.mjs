/**
 * @module ai/daemons/orchestrator/services/tenantRepoCheckpointValidity
 * @summary Pure checkpoint-contract normalization and revalidation classification
 * for the orchestrator-owned tenant-repo ingestion lane.
 *
 * A persisted repository head is trusted as an incremental base only when
 * `ingestContractVersion` proves it was written after an error-free ingestion
 * summary. Older records remain usable recovery evidence, but require one
 * bounded null-base replay before they become current.
 */

/**
 * @summary Current success contract for tenant-repo ingestion checkpoints.
 *
 * Version 1 means the persisted head advanced only after
 * `assertErrorFreeIngestionSummary()` accepted the Knowledge Base result.
 *
 * @type {Number}
 */
export const TENANT_REPO_INGEST_CONTRACT_VERSION = 1;

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
            lastIngestedRev                   : value || null,
            lastRunAttemptAt                  : 0,
            consecutiveFailures               : 0,
            ingestContractVersion             : null,
            lastAttemptedIngestContractVersion: null
        };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    if (hasMalformedContractVersion(value)) {
        return null;
    }

    return {
        lastIngestedRev                    : typeof value.lastIngestedRev === 'string' && value.lastIngestedRev
            ? value.lastIngestedRev
            : null,
        lastRunAttemptAt                  : normalizeNonNegativeNumber(value.lastRunAttemptAt),
        consecutiveFailures               : normalizeFailureCount(value.consecutiveFailures),
        ingestContractVersion             : normalizeContractVersion(value.ingestContractVersion),
        lastAttemptedIngestContractVersion: normalizeContractVersion(value.lastAttemptedIngestContractVersion)
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
    if (hasMalformedContractVersion(state)) {
        return TenantRepoCheckpointStatus.INVALID;
    }

    const normalizedState = normalizeTenantRepoCheckpointState(state);

    if (state !== null && state !== undefined && !normalizedState) {
        return TenantRepoCheckpointStatus.INVALID;
    }

    const
        ingestVersion  = normalizedState?.ingestContractVersion ?? null,
        attemptVersion = normalizedState?.lastAttemptedIngestContractVersion ?? null;

    if (
        ingestVersion > TENANT_REPO_INGEST_CONTRACT_VERSION
        || attemptVersion > TENANT_REPO_INGEST_CONTRACT_VERSION
    ) {
        return TenantRepoCheckpointStatus.UNSUPPORTED;
    }

    if (!normalizedState?.lastIngestedRev) {
        return TenantRepoCheckpointStatus.UNINITIALIZED;
    }

    if (ingestVersion === TENANT_REPO_INGEST_CONTRACT_VERSION) {
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
 * @summary Accepts only positive integer checkpoint-contract versions.
 * @param {*} value Candidate persisted version.
 * @returns {Number|null}
 */
function normalizeContractVersion(value) {
    return Number.isInteger(value) && value > 0 ? value : null;
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
