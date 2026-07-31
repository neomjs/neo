/**
 * @module ai/daemons/wake/buildReceiverManifest
 * @summary Builds a wake-receiver route manifest from live WAKE_SUB subscription records.
 *
 * The receiver refuses to start without a 0600 manifest whose routes carry a signing key, an agent
 * identity, harness metadata and an explicit attempt policy. Producing that by hand means copying
 * subscription records out of `manage_wake_subscription list`, inventing a key, and discovering the
 * shape rules one `throw` at a time — which is exactly how this module came to exist.
 *
 * **It imports nothing from the graph, Memory Core, or a database path**, mirroring the receiver's
 * own boundary: subscription records arrive as plain data from whoever queried them, so host-edge
 * tooling stays runnable without the container plane it is being wired to.
 *
 * **The generator validates its own output through the receiver's loader before publishing it.**
 * A manifest that the receiver would reject is never written to the target path — the temp file is
 * discarded instead. That closes the loop that otherwise only closes when the daemon fails to boot.
 *
 * **Signing keys never reach stdout or a log.** The manifest is the key material and is written
 * 0600; the summary reports a short fingerprint per route so two sides can be compared without
 * either printing the secret.
 */
import crypto from 'node:crypto';
import fs     from 'node:fs/promises';
import path   from 'node:path';

import {loadWakeReceiverManifest} from './receiver.mjs';

/**
 * Default per-attempt dispatch budget, in milliseconds.
 * The receiver requires a positive value at or below 300000; it declares no default of its own,
 * deliberately, so every route states its policy. This is the generator's stated choice, not a
 * hidden fallback inherited from the daemon.
 * @type {Number}
 */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 10000;

/**
 * Builds the manifest object for a set of subscription records.
 *
 * @summary Maps active WAKE_SUB records onto receiver routes, minting a signing key per route.
 * @param {Object}   config
 * @param {Object[]} config.subscriptions Records as returned by `manage_wake_subscription list`.
 * @param {Object}   [config.signingKeys={}] Existing `subscriptionId → key`, preserved rather than rotated.
 * @param {Number}   [config.attemptTimeoutMs=DEFAULT_ATTEMPT_TIMEOUT_MS]
 * @returns {{manifest: Object, routeSummaries: Object[]}}
 */
export function buildWakeReceiverManifest({
    subscriptions,
    signingKeys = {},
    attemptTimeoutMs = DEFAULT_ATTEMPT_TIMEOUT_MS
}) {
    if (!Array.isArray(subscriptions)) {
        throw new Error('buildWakeReceiverManifest requires a subscriptions array');
    }

    const routes         = {},
          routeSummaries = [];

    // Retired subscriptions are excluded rather than refused: a retired route is a normal historical
    // record, not a malformed one, and refusing the whole build over it would make the generator
    // unusable on any account with history.
    for (const subscription of subscriptions.filter(entry => entry?.status === 'active')) {
        const {id, agentIdentity, harnessTargetMetadata} = subscription;

        if (typeof id !== 'string' || !id.startsWith('WAKE_SUB:')) {
            throw new Error(`Subscription id '${id}' is not a WAKE_SUB identifier`);
        }

        if (typeof agentIdentity !== 'string' || !agentIdentity) {
            throw new Error(`Subscription '${id}' has no agentIdentity`);
        }

        if (!harnessTargetMetadata || typeof harnessTargetMetadata !== 'object') {
            throw new Error(`Subscription '${id}' has no harnessTargetMetadata`);
        }

        // Reuse an existing key when one is supplied. Rotating on every build would silently break
        // the container side, which signs with the key it was provisioned with.
        const signingKey = signingKeys[id] || crypto.randomBytes(32).toString('hex');

        routes[id] = {
            agentIdentity,
            signingKey,
            harnessTargetMetadata,
            adapterConfig: {attemptTimeoutMs}
        };

        routeSummaries.push({
            subscriptionId: id,
            agentIdentity,
            adapter       : harnessTargetMetadata.adapter ||
                            (process.platform === 'darwin' ? 'osascript' : 'tmux'),
            reusedKey     : Boolean(signingKeys[id]),
            keyFingerprint: fingerprintSigningKey(signingKey)
        });
    }

    if (!routeSummaries.length) {
        throw new Error('No active subscriptions produced a route; refusing to write an empty manifest');
    }

    return {manifest: {schemaVersion: 1, routes}, routeSummaries};
}

/**
 * @summary Produces a short, non-reversible fingerprint so two sides can compare keys without printing one.
 * @param {String} signingKey
 * @returns {String}
 */
export function fingerprintSigningKey(signingKey) {
    return crypto.createHash('sha256').update(signingKey).digest('hex').slice(0, 12);
}

/**
 * Writes the manifest 0600, but only after the receiver's own loader accepts it.
 *
 * @summary Publishes a manifest that is proven loadable, never one that merely looks right.
 * @param {Object} config
 * @param {Object} config.manifest
 * @param {String} config.targetPath Absolute destination.
 * @returns {Promise<String>} the written path
 */
export async function writeValidatedManifest({manifest, targetPath}) {
    if (!path.isAbsolute(targetPath || '')) {
        throw new Error('Manifest target path must be absolute');
    }

    const stagingPath = `${targetPath}.staging`;

    await fs.mkdir(path.dirname(targetPath), {recursive: true});
    await fs.writeFile(stagingPath, JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});

    try {
        // The receiver is the authority on whether this manifest is usable, so ask it rather than
        // re-implementing its rules here and letting the two drift.
        await loadWakeReceiverManifest(stagingPath)
    } catch (error) {
        await fs.rm(stagingPath, {force: true});
        throw new Error(`Refusing to publish a manifest the receiver rejects: ${error.message}`)
    }

    await fs.rename(stagingPath, targetPath);

    return targetPath
}

/**
 * Reads existing signing keys from a manifest so a rebuild does not rotate them.
 * @summary Keeps a rebuild non-breaking for a container already provisioned with these keys.
 * @param {String} manifestPath
 * @returns {Promise<Object>} `subscriptionId → signingKey`, empty when no readable manifest exists
 */
export async function readExistingSigningKeys(manifestPath) {
    try {
        const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

        return Object.fromEntries(
            Object.entries(existing?.routes || {})
                .filter(([, route]) => typeof route?.signingKey === 'string')
                .map(([id, route]) => [id, route.signingKey])
        )
    } catch {
        return {}
    }
}
