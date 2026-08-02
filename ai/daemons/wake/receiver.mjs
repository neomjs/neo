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

import {WakeReceiverState} from './receiverState.mjs';
import {dispatchLocalWake} from './localWakeAdapters.mjs';

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
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
const LOOPBACK_HOSTS         = new Set(['127.0.0.1', 'localhost', '::1']);
const PRODUCTION_ADAPTERS    = new Set([
    'osascript',
    'tmux',
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
 * @param {Object} [options.logger=console]
 * @param {Number} [options.maxBodyBytes=DEFAULT_MAX_BODY_BYTES]
 * @returns {{server:http.Server,drain:Function}}
 */
export function createWakeReceiver({
    manifest,
    state,
    dispatch = dispatchLocalWake,
    logger   = console,
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

                    if (!['delivered', 'skipped', 'failed', 'unknown'].includes(outcome)) {
                        outcomeReason = `invalid-adapter-outcome:${String(outcome)}`;
                        outcome       = 'failed';
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
 * @returns {Promise<{server:http.Server,state:WakeReceiverState,drain:Function}>}
 */
export async function startWakeReceiver({manifestPath, stateDir, host, port, logger = console} = {}) {
    if (net.isIP(host) === 0) {
        throw new Error('Wake receiver requires an explicit IP-literal --host');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Wake receiver requires an integer --port in 1..65535');
    }

    const manifest = await loadWakeReceiverManifest(manifestPath);
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
    const reload = async () => {
        try {
            const count = setManifest(await loadWakeReceiverManifest(manifestPath));

            logger.log?.(`[Wake Receiver] manifest reloaded; serving ${count} route(s).`);

            return count
        } catch (error) {
            logger.error?.(`[Wake Receiver] manifest reload REFUSED, keeping current routes: ${error.message}`);

            return null
        }
    };

    // The mtime the currently-served route table was loaded from. A reload that is REFUSED must not
    // record it, so the next sweep retries rather than treating a rejected file as accepted.
    let servingMtimeMs = await readManifestMtimeMs(manifestPath);

    /**
     * @summary Reloads only when the manifest on disk differs from the one being served.
     *
     * Both triggers below funnel through here, so a duplicated watch event costs a `stat` rather than
     * a redundant parse-and-swap, and the periodic sweep stays free when nothing has changed.
     * @returns {Promise<Number|null>} Route count now serving, or `null` when nothing was reloaded.
     */
    const reloadIfChanged = async () => {
        const mtimeMs = await readManifestMtimeMs(manifestPath);

        // Absent is what an atomic rename looks like from the outside, mid-publish. Keep serving and
        // let the next event or sweep settle it — an unreadable moment must never empty a route table.
        if (mtimeMs === null || mtimeMs === servingMtimeMs) return null;

        const count = await reload();

        if (count !== null) servingMtimeMs = mtimeMs;

        return count
    };

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

    const reconcileTimer = setInterval(() => { void reloadIfChanged() }, MANIFEST_RECONCILE_INTERVAL_MS);

    reconcileTimer.unref?.();

    /**
     * @summary Releases the watcher and the sweep. Callers that own the process lifetime (tests, a
     * supervisor) need a way to stop them; the daemon itself never calls this.
     * @returns {void}
     */
    const stopWatchingManifest = () => {
        clearTimeout(debounceTimer);
        clearInterval(reconcileTimer);
        watcher?.close();
    };

    // SIGHUP stays. It is the documented escape hatch and the delivered contract of the predecessor
    // that shipped it; what changes is that nobody has to remember it. A seat runs the generator and
    // its route serves — without the restart that an incident is most likely to have forbidden.
    process.on('SIGHUP', () => { void reload() });

    logger.log?.(
        `[Wake Receiver] listening on http://${host}:${port}/wake — manifest changes reload automatically ` +
        `(watch + ${MANIFEST_RECONCILE_INTERVAL_MS / 1000}s sweep); SIGHUP still forces one`
    );

    return {server, state, drain, reload, reloadIfChanged, stopWatchingManifest};
}

/**
 * @summary Reads the manifest's modification time, or `null` when it cannot be stat'ed.
 * @param {String} manifestPath
 * @returns {Promise<Number|null>}
 * @private
 */
async function readManifestMtimeMs(manifestPath) {
    try {
        return (await fs.stat(manifestPath)).mtimeMs
    } catch {
        return null
    }
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
