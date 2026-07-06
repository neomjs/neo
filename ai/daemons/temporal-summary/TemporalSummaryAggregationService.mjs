// Class-only daemon implementation. Entry-point bootstrap (Neo + core/_export +
// InstanceManager) lives in `ai/daemons/temporal-summary/daemon.mjs`, following the
// canonical Orchestrator class+wrapper pattern. `Neo.setupClass(...)` at file bottom
// uses `globalThis.Neo`, populated by the entry-point bootstrap chain.
import Base                   from '../../../src/core/Base.mjs';
import logger                 from '../../mcp/server/memory-core/logger.mjs';
import {composeUnifiedRecord} from '../../services/memory-core/helpers/temporalSummaryAggregationEngine.mjs';
import {
    acquireHeavyMaintenanceLeaseSync,
    releaseHeavyMaintenanceLeaseSync
} from '../orchestrator/services/heavyMaintenanceLeasePrimitives.mjs';

/**
 * @summary The heavy-maintenance lease owner label for this lane — the backpressure invariant keys on it
 * so REM / defrag / this lane never run heavy maintenance concurrently.
 * @type {String}
 */
const LEASE_OWNER = 'temporal-summary-aggregation';

/**
 * @summary The temporal-pyramid L1/L2 durable aggregation daemon — the deterministic lane that writes the
 * durable session/daily temporal-summary records + their velocity fields.
 *
 * **Shape** — the canonical poll-loop daemon (the `KbGarbageCollectionService` precedent): a
 * `Neo.core.Base` singleton with `start()` / `stop()` / `scheduleNext()` / `pulse()`. The entry-point
 * wrapper `ai/daemons/temporal-summary/daemon.mjs` owns the Neo bootstrap + SIGTERM.
 *
 * **Backpressure** — every `pulse()` runs under the shared heavy-maintenance lease (the landed
 * cross-daemon fairness primitive): it acquires the lease, defers the whole pulse without work when
 * another heavy-maintenance task holds it, and always releases in `finally`. This is the non-negotiable
 * fairness contract — the lane must never starve the REM / defrag siblings.
 *
 * **Split** — the *pure* aggregation (velocity fold + record composition) lives in
 * `temporalSummaryAggregationEngine.mjs` and is unit-tested in isolation; this class owns only the I/O:
 * the poll loop, the lease, the window/source reads, and the Chroma + graph upsert. The read + upsert
 * seams (`collectPendingWindows` / `persistTemporalRecord`) are overridable so the lifecycle + lease
 * behavior test hermetically; their durable-store implementations land with the source-fetch increment.
 *
 * **Opt-in** — `start()` is a no-op unless called with `enabled: true`, and requires a positive
 * `pollIntervalMs` (the entry wrapper injects both from config; no hidden default).
 *
 * @class Neo.ai.daemons.TemporalSummaryAggregationService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/temporal-summary/daemon.mjs — the entry-point wrapper.
 * @see ai/services/memory-core/helpers/temporalSummaryAggregationEngine.mjs — the pure aggregation engine.
 * @see ai/daemons/kb-gc/KbGarbageCollectionService.mjs — the sibling poll-loop daemon precedent.
 */
class TemporalSummaryAggregationService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.TemporalSummaryAggregationService'
         * @protected
         */
        className: 'Neo.ai.daemons.TemporalSummaryAggregationService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Whether the poll loop is running. Plain singleton state; no reactive hooks.
         * @member {Boolean} isPolling=false
         * @protected
         */
        isPolling: false,
        /**
         * Active `setTimeout` handle for the next pulse; `null` when not scheduled.
         * @member {Object|null} pollHandle=null
         * @protected
         */
        pollHandle: null,
        /**
         * Interval between aggregation pulses in ms; injected by `start()` from config.
         * @member {Number|null} pollIntervalMs=null
         * @protected
         */
        pollIntervalMs: null
    }

    /**
     * @summary Starts the aggregation poll loop. Idempotent; a no-op while already polling and a no-op
     * when `enabled` is false (the daemon process then has nothing keeping the event loop alive).
     * @param {Object}   [options]
     * @param {Boolean}  [options.enabled=false]  Opt-in gate; injected from config by the entry wrapper.
     * @param {Number}   [options.pollIntervalMs]  Interval between pulses; required + positive when enabled.
     * @returns {void}
     */
    start({enabled = false, pollIntervalMs} = {}) {
        if (this.isPolling) {
            logger.debug('[TemporalSummaryAggregationService] Already polling; start() is a no-op.');
            return
        }

        if (!enabled) {
            logger.info('[TemporalSummaryAggregationService] Disabled (enabled=false); not starting.');
            return
        }

        if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
            throw new Error('[TemporalSummaryAggregationService] start() requires a positive pollIntervalMs when enabled.')
        }

        this.pollIntervalMs = pollIntervalMs;
        this.isPolling      = true;

        logger.info(`[TemporalSummaryAggregationService] Starting temporal-pyramid aggregation (interval: ${pollIntervalMs}ms).`);

        this.scheduleNext()
    }

    /**
     * @summary Stops the poll loop. Idempotent. Cancels any pending pulse so a clean SIGTERM does not
     * leave a timer wedging the event loop.
     * @returns {void}
     */
    stop() {
        if (this.pollHandle) {
            clearTimeout(this.pollHandle);
            this.pollHandle = null
        }

        this.isPolling = false;
        logger.info('[TemporalSummaryAggregationService] Aggregation stopped.')
    }

    /**
     * @summary Schedules the next pulse. Called after each pulse settles so a single thrown error never
     * breaks the loop.
     * @returns {void}
     * @protected
     */
    scheduleNext() {
        if (!this.isPolling) return;

        this.pollHandle = setTimeout(() => this.pulse().catch(err => {
            logger.error('[TemporalSummaryAggregationService] Pulse threw uncaught error:', err);
            this.scheduleNext()
        }), this.pollIntervalMs)
    }

    /**
     * @summary Executes one aggregation pulse under the shared heavy-maintenance lease. Acquires the
     * lease; if another heavy-maintenance task holds it, defers the whole pulse (no work) and reschedules;
     * otherwise runs the bounded cycle and always releases the lease in `finally`.
     * @returns {Promise<void>}
     * @protected
     */
    async pulse() {
        const lease = this.acquireLease();

        if (!lease.acquired) {
            logger.info(`[TemporalSummaryAggregationService] Heavy-maintenance lease held by ${lease.lease?.owner ?? 'another task'}; deferring this pulse.`);
            this.scheduleNext();
            return
        }

        try {
            await this.runCycle()
        } catch (err) {
            logger.error('[TemporalSummaryAggregationService] Aggregation cycle failed:', err)
        } finally {
            this.releaseLease(lease.lease?.token);
            this.scheduleNext()
        }
    }

    /**
     * @summary One bounded aggregation cycle: read the pending windows (most-recent-first, bounded), fold
     * + compose the unified-track record for each, and persist it. Per-agent partition records are added
     * once their non-attributable-field semantics are pinned.
     * @returns {Promise<void>}
     * @protected
     */
    async runCycle() {
        const windows = await this.collectPendingWindows();

        for (const window of windows) {
            await this.persistTemporalRecord(composeUnifiedRecord(window))
        }
    }

    /**
     * @summary Acquires the shared heavy-maintenance lease for this lane. Overridable seam (tests inject a
     * deterministic acquire result without touching the on-disk lease file).
     * @returns {{acquired:Boolean, lease:Object}}
     * @protected
     */
    acquireLease() {
        return acquireHeavyMaintenanceLeaseSync({owner: LEASE_OWNER, reason: 'temporal-pyramid-l1-l2'})
    }

    /**
     * @summary Releases the heavy-maintenance lease held by this lane. Overridable seam. A missing token
     * (a deferred pulse never acquired) is a no-op.
     * @param {String} [token] The acquired lease token.
     * @returns {void}
     * @protected
     */
    releaseLease(token) {
        if (token) {
            releaseHeavyMaintenanceLeaseSync({token})
        }
    }

    /**
     * @summary Reads the most-recent-first, bounded batch of windows still needing aggregation, each with
     * its fetched source rows (the {@link composeUnifiedRecord} input shape). The durable-store
     * implementation (the six source fetches + the persisted-version diff) lands with the source-fetch
     * increment; the default no-op keeps the loop inert until it does.
     * @returns {Promise<Array<Object>>}
     * @protected
     */
    async collectPendingWindows() {
        return []
    }

    /**
     * @summary Persists one composed temporal-summary record to the durable store — the Chroma upsert into
     * the `temporal-summary` collection plus the `SUMMARY_*` graph label written by this lane only. The
     * durable-store implementation lands with the source-fetch increment.
     * @param {{id:String, metadata:Object, velocityFields:Object}} record
     * @returns {Promise<void>}
     * @protected
     */
    async persistTemporalRecord(record) {
        logger.debug(`[TemporalSummaryAggregationService] (stub) would persist ${record?.id}`)
    }
}

export default Neo.setupClass(TemporalSummaryAggregationService);
