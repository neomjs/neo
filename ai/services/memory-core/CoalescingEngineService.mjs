import crypto                 from 'crypto';
import Base                   from '../../../src/core/Base.mjs';
import WebhookDeliveryService from './WebhookDeliveryService.mjs';
import logger                 from '../../mcp/server/memory-core/logger.mjs';

/**
 * @summary Token-economy throttle / coalescing engine for the cross-harness
 * autonomous wake substrate.
 *
 * Wake events MUST NOT be 1:1 with the underlying event stream at high velocity. This
 * engine batches per-subscription events within a configurable window (default 30s,
 * overridable per subscription via `harnessTargetMetadata.coalesceWindow`, clamped 0-300s)
 * and emits a single **digest** payload at window-flush time. Without this throttle,
 * broadcast bursts and Task state transition flurries cause catastrophic token burn
 * and session thrashing.
 *
 * **Layering:** consumers call `enqueue(subscription, event)` when an event matches a
 * subscription's trigger+filter spec. The engine maintains a per-subscription timer; at
 * timer fire, it builds a structured digest payload and dispatches to the channel
 * appropriate for `subscription.harnessTarget`:
 * - `mcp-notifications` → raw MCP notification emit-point for direct MCP clients
 * - `a2a-webhook` → `WebhookDeliveryService.deliver` (Shape B, already wired)
 * - `bridge-daemon` → no-op (Shape C handles its own coalescing in-process per ADR §6.3)
 * - `disabled` / `none` → no-op (subscription opted out of push)
 *
 * Wake daemon (Shape C) maintains a parallel coalescer in `ai/daemons/wake/daemon.mjs`
 * because it runs out-of-process; this engine handles the in-process Shape A + Shape B
 * routing only.
 *
 * @class Neo.ai.services.memory-core.CoalescingEngineService
 * @extends Neo.core.Base
 * @singleton
 * @see learn/agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md §6.4
 */
class CoalescingEngineService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.CoalescingEngineService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.CoalescingEngineService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Number} defaultWindowSeconds=30
     * @protected
     * @summary Default coalescing window for wake-digest delivery. Overridable per subscription
     * via `harnessTargetMetadata.coalesceWindow`. Clamped to [0, 300] at enqueue time.
     */
    defaultWindowSeconds = 30

    /**
     * @member {Number} maxWindowSeconds=300
     * @protected
     * @summary Hard upper bound on coalescing window (5 minutes). Beyond this, events
     * are stale enough that the agent's response would be on already-superseded state.
     */
    maxWindowSeconds = 300

    /**
     * @member {Set<McpServer>} mcpServers
     * @protected
     */
    mcpServers = new Set()

    /**
     * Per-subscription queue + timer state.
     * Structure: `Map<subscriptionId, {queue: Object[], timer: ?TimerId, subscription: Object, windowStart: ?Date}>`
     * Populated lazily on first enqueue; cleared on flush.
     * @member {Map<String, Object>} coalesceState
     * @protected
     */
    coalesceState = new Map()

    /**
     * @summary Registers an MCP server instance for push notifications.
     * @description Provides the engine with the handle needed to dispatch
     * notifications (Shape A) back to the client. Should be populated at boot
     * or per-Streamable-HTTP session.
     * @param {McpServer} mcpServer
     */
    addMcpServer(mcpServer) {
        if (mcpServer) {
            this.mcpServers.add(mcpServer);
        }
    }

    /**
     * @summary Removes an MCP server instance.
     * @param {McpServer} mcpServer
     */
    removeMcpServer(mcpServer) {
        if (mcpServer) {
            this.mcpServers.delete(mcpServer);
        }
    }

    /**
     * @summary Clears all registered MCP server instances.
     */
    clearMcpServers() {
        this.mcpServers.clear();
    }

    /**
     * Enqueue an event for coalesced delivery to a subscription. Starts (or extends)
     * the per-subscription timer; on fire, the engine builds a digest and dispatches.
     *
     * @param {Object} subscription Cached WAKE_SUBSCRIPTION entry (must include `id`,
     *   `agentIdentity`, `harnessTarget`, `harnessTargetMetadata`)
     * @param {Object} event Trigger-matched event envelope (must include `eventType`,
     *   `payload`, `logId`, `eventId`)
     * @returns {void}
     */
    enqueue(subscription, event) {
        const subId = subscription.id;
        if (!subId) {
            logger.warn('[CoalescingEngine] enqueue called with subscription missing id; dropping event.');
            return;
        }

        const target = subscription.harnessTarget;

        if (target === 'mcp-notifications') {
            // Direct MCP clients expect raw event payloads, not the `wake/digest` envelope.
            this._dispatchRaw(subscription, event).catch(e => {
                logger.error(`[CoalescingEngine] _dispatchRaw failed: ${e.message}`);
            });
            return;
        }

        if (target === 'disabled' || target === 'none') {
            return;
        }

        let state = this.coalesceState.get(subId);
        if (!state) {
            state = {queue: [], timer: null, subscription, windowStart: null};
            this.coalesceState.set(subId, state);
        } else {
            state.subscription = subscription;
        }

        state.queue.push(event);
        if (!state.windowStart) state.windowStart = new Date();

        if (state.timer) return;

        const windowMs = this._resolveWindowMs(subscription);
        if (windowMs === 0) {
            this._flush(subId);
            return;
        }

        state.timer = setTimeout(() => this._flush(subId), windowMs);
    }

    /**
     * Force-flush all subscriptions immediately. Used for graceful shutdown + tests.
     * @returns {Promise<void>}
     */
    async flushAll() {
        const ids = Array.from(this.coalesceState.keys());
        await Promise.all(ids.map(id => this._flush(id)));
    }

    /**
     * Clear all per-subscription state without dispatching. Used for tests.
     * @returns {void}
     */
    clearAll() {
        for (const state of this.coalesceState.values()) {
            if (state.timer) clearTimeout(state.timer);
        }
        this.coalesceState.clear();
    }

    /**
     * Resolves the effective coalescing window in milliseconds for a subscription.
     * Reads `harnessTargetMetadata.coalesceWindow` (seconds), falls back to default,
     * clamps to [0, maxWindowSeconds].
     *
     * @protected
     * @param {Object} subscription
     * @returns {Number} window in milliseconds (0 = immediate-flush)
     */
    _resolveWindowMs(subscription) {
        const meta     = subscription.harnessTargetMetadata || {};
        const override = meta.coalesceWindow;
        let   seconds  = (override === undefined || override === null) ? this.defaultWindowSeconds : override;
        seconds        = Math.max(0, Math.min(this.maxWindowSeconds, Number(seconds) || 0));
        return seconds * 1000;
    }

    /**
     * Timer-fire callback: build digest envelope from queued events, dispatch via the
     * subscription's `harnessTarget` routing, clear state.
     *
     * @protected
     * @param {String} subscriptionId
     * @returns {Promise<void>}
     */
    async _flush(subscriptionId) {
        const state = this.coalesceState.get(subscriptionId);
        if (!state || state.queue.length === 0) {
            this.coalesceState.delete(subscriptionId);
            return;
        }

        const {queue, subscription, windowStart} = state;
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        this.coalesceState.delete(subscriptionId);

        const digest = this._buildDigestEnvelope(subscription, queue, windowStart);
        await this._dispatchDigest(subscription, digest);
    }

    /**
     * Builds the digest envelope per ADR §6.4.2. The structured payload reports counts
     * per trigger type plus the latest-of-each for context. Wraps in the standard
     * notification envelope (schemaVersion / eventType=`wake/digest` / eventId / etc.)
     * so Shape A and Shape B consumers can dispatch with the same shape they expect for
     * single events.
     *
     * @protected
     * @param {Object} subscription
     * @param {Object[]} events Queued event envelopes
     * @param {Date} windowStart When the first event in this window was enqueued
     * @returns {Object} Digest envelope
     */
    _buildDigestEnvelope(subscription, events, windowStart) {
        const breakdown = {
            sent_to_me        : {count: 0, latest: null},
            task_state_changed: {count: 0, latest: null},
            permission_granted: {count: 0, latest: null}
        };

        for (const evt of events) {
            switch (evt.eventType) {
                case 'wake/sent_to_me':
                    breakdown.sent_to_me.count++;
                    breakdown.sent_to_me.latest = evt.payload;
                    break;
                case 'wake/task_state_changed':
                    breakdown.task_state_changed.count++;
                    breakdown.task_state_changed.latest = evt.payload;
                    break;
                case 'wake/permission_granted':
                    breakdown.permission_granted.count++;
                    breakdown.permission_granted.latest = evt.payload;
                    break;
            }
        }

        const emittedAt = new Date();

        return {
            schemaVersion : '1.0',
            eventType     : 'wake/digest',
            eventId       : `01H${crypto.randomBytes(10).toString('hex').toUpperCase()}`,
            logId         : events[events.length - 1]?.logId,
            agentIdentity : subscription.agentIdentity,
            subscriptionId: subscription.id,
            payload       : {
                totalEvents: events.length,
                breakdown,
                windowMs   : windowStart ? (emittedAt.getTime() - windowStart.getTime()) : 0
            },
            emittedAt: emittedAt.toISOString()
        };
    }

    /**
     * Dispatches the digest envelope via the channel matching `subscription.harnessTarget`.
     *
     * @protected
     * @param {Object} subscription
     * @param {Object} digest Envelope produced by `_buildDigestEnvelope`
     * @returns {Promise<void>}
     */
    async _dispatchDigest(subscription, digest) {
        const target = subscription.harnessTarget;

        if (target === 'a2a-webhook') {
            const subscriptionForDelivery = {
                id        : subscription.id,
                properties: {
                    harnessTargetMetadata: subscription.harnessTargetMetadata || {}
                }
            };
            try {
                await WebhookDeliveryService.deliver(subscriptionForDelivery, digest);
            } catch (e) {
                logger.error(`[CoalescingEngine] WebhookDeliveryService.deliver failed for ${subscription.id}: ${e.message}`);
            }
            return;
        }

        if (target === 'mcp-notifications') {
            if (this.mcpServers.size === 0) {
                logger.warn(`[CoalescingEngine] mcp-notifications digest dropped — no mcpServers registered: ${subscription.id}`);
                return;
            }

            for (const server of this.mcpServers) {
                try {
                    await server.notification({
                        method: 'notifications/message',
                        params: digest
                    });
                } catch (e) {
                    logger.error(`[CoalescingEngine] mcp-notifications dispatch failed for ${subscription.id} on server: ${e.message}`);
                }
            }
            return;
        }

        if (target === 'bridge-daemon' || target === 'disabled' || target === 'none') {
            // Wake daemon coalesces in-process per ADR §6.3 (out-of-process consumer).
            // disabled/none subscriptions opted out of push; heartbeat polling covers
            // them per ADR §6.5 (Heartbeat-Bypass Detection).
            return;
        }

        logger.warn(`[CoalescingEngine] Unknown harnessTarget '${target}' for ${subscription.id}; dropping digest.`);
    }

    /**
     * Dispatches a raw event envelope via the channel matching `subscription.harnessTarget`.
     * Used exclusively for the `rawDelivery` bypass.
     *
     * @protected
     * @param {Object} subscription
     * @param {Object} event
     * @returns {Promise<void>}
     */
    async _dispatchRaw(subscription, event) {
        const target = subscription.harnessTarget;

        if (target === 'a2a-webhook') {
            const subscriptionForDelivery = {
                id        : subscription.id,
                properties: {
                    harnessTargetMetadata: subscription.harnessTargetMetadata || {}
                }
            };
            try {
                await WebhookDeliveryService.deliver(subscriptionForDelivery, event);
            } catch (e) {
                logger.error(`[CoalescingEngine] WebhookDeliveryService.deliver failed for ${subscription.id} (raw): ${e.message}`);
            }
            return;
        }

        if (target === 'mcp-notifications') {
            if (this.mcpServers.size === 0) {
                logger.warn(`[CoalescingEngine] mcp-notifications raw dropped — no mcpServers registered: ${subscription.id}`);
                return;
            }

            for (const server of this.mcpServers) {
                try {
                    // Direct MCP consumers expect raw events over MCP.
                    // We deliberately bypass the `wake/digest` wire-contract here.
                    await server.notification({
                        method: 'notifications/message',
                        params: event
                    });
                } catch (e) {
                    logger.error(`[CoalescingEngine] mcp-notifications raw dispatch failed for ${subscription.id} on server: ${e.message}`);
                }
            }
            return;
        }

        if (target === 'bridge-daemon' || target === 'disabled' || target === 'none') {
            return;
        }

        logger.warn(`[CoalescingEngine] Unknown harnessTarget '${target}' for ${subscription.id}; dropping raw event.`);
    }
}

export default Neo.setupClass(CoalescingEngineService);
