/**
 * @module ai/services/fleet/fleetWakeSseConsumer
 * @summary The relay-side consumer of the composed fleet-server's wake stream — the plane
 * vouching surface the delivery-liveness axis has been honestly waiting for.
 *
 * The transitional cockpit cannot present fleet-surface admission itself, so THIS process (the
 * relay, which already authenticates to the plane) opens the fetch-streaming connection to
 * `<planeBase>/fleet/events`, observes the per-viewer `state` event and `wake` frames, and
 * derives an OBSERVATION the wake-routes axis renders through the existing pipeline:
 *
 * - Stream open + a `state` frame ⇒ the push lane is observed alive, with the server's own
 *   per-viewer arming answer carried verbatim in the reason.
 * - Stream down ⇒ honestly `unknown` with the disconnect reason and the staleness horizon —
 *   absence of signal, never a fabricated verdict (a dead stream does not prove dead delivery;
 *   poll remains the truth lane).
 *
 * Catch-up rides `poll-digest` on every reconnect once a subscription id is known, with the
 * client-held watermark — a dropped stream loses nothing durable, and the observation carries
 * how much was pending at reconnect. Reconnects respect the server's `retry:` hint as a floor.
 *
 * One credential, deliberately: the connection presents the relay's own fleet-admission bearer
 * and nothing else. No second header is synthesized from it — the composed server refuses
 * byte-identical pairs by design, and the boot-armed shared viewer identity means listening is
 * sufficient in the transitional topology.
 */

const
    DEFAULT_RETRY_FLOOR_MS = 5000,
    MAX_BACKOFF_MS         = 60_000,
    STALE_AFTER_MS         = 90_000;

/**
 * @summary Parses complete `text/event-stream` frames out of an accumulating buffer.
 * @param {String} buffer
 * @returns {Object} `{frames: [{event, data, retry}], rest}` — `rest` is the trailing partial.
 * @private
 */
export function parseSseFrames(buffer) {
    const
        frames = [],
        parts  = buffer.split('\n\n'),
        rest   = parts.pop();

    for (const part of parts) {
        const frame = {event: 'message', data: null, retry: null};

        for (const line of part.split('\n')) {
            if (line.startsWith(':')) continue;

            if (line.startsWith('event: ')) {
                frame.event = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
                frame.data = frame.data === null ? line.slice(6) : `${frame.data}\n${line.slice(6)}`
            } else if (line.startsWith('retry: ')) {
                const value = Number(line.slice(7).trim());

                if (Number.isFinite(value) && value > 0) {
                    frame.retry = value
                }
            }
        }

        frames.push(frame)
    }

    return {frames, rest}
}

/**
 * @summary Creates the wake-stream consumer. Passive until `start()`; every failure path is an
 * observation, never a throw — the axis this feeds renders reasons, not stack traces.
 * @param {Object} options
 * @param {String} options.eventsUrl Absolute URL of the composed server's SSE endpoint.
 * @param {String} [options.credential=''] The relay's fleet-admission bearer.
 * @param {Function} [options.pollDigest] `({subscriptionId, sinceLogId}) => result` seam for
 *     reconnect catch-up (the plane client's `manage_wake_subscription poll-digest` action);
 *     absent means catch-up is skipped and the observation says so.
 * @param {Function} [options.fetchImpl] Injection seam; defaults to global `fetch`.
 * @param {Function} [options.now=Date.now]
 * @param {Object} [options.logger=console]
 * @param {Number} [options.retryFloorMs=5000] Initial reconnect floor; a server `retry:` hint
 *     can only raise it (tests inject a small floor, production keeps the default).
 * @returns {Object} `{start, stop, resolveDeliveryLiveness, describe}`
 */
export function createFleetWakeSseConsumer({
    eventsUrl,
    credential           = '',
    pollDigest           = null,
    fetchImpl            = null,
    now                  = Date.now,
    logger               = console,
    retryFloorMs: initialRetryFloorMs = DEFAULT_RETRY_FLOOR_MS
}) {
    if (typeof eventsUrl !== 'string' || eventsUrl.trim().length === 0) {
        throw new Error('createFleetWakeSseConsumer requires an eventsUrl')
    }

    const doFetch = fetchImpl ?? ((...args) => fetch(...args));

    let
        stopped            = true,
        connected          = false,
        connectionEpoch    = 0,
        retryFloorMs       = initialRetryFloorMs,
        consecutiveDrops   = 0,
        lastFrameAt        = null,
        lastWakeAt         = null,
        lastState          = null,
        lastDisconnect     = 'not started',
        subscriptionId     = null,
        watermark          = 0,
        pendingAtReconnect = null,
        abortController    = null;

    function observeFrame(frame) {
        lastFrameAt = now();

        if (frame.retry) {
            retryFloorMs = Math.max(frame.retry, initialRetryFloorMs)
        }

        if (frame.data === null) return;

        let payload;

        try {
            payload = JSON.parse(frame.data)
        } catch {
            return // a malformed frame is dropped; the stream's liveness is already recorded
        }

        if (frame.event === 'state') {
            lastState = payload
        } else if (frame.event === 'wake') {
            lastWakeAt     = now();
            subscriptionId = payload.subscriptionId ?? subscriptionId;

            const logId = payload.envelope?.payload?.watermark ?? payload.envelope?.logId;

            if (Number.isFinite(logId) && logId > watermark) {
                watermark = logId
            }
        }
    }

    async function catchUp() {
        if (!pollDigest || !subscriptionId) {
            pendingAtReconnect = null;
            return
        }

        try {
            const result = await pollDigest({subscriptionId, sinceLogId: watermark});

            pendingAtReconnect = result?.counts?.pending ?? result?.pending ?? 0;

            if (Number.isFinite(result?.watermark) && result.watermark > watermark) {
                watermark = result.watermark
            }
        } catch (error) {
            pendingAtReconnect = null;
            logger.warn?.(`[FleetWakeSseConsumer] reconnect catch-up failed: ${error?.message ?? error}`)
        }
    }

    async function connectOnce(epoch) {
        abortController = new AbortController();

        const response = await doFetch(eventsUrl, {
            headers: {
                accept: 'text/event-stream',
                ...(credential ? {authorization: `Bearer ${credential}`} : {})
            },
            signal: abortController.signal
        });

        if (!response.ok || !response.body) {
            lastDisconnect = `stream refused: HTTP ${response.status}`;
            return
        }

        // A (re)connect is the catch-up moment: everything the dropped stream missed is
        // derivable at read time — push is latency, poll is truth.
        await catchUp();

        connected        = true;
        consecutiveDrops = 0;
        lastFrameAt      = now();

        const reader = response.body.getReader();

        let buffer = '';

        try {
            for (;;) {
                const {value, done} = await reader.read();

                if (done || stopped || epoch !== connectionEpoch) break;

                buffer = ((buffer + Buffer.from(value).toString('utf8')));

                const {frames, rest} = parseSseFrames(buffer);

                buffer = rest;
                frames.forEach(observeFrame)
            }

            lastDisconnect = 'stream ended'
        } catch (error) {
            lastDisconnect = `stream error: ${error?.message ?? error}`
        } finally {
            connected = false;

            try {
                await reader.cancel()
            } catch {/* teardown of a dead reader is best-effort */}
        }
    }

    async function runLoop(epoch) {
        while (!stopped && epoch === connectionEpoch) {
            try {
                await connectOnce(epoch)
            } catch (error) {
                connected      = false;
                lastDisconnect = `connect failed: ${error?.message ?? error}`
            }

            if (stopped || epoch !== connectionEpoch) return;

            consecutiveDrops++;

            // The server's retry hint is the floor; drops back off exponentially under a cap so
            // a dead endpoint costs a bounded trickle, never a tight loop.
            const backoff = Math.min(retryFloorMs * Math.max(1, 2 ** (consecutiveDrops - 1)), MAX_BACKOFF_MS);

            await new Promise(resolve => {
                const timer = setTimeout(resolve, backoff);
                timer.unref?.()
            })
        }
    }

    return {
        /**
         * @summary Opens the stream and keeps it open until `stop()`. Idempotent.
         */
        start() {
            if (!stopped) return;

            stopped = false;
            connectionEpoch++;

            runLoop(connectionEpoch).catch(error => {
                logger.error?.(`[FleetWakeSseConsumer] loop crashed: ${error?.message ?? error}`)
            })
        },

        /**
         * @summary Closes the stream and stops reconnecting. Idempotent.
         */
        stop() {
            stopped = true;
            connectionEpoch++;
            connected = false;

            try {
                abortController?.abort()
            } catch {/* aborting an already-settled fetch is a no-op */}
        },

        /**
         * @summary The delivery-liveness observation for the wake-routes axis — the shape
         * `fleetWakeRoutesSource` documents for `resolveDeliveryLiveness`. Absence carries its
         * reason; a dead stream renders `unknown`, never a fabricated `false` about delivery
         * itself.
         * @returns {Object} `{alive: Boolean|'unknown', reason: String}`
         */
        resolveDeliveryLiveness() {
            if (stopped) {
                return {alive: 'unknown', reason: 'wake stream consumer not running'}
            }

            if (connected) {
                const
                    age   = lastFrameAt === null ? null : now() - lastFrameAt,
                    stale = age !== null && age > STALE_AFTER_MS;

                if (stale) {
                    return {
                        alive : 'unknown',
                        reason: `wake stream silent for ${Math.round(age / 1000)}s — liveness unconfirmed`
                    }
                }

                const armedNote = lastState
                    ? (lastState.armedForViewer ? 'armed for this viewer' : `not armed for this viewer (${lastState.reason ?? 'no reason carried'})`)
                    : 'state event pending';

                const pendingNote = pendingAtReconnect ? ` · ${pendingAtReconnect} pending caught up at reconnect` : '';

                return {alive: true, reason: `composed wake stream connected · ${armedNote}${pendingNote}`}
            }

            return {
                alive : 'unknown',
                reason: `wake stream disconnected (${lastDisconnect}) — poll remains the truth lane`
            }
        },

        /**
         * @summary Full observational snapshot for diagnostics and specs.
         * @returns {Object}
         */
        describe() {
            return {
                connected,
                lastFrameAt,
                lastWakeAt,
                lastState,
                lastDisconnect,
                subscriptionId,
                watermark,
                pendingAtReconnect,
                consecutiveDrops,
                retryFloorMs
            }
        }
    }
}
