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
// A resolved `tenantRepoSync.sliceBudgetMs` that is not a positive integer. It refuses rather than
// substituting a default, and the refusal is the point: this budget is the only thing bounding how
// long one repo may hold a concurrency slot, so a value silently corrected back to a working number
// would leave an operator believing they had tuned fairness while the shipped guarantee was
// something else entirely.
//
// `0` reaches here like any other invalid value — deliberately, because the alternative reading is
// the footgun. A disable sentinel would mean "unlimited slot hold", which is precisely the state
// this budget exists to remove, spelled as though it were an off switch. Effectively-unbounded is
// expressed as a large number, visibly, and there is no value that turns the bound off.
export const KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET = 'KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET';
// A resolved `tenantRepoSync.concurrencyLimit` that is not a positive integer. `0` is rejected
// rather than read as "unlimited": it would size a semaphore no acquirer can ever enter, so the
// sweep would hang on its first repo — the never-acquirable-semaphore case. Fractional values are
// rejected because `active < limit` semantics become ambiguous (1.5 admits two slots). Refusal over
// substitution: the value resolves from an AiConfig leaf with no construction-time hook, and a
// consumption-site fallback would be a hidden default (the SSOT ADR's antipattern catalog) — an
// operator who mistyped the knob must see the refusal, not a silently different concurrency.
export const KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_LIMIT = 'KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_LIMIT';
// A resolved `tenantRepoSync.concurrencyGateTimeoutMs` that is not a finite number >= 0. Unlike the
// two codes above, `0` is VALID here — it is the FIFO-wait sentinel (queued acquirers wait until a
// slot frees), not a disable-the-bound footgun. Only negatives and non-finite values are refused.
export const KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_GATE_TIMEOUT = 'KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_GATE_TIMEOUT';
export const KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION = 'KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION';
// The OTHER half of what `EMPTY_MATERIALIZATION` used to carry, and the opposite instruction.
// A full materialization DID take effect — rows were ingested or deleted — but no receipt proves
// this attempt, so the ingest is real and its proof is missing.
//
// **This arm is defence-in-depth, not a reproduction of a known incident, and the distinction is
// load-bearing.** `persistManifestSnapshot` mints a fresh matching receipt for any valid
// positive-effect attempt and reuses a prior one only when its digest already matches, so no current
// producer path is known to deliver effect-plus-unmatched-proof. It is a genuine logical case of this
// guard's own predicate and a state the guard must refuse if it ever arises — which is a different
// and weaker warrant than "we have seen this". An earlier revision of this comment cited the live
// `ingested=50, embeddings=50, errors=0` observation here; that incident had **no receipt at all**
// rather than a mismatched one, so it belongs to the `EMPTY_MATERIALIZATION` side of the split.
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
// The THIRD zero-effect case, and the one that used to be told the opposite of what happened.
// Content reached the pipeline and every chunk was refused BEFORE the provider — `summary.ingested`
// counts embeddable chunks only, and an oversized chunk increments `skippedOversized` instead of
// joining that array, so a repo whose every chunk exceeds the safe band reports `ingested: 0` with
// `skippedOversized > 0`.
//
// It shared `EMPTY_MATERIALIZATION` and therefore told an operator *nothing arrived, look at the embed
// stage*. Everything arrived; the embed stage never saw it, and re-ingesting cannot help because the
// chunks are the same size on the next attempt. The actionable surface is chunking or the safe band.
//
// A separate CODE for the same reason as its neighbour above: the durable per-repo state persists
// `lastErrorCode` and nothing else, so a discriminator carried in `details` is dropped at the
// persistence boundary and never reaches the operator it exists for.
export const KB_TENANT_REPO_SYNC_CONTENT_NOT_EMBEDDABLE = 'KB_TENANT_REPO_SYNC_CONTENT_NOT_EMBEDDABLE';
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
    // Membership here is the PRESERVATION mechanism, not bookkeeping: `runTask()` keeps a thrown
    // code only when `isTenantRepoSyncErrorCode` says it is a member and wraps everything else as
    // the unspecific SYNC_FAILED — so a typed config refusal that is not listed dies at the public
    // boundary and the operator reads a generic failure. (The sibling INVALID_SLICE_BUDGET is NOT
    // a member and shares that wrap today; changing its public behavior is follow-up territory,
    // deliberately not smuggled into this concurrency lane.)
    KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_LIMIT,
    KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_GATE_TIMEOUT,
    KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION,
    KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN,
    KB_TENANT_REPO_SYNC_CONTENT_NOT_EMBEDDABLE,
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
