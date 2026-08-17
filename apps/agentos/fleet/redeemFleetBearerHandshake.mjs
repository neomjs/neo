/**
 * @module apps/agentos/fleet/redeemFleetBearerHandshake
 * @summary The browser half of the one-command bearer hand-off: redeem the Fleet process bearer
 * from the transport's armed handshake endpoint (`GET /fleet/handshake`) so the cockpit boot can
 * receive its bearer with no agent in the loop — no Neural Link injection, no Electron shell, no
 * hand-carried env var. The boot holds the redeemed value module-privately; the launcher pre-boot
 * slot (`globalThis.AgentOS.fleet.bearerToken`) remains the ingress for EXTERNAL producers and is
 * retired once transport custody establishes (`./connectionProfiles.mjs` custody discipline).
 *
 * Trust posture, client half: the endpoint only answers armed launches (`fleet.bearerHandshake`,
 * armed by `ai/scripts/fleet/devCockpit.mjs`) and only for exact-allowlisted browser Origins — this
 * module simply asks once and treats every non-success as "no bearer". The result is held in
 * memory and handed to `installFleetBridge` as an argument; it is never persisted, logged, or
 * placed in a URL. Fail-closed by shape: any refusal, timeout, malformed body, or malformed token
 * resolves `null`, which boots the existing fail-closed bridge — the pre-handshake behavior,
 * exactly.
 *
 * Worker-realm module: no Node imports, no Neo import — mirrors its sibling
 * `installFleetBridge.mjs`, including the format-only bearer check (generation + constant-time
 * verification stay Node-side in `ai/mcp/server/shared/helpers/localBearer.mjs`), imported from
 * the shared contract module so the worker realm holds exactly one copy.
 */

import {FLEET_BEARER_PATTERN} from './connectionProfiles.mjs';

/**
 * @summary Redeem the launch credentials from an armed Fleet transport, or resolve `null`
 * fail-closed. The result carries the process bearer and, when the deployment armed one, the
 * viewer's class-3 MC mint — the pair the establish path binds into closure custody together.
 *
 * The handshake URL derives from the fleet endpoint's own origin (`<origin>/fleet/handshake`), so
 * the one URL authority the cockpit already resolves (`fleetUrl`) stays the only endpoint input —
 * no second host/port knob that can drift. The request is a plain GET (no custom headers → no
 * preflight); the browser attaches the page Origin itself, which is the fact the server's
 * exact-origin admission decides on.
 *
 * @param {Object}   opts
 * @param {String}   opts.url                          The absolute Fleet endpoint the cockpit dials
 *     (e.g. `http://127.0.0.1:8083/fleet`) — the handshake rides its origin.
 * @param {Function} [opts.fetchImpl=globalThis.fetch] Injectable fetch for tests.
 * @param {Number}   [opts.timeoutMs=1500]             Redemption patience: an absent transport
 *     refuses the connection in milliseconds, so this bound only trims the hung-listener tail.
 * @returns {Promise<{bearerToken: String, mcAuthorization: String|null}|null>} the redeemed pair
 *     (`mcAuthorization: null` = the honest not-armed state), or `null` on every non-success path.
 */
export async function redeemFleetBearerHandshake({url, fetchImpl = globalThis.fetch, timeoutMs = 1500} = {}) {
    let handshakeUrl;

    try {
        handshakeUrl = new URL('/fleet/handshake', new URL(url).origin)
    } catch {
        return null
    }

    try {
        const response = await fetchImpl(handshakeUrl.href, {
            cache : 'no-store',
            signal: AbortSignal.timeout(timeoutMs)
        });

        if (!response.ok) {
            return null
        }

        const envelope = await response.json(),
              token    = envelope?.ok === true ? envelope.result?.bearerToken : null;

        if (typeof token !== 'string' || !FLEET_BEARER_PATTERN.test(token)) {
            return null
        }

        // The optional viewer mint rides the same envelope. A malformed or bearer-identical value
        // is STRIPPED, never adopted: the class-1 redemption stays valid, the boot proceeds
        // honestly not-armed, and the server-side startup refusal owns the loud path.
        const mint = envelope.result?.mcAuthorization;

        return {
            bearerToken    : token,
            mcAuthorization: typeof mint === 'string' && mint.trim() && mint !== token ? mint : null
        }
    } catch {
        // Refused connection (no transport), abort (hung listener), or non-JSON body — all the
        // same honest answer: no credentials, boot fail-closed.
        return null
    }
}
