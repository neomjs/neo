// Class-only daemon implementation. Entry-point bootstrap (Neo + core/_export +
// InstanceManager) lives in `ai/daemons/kb-gc/daemon.mjs`, following the canonical
// Orchestrator class+wrapper pattern. `Neo.setupClass(KbGarbageCollectionService)`
// at file bottom uses `globalThis.Neo`, populated by the entry-point bootstrap chain.
import Base              from '../../../src/core/Base.mjs';
import aiConfig          from '../../mcp/server/memory-core/config.mjs';
import ChromaManager     from '../../services/knowledge-base/ChromaManager.mjs';
import KBRecorderService from '../../services/knowledge-base/KBRecorderService.mjs';
import logger            from '../../mcp/server/knowledge-base/logger.mjs';
import {
    formatGcDetail,
    selectExpiredChunks
} from '../../services/knowledge-base/helpers/kbGarbageCollectionEngine.mjs';

/**
 * @summary Chroma `collection.get` page size for the batched per-tenant rows fetch.
 * @type {Number}
 */
const ROWS_PAGE_SIZE = 2000;

/**
 * @summary KB garbage-collection daemon — retention-policy chunk expiry.
 *
 * Provides the retention leg of KB operability: a cloud KB accretes chunks indefinitely
 * unless a retention policy bounds them. This daemon periodically evaluates each tenant's
 * persisted Chroma chunks against an operator retention policy (time- and/or count-based,
 * keyed on the chunk `ingestedAt` metadata stamp), emits KB ingestion telemetry, and —
 * opt-in — deletes the retention-expired chunks; when a tick's cumulative deletion is large
 * it emits a `defrag-recommended` signal.
 *
 * **Shape** — the canonical poll-loop daemon (the `KbReconciliationService` / `KbAlertingService`
 * precedent): a `Neo.core.Base` singleton with `start()` / `stop()` / `scheduleNext()` /
 * `pulse()`. The entry-point wrapper `ai/daemons/kb-gc/daemon.mjs` owns the Neo bootstrap +
 * SIGTERM.
 *
 * **Split** — the *pure* retention classification lives in `kbGarbageCollectionEngine.mjs`
 * and is unit-tested in isolation; this class owns only the I/O: the poll loop, tenant
 * enumeration, the Chroma read, telemetry emission, and the opt-in delete.
 *
 * **Opt-in** — `start()` is a no-op unless `aiConfig.knowledgeBase.gcEnabled` is true. The
 * destructive delete is a *second* opt-in (`gcAutoDelete`, default false): with it off, the
 * daemon detects retention-expired chunks + emits telemetry only and issues no
 * `collection.delete`.
 *
 * **Scope boundary** — this daemon owns retention-policy chunk expiration plus
 * `defrag-recommended` telemetry. Config-orphan detection belongs to
 * `KbReconciliationService`; per-tenant retention overrides and automatic `ai:defrag-kb`
 * spawning are intentionally outside this daemon's current contract. The implementation is
 * additive and reuses the documented `where: {tenantId}` Chroma read idiom.
 *
 * @class Neo.ai.daemons.KbGarbageCollectionService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/kb-gc/daemon.mjs — the entry-point wrapper.
 * @see ai/services/knowledge-base/helpers/kbGarbageCollectionEngine.mjs — the pure retention engine.
 * @see ai/daemons/kb-reconciliation/KbReconciliationService.mjs — the sibling poll-loop daemon precedent.
 */
class KbGarbageCollectionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.KbGarbageCollectionService'
         * @protected
         */
        className: 'Neo.ai.daemons.KbGarbageCollectionService',
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
         * Interval between GC pulses in milliseconds.
         * Populated from `aiConfig.knowledgeBase.gcIntervalMs` when the daemon starts.
         * Plain singleton state; no reactive hooks are attached.
         * @member {Number|null} pollIntervalMs=null
         * @protected
         */
        pollIntervalMs: null
    }

    /**
     * @summary Starts the GC poll loop. Idempotent; a no-op while already polling.
     *
     * Exits early (without scheduling) when `aiConfig.knowledgeBase.gcEnabled` is false —
     * the daemon process then has nothing keeping the event loop alive and exits.
     *
     * @param {Object}  [options]
     * @param {Number} [options.pollIntervalMs] Override the configured poll interval.
     * @returns {Promise<void>}
     */
    async start({pollIntervalMs} = {}) {
        if (this.isPolling) {
            logger.debug('[KbGarbageCollectionService] Already polling; start() is a no-op.');
            return;
        }

        const kbConfig = this.getKbConfig();

        if (!kbConfig.gcEnabled) {
            logger.info('[KbGarbageCollectionService] GC disabled (aiConfig.knowledgeBase.gcEnabled=false); not starting.');
            return;
        }

        this.pollIntervalMs = pollIntervalMs ?? kbConfig.gcIntervalMs;

        await KBRecorderService.ready();

        this.isPolling = true;
        logger.info(`[KbGarbageCollectionService] Starting KB garbage collection (interval: ${this.pollIntervalMs}ms)`);

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
        logger.info('[KbGarbageCollectionService] Garbage collection stopped.')
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
            logger.error('[KbGarbageCollectionService] Pulse threw uncaught error:', err);
            this.scheduleNext()
        }), this.pollIntervalMs)
    }

    /**
     * @summary Executes one GC pulse: enumerate tenants → per-tenant retention diff →
     * opt-in delete → telemetry → `defrag-recommended` signal.
     *
     * Two-pass: the per-tenant pass collects each tenant's diff + delete count; the
     * `defrag-recommended` decision (a whole-collection fraction) is then computable, so the
     * telemetry pass can stamp it onto every tenant's `reconcile`-class detail. Wrapped in
     * try/catch/finally so a failed cycle is logged and `scheduleNext()` still fires.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async pulse() {
        try {
            const kbConfig   = this.getKbConfig(),
                  retention  = kbConfig.gcRetention,
                  autoDelete = kbConfig.gcAutoDelete === true,
                  defragGate = Number.isFinite(kbConfig.gcDefragThreshold) ? kbConfig.gcDefragThreshold : 0,
                  tenants    = await this.fetchTenants();

            if (tenants.length === 0) {
                return // no tenants have ingestion telemetry yet → nothing to collect
            }

            const collection      = await this.getCollection(),
                  collectionCount = await this.getCollectionCount(collection),
                  now             = Date.now(),
                  results         = [];

            for (const tenant of tenants) {
                const result = await this.collectTenant({...tenant, collection, retention, autoDelete, now});

                if (result) {
                    results.push(result)
                }
            }

            const totalDeleted      = results.reduce((sum, r) => sum + r.deletedCount, 0),
                  defragRecommended = defragGate > 0 && collectionCount > 0 &&
                                      totalDeleted / collectionCount > defragGate;

            for (const result of results) {
                if (result.diff.expiredCount > 0) {
                    this.recordGcMetric({...result, retention, autoDelete, defragRecommended})
                }
            }

            if (defragRecommended) {
                logger.warn(`[KbGarbageCollectionService] defrag-recommended — cumulative deletion ${totalDeleted}/${collectionCount} exceeded gcDefragThreshold ${defragGate}; an operator should run \`npm run ai:defrag-kb\``)
            }

            logger.debug(`[KbGarbageCollectionService] Pulse complete — ${tenants.length} tenant(s), ${totalDeleted} chunk(s) deleted (autoDelete=${autoDelete})`)
        } catch (err) {
            // A single-cycle failure must not stop the daemon — log and let `finally`
            // reschedule. Catching here also keeps `pulse()` from rejecting, so the loop
            // never double-schedules (the `finally` + `scheduleNext`'s own `.catch`).
            logger.error('[KbGarbageCollectionService] Pulse failed:', err)
        } finally {
            this.scheduleNext()
        }
    }

    /**
     * @summary Garbage-collects one tenant: retention diff → opt-in delete. Returns the
     * per-tenant result for the caller's telemetry + defrag-fraction passes; telemetry is
     * emitted by {@link pulse}, not here, because `defragRecommended` is a post-loop fact.
     *
     * Never throws — a per-tenant failure (a Chroma error) is logged and `null` is returned
     * so the remaining tenants still collect.
     *
     * @param {Object}  params
     * @param {String}  params.tenantId
     * @param {String}  params.repoSlug   Representative repo slug for the telemetry row.
     * @param {Object}  params.collection The Chroma `knowledge-base` collection.
     * @param {*}       params.retention  The operator `gcRetention` policy.
     * @param {Boolean} params.autoDelete Whether the opt-in delete path is enabled.
     * @param {Number}  params.now        Pulse-wide epoch ms (one clock read per tick).
     * @returns {Promise<{tenantId: String, repoSlug: String, diff: Object, deletedCount: Number}|null>}
     * @protected
     */
    async collectTenant({tenantId, repoSlug, collection, retention, autoDelete, now}) {
        try {
            const rows = await this.fetchTenantRows(collection, tenantId),
                  diff = selectExpiredChunks({rows, retention, now});

            let deletedCount = 0;

            if (diff.expiredCount > 0 && autoDelete) {
                deletedCount = await this.deleteChunks(collection, diff.expiredIds)
            }

            if (diff.expiredCount > 0) {
                logger.info(`[KbGarbageCollectionService] tenant ${tenantId}: ${diff.expiredCount} retention-expired chunk(s) of ${diff.evaluatedCount}, ${deletedCount} deleted (autoDelete=${autoDelete})`)
            }

            return {tenantId, repoSlug, diff, deletedCount}
        } catch (err) {
            logger.error(`[KbGarbageCollectionService] GC failed for tenant ${tenantId}: ${err.message}`);
            return null
        }
    }

    /**
     * @summary Test-stubbable seam over `aiConfig.knowledgeBase`.
     *
     * Reads the resolved AiConfig Provider subtree directly; missing subtree shape must fail
     * loud instead of being converted into a disabled garbage-collection daemon.
     *
     * @returns {Object}
     * @protected
     */
    getKbConfig() {
        return aiConfig.knowledgeBase
    }

    /**
     * @summary Test-stubbable seam — enumerates the tenants to garbage-collect.
     *
     * The substrate-real tenant list is the distinct `tenantId` set of
     * `KBRecorderService.getTenantIngestionRollup()` (all-time) — every tenant that has ever
     * ingested. Deduped to one entry per tenant; the first-seen `repoSlug` is the
     * representative slug for that tenant's telemetry row.
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
     * @summary Test-stubbable seam — the collection's total chunk count (the
     * `defrag-recommended` fraction denominator).
     * @param {Object} collection The Chroma `knowledge-base` collection.
     * @returns {Promise<Number>}
     * @protected
     */
    async getCollectionCount(collection) {
        return (await collection.count?.()) || 0
    }

    /**
     * @summary Test-stubbable seam — fetches all of a tenant's Chroma rows, batched.
     *
     * Mirrors the batched `collection.get({where: {tenantId}})` idiom of
     * `KnowledgeBaseIngestionService.getTenantRows`; kept local rather than calling that
     * `@protected` method so garbage collection remains additive to ingestion internals.
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
     * @summary Test-stubbable seam — deletes the retention-expired chunk ids from Chroma.
     * @param {Object}        collection The Chroma `knowledge-base` collection.
     * @param {Array<String>} ids        Tenant-scoped retention-expired chunk ids.
     * @returns {Promise<Number>} Count of ids deleted.
     * @protected
     */
    async deleteChunks(collection, ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return 0
        }

        await collection.delete({ids});

        return ids.length
    }

    /**
     * @summary Test-stubbable seam — emits one KB `tombstone` telemetry event.
     *
     * `recordIngestionMetric` is best-effort (never throws into the caller). A GC delete is
     * a `'tombstone'`-class event — the telemetry taxonomy has no dedicated `'gc'` type, so
     * `'tombstone'` (a logical deletion) is the honest fit; the rolled-up `tombstoneEvents` /
     * `chunksDeleted` fields are already `KbAlertRuleEngine.KNOWN_METRICS` surfaces.
     *
     * @param {Object}  params
     * @param {String}  params.tenantId
     * @param {String}  params.repoSlug
     * @param {Object}  params.diff              A {@link selectExpiredChunks} result.
     * @param {Number}  params.deletedCount
     * @param {*}       params.retention
     * @param {Boolean} params.autoDelete
     * @param {Boolean} params.defragRecommended
     * @returns {void}
     * @protected
     */
    recordGcMetric({tenantId, repoSlug, diff, deletedCount, retention, autoDelete, defragRecommended}) {
        KBRecorderService.recordIngestionMetric?.({
            tenantId,
            repoSlug,
            eventType    : 'tombstone',
            chunksTotal  : diff.expiredCount,
            chunksDeleted: deletedCount,
            detail       : formatGcDetail({diff, retention, gcAutoDelete: autoDelete, deletedCount, defragRecommended})
        })
    }
}

export default Neo.setupClass(KbGarbageCollectionService);

export {ROWS_PAGE_SIZE};
