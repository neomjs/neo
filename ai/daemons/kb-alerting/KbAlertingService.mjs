// Class-only daemon implementation. Entry-point bootstrap (Neo + core/_export +
// InstanceManager) lives in `ai/daemons/kb-alerting/daemon.mjs`, following the
// canonical Orchestrator class+wrapper pattern. `Neo.setupClass(KbAlertingService)`
// at file bottom uses `globalThis.Neo`, populated by the entry-point bootstrap chain.
import Base                           from '../../../src/core/Base.mjs';
import aiConfig                       from '../../mcp/server/memory-core/config.mjs';
import KBRecorderService              from '../../services/knowledge-base/KBRecorderService.mjs';
import MailboxService                 from '../../services/memory-core/MailboxService.mjs';
import RequestContextService          from '../../mcp/server/shared/services/RequestContextService.mjs';
import logger                         from '../../mcp/server/knowledge-base/logger.mjs';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';
import {
    evaluateAlertRules,
    formatAlertMessage
} from '../../services/knowledge-base/helpers/kbAlertRuleEngine.mjs';

/**
 * @summary Sender identity fallback for A2A alert dispatch when `NEO_AGENT_IDENTITY` is unset.
 * @type {String}
 */
const DEFAULT_SENDER = '@system';

/**
 * @summary KB operator-alerting daemon — telemetry thresholds → A2A / console alerts.
 *
 * Provides the alerting leg of KB operability: ingestion records per-tenant metrics in
 * `kb_ingestion_metrics`; this daemon polls the per-tenant rollup, evaluates it against
 * operator-configured `aiConfig.knowledgeBase.alertRules`, and dispatches an alert to each
 * breached rule's channels. Without it, operators must manually poll telemetry.
 *
 * **Shape** — the canonical poll-loop daemon (the `SwarmHeartbeatService` precedent): a
 * `Neo.core.Base` singleton with `start()` / `stop()` / `scheduleNext()` / `pulse()`. The
 * entry-point wrapper `ai/daemons/kb-alerting/daemon.mjs` owns the Neo bootstrap + SIGTERM.
 *
 * **Split** — the *pure* threshold logic (rule validation, breach evaluation, hysteresis,
 * message formatting) lives in `kbAlertRuleEngine.mjs` and is unit-tested in isolation; this
 * class owns only the I/O: the poll loop, the telemetry read, and channel dispatch.
 *
 * **Opt-in** — `start()` is a no-op unless `aiConfig.knowledgeBase.alertingEnabled` is true,
 * so a default deployment never runs the daemon.
 *
 * **Channels** — `console` → `logger`; `a2a:<target>` → `MailboxService.addMessage`
 * under a bound sender identity; `webhook:<url>` is recognized but warn-skipped until
 * webhook delivery is implemented. Cooldown state is held in-memory and reset on `start()`.
 *
 * @class Neo.ai.daemons.KbAlertingService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/kb-alerting/daemon.mjs — the entry-point wrapper.
 * @see ai/services/knowledge-base/helpers/kbAlertRuleEngine.mjs — the pure rule engine.
 * @see ai/daemons/SwarmHeartbeatService.mjs — the poll-loop daemon precedent.
 * @see ai/scripts/lifecycle/idleOutNudge.mjs — the daemon-side `MailboxService.addMessage` precedent.
 */
class KbAlertingService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.KbAlertingService'
         * @protected
         */
        className: 'Neo.ai.daemons.KbAlertingService',
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
         * Interval between alerting pulses in milliseconds.
         * Populated from `aiConfig.knowledgeBase.alertingIntervalMs` when the daemon starts.
         * Plain singleton state; no reactive hooks are attached.
         * @member {Number|null} pollIntervalMs=null
         * @protected
         */
        pollIntervalMs: null
    }

    /**
     * @summary In-memory hysteresis state — a map of `cooldownKey` → last-fired epoch ms,
     * threaded through {@link evaluateAlertRules} across pulses. Reset on every `start()`.
     * @member {Object} cooldownState={}
     * @protected
     */
    cooldownState = {}

    /**
     * @summary Starts the alerting poll loop. Idempotent; a no-op while already polling.
     *
     * Exits early (without scheduling) when `aiConfig.knowledgeBase.alertingEnabled` is
     * false — the daemon process then has nothing keeping the event loop alive and exits.
     *
     * @param {Object}  [options]
     * @param {Number} [options.pollIntervalMs] Override the configured poll interval.
     * @returns {Promise<void>}
     */
    async start({pollIntervalMs} = {}) {
        if (this.isPolling) {
            logger.debug('[KbAlertingService] Already polling; start() is a no-op.');
            return;
        }

        const kbConfig = this.getKbConfig();

        if (!kbConfig.alertingEnabled) {
            logger.info('[KbAlertingService] Alerting disabled (aiConfig.knowledgeBase.alertingEnabled=false); not starting.');
            return;
        }

        this.pollIntervalMs = pollIntervalMs ?? kbConfig.alertingIntervalMs;
        this.cooldownState  = {};

        await KBRecorderService.ready();

        this.isPolling = true;
        logger.info(`[KbAlertingService] Starting KB operator-alerting (interval: ${this.pollIntervalMs}ms)`);

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
        logger.info('[KbAlertingService] Alerting stopped.')
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
            logger.error('[KbAlertingService] Pulse threw uncaught error:', err);
            this.scheduleNext()
        }), this.pollIntervalMs)
    }

    /**
     * @summary Executes one alerting pulse: rollup → rule evaluation → channel dispatch.
     *
     * Reads the per-tenant ingestion rollup over the configured look-back window, runs the
     * pure {@link evaluateAlertRules} engine (threading the in-memory cooldown state), logs
     * any malformed rules, then dispatches each emitted alert. Wrapped in try/catch/finally
     * so a failed cycle is logged and `scheduleNext()` still fires — one bad cycle must not
     * stop the daemon.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async pulse() {
        try {
            const kbConfig = this.getKbConfig();
            const rules    = Array.isArray(kbConfig.alertRules) ? kbConfig.alertRules : [];

            if (rules.length === 0) {
                return // no rules configured → nothing to evaluate
            }

            const windowMs = kbConfig.alertWindowMs;
            const rollup   = await this.fetchRollup(windowMs);

            const {alerts, cooldownState, skippedRules} = evaluateAlertRules({
                rules,
                rollup,
                cooldownState: this.cooldownState,
                now          : Date.now(),
                cooldownMs   : kbConfig.alertingCooldownMs
            });

            this.cooldownState = cooldownState;

            for (const {reason} of skippedRules) {
                logger.warn(`[KbAlertingService] Skipped malformed alert rule: ${reason}`)
            }

            for (const alert of alerts) {
                await this.dispatchAlert(alert)
            }
        } catch (err) {
            // A single-cycle failure must not stop the daemon — log and let `finally`
            // reschedule. Catching here also keeps `pulse()` from rejecting, so the loop
            // never double-schedules (the `finally` + `scheduleNext`'s own `.catch`).
            logger.error('[KbAlertingService] Pulse failed:', err)
        } finally {
            this.scheduleNext()
        }
    }

    /**
     * @summary Test-stubbable seam over `aiConfig.knowledgeBase`.
     *
     * Reads the resolved AiConfig Provider subtree directly; missing subtree shape must fail
     * loud instead of being converted into a disabled alerting daemon.
     *
     * @returns {Object}
     * @protected
     */
    getKbConfig() {
        return aiConfig.knowledgeBase
    }

    /**
     * @summary Test-stubbable seam over `KBRecorderService.getTenantIngestionRollup`.
     * @param {Number} windowMs Rolling look-back window.
     * @returns {Promise<Array<Object>>} Per-tenant rollup rows, or `[]`.
     * @protected
     */
    async fetchRollup(windowMs) {
        return KBRecorderService.getTenantIngestionRollup({sinceMs: Date.now() - windowMs}) || []
    }

    /**
     * @summary Dispatches one alert descriptor to its channel. Never throws — a channel
     * failure is logged and the remaining alerts still dispatch.
     * @param {Object} alert An entry from {@link evaluateAlertRules}'s `alerts` array.
     * @returns {Promise<void>}
     * @protected
     */
    async dispatchAlert(alert) {
        const channel = alert.channel;

        try {
            if (channel === 'console') {
                this.dispatchConsole(alert)
            } else if (channel.startsWith('a2a:')) {
                await this.dispatchA2A(alert)
            } else if (channel.startsWith('webhook:')) {
                // Webhook delivery is recognized in config but not yet POSTed.
                logger.warn(`[KbAlertingService] Webhook channel deferred to V1.5; skipping "${channel}" (tenant ${alert.tenantId})`)
            } else {
                logger.warn(`[KbAlertingService] Unknown channel "${channel}" (tenant ${alert.tenantId}); skipping`)
            }
        } catch (err) {
            logger.error(`[KbAlertingService] Alert dispatch failed (${channel}, tenant ${alert.tenantId}): ${err.message}`)
        }
    }

    /**
     * @summary Console channel — `logger.error` for `critical`, `logger.warn` otherwise.
     * @param {Object} alert
     * @returns {void}
     * @protected
     */
    dispatchConsole(alert) {
        const {subject} = formatAlertMessage(alert);

        if (alert.severity === 'critical') {
            logger.error(subject)
        } else {
            logger.warn(subject)
        }
    }

    /**
     * @summary A2A channel — sends the alert via `MailboxService.addMessage` under a bound
     * sender identity (the `idleOutNudge.mjs` daemon-side precedent).
     *
     * The channel spec `a2a:<target>` carries the recipient: a canonical `@<identity>`
     * direct recipient or `AGENT:*` for broadcast. `deliveryMode: 'audit'` maps to
     * `wakeSuppressed: true` (durable mailbox-only, no wake); `'wake'` (the default) emits
     * a wakeful message. An unresolvable target — neither a registered `@<identity>` nor
     * `AGENT:*` — is skipped with a `logger.warn` *before* dispatch (via
     * `MailboxService.isReachableTarget`), so `addMessage` is never reached for it.
     *
     * @param {Object} alert
     * @returns {Promise<void>}
     * @protected
     */
    async dispatchA2A(alert) {
        const target = alert.channel.slice('a2a:'.length);

        // Reject an unresolvable target before dispatch. A target that is neither a registered
        // `@<identity>` nor the `AGENT:*` sentinel is skipped with a warn; `MailboxService.addMessage`
        // is never reached, so a misconfigured rule cannot attempt orphan-target dispatch.
        if (!MailboxService.isReachableTarget(target)) {
            logger.warn(`[KbAlertingService] Skipping alert for unresolvable A2A target "${target}" (tenant ${alert.tenantId})`);
            return
        }

        const
            {subject, body} = formatAlertMessage(alert),
            sender          = process.env.NEO_AGENT_IDENTITY
                ? normalizeAgentIdentityNodeId(process.env.NEO_AGENT_IDENTITY)
                : DEFAULT_SENDER;

        await RequestContextService.run({agentIdentityNodeId: sender}, async () => {
            await MailboxService.addMessage({
                to            : target,
                subject,
                body,
                priority      : alert.severity === 'critical' ? 'high' : 'normal',
                wakeSuppressed: alert.deliveryMode === 'audit'
            })
        })
    }
}

export default Neo.setupClass(KbAlertingService);

export {DEFAULT_SENDER};
