import path                       from 'path';
import {fileURLToPath}            from 'url';
import aiConfig                   from '../../mcp/server/knowledge-base/config.mjs';
import Base                       from '../../../src/core/Base.mjs';
import ChromaManager              from './ChromaManager.mjs';
import DatabaseLifecycleService   from './DatabaseLifecycleService.mjs';
import {createBoundedRetryGate}   from '../shared/boundedRetryGate.mjs';
import {buildEmbeddingProbeBlock} from '../shared/embeddingProbe.mjs';
import {readDeployedRevision}     from '../shared/deployedRevision.mjs';
import logger                     from '../../mcp/server/knowledge-base/logger.mjs';
import RuntimeFreshnessService    from '../../mcp/server/shared/services/RuntimeFreshnessService.mjs';
import KBRecorderService          from './KBRecorderService.mjs';

// The embedding-probe policy is NOT frozen here. It was, with five literals byte-identical to
// Memory Core's leaf defaults, which made the same policy configurable on one side of the plane and
// unreachable on the other. Every value now resolves from `aiConfig.healthcheck` AT THE USE SITE so a
// deployment change takes effect on the next arm rather than at the next image build.
const
    serviceDir              = path.dirname(fileURLToPath(import.meta.url)),
    configPath              = path.resolve(serviceDir, '../../config.mjs'),
    openApiPath             = path.resolve(serviceDir, '../../mcp/server/knowledge-base/openapi.yaml'),
    runtimeFreshnessTracker = RuntimeFreshnessService.createTracker({
        files  : [{
            key       : 'configDigest',
            path      : configPath,
            errorLabel: 'config digest'
        }, {
            key       : 'openApiDigest',
            path      : openApiPath,
            errorLabel: 'OpenAPI digest'
        }],
        serviceName       : 'Knowledge Base MCP server',
        identityLabel     : 'config/schema identity',
        assertionFacts    : 'tool-schema/source facts',
        restartScope      : 'cached source, config, and tool definitions',
        statusFields      : ['configDigest', 'openApiDigest'],
        unavailableSummary: 'config digest and OpenAPI digest'
    });

/**
 * @summary Probes the same embedding path used by Knowledge Base query and ingest operations.
 *
 * The consumer-owned 30-second default is deliberately explicit: it is the slow-sample tolerance
 * boundary. Scheduling and retry backoff remain lifecycle-owned by `HealthService`.
 *
 * The default reads Knowledge Base's resolved embedding leaves at the use site. Tier-1 inheritance
 * keeps those leaves aligned with the configured provider while preserving this service's ownership
 * boundary and the reactive Provider SSOT.
 *
 * @param {Object}   [options]
 * @param {Object}   [options.cfg=aiConfig] Resolved Knowledge Base embedding provider configuration.
 * @param {Function} [options.embedText] Injectable embedding call.
 * @param {String}   [options.input='neo-kb-healthcheck-embedding-canary'] Probe text.
 * @param {Function} [options.now=Date.now] Injectable clock.
 * @param {Number}   [options.timeoutMs=30000] Consumer-owned provider deadline.
 * @returns {Promise<Object>} Health-safe embedding observation.
 */
export async function buildKnowledgeBaseEmbeddingProbeBlock({
    cfg       = aiConfig,
    embedText,
    input     = 'neo-kb-healthcheck-embedding-canary',
    now       = Date.now,
    timeoutMs = aiConfig.healthcheck.embeddingProbeTimeoutMs
} = {}) {
    const probe = embedText || (async (text, explicitProvider, options) => {
        const {default: TextEmbeddingService} = await import('../memory-core/TextEmbeddingService.mjs');
        return TextEmbeddingService.embedText(text, explicitProvider, options);
    });

    const attributedProbe = (text, explicitProvider, options) => probe(text, explicitProvider, {
        ...options,
        operationStage          : 'embedding-canary',
        providerActivityRecorder: KBRecorderService,
        service                 : 'knowledge-base'
    });

    return buildEmbeddingProbeBlock({
        cfg,
        embedText     : attributedProbe,
        input,
        now,
        operationLabel: 'Knowledge Base embedding probe',
        timeoutMs
    });
}

/**
 * @summary Monitors and validates the ChromaDB dependency for the Knowledge Base MCP server.
 *
 * Monitors and validates the ChromaDB dependency for the Knowledge Base MCP server.
 *
 * This service acts as a gatekeeper, ensuring that ChromaDB is properly running,
 * accessible, and contains the expected collection before any knowledge base operations proceed.
 *
 * Key responsibilities:
 * - Connectivity validation: Ensures ChromaDB is reachable via heartbeat
 * - Collection verification: Confirms the knowledge base collection exists
 * - Intelligent caching: Reduces overhead by caching health status for 5 minutes
 * - Graceful degradation: Provides clear, actionable error messages when dependencies are missing
 * - Recovery detection: Automatically detects when issues are resolved (e.g., after starting ChromaDB)
 *
 * The service is designed to be non-blocking at startup, allowing the server to run even
 * when ChromaDB is not available, while failing gracefully at the tool-call level with helpful
 * error messages to guide users toward resolution.
 *
 * @class Neo.ai.services.knowledge-base.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.HealthService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Cached result of the most recent health check.
     * Used to avoid redundant ChromaDB calls within the cache TTL window.
     * @member {Object|null} #cachedHealth
     * @private
     */
    #cachedHealth = null;

    /**
     * Timestamp (in milliseconds) of when the health check cache was last populated.
     * @member {number|null} #lastCheckTime
     * @private
     */
    #lastCheckTime = null;

    /**
     * Promise of the currently executing health check.
     * Used for request deduplication to prevent "thundering herd" of health checks.
     * @member {Promise<Object>|null} #healthCheckPromise
     * @private
     */
    #healthCheckPromise = null;

    /**
     * Lifecycle-owned embedding probe producer. Health reads only inspect its gate snapshot;
     * they never schedule or execute provider work.
     * @member {Object|null} #embeddingProbeProducer
     * @private
     */
    #embeddingProbeProducer = null;

    /**
     * Duration (in milliseconds) for which cached HEALTHY results remain valid.
     * Set to 5 minutes to balance freshness with performance.
     * Unhealthy results are never cached to allow immediate recovery detection.
     * @member {number} #cacheDuration
     * @private
     */
    #cacheDuration = 5 * 60 * 1000;

    /**
     * The status from the previous health check, used to detect state transitions
     * (e.g., recovery from 'unhealthy' to 'healthy') and log meaningful messages.
     * @member {string|null} #previousStatus
     * @private
     */
    #previousStatus = null;

    /**
     * Shared runtime freshness tracker.
     * @member {RuntimeFreshnessTracker} #runtimeFreshnessTracker
     * @private
     */
    #runtimeFreshnessTracker = runtimeFreshnessTracker;

    /**
     * Boot-time runtime identity captured before long-lived MCP clients can go stale.
     * @member {Object} bootRuntimeIdentity
     */
    get bootRuntimeIdentity() {
        return this.#runtimeFreshnessTracker.bootRuntimeIdentity;
    }

    set bootRuntimeIdentity(value) {
        this.#runtimeFreshnessTracker.bootRuntimeIdentity = value || {};
    }

    /**
     * Boot-time runtime identity read errors.
     * @member {String[]} bootRuntimeFreshnessErrors
     */
    get bootRuntimeFreshnessErrors() {
        return this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors;
    }

    set bootRuntimeFreshnessErrors(value) {
        this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors = Array.isArray(value) ? value : [];
    }

    /**
     * Optional unit-test seam for injecting boot/current runtime identity reads.
     * @member {Function|null} runtimeFreshnessReader
     */
    runtimeFreshnessReader = null;

    /**
     * ISO timestamp captured when this server module was loaded.
     * @member {String} runtimeStartedAt
     */
    get runtimeStartedAt() {
        return this.#runtimeFreshnessTracker.startedAt;
    }

    set runtimeStartedAt(value) {
        this.#runtimeFreshnessTracker.startedAt = value;
    }

    /**
     * Duration (in milliseconds) for which runtime freshness remains cached.
     * @member {Number} runtimeFreshnessCacheDuration
     */
    runtimeFreshnessCacheDuration = 30 * 1000;

    /**
     * Checks if ChromaDB is running and accessible.
     *
     * Intent: This is the most critical check. Without ChromaDB running, no knowledge base
     * operations are possible. We use the heartbeat endpoint to verify connectivity.
     *
     * @returns {Promise<Object>} {running: boolean, error?: string}
     * @private
     */
    async #checkChromaConnection() {
        try {
            await ChromaManager.client.heartbeat();
            return {running: true};
        } catch (e) {
            return {
                running: false,
                error  : `ChromaDB is not accessible at ${aiConfig.host}:${aiConfig.port}. Please start ChromaDB externally or update the configured host/port.`
            };
        }
    }

    /**
     * Counts the canonical KB collection, invalidating a stale resolved handle once
     * when Chroma reports the handle no longer points at a live collection.
     *
     * @returns {Promise<Object>} {name, exists, count, error?}
     * @private
     */
    async #checkKnowledgeBaseCollection() {
        const base = {
            name  : aiConfig.collectionName,
            exists: false,
            count : 0
        };

        let collection;

        try {
            collection = await ChromaManager.getKnowledgeBaseCollection();
        } catch (error) {
            return {
                ...base,
                error: error.message
            };
        }

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return {
                    ...base,
                    exists: true,
                    count : await collection.count()
                };
            } catch (error) {
                if (attempt > 0 || !ChromaManager.isCollectionNotFoundError(error)) {
                    return {
                        ...base,
                        error: error.message
                    };
                }

                ChromaManager.invalidateKnowledgeBaseCollectionCache();

                try {
                    collection = await ChromaManager.getKnowledgeBaseCollection();
                } catch (retryError) {
                    return {
                        ...base,
                        error: retryError.message
                    };
                }
            }
        }

        return base;
    }

    /**
     * Verifies that the required collections exist and are accessible.
     *
     * Intent: Even if ChromaDB is running, we need to ensure our specific collection
     * is properly initialized. This check confirms the knowledge base collection
     * is available for operations.
     *
     * @returns {Promise<Object>} {knowledgeBase: Object|null, error?: string}
     * @private
     */
    async #checkCollections() {
        try {
            const knowledgeBase = await this.#checkKnowledgeBaseCollection(),
                  result        = {knowledgeBase};

            if (knowledgeBase.error) {
                result.error = `Failed to access collections: ${knowledgeBase.error}`;
            }

            return result;
        } catch (e) {
            return {
                knowledgeBase: {
                    name  : aiConfig.collectionName,
                    exists: false,
                    count : 0,
                    error : e.message
                },
                error: `Failed to access collections: ${e.message}`
            };
        }
    }

    /**
     * @summary Projects the lifecycle producer's latest embedding observation onto health truth.
     *
     * A healthy vector is the only state that publishes `features.embedding: true`. A settled
     * failure degrades immediately, while no observation publishes `null` and fails closed. The
     * input payload is never mutated, which keeps cached-green database truth reusable while a
     * later producer failure changes the outward health verdict immediately.
     *
     * @param {Object} payload Database/corpus health payload under construction or from cache.
     * @returns {Object} Health payload carrying current embedding observation truth.
     * @private
     */
    #applyEmbeddingProbe(payload) {
        const probe = this.#getEmbeddingProbe();

        let details = (payload.details || [])
            .filter(detail => !detail.startsWith('Knowledge Base embedding probe'));
        let status = payload.status;

        const features = {...payload.features};

        if (probe.status === 'healthy') {
            features.embedding = true;

            // A slow-but-running loop is REPORTED without degrading. Returning `healthy` and dropping
            // the signal here would trade a false `stale` for silence, which is the other half of the
            // same defect: the reason this was mistaken for a dead loop is that nothing said "slow".
            if (probe.slow) {
                details = [
                    ...details.filter(detail => !detail.startsWith('Knowledge Base embedding probe')),
                    `Knowledge Base embedding probe slow: ${probe.slow}`
                ];
            }

            return {...payload, features, details};
        }

        features.embedding = ['failed', 'terminal', 'stale'].includes(probe.status) ? false : null;
        status             = status === 'unhealthy' ? 'unhealthy' : 'degraded';
        details            = details.filter(detail => detail !== 'All features are operational');

        if (probe.status === 'failed' || probe.status === 'terminal') {
            if (probe.stopReason) {
                details.push(`Knowledge Base embedding probe failed: ${probe.error} (${probe.stopReason}; deadline ${probe.timeoutMs}ms)`);
            } else if (probe.nextAttemptAt) {
                details.push(`Knowledge Base embedding probe failed: ${probe.error} — backing off ${probe.backoffMs}ms (streak ${probe.failureStreak}, deadline ${probe.timeoutMs}ms)`);
            } else {
                details.push(`Knowledge Base embedding probe failed: ${probe.error} (deadline ${probe.timeoutMs}ms)`);
            }
        } else if (probe.status === 'stale') {
            details.push(`Knowledge Base embedding probe ${probe.reason}`);
        } else {
            details.push(`Knowledge Base embedding probe ${probe.status}: ${probe.reason}`);
        }

        return {...payload, status, features, details};
    }

    /**
     * @summary Reads the embedding producer's current gate snapshot without causing provider work.
     *
     * A healthy observation becomes stale after three times the larger of cadence and healthy TTL;
     * intentional failure backoff is not staleness. Every settled non-healthy result follows the
     * bounded gate's single failure predicate and carries its retry receipt outward.
     *
     * @returns {Object} Current probe truth.
     * @private
     */
    #getEmbeddingProbe() {
        const producer = this.#embeddingProbeProducer;

        if (!producer) {
            return {
                status: 'unavailable',
                reason: `producer not started — no embedding observation exists (configured deadline ${aiConfig.healthcheck.embeddingProbeTimeoutMs}ms)`
            };
        }

        if (producer.disabled) {
            return {
                status: 'disabled',
                reason: `producer intentionally disabled — no embedding observation exists (deadline ${producer.timeoutMs}ms)`
            };
        }

        const snapshot = producer.gate.snapshot();

        if (snapshot.status === 'healthy') {
            const staleAfter = 3 * Math.max(producer.cadenceMs, producer.healthyTtlMs),
                  age        = producer.clock() - snapshot.cached.checkedAt;

            if (age > staleAfter) {
                // An ACTIVE flight is the loop running, so it cannot also be evidence the loop is
                // gone — and this guard aged the cache without ever asking. Slowness is reported as
                // slowness; a loop with NOTHING in flight still reports stale, because a dead loop is
                // a real condition and this must not become the way to hide it.
                // Bounded by the flight's own age: a flight that never settles would otherwise
                // suppress this guard forever, trading a false `stale` for a permanent false
                // `healthy`. Past its issued budget the attempt's own deadline failed to fire.
                const attempt    = producer.activeAttempt,
                      inFlightMs = attempt ? Math.max(0, producer.clock() - attempt.startedAt) : null;

                if (snapshot.inFlight && attempt && inFlightMs <= attempt.timeoutMs) {
                    return {
                        status: 'healthy',
                        slow  : `an attempt has been in flight ${Math.round(inFlightMs / 1000)}s (issued budget ${attempt.timeoutMs}ms, last healthy vector ${Math.round(age / 1000)}s old) — the loop is running SLOWLY, not stopped`
                    };
                }

                if (snapshot.inFlight) {
                    return {
                        status: 'stale',
                        reason: attempt
                            ? `has an attempt STUCK in flight ${Math.round(inFlightMs / 1000)}s, past the ${attempt.timeoutMs}ms budget it was ISSUED under — the deadline did not fire`
                            : 'has an active flight whose issued basis is unobservable — treating as stuck'
                    };
                }

                return {
                    status: 'stale',
                    reason: `is stale: last healthy vector is ${Math.round(age / 1000)}s old (cadence ${producer.cadenceMs}ms, deadline ${producer.timeoutMs}ms, no attempt in flight)`
                };
            }

            return {status: 'healthy'};
        }

        if (snapshot.cached) {
            return {
                status       : snapshot.terminal ? 'terminal' : 'failed',
                error        : snapshot.cached.result?.error || 'unknown embedding-provider error',
                failureStreak: snapshot.failureStreak,
                backoffMs    : snapshot.backoffMs,
                nextAttemptAt: snapshot.nextAttemptAt,
                stopReason   : snapshot.stopReason,
                timeoutMs    : producer.timeoutMs
            };
        }

        return {
            status: 'pending',
            reason: `${snapshot.inFlight ? 'first run in flight' : 'no result yet'} (deadline ${producer.timeoutMs}ms)`
        };
    }

    /**
     * @summary Starts or re-arms the lifecycle-owned Knowledge Base embedding probe producer.
     *
     * Scheduling belongs here, never in `healthcheck()`. The first attempt runs immediately and is
     * returned so server boot can await observed truth before its first public health verdict.
     * Re-arms preserve the same bounded gate, so an in-flight attempt is joined and failure backoff
     * survives a scheduler restart. Epoch fencing keeps queued callbacks from an older arm inert.
     * An attempt-body throw becomes a fixed `probe-could-not-run` receipt at this consumer boundary;
     * provider deadlines already return `consumer-probe-timeout`. The gate therefore owns cadence
     * and backoff while the probe owns the public failure meaning.
     *
     * @param {Object}   [options]
     * @param {Number}   [options.cadenceMs=60000] Producer attempt cadence.
     * @param {Number}   [options.timeoutMs=30000] Per-attempt provider deadline.
     * @param {Number}   [options.healthyTtlMs=60000] Healthy-result staleness floor.
     * @param {Number}   [options.failureTtlMs=30000] Base failure backoff.
     * @param {Number}   [options.failureTtlMaxMs=600000] Failure-backoff ceiling.
     * @param {Function} [options.runProbe] Injectable attempt body.
     * @param {Function} [options.keyFor] Injectable provider-generation key.
     * @param {Function} [options.scheduler] Injectable interval scheduler.
     * @param {Function} [options.clearSchedule] Injectable interval clearer.
     * @param {Function} [options.clock] Injectable time source.
     * @returns {Promise<Object>|null} First gate-annotated observation, or `null` when disabled.
     */
    startEmbeddingProbe(options = {}) {
        const {
            cadenceMs       = aiConfig.healthcheck.embeddingProbeCadenceMs,
            timeoutMs       = aiConfig.healthcheck.embeddingProbeTimeoutMs,
            healthyTtlMs    = aiConfig.healthcheck.embeddingProbeHealthyTtlMs,
            failureTtlMs    = aiConfig.healthcheck.embeddingProbeFailureTtlMs,
            failureTtlMaxMs = aiConfig.healthcheck.embeddingProbeFailureTtlMaxMs,
            runProbe,
            keyFor,
            scheduler,
            clearSchedule,
            clock
        } = options;

        let producer = this.#embeddingProbeProducer;

        if (!(cadenceMs > 0)) {
            if (producer) {
                producer.disabled = true;
                this.stopEmbeddingProbe();
            }

            return null;
        }

        const schedule   = scheduler     ?? producer?.schedule      ?? ((fn, ms) => setInterval(fn, ms)),
              unschedule = clearSchedule ?? producer?.clearSchedule ?? (handle => clearInterval(handle));

        if (producer?.timer !== null && producer?.timer !== undefined) {
            producer.clearSchedule(producer.timer);
            producer.timer = null;
        }

        if (!producer) {
            producer = this.#embeddingProbeProducer = {
                epoch: 0,
                gate : createBoundedRetryGate({
                    // Captures the attempt's ISSUED basis. `producer.timeoutMs` is mutable and every
                    // re-arm overwrites it while this gate and any in-flight attempt are preserved, so
                    // judging a live flight against the CURRENT config compares it to a deadline it
                    // was never issued under.
                    run: async context => {
                        producer.activeAttempt = {startedAt: producer.clock(), timeoutMs: producer.timeoutMs};

                        try {
                            return await producer.runProbe(context);
                        } catch {
                            return {
                                status             : 'failed',
                                error              : 'probe-could-not-run:EMBEDDING_PROBE_EXECUTION_ERROR',
                                errorClassification: 'probe-could-not-run',
                                errorCode          : 'EMBEDDING_PROBE_EXECUTION_ERROR'
                            };
                        } finally {
                            producer.activeAttempt = null;
                        }
                    },
                    failureTtlMs,
                    failureTtlMaxMs,
                    now: () => producer.clock()
                }),
                schedule,
                clearSchedule: unschedule,
                clock        : clock ?? Date.now,
                keyFor       : keyFor ?? (() => `${aiConfig.embeddingProvider}:${aiConfig.vectorDimension}`),
                runProbe     : runProbe ?? (() => buildKnowledgeBaseEmbeddingProbeBlock({timeoutMs: producer.timeoutMs})),
                // The in-flight attempt's own basis: `{startedAt, timeoutMs}` as issued. Null between
                // attempts. Never read from the mutable arm fields — see the `run` wrapper above.
                activeAttempt: null,
                disabled     : false,
                stopped      : false,
                timer        : null
            };
        } else {
            if (clock) {
                // Carry the in-flight attempt's ELAPSED time across the swap; `startedAt` is only
                // meaningful in the clock that produced it.
                if (producer.activeAttempt) {
                    const elapsedMs = Math.max(0, producer.clock() - producer.activeAttempt.startedAt);

                    producer.activeAttempt.startedAt = clock() - elapsedMs;
                }

                producer.clock = clock;
            }

            if (keyFor)   producer.keyFor   = keyFor;
            if (runProbe) producer.runProbe = runProbe;

            producer.schedule      = schedule;
            producer.clearSchedule = unschedule;
        }

        producer.cadenceMs    = cadenceMs;
        producer.disabled     = false;
        producer.healthyTtlMs = healthyTtlMs;
        producer.stopped      = false;
        producer.timeoutMs    = timeoutMs;

        const epoch = ++producer.epoch;

        producer.timer = producer.schedule(() => {
            if (producer.epoch === epoch && !producer.stopped) {
                return producer.gate.tick({key: producer.keyFor()});
            }
        }, cadenceMs);

        return producer.gate.tick({key: producer.keyFor()});
    }

    /**
     * @summary Disarms the embedding probe schedule and epoch-fences queued callbacks.
     * @returns {void}
     */
    stopEmbeddingProbe() {
        const producer = this.#embeddingProbeProducer;

        if (producer) {
            producer.epoch++;
            producer.stopped = true;

            if (producer.timer !== null && producer.timer !== undefined) {
                producer.clearSchedule(producer.timer);
                producer.timer = null;
            }
        }
    }

    /**
     * @summary Disarms and drops the embedding producer for test/restart-boundary isolation.
     * @returns {void}
     */
    clearEmbeddingProbeProducer() {
        this.stopEmbeddingProbe();
        this.#embeddingProbeProducer = null;
    }

    /**
     * Performs a comprehensive health check without using the cache.
     *
     * Intent: This is the core health check logic, separated from the caching layer
     * for clarity. It systematically verifies each dependency and builds a detailed
     * status payload that can be used for diagnostics, logging, and error messages.
     *
     * The checks are performed in order of criticality:
     * 1. ChromaDB connectivity (if it's not running, nothing else matters)
     * 2. Collection accessibility (ensures data structures are ready)
     * 3. The lifecycle producer's latest observed embedding result (projected by `healthcheck()`)
     *
     * Status levels:
     * - healthy: ChromaDB connected, KB corpus accessible, embedding provider ready
     * - degraded: ChromaDB connected, but KB corpus or embedding provider unavailable
     * - unhealthy: ChromaDB not reachable
     *
     * @returns {Promise<object>} A comprehensive health status payload
     * @private
     */
    async #performHealthCheck() {
        const payload = {
            status   : 'healthy',
            timestamp: new Date().toISOString(),
            database : {
                process   : DatabaseLifecycleService.getDatabaseStatus(),
                connection: {
                    connected  : false,
                    collections: null
                }
            },
            features: {
                embedding: null
            },
            details: [],
            version: process.env.npm_package_version || '1.0.0',
            // The package version answers "which release line", not "which commit". `runtimeFreshness`
            // below answers "are my tool schemas stale against MY OWN checkout" — both are blind to a
            // plane running several hundred commits behind, which is the drift that gets attributed to
            // product quality. Always emitted, `unknown` when no build wrote a revision: an omitted
            // field reads as current to every naive consumer.
            deployedRevision: readDeployedRevision(),
            uptime          : process.uptime(),
            runtimeFreshness: await this.resolveRuntimeFreshness()
        };

        // Step 1: Check ChromaDB connectivity
        const connectionCheck = await this.#checkChromaConnection();
        payload.database.connection.connected = connectionCheck.running;

        if (!connectionCheck.running) {
            payload.status = 'unhealthy';
            payload.details.push(connectionCheck.error);
            return payload;
        }

        // Step 2: Check collections
        const collectionsCheck = await this.#checkCollections();
        payload.database.connection.collections = {
            knowledgeBase: collectionsCheck.knowledgeBase
        };

        if (collectionsCheck.error || !collectionsCheck.knowledgeBase?.exists) {
            payload.status = 'degraded';
            payload.details.push(collectionsCheck.error || 'The required knowledge base collection is missing');
        }

        // If we made it here with no errors, report success
        if (payload.status === 'healthy') {
            payload.details.push('Connected to the orchestrator-managed ChromaDB instance');
            payload.details.push('All features are operational');
        }

        return payload;
    }

    /**
     * Public API: Checks the health of the Knowledge Base with intelligent caching.
     *
     * Intent: This is the primary entry point for all health checks. It uses a
     * 5-minute cache to avoid hammering ChromaDB with redundant heartbeat calls,
     * which is especially important when:
     * - The MCP server is handling multiple concurrent tool requests
     * - Agents are debugging issues and repeatedly calling healthcheck
     * - The startup sequence is running automatic summarization
     *
     * IMPORTANT: Only 'healthy' results are cached. Unhealthy/degraded results are
     * always fresh, allowing immediate recovery detection when users fix issues
     * (e.g., by starting ChromaDB or configuring the embedding provider). This ensures good UX -
     * users don't have to wait 5 minutes to retry after fixing a problem.
     *
     * Recovery detection: If the status changes between checks (e.g., from 'unhealthy'
     * to 'healthy'), we log a clear message so users know their fix worked.
     *
     * @returns {Promise<object>} A health status payload
     */
    async healthcheck() {
        const now = Date.now();

        // Only use cache if the previous result was healthy
        // Unhealthy/degraded results are never cached to allow immediate recovery
        if (this.#cachedHealth &&
            this.#cachedHealth.status === 'healthy' &&
            this.#lastCheckTime) {
            const age = now - this.#lastCheckTime;

            // If the cache is still fresh (< 5 minutes old), return it immediately
            if (age < this.#cacheDuration) {
                logger.debug(`[HealthService] Using cached health status (age: ${Math.round(age / 1000)}s)`);
                return this.#applyEmbeddingProbe({
                    ...this.#cachedHealth,
                    runtimeFreshness: await this.resolveRuntimeFreshness()
                });
            }
        }

        // Check for in-flight request (deduplication)
        if (this.#healthCheckPromise) {
            logger.debug('[HealthService] Joining in-flight health check...');
            return this.#healthCheckPromise;
        }

        // Cache is stale, was unhealthy, or doesn't exist - perform a fresh check
        logger.debug('[HealthService] Performing fresh health check');

        // Create the promise and store it
        this.#healthCheckPromise = this.#performHealthCheck()
            .then(payload => this.#applyEmbeddingProbe(payload))
            .finally(() => {
                // Always clear the promise when done, success or fail
                this.#healthCheckPromise = null;
            });

        const health = await this.#healthCheckPromise;

        // Detect and log meaningful state transitions
        // This helps users understand when their fixes (like starting ChromaDB) succeed
        if (this.#previousStatus && this.#previousStatus !== health.status) {
            if (this.#previousStatus === 'unhealthy' && health.status === 'healthy') {
                logger.info('🎉 [HealthService] System recovered! Knowledge Base is now fully operational.');
            } else if (this.#previousStatus === 'unhealthy' && health.status === 'degraded') {
                logger.info('⚠️  [HealthService] System partially recovered. ChromaDB is running but some features unavailable.');
            } else if (this.#previousStatus === 'degraded' && health.status === 'healthy') {
                logger.info('✅ [HealthService] System fully recovered! All features now operational.');
            } else if ((this.#previousStatus === 'healthy' || this.#previousStatus === 'degraded') && health.status === 'unhealthy') {
                logger.warn('⚠️  [HealthService] System became unhealthy. Tools may fail until dependencies are resolved.');
            }
        }

        // Update the cache with this fresh result
        // Note: Even unhealthy results are stored, but won't be returned from cache
        this.#cachedHealth   = health;
        this.#lastCheckTime  = now;
        this.#previousStatus = health.status;

        return health;
    }

    /**
     * Ensures the Knowledge Base is healthy before allowing an operation to proceed.
     *
     * Intent: This is the "gatekeeper" method used by tool handlers to fail-fast
     * with a clear error message if dependencies are not available.
     *
     * By throwing an exception, we ensure that:
     * 1. The operation doesn't attempt to use ChromaDB/Gemini and get cryptic errors
     * 2. The agent receives a clear, actionable error message via the MCP protocol
     * 3. Users understand exactly what needs to be fixed
     *
     * This method leverages the cached health check, so calling it frequently
     * (e.g., before each tool invocation) has minimal performance impact.
     *
     * Note: ChromaDB and an observed-healthy embedding path are required for retrieval, since
     * adding/querying knowledge requires text embeddings. Provider configuration alone is never
     * treated as availability. Database lifecycle is managed outside the MCP tool surface;
     * degraded state only permits health/introspection helpers that do not touch the vector store.
     *
     * @throws {Error} If the Knowledge Base is not fully healthy, with a detailed message
     * @returns {Promise<void>}
     */
    async ensureHealthy() {
        const health = await this.healthcheck();

        if (health.status !== 'healthy') {
            // Build a multi-line error message with all the issues detected
            const details   = health.details.join('\n  - ');
            const statusMsg = health.status === 'unhealthy' ? 'not available' : 'not fully operational';
            throw new Error(`Knowledge Base is ${statusMsg}:\n  - ${details}`);
        }
    }

    /**
     * Clears the health check cache, forcing the next call to perform a fresh check.
     *
     * Intent: This is primarily useful for testing and debugging scenarios where
     * you need to immediately verify a fix (e.g., after starting ChromaDB)
     * without waiting for the 5-minute cache to expire.
     */
    clearCache() {
        this.#cachedHealth    = null;
        this.#lastCheckTime   = null;
        this.#runtimeFreshnessTracker.clearCache();
        logger.debug('[HealthService] Cache cleared, next health check will be fresh');
    }

    /**
     * Resolves the live runtime freshness diagnostic for the attached KB MCP process.
     *
     * Intent: a process can be dependency-healthy while stale relative to the checkout/config an
     * agent is inspecting. Keeping this lightweight warning in healthcheck avoids duplicate source
     * tickets when the right action is restart/reconnect.
     *
     * @returns {Promise<Object>} Runtime freshness diagnostic payload.
     */
    async resolveRuntimeFreshness() {
        return this.#runtimeFreshnessTracker.resolve({
            reader       : this.runtimeFreshnessReader,
            cacheDuration: this.runtimeFreshnessCacheDuration
        });
    }
}

export default Neo.setupClass(HealthService);
