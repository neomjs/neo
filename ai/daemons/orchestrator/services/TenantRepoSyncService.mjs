import fs from 'fs-extra';
import path from 'node:path';
import Base from '../../../../src/core/Base.mjs';
import {DEFAULT_DATA_DIR, TENANT_REPO_SYNC_TASK_NAME} from '../TaskDefinitions.mjs';
import GitMirror from '../../../services/knowledge-base/helpers/GitMirror.mjs';
import {buildIngestEnvelope} from '../../../services/knowledge-base/helpers/TenantRepoIngestEnvelopeBuilder.mjs';
import {normalizeTenantRepoConfig} from '../../../services/knowledge-base/helpers/TenantRepoAccessContract.mjs';

const PERSISTED_REVISIONS_FILE_NAME = 'tenant-repo-sync-revisions.json';

/**
 * @summary Cloud-deployable scheduler lane that pulls tenant repos into the deployment KB (#11790).
 *
 * Bridges the `tenant-repo-sync` Orchestrator periodic lane (registered via
 * `TaskDefinitions.mjs` `serviceTask: true`) to the per-repo refresh cycle:
 *
 * ```
 *   tenantRepos[] config (normalized via TenantRepoAccessContract / #11787)
 *     -> per-repo loop
 *          -> GitMirror.cloneIfMissing + GitMirror.fetch (#11788)
 *          -> buildIngestEnvelope({ tenantId, repoSlug, mirrorRoot, lastIngestedRev, ... }) (#11789)
 *          -> KnowledgeBaseIngestionService.ingestSourceFiles(envelope) (existing MVP push-substrate, viaMcp: false)
 *          -> persist lastIngestedRev for next cycle
 * ```
 *
 * The MVP push-based path (`ingest_source_files`, `npm run ai:kb-push-client`,
 * `npm run ai:ingest-tenant`) is unchanged. This lane is the additive PULL complement
 * per Epic #11731 + Discussion #11782 Option A. Local-only lanes (`primary-dev-sync`,
 * `kbSync`, `bridgeDaemon`) are unaffected — ADR 0014 §5.2 anti-pattern against
 * re-pointing `kbSync` at tenant content is preserved.
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
 * @see ai/services/knowledge-base/helpers/GitMirror.mjs
 * @see ai/services/knowledge-base/helpers/TenantRepoIngestEnvelopeBuilder.mjs
 * @see ai/services/knowledge-base/helpers/TenantRepoAccessContract.mjs
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
        singleton: true
    }

    /**
     * Runs the tenant-repo-sync task under orchestrator state + health envelopes.
     *
     * @param {Object} options
     * @param {String} [options.taskName=TENANT_REPO_SYNC_TASK_NAME]
     * @param {String} options.reason Scheduling reason (e.g. `'periodic-sweep:1800000'` or `'manual'`).
     * @param {Object} options.taskStateService Orchestrator task-state service.
     * @param {Object} [options.healthService] HealthService-compatible sink.
     * @param {Function} [options.writeLog] Orchestrator logger.
     * @param {Object} [options.tenantReposConfig] Pre-normalized tenantRepos config. If omitted, resolved from `aiConfig` via `normalizeTenantRepos`.
     * @param {Object} [options.aiConfig] AI config object (test seam). Defaults to live import.
     * @param {Object} [options.gitMirror=GitMirror] Injectable mirror primitive (test seam).
     * @param {Object} [options.knowledgeBaseIngestionService] KB ingestion service singleton (test seam). Resolved from `ai/services.mjs` if omitted.
     * @param {String[]} [options.onlyRepoSlugs] If provided, only sync repos whose `repoSlug` is in the list. Used by the manual CLI run path.
     * @param {String} [options.revisionsFilePath] Override the per-tenant-repo lastIngestedRev persistence file path (test seam). Defaults to `<DEFAULT_DATA_DIR>/tenant-repo-sync-revisions.json`.
     * @param {Function} [options.envelopeBuilder=buildIngestEnvelope] Injectable envelope-builder (test seam). Production callers omit; unit tests pass a fake that returns canned envelope shape.
     * @returns {Promise<Object>} `{status, details}` — status ∈ {`completed`, `failed`, `skipped`}.
     */
    async runTask({
        taskName = TENANT_REPO_SYNC_TASK_NAME,
        reason,
        taskStateService,
        healthService,
        writeLog,
        tenantReposConfig,
        aiConfig,
        gitMirror = GitMirror,
        knowledgeBaseIngestionService,
        onlyRepoSlugs,
        revisionsFilePath,
        envelopeBuilder = buildIngestEnvelope
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
                writeLog, tenantReposConfig, aiConfig, gitMirror, knowledgeBaseIngestionService, onlyRepoSlugs,
                taskStateService, healthService, taskName, revisionsFilePath, envelopeBuilder
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
            const details = {reason, phase: 'tenant-repo-sync', error: e.message};

            taskStateService.markFailed(taskName, null);
            writeLog?.('ERROR', `[TenantRepoSync] Failed: ${e.message}`);
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
        writeLog, tenantReposConfig, aiConfig, gitMirror, knowledgeBaseIngestionService, onlyRepoSlugs,
        taskStateService, healthService, taskName, revisionsFilePath, envelopeBuilder = buildIngestEnvelope
    }) {
        const resolvedConfig = tenantReposConfig || await this.resolveTenantReposConfig({aiConfig});
        const allRepos       = resolvedConfig.tenantRepos || [];
        const repos          = onlyRepoSlugs
            ? allRepos.filter(r => onlyRepoSlugs.includes(r.repoSlug))
            : allRepos;

        if (repos.length === 0) {
            const details = {reason: 'no-tenant-repos-configured', repoCount: 0};
            writeLog?.('INFO', `[TenantRepoSync] No tenantRepos configured; skipping.`);
            return {status: 'skipped', details};
        }

        const resolvedRevisionsPath = revisionsFilePath || this.defaultRevisionsFilePath();
        const ingestionService      = knowledgeBaseIngestionService || await this.resolveIngestionService();
        const persistedRevisions    = await this.readPersistedRevisions({filePath: resolvedRevisionsPath});
        const results            = [];
        let   completedCount     = 0;
        let   failedCount        = 0;

        for (const repo of repos) {
            const repoLabel = `${repo.tenantId}/${repo.repoSlug}`;
            try {
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
                    lastIngestedRev : persistedRevisions[repoLabel] || null,
                    rootKind        : repo.rootKind || 'external-source',
                    parserId        : repo.parserId,
                    parserVersion   : repo.parserVersion,
                    gitMirror
                });

                const ingestResult = await ingestionService.ingestSourceFiles({
                    ...envelope,
                    viaMcp: false // operator-bulk path per TenantIngestionModel.md
                });

                // Persist headRevision only on successful ingest. Bootstrap envelopes
                // omit baseRevision but always carry headRevision.
                if (envelope.headRevision) {
                    persistedRevisions[repoLabel] = envelope.headRevision;
                }

                results.push({repo: repoLabel, status: 'completed', ingested: ingestResult.ingested, deleted: ingestResult.deleted, headRevision: envelope.headRevision});
                completedCount++;
                healthService?.recordTaskOutcome?.(taskName, 'completed', {repo: repoLabel, ingested: ingestResult.ingested});
            } catch (e) {
                writeLog?.('ERROR', `[TenantRepoSync] ${repoLabel} failed: ${e.message}`);
                results.push({repo: repoLabel, status: 'failed', error: e.message, code: e.code});
                failedCount++;
                healthService?.recordTaskOutcome?.(taskName, 'failed', {repo: repoLabel, error: e.message, code: e.code});
                // Continue with remaining repos — failure isolation per ticket prescription.
            }
        }

        await this.writePersistedRevisions({filePath: resolvedRevisionsPath, revisions: persistedRevisions});

        const status = failedCount === 0 ? 'completed' : (completedCount > 0 ? 'completed' : 'failed');
        return {status, details: {repoCount: repos.length, completedCount, failedCount, results}};
    }

    /**
     * Resolves the tenantRepos config from `aiConfig` via `TenantRepoAccessContract.normalizeTenantRepos`.
     * Test seam: pass `aiConfig` argument to bypass live import.
     *
     * @param {Object} options
     * @param {Object} [options.aiConfig] Pre-resolved config object.
     * @returns {Promise<{tenantRepos: Array<Object>}>}
     */
    async resolveTenantReposConfig({aiConfig}) {
        const cfg = aiConfig || (await import('../../../mcp/server/knowledge-base/config.mjs')).default;
        return normalizeTenantRepoConfig({tenantRepos: cfg.tenantRepos || []});
    }

    /**
     * Resolves the live `KnowledgeBaseIngestionService` singleton.
     *
     * @returns {Promise<Object>}
     */
    async resolveIngestionService() {
        const services = await import('../../../services.mjs');
        return services.KB_KnowledgeBaseIngestionService || services.KnowledgeBaseIngestionService;
    }

    /**
     * Default per-tenant-repo lastIngestedRev persistence file path. Lives next to
     * the orchestrator state file (`<DEFAULT_DATA_DIR>/state.json` per `TaskDefinitions.mjs`)
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
     * Reads the per-tenant-repo lastIngestedRev map. Missing file = empty map (bootstrap).
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @returns {Promise<Object<String, String>>} `{ '<tenantId>/<repoSlug>': '<sha>' }`.
     */
    async readPersistedRevisions({filePath}) {
        if (!await fs.pathExists(filePath)) {
            return {};
        }
        try {
            const data = await fs.readJson(filePath);
            return (data && typeof data === 'object' && data.revisions) ? {...data.revisions} : {};
        } catch {
            return {};
        }
    }

    /**
     * Persists the per-tenant-repo lastIngestedRev map. Creates the parent
     * directory on first write so a fresh deployment doesn't need explicit dir
     * provisioning.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Object<String, String>} options.revisions
     * @returns {Promise<void>}
     */
    async writePersistedRevisions({filePath, revisions}) {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, {revisions}, {spaces: 2});
    }
}

export default Neo.setupClass(TenantRepoSyncService);
