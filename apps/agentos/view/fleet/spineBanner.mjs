/**
 * @module apps/agentos/view/fleet/spineBanner
 * @summary The cockpit's per-SPINE honesty line: derives ONE shell-level status from the
 * owner-held surface truths, so the surface names WHY it shows static (derived, offline) or
 * last-known data instead of failing silent. Render-only over existing truth — this module
 * produces no probes.
 *
 * Precedence: a `sample` GRID (the roster itself is seed data — cold) beats `daemon` (a Brain
 * daemon down) beats `stale` on either surface (reachable but degraded) beats a `sample` STREAM
 * under a live roster (the feed is pending; the roster is provably live) beats `live`. A fully
 * live spine renders NOTHING — nominal earns zero pixels, the same exception-based discipline the
 * cards follow. Per-AGENT truth (wake/throttle telltales) is a different surface.
 *
 * **A verdict may only speak for the surface that produced it.** The cold family's copy
 * makes ROSTER claims ("showing the static roster") and SERVER claims ("Fleet server offline"),
 * so only a sample GRID may enter it: with the roster live on screen, a sample activity stream
 * rendering that copy was the module's own documented lie class in its third instance — observed
 * live over a wire-fed 9-agent roster with real presence bands. The stream's own verdict names
 * the stream, states the roster fact that falsifies the old copy, and ranks BELOW the daemon line
 * (a dead daemon is usually why a feed never went live — same diagnosis-over-symptom rule as
 * `stale`).
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
 * Mirrors `harness/appLifecycle.mjs`'s `BRAIN_STATES` minus the nominal one. Exported so the
 * header's aggregate attention fold reads the SAME fault set — one authority, two consumers.
 * @type {String[]}
 */
export const DAEMON_FAULT_STATES = Object.freeze(['degraded', 'stopped']);

/**
 * @summary Picks the cold-case fallback line for SILENCE, from the topology that owns the truth.
 *
 * The generic "start it: npm run ai:fleet-server" advice is only ever right in the plain-browser
 * flow. Inside the shell it is actively wrong in every branch: the shell SELF-SUPPLIES its
 * transport, so a manual start is what CAUSES the foreign-listener refusal — the fact object the
 * lifecycle owner hands over on the brain-health wire names which shell case is live instead.
 * `null` (no shell fact — plain browser, or an unreachable shell with no standing to assert one)
 * keeps the classic copy: there, silence really does imply a server the operator must start.
 * @param {Object|null} transport The shell transport-boot fact
 *     `{phase: 'starting'|'settled', mode, up, fleetPort, reason, error}`, or `null` outside the shell.
 * @returns {String}
 * @private
 */
function coldFallbackFor(transport) {
    if (!transport) {
        return 'Fleet server offline — showing the static roster · start it: npm run ai:fleet-server'
    }

    if (transport.phase === 'starting') {
        return 'Fleet transport starting — the cockpit connects automatically'
    }

    if (transport.mode === 'foreign-listener') {
        const port = transport.fleetPort ?? 'the fleet port';

        return `another fleet server holds port ${port} — quit it, then Reconnect · ${transport.reason || 'listener did not prove canonical Fleet identity'}`
    }

    if (transport.up !== true) {
        return `Fleet transport failed to start — showing the static roster${transport.error ? ` · ${transport.error}` : ''}`
    }

    return 'Fleet transport ready — cockpit loading · use Reconnect if this persists'
}

/**
 * @summary Derives the spine banner from the owner-held surface truths.
 * @param {Object} options
 * @param {{state: String, reason: ?String}} options.grid The roster surface: `'sample'|'stale'|'live'`
 *     plus the safe cause the owner retained for THAT surface, if it learned one.
 * @param {{state: String, reason: ?String}} options.stream The activity surface, same shape.
 * @param {{state: String, reason: ?String}} [options.daemon] Brain daemon health:
 *     `'running'|'degraded'|'stopped'`, with the diagnosis pointer as its reason. Optional — a caller
 *     that has not pulled daemon truth passes nothing rather than guessing `running`.
 * @param {Object|null} [options.transport] The shell transport-boot fact (see {@link coldFallbackFor}).
 *     Optional and `null`-safe — only the cold fallback consults it, so a retained surface reason
 *     still outranks any topology guess.
 * @returns {{hidden: Boolean, kind: String, text: String}} `kind` is `'live'|'cold'|'degraded'`
 *     — the class hook; `hidden` is `true` only for the fully live spine.
 */
export function deriveSpineBanner({daemon, grid, stream, transport = null}) {
    const surfaces = [grid, stream],
          states   = surfaces.map(surface => surface?.state);

    // Only a sample GRID enters the cold family: its copy asserts roster + server facts, and a
    // sample sibling stream has no standing to make either claim over a live roster.
    // Both-sample keeps the exact pre-partition behavior — the reason scan still covers both
    // surfaces, so a stream-retained cause surfaces when the grid learned none.
    if (grid?.state === 'sample') {
        const reason = reasonFor(surfaces, 'sample');

        return {
            hidden: false,
            kind  : 'cold',
            // Same discipline the `stale` line follows: name the retained cause when the owner HAS
            // one, guess only when it does not. A reachable server whose source is unconfigured
            // answers `not-wired` — the seed stays, so the data really is sample, but "start the
            // server" would be advice to restart a process that just replied. The fallback for
            // SILENCE is topology-owned: the shell's transport fact picks the honest line, and
            // only the plain-browser flow keeps the classic "start the server" advice.
            text: reason
                ? `Fleet data unavailable — showing the static roster · ${reason}`
                : coldFallbackFor(transport)
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

    // The stream's own verdict: reachable here only with a LIVE grid (sample/stale grids returned
    // above), so "roster is live" is true by construction — the fact that falsifies the old cold
    // copy this case used to render. A pending feed is not an incident: `degraded` skin, and the
    // transport fact is deliberately not consulted (it belongs to the cold family alone).
    if (stream?.state === 'sample') {
        const reason = reasonFor([stream], 'sample');

        return {
            hidden: false,
            kind  : 'degraded',
            text  : reason
                ? `Activity feed pending — roster is live · ${reason}`
                : 'Activity feed pending — roster is live'
        }
    }

    return {hidden: true, kind: 'live', text: ''}
}

export default deriveSpineBanner;
