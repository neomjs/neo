import fs                        from 'fs-extra';
import {createHmac, randomBytes} from 'node:crypto';
import path                      from 'node:path';
import Base                      from '../../../../src/core/Base.mjs';
import AiConfig                  from '../../../config.mjs';
import GitMirror                 from '../../../services/knowledge-base/helpers/gitMirror.mjs';
import {
    buildIngestEnvelope,
    createTenantRepoMaterializationDigest
} from '../../../services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs';
import {
    isTenantRepoAccessReadinessOutcome,
    normalizeTenantRepoCredentialRef,
    TenantRepoAccessCode,
    TenantRepoAccessStatus
} from '../../../services/knowledge-base/helpers/tenantRepoAccessContract.mjs';
import {isRepoDue} from '../scheduling/tenantRepoSync.mjs';
import {
    KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION,
    KB_TENANT_REPO_SYNC_SYNC_FAILED,
    KB_TENANT_REPO_SYNC_LEASE_HELD,
    KB_TENANT_REPO_SYNC_LEASE_LOST,
    KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
    KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
    KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
    TenantRepoSyncError,
    isTenantRepoSyncErrorCode
} from './TenantRepoSyncErrors.mjs';
import {
    acquireHeavyMaintenanceLease,
    inspectHeavyMaintenanceLease,
    releaseHeavyMaintenanceLease,
    renewHeavyMaintenanceLease
} from './heavyMaintenanceLeasePrimitives.mjs';
import {
    classifyTenantRepoCheckpoint,
    normalizeTenantRepoCheckpointState,
    requiresTenantRepoCheckpointRevalidation,
    TENANT_REPO_INGEST_CONTRACT_VERSION,
    TenantRepoCheckpointStatus
} from './tenantRepoCheckpointValidity.mjs';

const
    ACCESS_CONFIG_FINGERPRINT_KEY    = randomBytes(32),
    ACCESS_READINESS_MIN_TTL_MS      = 15 * 60 * 1000,
    BOUNDED_KB_ERROR_CODE_PATTERN    = /^KB_[A-Z0-9_]{1,120}$/,
    PERSISTED_REVISIONS_FILE_NAME    = 'tenant-repo-sync-revisions.json',
    TENANT_REPO_SYNC_LEASE_FILE_NAME = 'tenant-repo-sync-lease.json';

/**
 * @summary In-memory async semaphore with optional slot-acquisition timeout.
 *
 * Caps the number of concurrent acquirers to `limit`. Acquirers beyond the limit
 * queue and resolve as slots are released (FIFO). If `timeoutMs > 0`, queued
 * acquirers reject with `KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT` after the
 * configured duration.
 *
 * Lifecycle is bounded to a single `runTask` invocation — a fresh semaphore is
 * created per call from the current reactive `concurrencyLimit` /
 * `concurrencyGateTimeoutMs` config values, so live config edits take effect
 * on the next cycle.
 *
 * @param {Object} options
 * @param {Number} options.limit Maximum concurrent acquirers.
 * @param {Number} [options.timeoutMs=0] Per-acquire slot-wait timeout. `0` disables.
 * @returns {{acquire: Function, release: Function}}
 */
function createConcurrencySemaphore({limit, timeoutMs = 0}) {
    let   active  = 0;
    const waiters = [];

    const handoffSlot = () => {
        while (active < limit && waiters.length > 0) {
            const waiter = waiters.shift();
            if (waiter.timeoutId) clearTimeout(waiter.timeoutId);
            active++;
            waiter.resolve();
        }
    };

    return {
        async acquire() {
            if (active < limit) {
                active++;
                return;
            }
            return new Promise((resolve, reject) => {
                const waiter = {resolve, reject, timeoutId: null};
                if (timeoutMs > 0) {
                    waiter.timeoutId = setTimeout(() => {
                        const idx = waiters.indexOf(waiter);
                        if (idx !== -1) {
                            waiters.splice(idx, 1);
                            reject(new TenantRepoSyncError(
                                KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
                                `Concurrency gate timeout after ${timeoutMs}ms (limit=${limit})`,
                                {limit, timeoutMs, phase: 'concurrency-gate'}
                            ));
                        }
                    }, timeoutMs);
                }
                waiters.push(waiter);
            });
        },
        release() {
            if (active > 0) active--;
            handoffSlot();
        }
    };
}

function getSourceErrorCode(error, outerCode) {
    const sourceCode = error?.sourceErrorCode || error?.code;

    if (typeof sourceCode !== 'string' || sourceCode === outerCode) {
        return null;
    }

    return BOUNDED_KB_ERROR_CODE_PATTERN.test(sourceCode) ? sourceCode : null;
}

/**
 * @summary Builds an internal-only digest of the effective access configuration.
 * @param {Object} repo Effective tenant-repo entry.
 * @returns {String}
 * @private
 */
function hashTenantRepoAccessConfig(repo) {
    return createHmac('sha256', ACCESS_CONFIG_FINGERPRINT_KEY).update(JSON.stringify({
        branchRef    : repo.branchRef || 'HEAD',
        cloneUrl     : repo.cloneUrl,
        credentialRef: normalizeTenantRepoCredentialRef(repo.credentialRef)
    })).digest('hex');
}

/**
 * @summary Returns the stable internal key for one effective tenant repository.
 * @param {Object} repo Effective tenant-repo entry.
 * @returns {String}
 * @private
 */
function createTenantRepoAccessKey(repo) {
    return `${repo.tenantId}/${repo.repoSlug}`;
}

/**
 * @summary Returns true when a configured tenant repository is disabled.
 * @param {Object} repo Effective tenant-repo entry.
 * @returns {Boolean}
 * @private
 */
function isTenantRepoDisabled(repo) {
    return repo.disabled === true || repo.enabled === false;
}

/**
 * @summary Normalizes a readiness timestamp without copying arbitrary upstream data.
 * @param {*} value Candidate ISO timestamp.
 * @param {String} fallback Current observation timestamp.
 * @returns {String}
 * @private
 */
function safeAccessReadinessTimestamp(value, fallback) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value))
        ? new Date(value).toISOString()
        : fallback;
}

/**
 * @summary Derives a bounded evidence lifetime from the repo's normal acquisition cadence.
 *
 * Two cadence windows avoid an extra remote probe immediately beside every scheduled
 * fetch. The fifteen-minute floor prevents high-frequency repos from turning readiness
 * into a network poller.
 *
 * @param {Object} repo Effective tenant-repo entry.
 * @param {Number} globalCadenceMs Global per-repo cadence fallback.
 * @returns {Number}
 * @private
 */
function getAccessReadinessMaxAgeMs(repo, globalCadenceMs) {
    const cadenceMs = Number.isFinite(repo.cadenceMs) && repo.cadenceMs > 0
        ? repo.cadenceMs
        : globalCadenceMs;

    return Math.max(
        Number.isFinite(cadenceMs) && cadenceMs > 0 ? cadenceMs * 2 : 0,
        ACCESS_READINESS_MIN_TTL_MS
    );
}

/**
 * @summary Fails closed unless the KB ingestion result explicitly proves an error-free summary.
 *
 * `KnowledgeBaseIngestionService.ingestSourceFiles()` is intentionally fail-soft:
 * ingestion failures are returned inside `summary.errors` rather than necessarily
 * rejecting the promise. The tenant-repo caller therefore accepts only an object
 * with an array-valued, empty `errors` field before advancing revision state.
 *
 * Error messages and details from the summary are deliberately not copied into the
 * thrown error. The first bounded `KB_*` code is retained separately as source
 * provenance so the existing per-repo catch path can expose it as
 * `lastSourceErrorCode` without replacing the stable outer sync-failure code.
 *
 * @param {Object} summary Returned KB ingestion summary.
 * @returns {Object} The validated error-free summary.
 * @throws {Error} When the summary shape is ambiguous or contains any errors.
 */
function assertErrorFreeIngestionSummary(summary) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary) || !Array.isArray(summary.errors)) {
        throw new Error('Knowledge Base ingestion returned an invalid summary.')
    }

    if (summary.errors.length > 0) {
        const error      = new Error('Knowledge Base ingestion returned an error-bearing summary.');
        const sourceCode = summary.errors
            .map(item => item?.code)
            .find(code => typeof code === 'string' && BOUNDED_KB_ERROR_CODE_PATTERN.test(code));

        if (sourceCode) {
            error.sourceErrorCode = sourceCode
        }

        throw error
    }

    return summary
}

/**
 * @summary Verifies a graph receipt against the current full-materialization identity.
 * @param {*} receipt Candidate graph receipt.
 * @param {String} expectedDigest Digest of the current manifest-bearing envelope.
 * @returns {Boolean}
 */
function isMatchingMaterializationReceipt(receipt, expectedDigest) {
    return Boolean(
        receipt
        && receipt.ingestContractVersion === TENANT_REPO_INGEST_CONTRACT_VERSION
        && receipt.envelopeDigest === expectedDigest
        && /^[a-f0-9]{32}$/u.test(receipt.attemptId)
        && Number.isSafeInteger(receipt.recordedAt)
        && receipt.recordedAt > 0
    )
}

/**
 * @summary Requires a durable positive-effect proof before a full materialization can commit.
 *
 * A manifest-bearing envelope represents bootstrap, non-linear fallback, manual full
 * replay, or legacy revalidation. It must reach ingestion before this check so an
 * empty manifest can reconcile and delete stale rows. A fresh attempt must prove a
 * safely-counted ingest/delete effect and persist its matching graph receipt. A
 * zero-effect retry may settle only an unacknowledged receipt left by a prior positive
 * attempt whose checkpoint commit failed. Incremental envelopes have no manifest and
 * may remain healthy zero-delta checkpoints.
 *
 * @param {Object} envelope Tenant-repo ingestion envelope.
 * @param {Object} summary Validated error-free ingestion summary.
 * @param {Object|null} priorState Previous durable checkpoint.
 * @param {Object|null} materializationAttempt Current opaque full-attempt identity.
 * @returns {Object|null} Receipt to acknowledge in the final checkpoint.
 * @throws {TenantRepoSyncError} When a full materialization has no proved effect.
 */
function assertFullMaterializationEffect(envelope, summary, priorState, materializationAttempt) {
    if (envelope?.manifestSnapshot == null) {
        return null
    }

    const
        expectedDigest = createTenantRepoMaterializationDigest(envelope),
        receipt        = summary.materializationReceipt,
        validReceipt   = isMatchingMaterializationReceipt(receipt, expectedDigest),
        hasEffect      = [summary.ingested, summary.deleted]
            .some(value => Number.isSafeInteger(value) && value > 0),
        provesCurrentAttempt = validReceipt
            && receipt.attemptId === materializationAttempt?.attemptId,
        provesUncommittedRetry = validReceipt
            && receipt.attemptId !== materializationAttempt?.attemptId
            && receipt.attemptId !== priorState?.lastCommittedMaterializationAttemptId;

    if ((hasEffect && !provesCurrentAttempt) || (!hasEffect && !provesUncommittedRetry)) {
        throw new TenantRepoSyncError(
            KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION,
            'Tenant-repo full materialization produced no durable positive-effect proof.',
            {phase: 'full-materialization'}
        )
    }

    return receipt
}

/**
 * @summary Cloud-deployable scheduler lane that pulls tenant repos into the deployment KB.
 *
 * Bridges the `tenant-repo-sync` Orchestrator periodic lane (registered via
 * `taskDefinitions.mjs` `serviceTask: true`) to the per-repo refresh cycle:
 *
 * ```
 *   tenantRepos[] config (normalized via TenantRepoAccessContract)
 *     -> per-repo loop
 *          -> GitMirror.cloneIfMissing + GitMirror.fetch
 *          -> buildIngestEnvelope({tenantId, repoSlug, mirrorRoot, lastIngestedRev, ...})
 *          -> KnowledgeBaseIngestionService.ingestSourceFiles(envelope) (viaMcp: false)
 *          -> require an explicit error-free ingestion summary
 *          -> persist lastIngestedRev for next cycle
 * ```
 *
 * The push-based ingestion path (`ingest_source_files`, `npm run ai:kb-push-client`,
 * `npm run ai:ingest-tenant`) is unchanged. This lane is the additive PULL complement
 * for cloud tenant deployments. Local-only lanes (`primary-dev-sync`, `kbSync`,
 * `bridgeDaemon`) are unaffected — `kbSync` is never re-pointed at tenant content per
 * the cloud-deployment lane-classification ADR's separation invariant.
 *
 * Per-repo failure isolation: a failure on one tenantRepo entry does NOT halt the
 * sweep; it is logged + healthService-recorded + the remaining repos continue. The
 * outer task lifecycle reports `completed` when no repos failed OR at least one repo
 * succeeded (partial-success contract — per-repo isolation precludes all-or-nothing
 * semantics); `failed` only when every configured repo failed; `skipped` when no
 * repos were configured.
 *
 * @class Neo.ai.daemons.services.TenantRepoSyncService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/services/knowledge-base/helpers/gitMirror.mjs
 * @see ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs
 * @see ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs
 * @see learn/agentos/cloud-deployment/TenantIngestionModel.md
 * @see https://github.com/neomjs/neo/issues/16045
 */
class TenantRepoSyncService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.TenantRepoSyncService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.TenantRepoSyncService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Concurrency cap on simultaneous tenant-repo git/ingest work within one
         * `runTask` invocation. Default `2` is conservative for multi-tenant
         * cloud deployments. Set to `1` to serialize all work when deployment
         * capacity is constrained. Set higher when network/CPU headroom permits.
         * @member {Number} concurrencyLimit_=2
         * @reactive
         */
        concurrencyLimit_: 2,
        /**
         * Maximum time a per-repo task waits to acquire a concurrency slot before
         * surfacing `KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT`. Default `30000`
         * (30s) accommodates a slow-clone tenant ahead in the queue without
         * waiting indefinitely. Set to `0` to disable the timeout (slots wait
         * indefinitely until a release).
         * @member {Number} concurrencyGateTimeoutMs_=30000
         * @reactive
         */
        concurrencyGateTimeoutMs_: 30000
    }

    /**
     * Process-local tenant-repo capability evidence. Hidden fingerprints exist
     * only to detect effective config or credential rotation; the public getter
     * projects status, code, and timestamp only. Container restart deliberately
     * clears the cache and returns readiness to unknown until bootstrap probes run.
     * @member {Map<String, Object>} accessReadinessCache
     * @protected
     */
    accessReadinessCache = new Map()

    /**
     * Rejects non-positive-integer `concurrencyLimit` values. `0` would create a
     * never-acquirable semaphore; negatives and fractional values produce ambiguous
     * `active < limit` semantics (1.5 admits two slots, etc.). Invalid values fall
     * back to the previous valid value, or the template default if no prior value.
     *
     * @param {*} value
     * @param {Number} oldValue
     * @returns {Number}
     */
    beforeSetConcurrencyLimit(value, oldValue) {
        if (!Number.isInteger(value) || value < 1) return oldValue ?? 2;
        return value;
    }

    /**
     * Rejects non-finite or negative `concurrencyGateTimeoutMs` values. `0` is a
     * valid sentinel meaning "no timeout — slots wait indefinitely until release".
     *
     * @param {*} value
     * @param {Number} oldValue
     * @returns {Number}
     */
    beforeSetConcurrencyGateTimeoutMs(value, oldValue) {
        if (!Number.isFinite(value) || value < 0) return oldValue ?? 30000;
        return value;
    }

    /**
     * @summary Returns a bounded readiness result for one effective repository.
     * @param {Object} repo Tenant and repository identity.
     * @param {Object} [options]
     * @param {Number} [options.observedAt=Date.now()] Observation epoch.
     * @returns {{status: String, code: String, checkedAt: String}|null}
     */
    getTenantRepoAccessReadiness(repo = {}, {observedAt = Date.now()} = {}) {
        const entry = this.accessReadinessCache.get(createTenantRepoAccessKey(repo));

        if (!entry) {
            return null;
        }

        if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= observedAt) {
            return {
                status   : TenantRepoAccessStatus.UNKNOWN,
                code     : TenantRepoAccessCode.EVIDENCE_EXPIRED,
                checkedAt: entry.checkedAt
            };
        }

        return {
            status   : entry.status,
            code     : entry.code,
            checkedAt: entry.checkedAt
        };
    }

    /**
     * @summary Clears volatile access evidence, mirroring a process restart.
     * @returns {void}
     * @protected
     */
    clearTenantRepoAccessReadiness() {
        this.accessReadinessCache.clear();
    }

    /**
     * @summary Probes every enabled effective repository at bootstrap or access-config rotation.
     *
     * Local credential resolution runs on every sweep so file/key replacement is observed.
     * Remote capability work runs only when the process-local config or credential fingerprint
     * changes. A failure remains isolated to its repository and never prevents other probes or
     * the authoritative scheduled clone/fetch path.
     *
     * @param {Object} options
     * @param {Object[]} options.repos Effective tenant repositories.
     * @param {Object} [options.gitMirror=GitMirror] GitMirror-compatible primitive.
     * @param {Function} [options.writeLog] Optional orchestrator logger.
     * @param {Number} [options.globalCadenceMs] Global per-repo cadence fallback.
     * @returns {Promise<void>}
     */
    async refreshTenantRepoAccessReadiness({
        repos = [],
        gitMirror = GitMirror,
        writeLog,
        globalCadenceMs = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs
    } = {}) {
        const enabledRepos = repos.filter(repo => !isTenantRepoDisabled(repo));
        const activeKeys   = new Set(enabledRepos.map(createTenantRepoAccessKey));

        for (const key of this.accessReadinessCache.keys()) {
            if (!activeKeys.has(key)) {
                this.accessReadinessCache.delete(key);
            }
        }

        const semaphore = createConcurrencySemaphore({
            limit: this.concurrencyLimit
        });

        await Promise.all(enabledRepos.map(async repo => {
            await semaphore.acquire();

            try {
                await this.refreshTenantRepoAccessReadinessEntry({
                    repo,
                    gitMirror,
                    writeLog,
                    globalCadenceMs
                });
            } finally {
                semaphore.release();
            }
        }));
    }

    /**
     * @summary Refreshes one process-local access-readiness cache entry.
     * @param {Object} options
     * @param {Object} options.repo Effective tenant repository.
     * @param {Object} options.gitMirror GitMirror-compatible primitive.
     * @param {Function} [options.writeLog] Optional orchestrator logger.
     * @param {Number} options.globalCadenceMs Global per-repo cadence fallback.
     * @returns {Promise<void>}
     * @protected
     */
    async refreshTenantRepoAccessReadinessEntry({repo, gitMirror, writeLog, globalCadenceMs}) {
        const
            key        = createTenantRepoAccessKey(repo),
            checkedAt  = new Date().toISOString(),
            maxAgeMs   = getAccessReadinessMaxAgeMs(repo, globalCadenceMs),
            nextExpiry = Date.now() + maxAgeMs;

        let configFingerprint;

        try {
            configFingerprint = hashTenantRepoAccessConfig(repo);
        } catch {
            this.accessReadinessCache.set(key, {
                status               : TenantRepoAccessStatus.DEGRADED,
                code                 : TenantRepoAccessCode.CREDENTIAL_INVALID,
                checkedAt,
                configFingerprint    : null,
                credentialFingerprint: null,
                expiresAt            : nextExpiry,
                maxAgeMs
            });
            return;
        }

        if (
            typeof gitMirror?.inspectCredentialReadiness !== 'function'
            || typeof gitMirror?.probeRemoteAccess !== 'function'
        ) {
            this.accessReadinessCache.set(key, {
                status               : TenantRepoAccessStatus.UNKNOWN,
                code                 : TenantRepoAccessCode.PROBE_UNAVAILABLE,
                checkedAt,
                configFingerprint,
                credentialFingerprint: null,
                expiresAt            : nextExpiry,
                maxAgeMs
            });
            return;
        }

        let local;

        try {
            local = await gitMirror.inspectCredentialReadiness({
                credentialRef: repo.credentialRef
            });
        } catch {
            local = null;
        }

        if (
            local?.status !== TenantRepoAccessStatus.READY
            || typeof local.cacheFingerprint !== 'string'
            || !local.cacheFingerprint
        ) {
            this.accessReadinessCache.set(key, {
                status               : TenantRepoAccessStatus.DEGRADED,
                code                 : TenantRepoAccessCode.CREDENTIAL_INVALID,
                checkedAt,
                configFingerprint,
                credentialFingerprint: null,
                expiresAt            : nextExpiry,
                maxAgeMs
            });
            writeLog?.('WARN', `[TenantRepoSync] Access preflight degraded for ${key}: ${TenantRepoAccessCode.CREDENTIAL_INVALID}.`);
            return;
        }

        const previous = this.accessReadinessCache.get(key);

        if (
            previous?.configFingerprint === configFingerprint
            && previous?.credentialFingerprint === local.cacheFingerprint
            && Number.isFinite(previous.expiresAt)
            && previous.expiresAt > Date.now()
        ) {
            return;
        }

        let probe;

        try {
            probe = await gitMirror.probeRemoteAccess({
                cloneUrl     : repo.cloneUrl,
                credentialRef: repo.credentialRef,
                mirrorRoot   : repo.mirrorRoot,
                ref          : repo.branchRef || 'HEAD'
            });
        } catch {
            probe = null;
        }

        const
            validOutcome = isTenantRepoAccessReadinessOutcome(probe?.status, probe?.code),
            status       = validOutcome ? probe.status : TenantRepoAccessStatus.DEGRADED,
            code         = validOutcome ? probe.code : TenantRepoAccessCode.PROBE_FAILED;

        this.accessReadinessCache.set(key, {
            status,
            code,
            checkedAt            : safeAccessReadinessTimestamp(probe?.checkedAt, checkedAt),
            configFingerprint,
            credentialFingerprint: typeof probe?.cacheFingerprint === 'string' && probe.cacheFingerprint
                ? probe.cacheFingerprint
                : local.cacheFingerprint,
            expiresAt: nextExpiry,
            maxAgeMs
        });

        if (status !== TenantRepoAccessStatus.READY) {
            writeLog?.('WARN', `[TenantRepoSync] Access preflight degraded for ${key}: ${code}.`);
        }
    }

    /**
     * @summary Lets an authoritative clone/fetch result supersede cached probe evidence.
     * @param {Object} options
     * @param {Object} options.repo Effective tenant repository.
     * @param {Boolean} options.ready Whether Git acquisition succeeded.
     * @param {Error} [options.error] GitMirror failure when acquisition did not succeed.
     * @param {Number} [options.globalCadenceMs] Global per-repo cadence fallback.
     * @returns {void}
     * @protected
     */
    recordTenantRepoAccessOutcome({
        repo,
        ready,
        error,
        globalCadenceMs = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs
    } = {}) {
        const
            key       = createTenantRepoAccessKey(repo),
            previous  = this.accessReadinessCache.get(key) || {},
            checkedAt = new Date().toISOString(),
            maxAgeMs  = getAccessReadinessMaxAgeMs(repo, globalCadenceMs),
            code      = ready
                ? TenantRepoAccessCode.READY
                : (error?.code === 'KB_GITMIRROR_CREDENTIAL_REF_INVALID'
                    ? TenantRepoAccessCode.CREDENTIAL_INVALID
                    : TenantRepoAccessCode.SYNC_FAILED);

        this.accessReadinessCache.set(key, {
            ...previous,
            status   : ready ? TenantRepoAccessStatus.READY : TenantRepoAccessStatus.DEGRADED,
            code,
            checkedAt,
            expiresAt: Date.now() + maxAgeMs,
            maxAgeMs
        });
    }

    /**
     * Runs the tenant-repo-sync task under orchestrator state + health envelopes.
     *
     * Error code taxonomy (see `./TenantRepoSyncErrors.mjs`). Operators branch on
     * `details.repos[i].lastErrorCode` for per-repo failures,
     * `details.repos[i].lastSourceErrorCode` for redacted sibling-subsystem
     * provenance, and `details.reasonCode` for outer-task structural failures.
     * Underlying transport errors
     * (GitMirror auth, ChromaDB write, etc.) are wrapped as
     * `KB_TENANT_REPO_SYNC_SYNC_FAILED` so callers can rely on the stable prefix
     * without parsing message prose. When the underlying error already carried a
     * stable `KB_*` code (for example `KB_GITMIRROR_FETCH_FAILED`), that code is
     * preserved as `lastSourceErrorCode` without copying raw stderr, URLs, or
     * credential material.
     *
     * | Code | Surface | Trigger |
     * |---|---|---|
     * | `KB_TENANT_REPO_SYNC_SYNC_FAILED` | per-repo `lastErrorCode` | underlying clone/fetch/envelope/ingest failure (wraps the original error) |
     * | `KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION` | per-repo `lastErrorCode` | full materialization lacks a fresh positive effect or matching unacknowledged retry receipt |
     * | `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED` | outer `details.reasonCode` | `onlyRepoSlugs` filter requested a slug that is not in `tenantRepos[]` |
     * | `KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED` | outer `details.reasonCode` | `tenant-repo-sync-revisions.json` write failure (next cycle settles the unacknowledged graph receipt idempotently) |
     * | `KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND` | reserved | future `--tenant-id` CLI flag; no current emitter |
     * | `KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT` | per-repo `lastErrorCode` | concurrency-gate slot-acquisition timeout after `concurrencyGateTimeoutMs` |
     *
     * @param {Object} options
     * @param {String} [options.taskName='tenant-repo-sync']
     * @param {String} options.reason Scheduling reason (e.g. `'periodic-sweep:1800000'` or `'manual'`).
     * @param {Object} options.taskStateService Orchestrator task-state service.
     * @param {Object} [options.healthService] HealthService-compatible sink.
     * @param {Function} [options.writeLog] Orchestrator logger.
     * @param {Object} [options.tenantReposConfig] Pre-normalized tenantRepos config. If omitted, resolved across config tiers via `KnowledgeBaseIngestionService.listConfiguredTenantRepos`.
     * @param {Object} [options.gitMirror=GitMirror] Injectable mirror primitive (test seam).
     * @param {Object} [options.knowledgeBaseIngestionService] KB ingestion service singleton (test seam). Resolved from `ai/services.mjs` if omitted.
     * @param {String[]} [options.onlyRepoSlugs] If provided, only sync repos whose `repoSlug` is in the list. Used by the manual CLI run path. Empty filter result against non-empty list surfaces `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED`.
     * @param {Boolean} [options.fullReplay=false] Build selected-repo envelopes from a null revision base. Requires non-empty `onlyRepoSlugs`; persisted checkpoints remain unchanged until each replay completes without summary errors.
     * @param {String} [options.revisionsFilePath] Override the per-tenant-repo lastIngestedRev persistence file path (test seam). Defaults to `<orchestrator dataDir leaf>/tenant-repo-sync-revisions.json`.
     * @param {Number} [options.leaseStaleAfterMs] Override the cross-process lease TTL (test seam). Defaults to the `orchestrator.tenantRepoSync.leaseStaleAfterMs` leaf. Crashed owners recover immediately via pid-liveness; the TTL only bounds a live-but-wedged owner.
     * @param {Number} [options.leaseRenewalIntervalMs] Override the lease renewal cadence (test seam). Defaults to `max(5000, floor(leaseStaleAfterMs / 3))` — a live, renewing run never reaches its TTL deadline, so a replacement owner cannot start repo work while this one is still making progress.
     * @param {Function} [options.envelopeBuilder=buildIngestEnvelope] Injectable envelope-builder (test seam). Production callers omit; unit tests pass a fake that returns canned envelope shape.
     * @returns {Promise<Object>} `{status, details}` — status ∈ {`completed`, `failed`, `skipped`}.
     */
    async runTask({
        taskName = 'tenant-repo-sync',
        reason,
        taskStateService,
        healthService,
        writeLog,
        tenantReposConfig,
        gitMirror = GitMirror,
        knowledgeBaseIngestionService,
        onlyRepoSlugs,
        fullReplay = false,
        revisionsFilePath,
        envelopeBuilder   = buildIngestEnvelope,
        globalCadenceMs   = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs,
        jitterRatio       = AiConfig.data.orchestrator.tenantRepoSync.jitterRatio,
        leaseStaleAfterMs = AiConfig.data.orchestrator.tenantRepoSync.leaseStaleAfterMs,
        leaseRenewalIntervalMs,
        seedBootstrap     = true
    } = {}) {
        const state = taskStateService.getTaskState(taskName);

        if (state?.running) {
            const details = {reason, skippedAt: new Date().toISOString(), reasonCode: 'already-running', pid: state.pid};
            writeLog?.('INFO', `[TenantRepoSync] Skipping; task already running.`);
            healthService?.recordTaskOutcome?.(taskName, 'skipped', details);
            return {status: 'skipped', details};
        }

        // Cross-process serialization: the daemon's periodic sweep and the manual CLI are
        // separate processes sharing one revisions manifest, and the injected task-state
        // guard above is process-local only. One dedicated tokenized lease — a sibling
        // file of the manifest, so lock and data share a persistence/recovery boundary —
        // makes them mutually exclusive. Contention is a non-failure deferral that never
        // mutates any repo's checkpoint, attempt timestamp, or backoff state. Crashed
        // owners recover instantly via pid-liveness; the TTL bounds wedged-but-alive ones.
        const resolvedRevisionsPath = revisionsFilePath || this.defaultRevisionsFilePath();
        const resolvedLeasePath     = path.join(path.dirname(resolvedRevisionsPath), TENANT_REPO_SYNC_LEASE_FILE_NAME);

        let acquisition;
        try {
            acquisition = await acquireHeavyMaintenanceLease({
                owner       : `tenant-repo-sync:${reason === 'manual' ? 'manual' : 'scheduler'}`,
                reason      : 'tenant-repo-sync',
                leasePath   : resolvedLeasePath,
                staleAfterMs: leaseStaleAfterMs
            });
        } catch (e) {
            // An IO failure while creating the lease (unwritable state dir, broken volume)
            // is a lane failure, not a crash: keep the structured-result contract.
            const details = {
                reason,
                phase     : 'lease-acquire',
                error     : e.message,
                reasonCode: KB_TENANT_REPO_SYNC_SYNC_FAILED
            };
            taskStateService.markFailed(taskName, null, {status: 'failed', ...details});
            writeLog?.('ERROR', `[TenantRepoSync] Failed: ${KB_TENANT_REPO_SYNC_SYNC_FAILED} (lease-acquire: ${e.message})`);
            healthService?.recordTaskOutcome?.(taskName, 'failed', details);
            return {status: 'failed', details};
        }

        if (!acquisition.acquired) {
            const heldLease = acquisition.lease;
            const details   = {
                reason,
                skippedAt      : new Date().toISOString(),
                reasonCode     : KB_TENANT_REPO_SYNC_LEASE_HELD,
                leaseOwner     : heldLease?.owner || 'unknown',
                leaseAcquiredAt: heldLease?.acquiredAt || null,
                leaseExpiresAt : heldLease?.expiresAt || null
            };
            writeLog?.('INFO', `[TenantRepoSync] Deferring; cross-process lease held by ${details.leaseOwner}.`);
            taskStateService.markSkipped(taskName, {status: 'skipped', ...details});
            healthService?.recordTaskOutcome?.(taskName, 'skipped', details);
            return {status: 'skipped', details};
        }

        taskStateService.markStarted(taskName, reason);

        // Work-level exclusivity is three cooperating parts:
        //
        // 1. RENEWAL — a live run extends its own deadline every
        //    `renewalIntervalMs` (default TTL/3, floor 5s), so a run that is
        //    still making progress never becomes TTL-stale and can never be
        //    reclaimed mid-work. Losing a renewal (replaced lease, missing
        //    file, IO failure) latches `leaseLost`.
        // 2. WORK FENCES — `leaseGuard` runs before each repo's git phase,
        //    before each KB ingest, and before every manifest commit. A run
        //    whose ownership is no longer provable stops STARTING protected
        //    work at the next fence instead of overlapping the successor;
        //    in-flight work is bounded to at most one fenced step.
        // 3. TTL BACKSTOP — pid-liveness + the (renewal-refreshed) deadline
        //    still bound a crashed or fully wedged owner for successors.
        let leaseLost      = false,
            renewalStopped = false,
            renewalTimer   = null;

        const renewalIntervalMsResolved = leaseRenewalIntervalMs ?? Math.max(5000, Math.floor(leaseStaleAfterMs / 3));

        const scheduleRenewal = () => {
            renewalTimer = setTimeout(async () => {
                try {
                    const renewal = await renewHeavyMaintenanceLease({
                        token       : acquisition.lease.token,
                        leasePath   : resolvedLeasePath,
                        staleAfterMs: leaseStaleAfterMs
                    });

                    if (!renewal.renewed) {
                        leaseLost = true;
                        writeLog?.('WARN', `[TenantRepoSync] Lease renewal lost ownership (${renewal.status}); aborting at the next fence.`);
                        return;
                    }
                } catch (e) {
                    leaseLost = true;
                    writeLog?.('WARN', `[TenantRepoSync] Lease renewal failed (${e.message}); aborting at the next fence.`);
                    return;
                }

                if (!renewalStopped) {
                    scheduleRenewal();
                }
            }, renewalIntervalMsResolved);
            renewalTimer.unref?.();
        };
        scheduleRenewal();

        const leaseGuard = async () => {
            if (leaseLost) {
                throw new TenantRepoSyncError(
                    KB_TENANT_REPO_SYNC_LEASE_LOST,
                    'Tenant-repo-sync lease ownership was lost (renewal failure); aborting before further protected work.',
                    {phase: 'lease-fence'}
                );
            }

            const currentLease = await inspectHeavyMaintenanceLease({leasePath: resolvedLeasePath});

            if (!currentLease.active || currentLease.lease?.token !== acquisition.lease.token) {
                leaseLost = true;
                throw new TenantRepoSyncError(
                    KB_TENANT_REPO_SYNC_LEASE_LOST,
                    'Tenant-repo-sync lease ownership was lost; aborting before further protected work.',
                    {phase: 'lease-fence'}
                );
            }
        };

        try {
            const result = await this.syncTenantRepos({
                writeLog, tenantReposConfig, gitMirror, knowledgeBaseIngestionService, onlyRepoSlugs,
                fullReplay, taskStateService, healthService, taskName, envelopeBuilder, leaseGuard,
                revisionsFilePath: resolvedRevisionsPath,
                globalCadenceMs, jitterRatio, seedBootstrap
            });
            const status         = result.status;
            const lastCompletion = {
                status,
                reason,
                ...result.details
            };

            if (status === 'completed') {
                taskStateService.markCompleted(taskName, lastCompletion);
            } else if (status === 'failed') {
                taskStateService.markFailed(taskName, null, lastCompletion);
            } else {
                taskStateService.markSkipped(taskName, lastCompletion);
            }

            healthService?.recordTaskOutcome?.(taskName, status, {reason, ...result.details});
            return result;
        } catch (e) {
            // Propagate stable error code + meta when the throw is a TenantRepoSyncError;
            // otherwise wrap as the unspecific KB_TENANT_REPO_SYNC_SYNC_FAILED so operators
            // can branch on `error.code` instead of message prose.
            const code    = isTenantRepoSyncErrorCode(e.code) ? e.code : KB_TENANT_REPO_SYNC_SYNC_FAILED;
            const meta    = (e instanceof TenantRepoSyncError) ? e.meta : undefined;
            const details = {
                reason,
                phase     : 'tenant-repo-sync',
                error     : e.message,
                reasonCode: code,
                ...(meta ? {meta} : {})
            };

            taskStateService.markFailed(taskName, null, {status: 'failed', ...details});
            writeLog?.('ERROR', `[TenantRepoSync] Failed: ${code} (${e.message})`);
            healthService?.recordTaskOutcome?.(taskName, 'failed', details);
            return {status: 'failed', details};
        } finally {
            // Token-guarded release on every settled path (success, returned-error result,
            // throw). A hard process crash skips this block by definition — the next
            // acquirer then reclaims via the pid-liveness stale check instead.
            renewalStopped = true;
            if (renewalTimer) {
                clearTimeout(renewalTimer);
            }
            await releaseHeavyMaintenanceLease({token: acquisition.lease.token, leasePath: resolvedLeasePath});
        }
    }

    /**
     * Iterates configured tenantRepos and refreshes each via GitMirror → envelope → KB.
     *
     * @param {Object} options Forwarded from `runTask`.
     * @returns {Promise<Object>} `{status, details: {repoCount, completedCount, failedCount, results}}`.
     */
    async syncTenantRepos({
        writeLog, tenantReposConfig, gitMirror, knowledgeBaseIngestionService, onlyRepoSlugs,
        fullReplay = false, taskStateService, healthService, taskName, revisionsFilePath, envelopeBuilder = buildIngestEnvelope,
        leaseGuard      = async () => {},
        globalCadenceMs = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs,
        jitterRatio     = AiConfig.data.orchestrator.tenantRepoSync.jitterRatio,
        seedBootstrap   = true
    }) {
        if (fullReplay && (!Array.isArray(onlyRepoSlugs) || onlyRepoSlugs.length === 0)) {
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_SYNC_FAILED,
                'Full replay requires at least one explicitly selected repo slug.',
                {phase: 'full-replay-validation'}
            )
        }

        const resolvedConfig = tenantReposConfig || await this.resolveTenantReposConfig({ingestionService: knowledgeBaseIngestionService});
        const allRepos       = resolvedConfig.tenantRepos || [];
        const repos          = onlyRepoSlugs
            ? allRepos.filter(r => onlyRepoSlugs.includes(r.repoSlug))
            : allRepos;

        // Distinguish "operator-requested-unknown-slug" from "no config at all".
        // Empty filter result with non-empty onlyRepoSlugs = stable REPO_NOT_CONFIGURED
        // error so the CLI / future API surface can branch on `error.code`.
        if (repos.length === 0 && onlyRepoSlugs?.length > 0) {
            const knownSlugs   = allRepos.map(r => r.repoSlug);
            const unknownSlugs = onlyRepoSlugs.filter(s => !knownSlugs.includes(s));
            const details      = {
                reason         : 'repo-not-configured',
                reasonCode     : KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
                repoCount      : 0,
                requestedSlugs : onlyRepoSlugs,
                unknownSlugs,
                configuredSlugs: knownSlugs
            };
            writeLog?.('WARN', `[TenantRepoSync] Requested repoSlug(s) not configured: ${unknownSlugs.join(', ')}. Configured: ${knownSlugs.join(', ') || '(none)'}.`);
            return {status: 'failed', details};
        }

        if (repos.length === 0) {
            const details = {reason: 'no-tenant-repos-configured', repoCount: 0};
            writeLog?.('INFO', `[TenantRepoSync] No tenantRepos configured; skipping.`);
            return {status: 'skipped', details};
        }

        await this.refreshTenantRepoAccessReadiness({
            repos: allRepos,
            gitMirror,
            writeLog,
            globalCadenceMs
        });

        const resolvedRevisionsPath = revisionsFilePath || this.defaultRevisionsFilePath();
        const ingestionService      = knowledgeBaseIngestionService || await this.resolveIngestionService();
        const persistedRevisions    = await this.readPersistedRevisions({
            filePath: resolvedRevisionsPath,
            strict  : true
        });

        if (Object.values(persistedRevisions).some(
            state => classifyTenantRepoCheckpoint(state) === TenantRepoCheckpointStatus.UNSUPPORTED
        )) {
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_SYNC_FAILED,
                'Tenant-repo checkpoint state was written by a newer ingestion contract.',
                {phase: 'checkpoint-contract-validation'}
            );
        }

        const repoStates     = [];
        let   completedCount = 0;
        let   failedCount    = 0;
        let   abortedCount   = 0;

        // Per-runTask concurrency gate caps simultaneous git/ingest work.
        // Fresh instance per call so live `concurrencyLimit` / `concurrencyGateTimeoutMs`
        // config edits take effect on the next cycle. JS is single-threaded so the shared
        // mutable counters (`completedCount` / `failedCount`) and `repoStates` array are safe.
        const semaphore = createConcurrencySemaphore({
            limit    : this.concurrencyLimit,
            timeoutMs: this.concurrencyGateTimeoutMs
        });

        let notDueCount               = 0;
        let revalidationDeferredCount = 0;

        // Bootstrap-spread seeding prevents all fresh repos (`lastRunAttemptAt = 0`)
        // from becoming due on the first sweep regardless of jitter; `(now - 0)`
        // always exceeds any reasonable cadence.
        // Seeding `lastRunAttemptAt = now - baseCadenceMs` makes the effective
        // due-time `now + jitterMs`, so first-sync attempts spread across
        // `[0, jitterRatio * baseCadenceMs)` per repo. Persisted state survives
        // orchestrator restarts so HA-failover preserves the spread.
        // Skipped when `onlyRepoSlugs` is set (manual CLI bypass) or when caller
        // explicitly opts out via `seedBootstrap: false` (test seam for spec files
        // that simulate "first cycle fires all repos").
        let seededAny = false;
        if (seedBootstrap && !onlyRepoSlugs) {
            const sweepStartedMs = Date.now();
            for (const repo of repos) {
                const repoLabel = `${repo.tenantId}/${repo.repoSlug}`;
                if (!persistedRevisions[repoLabel]) {
                    const baseCadenceMs = (Number.isFinite(repo.cadenceMs) && repo.cadenceMs > 0)
                        ? repo.cadenceMs
                        : globalCadenceMs;
                    persistedRevisions[repoLabel] = {
                        lastIngestedRev                      : null,
                        lastRunAttemptAt                     : sweepStartedMs - baseCadenceMs,
                        consecutiveFailures                  : 0,
                        ingestContractVersion                : null,
                        lastAttemptedIngestContractVersion   : null,
                        lastCommittedMaterializationAttemptId: null
                    };
                    seededAny = true;
                    writeLog?.('INFO', `[TenantRepoSync] Bootstrap-seeding ${repoLabel} (sync scheduled within jitter window).`);
                }
            }
            if (seededAny) {
                await leaseGuard();
                await this.writePersistedRevisions({filePath: resolvedRevisionsPath, revisions: persistedRevisions});
            }
        }

        // Existing jitter spreads brand-new repo states, but legacy checkpoints
        // already have persisted timestamps and can all be due on the first upgraded
        // sweep. Admit at most one concurrency window of automatic null-base replays
        // per sweep. Oldest attempts go first; label ordering makes ties stable across
        // restarts. Manual selectors remain an explicit operator bypass.
        const revalidationAdmissionLabels = new Set();
        if (!onlyRepoSlugs) {
            const admissionObservedAt = Date.now();
            const dueLegacyRepos      = repos
                .map(repo => {
                    const
                        repoLabel  = `${repo.tenantId}/${repo.repoSlug}`,
                        priorState = persistedRevisions[repoLabel] || null,
                        dueState   = isRepoDue({
                            repo,
                            persistedRepoState: priorState,
                            now               : admissionObservedAt,
                            globalCadenceMs,
                            jitterRatio
                        });

                    return {repoLabel, priorState, dueState};
                })
                .filter(({priorState, dueState}) =>
                    dueState.due && requiresTenantRepoCheckpointRevalidation(priorState)
                )
                .sort((a, b) =>
                    (a.priorState?.lastRunAttemptAt ?? 0) - (b.priorState?.lastRunAttemptAt ?? 0)
                    || a.repoLabel.localeCompare(b.repoLabel)
                )
                .slice(0, this.concurrencyLimit);

            for (const {repoLabel} of dueLegacyRepos) {
                revalidationAdmissionLabels.add(repoLabel);
            }
        }

        const syncRepo = async (repo) => {
            const
                repoLabel            = `${repo.tenantId}/${repo.repoSlug}`,
                priorState           = persistedRevisions[repoLabel] || null,
                checkpointStatus     = classifyTenantRepoCheckpoint(priorState),
                revalidationRequired = requiresTenantRepoCheckpointRevalidation(priorState),
                startedMs            = Date.now();

            // Per-repo due check applies deterministic jitter + exponential backoff on
            // top of configured cadence. Manual CLI runs (onlyRepoSlugs filter)
            // bypass the due-check — operator-initiated sync should always fire for the
            // requested repos.
            if (!onlyRepoSlugs) {
                const dueState = isRepoDue({
                    repo,
                    persistedRepoState: priorState,
                    now               : startedMs,
                    globalCadenceMs,
                    jitterRatio
                });

                if (!dueState.due) {
                    const nextDueAtMs = (priorState?.lastRunAttemptAt ?? 0) + dueState.effectiveCadenceMs;
                    notDueCount++;
                    writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} not yet due (next ~${new Date(nextDueAtMs).toISOString()}, consecutiveFailures=${priorState?.consecutiveFailures ?? 0}, backoffX=${dueState.backoffMultiplier}).`);
                    repoStates.push({
                        tenantId           : repo.tenantId,
                        repoSlug           : repo.repoSlug,
                        lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                        lastSyncAt         : priorState?.lastRunAttemptAt ? new Date(priorState.lastRunAttemptAt).toISOString() : null,
                        status             : 'not-due',
                        checkpointStatus,
                        nextDueAt          : new Date(nextDueAtMs).toISOString(),
                        effectiveCadenceMs : dueState.effectiveCadenceMs,
                        consecutiveFailures: priorState?.consecutiveFailures ?? 0
                    });
                    return; // skip semaphore + work entirely
                }
            }

            if (
                revalidationRequired
                && !onlyRepoSlugs
                && !revalidationAdmissionLabels.has(repoLabel)
            ) {
                revalidationDeferredCount++;
                writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} legacy checkpoint replay deferred by the per-sweep admission cap.`);
                repoStates.push({
                    tenantId           : repo.tenantId,
                    repoSlug           : repo.repoSlug,
                    lastIngestedRev    : priorState.lastIngestedRev.slice(0, 8),
                    lastSyncAt         : priorState.lastRunAttemptAt ? new Date(priorState.lastRunAttemptAt).toISOString() : null,
                    status             : 'revalidation-deferred',
                    checkpointStatus,
                    consecutiveFailures: priorState.consecutiveFailures ?? 0
                });
                return;
            }

            let slotAcquired    = false,
                accessConfirmed = false;
            try {
                await semaphore.acquire();
                slotAcquired = true;

                // Work fence: do not START this repo's git phase without provable
                // lease ownership. A run that lost its lease (renewal failure or
                // reclamation) stops here instead of running git work concurrently
                // with its successor.
                await leaseGuard();
                writeLog?.('INFO', `[TenantRepoSync] Refreshing ${repoLabel}.`);

                await gitMirror.cloneIfMissing({
                    tenantId     : repo.tenantId,
                    repoSlug     : repo.repoSlug,
                    mirrorRoot   : repo.mirrorRoot,
                    cloneUrl     : repo.cloneUrl,
                    credentialRef: repo.credentialRef
                });
                await gitMirror.fetch({
                    tenantId     : repo.tenantId,
                    repoSlug     : repo.repoSlug,
                    mirrorRoot   : repo.mirrorRoot,
                    credentialRef: repo.credentialRef
                });
                accessConfirmed = true;
                this.recordTenantRepoAccessOutcome({repo, ready: true, globalCadenceMs});

                const envelope = await envelopeBuilder({
                    tenantId       : repo.tenantId,
                    repoSlug       : repo.repoSlug,
                    mirrorRoot     : repo.mirrorRoot,
                    lastIngestedRev: fullReplay || revalidationRequired
                        ? null
                        : (priorState?.lastIngestedRev || null),
                    newHead      : repo.branchRef || 'HEAD',
                    rootKind     : repo.rootKind || 'external-source',
                    parserId     : repo.parserId,
                    parserVersion: repo.parserVersion,
                    gitMirror
                });

                if (typeof envelope?.headRevision !== 'string' || !envelope.headRevision.trim()) {
                    throw new Error('Tenant-repo ingestion envelope did not prove a head revision.');
                }

                // Work fence: the KB write is the second substrate mutation this
                // lane protects (the manifest commit being the first).
                await leaseGuard();

                const materializationAttempt = envelope.manifestSnapshot == null
                    ? null
                    : {
                        attemptId            : randomBytes(16).toString('hex'),
                        ingestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                    };
                const
                    envelopeDigest = materializationAttempt
                        ? createTenantRepoMaterializationDigest(envelope)
                        : null,
                    existingManifest = materializationAttempt
                        && typeof ingestionService.getTenantManifest === 'function'
                        ? await ingestionService.getTenantManifest({
                            tenantId: repo.tenantId,
                            repoSlug: repo.repoSlug
                        })
                        : null,
                    retryReceipt = isMatchingMaterializationReceipt(
                        existingManifest?.materializationReceipt,
                        envelopeDigest
                    ) && existingManifest.materializationReceipt.attemptId
                        !== priorState?.lastCommittedMaterializationAttemptId
                        ? existingManifest.materializationReceipt
                        : null,
                    ingestResult = assertErrorFreeIngestionSummary(retryReceipt
                        ? {
                            ingested              : 0,
                            deleted               : 0,
                            errors                : [],
                            materializationReceipt: retryReceipt
                        }
                        : await ingestionService.ingestSourceFiles({
                            ...envelope,
                            ...(materializationAttempt ? {materializationAttempt} : {}),
                            viaMcp: false // operator-bulk path
                        }));

                const materializationReceipt = assertFullMaterializationEffect(
                    envelope,
                    ingestResult,
                    priorState,
                    materializationAttempt
                );

                // Persist full per-repo state on success. Reset consecutiveFailures
                // to 0 (backoff is the multiplier-component of effectiveCadence; reset on
                // successful sync). lastRunAttemptAt advances to
                // startedMs so subsequent due-checks measure from the actual attempt.
                persistedRevisions[repoLabel] = {
                    lastIngestedRev                      : envelope.headRevision || priorState?.lastIngestedRev || null,
                    lastRunAttemptAt                     : startedMs,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: materializationReceipt?.attemptId
                        || priorState?.lastCommittedMaterializationAttemptId
                        || null
                };

                const durationMs = Date.now() - startedMs;
                const shortHead  = envelope.headRevision ? envelope.headRevision.slice(0, 8) : null;
                const ingested   = ingestResult.ingested ?? 0;
                const deleted    = ingestResult.deleted  ?? 0;

                writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} completed: head=${shortHead ?? 'unknown'} ingested=${ingested} deleted=${deleted} (${durationMs}ms)`);

                repoStates.push({
                    tenantId            : repo.tenantId,
                    repoSlug            : repo.repoSlug,
                    lastIngestedRev     : shortHead,
                    lastSyncAt          : new Date().toISOString(),
                    status              : 'active',
                    checkpointStatus    : TenantRepoCheckpointStatus.COMPLETE,
                    lastSyncDeletedCount: deleted
                });
                completedCount++;
                healthService?.recordTaskOutcome?.(taskName, 'completed', {
                    repo            : repoLabel,
                    tenantId        : repo.tenantId,
                    repoSlug        : repo.repoSlug,
                    ingested,
                    deleted,
                    headRevision    : shortHead,
                    durationMs,
                    checkpointStatus: TenantRepoCheckpointStatus.COMPLETE
                });
            } catch (e) {
                // Lease loss is a RUN-level abort, not a repo failure: leave the
                // repo's checkpoint, attempt timestamp, and backoff state untouched
                // (the successor owns forward progress now), record an 'aborted'
                // repo state, and let the post-sweep check raise the structural
                // LEASE_LOST for the whole run.
                if (e.code === KB_TENANT_REPO_SYNC_LEASE_LOST) {
                    abortedCount++;
                    writeLog?.('WARN', `[TenantRepoSync] ${repoLabel} aborted: lease ownership lost before protected work.`);
                    repoStates.push({
                        tenantId           : repo.tenantId,
                        repoSlug           : repo.repoSlug,
                        lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                        lastSyncAt         : priorState?.lastRunAttemptAt ? new Date(priorState.lastRunAttemptAt).toISOString() : null,
                        status             : 'aborted-lease-lost',
                        checkpointStatus,
                        consecutiveFailures: priorState?.consecutiveFailures ?? 0
                    });
                    return;
                }

                const code            = isTenantRepoSyncErrorCode(e.code) ? e.code : KB_TENANT_REPO_SYNC_SYNC_FAILED;
                const sourceErrorCode = getSourceErrorCode(e, code);
                const sourceSuffix    = sourceErrorCode ? ` source=${sourceErrorCode}` : '';
                writeLog?.('ERROR', `[TenantRepoSync] ${repoLabel} failed: ${code}${sourceSuffix} (${e.message})`);

                if (slotAcquired && !accessConfirmed) {
                    this.recordTenantRepoAccessOutcome({repo, ready: false, error: e, globalCadenceMs});
                }

                // Increment consecutiveFailures on failure; preserve last good
                // ingested revision so the next successful run starts from the correct base.
                // lastRunAttemptAt advances even on failure (backoff measures from attempt
                // start, not last-success).
                const nextFailureCount = (priorState?.consecutiveFailures ?? 0) + 1;
                persistedRevisions[repoLabel] = {
                    lastIngestedRev                      : priorState?.lastIngestedRev || null,
                    lastRunAttemptAt                     : startedMs,
                    consecutiveFailures                  : nextFailureCount,
                    ingestContractVersion                : priorState?.ingestContractVersion ?? null,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: priorState?.lastCommittedMaterializationAttemptId || null
                };

                const failedRepoState = {
                    tenantId           : repo.tenantId,
                    repoSlug           : repo.repoSlug,
                    lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                    lastSyncAt         : new Date().toISOString(),
                    status             : 'degraded',
                    checkpointStatus   : classifyTenantRepoCheckpoint(persistedRevisions[repoLabel]),
                    lastErrorCode      : code,
                    consecutiveFailures: nextFailureCount
                };

                if (sourceErrorCode) {
                    failedRepoState.lastSourceErrorCode = sourceErrorCode;
                }

                repoStates.push(failedRepoState);
                failedCount++;
                healthService?.recordTaskOutcome?.(taskName, 'failed', {
                    repo    : repoLabel,
                    tenantId: repo.tenantId,
                    repoSlug: repo.repoSlug,
                    error   : e.message,
                    code,
                    ...(sourceErrorCode ? {sourceErrorCode} : {}),
                    consecutiveFailures: nextFailureCount,
                    checkpointStatus   : failedRepoState.checkpointStatus
                });
                // Continue with remaining repos — per-repo failure isolation is the
                // tenant deployment contract.
            } finally {
                if (slotAcquired) semaphore.release();
            }
        };

        // Reserved migration work runs as a bounded first cohort. Normal repos
        // are not enqueued until those admitted replays settle, so their
        // concurrency-gate timeout clocks cannot expire behind intentionally
        // prioritized migration work.
        const
            admittedRevalidationRepos = repos.filter(repo =>
                revalidationAdmissionLabels.has(`${repo.tenantId}/${repo.repoSlug}`)
            ),
            remainingRepos = repos.filter(repo =>
                !revalidationAdmissionLabels.has(`${repo.tenantId}/${repo.repoSlug}`)
            );

        await Promise.all(admittedRevalidationRepos.map(syncRepo));
        await Promise.all(remainingRepos.map(syncRepo));

        // Any lease-lost abort makes the whole run structurally failed: partial
        // per-repo results must not be committed (the successor's run is the
        // authoritative one), and per-repo backoff state was deliberately left
        // untouched above.
        if (abortedCount > 0) {
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_LEASE_LOST,
                `Tenant-repo-sync lease ownership was lost mid-sweep; ${abortedCount} repo(s) aborted before protected work and no manifest was committed.`,
                {phase: 'lease-fence', abortedCount}
            );
        }

        await leaseGuard();
        await this.writePersistedRevisions({filePath: resolvedRevisionsPath, revisions: persistedRevisions});

        // Status logic: not-due repos don't change the success/failure tally — a cycle
        // where ALL repos were not-due is still 'completed' (the cycle ran successfully;
        // each repo's decision was honored). 'failed' only when actual work failed and no
        // actual work succeeded.
        const attemptedCount = completedCount + failedCount;
        const status         = attemptedCount === 0
            ? 'completed' // all repos were not-due; cycle ran cleanly
            : (failedCount === 0 ? 'completed' : (completedCount > 0 ? 'completed' : 'failed'));

        writeLog?.('INFO', `[TenantRepoSync] Cycle summary: ${repos.length} repos, ${completedCount} completed, ${failedCount} failed, ${notDueCount} not-due, ${revalidationDeferredCount} revalidation-deferred.`);

        return {
            status,
            details: {
                repoCount: repos.length,
                completedCount,
                failedCount,
                notDueCount,
                revalidationDeferredCount,
                repos    : repoStates
            }
        };
    }

    /**
     * @summary Resolves the effective `tenantRepos` across all tenants via the tiered resolver
     * `KnowledgeBaseIngestionService.listConfiguredTenantRepos` (graph node > `kb-config.yaml`
     * bootstrap > `aiConfig.tenantRepos[]` default, per-tenant single-winner, flattened). Replaces
     * the prior direct `aiConfig.tenantRepos` read so the documented bootstrap / graph tiers are
     * actually honored on the pull path.
     *
     * Then materializes an absent per-repo `mirrorRoot` from the resolved
     * `AiConfig.orchestrator.tenantRepoMirrorRoot` leaf. That leaf owns both the cloud default
     * and its env binding; this consumer must not re-resolve either one. `tier1MirrorRoot`
     * remains an explicit test seam and full short-circuit.
     *
     * @param {Object} [options]
     * @param {String} [options.tier1MirrorRoot] Pre-resolved Tier-1 mirrorRoot default (test seam).
     * @param {Object} [options.ingestionService] Stub KB ingestion service (test seam); defaults to the live singleton.
     * @returns {Promise<{tenantRepos: Array<Object>, configDiagnostics: Object}>} Effective repos with
     *     the Knowledge Base resolver's bounded config diagnostics preserved unchanged.
     * @throws {TypeError} When the resolved Tier-1 mirror root is not a non-empty string.
     */
    async resolveTenantReposConfig({tier1MirrorRoot, ingestionService} = {}) {
        const tier1Default = tier1MirrorRoot ?? AiConfig.orchestrator.tenantRepoMirrorRoot;

        if (typeof tier1Default !== 'string' || tier1Default.trim() === '') {
            throw new TypeError('AiConfig.orchestrator.tenantRepoMirrorRoot must resolve to a non-empty string.');
        }

        const kbService  = ingestionService || await this.resolveIngestionService();
        const normalized = await kbService.listConfiguredTenantRepos();

        normalized.tenantRepos = normalized.tenantRepos.map(entry =>
            entry.mirrorRoot ? entry : {...entry, mirrorRoot: tier1Default}
        );

        return normalized;
    }

    /**
     * Resolves the live `KnowledgeBaseIngestionService` singleton.
     *
     * @returns {Promise<Object>}
     */
    async resolveIngestionService() {
        const services = await import('../../../services.mjs');
        return services.KB_IngestionService;
    }

    /**
     * Default per-tenant-repo lastIngestedRev persistence file path. Lives next to
     * the orchestrator state file (`<orchestrator dataDir leaf>/orchestrator-state.json`)
     * so the two persistence surfaces share lifecycle (same data-dir = same recovery scope).
     * Separate file (not inlined into TaskStateService's state) prevents `markCompleted/markFailed`
     * task-lifecycle writes from racing with revision-map writes. The dataDir resolves from the
     * owning config leaf inline — a use-site read, never a module-load capture.
     *
     * @returns {String}
     */
    defaultRevisionsFilePath() {
        return path.join(AiConfig.orchestrator.dataDir, PERSISTED_REVISIONS_FILE_NAME);
    }

    /**
     * Reads the per-tenant-repo persisted state map. Missing file = empty map (bootstrap).
     *
     * Current per-repo persisted state shape:
     * ```
     * {
     *   lastIngestedRev                    : '<sha>',
     *   lastRunAttemptAt                   : <ms-epoch>,
     *   consecutiveFailures                : <int>,
     *   ingestContractVersion              : <int|null>,
     *   lastAttemptedIngestContractVersion : <int|null>,
     *   lastCommittedMaterializationAttemptId: <hex|null>
     * }
     * ```
     *
     * Backward-compatible read: legacy persistence stored bare SHA strings under
     * `revisions[label]`. On read, string-shaped entries are normalized to the full
     * state shape without manufacturing an ingestion-contract proof. The scheduler
     * therefore admits one bounded null-base replay before trusting that head.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Boolean} [options.strict=false] Throw on corrupt/unreadable files instead of returning an empty map.
     * @returns {Promise<Object<String, Object>>}
     */
    async readPersistedRevisions({filePath, strict = false}) {
        if (!await fs.pathExists(filePath)) {
            return {};
        }
        try {
            const data = await fs.readJson(filePath);
            if (
                !data
                || typeof data !== 'object'
                || !data.revisions
                || typeof data.revisions !== 'object'
                || Array.isArray(data.revisions)
            ) {
                if (strict) {
                    const error = new Error(`Tenant-repo-sync revisions at ${filePath} have an invalid shape.`);
                    error.code  = 'KB_TENANT_REPO_SYNC_REVISIONS_INVALID';
                    throw error;
                }
                return {};
            }

            const normalized = {};
            for (const [label, value] of Object.entries(data.revisions)) {
                const checkpointState = normalizeTenantRepoCheckpointState(value);

                if (checkpointState) {
                    normalized[label] = checkpointState;
                } else if (strict) {
                    const error = new Error('Tenant-repo-sync revision entry has an invalid shape.');
                    error.code  = 'KB_TENANT_REPO_SYNC_REVISIONS_INVALID';
                    throw error;
                }
            }
            return normalized;
        } catch (e) {
            if (strict) {
                const error = new Error(`Failed to read tenant-repo-sync revisions at ${filePath}: ${e.message}`);
                error.code = e.code || 'KB_TENANT_REPO_SYNC_REVISIONS_READ_FAILED';
                throw error;
            }
            return {};
        }
    }

    /**
     * Persists the per-tenant-repo lastIngestedRev map. Creates the parent
     * directory on first write so a fresh deployment doesn't need explicit dir
     * provisioning.
     *
     * Atomic whole-file replacement: the document is written to a temporary
     * sibling, fsynced, then renamed over the target. A process crash at any
     * point therefore leaves either the previous complete manifest or the new
     * complete manifest on disk — never a truncated JSON document (which the
     * strict reader would otherwise fail-close the whole lane on).
     *
     * Throws `TenantRepoSyncError(KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED)` on
     * write failure so the next cycle re-detects the same diff and retries
     * idempotently (per-repo failure isolation contract). The temporary sibling
     * is best-effort removed on failure.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Object<String, String>} options.revisions
     * @param {Object} [options.fsModule=fs] File-system implementation seam (fault-injection test seam).
     * @returns {Promise<void>}
     */
    async writePersistedRevisions({filePath, revisions, fsModule = fs}) {
        const tmpPath = `${filePath}.tmp-${process.pid}`;

        try {
            await fsModule.ensureDir(path.dirname(filePath));

            // writeFile carries Node's full-write contract (it retries partial
            // writes internally), unlike a single unchecked fs.write() whose
            // bytesWritten may be short. Only after the COMPLETE payload exists
            // is it fsynced and atomically renamed over the target.
            await fsModule.writeFile(tmpPath, JSON.stringify({revisions}, null, 2) + '\n');

            const fd = await fsModule.open(tmpPath, 'r+');
            try {
                await fsModule.fsync(fd);
            } finally {
                await fsModule.close(fd);
            }

            await fsModule.rename(tmpPath, filePath);
        } catch (e) {
            await fsModule.remove(tmpPath).catch(() => {});
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
                `Failed to persist tenant-repo-sync revisions at ${filePath}: ${e.message}`,
                {filePath, phase: 'manifest-update'}
            );
        }
    }
}

export default Neo.setupClass(TenantRepoSyncService);
