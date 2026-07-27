/**
 * @module apps/agentos/view/fleet/spineBanner
 * @summary The cockpit's per-SPINE honesty line: derives ONE shell-level status from the
 * owner-held surface truths, so the surface names WHY it shows static (derived, offline) or
 * last-known data instead of failing silent. Render-only over existing truth — this module
 * produces no probes.
 *
 * Precedence: `sample` (unreachable — cold) beats `daemon` (a Brain daemon down) beats `stale`
 * (reachable but degraded) beats `live`. A fully live spine renders NOTHING — nominal earns zero
 * pixels, the same exception-based discipline the cards follow. Per-AGENT truth (wake/throttle
 * telltales) is a different surface.
 *
 * ## Why daemon health joins a line that used to speak only for the transport
 *
 * The shell spec requires that a daemon going down surfaces as a tray-state change **plus ONE
 * cockpit banner with the diagnosis pointer — never a popup storm**. "One banner" is the whole
 * requirement, so a second banner component would violate the spec it was added to satisfy. This
 * line is the cockpit's single honesty surface, so daemon health belongs here, following the same
 * per-surface-reason discipline as the other two rather than as a special case.
 *
 * **A dead daemon outranks a stale feed because it usually CAUSES one.** Reporting "feed degraded"
 * while a daemon is down names the symptom and drops the diagnosis, which is precisely the pointer
 * the spec asks for. It sits below `sample` because an unreachable transport cannot have answered a
 * daemon-status pull in the first place — the two are near-exclusive, and when the server is silent
 * "start the server" is the actionable line.
 *
 * **Daemon silence renders nothing, and does not claim health.** An absent daemon surface is
 * unknown, not nominal — but inventing a degradation from missing information is a false alarm, and
 * the transport line already speaks when the server is silent (that is exactly the `sample` case).
 * So absence stays quiet here and the operator still gets told, by the surface that actually knows.
 *
 * **`degraded` is reused as the `kind` rather than minting a fourth.** The severity is the same and
 * the existing skin already carries it; the DIAGNOSIS travels in the text, where a screen reader
 * reaches it. Distinguishing a dead daemon from a stale feed by colour alone would be a WCAG 1.4.1
 * failure, and the tray state carries the state distinction the spec pairs this banner with.
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
 * Brain daemon states that warrant the banner. `running` is nominal and earns zero pixels; an absent
 * or unrecognised state is UNKNOWN and also stays quiet — see the module note on daemon silence.
 * Mirrors `harness/appLifecycle.mjs`'s `BRAIN_STATES` minus the nominal one.
 * @type {String[]}
 */
const DAEMON_FAULT_STATES = Object.freeze(['degraded', 'stopped']);

/**
 * @summary Derives the spine banner from the owner-held surface truths.
 * @param {Object} options
 * @param {{state: String, reason: ?String}} options.grid The roster surface: `'sample'|'stale'|'live'`
 *     plus the safe cause the owner retained for THAT surface, if it learned one.
 * @param {{state: String, reason: ?String}} options.stream The activity surface, same shape.
 * @param {{state: String, reason: ?String}} [options.daemon] Brain daemon health:
 *     `'running'|'degraded'|'stopped'`, with the diagnosis pointer as its reason. Optional — a caller
 *     that has not pulled daemon truth passes nothing rather than guessing `running`.
 * @returns {{hidden: Boolean, kind: String, text: String}} `kind` is `'live'|'cold'|'degraded'`
 *     — the class hook; `hidden` is `true` only for the fully live spine.
 */
export function deriveSpineBanner({daemon, grid, stream}) {
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
                ? `Fleet data unavailable — showing the static roster · ${reason}`
                : 'Fleet server offline — showing the static roster · start it: npm run ai:fleet-server'
        }
    }

    // ABOVE `stale` deliberately: a dead daemon is usually what MADE the feed stale, so reporting the
    // feed alone would name the symptom and drop the diagnosis pointer the spec requires. Read from
    // its own surface via the same helper, so the daemon's cause can never be supplied or silenced by
    // a transport sibling.
    if (DAEMON_FAULT_STATES.includes(daemon?.state)) {
        const reason = reasonFor([daemon], daemon.state),
              // The state is part of the sentence, not just the class: `stopped` and `degraded` are
              // different operator situations (nothing running vs something wrong), and a banner that
              // said only "degraded" for both would make the tray the sole place that distinction
              // exists — unreachable to a screen reader.
              label  = daemon.state === 'stopped' ? 'stopped' : 'degraded';

        return {
            hidden: false,
            kind  : 'degraded',
            // Same reason-or-fallback discipline as the transport lines. The fallback names WHERE to
            // look rather than what to run: unlike the fleet server there is no single restart verb
            // that is right for every daemon, and printing a confident wrong command is worse than
            // pointing at the surface that knows which daemon died.
            text: reason
                ? `Agent OS ${label} — showing the cockpit over a partial organism · ${reason}`
                : `Agent OS ${label} — showing the cockpit over a partial organism · check the tray state and the daemon log`
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
