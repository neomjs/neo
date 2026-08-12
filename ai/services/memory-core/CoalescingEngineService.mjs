import crypto                 from 'crypto';
import Base                   from '../../../src/core/Base.mjs';
import WebhookDeliveryService from './WebhookDeliveryService.mjs';
import logger                 from '../../mcp/server/memory-core/logger.mjs';
import {
    computeFlushDelayMs,
    computeFlushHoldMs,
    partitionMessageWakesByFreshness,
    resolveCoalesceWindowMs
} from './wakeCoalescePolicy.mjs';

const WAKE_PRIORITY_RANKS = Object.freeze({
    low   : 0,
    normal: 1,
    high  : 2
});

/**
 * @summary Token-economy throttle / coalescing engine for the cross-harness
 * autonomous wake substrate.
 *
 * Wake events MUST NOT be 1:1 with the underlying event stream at high velocity. This
 * engine batches per-subscription events within the entrypoint-injected wake-dispatch policy,
 * overridable per subscription via `harnessTargetMetadata.coalesceWindow`, and emits a single
 * **digest** payload at window-flush time. Without this throttle,
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
 * Shape B and the sunset-bound Shape C daemon consume the same pure rolling-window /
 * refractory / hard-cap policy module. This engine owns the in-process Shape A + Shape B
 * routing and only arms its refractory after a confirmed delivery.
 *
 * @class Neo.ai.services.memory-core.CoalescingEngineService
 * @extends Neo.core.Base
 * @singleton
 * @see learn/agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md §6.4
 */

/**
 * @summary Resolves an event's recency timestamp for digest `latest` selection.
 *
 * Payload-level event times win first, one wire-contract field per event type: `sentAt`
 * (mailbox events carry the message's own send time — the recency an agent reads the
 * pointer by), `grantedAt` (permission grants carry the delivery-time stamp minted in
 * WakeSubscriptionService), `lastModifiedAt` (Task transitions carry the canonical
 * transition clock). The envelope's `emittedAt` is the fallback (numeric
 * epoch or ISO string). Returns `null` when nothing is resolvable — the caller then keeps
 * the previous last-write-wins behavior, so timestamp-less events are never re-ordered
 * by guesswork.
 *
 * @see buildWakeDigest (ai/daemons/wake/wakeDigestBuilder.mjs) — the daemon-side sibling seam for
 *      per-bucket "latest" recency; string digest vs this service's structured digest envelope.
 *      Deliberately separate implementations (spawn-only daemon entrypoint vs Neo singleton) —
 *      repair one, check the other.
 *
 * @param {Object} event Wake event envelope.
 * @returns {Number|null} Epoch ms, or null when no timestamp is resolvable.
 */
function resolveEventTimestamp(event) {
    const payload = event?.payload;

    for (const field of ['sentAt', 'grantedAt', 'lastModifiedAt']) {
        const value = payload?.[field];

        if (typeof value === 'string') {
            const ts = Date.parse(value);

            if (Number.isFinite(ts)) {
                return ts
            }
        }
    }

    const emitted = event?.emittedAt;

    if (typeof emitted === 'number' && Number.isFinite(emitted)) {
        return emitted
    }

    if (typeof emitted === 'string') {
        const ts = Date.parse(emitted);

        if (Number.isFinite(ts)) {
            return ts
        }
    }

    return null
}

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
     * @member {Number|null} defaultWindowSeconds=null
     * @protected
     * @summary Entrypoint-injected coalescing window for wake-digest delivery.
     */
    defaultWindowSeconds = null

    /**
     * @member {Function|null} resolveDeliveryReadState=null
     * @protected
     * @summary Entrypoint-injected `(messageId, recipient) => {readAt?}` background read-state reader.
     *
     * FAIL-SAFE, never fail-closed. When this is null — or throws — the digest renders exactly as it
     * did before read-state existed. This is the whole swarm's wake path: a reconciliation bug that
     * SUPPRESSES wakes is strictly worse than the mislabelled count it replaces, because a wrong
     * number is visible in the wake and a missing wake is visible to nobody.
     */
    resolveDeliveryReadState = null

    /**
     * @member {Number|null} refractoryMs=null
     * @protected
     * @summary Entrypoint-injected post-delivery refractory in milliseconds.
     */
    refractoryMs = null

    /**
     * @member {Number|null} hardCapMs=null
     * @protected
     * @summary Entrypoint-injected maximum queue age in milliseconds.
     */
    hardCapMs = null

    /**
     * @member {Set<McpServer>} mcpServers
     * @protected
     */
    mcpServers = new Set()

    /**
     * Per-subscription queue + timer state.
     * Structure: `Map<subscriptionId, {queue: Object[], timer: ?TimerId, subscription: Object, firstQueuedAt: Number}>`
     * Populated lazily on first enqueue; cleared on flush.
     * @member {Map<String, Object>} coalesceState
     * @protected
     */
    coalesceState = new Map()

    /**
     * Last confirmed delivery time by subscription. Failed, skipped, and unknown outcomes never
     * arm the refractory because they do not prove that a turn-priced wake reached the seat.
     * @member {Map<String, Number>}
     * @protected
     */
    lastFlushAtBySub = new Map()

    /**
     * One active digest dispatch per subscription.
     *
     * A new event can arrive after a queue has been detached for delivery but before the
     * confirmed-delivery refractory is armed. The next flush waits on this promise so it evaluates
     * rolling/refractory/hard-cap policy against the completed outcome rather than dispatching a
     * second turn-priced wake concurrently.
     * @member {Map<String, Promise>}
     * @protected
     */
    dispatchInFlight = new Map()

    /**
     * @summary Injects the canonical AiConfig wake-dispatch leaves at the Memory Core entrypoint.
     *
     * The service deliberately does not import `AiConfig`: the Memory Core entrypoint is the
     * composition root, preventing hidden defaults from drifting across deployment topology.
     *
     * **Why the collaborator takes its OWN parameter instead of riding in `dispatchConfig`.** The
     * first argument is an `AiConfig` node — a `Neo.state.Provider` proxy, not a plain object — and
     * the caller must be able to hand it over **by reference**. Adding one more key to that bag reads
     * as harmless and forces the caller to build `{...wakeDispatch, extra}`, which is the one
     * operation the proxy cannot survive: the `get` trap resolves `override-else-inherit` up the
     * parent chain, but the `ownKeys` trap (`Provider#getTopLevelDataKeys`) enumerates **local
     * `#dataConfigs` only**. These leaves are declared on the Tier-1 root (`ai/configBase.mjs`), so
     * for the Memory Core child provider `{...wakeDispatch}` is measurably `{}` while every named
     * read still returns its number. The spread does not warn, throw, or degrade — it silently
     * substitutes an empty object, and the first symptom is a validation error naming a leaf the
     * caller can plainly see is set.
     *
     * Destructuring below is safe for exactly the same reason it is dangerous above: naming the keys
     * goes through the `get` trap. **Never add a rest element (`...rest`) to that pattern** — rest,
     * like spread, is `ownKeys`, and would reintroduce this failure from the other side.
     *
     * @param {Object} dispatchConfig The `AiConfig` wake-dispatch node. Passed by reference; never materialized.
     * @param {Number} dispatchConfig.coalesceWindowSeconds
     * @param {Number} dispatchConfig.flushRefractorySeconds
     * @param {Number} dispatchConfig.flushHardCapSeconds
     * @param {Object}          [collaborators]                          Wiring, not configuration.
     * @param {Function|null}   [collaborators.resolveDeliveryReadState] `(messageId, recipient) => {readAt?}`
     */
    configure({coalesceWindowSeconds, flushRefractorySeconds, flushHardCapSeconds} = {},
        {resolveDeliveryReadState = null} = {}
    ) {
        const values = {coalesceWindowSeconds, flushRefractorySeconds, flushHardCapSeconds};

        if (resolveDeliveryReadState !== null && typeof resolveDeliveryReadState !== 'function') {
            throw new Error("CoalescingEngineService.configure requires 'resolveDeliveryReadState' to be a function or null");
        }

        for (const [name, value] of Object.entries(values)) {
            if (!Number.isFinite(value) || value < 0) {
                throw new Error(`CoalescingEngineService.configure requires non-negative finite '${name}'`);
            }
        }
        if (flushHardCapSeconds === 0) {
            throw new Error("CoalescingEngineService.configure requires 'flushHardCapSeconds' greater than zero");
        }

        this.defaultWindowSeconds     = coalesceWindowSeconds;
        this.refractoryMs             = flushRefractorySeconds * 1000;
        this.hardCapMs                = flushHardCapSeconds * 1000;
        this.resolveDeliveryReadState = resolveDeliveryReadState;
    }

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

        this._assertConfigured();

        const now   = Date.now();
        let   state = this.coalesceState.get(subId);

        if (!state) {
            state = {queue: [], timer: null, subscription, firstQueuedAt: now};
            this.coalesceState.set(subId, state);
        } else {
            state.subscription = subscription;
        }

        state.queue.push(event);
        if (state.timer) clearTimeout(state.timer);

        const windowMs = this._resolveWindowMs(subscription);
        const delayMs  = computeFlushDelayMs({
            now,
            windowMs,
            firstQueuedAt: state.firstQueuedAt,
            lastFlushAt  : this.lastFlushAtBySub.get(subId) || 0,
            refractoryMs : this.refractoryMs,
            capMs        : this.hardCapMs
        });

        if (delayMs === 0) {
            void this._flush(subId);
            return;
        }

        state.timer = setTimeout(() => {
            void this._flush(subId);
        }, delayMs);
    }

    /**
     * Force-flush all subscriptions immediately. Used for graceful shutdown + tests.
     * @returns {Promise<void>}
     */
    async flushAll() {
        const ids = Array.from(this.coalesceState.keys());
        await Promise.all(ids.map(id => this._flush(id, {force: true})));
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
        this.lastFlushAtBySub.clear();
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
        this._assertConfigured();

        const meta = subscription.harnessTargetMetadata || {};
        return resolveCoalesceWindowMs({
            overrideSeconds: meta.coalesceWindow,
            defaultSeconds : this.defaultWindowSeconds,
            capMs          : this.hardCapMs
        });
    }

    /**
     * @summary Fails loudly when the Memory Core entrypoint did not inject canonical wake policy.
     * @protected
     */
    _assertConfigured() {
        if (![this.defaultWindowSeconds, this.refractoryMs, this.hardCapMs].every(Number.isFinite)) {
            throw new Error('CoalescingEngineService is not configured by the Memory Core entrypoint');
        }
    }

    /**
     * Timer-fire callback: build digest envelope from queued events, dispatch via the
     * subscription's `harnessTarget` routing, clear state.
     *
     * @protected
     * @param {String} subscriptionId
     * @param {Object} [options]
     * @param {Boolean} [options.force=false] Bypass the policy hold for graceful shutdown/tests.
     * @returns {Promise<void>}
     */
    async _flush(subscriptionId, {force = false} = {}) {
        const state = this.coalesceState.get(subscriptionId);
        if (!state || state.queue.length === 0) {
            this.coalesceState.delete(subscriptionId);
            return;
        }

        const activeDispatch = this.dispatchInFlight.get(subscriptionId);
        if (activeDispatch) {
            if (state.timer) {
                clearTimeout(state.timer);
                state.timer = null;
            }
            await activeDispatch;
            return this._flush(subscriptionId, {force});
        }

        const {queue, subscription, firstQueuedAt} = state;
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }

        if (!force) {
            const windowMs = this._resolveWindowMs(subscription);
            const holdMs   = computeFlushHoldMs({
                now         : Date.now(),
                windowMs,
                firstQueuedAt,
                lastFlushAt : this.lastFlushAtBySub.get(subscriptionId) || 0,
                refractoryMs: this.refractoryMs,
                capMs       : this.hardCapMs
            });

            if (holdMs > 0) {
                state.timer = setTimeout(() => {
                    void this._flush(subscriptionId);
                }, holdMs);
                return;
            }
        }

        this.coalesceState.delete(subscriptionId);

        // Canonical mailbox-age admission, applied BEFORE any digest field is derived — the Shape
        // A/B twin of the daemon's flush-time gate. A replayed GraphLog `DELIVERED_TO` edge
        // re-surfaces an old unread MESSAGE as a fresh delta; without this gate the digest counts
        // it, names it `latest`, and lets a dead lane's HIGH priority spoof an interruption — a
        // replayed lane-claim is the highest-cost shape, since it points one peer at another over
        // territory both already hold correctly. Mailbox state stays untouched — old unread mail
        // remains listable; it simply cannot manufacture live interruption urgency.
        const surviving = this._partitionExpiredMessageWakes(subscription, queue);

        if (surviving.length === 0) {
            // Every queued message event was past the admission horizon (or carried no verifiable
            // `sentAt` — fail-closed, daemon-symmetric): consume the queue WITHOUT dispatching a
            // zero-event wake. No `lastFlushAtBySub` arming — nothing was delivered, so no
            // refractory may be claimed.
            return;
        }

        const digest          = this._buildDigestEnvelope(subscription, surviving, firstQueuedAt);
        const dispatchPromise = this._dispatchDigest(subscription, digest)
            .then(outcome => {
                if (outcome === 'delivered') {
                    this.lastFlushAtBySub.set(subscriptionId, Date.now());
                }
                return outcome;
            })
            .finally(() => {
                if (this.dispatchInFlight.get(subscriptionId) === dispatchPromise) {
                    this.dispatchInFlight.delete(subscriptionId);
                }
            });

        this.dispatchInFlight.set(subscriptionId, dispatchPromise);
        await dispatchPromise;
    }

    /**
     * @summary Drops expired `wake/sent_to_me` events before ANY digest field is derived.
     *
     * Only message events are age-gated — task transitions, permission grants, and heartbeat pulses
     * carry their own clocks and contracts and pass through untouched. The partition itself is the
     * shared policy in `wakeCoalescePolicy.mjs` (one admission pass for daemon + engine, so the two
     * producers cannot drift); this wrapper only routes the mixed queue through it while preserving
     * arrival order, and emits bounded observability — count and oldest age, never mailbox content.
     *
     * Because the filter runs ahead of `_buildDigestEnvelope`, `totalEvents`, `sourceEventIds`, the
     * digest identity hash, `logId`, every bucket `count` / `latest`, and `highestPriority` all
     * describe the SAME surviving read: the preview can never name a message outside the set the
     * count describes.
     *
     * @protected
     * @param {Object}   subscription Owning cached subscription (observability only).
     * @param {Object[]} events       Raw queued wake-event envelopes, in arrival order.
     * @returns {Object[]} Surviving envelopes in arrival order (the SAME array when nothing expired).
     */
    _partitionExpiredMessageWakes(subscription, events) {
        const messageEvents = events.filter(event => event?.eventType === 'wake/sent_to_me');

        if (messageEvents.length === 0) return events;

        const {suppressed, oldestAgeMs} = partitionMessageWakesByFreshness(messageEvents);

        if (suppressed.length === 0) return events;

        logger.info(`[CoalescingEngine] Suppressed ${suppressed.length} stale/invalid message wake event(s) for ` +
            `${subscription.agentIdentity || subscription.id} at flush; oldestAgeMs=${oldestAgeMs ?? 'unknown'}.`);

        const suppressedSet = new Set(suppressed);

        return events.filter(event => !suppressedSet.has(event))
    }

    /**
     * Builds the digest envelope per ADR §6.4.2. The structured payload reports counts
     * per trigger type plus the latest-of-each for context. Wraps in the standard
     * notification envelope (schemaVersion / eventType=`wake/digest` / eventId / etc.)
     * so Shape A and Shape B consumers can dispatch with the same shape they expect for
     * single events.
     *
     * Each bucket's `latest` resolves by the truest clock its payload carries:
     * `sent_to_me` by the message's `sentAt`, `permission_granted` by the delivery-time
     * `grantedAt`, `task_state_changed` by the transition clock `lastModifiedAt` — true
     * event times, so an out-of-order queue (replay batch, restart re-walk, multi-source
     * evaluation) cannot point `latest` at a stale event while a newer one is present.
     * `heartbeat_pulse` carries no payload clock and resolves by the envelope's
     * `emittedAt` (wrap/arrival time, which tracks position under in-order arrival);
     * timestamp-less payloads keep last-write-wins. The pointer is what agents use to
     * decide whether a wake is worth acting on, so each bucket claims only the recency
     * its own wire contract can prove.
     *
     * @protected
     * @param {Object} subscription
     * @param {Object[]} events Queued event envelopes
     * @param {Number} firstQueuedAt Epoch ms when the first event in this window was enqueued
     * @returns {Object} Digest envelope
     */
    _buildDigestEnvelope(subscription, events, firstQueuedAt) {
        const breakdown = {
            sent_to_me        : {count: 0, latest: null, latestTs: null, highestPriority: 'normal'},
            task_state_changed: {count: 0, latest: null, latestTs: null},
            permission_granted: {count: 0, latest: null, latestTs: null},
            heartbeat_pulse   : {count: 0, latest: null, latestTs: null}
        };

        const bucketOf = {
            'wake/sent_to_me'        : 'sent_to_me',
            'wake/task_state_changed': 'task_state_changed',
            'wake/permission_granted': 'permission_granted',
            'wake/heartbeat_pulse'   : 'heartbeat_pulse'
        };

        for (const evt of events) {
            const bucketKey = bucketOf[evt.eventType];

            if (!bucketKey) {
                continue
            }

            // Read-state reconciliation, `sent_to_me` only — the other buckets carry no mailbox row
            // and therefore have no read-state to reconcile against.
            //
            // FAIL-SAFE at every branch. No resolver, no messageId, a resolver that throws, or a
            // resolver returning `{}` (graph unavailable) all mean UNKNOWN, and unknown renders the
            // event exactly as before. Only a committed `readAt` suppresses one. Suppressing on
            // uncertainty would turn a mislabelled count into a missing wake, and a missing wake is
            // visible to nobody.
            let unopenable = false;

            if (bucketKey === 'sent_to_me' && this.resolveDeliveryReadState) {
                const messageId = evt.payload?.messageId;

                if (messageId && subscription.agentIdentity) {
                    let state = null;

                    try {
                        state = this.resolveDeliveryReadState(messageId, subscription.agentIdentity)
                    } catch (error) {
                        logger.warn?.(`[CoalescingEngine] read-state lookup failed for ${messageId}; rendering as unread: ${error.message}`)
                    }

                    if (state?.readAt) {
                        continue
                    }

                    // `missing` is NOT `{}`. The resolver reports it only after establishing that no
                    // MESSAGE row exists — a positive finding, not an absence of information. The
                    // event still counts (something was queued, and hiding that is the suppression
                    // failure mode), but it must never become `latest`: a `latest` is a pointer the
                    // recipient is invited to open, and naming one that cannot be opened sends them
                    // hunting for a message that is not there. That is AC-6.
                    unopenable = state?.missing === true
                }
            }

            const bucket = breakdown[bucketKey];

            bucket.count++;

            const ts = resolveEventTimestamp(evt);

            // Recency wins over position; a timestamp-less candidate keeps last-write-wins. An
            // unopenable event is disqualified from the pointer only — it has already been counted.
            if (!unopenable && (bucket.latest === null || ts === null || ts >= bucket.latestTs)) {
                bucket.latest   = evt.payload;
                bucket.latestTs = ts ?? bucket.latestTs;
            }

            if (bucketKey === 'sent_to_me') {
                const priority = Object.hasOwn(WAKE_PRIORITY_RANKS, evt.payload?.priority)
                    ? evt.payload.priority
                    : 'normal';

                if (WAKE_PRIORITY_RANKS[priority] > WAKE_PRIORITY_RANKS[bucket.highestPriority]) {
                    bucket.highestPriority = priority;
                }
            }
        }

        const emittedAt      = new Date();
        const sourceEventIds = events.map(event => this._getSourceEventId(event));
        const eventId        = `wake-digest:${crypto
            .createHash('sha256')
            .update(JSON.stringify([subscription.id, sourceEventIds]))
            .digest('hex')}`;

        return {
            schemaVersion : '1.0',
            eventType     : 'wake/digest',
            eventId,
            logId         : events[events.length - 1]?.logId,
            agentIdentity : subscription.agentIdentity,
            subscriptionId: subscription.id,
            payload       : {
                totalEvents: events.length,
                breakdown,
                sourceEventIds,
                windowMs   : Number.isFinite(firstQueuedAt) ? emittedAt.getTime() - firstQueuedAt : 0
            },
            emittedAt: emittedAt.toISOString()
        };
    }

    /**
     * @summary Resolves the stable source identity used for digest retry/dedupe.
     *
     * Typed GraphLog rows already expose `sourceEventId`; mailbox and heartbeat events expose
     * their canonical domain ids in payload. The generated envelope id is the final fallback.
     *
     * @param {Object} event Wake event envelope.
     * @returns {String}
     * @protected
     */
    _getSourceEventId(event) {
        const payload = event?.payload || {};

        return String(
            event?.sourceEventId
            || payload.messageId
            || payload.taskId
            || payload.permissionId
            || payload.pulseId
            || event?.eventId
            || 'unknown'
        );
    }

    /**
     * Dispatches the digest envelope via the channel matching `subscription.harnessTarget`.
     *
     * @protected
     * @param {Object} subscription
     * @param {Object} digest Envelope produced by `_buildDigestEnvelope`
     * @returns {Promise<'delivered'|'skipped'|'failed'>}
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
                return await WebhookDeliveryService.deliver(subscriptionForDelivery, digest);
            } catch (e) {
                logger.error(`[CoalescingEngine] WebhookDeliveryService.deliver failed for ${subscription.id}: ${e.message}`);
                return 'failed';
            }
        }

        if (target === 'mcp-notifications') {
            if (this.mcpServers.size === 0) {
                logger.warn(`[CoalescingEngine] mcp-notifications digest dropped — no mcpServers registered: ${subscription.id}`);
                return 'skipped';
            }

            let delivered = false;
            for (const server of this.mcpServers) {
                try {
                    await server.notification({
                        method: 'notifications/message',
                        params: digest
                    });
                    delivered = true;
                } catch (e) {
                    logger.error(`[CoalescingEngine] mcp-notifications dispatch failed for ${subscription.id} on server: ${e.message}`);
                }
            }
            return delivered ? 'delivered' : 'failed';
        }

        if (target === 'bridge-daemon' || target === 'disabled' || target === 'none') {
            // Wake daemon coalesces in-process per ADR §6.3 (out-of-process consumer).
            // disabled/none subscriptions opted out of push; heartbeat polling covers
            // them per ADR §6.5 (Heartbeat-Bypass Detection).
            return 'skipped';
        }

        logger.warn(`[CoalescingEngine] Unknown harnessTarget '${target}' for ${subscription.id}; dropping digest.`);
        return 'skipped';
    }

    /**
     * Dispatches a raw event envelope via the channel matching `subscription.harnessTarget`.
     * Used exclusively for the `rawDelivery` bypass.
     *
     * @protected
     * @param {Object} subscription
     * @param {Object} event
     * @returns {Promise<'delivered'|'skipped'|'failed'>}
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
                return await WebhookDeliveryService.deliver(subscriptionForDelivery, event);
            } catch (e) {
                logger.error(`[CoalescingEngine] WebhookDeliveryService.deliver failed for ${subscription.id} (raw): ${e.message}`);
                return 'failed';
            }
        }

        if (target === 'mcp-notifications') {
            if (this.mcpServers.size === 0) {
                logger.warn(`[CoalescingEngine] mcp-notifications raw dropped — no mcpServers registered: ${subscription.id}`);
                return 'skipped';
            }

            let delivered = false;
            for (const server of this.mcpServers) {
                try {
                    // Direct MCP consumers expect raw events over MCP.
                    // We deliberately bypass the `wake/digest` wire-contract here.
                    await server.notification({
                        method: 'notifications/message',
                        params: event
                    });
                    delivered = true;
                } catch (e) {
                    logger.error(`[CoalescingEngine] mcp-notifications raw dispatch failed for ${subscription.id} on server: ${e.message}`);
                }
            }
            return delivered ? 'delivered' : 'failed';
        }

        if (target === 'bridge-daemon' || target === 'disabled' || target === 'none') {
            return 'skipped';
        }

        logger.warn(`[CoalescingEngine] Unknown harnessTarget '${target}' for ${subscription.id}; dropping raw event.`);
        return 'skipped';
    }
}

export default Neo.setupClass(CoalescingEngineService);
