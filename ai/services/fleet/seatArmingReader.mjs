import {loadWakeReceiverManifest} from '../../daemons/wake/receiver.mjs';

/**
 * @module ai/services/fleet/seatArmingReader
 * @summary The seat-arming bulk read for the decomposed wake-routes source: a seat is ARMED iff the
 * published wake-receiver manifest carries a loader-valid route for its identity.
 *
 * The seat-side surface already exists — `armSeatWakeRoute` derives the GUI instance tuple,
 * `buildReceiverManifest` publishes a loader-validated 0600 route manifest, and the receiver boots
 * on exactly that file. This reader deliberately goes through the receiver's OWN loader
 * (`loadWakeReceiverManifest`) rather than parsing the file itself: a second parser able to
 * disagree with the receiver about what "valid" means is the two-resolvers-one-value defect the
 * config SSOT retired, one layer up. Whatever the loader refuses (wrong mode, wrong shape, missing
 * signing key) is an UNKNOWN arming state with the reason — never a guessed row.
 *
 * **The manifest carries HMAC signing keys, and this projection is structurally incapable of
 * leaking them:** every row is BUILT from an explicit field allowlist (`routeCount`, `adapter`,
 * `appName`, `addressType`) — never a spread of the route object — and a negative spec asserts the
 * resolved answer contains no key material. The guard is the shape; the spec proves the omission.
 *
 * Answer contract (mirrors the terminal-failures resolver the wake-routes source already consumes):
 * `{state: 'observed'|'unknown', reason, byIdentity: Map<'@identity', row>}`. A seat absent from a
 * healthy map is genuinely UNARMED — that judgment belongs to the consuming axis, not this reader.
 */

/**
 * @summary Normalizes a manifest identity to the fleet's `@`-prefixed wake-identity convention.
 * @param {String} value Route `agentIdentity` — with or without the leading `@`.
 * @returns {String|null}
 */
export function normalizeWakeIdentity(value) {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim().replace(/^@+/, '');

    return trimmed ? `@${trimmed}` : null
}

/**
 * @summary Builds the bulk seat-arming resolver over the published receiver manifest.
 * @param {Object} options
 * @param {String} options.manifestPath Absolute path of the 0600 receiver route manifest. The
 *     coordinate is deployment-declared through ONE env name — `NEO_WAKE_RECEIVER_MANIFEST`, bound
 *     by the `fleet.wakeReceiverManifestPath` leaf and the same export the receiver's plist is
 *     materialized from — and the composing wiring owns construction; a deployment declaring no
 *     local wake lane never constructs the reader, leaving the arming axis typed-unobserved.
 * @param {Function} [options.loadManifest=loadWakeReceiverManifest] Loader seam for tests. The
 *     default is the receiver's own loader — mode-enforcing, shape-enforcing.
 * @returns {Function} `resolveSeatArming() => Promise<{state, reason, byIdentity}>`
 */
export function createSeatArmingReader({manifestPath, loadManifest = loadWakeReceiverManifest} = {}) {
    if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
        throw new TypeError('createSeatArmingReader requires a manifestPath');
    }

    return async function resolveSeatArming() {
        let manifest;

        try {
            manifest = await loadManifest(manifestPath);
        } catch (error) {
            // Absent file, wrong mode, and rejected shape all land here — the loader's refusal IS
            // the diagnosis, and fabricating per-seat rows from a file the receiver would not boot
            // on would report an arming state no wake could ever traverse.
            return {
                state     : 'unknown',
                reason    : String(error?.message || error || 'wake receiver manifest unreadable'),
                byIdentity: new Map()
            };
        }

        const byIdentity = new Map();

        for (const route of Object.values(manifest.routes)) {
            const identity = normalizeWakeIdentity(route?.agentIdentity);

            if (!identity) continue;

            const existing = byIdentity.get(identity);

            if (existing) {
                // Multiple subscriptions for one seat are one armed seat with more routes; the
                // first route's metadata stands — the axis answers "armed via what", not a roster
                // of every address.
                existing.routeCount++;
                continue
            }

            const metadata = route.harnessTargetMetadata ?? {};

            // Explicit allowlist, never a spread: the route object carries `signingKey`, and a
            // projection that copies unknown fields forward is one refactor away from publishing it.
            byIdentity.set(identity, {
                routeCount : 1,
                adapter    : typeof metadata.adapter     === 'string' ? metadata.adapter     : null,
                appName    : typeof metadata.appName     === 'string' ? metadata.appName     : null,
                addressType: typeof metadata.addressType === 'string' ? metadata.addressType : null
            });
        }

        return {state: 'observed', reason: null, byIdentity}
    }
}

export default createSeatArmingReader;
