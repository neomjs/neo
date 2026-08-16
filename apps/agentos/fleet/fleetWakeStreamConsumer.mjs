/**
 * @module apps/agentos/fleet/fleetWakeStreamConsumer
 * @summary The browser-direct consumer of the composed fleet-server's wake stream — the App-Worker
 * twin of the relay-side consumer (`ai/services/fleet/fleetWakeSseConsumer.mjs`). The realm
 * boundary carries no imports, so the frame parser is duplicated by construction and the parity
 * spec is the binding.
 *
 * Where the relay deliberately presents ONE credential (its plane-admission bearer — the
 * transitional topology's boot-armed shared viewer makes listening sufficient), the browser-direct
 * path is the PER-VIEWER shape: class-1 Fleet admission on `Authorization`, and the viewer's
 * class-3 MC mint on `x-neo-mc-authorization` arming the per-viewer subscription. Neither
 * credential enters this module: the injected `authHeaders` function is built inside the registry
 * bridge's closure (`installFleetBridge.mjs`, `openWakeStream`), so the pane holds a CAPABILITY
 * and the mints stay in transport custody — the same Option-D discipline the connection-profile
 * contract enforces for records (`./connectionProfiles.mjs`).
 *
 * Observation semantics are the relay's, verbatim: a stream open with a `state` frame is the push
 * lane observed alive, carrying the server's own per-viewer arming answer; a dead stream is
 * honestly `unknown` with the disconnect reason — absence of signal, never a fabricated verdict.
 * Catch-up rides `poll-digest` once per connection from the handshake-vouched subscription id,
 * with the client-held watermark echoed and never server-persisted. Push is latency; poll is
 * truth.
 */

const
    DEFAULT_RETRY_FLOOR_MS = 5000,
    MAX_BACKOFF_MS         = 60_000,
    STALE_AFTER_MS         = 90_000;

/**
 * @summary Parses complete `text/event-stream` frames out of an accumulating buffer — the browser
 * twin of the relay parser; the parity spec pins both to identical answers.
 * @param {String} buffer
 * @returns {Object} `{frames: [{event, data, retry}], rest}` — `rest` is the trailing partial.
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
 * @summary Creates the browser wake-stream consumer. Passive until `start()`; every failure path
 * is an observation, never a throw — the pane renders reasons, not stack traces.
 * @param {Object} options
 * @param {String} options.eventsUrl Absolute URL of the composed server's SSE endpoint.
 * @param {Function} options.authHeaders Returns the per-connection credential headers — built in
 *     the registry bridge's closure so no mint crosses into this module or the pane. The bridge
 *     sends class-1 on `Authorization` and, when armed, the class-3 mint on
 *     `x-neo-mc-authorization`; a byte-identical pair is refused at install time, before any wire.
 * @param {Function} [options.pollDigest] `({subscriptionId, sinceLogId}) => result` seam for
 *     connection catch-up; absent means catch-up is skipped and the observation says so.
 * @param {Function} [options.onWake] Observational per-frame callback
 *     `({subscriptionId, envelope, receivedAt}) => void` — fired for every parsed `wake` frame so a
 *     composition root can feed a rendering surface without polling. Strictly an observer: a
 *     throwing callback is absorbed and logged, never allowed to kill the read loop, and it can
 *     neither redirect nor acknowledge delivery — poll remains the truth lane.
 * @param {Function} [options.fetchImpl] Injection seam; defaults to global `fetch`.
 * @param {Function} [options.now=Date.now]
 * @param {Object} [options.logger=console]
 * @param {Number} [options.retryFloorMs=5000] Initial reconnect floor; a server `retry:` hint
 *     can only raise it (tests inject a small floor, production keeps the default).
 * @returns {Object} `{start, stop, resolveDeliveryLiveness, describe}`
 */
export function createFleetWakeStreamConsumer({
    eventsUrl,
    authHeaders,
    pollDigest = null,
    onWake     = null,
    fetchImpl  = null,
    now        = Date.now,
    logger     = console,
    retryFloorMs: initialRetryFloorMs = DEFAULT_RETRY_FLOOR_MS
}) {
    if (typeof eventsUrl !== 'string' || eventsUrl.trim().length === 0) {
        throw new Error('createFleetWakeStreamConsumer requires an eventsUrl')
    }

    if (typeof authHeaders !== 'function') {
        throw new Error('createFleetWakeStreamConsumer requires an authHeaders function — credentials stay in the bridge closure, never consumer options')
    }

    if (onWake !== null && typeof onWake !== 'function') {
        throw new Error('createFleetWakeStreamConsumer: onWake must be a function or null')
    }

    const doFetch = fetchImpl ?? ((...args) => fetch(...args));

    let
        stopped          = true,
        connected        = false,
        connectionEpoch  = 0,
        retryFloorMs     = initialRetryFloorMs,
        consecutiveDrops = 0,
        lastFrameAt      = null,
        lastWakeAt       = null,
        lastState        = null,
        lastDisconnect   = 'not started',
        subscriptionId   = null,
        watermark        = 0,
        pendingAtCatchUp = null,
        lastCatchUp      = null,
        catchUpFired     = false,
        abortController  = null;

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
            lastState = payload;

            // The handshake vouches the armed viewer's subscription id — the server's arming
            // context created that subscription, so this is the authoritative source, available
            // BEFORE any live wake arrives.
            if (payload.subscriptionId) {
                subscriptionId = payload.subscriptionId
            }
        } else if (frame.event === 'wake') {
            lastWakeAt     = now();
            subscriptionId = payload.subscriptionId ?? subscriptionId;

            const logId = payload.envelope?.payload?.watermark ?? payload.envelope?.logId;

            if (Number.isFinite(logId) && logId > watermark) {
                watermark = logId
            }

            if (onWake) {
                try {
                    onWake({subscriptionId: payload.subscriptionId ?? subscriptionId, envelope: payload.envelope ?? null, receivedAt: lastWakeAt})
                } catch (error) {
                    // an observer fault must never kill the read loop — the stream's liveness is
                    // the consumer's contract, the callback's health is the caller's
                    logger.warn?.(`[FleetWakeStreamConsumer] onWake observer failed: ${error?.message ?? error}`)
                }
            }
        }

        // Catch-up fires once per connection, the moment the subscription id is known. The
        // `state` handshake is the first frame every connection carries, so a COLD consumer
        // with pending wakes catches up right here — no live wake has to arrive first. A server
        // that vouches no id leaves this honestly unfired; poll remains the truth lane.
        if (!catchUpFired && subscriptionId && pollDigest) {
            catchUpFired = true;
            catchUp() // absorbs its own faults; the observation carries the outcome
        }
    }

    async function catchUp() {
        if (!pollDigest || !subscriptionId) {
            pendingAtCatchUp = null;
            return
        }

        try {
            const result = await pollDigest({subscriptionId, sinceLogId: watermark});

            pendingAtCatchUp = result?.counts?.pending ?? result?.pending ?? 0;

            // Three states BY CONSTRUCTION, timestamped: a successful poll that drained nothing is
            // `empty`, one that drained is `fresh` — and neither is ever conflated with `failed`.
            lastCatchUp = {state: pendingAtCatchUp > 0 ? 'fresh' : 'empty', at: now(), pending: pendingAtCatchUp};

            if (Number.isFinite(result?.watermark) && result.watermark > watermark) {
                watermark = result.watermark
            }
        } catch (error) {
            pendingAtCatchUp = null;
            lastCatchUp      = {state: 'failed', at: now(), pending: null};
            logger.warn?.(`[FleetWakeStreamConsumer] reconnect catch-up failed: ${error?.message ?? error}`)
        }
    }

    async function connectOnce(epoch) {
        abortController = new AbortController();

        const response = await doFetch(eventsUrl, {
            headers: {
                accept: 'text/event-stream',
                ...authHeaders()
            },
            signal: abortController.signal
        });

        if (!response.ok || !response.body) {
            lastDisconnect = `stream refused: HTTP ${response.status}`;
            return
        }

        // Every connection is a catch-up moment — the trigger lives in `observeFrame`, on the
        // first frame that makes the subscription id known (the handshake `state` frame on a
        // server that vouches it). The vouch and the handshake are CONNECTION-EPOCH state and
        // reset here: a viewer disarmed between connections must never reuse the prior epoch's
        // subscription, and liveness must never wear the prior epoch's handshake. Only the
        // client-held watermark survives reconnect — it is client truth, not a server vouch.
        connected        = true;
        consecutiveDrops = 0;
        lastFrameAt      = now();
        lastState        = null;
        subscriptionId   = null;
        catchUpFired     = false;
        pendingAtCatchUp = null;

        const
            decoder = new TextDecoder(),
            reader  = response.body.getReader();

        let buffer = '';

        try {
            for (;;) {
                const {value, done} = await reader.read();

                if (done || stopped || epoch !== connectionEpoch) break;

                buffer += decoder.decode(value, {stream: true});

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
            // a dead endpoint costs a bounded trickle, never a retry storm against the caps.
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
                logger.error?.(`[FleetWakeStreamConsumer] loop crashed: ${error?.message ?? error}`)
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
         * @summary The wake-push observation the pane renders — shape and vocabulary identical to
         * the relay side's, so one absence-of-signal grammar serves both topologies. A dead stream
         * renders `unknown` with its reason, never a fabricated verdict about delivery itself.
         * @returns {Object} `{alive: Boolean|'unknown', reason: String}`
         */
        resolveDeliveryLiveness() {
            if (stopped) {
                return {alive: 'unknown', reason: 'wake stream consumer not running'}
            }

            if (connected) {
                // Transport-open is not handshake-live: an HTTP 200 with an open body and ZERO
                // frames proves only that a socket exists. Positive liveness starts at the
                // CURRENT epoch's `state` handshake — until it arrives, the honest answer is
                // absence of signal, exactly like a disconnect.
                if (lastState === null) {
                    return {alive: 'unknown', reason: 'stream open, state handshake pending — liveness unconfirmed'}
                }

                const
                    age   = lastFrameAt === null ? null : now() - lastFrameAt,
                    stale = age !== null && age > STALE_AFTER_MS;

                if (stale) {
                    return {
                        alive : 'unknown',
                        reason: `wake stream silent for ${Math.round(age / 1000)}s — liveness unconfirmed`
                    }
                }

                const armedNote = lastState.armedForViewer
                    ? 'armed for this viewer'
                    : `not armed for this viewer (${lastState.reason ?? 'no reason carried'})`;

                const pendingNote = pendingAtCatchUp ? ` · ${pendingAtCatchUp} pending caught up` : '';

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
                pendingAtCatchUp,
                // `null` is the ABSENCE of a catch-up observation (seam unwired, or none fired
                // yet) — distinct from all three observed states, same tri-state honesty as the
                // telltale axes. Survives reconnects deliberately: it is a timestamped
                // observation log, not an epoch vouch.
                lastCatchUp,
                consecutiveDrops,
                retryFloorMs
            }
        }
    }
}
