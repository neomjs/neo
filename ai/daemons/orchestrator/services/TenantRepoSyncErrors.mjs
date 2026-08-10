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
 * @see https://github.com/neomjs/neo/issues/16045
 */

export const KB_TENANT_REPO_SYNC_SYNC_FAILED            = 'KB_TENANT_REPO_SYNC_SYNC_FAILED';
export const KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED    = 'KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED';
export const KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND       = 'KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND';
export const KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED = 'KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED';
export const KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT = 'KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT';
export const KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION = 'KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION';
// The OTHER half of what `EMPTY_MATERIALIZATION` used to carry, and the opposite instruction.
// A full materialization DID take effect — rows were ingested or deleted — but no receipt proves
// this attempt, so the ingest is real and its proof is missing. Observed live with
// `ingested=50, embeddings=50, errors=0` and no receipt.
//
// It is a separate CODE rather than a field on the existing one because the per-repo durable state
// persists `lastErrorCode` and nothing else — there is no `lastErrorDetails` anywhere in `ai/`, so a
// discriminator carried in `details` would be dropped at the persistence boundary and never reach the
// operator it exists for. A code is the only channel that survives.
//
// The distinction is not cosmetic: this arm means DO NOT re-ingest — the data landed and re-running
// risks duplicating it — while `EMPTY_MATERIALIZATION` means nothing arrived and the embed stage is
// where to look. One code for both told an operator the opposite of what happened half the time.
export const KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN = 'KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN';
// Non-failure defer reason: another process holds the cross-process tenant-repo-sync
// lease. Surfaced as a `skipped` reasonCode (never thrown) so the periodic lane and
// the manual CLI can branch on it without treating operator ownership as an error.
export const KB_TENANT_REPO_SYNC_LEASE_HELD = 'KB_TENANT_REPO_SYNC_LEASE_HELD';
// Commit-point fence: lease ownership was lost (TTL eviction or takeover) between
// acquisition and a manifest write. The sweep aborts WITHOUT writing, so an evicted
// writer can never overlap the new owner's manifest commits.
export const KB_TENANT_REPO_SYNC_LEASE_LOST = 'KB_TENANT_REPO_SYNC_LEASE_LOST';
// Starved-lane detector finding: every configured repo is backoff-suppressed with zero
// lifetime successes and the oldest suppression exceeds the configured duration floor.
// Surfaced as a `starved` sweep reading + exactly one heal-ledger record per episode
// (a record-with-diagnosis, never an action) — never thrown; the sweep machinery itself is healthy.
export const KB_TENANT_REPO_SYNC_STARVED = 'KB_TENANT_REPO_SYNC_STARVED';

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
    KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION,
    KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN,
    KB_TENANT_REPO_SYNC_LEASE_HELD,
    KB_TENANT_REPO_SYNC_LEASE_LOST,
    KB_TENANT_REPO_SYNC_STARVED
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
