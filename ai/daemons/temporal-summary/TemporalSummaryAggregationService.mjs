// Class-only daemon implementation. Entry-point bootstrap (Neo + core/_export +
// InstanceManager) lives in `ai/daemons/temporal-summary/daemon.mjs`, following the
// canonical Orchestrator class+wrapper pattern. `Neo.setupClass(...)` at file bottom
// uses `globalThis.Neo`, populated by the entry-point bootstrap chain.
import AiConfig                                from '../../config.mjs';
import Base                                    from '../../../src/core/Base.mjs';
import logger                                  from '../../mcp/server/memory-core/logger.mjs';
import {UNIFIED_PARTITION}                     from '../../graph/temporalSummarySchema.mjs';
import {Memory_StorageRouter as StorageRouter} from '../../services.mjs';
import {
    composeAgentRecord,
    composeUnifiedRecord,
    planDailyWindows,
    resolvePartitionKeys
} from '../../services/memory-core/helpers/temporalSummaryAggregationEngine.mjs';
import {
    acquireHeavyMaintenanceLeaseSync,
    releaseHeavyMaintenanceLeaseSync
} from '../orchestrator/services/heavyMaintenanceLeasePrimitives.mjs';
import {execSync} from 'node:child_process';

/**
 * @summary The heavy-maintenance lease owner label for this lane — the backpressure invariant keys on it
 * so REM / defrag / this lane never run heavy maintenance concurrently.
 * @type {String}
 */
const LEASE_OWNER = 'temporal-summary-aggregation';

/**
 * @summary Default trailing daily-window batch per pulse — the bounded, most-recent-first cap the lane
 * re-aggregates each cycle (recent days are re-folded as their sources settle; older days are frozen).
 * @type {Number}
 */
const DEFAULT_DAILY_WINDOW_COUNT = 7;

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
     * @summary One bounded aggregation cycle: read the pending windows (most-recent-first, bounded), then for
     * each window persist the unified-track record plus one record per agent seen in it. The unified track
     * carries the window facts; each per-agent track carries only what is attributable to that agent.
     * @returns {Promise<void>}
     * @protected
     */
    async runCycle() {
        const windows = await this.collectPendingWindows();

        for (const window of windows) {
            for (const partition of this.resolveWindowPartitions(window)) {
                await this.persistTemporalRecord(partition === UNIFIED_PARTITION
                    ? composeUnifiedRecord(window)
                    : composeAgentRecord({...window, partition}))
            }
        }
    }

    /**
     * @summary The partition tracks one window aggregates into: the unified track, plus one per distinct agent
     * observed in the window's session rows. A window whose session source is absent yields the unified track
     * alone — the lane writes no per-agent record it cannot attribute.
     * @param {Object} window
     * @param {Object} [window.sources={}] The window's fetched source rows.
     * @returns {String[]}
     * @protected
     */
    resolveWindowPartitions({sources = {}}) {
        return resolvePartitionKeys((sources.sessions || []).flatMap(session => session?.agentIdentities || []))
    }

    /**
     * @summary Acquires the shared heavy-maintenance lease for this lane. The stale TTL is read from the
     * config SSOT at the use site — the lease primitive is Neo-free and carries no TTL default by design, so
     * omitting it makes the primitive throw at the production boundary. Overridable seam (tests inject a
     * deterministic acquire result without touching the on-disk lease file).
     * @returns {{acquired:Boolean, lease:Object}}
     * @protected
     */
    acquireLease() {
        return acquireHeavyMaintenanceLeaseSync({
            owner       : LEASE_OWNER,
            reason      : 'temporal-pyramid-l1-l2',
            staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs
        })
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
        const
            anchor   = this.resolveAggregationAnchor(),
            dayCount = this.dailyWindowCount(),
            plan     = planDailyWindows({anchor, dayCount});

        return Promise.all(plan.map(async window => ({
            level      : 'daily',
            windowStart: window.windowStart,
            windowEnd  : window.windowEnd,
            sources    : await this.fetchWindowSources(window)
        })))
    }

    /**
     * @summary The instant the daily-window plan anchors on (the most-recent target day). Overridable seam
     * so the window plan is deterministic under test.
     * @returns {String} ISO 8601 UTC.
     * @protected
     */
    resolveAggregationAnchor() {
        return new Date().toISOString()
    }

    /**
     * @summary The trailing daily-window batch size per pulse. Overridable seam.
     * @returns {Number}
     * @protected
     */
    dailyWindowCount() {
        return DEFAULT_DAILY_WINDOW_COUNT
    }

    /**
     * @summary Fetches one window's source rows (the `deriveVelocityFields` shape) from the six named
     * substrates — merged PRs, dev commits, sessions, high-impact sessions, decision records, graduations.
     * The per-substrate reads (`gh` / `git` / Memory Core) land next; the default empty map keeps the lane
     * honest (it persists true zero-count records) until they do.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Object>}
     * @protected
     */
    async fetchWindowSources(window) {
        return {
            devCommits        : await this.fetchDevCommits(window),
            adrsLanded        : await this.fetchAdrsLanded(window),
            sandboxesGraduated: await this.fetchSandboxesGraduated(window),
            sessions          : await this.fetchSessions(window)
        }
    }

    /**
     * @summary Binds `sessionsPerAgent` + `highImpactSessions` to their named source — the Memory Core session
     * summaries, window-filtered on the numeric `timestamp` metadata (session last-activity in ms). The
     * half-open `[start, end)` bound is pushed into the store query, so this is a bounded window read, never a
     * full-history scan. A session is multi-agent: `participatingAgents` is the per-agent partition key list,
     * and the row keeps ALL of them so the engine can credit each participant while still counting the session
     * once toward `highImpactSessions`.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{sessionId:String, impact:Number, agentIdentities:String[]}>>}
     * @protected
     */
    async fetchSessions({windowStart, windowEnd}) {
        const
            collection = await StorageRouter.getSummaryCollection(),
            result     = await collection.get({
                where: {$and: [
                    {timestamp: {$gte: Date.parse(windowStart)}},
                    {timestamp: {$lt : Date.parse(windowEnd)}}
                ]}
            });

        return (result?.metadatas || []).map(metadata => ({
            sessionId      : metadata.sessionId,
            impact         : Number(metadata.impact) || 0,
            agentIdentities: String(metadata.participatingAgents || '').split(',').map(entry => entry.trim()).filter(Boolean)
        }))
    }

    /**
     * @summary Binds `adrsLanded` to its named source — the ADR decision records added to
     * `learn/agentos/decisions/` within the window (the AdrIngestor's file source), via the git add-log.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{path:String}>>}
     * @protected
     */
    async fetchAdrsLanded({windowStart, windowEnd}) {
        const raw = this.execCommand(`git log --first-parent origin/dev --since="${windowStart}" --until="${windowEnd}" --diff-filter=A --name-only --format= -- learn/agentos/decisions/`);

        return [...new Set((raw || '').split('\n').filter(line => /^learn\/agentos\/decisions\/\d{4}-.+\.md$/.test(line)))].map(path => ({path}))
    }

    /**
     * @summary Binds `devCommits` to its named source — the `dev` first-parent commit log over the window.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{sha:String}>>}
     * @protected
     */
    async fetchDevCommits({windowStart, windowEnd}) {
        const raw = this.execCommand(`git log --first-parent origin/dev --since="${windowStart}" --until="${windowEnd}" --format=%H`);

        return (raw || '').split('\n').filter(Boolean).map(sha => ({sha}))
    }

    /**
     * @summary Binds `sandboxesGraduated` to its named source — closed Discussions carrying a graduation
     * marker, window-filtered by `closedAt`. Best-effort, bounded recency query (the same reader family the
     * handoff retrospective uses).
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{ref:String, headline:String, at:String}>>}
     * @protected
     */
    async fetchSandboxesGraduated({windowStart, windowEnd}) {
        const
            query   = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussions(first:50,states:CLOSED,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title closedAt comments(last:25){nodes{body}}}}}}',
            raw     = this.execCommand(`gh api graphql -f owner=neomjs -f name=neo -f query='${query}'`),
            nodes   = JSON.parse(raw || '{}')?.data?.repository?.discussions?.nodes || [],
            startMs = Date.parse(windowStart),
            endMs   = Date.parse(windowEnd),
            markers = ['[GRADUATED_TO_TICKET]', '[RESOLVED_TO_AC]'];

        return nodes
            .filter(node => node?.closedAt && Date.parse(node.closedAt) >= startMs && Date.parse(node.closedAt) < endMs)
            .filter(node => (node.comments?.nodes || []).some(comment => markers.some(marker => (comment?.body || '').includes(marker))))
            .map(node => ({ref: `discussion #${node.number}`, headline: node.title, at: node.closedAt}))
    }

    /**
     * @summary Runs a read-only shell command + returns stdout. The injectable seam behind every source
     * fetch, so tests drive the fetches with no `gh` / `git` process.
     * @param {String} command
     * @returns {String}
     * @protected
     */
    execCommand(command) {
        return execSync(command, {encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']})
    }

    /**
     * @summary Persists one composed temporal-summary record via the Chroma upsert into the
     * `temporal-summary` collection: the five-field metadata is the query contract, the velocity payload
     * is the document body, keyed by the deterministic doc id (so a re-aggregation of the same
     * window+track+version overwrites in place). The per-level `SUMMARY_*` graph label written by this lane
     * lands with the node-type-table update.
     * @param {{id:String, metadata:Object, velocityFields:Object}} record
     * @returns {Promise<void>}
     * @protected
     */
    async persistTemporalRecord(record) {
        const collection = await StorageRouter.getTemporalSummaryCollection();

        await collection.upsert({
            ids      : [record.id],
            documents: [JSON.stringify(record.velocityFields)],
            metadatas: [record.metadata]
        })
    }
}

export default Neo.setupClass(TemporalSummaryAggregationService);
