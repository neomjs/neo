import {createFleetProfile, retireBearerIngressSlot} from './connectionProfiles.mjs';
import {installFleetBridge}                          from './installFleetBridge.mjs';

/**
 * @module apps/agentos/fleet/fleetSessionCustody
 * @summary The session-only custody establish + the endpoint authority — extracted VERBATIM from
 * `app.mjs` so the instance-switch owner (`ViewportController`) can drive the same custody
 * machine without importing the boot module (`app.mjs` imports the Viewport, whose controller would
 * complete an import cycle through it). `app.mjs` re-exports both, so its module surface — and every
 * spec import — is unchanged.
 */

/**
 * @summary Resolves the Fleet endpoint from the boot window's serialized URL — the one endpoint
 * authority (`?fleetUrl=` override, else the pinned default) both the boot install and the
 * handshake redemption derive from.
 * @returns {String}
 */
export function resolveFleetUrl() {
    const params = new URLSearchParams(Neo.config.url.search);

    return params.has('fleetUrl') ? params.get('fleetUrl') : 'http://127.0.0.1:8083/fleet'
}

/**
 * @summary Establish session-only Fleet custody for one boot, healing pass, or deliberate instance
 * switch, with the full migration lifecycle made real:
 *
 * - **read-old / no-downgrade:** a bearer-less pass NEVER replaces an existing bridge — `onStart()`
 *   runs for every joining SharedWorker window, and after the first join retires the launcher slot
 *   a later join would otherwise overwrite the live capability with a fail-closed one. The ONE
 *   legitimate bearer-less replace is `deliberate: true` — an operator's explicit instance
 *   switch: there the new endpoint's fail-closed bridge IS the honest state ("chosen instance,
 *   not connected"), while preserving the old live bridge would be the old instance impersonating
 *   the operator's choice. The guard protects against ACCIDENT, never against decision.
 * - **establish:** the install moves the bearer into transport closures. With NO existing bridge
 *   the install publishes synchronously (there is nothing to displace, and the pane needs the
 *   fail-closed or live state immediately). With an existing bridge, the candidate is built
 *   DETACHED: an unproven credential must never displace a proven capability, so the published
 *   bridge stays the known-good one until the candidate verifies.
 * - **verify:** an authenticated `resolveViewerIdentity` round-trip through the NEW bridge — a
 *   constructed closure is not verification; only the server's stamped answer is. A detached
 *   candidate is PROMOTED only after this proof, by re-installing into the real target —
 *   `installFleetBridge` stays the slot's sole publisher.
 * - **retire:** the launcher pre-boot slot is cleared only after verify succeeds, and only while it
 *   still holds the exact established credential (the CAS guard) — a rejected bearer, an
 *   unreachable endpoint, and a value rotated in during verification all preserve the ingress,
 *   which IS the rollback truth. A throwing install preserves it the same way, and a failed
 *   candidate leaves the known-good bridge published.
 *
 * The function reads the ENTRYPOINT truth itself — the caller-provided handshake redemption result
 * plus the two launcher pre-boot slots (`AgentOS.fleet.bearerToken`, `AgentOS.fleet.mcAuthorization`)
 * — so the production path and the specs exercise the same read-old surface: both mints move into
 * closures at establish, and BOTH ingress copies are CAS-retired under the one custody proof.
 *
 * @param {Object}   opts
 * @param {String}   opts.fleetUrl                         Raw dial endpoint; identity derives from its canonical form.
 * @param {Object}   [opts.redeemed=null]                  The armed-handshake redemption PAIR
 *     (`{bearerToken, mcAuthorization}`), module-private in the boot path — each field takes
 *     precedence over its launcher slot; `null` falls back to the slots entirely.
 * @param {Boolean}  [opts.deliberate=false]               Operator-chosen instance switch: permits
 *     the one legitimate bearer-less REPLACE of a live bridge (see the no-downgrade bullet) —
 *     boot/heal paths never pass it.
 * @param {Function} [opts.installImpl=installFleetBridge] Injectable install for tests.
 * @param {Object}   [opts.target=globalThis]              Injectable global for tests.
 * @returns {Object} `{bridge, custodySettled, promoted, verified}` — the bridge PUBLISHED at return time
 *     (the fresh install, or the preserved known-good one while a candidate proves itself);
 *     `custodySettled`, a never-rejecting promise resolving `true` exactly when the bearer INGRESS
 *     was verified-retired (the boot/heal contract — a switch with a caller-provided bearer has no
 *     ingress slot, so it settles `false` there by design); and `verified`, resolving `true`
 *     exactly when the authenticated whoami round-trip proved the session — the switch owner's
 *     verdict. `promoted` additionally requires the detached candidate to retain compare-and-swap
 *     authority over the published bridge; a later operator switch wins even if the stale candidate
 *     authenticated successfully.
 */
export function establishFleetSessionCustody({fleetUrl, redeemed = null, deliberate = false, installImpl = installFleetBridge, target = globalThis} = {}) {
    const
        fleet           = target.AgentOS?.fleet,
        existing        = fleet?.registryBridge,
        bearerToken     = redeemed?.bearerToken ?? fleet?.bearerToken ?? null,
        mcAuthorization = redeemed?.mcAuthorization ?? fleet?.mcAuthorization ?? null;

    if (bearerToken === null && existing && !deliberate) {
        return {
            bridge        : existing,
            custodySettled: Promise.resolve(false),
            promoted      : Promise.resolve(false),
            verified      : Promise.resolve(false)
        }
    }

    const
        profile    = createFleetProfile({custodian: 'session-only', endpoint: fleetUrl}),
        // A deliberate switch publishes immediately: the operator chose the destination, so the
        // honest published state is the CHOSEN instance in whatever connection state it earns —
        // the detached-candidate dance protects healing passes on the SAME instance, not choice.
        publishNow = !existing || deliberate,
        bridge     = installImpl({url: fleetUrl, bearerToken, mcAuthorization, profileId: profile.profileId, target: publishNow ? target : {}});

    // ONE wire proof serves both verdicts: `verified` answers "did the server stamp this session"
    // (the switch owner's question); `custodySettled` chains the ingress-retire transaction onto it
    // (the boot owner's question) — never a second whoami.
    const verified = bearerToken === null
        ? Promise.resolve(false)
        : bridge.resolveViewerIdentity().then(() => true, () => false);

    const promoted = verified.then(ok => {
        if (!ok) {
            return false
        }

        if (!publishNow) {
            // The detached candidate began against `existing`. If another owner published a new
            // bridge while verification was in flight (operator switch, manual re-wire, another
            // successful heal), that newer choice has authority. Never let stale success overwrite it.
            if (target.AgentOS?.fleet?.registryBridge !== existing) {
                return false
            }

            installImpl({url: fleetUrl, bearerToken, mcAuthorization, profileId: profile.profileId, target})
        }

        return true
    });

    const custodySettled = promoted.then(didPromote => {
        if (!didPromote) {
            return false
        }

        // One proof gates BOTH retires: the class-3 mint has no boot-time wire proof of
        // its own (its truth surface is the stream's arming answer, observed later), so
        // its ingress copy retires with the session's proven custody transaction — and a
        // failed verify preserves both slots.
        mcAuthorization && retireBearerIngressSlot(target, {expected: mcAuthorization, field: 'mcAuthorization'});
        return retireBearerIngressSlot(target, {expected: bearerToken})
    });

    return {bridge: publishNow ? bridge : existing, custodySettled, promoted, verified}
}
