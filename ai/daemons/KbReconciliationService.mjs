// Class-only file (#11058-style split). Entry-point bootstrap (Neo + core/_export +
// InstanceManager) lives in `ai/scripts/kb-reconciliation-daemon.mjs` per the canonical
// Orchestrator class+wrapper pattern. `Neo.setupClass(KbReconciliationService)` at file
// bottom works via `globalThis.Neo`, populated by the entry-point bootstrap chain.
import Base                          from '../../src/core/Base.mjs';
import {Memory_Config as aiConfig}   from '../services.mjs';
import ChromaManager                 from '../services/knowledge-base/ChromaManager.mjs';
import KBRecorderService             from '../services/knowledge-base/KBRecorderService.mjs';
import KnowledgeBaseIngestionService from '../services/knowledge-base/KnowledgeBaseIngestionService.mjs';
import logger                        from '../mcp/server/knowledge-base/logger.mjs';
import {
    diffTenantChunks,
    diffTenantManifest,
    formatReconciliationDetail,
    resolveOrphanVersionGap
} from '../services/knowledge-base/helpers/KbReconciliationEngine.mjs';

/**
 * @summary Poll-interval fallback when `aiConfig.knowledgeBase.reconciliationIntervalMs` is unset.
 * @type {Number}
 */
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * @summary Chroma `collection.get` page size for the batched per-tenant rows fetch.
 * @type {Number}
 */
const ROWS_PAGE_SIZE = 2000;

/**
 * @summary Phase 4B KB reconciliation daemon — config-invalidation drift detection (#11640).
 *
 * Closes part of the Phase 4 operability loop: when a tenant mutates its
 * `KnowledgeBaseTenantConfig`, `getTenantConfig().version` increments and every chunk
 * ingested under the prior config is now *config-stale* (#11637 stamps each chunk's
 * `tenantConfigVersion`). This daemon periodically diffs each tenant's persisted Chroma
 * chunks against the tenant's current config version, emits Phase 4A reconciliation
 * telemetry, and — opt-in — tombstones the chunks left stale by a config change.
 *
 * **Shape** — the canonical poll-loop daemon (the `SwarmHeartbeatService` / `KbAlertingService`
 * precedent): a `Neo.core.Base` singleton with `start()` / `stop()` / `scheduleNext()` /
 * `pulse()`. The entry-point wrapper `ai/scripts/kb-reconciliation-daemon.mjs` owns the Neo
 * bootstrap + SIGTERM.
 *
 * **Split** — the *pure* classification (config-stale detection, version-gap partition,
 * telemetry-detail shaping) lives in `KbReconciliationEngine.mjs` and is unit-tested in
 * isolation; this class owns only the I/O: the poll loop, tenant enumeration, the Chroma
 * read, telemetry emission, and the opt-in delete.
 *
 * **Opt-in** — `start()` is a no-op unless `aiConfig.knowledgeBase.reconciliationEnabled` is
 * true, so a default deployment never runs the daemon. The destructive auto-tombstone is a
 * *second* opt-in (`reconciliationAutoTombstone`, default false): with it off, the daemon
 * detects + emits telemetry only and issues no `collection.delete`.
 *
 * **V1.x scope** (#11711): after V1 shipped the config-invalidation signal, ingestion now
 * persists claimed path manifests in `kb-manifest:<tenantId>`. This daemon reads those
 * manifests and runs a second pure diff pass so force-push / partial-push / hook-failure
 * leftovers become manifest orphans. Config-stale and manifest-orphan actionable ids are
 * unioned before the opt-in tombstone call.
 *
 * @class Neo.ai.daemons.KbReconciliationService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/scripts/kb-reconciliation-daemon.mjs — the entry-point wrapper.
 * @see ai/services/knowledge-base/helpers/KbReconciliationEngine.mjs — the pure diff engine.
 * @see ai/daemons/KbAlertingService.mjs — the sibling Phase 4D poll-loop daemon precedent (#11642).
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
         * @member {Boolean} isPolling_=false
         * @protected
         * @reactive
         */
        isPolling_: false,
        /**
         * Active `setTimeout` handle for the next pulse; `null` when not scheduled.
         * @member {Object|null} pollHandle_=null
         * @protected
         * @reactive
         */
        pollHandle_: null,
        /**
         * Interval between reconciliation pulses in milliseconds.
         * @member {Number} pollIntervalMs_=3600000
         * @protected
         * @reactive
         */
        pollIntervalMs_: DEFAULT_INTERVAL_MS
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

        this.pollIntervalMs = pollIntervalMs || kbConfig.reconciliationIntervalMs || DEFAULT_INTERVAL_MS;

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
     * Reads defensively: a stale gitignored `ai/config.mjs` deployment predating #11640 has
     * no `knowledgeBase` key (or lacks the reconciliation keys), so a naked
     * `aiConfig.knowledgeBase.reconciliationEnabled` would throw. Returns `{}` when absent.
     *
     * @returns {Object}
     * @protected
     */
    getKbConfig() {
        return aiConfig.knowledgeBase || {}
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
     * @summary Test-stubbable seam — resolves a tenant's current config version (#11637).
     * @param {String} tenantId
     * @returns {Promise<Number>} `getTenantConfig().version`, or `0` on the yaml/default tier.
     * @protected
     */
    async fetchTenantConfigVersion(tenantId) {
        const config = await KnowledgeBaseIngestionService.getTenantConfig({tenantId});

        return config?.version ?? 0
    }

    /**
     * @summary Test-stubbable seam — reads the persisted claimed-state manifests for a tenant (#11711).
     * @param {String} tenantId
     * @returns {Promise<Object<String, {pathsAfterPush: Array<String>}>>}
     * @protected
     */
    async fetchTenantManifests(tenantId) {
        return KnowledgeBaseIngestionService.getTenantManifests({tenantId})
    }

    /**
     * @summary Combines config-stale and manifest-orphan diff axes into one delete/telemetry contract (#11711).
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

        return {
            staleOrphans       : configDiff?.staleOrphans || [],
            manifestOrphans    : manifestDiff?.manifestOrphans || [],
            staleCount         : configDiff?.staleCount || 0,
            manifestOrphanCount: manifestDiff?.orphanCount || 0,
            totalOrphanCount   : (configDiff?.staleCount || 0) + (manifestDiff?.orphanCount || 0),
            actionableIds,
            actionableCount    : actionableIds.length
        }
    }

    /**
     * @summary Test-stubbable seam — fetches all of a tenant's Chroma rows, batched.
     *
     * Mirrors the batched `collection.get({where: {tenantId}})` idiom of
     * `KnowledgeBaseIngestionService.getTenantRows`; kept local (rather than calling that
     * `@protected` method) so V1 touches zero merged Phase 2 code — the #11640 Contract
     * Ledger's "purely additive" scope guarantee.
     *
     * @param {Object} collection The Chroma `knowledge-base` collection.
     * @param {String} tenantId
     * @returns {Promise<Array<{id: String, metadata: Object}>>}
     * @protected
     */
    async fetchTenantRows(collection, tenantId) {
        const rows = [];
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
     * @summary Test-stubbable seam — emits one Phase 4A `reconcile` telemetry event.
     *
     * `recordIngestionMetric` is best-effort (it never throws into the caller); the
     * `reconcile` event type + the `chunksDeleted` / `reconcileEvents` rollup fields it
     * feeds are already first-class `KBRecorderService` / `KbAlertRuleEngine` surfaces, so
     * an operator can alert on reconciliation drift via #11642 with no extra wiring.
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

export {DEFAULT_INTERVAL_MS, ROWS_PAGE_SIZE};
