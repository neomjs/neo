import fs from 'fs-extra';
import path from 'node:path';
import Base from '../../../../src/core/Base.mjs';
import AiConfig from '../../../config.mjs';
import {DEFAULT_DATA_DIR} from '../taskDefinitions.mjs';
import GitMirror from '../../../services/knowledge-base/helpers/gitMirror.mjs';
import {buildIngestEnvelope} from '../../../services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs';
import {isRepoDue} from '../scheduling/tenantRepoSync.mjs';
import {
    KB_TENANT_REPO_SYNC_SYNC_FAILED,
    KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
    KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
    KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
    TenantRepoSyncError,
    isTenantRepoSyncErrorCode
} from './TenantRepoSyncErrors.mjs';

const PERSISTED_REVISIONS_FILE_NAME = 'tenant-repo-sync-revisions.json';

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
    let active = 0;
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
     * Runs the tenant-repo-sync task under orchestrator state + health envelopes.
     *
     * Error code taxonomy (see `./TenantRepoSyncErrors.mjs`). Operators branch on
     * `details.repos[i].lastErrorCode` for per-repo failures and `details.reasonCode`
     * for outer-task structural failures. Underlying transport errors
     * (GitMirror auth, ChromaDB write, etc.) are wrapped as
     * `KB_TENANT_REPO_SYNC_SYNC_FAILED` so callers can rely on the stable prefix
     * without parsing message prose.
     *
     * | Code | Surface | Trigger |
     * |---|---|---|
     * | `KB_TENANT_REPO_SYNC_SYNC_FAILED` | per-repo `lastErrorCode` | underlying clone/fetch/envelope/ingest failure (wraps the original error) |
     * | `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED` | outer `details.reasonCode` | `onlyRepoSlugs` filter requested a slug that is not in `tenantRepos[]` |
     * | `KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED` | outer `details.reasonCode` | `tenant-repo-sync-revisions.json` write failure (next cycle retries idempotently) |
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
     * @param {String} [options.revisionsFilePath] Override the per-tenant-repo lastIngestedRev persistence file path (test seam). Defaults to `<DEFAULT_DATA_DIR>/tenant-repo-sync-revisions.json`.
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
        revisionsFilePath,
        envelopeBuilder = buildIngestEnvelope,
        globalCadenceMs = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs,
        jitterRatio     = AiConfig.data.orchestrator.tenantRepoSync.jitterRatio,
        seedBootstrap   = true
    } = {}) {
        const state = taskStateService.getTaskState(taskName);

        if (state?.running) {
            const details = {reason, skippedAt: new Date().toISOString(), reasonCode: 'already-running', pid: state.pid};
            writeLog?.('INFO', `[TenantRepoSync] Skipping; task already running.`);
            healthService?.recordTaskOutcome?.(taskName, 'skipped', details);
            return {status: 'skipped', details};
        }

        taskStateService.markStarted(taskName, reason);

        try {
            const result = await this.syncTenantRepos({
                writeLog, tenantReposConfig, gitMirror, knowledgeBaseIngestionService, onlyRepoSlugs,
                taskStateService, healthService, taskName, revisionsFilePath, envelopeBuilder,
                globalCadenceMs, jitterRatio, seedBootstrap
            });
            const status = result.status;

            if (status === 'completed') {
                taskStateService.markCompleted(taskName);
            } else if (status === 'failed') {
                taskStateService.markFailed(taskName, null);
            } else {
                taskStateService.markSkipped(taskName);
            }

            healthService?.recordTaskOutcome?.(taskName, status, {reason, ...result.details});
            return result;
        } catch (e) {
            // Propagate stable error code + meta when the throw is a TenantRepoSyncError;
            // otherwise wrap as the unspecific KB_TENANT_REPO_SYNC_SYNC_FAILED so operators
            // can branch on `error.code` instead of message prose.
            const code      = isTenantRepoSyncErrorCode(e.code) ? e.code : KB_TENANT_REPO_SYNC_SYNC_FAILED;
            const meta      = (e instanceof TenantRepoSyncError) ? e.meta : undefined;
            const details   = {
                reason,
                phase     : 'tenant-repo-sync',
                error     : e.message,
                reasonCode: code,
                ...(meta ? {meta} : {})
            };

            taskStateService.markFailed(taskName, null);
            writeLog?.('ERROR', `[TenantRepoSync] Failed: ${code} (${e.message})`);
            healthService?.recordTaskOutcome?.(taskName, 'failed', details);
            return {status: 'failed', details};
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
        taskStateService, healthService, taskName, revisionsFilePath, envelopeBuilder = buildIngestEnvelope,
        globalCadenceMs = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs,
        jitterRatio     = AiConfig.data.orchestrator.tenantRepoSync.jitterRatio,
        seedBootstrap   = true
    }) {
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
            const details = {
                reason     : 'repo-not-configured',
                reasonCode : KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
                repoCount  : 0,
                requestedSlugs: onlyRepoSlugs,
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

        const resolvedRevisionsPath = revisionsFilePath || this.defaultRevisionsFilePath();
        const ingestionService      = knowledgeBaseIngestionService || await this.resolveIngestionService();
        const persistedRevisions    = await this.readPersistedRevisions({filePath: resolvedRevisionsPath});
        const repoStates = [];
        let   completedCount     = 0;
        let   failedCount        = 0;

        // Per-runTask concurrency gate caps simultaneous git/ingest work.
        // Fresh instance per call so live `concurrencyLimit` / `concurrencyGateTimeoutMs`
        // config edits take effect on the next cycle. JS is single-threaded so the shared
        // mutable counters (`completedCount` / `failedCount`) and `repoStates` array are safe.
        const semaphore = createConcurrencySemaphore({
            limit    : this.concurrencyLimit,
            timeoutMs: this.concurrencyGateTimeoutMs
        });

        let notDueCount = 0;

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
                        lastIngestedRev    : null,
                        lastRunAttemptAt   : sweepStartedMs - baseCadenceMs,
                        consecutiveFailures: 0
                    };
                    seededAny = true;
                    writeLog?.('INFO', `[TenantRepoSync] Bootstrap-seeding ${repoLabel} (sync scheduled within jitter window).`);
                }
            }
            if (seededAny) {
                await this.writePersistedRevisions({filePath: resolvedRevisionsPath, revisions: persistedRevisions});
            }
        }

        await Promise.all(repos.map(async (repo) => {
            const repoLabel    = `${repo.tenantId}/${repo.repoSlug}`;
            const priorState   = persistedRevisions[repoLabel] || null;
            const startedMs    = Date.now();

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
                        nextDueAt          : new Date(nextDueAtMs).toISOString(),
                        effectiveCadenceMs : dueState.effectiveCadenceMs,
                        consecutiveFailures: priorState?.consecutiveFailures ?? 0
                    });
                    return; // skip semaphore + work entirely
                }
            }

            let slotAcquired = false;
            try {
                await semaphore.acquire();
                slotAcquired = true;
                writeLog?.('INFO', `[TenantRepoSync] Refreshing ${repoLabel}.`);

                await gitMirror.cloneIfMissing({
                    tenantId      : repo.tenantId,
                    repoSlug      : repo.repoSlug,
                    mirrorRoot    : repo.mirrorRoot,
                    cloneUrl      : repo.cloneUrl,
                    credentialRef : repo.credentialRef
                });
                await gitMirror.fetch({
                    tenantId      : repo.tenantId,
                    repoSlug      : repo.repoSlug,
                    mirrorRoot    : repo.mirrorRoot,
                    credentialRef : repo.credentialRef
                });

                const envelope = await envelopeBuilder({
                    tenantId        : repo.tenantId,
                    repoSlug        : repo.repoSlug,
                    mirrorRoot      : repo.mirrorRoot,
                    lastIngestedRev : priorState?.lastIngestedRev || null,
                    newHead         : repo.branchRef || 'HEAD',
                    rootKind        : repo.rootKind || 'external-source',
                    parserId        : repo.parserId,
                    parserVersion   : repo.parserVersion,
                    gitMirror
                });

                const ingestResult = await ingestionService.ingestSourceFiles({
                    ...envelope,
                    viaMcp: false // operator-bulk path
                });

                // Persist full per-repo state on success. Reset consecutiveFailures
                // to 0 (backoff is the multiplier-component of effectiveCadence; reset on
                // successful sync). lastRunAttemptAt advances to
                // startedMs so subsequent due-checks measure from the actual attempt.
                persistedRevisions[repoLabel] = {
                    lastIngestedRev    : envelope.headRevision || priorState?.lastIngestedRev || null,
                    lastRunAttemptAt   : startedMs,
                    consecutiveFailures: 0
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
                    durationMs
                });
            } catch (e) {
                const code = isTenantRepoSyncErrorCode(e.code) ? e.code : KB_TENANT_REPO_SYNC_SYNC_FAILED;
                writeLog?.('ERROR', `[TenantRepoSync] ${repoLabel} failed: ${code} (${e.message})`);

                // Increment consecutiveFailures on failure; preserve last good
                // ingested revision so the next successful run starts from the correct base.
                // lastRunAttemptAt advances even on failure (backoff measures from attempt
                // start, not last-success).
                const nextFailureCount = (priorState?.consecutiveFailures ?? 0) + 1;
                persistedRevisions[repoLabel] = {
                    lastIngestedRev    : priorState?.lastIngestedRev || null,
                    lastRunAttemptAt   : startedMs,
                    consecutiveFailures: nextFailureCount
                };

                repoStates.push({
                    tenantId           : repo.tenantId,
                    repoSlug           : repo.repoSlug,
                    lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                    lastSyncAt         : new Date().toISOString(),
                    status             : 'degraded',
                    lastErrorCode      : code,
                    consecutiveFailures: nextFailureCount
                });
                failedCount++;
                healthService?.recordTaskOutcome?.(taskName, 'failed', {
                    repo               : repoLabel,
                    tenantId           : repo.tenantId,
                    repoSlug           : repo.repoSlug,
                    error              : e.message,
                    code,
                    consecutiveFailures: nextFailureCount
                });
                // Continue with remaining repos — per-repo failure isolation is the
                // tenant deployment contract.
            } finally {
                if (slotAcquired) semaphore.release();
            }
        }));

        await this.writePersistedRevisions({filePath: resolvedRevisionsPath, revisions: persistedRevisions});

        // Status logic: not-due repos don't change the success/failure tally — a cycle
        // where ALL repos were not-due is still 'completed' (the cycle ran successfully;
        // each repo's decision was honored). 'failed' only when actual work failed and no
        // actual work succeeded.
        const attemptedCount = completedCount + failedCount;
        const status = attemptedCount === 0
            ? 'completed' // all repos were not-due; cycle ran cleanly
            : (failedCount === 0 ? 'completed' : (completedCount > 0 ? 'completed' : 'failed'));

        writeLog?.('INFO', `[TenantRepoSync] Cycle summary: ${repos.length} repos, ${completedCount} completed, ${failedCount} failed, ${notDueCount} not-due.`);

        return {
            status,
            details: {
                repoCount   : repos.length,
                completedCount,
                failedCount,
                notDueCount,
                repos       : repoStates
            }
        };
    }

    /**
     * Resolves the effective `tenantRepos` across all tenants via the tiered resolver
     * `KnowledgeBaseIngestionService.listConfiguredTenantRepos` (graph node > `kb-config.yaml`
     * bootstrap > `aiConfig.tenantRepos[]` default, per-tenant single-winner, flattened). Replaces
     * the prior direct `aiConfig.tenantRepos` read so the documented bootstrap / graph tiers are
     * actually honored on the pull path.
     *
     * Then materializes per-repo `mirrorRoot` via a defensive fallback chain when the per-repo
     * override is absent:
     *
     *   1. `tier1MirrorRoot` (test seam — full short-circuit)
     *   2. `orchestratorConfig.tenantRepoMirrorRoot` (canonical path; Tier-1 env-bound default)
     *   3. `env.NEO_TENANT_REPO_MIRROR_ROOT` (defensive — covers stale-overlay deployments
     *      where the operator's gitignored `ai/config.mjs` predates the new
     *      `tenantRepoMirrorRoot` key + envBindings entry, so the Tier-1 lookup misses)
     *   4. `'/app/.neo-ai-data'` (hardcoded final fallback)
     *
     * The (3) layer is the "stale gitignored overlay copied into deploy image" defense:
     * `ai/deploy/Dockerfile` does `COPY . .` before `initServerConfigs.mjs` runs in
     * warn-only mode, so an older operator overlay survives into the container with no
     * `tenantRepoMirrorRoot` key — but the env var is still injected via compose, so
     * a direct `process.env` read keeps the resolver behavior correct regardless.
     *
     * Test seams: `ingestionService` injects a stub KB service (bypasses the live singleton
     * lookup); `tier1MirrorRoot` short-circuits the mirrorRoot chain; `orchestratorConfig`
     * stubs the AiConfig.orchestrator section; `env` stubs `process.env`.
     *
     * @param {Object} [options]
     * @param {String} [options.tier1MirrorRoot] Pre-resolved Tier-1 mirrorRoot default (test seam).
     * @param {Object} [options.orchestratorConfig=AiConfig.orchestrator] Stub for the AiConfig.orchestrator section (test seam).
     * @param {Object} [options.env=process.env] Stub for the env-var lookup (test seam).
     * @param {Object} [options.ingestionService] Stub KB ingestion service (test seam); defaults to the live singleton.
     * @returns {Promise<{tenantRepos: Array<Object>}>}
     */
    async resolveTenantReposConfig({tier1MirrorRoot, orchestratorConfig = AiConfig.orchestrator, env = process.env, ingestionService} = {}) {
        const tier1Default = tier1MirrorRoot
            ?? orchestratorConfig?.tenantRepoMirrorRoot
            ?? env.NEO_TENANT_REPO_MIRROR_ROOT
            ?? '/app/.neo-ai-data';
        const kbService    = ingestionService || await this.resolveIngestionService();
        const normalized   = await kbService.listConfiguredTenantRepos();

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
     * the orchestrator state file (`<DEFAULT_DATA_DIR>/orchestrator-state.json`)
     * so the two persistence surfaces share lifecycle (same data-dir = same recovery scope).
     * Separate file (not inlined into TaskStateService's state) prevents `markCompleted/markFailed`
     * task-lifecycle writes from racing with revision-map writes.
     *
     * @returns {String}
     */
    defaultRevisionsFilePath() {
        return path.join(DEFAULT_DATA_DIR, PERSISTED_REVISIONS_FILE_NAME);
    }

    /**
     * Reads the per-tenant-repo persisted state map. Missing file = empty map (bootstrap).
     *
     * Current per-repo persisted state shape:
     * ```
     * {
     *   lastIngestedRev    : '<sha>',
     *   lastRunAttemptAt   : <ms-epoch>,
     *   consecutiveFailures: <int>
     * }
     * ```
     *
     * Backward-compatible read: legacy persistence stored bare SHA strings under
     * `revisions[label]`. On read, string-shaped entries are auto-migrated to the
     * full object shape (lastIngestedRev = old-string; lastRunAttemptAt = 0;
     * consecutiveFailures = 0). Next write persists the new shape, completing the
     * migration in-place.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @returns {Promise<Object<String, {lastIngestedRev: String, lastRunAttemptAt: Number, consecutiveFailures: Number}>>}
     */
    async readPersistedRevisions({filePath}) {
        if (!await fs.pathExists(filePath)) {
            return {};
        }
        try {
            const data = await fs.readJson(filePath);
            if (!data || typeof data !== 'object' || !data.revisions) return {};

            const normalized = {};
            for (const [label, value] of Object.entries(data.revisions)) {
                if (typeof value === 'string') {
                    // Legacy shape: bare SHA string. Migrate to full state shape on read.
                    normalized[label] = {
                        lastIngestedRev    : value,
                        lastRunAttemptAt   : 0,
                        consecutiveFailures: 0
                    };
                } else if (value && typeof value === 'object') {
                    normalized[label] = {
                        lastIngestedRev    : value.lastIngestedRev || null,
                        lastRunAttemptAt   : Number.isFinite(value.lastRunAttemptAt) ? value.lastRunAttemptAt : 0,
                        consecutiveFailures: Number.isFinite(value.consecutiveFailures) ? value.consecutiveFailures : 0
                    };
                }
            }
            return normalized;
        } catch {
            return {};
        }
    }

    /**
     * Persists the per-tenant-repo lastIngestedRev map. Creates the parent
     * directory on first write so a fresh deployment doesn't need explicit dir
     * provisioning.
     *
     * Throws `TenantRepoSyncError(KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED)` on
     * write failure so the next cycle re-detects the same diff and retries
     * idempotently (per-repo failure isolation contract).
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Object<String, String>} options.revisions
     * @returns {Promise<void>}
     */
    async writePersistedRevisions({filePath, revisions}) {
        try {
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeJson(filePath, {revisions}, {spaces: 2});
        } catch (e) {
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
                `Failed to persist tenant-repo-sync revisions at ${filePath}: ${e.message}`,
                {filePath, phase: 'manifest-update'}
            );
        }
    }
}

export default Neo.setupClass(TenantRepoSyncService);
