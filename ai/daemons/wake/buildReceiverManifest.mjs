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
 * **Reconciliation is owner-scoped.** When the caller's identity is known (`--identity` or a
 * unanimous input), caller-owned routes are withdrawn in two cases: their id is ABSENT from the
 * input (unsubscribe deletes the server row, so the id can never appear) — and their carried GUI
 * tuple is undeliverable-by-shape, refreshed when `--instance` supplies one. Peer routes are never
 * touched, even when absent from the input.
 *
 * **The GUI tuple is never derived.** A subscription record's `addressType`/`instanceAddress` are
 * sender-side webhook routing; mapping them through verbatim passes the receiver's loader and then
 * fails every dispatch silently (`normalizeGuiInstanceAddressTuple` accepts only `pid`/`userDataDir`).
 * `osascript` routes therefore REQUIRE the explicit `--instance`/`--instance-address` tuple, and a
 * build without one skips the route with a named reason rather than emit an undeliverable route
 * that reads healthy. Inferring the tuple is worse: on a multi-instance host it wakes the wrong seat.
 *
 * **It imports nothing from the graph, Memory Core, or a database path**, mirroring the receiver's
 * own boundary: subscription records arrive as plain data from whoever queried them, so host-edge
 * tooling stays runnable without the container plane it is being wired to.
 *
 * **The generator validates its output through the receiver's loader before publishing**, and the
 * publish itself is exclusive and symlink-safe. A manifest the receiver would reject never reaches
 * the target path. The whole read/merge/publish runs inside `withOutboxLock` — no TTL and no
 * unlocked fall-through: a live holder is never reclaimed, a dead one is reclaimed via liveness
 * probe, and a late release can never delete a successor's lock.
 */
import crypto          from 'node:crypto';
import fs              from 'node:fs/promises';
import path            from 'node:path';
import {pathToFileURL} from 'node:url';

import {loadWakeReceiverManifest} from './receiver.mjs';
import {collectUnroutedEligibleIdentities} from './wakeTargetEligibility.mjs';
import {withOutboxLock}           from './outboxLock.mjs';
import {
    DEFAULT_CONTEXT_GATE_MAX_TOKENS,
    DEFAULT_CONTEXT_GATE_WARN_TOKENS
} from './contextGatePolicy.mjs';

import {
    isActiveWakeSubscriptionStatus,
    WAKE_SUBSCRIPTION_DEFAULT_STATUS
} from '../../services/memory-core/wakeSubscriptionStatusPolicy.mjs';

/**
 * Default per-attempt dispatch budget, in milliseconds.
 * The receiver requires a positive value at or below 300000 and declares no default of its own,
 * deliberately, so every route states its policy. This is the generator's stated choice, not a
 * hidden fallback inherited from the daemon.
 * @type {Number}
 */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 10000;

/**
 * The per-route context-gate policy stamped on every generated route. The receiver
 * declares no gate defaults of its own — every route states its policy, mirroring
 * `attemptTimeoutMs`; a legacy route carried forward without `contextGate` simply delivers
 * ungated until its identity's routes are rebuilt. Per-route overrides arrive through the
 * `--adapter-config` map's `contextGate` key and are merged over these defaults.
 * @type {Object}
 */
export const DEFAULT_CONTEXT_GATE = Object.freeze({
    maxContextTokens : DEFAULT_CONTEXT_GATE_MAX_TOKENS,
    warnContextTokens: DEFAULT_CONTEXT_GATE_WARN_TOKENS
});

/**
 * The only `harnessTarget` the Shape-B container path can deliver to.
 * @type {String}
 */
export const DELIVERABLE_HARNESS_TARGET = 'a2a-webhook';

/**
 * Shortest string accepted as a server-issued signing key.
 * @type {Number}
 */
const MIN_SIGNING_KEY_LENGTH = 32;

/**
 * @summary Whether a record carries the server-issued signing key rather than a placeholder or nothing.
 *
 * Exported because the health surface must answer "is this seat armed" with the SAME predicate the
 * manifest build enforces. Re-deriving it there let the two disagree: a record can read armed on the
 * healthcheck and then throw here, which is the silent-deafness shape this whole path exists to remove.
 * @param {*} signingKey
 * @returns {Boolean}
 */
export function isServerIssuedSigningKey(signingKey) {
    return typeof signingKey === 'string' && signingKey.length >= MIN_SIGNING_KEY_LENGTH;
}

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
 * Sender-side routing keys inside a subscription record's `harnessTargetMetadata`. The record's
 * `addressType`/`instanceAddress` describe how the CONTAINER reaches the host webhook — not the
 * GUI tuple the receiver needs to wake a desktop app. Mapping them through verbatim passes the
 * receiver's loader (its `webhookUrl` branch accepts the shape) and then fails every dispatch:
 * `normalizeGuiInstanceAddressTuple` accepts only `pid`/`userDataDir`. The legacy `userDataDir`
 * key rides along too — the receiver would DERIVE a tuple from it, and a derived-but-wrong tuple
 * fails silently on multi-instance hosts, so the receiver-side tuple comes from the explicit
 * `instance` input, never from the record — a subscription record cannot tell you which desktop
 * instance to wake, and guessing wrong on a multi-instance host wakes the wrong seat.
 * @type {String[]}
 */
const RECORD_ROUTING_METADATA_KEYS = ['addressType', 'instanceAddress', 'userDataDir'];

/**
 * The only `addressType` values the receiver can dispatch to (`normalizeGuiInstanceAddressTuple`).
 * `pid` is ephemeral and fine for a one-shot proof; `userDataDir` is the durable choice for
 * anything launchd-managed.
 * @type {String[]}
 */
const GUI_INSTANCE_ADDRESS_TYPES = ['pid', 'userDataDir'];

/**
 * Builds the manifest object for a set of subscription records.
 *
 * @summary Maps deliverable WAKE_SUB records onto receiver routes using the server-issued key.
 * @param {Object}   config
 * @param {Object[]} config.subscriptions Records as returned by `manage_wake_subscription list`.
 * @param {Object}   [config.existingRoutes={}] Routes already published, merged rather than replaced.
 * @param {String}   [config.callerIdentity=null] The seat running the build (`@handle`). Enables owner-set
 *     reconciliation: caller-owned routes whose ids are ABSENT from `subscriptions` (unsubscribed — the
 *     server deletes the row) are withdrawn. Without it, no absence-based withdrawal happens.
 * @param {Object}   [config.adapterConfigById={}]
 * @param {Object}   [config.instance=null] The caller's GUI instance tuple `{type: 'pid'|'userDataDir',
 *     address: String}` — REQUIRED to emit any `osascript` route (the tuple is not derivable from a
 *     subscription record, and inferring it wakes the wrong seat on multi-instance hosts). An osascript
 *     record without a supplied tuple becomes a named skip, never an undeliverable route.
 * @param {Number}   [config.attemptTimeoutMs=DEFAULT_ATTEMPT_TIMEOUT_MS]
 * @returns {{manifest: Object, routeSummaries: Object[], skipped: Object[]}}
 */
export function buildWakeReceiverManifest({
    subscriptions,
    existingRoutes    = {},
    callerIdentity    = null,
    adapterConfigById = {},
    instance          = null,
    attemptTimeoutMs  = DEFAULT_ATTEMPT_TIMEOUT_MS
}) {
    if (!Array.isArray(subscriptions)) {
        throw new Error('buildWakeReceiverManifest requires a subscriptions array');
    }

    // Additive: start from what is already published so a single-identity build cannot delete a peer.
    //
    // Carried routes are re-sanitised rather than copied verbatim. A manifest written by an earlier
    // version can still hold sender-only `signingKey`/`url` inside its metadata, and republishing it
    // unchanged would keep leaking that into receiver state forever — the fix would only ever apply
    // to routes that happened to be rebuilt.
    const routes = Object.fromEntries(
              Object.entries(existingRoutes).map(([id, route]) => [id, sanitiseRoute(route)])
          ),
          routeSummaries = [],
          skipped        = [];

    for (const subscription of subscriptions) {
        const {id, status, agentIdentity, harnessTarget, harnessTargetMetadata} = subscription || {};

        if (typeof id !== 'string' || !id.startsWith('WAKE_SUB:')) {
            throw new Error(`Subscription id '${id}' is not a WAKE_SUB identifier`);
        }

        // Every skip is NAMED. A silent omission and a silent bad route are the same failure from the
        // operator's side: something they expected to be wired is not, and nothing said so.
        // A skipped subscription that the caller OWNS must also have its stale route withdrawn.
        // Skipping only the input left a retired or retargeted seat's old route published — the
        // subscription was gone and the route kept accepting wakes for it. Reconciliation is scoped
        // to ids the caller actually presented, so a peer's route is never touched.
        // Absent `status` resolves through the shared policy rather than being compared here. The
        // durable lister and hydrator preserve absence, but this builder used to compare strictly
        // while lifecycle and fleet consumers defaulted that same row to active. The result was a
        // row counted as live elsewhere and silently dropped at publication.
        if (!isActiveWakeSubscriptionStatus(status)) {
            withdrawOwnedRoute(routes, id, skipped, `status is '${status}', not '${WAKE_SUBSCRIPTION_DEFAULT_STATUS}'`);
            continue
        }

        if (harnessTarget !== DELIVERABLE_HARNESS_TARGET) {
            withdrawOwnedRoute(
                routes, id, skipped,
                `harnessTarget '${harnessTarget}' is not deliverable on the Shape-B path ` +
                `(only '${DELIVERABLE_HARNESS_TARGET}' is); this seat cannot receive a container wake ` +
                'until it is migrated'
            );
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

        if (!isServerIssuedSigningKey(signingKey)) {
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
            Object.entries(harnessTargetMetadata).filter(([key]) =>
                !SENDER_ONLY_METADATA_KEYS.includes(key) && !RECORD_ROUTING_METADATA_KEYS.includes(key))
        );

        // The loader-gate trap, refused: an osascript route needs the receiver-side GUI tuple, and
        // the record cannot supply it (its addressType/instanceAddress are sender-side webhook
        // routing — mapping them through passes the loader and then fails every dispatch silently).
        // Without an explicit tuple this becomes a NAMED skip, never an undeliverable route.
        if (receiverMetadata.adapter === 'osascript') {
            if (!instance || typeof instance.address !== 'string' || !instance.address) {
                skipped.push({
                    subscriptionId: id,
                    reason        : `adapter 'osascript' requires a GUI instance tuple (--instance pid|userDataDir + --instance-address); ` +
                        'not derivable from the subscription record, and inferring it can wake the wrong seat on a multi-instance host — ' +
                        'refusing to emit an undeliverable route that reads healthy',
                    withdrewPublishedRoute: false
                });
                continue
            }

            receiverMetadata.addressType     = instance.type;
            receiverMetadata.instanceAddress = instance.address;
        }

        // Per-route adapter config comes from the caller, keyed by subscription id. The subscription
        // record carries none, so without this a Codex seat could never satisfy the receiver's
        // `codexBinary` requirement from any supported input — the route would be unbuildable rather
        // than merely unconfigured. The context gate rides the same channel: every route
        // states its gate policy explicitly (generator defaults, caller override merged per key).
        const {contextGate: contextGateOverride, ...adapterConfigExtra} = adapterConfigById[id] || {};

        routes[id] = {
            agentIdentity,
            signingKey,
            harnessTargetMetadata: receiverMetadata,
            adapterConfig        : {
                attemptTimeoutMs,
                contextGate: {...DEFAULT_CONTEXT_GATE, ...(contextGateOverride || {})},
                ...adapterConfigExtra
            }
        };

        routeSummaries.push({
            subscriptionId: id,
            agentIdentity,
            // Read the adapter the ROUTE will actually use. Reporting a platform default here once
            // made the summary assert an adapter that was not in the manifest, which reads as
            // confirmation and sends the operator looking somewhere else.
            adapter       : receiverMetadata.adapter || null,
            keyFingerprint: fingerprintSigningKey(signingKey),
            // A pid tuple passes every gate while the pid itself is ephemeral — say so where the
            // operator can see it, rather than re-publishing it silently (durable = userDataDir).
            ...(receiverMetadata.addressType === 'pid' ? {
                warn: 'pid tuples are ephemeral — the harness pid is gone on restart; prefer userDataDir for generated routes'
            } : {})
        })
    }

    // Owner-set reconciliation, scoped to the caller (never a peer's route). Two cases beyond the
    // input-driven skips above:
    // (a) caller-owned route whose id is ABSENT from the input — unsubscribe deletes the server row,
    //     so the id can never appear; without this pass the dead route stays published forever.
    // (b) caller-owned osascript route whose carried tuple is undeliverable-by-shape (the trap) —
    //     withdrawn with a named reason when no `--instance` supplies the repair. (A supplied tuple
    //     repairs through the main-loop rebuild; the withdraw arm is the fail-closed path.)
    if (callerIdentity) {
        const inputIds = new Set(subscriptions.map(record => record?.id));

        for (const [id, route] of Object.entries(routes)) {
            if (route?.agentIdentity !== callerIdentity) {
                continue
            }

            if (!inputIds.has(id)) {
                withdrawOwnedRoute(routes, id, skipped, 'no active subscription record (unsubscribed or row deleted)');
                continue
            }

            const metadata = route.harnessTargetMetadata;

            if (metadata?.adapter === 'osascript' && !instance) {
                const tupleOk = GUI_INSTANCE_ADDRESS_TYPES.includes(metadata.addressType) &&
                    typeof metadata.instanceAddress === 'string' && metadata.instanceAddress.length > 0;

                if (!tupleOk) {
                    withdrawOwnedRoute(
                        routes, id, skipped,
                        `carried route has undeliverable addressType '${metadata.addressType ?? 'absent'}' ` +
                        `(receiver dispatches only ${GUI_INSTANCE_ADDRESS_TYPES.join('/')}); no --instance supplied to repair it`
                    );
                }
            }
        }
    }

    if (!Object.keys(routes).length) {
        // Two different emptinesses: input that PRODUCED nothing (refuse — the operator must hear
        // it, this is the AC5 case the guard was written for) versus everything the caller owned
        // being DELIBERATELY withdrawn (publish — an empty manifest is the correct end state for a
        // fully-unsubscribed seat: the receiver answers `404 unknown-subscription`, and the stale
        // route must not survive on disk just because the guard refused to write).
        const withdrewSomething = skipped.some(entry => entry.withdrewPublishedRoute);

        if (!withdrewSomething) {
            throw new Error(
                'No deliverable subscriptions produced a route; refusing to write an empty manifest. ' +
                `Skipped ${skipped.length}: ${skipped.map(entry => entry.reason).join('; ') || 'none'}`
            );
        }
    }

    return {manifest: {schemaVersion: 1, routes}, routeSummaries, skipped}
}

/**
 * @summary Strips sender-only keys from a route's receiver-visible metadata.
 * @param {Object} route
 * @returns {Object}
 * @private
 */
function sanitiseRoute(route) {
    if (!route?.harnessTargetMetadata || typeof route.harnessTargetMetadata !== 'object') {
        return route
    }

    return {
        ...route,
        harnessTargetMetadata: Object.fromEntries(
            Object.entries(route.harnessTargetMetadata)
                .filter(([key]) => !SENDER_ONLY_METADATA_KEYS.includes(key))
        )
    }
}

/**
 * Withdraws a route the caller owns but can no longer deliver to, and records why.
 * @summary Reconciles the caller's own stale routes without touching a peer's.
 * @param {Object}   routes
 * @param {String}   subscriptionId
 * @param {Object[]} skipped
 * @param {String}   reason
 * @returns {void}
 * @private
 */
function withdrawOwnedRoute(routes, subscriptionId, skipped, reason) {
    const withdrawn = Object.hasOwn(routes, subscriptionId);

    delete routes[subscriptionId];

    skipped.push({
        subscriptionId,
        reason                : withdrawn ? `${reason}; withdrew its previously published route` : reason,
        withdrewPublishedRoute: withdrawn
    })
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

        // DELIBERATELY NOT the shared write-temp-then-rename primitive. The validation directly above
        // reads the STAGED file and must run between the write and the rename — that ordering is what
        // stops an unusable manifest from ever becoming the live one. The primitive collapses the two
        // into a single call, leaving nowhere for the check to stand.
        await fs.rename(stagingPath, targetPath) // atomic-write-ok: the receiver validates the STAGED file between write and rename
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
 * @returns {{subscriptionsPath: String, manifestPath: String, identity: String|undefined,
 *     adapterConfigPath: String|undefined, attemptTimeoutMs: Number|undefined,
 *     instanceType: String|undefined, instanceAddress: String|undefined}}
 */
export function parseManifestBuilderArgs(argv = process.argv.slice(2)) {
    const read = name => {
        const index = argv.indexOf(name);
        return index >= 0 ? argv[index + 1] : undefined
    };

    const attemptTimeoutRaw = read('--attempt-timeout-ms');

    return {
        subscriptionsPath: read('--subscriptions'),
        manifestPath     : read('--manifest'),
        identity         : read('--identity'),
        adapterConfigPath: read('--adapter-config'),
        attemptTimeoutMs : attemptTimeoutRaw ? Number(attemptTimeoutRaw) : undefined,
        instanceType     : read('--instance'),
        instanceAddress  : read('--instance-address')
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
 * @param {String} [config.identity]        The caller's `@handle`; derived from unanimous input records when omitted. Required for absence-based route withdrawal.
 * @param {String} [config.adapterConfigPath] JSON file mapping `{subscriptionId: {…}}` — per-route adapter config (e.g. `codexBinary`).
 * @param {Number} [config.attemptTimeoutMs] Per-route dispatch budget override (default 10000).
 * @param {String} [config.instanceType]     `pid` | `userDataDir` — the caller's GUI instance tuple type (required to emit osascript routes; `userDataDir` is the durable choice).
 * @param {String} [config.instanceAddress]  The tuple's address (pid value or userDataDir path).
 * @param {Object} [config.lockOptions]      Spec seam: forwarded to `withOutboxLock` (`pid`, `isAlive`, `sleep`, `now`, `fs`, `acquireTimeoutMs`, `retryIntervalMs`).
 * @param {Object} [config.logger=console]
 * @returns {Promise<{published: String, routeSummaries: Object[], skipped: Object[]}>}
 */
export async function runManifestBuilder({
    subscriptionsPath,
    manifestPath,
    identity,
    adapterConfigPath,
    attemptTimeoutMs,
    instanceType,
    instanceAddress,
    lockOptions = {},
    logger      = console
}) {
    if (!subscriptionsPath || !manifestPath) {
        throw new Error('Usage: --subscriptions <file|-> --manifest <absolute path> [--identity <@handle>] [--adapter-config <file.json>] [--attempt-timeout-ms <n>] [--instance pid|userDataDir --instance-address <value>]');
    }

    if ((instanceType && !instanceAddress) || (!instanceType && instanceAddress)) {
        throw new Error('--instance and --instance-address must be given together');
    }

    if (instanceType && !GUI_INSTANCE_ADDRESS_TYPES.includes(instanceType)) {
        throw new Error(`--instance must be one of ${GUI_INSTANCE_ADDRESS_TYPES.join('|')} (the only addressTypes the receiver can dispatch to)`);
    }

    const adapterConfigById = adapterConfigPath
        ? JSON.parse(await fs.readFile(adapterConfigPath, 'utf8'))
        : {};

    const raw = subscriptionsPath === '-'
        ? await readStream(process.stdin)
        : await fs.readFile(subscriptionsPath, 'utf8');

    const parsed = JSON.parse(raw),
          // Accept either the raw tool response or a bare array, since the tool wraps its result.
          subscriptions = Array.isArray(parsed) ? parsed : parsed?.subscriptions;

    // Identity resolution: explicit flag wins; otherwise a unanimous input (one distinct identity
    // across the caller's own records) names the caller. Mixed or empty input leaves it null —
    // absence-based withdrawal then stays off rather than guessing whose routes to reap.
    const distinctIdentities = new Set(subscriptions.map(record => record?.agentIdentity).filter(Boolean)),
          callerIdentity     = identity ?? (distinctIdentities.size === 1 ? [...distinctIdentities][0] : null);

    const instance = instanceType ? {type: instanceType, address: instanceAddress} : null;

    // First boot into a non-existent directory: the parent must exist BEFORE the lock is taken —
    // the lock file lives beside the manifest, so acquiring it first would ENOENT on a fresh host.
    await fs.mkdir(path.dirname(manifestPath), {recursive: true});

    // The whole read/merge/publish runs inside the strict pid-owned lock — no TTL and no unlocked
    // fall-through: a live holder is never reclaimed, a dead one is reclaimed via liveness probe,
    // and a late release can never delete a successor's lock (the dropped age-reclaim mutex's exact
    // failure: A held past the bound, B reclaimed, A's late release deleted B's lock, C entered).
    const {manifest, routeSummaries, skipped} = await withOutboxLock(manifestPath, async () => {
        const built = buildWakeReceiverManifest({
            adapterConfigById,
            attemptTimeoutMs,
            callerIdentity,
            existingRoutes: await readPublishedRoutes(manifestPath),
            instance,
            subscriptions
        });

        await writeValidatedManifest({manifest: built.manifest, targetPath: manifestPath});

        return built
    }, {pid: process.pid, ...lockOptions});

    logger.log(`[Wake Manifest] published ${Object.keys(manifest.routes).length} route(s) to ${manifestPath}`);

    for (const summary of routeSummaries) {
        logger.log(`  route ${summary.subscriptionId} → ${summary.agentIdentity} ` +
                   `adapter=${summary.adapter ?? '(none)'} key=${summary.keyFingerprint}`);

        if (summary.warn) {
            logger.log(`  WARN ${summary.subscriptionId}: ${summary.warn}`);
        }
    }

    // Ephemeral-tuple visibility for CARRIED routes too: a carried pid tuple passes every gate
    // while the pid itself is ephemeral — surface it rather than re-publishing it silently.
    for (const [id, route] of Object.entries(manifest.routes)) {
        if (route?.harnessTargetMetadata?.addressType === 'pid') {
            logger.log(`  WARN ${id}: carried pid tuple is ephemeral — re-run with --instance userDataDir to make it durable`);
        }
    }

    // The same reasoning as the skip loop below, one scope wider. That loop surfaces a seat whose
    // route was ATTEMPTED and produced nothing; this surfaces a seat that was never attempted at
    // all, because no subscription for it exists. Nothing else in this process would ever say so:
    // a manifest missing a seat is simply smaller than the roster, and a smaller set reads as
    // information to nobody. That silence is how a live seat spent its whole existence receiving
    // another seat's wakes and none of its own.
    //
    // Never fails the build. A missing route is a provisioning gap, not a manifest defect, and
    // failing closed here would block route generation for every other seat because one is
    // unprovisioned. It also cannot self-heal: `manage_wake_subscription` acts on the CALLER, so a
    // seat's row can only be minted by that seat — which is why the line says so rather than
    // sending the reader to a tool that cannot act for them.
    const unrouted = collectUnroutedEligibleIdentities({
        routedIdentities: Object.values(manifest.routes).map(route => route?.agentIdentity)
    });

    for (const identity of unrouted) {
        logger.log(`  WARN ${identity}: wake-eligible with no route — that seat must run ` +
                   `manage_wake_subscription({action:'subscribe'}) itself; the tool acts on the caller`);
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
