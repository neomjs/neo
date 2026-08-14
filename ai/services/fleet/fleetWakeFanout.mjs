/**
 * @module ai/services/fleet/fleetWakeFanout
 * @summary SSE fan-out registry + relay-subscription self-arming for the composed fleet
 * server's wake push lane.
 *
 * **Push for latency, poll for truth.** This module owns the latency half's server side: it
 * keeps the identity-keyed registry of connected SSE streams, routes one verified wake digest
 * to exactly the streams authenticated as that digest's subscription identity, and self-arms
 * the relay wake subscription over the authenticated MC surface at boot. The truth half is the
 * shipped `poll-digest` verb consumed by the client on every reconnect — a dropped
 * stream loses nothing durable, so this fan-out deliberately owns NO replay state.
 *
 * **Identity isolation is structural.** Streams register under the viewer identity the fleet
 * app's admission chain proved; digests route by the subscription's `agentIdentity` recorded at
 * arming time. A digest for identity A can never reach identity B's stream because the lookup
 * key IS the identity — there is no broadcast path. (The fleet server is single-viewer today —
 * the boot-resolved viewer, `planeMailboxClient`'s proven-subject invariant; the registry is
 * identity-keyed anyway so the S5 viewer-scoping leg widens it without reshaping.)
 *
 * **Key custody (process-bearer class).** `subscribe` is idempotent and returns the
 * server-issued signing key only on fresh mint, so arming always finishes with `rotate-key`:
 * the key this process holds is minted for this process lifetime, lives in memory only, and a
 * restart re-arms with a fresh key. Nothing persists a secret.
 *
 * **Honest absence.** No dialable self-address (`fleet.wakeSelfBase` empty) or no plane client
 * means the push lane is NOT armed — `describeState()` carries the reason, and the SSE `state`
 * event says so. Absence of signal, never a verdict — the tier-degradation presence contract.
 */

const
    HEARTBEAT_COMMENT  = ':hb\n\n',
    MAX_BUFFERED_BYTES = 256 * 1024;

/**
 * @summary Creates the fan-out registry.
 * @param {Object} [options]
 * @param {Object} [options.logger=console]
 * @param {Number} [options.heartbeatMs=25000] SSE keep-alive comment cadence; bounds proxy
 *     idle-timeout kills without pretending to be a liveness proof.
 * @param {Number} [options.maxStreamsPerIdentity=8] Concurrent open streams one viewer may
 *     hold (tabs, reconnect races); the excess is refused with its reason, not queued.
 * @param {Number} [options.maxStreamsTotal=64] Process-wide held-connection ceiling — the
 *     resource bound a request-rate limiter cannot express.
 * @param {Function} [options.now=Date.now] Injection seam for observational timestamps.
 * @returns {Object} The fan-out surface consumed by the fleet server boot entry.
 */
export function createFleetWakeFanout({
    logger               = console,
    heartbeatMs          = 25000,
    maxStreamsPerIdentity = 8,
    maxStreamsTotal      = 64,
    now                  = Date.now
} = {}) {
    const
        streamsByIdentity = new Map(), // identity -> Set<res>
        routes            = new Map(); // subscriptionId -> {signingKey, agentIdentity}

    let
        armed        = false,
        armReason    = 'not-armed: arming has not run',
        disposed     = false,
        lastPushAt   = null,
        totalStreams = 0,
        heartbeatRef = null;

    const
        cleanupByStream  = new Map(), // res -> idempotent cleanup fn
        armingByIdentity = new Map(); // identity -> in-flight arming mutation promise

    /**
     * One faulty consumer must never take the lane down: a throwing write or a consumer whose
     * kernel buffer has grown past the bound is EVICTED — its response destroyed, its slot
     * freed — and delivery continues to the remaining healthy streams. The bound is what makes
     * backpressure finite: SSE has no per-client replay (poll-digest is the catch-up), so
     * buffering an unread client indefinitely would trade one slow consumer for process memory.
     */
    function safeWrite(res, chunk) {
        try {
            if ((res.writableLength ?? 0) > MAX_BUFFERED_BYTES) {
                evictStream(res);
                return false
            }

            res.write(chunk);
            return true
        } catch {
            evictStream(res);
            return false
        }
    }

    function evictStream(res) {
        const cleanup = cleanupByStream.get(res);

        cleanup?.();

        try {
            res.destroy?.()
        } catch {/* eviction is best-effort teardown of an already-faulty stream */}
    }

    function ensureHeartbeat() {
        if (heartbeatRef || heartbeatMs <= 0) return;

        heartbeatRef = setInterval(() => {
            for (const streams of streamsByIdentity.values()) {
                for (const res of [...streams]) {
                    safeWrite(res, HEARTBEAT_COMMENT)
                }
            }
        }, heartbeatMs);

        // A registry with zero streams must never hold the process open.
        heartbeatRef.unref?.()
    }

    function writeEvent(res, event, payload) {
        return safeWrite(res, `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    }

    return {
        /**
         * @summary Registers one authenticated SSE stream and takes over the response for its
         * lifetime — unless a held-connection cap refuses it, in which case NOTHING is written
         * and the caller answers the refusal on the still-untouched response. The caller has
         * already proven `identity` through the fleet admission chain.
         * @param {String} identity Viewer identity the admission chain proved.
         * @param {Object} res Node `ServerResponse`-shaped writable to convert to SSE.
         * @returns {Object} `{accepted: true}`, or `{accepted: false, reason}` with the cap named.
         */
        registerStream(identity, res) {
            // Disposal is a closed epoch: a handler that awaited across the shutdown boundary
            // must not hand this registry a response the sweep can never end again.
            if (disposed) {
                return {accepted: false, reason: 'stream registry disposed'}
            }

            const existing = streamsByIdentity.get(identity);

            if (totalStreams >= maxStreamsTotal) {
                return {accepted: false, reason: 'stream cap reached (total)'}
            }

            if ((existing?.size ?? 0) >= maxStreamsPerIdentity) {
                return {accepted: false, reason: 'stream cap reached (per viewer)'}
            }

            // The whole handshake must land before the stream is registered: a socket that
            // faults or is already past the backpressure bound during these writes is refused
            // (and destroyed by the eviction path) WITHOUT ever entering the registry — a
            // dead-at-birth stream must not hold a cap slot until a close event that may never
            // fire on it.
            try {
                res.writeHead(200, {
                    'content-type'     : 'text/event-stream',
                    'cache-control'    : 'no-cache, no-transform',
                    connection         : 'keep-alive',
                    'x-accel-buffering': 'no'
                })
            } catch {
                return {accepted: false, reason: 'stream rejected at handshake'}
            }

            if (!safeWrite(res, 'retry: 5000\n\n') ||
                !writeEvent(res, 'state', this.describeStateFor(identity))
            ) {
                return {accepted: false, reason: 'stream rejected at handshake'}
            }

            let streams = existing;

            if (!streams) {
                streams = new Set();
                streamsByIdentity.set(identity, streams)
            }

            streams.add(res);
            totalStreams++;
            ensureHeartbeat();

            // ONE idempotent cleanup shared by every exit — client close, socket error, cap
            // eviction, shutdown disposal — so no path can double-decrement or leak a slot.
            const cleanup = () => {
                if (streams.delete(res)) {
                    totalStreams--
                }

                if (streams.size === 0) {
                    streamsByIdentity.delete(identity)
                }

                cleanupByStream.delete(res)
            };

            cleanupByStream.set(res, cleanup);
            res.on('close', cleanup);
            res.on('error', cleanup);

            return {accepted: true}
        },

        /**
         * @summary Route table read for the wake receiver — in-memory only, armed keys never
         * persist.
         * @param {String} subscriptionId
         * @returns {Object|null} `{signingKey, agentIdentity}` or null.
         */
        resolveRoute(subscriptionId) {
            return routes.get(subscriptionId) ?? null
        },

        /**
         * @summary Delivers one verified digest to the streams of exactly its subscription's
         * identity. No streams connected is a normal state, not a failure — derive-at-read
         * covers the gap on the client's next poll.
         * @param {Object} data
         * @param {String} data.subscriptionId
         * @param {String} data.agentIdentity
         * @param {Object} data.envelope Verified digest payload.
         */
        handleDigest({subscriptionId, agentIdentity, envelope}) {
            lastPushAt = now();

            const streams = streamsByIdentity.get(agentIdentity);

            if (!streams || streams.size === 0) return;

            // A snapshot copy: an eviction mutates the live Set mid-loop, and a faulty first
            // stream must never cost the healthy second its delivery.
            for (const res of [...streams]) {
                writeEvent(res, 'wake', {subscriptionId, envelope})
            }
        },

        /**
         * @summary Self-arms the relay wake subscription for the boot viewer over the
         * authenticated MC surface: idempotent `subscribe` (route tuple: Shape-B webhook at
         * `<wakeSelfBase>/wake`) followed by `rotate-key`, whose returned key becomes this
         * process's in-memory route entry. Every refusal path returns `{armed: false, reason}`
         * instead of throwing — an unarmed push lane is a rendered state, not a boot failure.
         * @param {Object} options
         * @param {String} options.identity The boot-resolved viewer identity (route owner).
         * @param {String} options.wakeSelfBase `AiConfig.fleet.wakeSelfBase`, read by the entry.
         * @param {Function|null} options.callTool `planeMailboxClient`-shaped
         *     `(name, args) => result` against the plane MC surface, or null when no plane
         *     client is bound.
         * @param {String} [options.trigger='SENT_TO_ME']
         * @returns {Promise<Object>} `{armed: Boolean, reason: String, subscriptionId?}`
         */
        async armRelaySubscription({identity, wakeSelfBase, callTool, trigger = 'SENT_TO_ME'}) {
            if (disposed) {
                return {armed: false, reason: 'not-armed: fan-out disposed'}
            }

            if (typeof wakeSelfBase !== 'string' || wakeSelfBase.trim().length === 0) {
                armed     = false;
                armReason = 'not-armed: fleet.wakeSelfBase undeclared';
                return {armed, reason: armReason}
            }

            if (typeof callTool !== 'function') {
                armed     = false;
                armReason = 'not-armed: no authenticated plane client';
                return {armed, reason: armReason}
            }

            // The WHOLE mutation — subscribe → rotate-key → route install — is serialized per
            // identity: two racing callers (boot arming and the first SSE connect are the
            // measured pair) would otherwise run two rotations, leaving MC on the second key
            // while this registry holds the first — every subsequent signed delivery then
            // fails verification. One in-flight promise per identity; concurrent callers share
            // its outcome, and the latch clears on settle so a FAILED arming stays retryable.
            const inFlight = armingByIdentity.get(identity);

            if (inFlight) return inFlight;

            const mutation = this._armRelaySubscription({identity, wakeSelfBase, callTool, trigger})
                .finally(() => armingByIdentity.delete(identity));

            armingByIdentity.set(identity, mutation);
            return mutation
        },

        /**
         * @summary The unserialized arming mutation — reach it only through
         * {@link armRelaySubscription}'s per-identity latch.
         * @param {Object} options See {@link armRelaySubscription}.
         * @returns {Promise<Object>} `{armed, reason, subscriptionId?}`
         * @private
         */
        async _armRelaySubscription({identity, wakeSelfBase, callTool, trigger}) {

            let url;

            try {
                url          = new URL(wakeSelfBase);
                url.pathname = '/wake';
                url.search   = '';
                url.hash     = ''
            } catch {
                armed     = false;
                armReason = 'not-armed: fleet.wakeSelfBase is not a valid URL';
                return {armed, reason: armReason}
            }

            try {
                const subscribed = await callTool('manage_wake_subscription', {
                    action               : 'subscribe',
                    trigger,
                    harnessTarget        : 'a2a-webhook',
                    harnessTargetMetadata: {adapter: 'a2a-webhook', url: url.href}
                });

                const subscriptionId = subscribed?.subscriptionId;

                if (!subscriptionId) {
                    armed     = false;
                    armReason = 'not-armed: subscribe returned no subscriptionId';
                    return {armed, reason: armReason}
                }

                // Idempotent reuse returns no key, and a key from a previous process life is
                // gone with that process — rotation is therefore unconditional, and the one
                // sanctioned rotation door (`rotate-key`) makes this restart-safe by design.
                const rotated = await callTool('manage_wake_subscription', {
                    action: 'rotate-key',
                    subscriptionId
                });

                if (typeof rotated?.signingKey !== 'string' || rotated.signingKey.length === 0) {
                    armed     = false;
                    armReason = 'not-armed: rotate-key returned no signing key';
                    return {armed, reason: armReason}
                }

                // The epoch re-check AFTER the awaits is the load-bearing one: a delayed
                // subscribe/rotate must never resurrect a route into a disposed registry — the
                // mutation that crossed the shutdown boundary ends unarmed, not undead.
                if (disposed) {
                    armed     = false;
                    armReason = 'not-armed: fan-out disposed';
                    return {armed, reason: armReason}
                }

                routes.set(subscriptionId, {signingKey: rotated.signingKey, agentIdentity: identity});

                armed     = true;
                armReason = 'armed';

                return {armed, reason: armReason, subscriptionId}
            } catch (error) {
                armed     = false;
                armReason = 'not-armed: relay subscription arming failed';
                logger.error?.(`[FleetWakeFanout] arming failed: ${error?.message ?? error}`);
                return {armed, reason: armReason}
            }
        },

        /**
         * @summary Observational state for the wake-routes axis — absence carries its reason,
         * never a verdict.
         * @returns {Object} `{armed, reason, lastPushAt, connectedIdentities}`
         */
        describeState() {
            return {
                armed,
                reason             : armReason,
                lastPushAt,
                connectedIdentities: streamsByIdentity.size
            }
        },

        /**
         * @summary Per-viewer honest state for the SSE `state` event: arming is caller-owned
         * on the MC side, so the push lane can be armed for the relay viewer while a different
         * authenticated viewer's stream truthfully reports it is not armed FOR THEM — their
         * truth lane is poll-digest either way.
         * @param {String} identity
         * @returns {Object} `describeState()` plus `{armedForViewer: Boolean}`
         */
        describeStateFor(identity) {
            let
                armedForViewer = false,
                subscriptionId = null;

            // The routes map is keyed by subscription id, so the armed viewer's own key IS the
            // id this frame vouches. Carrying it lets a stream consumer run poll-digest catch-up
            // from a COLD start — before any live wake has taught it which subscription the
            // stream serves — instead of silently skipping pending wakes until one arrives.
            for (const [routeSubscriptionId, route] of routes) {
                if (route.agentIdentity === identity) {
                    armedForViewer = true;
                    subscriptionId = routeSubscriptionId;
                    break
                }
            }

            return {
                ...this.describeState(),
                armedForViewer,
                ...(subscriptionId ? {subscriptionId} : {})
            }
        },

        /**
         * @summary Shutdown/test hook: stops the heartbeat and ENDS every held SSE response —
         * a held stream would otherwise keep `server.close()` waiting forever — then forgets
         * all streams and routes.
         */
        dispose() {
            // The epoch closes FIRST, synchronously: everything still in flight — a delayed
            // arming mutation, an awaited connect handler — resolves into refusals from this
            // instant, so the sweep below is the LAST one this registry ever needs.
            disposed  = true;
            armed     = false;
            armReason = 'not-armed: fan-out disposed';

            if (heartbeatRef) {
                clearInterval(heartbeatRef);
                heartbeatRef = null
            }

            for (const streams of streamsByIdentity.values()) {
                for (const res of [...streams]) {
                    try {
                        res.end()
                    } catch {/* a stream that cannot end cleanly is destroyed below */}

                    try {
                        res.destroy?.()
                    } catch {/* best-effort */}
                }
            }

            streamsByIdentity.clear();
            cleanupByStream.clear();
            routes.clear();
            totalStreams = 0
        }
    }
}
