/**
 * @summary Stable error-code taxonomy for the tenant-repo-sync lane.
 *
 * Operators branch on `error.code`, not message prose. All error paths in
 * `TenantRepoSyncService` + the manual CLI route through this taxonomy so the
 * health-payload `lastErrorCode` field and operator logs carry a stable identifier
 * regardless of the underlying GitMirror / envelope-builder / ingestion error.
 *
 * Codes use the `KB_TENANT_REPO_SYNC_` prefix to distinguish them from sibling
 * subsystem prefixes (`KB_GITMIRROR_`, `KB_INGEST_`, `KB_TENANT_REPO_ACCESS_`).
 *
 * @see learn/agentos/cloud-deployment/TenantIngestionModel.md — operator quarantine runbook
 */

export const KB_TENANT_REPO_SYNC_SYNC_FAILED            = 'KB_TENANT_REPO_SYNC_SYNC_FAILED';
export const KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED    = 'KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED';
export const KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND       = 'KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND';
export const KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED = 'KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED';
export const KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT = 'KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT';
// Non-failure defer reason: another process holds the cross-process tenant-repo-sync
// lease. Surfaced as a `skipped` reasonCode (never thrown) so the periodic lane and
// the manual CLI can branch on it without treating operator ownership as an error.
export const KB_TENANT_REPO_SYNC_LEASE_HELD = 'KB_TENANT_REPO_SYNC_LEASE_HELD';
// Commit-point fence: lease ownership was lost (TTL eviction or takeover) between
// acquisition and a manifest write. The sweep aborts WITHOUT writing, so an evicted
// writer can never overlap the new owner's manifest commits.
export const KB_TENANT_REPO_SYNC_LEASE_LOST = 'KB_TENANT_REPO_SYNC_LEASE_LOST';

/**
 * @summary Frozen enumeration of all valid tenant-repo-sync error codes.
 *
 * Exported as a `Object.freeze`'d Array because `Object.freeze(new Set(...))` does NOT
 * freeze Set membership — `.add()` still mutates the internal collection even after freeze.
 * A frozen array, by contrast, rejects `.push()`, indexed assignment, and length mutation
 * in strict mode (ES modules are strict by default), giving true immutability of the
 * exported substrate. Boundary membership checks go through `isTenantRepoSyncErrorCode()`,
 * which uses a module-internal Set for O(1) lookup.
 *
 * @type {ReadonlyArray<String>}
 */
export const TENANT_REPO_SYNC_ERROR_CODES = Object.freeze([
    KB_TENANT_REPO_SYNC_SYNC_FAILED,
    KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
    KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND,
    KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
    KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
    KB_TENANT_REPO_SYNC_LEASE_HELD,
    KB_TENANT_REPO_SYNC_LEASE_LOST
]);

const TENANT_REPO_SYNC_ERROR_CODE_SET = new Set(TENANT_REPO_SYNC_ERROR_CODES);

/**
 * @summary `Error` subclass carrying a stable `code` field plus optional metadata.
 *
 * Throw from service / CLI paths when surfacing a tenant-repo-sync-specific error.
 * Operators read `error.code` from logs and the health-payload `lastErrorCode`
 * field; the `meta` object carries non-secret context (tenantId, repoSlug,
 * resolved phase) that helps the runbook locate the failure.
 *
 * Underlying transport-layer errors (GitMirror auth failure, ChromaDB write
 * failure, etc.) should be wrapped with `KB_TENANT_REPO_SYNC_SYNC_FAILED` and
 * the underlying `error.message` preserved (after secret redaction at the
 * GitMirror boundary per `TenantRepoAccessContract.redactTenantRepoSecrets`).
 */
export class TenantRepoSyncError extends Error {
    /**
     * @param {String} code Stable code from this module's exported constants.
     * @param {String} message Operator-readable description (already redacted).
     * @param {Object} [meta] Non-secret structured context (tenantId, repoSlug, phase, etc.).
     */
    constructor(code, message, meta = {}) {
        super(message);
        this.name = 'TenantRepoSyncError';
        this.code = code;
        this.meta = meta;
    }
}

/**
 * Returns `true` when `code` is a recognized tenant-repo-sync error code.
 * Used by boundary handlers to decide whether to wrap-as-SYNC_FAILED or pass-through.
 *
 * @param {String|null|undefined} code
 * @returns {Boolean}
 */
export function isTenantRepoSyncErrorCode(code) {
    return typeof code === 'string' && TENANT_REPO_SYNC_ERROR_CODE_SET.has(code);
}
