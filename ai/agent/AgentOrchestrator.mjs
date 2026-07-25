import Base                          from '../../src/core/Base.mjs';
import Agent                         from '../Agent.mjs';
import crypto                        from 'crypto';
import fs                            from 'fs';
import path                          from 'path';
import {fileURLToPath}               from 'url';
import {resolvePlaneDataRoot}        from '../planeConfig.mjs';
import {validateComputedRouteResult} from '../services/graph/computedRouteResult.mjs';

/*
 * The single module-scope plane anchor every durable default below derives from. A config default
 * is evaluated before any Provider exists, so it cannot read the resolved leaf — it resolves the
 * plane root env-free, over the DISCOVERED repo root, and never over `process.cwd()`.
 *
 * That distinction is the whole point: a cwd-derived default follows the launch directory, so the
 * same process writes into a different data plane depending on where it was started, and nothing
 * fails loudly when it does. Env relocation still belongs to the leaf machinery — `NEO_PLANE_DATA_ROOT`
 * moves the plane, and callers relocate an individual path by passing the config.
 */
const neoRootDir          = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
      planeDataRootAnchor = resolvePlaneDataRoot({env: {}, rootDir: neoRootDir});

const OUTCOME_STATUSES = new Set(['completed', 'failed', 'blocked', 'expired', 'exhausted', 'crashed']),
      REASON_CODES     = new Set([
          'agent-uncaught-error',
          'productive-failure-tripwire',
          'turn-limit',
          'execution-timeout',
          'context-limit',
          'tool-failure',
          'blocked-task-state',
          'queue-exhausted',
          'unknown'
      ]),
      RETRY_POLICIES    = new Set(['preserve-urgency', 'demote-next-cycle', 'blocked-handoff', 'no-retry']);

/**
 * Reads the typed computed-route.v1 sidecar (computed-route.json) written by GoldenPathSynthesizer
 * and injects its executable route as directives into a headless agent loop. Golden Path scoring
 * remains owned by graph synthesis; this runner only records terminal issue-task outcomes so later
 * cycles can reason from durable evidence.
 * @class Neo.ai.agent.AgentOrchestrator
 * @extends Neo.core.Base
 */
class AgentOrchestrator extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.agent.AgentOrchestrator'
         * @protected
         */
        className: 'Neo.ai.agent.AgentOrchestrator',
        /**
         * Repo-anchored, not cwd-anchored: this is checkout content, so it resolves against the
         * discovered `neoRootDir` and stays the same file no matter where the process was launched.
         * @member {String} handoffPath=path.resolve(neoRootDir, 'resources/content/sandman_handoff.md')
         */
        handoffPath: path.resolve(neoRootDir, 'resources/content/sandman_handoff.md'),
        /**
         * Wait interval before checking if the scheduler is exhausted natively.
         * @member {Number} monitorIntervalMs=5000
         */
        monitorIntervalMs: 5000,
        /**
         * Maximum execution window before pending directives are recorded as expired.
         * A value of `0` disables the timeout for current CLI compatibility.
         * @member {Number} executionTimeoutMs=0
         */
        executionTimeoutMs: 0,
        /**
         * Optional factory seam for tests or host runtimes that need a custom agent.
         * @member {Function|null} agentFactory=null
         */
        agentFactory: null,
        /**
         * Optional HealthService-compatible projection sink.
         * @member {Object|null} healthService=null
         */
        healthService: null,
        /**
         * Optional handoff/A2A emitter for crashed, blocked, expired, or repeated-failed outcomes.
         * @member {Function|null} handoffEmitter=null
         */
        handoffEmitter: null,
        /**
         * Append-only Golden Path issue outcome file — a plane MEMBER, so it derives from the one
         * plane anchor rather than re-deriving its own root. Under ambient cwd this file followed
         * the launch directory instead of the declared plane, which splits outcome history across
         * roots without failing anything loudly.
         * @member {String} outcomePath=path.resolve(planeDataRootAnchor, 'agent-orchestrator/golden-path-outcomes.jsonl')
         */
        outcomePath: path.resolve(planeDataRootAnchor, 'agent-orchestrator/golden-path-outcomes.jsonl'),
        /**
         * Injectable exit hook. Defaults to process.exit for CLI runner compatibility.
         * @member {Function} exitHandler=(code) => process.exit(code)
         */
        exitHandler: code => process.exit(code),
        /**
         * Injectable clock for deterministic outcome timestamps.
         * @member {Function} now=() => new Date()
         */
        now: () => new Date()
    }

    /**
     * Reads the typed computed-route.v1 sidecar and returns its executable route as directives.
     * Only `route.items` (the executable slot) becomes directives; the declared-intent advisory is
     * context and is never routed.
     *
     * Every admission axis fails CLOSED to an empty directive list — the orchestrator then exits
     * cleanly, never throwing. A route is refused when it is missing, unreadable, contract-invalid,
     * not fresh (status/freshness), lacking a parseable capturedAt/expiresAt, expired, unattributed
     * (no provenance.producer), or carrying a malformed item. Absence of freshness proof is never
     * read as freshness: a route with no expiry is refused rather than bypassing the expiry gate,
     * and a malformed item set rejects the whole route rather than executing its well-formed subset.
     * @returns {Array<{issueId: String, description: String}>}
     */
    readComputedRoute() {
        const routePath = path.join(path.dirname(this.handoffPath), 'computed-route.json');

        if (!fs.existsSync(routePath)) {
            console.warn(`[AgentOrchestrator] No computed-route.json sidecar found at ${routePath}`);
            return [];
        }

        let result;
        try {
            result = JSON.parse(fs.readFileSync(routePath, 'utf-8'));
        } catch (error) {
            console.warn(`[AgentOrchestrator] computed-route.json is unreadable: ${error.message}`);
            return [];
        }

        const {valid, errors} = validateComputedRouteResult(result);
        if (!valid) {
            console.warn(`[AgentOrchestrator] computed-route.json failed contract validation: ${errors.join('; ')}`);
            return [];
        }

        // Only a FRESH route is executable. Empty/missing/stale/degraded are honest pass outcomes,
        // never a route to run: an executable slot carried under a non-fresh status is a producer
        // breach and must not reach the agent loop.
        if (result.status !== 'fresh' || result.freshness?.status !== 'fresh') {
            console.warn(`[AgentOrchestrator] computed-route.json is not fresh (status=${result.status}, freshness=${result.freshness?.status}); not routing.`);
            return [];
        }

        // Timestamps are REQUIRED, not optional. A route with no parseable capture/expiry carries no
        // freshness proof, so it can never be treated as current — a missing expiry fails CLOSED
        // rather than bypassing the expiry gate.
        const capturedAtMs = Date.parse(result.capturedAt ?? ''),
              expiresAtMs  = Date.parse(result.expiresAt ?? '');

        if (!Number.isFinite(capturedAtMs) || !Number.isFinite(expiresAtMs)) {
            console.warn('[AgentOrchestrator] computed-route.json lacks a parseable capturedAt/expiresAt; not routing an unprovenanced route.');
            return [];
        }

        if (expiresAtMs <= this.now().getTime()) {
            console.warn(`[AgentOrchestrator] computed-route.json expired at ${result.expiresAt}; not routing a stale route.`);
            return [];
        }

        // An unattributed route is not routable: provenance must name the producing pass.
        if (typeof result.provenance?.producer !== 'string' || result.provenance.producer.length === 0) {
            console.warn('[AgentOrchestrator] computed-route.json carries no provenance.producer; not routing an unattributed route.');
            return [];
        }

        // A malformed item set is a contract breach, not a partial route to run — reject the whole
        // route rather than silently executing the well-formed subset.
        const items     = result.route.items,
              malformed = items.find(item => typeof item?.id !== 'string' || item.id.length === 0 ||
                                             typeof item?.title !== 'string' || item.title.length === 0);

        if (malformed) {
            console.warn(`[AgentOrchestrator] computed-route.json contains a malformed route item (${JSON.stringify(malformed)}); not routing.`);
            return [];
        }

        return items.map(item => ({
            issueId    : String(item.id).replace(/^issue-/, ''),
            description: item.title
        }));
    }

    /**
     * Creates the underlying autonomous agent. Kept as a seam so issue-outcome
     * tests can drive execute() without booting real MCP servers.
     * @returns {Neo.ai.Agent|Object}
     */
    createAgent() {
        if (this.agentFactory) {
            return this.agentFactory();
        }

        return Neo.create(Agent, {
            maxSubAgentLifespan: 20,
            servers            : ['knowledge-base', 'file-system', 'github-workflow']
        });
    }

    /**
     * @param {Error|*} error
     * @returns {Object|null}
     */
    serializeError(error) {
        if (!error) return null;

        return {
            message: error.message || String(error),
            name   : error.name || 'Error',
            stack  : error.stack || null
        };
    }

    /**
     * @param {String} status Golden Path outcome status.
     * @returns {String} Coarse HealthService status.
     */
    getHealthStatus(status) {
        return status === 'completed' || status === 'exhausted' ? 'completed' : 'failed';
    }

    /**
     * @param {Object} outcome
     * @returns {Boolean}
     */
    shouldEmitHandoff(outcome) {
        return outcome.status === 'blocked' ||
            outcome.status === 'expired' ||
            outcome.status === 'crashed' ||
            (outcome.status === 'failed' && outcome.reasonCode === 'productive-failure-tripwire');
    }

    /**
     * @param {Object} agent Agent-like instance with a loop scheduler.
     * @returns {Boolean}
     */
    hasPendingAgentTasks(agent) {
        const scheduler = agent.loop?.scheduler;

        if (!scheduler) {
            return false;
        }
        if (typeof scheduler.isEmpty === 'function') {
            return !scheduler.isEmpty();
        }
        if (Array.isArray(scheduler.queue)) {
            return scheduler.queue.length > 0;
        }

        return Object.values(scheduler.queues || {}).some(queue => queue.length > 0);
    }

    /**
     * @param {Object} agent Agent-like instance with a loop dead-letter queue.
     * @param {Object} directive Golden Path directive.
     * @returns {Object|null}
     */
    getFailedEventForDirective(agent, directive) {
        const failedEvents = agent.loop?.failedEvents || [];

        return failedEvents.find(entry => {
            const data = entry.event?.data || {};
            return entry.event?.type === 'system:golden-path' &&
                String(data.issueId) === String(directive.issueId);
        }) || null;
    }

    /**
     * @param {Object} failedEvent Loop dead-letter entry.
     * @returns {String}
     */
    getFailedEventReasonCode(failedEvent) {
        if (REASON_CODES.has(failedEvent?.reasonCode)) {
            return failedEvent.reasonCode;
        }

        return String(failedEvent?.error || '').includes('blocked-task-state') ?
            'blocked-task-state' :
            'productive-failure-tripwire';
    }

    /**
     * Emits an optional peer-visible handoff and returns its stable identifier.
     * @param {Object} outcome
     * @returns {Promise<String|null>}
     */
    async emitHandoff(outcome) {
        if (!this.shouldEmitHandoff(outcome) || !this.handoffEmitter) {
            return null;
        }

        try {
            const result = await this.handoffEmitter(outcome);
            return typeof result === 'string' ? result : result?.messageId || result?.id || null;
        } catch (err) {
            console.warn(`[AgentOrchestrator] Handoff emitter failed: ${err.message}`);
            return null;
        }
    }

    /**
     * @param {Object} options
     * @param {String} options.runId Stable execution run id.
     * @param {Object} options.directive Golden Path directive.
     * @param {String} options.startedAt ISO start time.
     * @param {String} options.completedAt ISO completion time.
     * @param {String} options.status Terminal issue-task status.
     * @param {String} options.reasonCode Terminal reason code.
     * @param {String} options.retryPolicy Conservative retry policy.
     * @param {Error|*} [options.error=null]
     * @returns {Object}
     */
    createOutcome({
        runId,
        directive,
        startedAt,
        completedAt,
        status,
        reasonCode,
        retryPolicy,
        error = null
    }) {
        if (!OUTCOME_STATUSES.has(status)) {
            throw new TypeError(`AgentOrchestrator: unsupported outcome status '${status}'`);
        }
        if (!REASON_CODES.has(reasonCode)) {
            throw new TypeError(`AgentOrchestrator: unsupported reason code '${reasonCode}'`);
        }
        if (!RETRY_POLICIES.has(retryPolicy)) {
            throw new TypeError(`AgentOrchestrator: unsupported retry policy '${retryPolicy}'`);
        }

        return {
            runId,
            issueId         : directive.issueId,
            description     : directive.description,
            startedAt,
            completedAt,
            status,
            reasonCode,
            retryPolicy,
            error           : this.serializeError(error),
            handoffMessageId: null
        };
    }

    /**
     * @param {Object} outcome
     */
    appendOutcome(outcome) {
        fs.mkdirSync(path.dirname(this.outcomePath), {recursive: true});
        fs.appendFileSync(this.outcomePath, `${JSON.stringify(outcome)}\n`, 'utf-8');

        try {
            this.healthService?.recordTaskOutcome?.(
                'agent-orchestrator',
                this.getHealthStatus(outcome.status),
                outcome
            );
        } catch (err) {
            console.warn(`[AgentOrchestrator] Health projection failed: ${err.message}`);
        }
    }

    /**
     * Records one durable outcome per Golden Path directive.
     * @param {Object} options
     * @param {String} options.runId
     * @param {Array<{issueId: String, description: String}>} options.directives
     * @param {String} options.startedAt
     * @param {String} options.status
     * @param {String} options.reasonCode
     * @param {String} options.retryPolicy
     * @param {Error|*} [options.error=null]
     * @returns {Promise<Object[]>}
     */
    async recordDirectiveOutcomes({
        runId,
        directives,
        startedAt,
        status,
        reasonCode,
        retryPolicy,
        error = null
    }) {
        const completedAt = this.now().toISOString(),
              outcomes    = [];

        for (const directive of directives) {
            const outcome = this.createOutcome({
                runId,
                directive,
                startedAt,
                completedAt,
                status,
                reasonCode,
                retryPolicy,
                error
            });

            outcome.handoffMessageId = await this.emitHandoff(outcome);
            this.appendOutcome(outcome);
            outcomes.push(outcome);
        }

        return outcomes;
    }

    /**
     * Records completed or dead-lettered outcomes after the agent loop exhausts.
     * @param {Object} options
     * @param {String} options.runId
     * @param {Array<{issueId: String, description: String}>} options.directives
     * @param {String} options.startedAt
     * @param {Object} options.agent Agent-like instance.
     * @returns {Promise<Object[]>}
     */
    async recordExhaustedDirectiveOutcomes({
        runId,
        directives,
        startedAt,
        agent
    }) {
        const outcomes = [];

        for (const directive of directives) {
            const failedEvent = this.getFailedEventForDirective(agent, directive),
                  reasonCode  = failedEvent ? this.getFailedEventReasonCode(failedEvent) : 'queue-exhausted',
                  isBlocked   = reasonCode === 'blocked-task-state',
                  recorded    = await this.recordDirectiveOutcomes({
                      runId,
                      directives : [directive],
                      startedAt,
                      status     : failedEvent ? (isBlocked ? 'blocked' : 'failed') : 'completed',
                      reasonCode,
                      retryPolicy: failedEvent ? (isBlocked ? 'blocked-handoff' : 'demote-next-cycle') : 'no-retry',
                      error      : failedEvent?.error || null
                  });

            outcomes.push(recorded[0]);
        }

        return outcomes;
    }

    /**
     * Executes the orchestration pipeline.
     * @param {Object} [options]
     * @param {Boolean} [options.dryRun=false] Logs directives without agent execution.
     * @param {String} [options.runId] Stable execution run id.
     * @returns {Promise<void>}
     */
    async execute({ dryRun = false, runId = `agent-orchestrator-${crypto.randomUUID()}` } = {}) {
        console.log('⏳ Initializing Neo AgentOrchestrator...');

        const directives = this.readComputedRoute();

        if (!directives || directives.length === 0) {
            console.log('✅ No immediate Golden Path directives found. AgentOrchestrator exiting cleanly.');
            return;
        }

        if (dryRun) {
            console.log('\n[DRY RUN] Identified the following Golden Path Directives:\n');
            directives.forEach((dir, index) => {
                console.log(`  ${index + 1}. Issue #${dir.issueId}: ${dir.description}`);
            });
            console.log('\n[DRY RUN] Exiting successfully without executing Agent.');
            return;
        }

        const startedAt = this.now().toISOString();

        try {
            console.log(`   Found ${directives.length} prioritized tasks. Booting underlying agent instance...`);

            const agent = this.createAgent();

            // construct() auto-fired the agent's initAsync; ready() awaits it without the former
            // double-run (which created every MCP client twice) and re-throws a captured boot
            // failure (the Agent readiness contract), keeping this catch block the error path.
            await agent.ready();

            console.log('   Injecting Golden Path Directives into Scheduler...');

            for (const directive of directives) {
                agent.schedule({
                    type    : 'system:golden-path',
                    priority: 'high',
                    data    : {
                        issueId    : directive.issueId,
                        description: directive.description,
                        instruction: `You are directed to resolve issue ${directive.issueId}. Context: ${directive.description}`
                    }
                });
            }

            console.log('✅ Directives injected. Engaging Autonomous Loop.\n====================================');
            agent.start();

            // Monitor loop exhaustion safely
            await new Promise((resolve, reject) => {
                let finished = false,
                    monitorInterval,
                    timeoutTimer;

                const finish = async callback => {
                    if (finished) {
                        return;
                    }

                    finished = true;
                    clearInterval(monitorInterval);
                    clearTimeout(timeoutTimer);

                    try {
                        await callback();
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                };

                monitorInterval = setInterval(async () => {
                    const hasPendingTasks = this.hasPendingAgentTasks(agent),
                          hasActiveJobs   = agent.loop.processing;

                    if (!hasPendingTasks && !hasActiveJobs && Object.keys(agent.activeSubAgents).length === 0) {
                        await finish(async () => {
                            await this.recordExhaustedDirectiveOutcomes({
                                runId,
                                directives,
                                startedAt,
                                agent
                            });

                            console.log('\n====================================\n✅ Autonomous Loop Exhausted. Exiting cleanly.');
                            agent.disconnect();
                            this.exitHandler(0);
                        });
                    }
                }, this.monitorIntervalMs);

                if (this.executionTimeoutMs > 0) {
                    timeoutTimer = setTimeout(async () => {
                        await finish(async () => {
                            const error = new Error(`AgentOrchestrator execution exceeded ${this.executionTimeoutMs}ms`);

                            await this.recordDirectiveOutcomes({
                                runId,
                                directives,
                                startedAt,
                                status     : 'expired',
                                reasonCode : 'execution-timeout',
                                retryPolicy: 'preserve-urgency',
                                error
                            });

                            console.error(`❌ ${error.message}`);
                            agent.disconnect();
                            this.exitHandler(1);
                        });
                    }, this.executionTimeoutMs);
                }
            });

        } catch (err) {
            await this.recordDirectiveOutcomes({
                runId,
                directives,
                startedAt,
                status     : 'crashed',
                reasonCode : 'agent-uncaught-error',
                retryPolicy: 'preserve-urgency',
                error      : err
            });
            console.error('❌ AgentOrchestrator failed:', err);
            throw err;
        }
    }
}

export default Neo.setupClass(AgentOrchestrator);
