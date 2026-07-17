/**
 * @module apps/agentos/view/fleet/spineBanner
 * @summary The cockpit's per-SPINE honesty line: derives ONE shell-level status from the
 * owner-held surface truths, so the surface names WHY it shows sample or last-known data
 * instead of failing silent. Render-only over existing truth — this module produces no probes.
 *
 * Precedence: `sample` (unreachable — cold) beats `stale` (reachable but degraded) beats `live`.
 * A fully live spine renders NOTHING — nominal earns zero pixels, the same exception-based
 * discipline the cards follow. Per-AGENT truth (wake/throttle telltales) is a different surface;
 * this line only speaks for the fleet transport itself.
 *
 * **A reason belongs to a SURFACE, never to the spine.** This module used to take one loose
 * `degradedReason` alongside two loose states, and that shape had a race it could not express: the
 * roster and the activity feed answer independently, so a healthy roster completing after a
 * not-wired activity would erase the activity's cause and drop the line back to "server offline" —
 * the exact lie the retained reason exists to prevent. Pairing each state with its own reason makes
 * that unrepresentable rather than merely fixed: the line reports the cause of the surface that
 * actually decided the verdict.
 */

/**
 * @summary Picks the reason of the surface that DECIDED this verdict — never a sibling's.
 *
 * The first matching surface that carries a cause wins. A sibling in a different state has nothing
 * to say about this one, and a sibling in the SAME state that learned no cause must not silence one
 * that did.
 * @param {Object[]} surfaces
 * @param {String} state
 * @returns {String|null}
 * @private
 */
function reasonFor(surfaces, state) {
    for (const surface of surfaces) {
        if (surface?.state === state) {
            const reason = typeof surface.reason === 'string' && surface.reason.trim();

            if (reason) return reason
        }
    }

    return null
}

/**
 * @summary Derives the spine banner from the two owner-held surface truths.
 * @param {Object} options
 * @param {{state: String, reason: ?String}} options.grid The roster surface: `'sample'|'stale'|'live'`
 *     plus the safe cause the owner retained for THAT surface, if it learned one.
 * @param {{state: String, reason: ?String}} options.stream The activity surface, same shape.
 * @returns {{hidden: Boolean, kind: String, text: String}} `kind` is `'live'|'cold'|'degraded'`
 *     — the class hook; `hidden` is `true` only for the fully live spine.
 */
export function deriveSpineBanner({grid, stream}) {
    const surfaces = [grid, stream],
          states   = surfaces.map(surface => surface?.state);

    if (states.includes('sample')) {
        const reason = reasonFor(surfaces, 'sample');

        return {
            hidden: false,
            kind  : 'cold',
            // Same discipline the `stale` line follows: name the retained cause when the owner HAS
            // one, guess only when it does not. A reachable server whose source is unconfigured
            // answers `not-wired` — the seed stays, so the data really is sample, but "start the
            // server" would be advice to restart a process that just replied. The generic copy is
            // the fallback for SILENCE, which is the only state that actually implies an offline
            // server.
            text: reason
                ? `Fleet data unavailable — showing sample data · ${reason}`
                : 'Fleet server offline — showing sample data · start it: npm run ai:fleet-server'
        }
    }

    if (states.includes('stale')) {
        const reason = reasonFor(surfaces, 'stale');

        return {
            hidden: false,
            kind  : 'degraded',
            text  : reason
                ? `Fleet feed degraded — showing last-known data · ${reason}`
                : 'Fleet feed degraded — showing last-known data'
        }
    }

    return {hidden: true, kind: 'live', text: ''}
}

export default deriveSpineBanner;
