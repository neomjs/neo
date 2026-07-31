/**
 * @module ai/daemons/wake/buildReceiverManifest
 * @summary Builds a wake-receiver route manifest from live WAKE_SUB subscription records.
 *
 * The receiver refuses to start without a 0600 manifest whose routes carry a signing key, an agent
 * identity, harness metadata and an explicit attempt policy. Producing that by hand means copying
 * subscription records out of `manage_wake_subscription list`, remembering the mode, and discovering
 * the shape rules one `throw` at a time.
 *
 * **The server owns the signing key; this module never mints one.** Per ADR 0002 §6.2.3 — ticket-ref-ok:
 * decision-record authority for key ownership, not issue archaeology — `WakeSubscriptionService.subscribe()`
 * generates the HMAC key once, at subscribe-time, and only for
 * `a2a-webhook` targets, storing it in `harnessTargetMetadata`. `WebhookDeliveryService` signs with
 * that key. A generator that minted its own would produce routes that boot cleanly and then reject
 * every real container wake with `401` — the worst available failure, because the manifest looks
 * healthy. Key material is read, never created.
 *
 * **Only `a2a-webhook` records become routes.** `CoalescingEngineService` treats `bridge-daemon`,
 * `disabled` and `none` as no-ops on the Shape-B path, so a route built from one can never receive a
 * container wake. Those records are SKIPPED WITH A NAMED REASON rather than mapped silently or
 * rejected wholesale: mid-migration sets are mixed by definition, and refusing the whole build would
 * make the tool unusable exactly when it is needed.
 *
 * **Composition is additive.** Building for one identity's subscriptions merges into the existing
 * route set rather than replacing it, so generating a manifest for one seat cannot delete another
 * peer's routes on a shared host.
 *
 * **It imports nothing from the graph, Memory Core, or a database path**, mirroring the receiver's
 * own boundary: subscription records arrive as plain data from whoever queried them, so host-edge
 * tooling stays runnable without the container plane it is being wired to.
 *
 * **The generator validates its output through the receiver's loader before publishing**, and the
 * publish itself is exclusive and symlink-safe. A manifest the receiver would reject never reaches
 * the target path.
 */
import crypto          from 'node:crypto';
import fs              from 'node:fs/promises';
import path            from 'node:path';
import {pathToFileURL} from 'node:url';

import {loadWakeReceiverManifest} from './receiver.mjs';

/**
 * Default per-attempt dispatch budget, in milliseconds.
 * The receiver requires a positive value at or below 300000 and declares no default of its own,
 * deliberately, so every route states its policy. This is the generator's stated choice, not a
 * hidden fallback inherited from the daemon.
 * @type {Number}
 */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 10000;

/**
 * The only `harnessTarget` the Shape-B container path can deliver to.
 * @type {String}
 */
export const DELIVERABLE_HARNESS_TARGET = 'a2a-webhook';

/**
 * Metadata keys that belong to the SENDER and must not be copied into receiver-visible route state.
 *
 * `signingKey` is promoted to the route's own top-level field, where the receiver expects it; leaving
 * the duplicate inside `harnessTargetMetadata` would echo secret material into receiver state records
 * and logs for no benefit. `url` is the container's address for reaching the host, which the host
 * itself has no use for.
 * @type {String[]}
 */
const SENDER_ONLY_METADATA_KEYS = ['signingKey', 'url'];

/**
 * Builds the manifest object for a set of subscription records.
 *
 * @summary Maps deliverable WAKE_SUB records onto receiver routes using the server-issued key.
 * @param {Object}   config
 * @param {Object[]} config.subscriptions Records as returned by `manage_wake_subscription list`.
 * @param {Object}   [config.existingRoutes={}] Routes already published, merged rather than replaced.
 * @param {Number}   [config.attemptTimeoutMs=DEFAULT_ATTEMPT_TIMEOUT_MS]
 * @returns {{manifest: Object, routeSummaries: Object[], skipped: Object[]}}
 */
export function buildWakeReceiverManifest({
    subscriptions,
    existingRoutes   = {},
    attemptTimeoutMs = DEFAULT_ATTEMPT_TIMEOUT_MS
}) {
    if (!Array.isArray(subscriptions)) {
        throw new Error('buildWakeReceiverManifest requires a subscriptions array');
    }

    // Additive: start from what is already published so a single-identity build cannot delete a peer.
    const routes         = {...existingRoutes},
          routeSummaries = [],
          skipped        = [];

    for (const subscription of subscriptions) {
        const {id, status, agentIdentity, harnessTarget, harnessTargetMetadata} = subscription || {};

        if (typeof id !== 'string' || !id.startsWith('WAKE_SUB:')) {
            throw new Error(`Subscription id '${id}' is not a WAKE_SUB identifier`);
        }

        // Every skip is NAMED. A silent omission and a silent bad route are the same failure from the
        // operator's side: something they expected to be wired is not, and nothing said so.
        if (status !== 'active') {
            skipped.push({subscriptionId: id, reason: `status is '${status}', not 'active'`});
            continue
        }

        if (harnessTarget !== DELIVERABLE_HARNESS_TARGET) {
            skipped.push({
                subscriptionId: id,
                reason        : `harnessTarget '${harnessTarget}' is not deliverable on the Shape-B path ` +
                                `(only '${DELIVERABLE_HARNESS_TARGET}' is); this seat cannot receive a container wake ` +
                                `until it is migrated`
            });
            continue
        }

        if (typeof agentIdentity !== 'string' || !agentIdentity) {
            throw new Error(`Subscription '${id}' has no agentIdentity`);
        }

        if (!harnessTargetMetadata || typeof harnessTargetMetadata !== 'object') {
            throw new Error(`Subscription '${id}' has no harnessTargetMetadata`);
        }

        // The server minted this at subscribe-time. Its absence on an a2a-webhook record means the
        // record is malformed, not that we should invent one.
        const signingKey = harnessTargetMetadata.signingKey;

        if (typeof signingKey !== 'string' || signingKey.length < 32) {
            throw new Error(
                `Subscription '${id}' carries no server-issued signingKey; ` +
                'the key is minted by WakeSubscriptionService at subscribe-time and cannot be generated here'
            );
        }

        // Fail closed on disagreement rather than silently preferring either side. A published route
        // whose key differs from the server's is precisely the state that 401s every wake, and picking
        // a winner here would hide which side is stale.
        const existing = existingRoutes[id];

        if (existing && existing.signingKey !== signingKey) {
            throw new Error(
                `Subscription '${id}' signing key disagrees with the published manifest; ` +
                'refusing to choose between them — re-subscribe or remove the stale route explicitly'
            );
        }

        const receiverMetadata = Object.fromEntries(
            Object.entries(harnessTargetMetadata).filter(([key]) => !SENDER_ONLY_METADATA_KEYS.includes(key))
        );

        routes[id] = {
            agentIdentity,
            signingKey,
            harnessTargetMetadata: receiverMetadata,
            adapterConfig        : {attemptTimeoutMs, ...(subscription.adapterConfig || {})}
        };

        routeSummaries.push({
            subscriptionId: id,
            agentIdentity,
            // Read the adapter the ROUTE will actually use. Reporting a platform default here once
            // made the summary assert an adapter that was not in the manifest, which reads as
            // confirmation and sends the operator looking somewhere else.
            adapter       : receiverMetadata.adapter || null,
            keyFingerprint: fingerprintSigningKey(signingKey)
        })
    }

    if (!Object.keys(routes).length) {
        throw new Error(
            'No deliverable subscriptions produced a route; refusing to write an empty manifest. ' +
            `Skipped ${skipped.length}: ${skipped.map(entry => entry.reason).join('; ') || 'none'}`
        );
    }

    return {manifest: {schemaVersion: 1, routes}, routeSummaries, skipped}
}

/**
 * @summary Produces a short, non-reversible fingerprint so two sides can compare keys without printing one.
 * @param {String} signingKey
 * @returns {String}
 */
export function fingerprintSigningKey(signingKey) {
    return crypto.createHash('sha256').update(signingKey).digest('hex').slice(0, 12)
}

/**
 * Writes the manifest 0600 through an exclusive, symlink-safe staging file, but only after the
 * receiver's own loader accepts it.
 *
 * A predictable `<target>.staging` name was a symlink attack: `writeFile` follows links, so a
 * pre-created link would receive the signing keys and then be renamed into place as the published
 * manifest. The staging name is now unguessable and opened `wx` — `O_CREAT|O_EXCL`, which refuses an
 * existing path and does not traverse a final-component symlink — and is removed on every exit path.
 *
 * @summary Publishes a manifest that is proven loadable, via a staging file that cannot be hijacked.
 * @param {Object} config
 * @param {Object} config.manifest
 * @param {String} config.targetPath Absolute destination.
 * @returns {Promise<String>} the written path
 */
export async function writeValidatedManifest({manifest, targetPath}) {
    if (!path.isAbsolute(targetPath || '')) {
        throw new Error('Manifest target path must be absolute');
    }

    await fs.mkdir(path.dirname(targetPath), {recursive: true});

    // Same directory as the target so the final rename is atomic; unguessable so it cannot be
    // pre-created; O_EXCL so an existing path — including a symlink — is refused rather than followed.
    const stagingPath = path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${crypto.randomBytes(12).toString('hex')}.staging`
    );

    let handle;

    try {
        handle = await fs.open(stagingPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify(manifest, null, 2) + '\n');
        await handle.close();
        handle = null;

        // The receiver is the authority on whether this manifest is usable, so ask it rather than
        // re-implementing its rules here and letting the two drift.
        await loadWakeReceiverManifest(stagingPath);

        await fs.rename(stagingPath, targetPath)
    } catch (error) {
        await handle?.close().catch(() => {});
        await fs.rm(stagingPath, {force: true});

        throw error.message.startsWith('Refusing')
            ? error
            : new Error(`Refusing to publish a manifest the receiver rejects: ${error.message}`)
    }

    return targetPath
}

/**
 * Reads the currently published routes so a rebuild composes additively.
 *
 * **Only a missing file means "first boot".** Treating every read failure that way silently rotated
 * keys on a corrupt or unreadable manifest, which breaks an already-provisioned container with a
 * `401` that points nowhere near the rebuild. Anything other than `ENOENT` now stops the build.
 *
 * @summary Loads published routes for additive composition, failing closed on an unreadable manifest.
 * @param {String} manifestPath
 * @returns {Promise<Object>} `subscriptionId → route`, empty only when the manifest does not exist
 */
export async function readPublishedRoutes(manifestPath) {
    let raw;

    try {
        raw = await fs.readFile(manifestPath, 'utf8')
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {}
        }

        throw new Error(`Existing manifest '${manifestPath}' is unreadable: ${error.message}`)
    }

    let parsed;

    try {
        parsed = JSON.parse(raw)
    } catch (error) {
        throw new Error(
            `Existing manifest '${manifestPath}' is corrupt (${error.message}); ` +
            'refusing to continue, because rebuilding from it would rotate live signing keys'
        );
    }

    if (!parsed?.routes || typeof parsed.routes !== 'object') {
        throw new Error(`Existing manifest '${manifestPath}' has no routes object; refusing to rotate live keys`);
    }

    return parsed.routes
}

/**
 * @summary Parses CLI flags without hidden deployment-path defaults, mirroring the receiver's parser.
 * @param {String[]} argv
 * @returns {{subscriptionsPath: String, manifestPath: String}}
 */
export function parseManifestBuilderArgs(argv = process.argv.slice(2)) {
    const read = name => {
        const index = argv.indexOf(name);
        return index >= 0 ? argv[index + 1] : undefined
    };

    return {
        subscriptionsPath: read('--subscriptions'),
        manifestPath     : read('--manifest')
    }
}

/**
 * Runs one build-and-publish pass for whichever seat is calling.
 *
 * **This is a per-peer call, not a provisioning batch.** Every family runs it for its own identity
 * and the result composes: the published manifest is read first and merged into, so three peers on
 * one host each add their own route without coordinating and without any of them holding authority
 * over the others' entries. That is why composition is additive rather than replacing — a peer
 * provisioning itself must not be able to unprovision anyone else.
 *
 * Subscriptions arrive as JSON on a path or stdin — the output of `manage_wake_subscription list` —
 * rather than being fetched here. That keeps the module graphless: the caller already holds an
 * authenticated session, and this stays runnable on a host that cannot reach the container plane.
 *
 * @summary Builds and publishes the caller's routes, reporting skips and fingerprints but never keys.
 * @param {Object} config
 * @param {String} config.subscriptionsPath JSON file, or `-` for stdin.
 * @param {String} config.manifestPath      Absolute manifest destination.
 * @param {Object} [config.logger=console]
 * @returns {Promise<{published: String, routeSummaries: Object[], skipped: Object[]}>}
 */
export async function runManifestBuilder({subscriptionsPath, manifestPath, logger = console}) {
    if (!subscriptionsPath || !manifestPath) {
        throw new Error('Usage: --subscriptions <file|-> --manifest <absolute path>');
    }

    const raw = subscriptionsPath === '-'
        ? await readStream(process.stdin)
        : await fs.readFile(subscriptionsPath, 'utf8');

    const parsed = JSON.parse(raw),
          // Accept either the raw tool response or a bare array, since the tool wraps its result.
          subscriptions = Array.isArray(parsed) ? parsed : parsed?.subscriptions;

    const {manifest, routeSummaries, skipped} = buildWakeReceiverManifest({
        subscriptions,
        existingRoutes: await readPublishedRoutes(manifestPath)
    });

    await writeValidatedManifest({manifest, targetPath: manifestPath});

    logger.log(`[Wake Manifest] published ${Object.keys(manifest.routes).length} route(s) to ${manifestPath}`);

    for (const summary of routeSummaries) {
        logger.log(`  route ${summary.subscriptionId} → ${summary.agentIdentity} ` +
                   `adapter=${summary.adapter ?? '(none)'} key=${summary.keyFingerprint}`);
    }

    // Skips are printed, never swallowed: a seat that silently produces no route is indistinguishable
    // from one that was never attempted, and that is exactly how a peer stays deaf without knowing.
    for (const entry of skipped) {
        logger.log(`  SKIPPED ${entry.subscriptionId}: ${entry.reason}`);
    }

    return {published: manifestPath, routeSummaries, skipped}
}

/**
 * @summary Reads a whole stream to a string.
 * @param {Object} stream
 * @returns {Promise<String>}
 * @private
 */
async function readStream(stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString('utf8')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runManifestBuilder(parseManifestBuilderArgs()).catch(error => {
        console.error(`[Wake Manifest] fatal: ${error.message}`);
        process.exit(1)
    })
}
