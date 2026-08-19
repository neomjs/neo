// Class-only daemon implementation. Entry-point bootstrap (Neo + core/_export +
// InstanceManager) lives in `ai/daemons/kb-reconciliation/daemon.mjs`, following the
// canonical Orchestrator class+wrapper pattern. `Neo.setupClass(KbReconciliationService)`
// at file bottom uses `globalThis.Neo`, populated by the entry-point bootstrap chain.
import Base              from '../../../src/core/Base.mjs';
import aiConfig          from '../../mcp/server/memory-core/config.mjs';
import ChromaManager     from '../../services/knowledge-base/ChromaManager.mjs';
import KBRecorderService from '../../services/knowledge-base/KBRecorderService.mjs';
import IngestionService  from '../../services/knowledge-base/IngestionService.mjs';
import logger            from '../../mcp/server/knowledge-base/logger.mjs';
import {
    diffTenantChunks,
    diffTenantManifest,
    formatReconciliationDetail,
    resolveOrphanVersionGap
} from '../../services/knowledge-base/helpers/kbReconciliationEngine.mjs';

/**
 * @summary Chroma `collection.get` page size for the batched per-tenant rows fetch.
 * @type {Number}
 */
const ROWS_PAGE_SIZE = 2000;

/**
 * @summary KB reconciliation daemon — config-invalidation drift detection.
 *
 * Provides the config-drift leg of KB operability: when a tenant mutates its
 * `KnowledgeBaseTenantConfig`, `getTenantConfig().version` increments and every chunk
 * ingested under the prior config is now *config-stale* via its `tenantConfigVersion`
 * metadata. This daemon periodically diffs each tenant's persisted Chroma chunks against
 * the tenant's current config version, emits reconciliation telemetry, and — opt-in —
 * tombstones the chunks left stale by a config change.
 *
 * **Shape** — the canonical poll-loop daemon (the `SwarmHeartbeatService` / `KbAlertingService`
 * precedent): a `Neo.core.Base` singleton with `start()` / `stop()` / `scheduleNext()` /
 * `pulse()`. The entry-point wrapper `ai/daemons/kb-reconciliation/daemon.mjs` owns the Neo
 * bootstrap + SIGTERM.
 *
 * **Split** — the *pure* classification (config-stale detection, version-gap partition,
 * telemetry-detail shaping) lives in `kbReconciliationEngine.mjs` and is unit-tested in
 * isolation; this class owns only the I/O: the poll loop, tenant enumeration, the Chroma
 * read, telemetry emission, and the opt-in delete.
 *
 * **Opt-in** — `start()` is a no-op unless `aiConfig.knowledgeBase.reconciliationEnabled` is
 * true, so a default deployment never runs the daemon. The destructive auto-tombstone is a
 * *second* opt-in (`reconciliationAutoTombstone`, default false): with it off, the daemon
 * detects + emits telemetry only and issues no `collection.delete`.
 *
 * **Manifest reconciliation** — ingestion persists claimed path manifests in
 * `kb-manifest:<tenantId>`. This daemon reads those manifests and runs a second pure diff
 * pass so force-push, partial-push, or hook-failure leftovers become manifest orphans.
 * Config-stale and manifest-orphan actionable ids are unioned before the opt-in tombstone
 * call.
 *
 * @class Neo.ai.daemons.KbReconciliationService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/kb-reconciliation/daemon.mjs — the entry-point wrapper.
 * @see ai/services/knowledge-base/helpers/kbReconciliationEngine.mjs — the pure diff engine.
 * @see ai/daemons/kb-alerting/KbAlertingService.mjs — the sibling poll-loop daemon precedent.
 */
class KbReconciliationService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.KbReconciliationService'
         * @protected
         */
        className: 'Neo.ai.daemons.KbReconciliationService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Whether the poll loop is running.
         * Plain singleton state; no reactive hooks are attached.
         * @member {Boolean} isPolling=false
         * @protected
         */
        isPolling: false,
        /**
         * Active `setTimeout` handle for the next pulse; `null` when not scheduled.
         * Plain singleton state; no reactive hooks are attached.
         * @member {Object|null} pollHandle=null
         * @protected
         */
        pollHandle: null,
        /**
         * Interval between reconciliation pulses in milliseconds.
         * Populated from `aiConfig.knowledgeBase.reconciliationIntervalMs` when the daemon starts.
         * Plain singleton state; no reactive hooks are attached.
         * @member {Number|null} pollIntervalMs=null
         * @protected
         */
        pollIntervalMs: null
    }

    /**
     * @summary Starts the reconciliation poll loop. Idempotent; a no-op while already polling.
     *
     * Exits early (without scheduling) when `aiConfig.knowledgeBase.reconciliationEnabled` is
     * false — the daemon process then has nothing keeping the event loop alive and exits.
     *
     * @param {Object}  [options]
     * @param {Number} [options.pollIntervalMs] Override the configured poll interval.
     * @returns {Promise<void>}
     */
    async start({pollIntervalMs} = {}) {
        if (this.isPolling) {
            logger.debug('[KbReconciliationService] Already polling; start() is a no-op.');
            return;
        }

        const kbConfig = this.getKbConfig();

        if (!kbConfig.reconciliationEnabled) {
            logger.info('[KbReconciliationService] Reconciliation disabled (aiConfig.knowledgeBase.reconciliationEnabled=false); not starting.');
            return;
        }

        this.pollIntervalMs = pollIntervalMs ?? kbConfig.reconciliationIntervalMs;

        await KBRecorderService.ready();

        this.isPolling = true;
        logger.info(`[KbReconciliationService] Starting KB reconciliation (interval: ${this.pollIntervalMs}ms)`);

        this.scheduleNext()
    }

    /**
     * @summary Stops the poll loop. Idempotent. Cancels any pending pulse so a clean
     * SIGTERM under launchd/systemd does not leave a timer wedging the event loop.
     * @returns {void}
     */
    stop() {
        if (this.pollHandle) {
            clearTimeout(this.pollHandle);
            this.pollHandle = null
        }
        this.isPolling = false;
        logger.info('[KbReconciliationService] Reconciliation stopped.')
    }

    /**
     * @summary Schedules the next pulse. Called after each pulse settles so a single
     * thrown error never breaks the loop.
     * @returns {void}
     * @protected
     */
    scheduleNext() {
        if (!this.isPolling) return;

        this.pollHandle = setTimeout(() => this.pulse().catch(err => {
            logger.error('[KbReconciliationService] Pulse threw uncaught error:', err);
            this.scheduleNext()
        }), this.pollIntervalMs)
    }

    /**
     * @summary Executes one reconciliation pulse: enumerate tenants → per-tenant diff →
     * telemetry → opt-in tombstone.
     *
     * Wrapped in try/catch/finally so a failed cycle is logged and `scheduleNext()` still
     * fires — one bad cycle must not stop the daemon. Per-tenant work is additionally
     * guarded inside {@link reconcileTenant} so one tenant's failure never aborts the rest.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async pulse() {
        try {
            const kbConfig         = this.getKbConfig(),
                  autoTombstone    = kbConfig.reconciliationAutoTombstone === true,
                  orphanVersionGap = resolveOrphanVersionGap(kbConfig.reconciliationOrphanVersionGap),
                  tenants          = await this.fetchTenants();

            if (tenants.length === 0) {
                return // no tenants have ingestion telemetry yet → nothing to reconcile
            }

            const collection = await this.getCollection();

            for (const tenant of tenants) {
                await this.reconcileTenant({...tenant, collection, orphanVersionGap, autoTombstone})
            }

            logger.debug(`[KbReconciliationService] Pulse complete — ${tenants.length} tenant(s) reconciled (autoTombstone=${autoTombstone})`)
        } catch (err) {
            // A single-cycle failure must not stop the daemon — log and let `finally`
            // reschedule. Catching here also keeps `pulse()` from rejecting, so the loop
            // never double-schedules (the `finally` + `scheduleNext`'s own `.catch`).
            logger.error('[KbReconciliationService] Pulse failed:', err)
        } finally {
            this.scheduleNext()
        }
    }

    /**
     * @summary Reconciles one tenant: config-version diff + manifest diff → telemetry → opt-in tombstone.
     *
     * Never throws — a per-tenant failure (a config read, a Chroma error) is logged and the
     * remaining tenants still reconcile. A clean tenant (zero config-stale chunks) emits no
     * telemetry, so a `reconcile` event genuinely means drift was found.
     *
     * @param {Object}  params
     * @param {String}  params.tenantId
     * @param {String}  params.repoSlug          Representative repo slug for the telemetry row.
     * @param {Object}  params.collection        The Chroma `knowledge-base` collection.
     * @param {Number}  params.orphanVersionGap  Resolved actionable version-gap threshold.
     * @param {Boolean} params.autoTombstone     Whether the opt-in delete path is enabled.
     * @returns {Promise<void>}
     * @protected
     */
    async reconcileTenant({tenantId, repoSlug, collection, orphanVersionGap, autoTombstone}) {
        try {
            const currentVersion  = await this.fetchTenantConfigVersion(tenantId),
                  rows            = await this.fetchTenantRows(collection, tenantId),
                  manifestsByRepo = await this.fetchTenantManifests(tenantId),
                  configDiff      = diffTenantChunks({rows, currentVersion, orphanVersionGap}),
                  manifestDiff    = diffTenantManifest({rows, manifestsByRepo}),
                  diff            = this.combineDiffs({configDiff, manifestDiff});

            if (diff.totalOrphanCount === 0) {
                return // clean tenant — emit nothing
            }

            let tombstonedCount = 0;

            if (autoTombstone && diff.actionableCount > 0) {
                tombstonedCount = await this.tombstoneOrphans(collection, diff.actionableIds)
            }

            this.recordReconcileMetric({tenantId, repoSlug, diff, currentVersion, autoTombstone, tombstonedCount});

            logger.info(`[KbReconciliationService] tenant ${tenantId}: ${diff.staleCount} config-stale chunk(s), ${diff.manifestOrphanCount} manifest-orphan chunk(s), ${diff.actionableCount} actionable, ${tombstonedCount} tombstoned (autoTombstone=${autoTombstone})`)
        } catch (err) {
            logger.error(`[KbReconciliationService] Reconciliation failed for tenant ${tenantId}: ${err.message}`)
        }
    }

    /**
     * @summary Test-stubbable seam over `aiConfig.knowledgeBase`.
     *
     * Reads the resolved AiConfig Provider subtree directly; missing subtree shape must fail
     * loud instead of being converted into a disabled reconciliation daemon.
     *
     * @returns {Object}
     * @protected
     */
    getKbConfig() {
        return aiConfig.knowledgeBase
    }

    /**
     * @summary Test-stubbable seam — enumerates the tenants to reconcile.
     *
     * The substrate-real tenant list is the distinct `tenantId` set of
     * `KBRecorderService.getTenantIngestionRollup()` (all-time) — every tenant that has ever
     * ingested. Deduped to one entry per tenant; the first-seen `repoSlug` is kept as the
     * representative slug for that tenant's `reconcile` telemetry row.
     *
     * @returns {Promise<Array<{tenantId: String, repoSlug: String}>>}
     * @protected
     */
    async fetchTenants() {
        const rollup = KBRecorderService.getTenantIngestionRollup() || [],
              seen   = new Map();

        for (const row of rollup) {
            if (row?.tenantId && !seen.has(row.tenantId)) {
                seen.set(row.tenantId, row.repoSlug || 'neo')
            }
        }

        return [...seen].map(([tenantId, repoSlug]) => ({tenantId, repoSlug}))
    }

    /**
     * @summary Test-stubbable seam over `ChromaManager.getKnowledgeBaseCollection`.
     * @returns {Promise<Object>} The Chroma `knowledge-base` collection.
     * @protected
     */
    async getCollection() {
        return ChromaManager.getKnowledgeBaseCollection()
    }

    /**
     * @summary Test-stubbable seam — resolves a tenant's current config version.
     * @param {String} tenantId
     * @returns {Promise<Number>} `getTenantConfig().version`, or `0` on the yaml/default tier.
     * @protected
     */
    async fetchTenantConfigVersion(tenantId) {
        const config = await IngestionService.getTenantConfig({tenantId});

        return config?.version ?? 0
    }

    /**
     * @summary Test-stubbable seam — reads the persisted claimed-state manifests for a tenant.
     * @param {String} tenantId
     * @returns {Promise<Object<String, {pathsAfterPush: Array<String>, updatedAt: Number}>>}
     * @protected
     */
    async fetchTenantManifests(tenantId) {
        return IngestionService.getTenantManifests({tenantId})
    }

    /**
     * @summary Combines config-stale and manifest-orphan diff axes into one delete/telemetry contract.
     * @param {Object} params
     * @param {Object} params.configDiff Result from `diffTenantChunks`.
     * @param {Object} params.manifestDiff Result from `diffTenantManifest`.
     * @returns {{staleOrphans: Array, manifestOrphans: Array, staleCount: Number, manifestOrphanCount: Number, totalOrphanCount: Number, actionableIds: Array<String>, actionableCount: Number}}
     * @protected
     */
    combineDiffs({configDiff, manifestDiff} = {}) {
        const actionableIds = [...new Set([
            ...(configDiff?.actionableIds || []),
            ...(manifestDiff?.actionableIds || [])
        ])];
        const orphanIds = new Set([
            ...(configDiff?.staleOrphans || []).map(orphan => orphan.id),
            ...(manifestDiff?.manifestOrphans || []).map(orphan => orphan.id)
        ].filter(id => typeof id === 'string' && id.length > 0));

        return {
            staleOrphans       : configDiff?.staleOrphans || [],
            manifestOrphans    : manifestDiff?.manifestOrphans || [],
            staleCount         : configDiff?.staleCount || 0,
            manifestOrphanCount: manifestDiff?.orphanCount || 0,
            totalOrphanCount   : orphanIds.size,
            actionableIds,
            actionableCount    : actionableIds.length
        }
    }

    /**
     * @summary Test-stubbable seam — fetches all of a tenant's Chroma rows, batched.
     *
     * Mirrors the batched `collection.get({where: {tenantId}})` idiom of
     * `IngestionService.getTenantRows`; kept local rather than calling that
     * `@protected` method so reconciliation remains additive to ingestion internals.
     *
     * @param {Object} collection The Chroma `knowledge-base` collection.
     * @param {String} tenantId
     * @returns {Promise<Array<{id: String, metadata: Object}>>}
     * @protected
     */
    async fetchTenantRows(collection, tenantId) {
        const rows   = [];
        let   offset = 0,
              batch;

        do {
            batch = await collection.get({
                include: ['metadatas'],
                limit  : ROWS_PAGE_SIZE,
                offset,
                where  : {tenantId}
            });

            for (let i = 0; i < (batch.ids?.length || 0); i++) {
                rows.push({id: batch.ids[i], metadata: batch.metadatas?.[i] || {}})
            }

            offset += ROWS_PAGE_SIZE
        } while ((batch.ids?.length || 0) === ROWS_PAGE_SIZE);

        return rows
    }

    /**
     * @summary Test-stubbable seam — tombstones the actionable orphan ids from Chroma.
     * @param {Object}        collection The Chroma `knowledge-base` collection.
     * @param {Array<String>} ids        Tenant-scoped actionable orphan chunk ids.
     * @returns {Promise<Number>} Count of ids deleted.
     * @protected
     */
    async tombstoneOrphans(collection, ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return 0
        }

        await collection.delete({ids});

        return ids.length
    }

    /**
     * @summary Test-stubbable seam — emits one KB `reconcile` telemetry event.
     *
     * `recordIngestionMetric` is best-effort (it never throws into the caller); the
     * `reconcile` event type + the `chunksDeleted` / `reconcileEvents` rollup fields it
     * feeds are already first-class `KBRecorderService` / `KbAlertRuleEngine` surfaces, so
     * an operator can alert on reconciliation drift with no extra wiring.
     *
     * @param {Object}  params
     * @param {String}  params.tenantId
     * @param {String}  params.repoSlug
     * @param {Object}  params.diff             A combined config/manifest reconciliation diff.
     * @param {Number}  params.currentVersion
     * @param {Boolean} params.autoTombstone
     * @param {Number}  params.tombstonedCount
     * @returns {void}
     * @protected
     */
    recordReconcileMetric({tenantId, repoSlug, diff, currentVersion, autoTombstone, tombstonedCount}) {
        KBRecorderService.recordIngestionMetric?.({
            tenantId,
            repoSlug,
            eventType    : 'reconcile',
            chunksTotal  : diff.totalOrphanCount ?? diff.staleCount,
            chunksDeleted: tombstonedCount,
            detail       : formatReconciliationDetail({diff, currentVersion, autoTombstone, tombstonedCount})
        })
    }
}

export default Neo.setupClass(KbReconciliationService);

export {ROWS_PAGE_SIZE};
