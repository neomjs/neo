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

const HEARTBEAT_COMMENT = ':hb\n\n';

/**
 * @summary Creates the fan-out registry.
 * @param {Object} [options]
 * @param {Object} [options.logger=console]
 * @param {Number} [options.heartbeatMs=25000] SSE keep-alive comment cadence; bounds proxy
 *     idle-timeout kills without pretending to be a liveness proof.
 * @param {Function} [options.now=Date.now] Injection seam for observational timestamps.
 * @returns {Object} The fan-out surface consumed by the fleet server boot entry.
 */
export function createFleetWakeFanout({logger = console, heartbeatMs = 25000, now = Date.now} = {}) {
    const
        streamsByIdentity = new Map(), // identity -> Set<res>
        routes            = new Map(); // subscriptionId -> {signingKey, agentIdentity}

    let
        armed        = false,
        armReason    = 'not-armed: arming has not run',
        lastPushAt   = null,
        heartbeatRef = null;

    function ensureHeartbeat() {
        if (heartbeatRef || heartbeatMs <= 0) return;

        heartbeatRef = setInterval(() => {
            for (const streams of streamsByIdentity.values()) {
                for (const res of streams) {
                    res.write(HEARTBEAT_COMMENT)
                }
            }
        }, heartbeatMs);

        // A registry with zero streams must never hold the process open.
        heartbeatRef.unref?.()
    }

    function writeEvent(res, event, payload) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    }

    return {
        /**
         * @summary Registers one authenticated SSE stream and takes over the response for its
         * lifetime. The caller has already proven `identity` through the fleet admission chain.
         * @param {String} identity Viewer identity the admission chain proved.
         * @param {Object} res Node `ServerResponse`-shaped writable to convert to SSE.
         */
        registerStream(identity, res) {
            res.writeHead(200, {
                'content-type'     : 'text/event-stream',
                'cache-control'    : 'no-cache, no-transform',
                connection         : 'keep-alive',
                'x-accel-buffering': 'no'
            });

            res.write('retry: 5000\n\n');
            writeEvent(res, 'state', this.describeStateFor(identity));

            let streams = streamsByIdentity.get(identity);

            if (!streams) {
                streams = new Set();
                streamsByIdentity.set(identity, streams)
            }

            streams.add(res);
            ensureHeartbeat();

            res.on('close', () => {
                streams.delete(res);

                if (streams.size === 0) {
                    streamsByIdentity.delete(identity)
                }
            })
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

            for (const res of streams) {
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
            let armedForViewer = false;

            for (const route of routes.values()) {
                if (route.agentIdentity === identity) {
                    armedForViewer = true;
                    break
                }
            }

            return {...this.describeState(), armedForViewer}
        },

        /**
         * @summary Test/shutdown hook: stops the heartbeat and forgets all streams and routes.
         */
        dispose() {
            if (heartbeatRef) {
                clearInterval(heartbeatRef);
                heartbeatRef = null
            }

            streamsByIdentity.clear();
            routes.clear()
        }
    }
}
