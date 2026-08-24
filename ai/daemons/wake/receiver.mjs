/**
 * @module ai/daemons/wake/receiver
 * @summary Explicit-bind signed Shape-B receiver for graphless host wake delivery.
 *
 * The receiver verifies HMAC over the exact request bytes before parsing or persisting them,
 * durably accepts a stable event/source identity before returning 2xx, and drains accepted work
 * through an injected local adapter. It imports no graph, SQLite, Memory Core config, or database
 * path. Container Memory Core owns matching/coalescing/retry; this process owns only the local
 * final mile.
 */
import crypto          from 'node:crypto';
import fs              from 'node:fs/promises';
import http            from 'node:http';
import net             from 'node:net';
import path            from 'node:path';
import {watch}         from 'node:fs';
import {pathToFileURL} from 'node:url';

import {WakeReceiverState}                      from './receiverState.mjs';
import {evaluateContextGate}                    from './contextGatePolicy.mjs';
import {dispatchLocalWake, probeSessionContext} from './localWakeAdapters.mjs';

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

/**
 * Dialog-gate bound: how many times a wake deferred for a pending interactive prompt may
 * re-park before it exhausts into an observable failure. Dialogs are transient (seconds to
 * minutes), so the default covers a pending question across many drain cycles; a seat parked on a
 * dialog for good surfaces as `dialog-defer-bound-exhausted` rather than parking silently.
 * @type {Number}
 */
const DIALOG_DEFER_BOUND = 20;
/**
 * Coalesces the burst of filesystem events one atomic publish produces into a single reload.
 * @type {Number}
 */
const MANIFEST_WATCH_DEBOUNCE_MS = 150;
/**
 * Backstop sweep. `fs.watch` is allowed to miss events — on network and virtualised filesystems it
 * routinely does — so a watcher alone trades a known manual step for an unknown silent one. This is
 * what makes a missed event self-healing rather than permanent: worst case the route goes live one
 * interval late instead of never.
 * @type {Number}
 */
const MANIFEST_RECONCILE_INTERVAL_MS = 30 * 1000;
/**
 * Bounded re-reads when a publish lands mid-read. Boot has no later trigger to fall back on, so an
 * unlucky moment must not be fatal — but a file being rewritten without pause is a real fault and has
 * to surface rather than spin.
 * @type {Number}
 */
const MANIFEST_READ_ATTEMPTS = 3;
const LOOPBACK_HOSTS         = new Set(['127.0.0.1', 'localhost', '::1']);
/**
 * How often the receiver re-drains `pending` records without a new wake arriving. A wake deferred
 * by the context gate flushes when the target session compacts or rotates — both visible
 * only on re-evaluation — so deferrals need their own clock; a flush that waited for the next wake
 * could wait forever on a quiet seat. Sized well under any provider cache warm window so a
 * legitimately-flushed deferral still lands warm.
 * @type {Number}
 */
const DRAIN_RETRY_INTERVAL_MS = 60 * 1000;
const PRODUCTION_ADAPTERS     = new Set([
    'osascript',
    'tmux',
    'claude-courier',
    'codex-app-server',
    'opencode-server',
    'kimi-server',
    'kimi-pull-bridge'
]);

/**
 * @summary Loads a 0600 route manifest without leaking signing keys into logs or state records.
 *
 * @param {String} manifestPath Absolute JSON manifest path.
 * @returns {Promise<Object>}
 */
export async function loadWakeReceiverManifest(manifestPath) {
    if (!path.isAbsolute(manifestPath || '')) {
        throw new Error('Wake receiver requires an absolute manifest path');
    }

    const stat = await fs.stat(manifestPath);
    if ((stat.mode & 0o077) !== 0) {
        throw new Error(`Wake receiver manifest '${manifestPath}' must be mode 0600`);
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (manifest?.schemaVersion !== 1 || !manifest.routes || typeof manifest.routes !== 'object') {
        throw new Error('Wake receiver manifest requires schemaVersion=1 and a routes object');
    }

    for (const [subscriptionId, route] of Object.entries(manifest.routes)) {
        if (!subscriptionId.startsWith('WAKE_SUB:')) {
            throw new Error(`Wake receiver route '${subscriptionId}' requires a WAKE_SUB subscription id`);
        }
        if (typeof route?.signingKey !== 'string' || route.signingKey.length < 32) {
            throw new Error(`Wake receiver route '${subscriptionId}' requires a signingKey`);
        }
        if (typeof route?.agentIdentity !== 'string' || route.agentIdentity.length === 0) {
            throw new Error(`Wake receiver route '${subscriptionId}' requires an agentIdentity`);
        }
        if (!route.harnessTargetMetadata || typeof route.harnessTargetMetadata !== 'object') {
            throw new Error(`Wake receiver route '${subscriptionId}' requires harnessTargetMetadata`);
        }
        const metadata = route.harnessTargetMetadata;
        const adapter  = metadata.adapter || (process.platform === 'darwin' ? 'osascript' : 'tmux');

        if (!PRODUCTION_ADAPTERS.has(adapter)) {
            throw new Error(`Wake receiver route '${subscriptionId}' has unsupported production adapter '${adapter}'`);
        }
        if (
            !Number.isFinite(route.adapterConfig?.attemptTimeoutMs) ||
            route.adapterConfig.attemptTimeoutMs <= 0 ||
            route.adapterConfig.attemptTimeoutMs > 300_000
        ) {
            throw new Error(`Wake receiver route '${subscriptionId}' requires positive adapterConfig.attemptTimeoutMs`);
        }
        if (route.adapterConfig?.contextGate !== undefined) {
            const gate = route.adapterConfig.contextGate;

            if (
                !Number.isInteger(gate?.maxContextTokens)  || gate.maxContextTokens <= 0 ||
                !Number.isInteger(gate?.warnContextTokens) || gate.warnContextTokens <= 0 ||
                gate.warnContextTokens > gate.maxContextTokens
            ) {
                throw new Error(
                    `Wake receiver route '${subscriptionId}' has an invalid adapterConfig.contextGate ` +
                    `(requires positive integers with warnContextTokens <= maxContextTokens)`
                );
            }
        }
        if (adapter === 'codex-app-server' && (
            metadata.appName !== 'Codex' ||
            typeof route.adapterConfig.codexBinary !== 'string' ||
            route.adapterConfig.codexBinary.length === 0
        )) {
            throw new Error(`Wake receiver route '${subscriptionId}' requires Codex app metadata and adapterConfig.codexBinary`);
        }
        if (adapter === 'tmux' && metadata.addressType !== 'webhookUrl') {
            const tmuxSession = metadata.addressType === 'tmuxSession'
                ? metadata.instanceAddress
                : metadata.tmuxSession;
            if (typeof tmuxSession !== 'string' || tmuxSession.length === 0) {
                throw new Error(`Wake receiver route '${subscriptionId}' requires an explicit tmux session`);
            }
        }
        if (metadata.addressType === 'webhookUrl') {
            let webhookUrl;

            try {
                webhookUrl = new URL(metadata.instanceAddress);
            } catch {
                throw new Error(`Wake receiver route '${subscriptionId}' requires a valid webhookUrl instanceAddress`);
            }
            if (!LOOPBACK_HOSTS.has(webhookUrl.hostname)) {
                throw new Error(`Wake receiver route '${subscriptionId}' webhookUrl must stay loopback-only`);
            }
        }
        if (adapter === 'osascript' && (
            !['Antigravity', 'Claude', 'Codex', 'OpenCode'].includes(metadata.appName) ||
            (metadata.appName === 'Codex' && !metadata.focusSeedKey)
        )) {
            throw new Error(`Wake receiver route '${subscriptionId}' has incomplete osascript target metadata`);
        }
    }

    return manifest;
}

/**
 * @summary Compares an exact-body HMAC against the hexadecimal Shape-B signature header.
 * @param {Buffer} rawBody
 * @param {String} signingKey
 * @param {String} signature
 * @returns {Boolean}
 */
export function verifyWakeSignature(rawBody, signingKey, signature) {
    if (!Buffer.isBuffer(rawBody) || typeof signingKey !== 'string' || !/^[a-f0-9]{64}$/i.test(signature || '')) {
        return false;
    }

    const expected = crypto.createHmac('sha256', signingKey).update(rawBody).digest();
    const received = Buffer.from(signature, 'hex');

    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/**
 * @summary Creates an HTTP receiver plus its serial durable drain.
 *
 * @param {Object} options
 * @param {Object} options.manifest Loaded route manifest.
 * @param {WakeReceiverState} options.state
 * @param {Function} [options.dispatch=dispatchLocalWake] Local adapter `(record) => outcome`.
 * @param {Function} [options.contextProbe=probeSessionContext] Session context probe
 *   `(record) => {contextTokens, lastActivityAt, sessionId}|null` for the delivery-time context gate.
 * @param {Object} [options.logger=console]
 * @param {Number} [options.maxBodyBytes=DEFAULT_MAX_BODY_BYTES]
 * @returns {{server:http.Server,drain:Function}}
 */
export function createWakeReceiver({
    manifest,
    state,
    dispatch     = dispatchLocalWake,
    contextProbe = probeSessionContext,
    logger       = console,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES
} = {}) {
    if (!manifest?.routes || !(state instanceof WakeReceiverState)) {
        throw new Error('createWakeReceiver requires a loaded manifest and WakeReceiverState');
    }

    // The route table is read per request rather than captured once, so a seat that publishes a route
    // while this process is running becomes deliverable without a restart. Previously the manifest was
    // a boot-time snapshot: a route added afterwards answered 404, and a 404 is a 4xx that the sender
    // degrades immediately with no retry — so a correctly-published route went permanently deaf on its
    // first wake, and the only remedy was the restart an incident is most likely to forbid.
    let activeManifest = manifest;
    let drainPromise   = Promise.resolve();

    /**
     * @summary Swaps in an already-validated manifest. Callers load and validate first, so a manifest
     * this process would reject can never displace a working route table — a stale receiver must not
     * be convertible into a dead one.
     * @param {Object} next A manifest returned by {@link loadWakeReceiverManifest}.
     * @returns {Number} Route count now serving.
     */
    const setManifest = next => {
        if (!next?.routes || typeof next.routes !== 'object') {
            throw new Error('createWakeReceiver.setManifest requires a loaded manifest');
        }

        activeManifest = next;

        return Object.keys(next.routes).length
    };

    const drain = () => {
        drainPromise = drainPromise.then(async () => {
            const pending = await state.list('pending');

            for (const record of pending) {
                const dispatching = await state.transition(record.recordKey, 'pending', 'dispatching', {
                    dispatchStartedAt: new Date().toISOString()
                });
                if (!dispatching) continue;

                // The context gate: after the non-idempotency marker, before the adapter runs.
                // A defer returns the record to `pending` — the wake waits for the target session
                // to compact or rotate; the mailbox stays the authority, so nothing is ever lost.
                const gateConfig = dispatching.route?.adapterConfig?.contextGate;

                if (gateConfig && contextProbe) {
                    const probe = await contextProbe(dispatching).catch(() => null);
                    const gate  = evaluateContextGate({
                        probe,
                        maxContextTokens : gateConfig.maxContextTokens,
                        warnContextTokens: gateConfig.warnContextTokens
                    });

                    if (gate.action === 'defer') {
                        const deferCount = (dispatching.deferCount || 0) + 1;

                        await state.transition(record.recordKey, 'dispatching', 'pending', {
                            deferCount,
                            deferredAt         : new Date().toISOString(),
                            deferReason        : `context-gate:${gate.contextTokens}>${gateConfig.maxContextTokens}`,
                            lastGateOutcome    : gate.gateOutcome,
                            probedContextTokens: gate.contextTokens
                        });
                        logger.warn?.(
                            `[Wake Receiver] context gate DEFERRED ${record.subscriptionId}: session at ` +
                            `${gate.contextTokens} tokens (> ${gateConfig.maxContextTokens}); the wake waits for ` +
                            `compaction or session rotation, mailbox stays authoritative (defer #${deferCount})`
                        );
                        continue;
                    }

                    // The session-cost digest line (AC-2): a wake delivered through a
                    // gated route whose probe succeeded carries the session's context position
                    // in the injected digest. The envelope COPY keeps the durable record
                    // byte-identical to the signed, accepted payload; absent probe data (the
                    // fail-open 'unknown' arm) adds no field — no line, no noise.
                    if (gate.gateOutcome === 'within' || gate.gateOutcome === 'warn') {
                        dispatching.envelope = {
                            ...dispatching.envelope,
                            payload: {
                                ...dispatching.envelope?.payload,
                                sessionContext: {
                                    contextTokens   : gate.contextTokens,
                                    maxContextTokens: gateConfig.maxContextTokens
                                }
                            }
                        };
                    }

                    if (gate.gateOutcome === 'unknown') {
                        logger.warn?.(
                            `[Wake Receiver] context gate could not probe ${record.subscriptionId}; ` +
                            `delivering fail-open (never silently withheld)`
                        );
                    } else if (gate.gateOutcome === 'warn') {
                        logger.warn?.(
                            `[Wake Receiver] context gate warns ${record.subscriptionId}: session at ` +
                            `${gate.contextTokens} tokens, defers above ${gateConfig.maxContextTokens}; delivering`
                        );
                    }
                }

                let outcome = 'failed';
                let outcomeReason;

                try {
                    // An adapter returns either a bare outcome string or `{outcome, outcomeReason}`.
                    // The reason channel lets a terminal failure name its cause without throwing —
                    // throwing would change the retry semantics, and the cause belongs on the record
                    // regardless of how the adapter chose to end.
                    const result = await dispatch(dispatching);

                    outcome = typeof result === 'string' ? result : result?.outcome;

                    if (result && typeof result === 'object' && result.outcomeReason) {
                        outcomeReason = String(result.outcomeReason);
                    }

                    if (!['delivered', 'skipped', 'failed', 'unknown', 'deferred'].includes(outcome)) {
                        outcomeReason = `invalid-adapter-outcome:${String(outcome)}`;
                        outcome       = 'failed';
                    }

                    // The dialog gate: an adapter that read a pending interactive prompt on
                    // the target seat DEFERS instead of typing the wake into the operator's dialog.
                    // Same park-and-reschedule contract as the context gate above, but bounded —
                    // a dialog is a transient state, so the wake retries on subsequent drains until
                    // either the seat returns to composer state (deliver, envelope identity intact)
                    // or the bound exhausts into an OBSERVABLE failure. A defer that can park
                    // forever is the silent non-delivery failure mode wearing a polite name.
                    if (outcome === 'deferred') {
                        const deferCount = (dispatching.deferCount || 0) + 1;

                        if (deferCount > DIALOG_DEFER_BOUND) {
                            const exhausted = `dialog-defer-bound-exhausted:${outcomeReason || 'unknown'}`;

                            await state.transition(record.recordKey, 'dispatching', 'failed', {
                                outcomeReason     : exhausted,
                                deferCount,
                                dispatchFinishedAt: new Date().toISOString()
                            });
                            logger.error?.(
                                `[Wake Receiver] dialog gate EXHAUSTED ${record.subscriptionId} after ` +
                                `${deferCount} deferrals (${outcomeReason}); surfacing as failed — ` +
                                'the mailbox stays authoritative'
                            );
                            continue;
                        }

                        await state.transition(record.recordKey, 'dispatching', 'pending', {
                            deferCount,
                            deferredAt : new Date().toISOString(),
                            deferReason: outcomeReason || 'interactive-dialog-pending'
                        });
                        logger.warn?.(
                            `[Wake Receiver] dialog gate DEFERRED ${record.subscriptionId}: a pending ` +
                            `interactive prompt holds the seat's input path; the wake waits for ` +
                            `composer state (defer #${deferCount}/${DIALOG_DEFER_BOUND})`
                        );
                        continue;
                    }
                } catch (error) {
                    outcomeReason = error?.code || error?.name || 'adapter-error';
                    outcome       = 'failed';
                    logger.error?.(`[Wake Receiver] adapter failed for ${record.subscriptionId}: ${outcomeReason}`);
                }

                await state.transition(record.recordKey, 'dispatching', outcome, {
                    ...(outcomeReason ? {outcomeReason} : {}),
                    dispatchFinishedAt: new Date().toISOString()
                });
            }
        }).catch(error => {
            logger.error?.(`[Wake Receiver] drain failed: ${error.message}`);
        });

        return drainPromise;
    };

    const server = http.createServer(async (request, response) => {
        try {
            if (request.method !== 'POST' || request.url !== '/wake') {
                return writeJson(response, 404, {error: 'not-found'});
            }

            const subscriptionId = getHeader(request, 'x-neo-wake-subscription-id');
            const eventId        = getHeader(request, 'x-neo-wake-event-id');
            const schemaVersion  = getHeader(request, 'x-neo-wake-schema-version');
            const signature      = getHeader(request, 'x-neo-wake-signature');
            const route          = activeManifest.routes[subscriptionId];

            if (!route) return writeJson(response, 404, {error: 'unknown-subscription'});

            const rawBody = await readRawBody(request, maxBodyBytes);
            if (!verifyWakeSignature(rawBody, route.signingKey, signature)) {
                return writeJson(response, 401, {error: 'invalid-signature'});
            }

            let envelope;
            try {
                envelope = JSON.parse(rawBody.toString('utf8'));
            } catch {
                return writeJson(response, 400, {error: 'invalid-json'});
            }

            if (envelope?.eventId !== eventId ||
                envelope?.subscriptionId !== subscriptionId ||
                envelope?.agentIdentity !== route.agentIdentity ||
                envelope?.eventType !== 'wake/digest' ||
                envelope?.schemaVersion !== '1.0' ||
                schemaVersion !== envelope.schemaVersion
            ) {
                return writeJson(response, 409, {error: 'signed-route-mismatch'});
            }

            const sourceEventIds = Array.isArray(envelope?.payload?.sourceEventIds)
                ? envelope.payload.sourceEventIds
                : [];
            const publicRoute = {
                agentIdentity        : route.agentIdentity,
                harnessTargetMetadata: route.harnessTargetMetadata,
                adapterConfig        : route.adapterConfig
            };
            const accepted = await state.accept({
                subscriptionId,
                eventId,
                sourceEventIds,
                envelope,
                route: publicRoute
            });

            writeJson(response, accepted.status === 'accepted' ? 202 : 200, {
                status   : accepted.status,
                recordKey: accepted.record.recordKey
            });
            void drain();
        } catch (error) {
            const status = error.code === 'BODY_TOO_LARGE' ? 413 : 500;
            logger.error?.(`[Wake Receiver] request failed: ${error.message}`);
            writeJson(response, status, {error: status === 413 ? 'body-too-large' : 'receiver-error'});
        }
    });

    return {server, drain, setManifest};
}

/**
 * @summary Starts the production receiver after manifest/state validation and crash recovery.
 * @param {Object} options
 * @param {String} options.manifestPath
 * @param {String} options.stateDir
 * @param {String} options.host Explicit IP literal on which the host receiver listens.
 * @param {Number} options.port
 * @param {Object} [options.logger=console]
 * @param {Number} [options.reconcileIntervalMs]
 * @param {Number} [options.drainIntervalMs=DRAIN_RETRY_INTERVAL_MS]
 * @returns {Promise<{server:http.Server,state:WakeReceiverState,drain:Function}>}
 */
export async function startWakeReceiver({
    manifestPath,
    stateDir,
    host,
    port,
    logger = console,
    reconcileIntervalMs = MANIFEST_RECONCILE_INTERVAL_MS,
    drainIntervalMs     = DRAIN_RETRY_INTERVAL_MS
} = {}) {
    if (net.isIP(host) === 0) {
        throw new Error('Wake receiver requires an explicit IP-literal --host');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Wake receiver requires an integer --port in 1..65535');
    }

    // Captured from the SAME operation that produces the manifest below, never from a later stat.
    // Statting afterwards records whatever is on disk THEN, which may already be a newer file this
    // process never loaded — and the comparison would then read "unchanged" forever.
    const boot     = await loadManifestWithRevision(manifestPath);
    const manifest = boot.manifest;
    const state    = new WakeReceiverState({stateDir});

    await state.init();
    const unknownCount = await state.recoverInterrupted();
    if (unknownCount > 0) {
        logger.warn?.(`[Wake Receiver] terminalized ${unknownCount} interrupted dispatch(es) as unknown; mailbox remains authoritative.`);
    }

    const {server, drain, setManifest} = createWakeReceiver({manifest, state, logger});
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });
    await drain();

    /**
     * @summary Re-reads and revalidates the manifest, then swaps it in. Load failures leave the
     * serving routes untouched and are reported, because an unreadable or malformed file must never
     * empty a working route table — that turns a stale receiver into a dead one, mid-incident.
     * @returns {Promise<Number|null>} Route count now serving, or `null` when the reload was refused.
     */
    // The revision of the snapshot currently SERVED — not of whatever is on disk. They are separate
    // facts, and conflating them is how a receiver decides it is current while serving something else.
    // A REFUSED reload must not advance it, so the next sweep retries instead of treating a rejected
    // file as accepted.
    let servingRevision = boot.revision;

    // Every reload path — watcher, sweep, SIGHUP, direct caller — runs through this chain. Unserialized
    // reloads can complete out of order and let an OLDER parse win the final `setManifest`, rolling the
    // route table backwards with both callers reporting success.
    let reloadChain = Promise.resolve(null);

    /**
     * @summary Serializes a reload step onto the single swap chain.
     * @param {Function} step
     * @returns {Promise<Number|null>}
     */
    const serialize = step => {
        reloadChain = reloadChain.then(step, step);

        return reloadChain
    };

    /**
     * @summary Loads, revalidates and swaps in the manifest, recording the revision it accepted.
     *
     * Load failures leave the serving routes untouched and are reported, because an unreadable or
     * malformed file must never empty a working route table — that turns a stale receiver into a dead
     * one, mid-incident.
     * @returns {Promise<Number|null>} Route count now serving, or `null` when the reload was refused.
     */
    const applyReload = async () => {
        try {
            const {manifest: next, revision} = await loadManifestWithRevision(manifestPath),
                  count                      = setManifest(next);

            servingRevision = revision;

            logger.log?.(`[Wake Receiver] manifest reloaded; serving ${count} route(s).`);

            return count
        } catch (error) {
            logger.error?.(`[Wake Receiver] manifest reload REFUSED, keeping current routes: ${error.message}`);

            return null
        }
    };

    const reload = () => serialize(applyReload);

    /**
     * @summary Reloads only when the manifest on disk differs from the one being served.
     *
     * Both triggers below funnel through here, so a duplicated watch event costs a `stat` rather than
     * a redundant parse-and-swap, and the periodic sweep stays free when nothing has changed.
     * @returns {Promise<Number|null>} Route count now serving, or `null` when nothing was reloaded.
     */
    const reloadIfChanged = () => serialize(async () => {
        const revision = await readManifestRevision(manifestPath);

        // Absent is what an atomic rename looks like from the outside, mid-publish. Keep serving and
        // let the next event or sweep settle it — an unreadable moment must never empty a route table.
        if (revision === null || revision === servingRevision) return null;

        return applyReload()
    });

    let debounceTimer = null;

    const onManifestEvent = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void reloadIfChanged() }, MANIFEST_WATCH_DEBOUNCE_MS);
        debounceTimer.unref?.();
    };

    // Watch the DIRECTORY, not the file. The generator publishes by atomic rename, which replaces the
    // inode — a watch bound to the old file goes quiet after the first publish, which is precisely the
    // publish this exists to notice.
    let watcher = null;

    try {
        watcher = watch(path.dirname(manifestPath), (eventType, filename) => {
            if (!filename || filename === path.basename(manifestPath)) onManifestEvent();
        });
        watcher.on('error', error => {
            logger.warn?.(`[Wake Receiver] manifest watch error, falling back to the periodic sweep: ${error.message}`);
        });
        watcher.unref?.();
    } catch (error) {
        // A platform that cannot watch still reloads on the sweep. Degraded, not deaf.
        logger.warn?.(`[Wake Receiver] manifest watch unavailable, relying on the periodic sweep: ${error.message}`);
    }

    const reconcileTimer = setInterval(() => { void reloadIfChanged() }, reconcileIntervalMs);

    reconcileTimer.unref?.();

    // The context gate's flush clock — see DRAIN_RETRY_INTERVAL_MS.
    const drainTimer = setInterval(() => { void drain() }, drainIntervalMs);

    drainTimer.unref?.();

    /**
     * @summary Releases only the filesystem watcher, leaving the periodic sweep running.
     *
     * Separate from full teardown so the missed-event path can be exercised for real: a test that
     * stopped both would disable the very mechanism it means to prove.
     * @returns {void}
     */
    const stopManifestWatcher = () => {
        clearTimeout(debounceTimer);
        watcher?.close();
        watcher = null;
    };

    /**
     * @summary Releases the watcher, the sweep, and the gate's drain retry timer. Callers that own
     * the process lifetime (tests, a supervisor) need a way to stop them; the daemon itself never
     * calls this.
     * @returns {void}
     */
    const stopWatchingManifest = () => {
        stopManifestWatcher();
        clearInterval(reconcileTimer);
        clearInterval(drainTimer);
    };

    // SIGHUP stays. It is the documented escape hatch and the delivered contract of the predecessor
    // that shipped it; what changes is that nobody has to remember it. A seat runs the generator and
    // its route serves — without the restart that an incident is most likely to have forbidden.
    process.on('SIGHUP', () => { void reload() });

    logger.log?.(
        `[Wake Receiver] listening on http://${host}:${port}/wake — manifest changes reload automatically ` +
        `(watch + ${reconcileIntervalMs / 1000}s sweep); SIGHUP still forces one`
    );

    return {server, state, drain, reload, reloadIfChanged, stopManifestWatcher, stopWatchingManifest};
}

/**
 * @summary Reads a collision-resistant identity for the manifest currently on disk, or `null` when it
 * cannot be stat'ed.
 *
 * Modification time alone is not an identity: two atomic publishes can land inside one clock tick and
 * alias to the same value, so a genuinely new route table reads as "unchanged" and is never adopted.
 * The publisher writes a temporary file and renames it, so the **inode** differs on every publish and
 * is what actually discriminates; size is included because it is free and separates same-inode rewrites.
 * @param {String} manifestPath
 * @returns {Promise<String|null>}
 * @private
 */
async function readManifestRevision(manifestPath) {
    try {
        const {mtimeMs, size, ino} = await fs.stat(manifestPath);

        return `${mtimeMs}:${size}:${ino}`
    } catch {
        return null
    }
}

/**
 * @summary Loads and validates the manifest, returning it with the revision it was read from.
 *
 * The revision is captured around the read and confirmed afterwards: a publish landing mid-read would
 * otherwise attach the incoming file's identity to the outgoing file's content, and every later
 * comparison would agree that a stale table is current. A mismatch throws, so the caller keeps serving
 * and retries — the same fail-safe an unreadable file already gets.
 * @param {String} manifestPath
 * @returns {Promise<{manifest:Object,revision:String}>}
 * @private
 */
async function loadManifestWithRevision(manifestPath, attempts = MANIFEST_READ_ATTEMPTS) {
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const revision = await readManifestRevision(manifestPath),
              manifest = await loadWakeReceiverManifest(manifestPath),
              after    = await readManifestRevision(manifestPath);

        if (revision !== null && revision === after) {
            return {manifest, revision}
        }

        // A publish landed mid-read. Retrying in-place matters most at BOOT, where there is no later
        // trigger to fall back on — an unlucky moment must not be fatal, and a republish is finite.
        lastError = new Error('Wake receiver manifest changed while being read');
    }

    throw lastError
}

/**
 * @summary Reads one bounded request body as exact bytes for HMAC verification.
 * @param {http.IncomingMessage} request
 * @param {Number} maxBodyBytes
 * @returns {Promise<Buffer>}
 * @private
 */
async function readRawBody(request, maxBodyBytes) {
    const chunks = [];
    let   size   = 0;

    for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBodyBytes) {
            const error = new Error('Wake request body exceeds configured limit');
            error.code  = 'BODY_TOO_LARGE';
            throw error;
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

/**
 * @summary Reads a single-valued request header.
 * @param {http.IncomingMessage} request
 * @param {String} name
 * @returns {String}
 * @private
 */
function getHeader(request, name) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value || '';
}

/**
 * @summary Writes a compact JSON response.
 * @param {http.ServerResponse} response
 * @param {Number} statusCode
 * @param {Object} value
 * @private
 */
function writeJson(response, statusCode, value) {
    if (response.headersSent || response.destroyed) return;

    const body = JSON.stringify(value);
    response.writeHead(statusCode, {
        'content-type'  : 'application/json',
        'content-length': Buffer.byteLength(body)
    });
    response.end(body);
}

/**
 * @summary Parses required production CLI flags without hidden deployment-path defaults.
 * @param {String[]} argv
 * @returns {{manifestPath:String,stateDir:String,host:String,port:Number}}
 */
export function parseWakeReceiverArgs(argv = process.argv.slice(2)) {
    const read = name => {
        const index = argv.indexOf(name);
        return index >= 0 ? argv[index + 1] : undefined;
    };

    return {
        manifestPath: read('--manifest'),
        stateDir    : read('--state-dir'),
        host        : read('--host'),
        port        : Number(read('--port'))
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startWakeReceiver(parseWakeReceiverArgs()).catch(error => {
        console.error(`[Wake Receiver] fatal: ${error.message}`);
        process.exit(1);
    });
}
