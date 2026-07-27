import net from 'node:net';

/**
 * @module ai/services/memory-core/helpers/loopbackFamilyProbe
 * @summary Observes which loopback address families actually accept a TCP connection on a port, so a
 * bind-family mismatch is readable from a boot log instead of costing the operator a separate `lsof`.
 *
 * ## The asymmetry this exists to name
 *
 * A listener bound to `[::1]` **refuses** an IPv4 client, and a listener bound to `127.0.0.1` refuses
 * an IPv6 one. Neither logs anything unusual: the client sees `ECONNREFUSED`, which is the same error
 * a genuinely absent service produces. So a running store is indistinguishable from a dead one from
 * the dialing side alone — and the failure mode is cheap to hit and expensive to guess at. It has
 * produced repeated "Chroma is down" misdiagnoses against a store that was up the whole time,
 * answering on the family nobody probed.
 *
 * The fix is not better wording. It is a second observation: dial **both** families and report which
 * one answered. That converts an unfalsifiable "it's refused" into "you dial X; a listener answered
 * at Y", which is the whole diagnosis in one line.
 *
 * ## Why probing and classifying are separate exports
 *
 * `probeLoopbackFamilies` performs I/O; `classifyLoopbackObservation` is pure. Splitting them means
 * every verdict — including the ones a local host can never reproduce, like "IPv6 answered and IPv4
 * did not" — is exhaustively unit-testable with no sockets and no seam at all. Only the probe half
 * needs an injected `connect`, and the classification half needs nothing.
 *
 * ## Claims are fail-closed
 *
 * A timeout is **not** treated as "nothing is listening". On loopback a timeout is anomalous (a
 * refused connection returns in well under a millisecond), so it means the probe learned nothing —
 * not that the family is empty. Reporting "no listener on 127.0.0.1" off a timeout would be exactly
 * the unverified assertion this module exists to retire. Unknown families therefore suppress the
 * mismatch verdict rather than contributing to it: the diagnostic goes quiet instead of guessing, and
 * the caller keeps its existing wording.
 *
 * Neo-free and config-free by construction: every input arrives as an argument. That keeps the unit
 * spec off the config singleton entirely and keeps this reusable from any process that dials a local
 * service — the orchestrator's Chroma supervision has the same blind spot.
 */

/**
 * Probe budget per family, in milliseconds.
 *
 * Stated here as a literal with its derivation rather than read from config, because this bound is a
 * property of the *measurement* and not an operator preference: on the reference host an IPv4 connect
 * to an IPv6-only listener refuses in ~0.3ms and a successful IPv6 connect answers in ~1.2ms, so
 * 250ms is ~200x the observed answer time. That is generous enough to survive a loaded host and small
 * enough to be invisible on a path that has *already* failed a health check.
 *
 * Both families are probed concurrently, so the wall-clock ceiling for the whole observation is this
 * value, not twice it.
 * @member {Number} LOOPBACK_PROBE_TIMEOUT_MS
 */
export const LOOPBACK_PROBE_TIMEOUT_MS = 250;

/**
 * Key under `health.database.connection` that carries the classified observation.
 *
 * Shared rather than spelled twice because producer and consumer live in different layers
 * (`HealthService` writes it, the memory-core `Server` reads it) and a rename on one side would fail
 * **silently**: the diagnostic would simply stop printing while both unit specs stayed green, since
 * neither exercises the other's file. Importing one constant makes that divergence impossible instead
 * of merely detectable.
 * @member {String} LOOPBACK_PROBE_HEALTH_KEY
 */
export const LOOPBACK_PROBE_HEALTH_KEY = 'loopbackProbe';

/**
 * @summary True when a host names the local machine's loopback interface.
 *
 * Gating the probe on this is what keeps container deployments untouched: in a compose network the
 * configured host is a **service name** (`chroma`), so no loopback claim could say anything true about
 * it, and the probe never runs at all rather than running and being ignored.
 * @param {String} host Configured host.
 * @returns {Boolean}
 */
export function isLoopbackHost(host) {
    return classifyLoopbackHost(host).kind !== 'not-loopback';
}

/**
 * @summary Classifies a configured host into the loopback form it actually is, by PARSING it.
 *
 * Prefix matching was wrong in both directions: `startsWith('127.')` admitted non-addresses like
 * `127.abc` and `127.0.0.1.example.com`, while the probe simultaneously hard-coded `127.0.0.1` — so a
 * server configured for `127.0.0.5` was probed at, and had its verdict reported as, an address it never
 * dials. A diagnostic that names the wrong address is worse than none.
 *
 * The whole `127.0.0.0/8` block is genuine loopback, so it stays supported — but the **configured
 * literal** is carried through rather than normalised away.
 * @param {String} host Configured host.
 * @returns {Object} `{kind: 'ipv4'|'ipv6'|'resolver'|'not-loopback', literal?}`
 */
export function classifyLoopbackHost(host) {
    const raw = String(host ?? '').trim();

    // Brackets must be BALANCED. Stripping a leading `[` or a trailing `]` independently admitted
    // `[::1` and `::1]`, which are not authorities at all — a half-bracketed host is malformed input,
    // not an IPv6 literal, and admitting it would have the probe dial a string Node cannot parse.
    if ((raw.startsWith('[') || raw.endsWith(']')) && !(raw.startsWith('[') && raw.endsWith(']') && raw.length > 2)) {
        return {kind: 'not-loopback'};
    }

    const bracketed = raw.startsWith('[') && raw.endsWith(']'),
          value     = (bracketed ? raw.slice(1, -1) : raw).toLowerCase();

    if (value === 'localhost') return {kind: 'resolver', literal: 'localhost'};

    // `net.isIP` IS THE AUTHORITY, not a hand-written dotted-quad regex. Mine accepted
    // `127.000.000.001` and `127.01.2.3` — leading-zero octets that Node rejects outright, so the probe
    // would have dialled a host the runtime does not consider an address. Delegating means this cannot
    // disagree with the stack that opens the socket.
    const family = net.isIP(value);

    // `::1` only. Other spellings of IPv6 loopback (`0:0:0:0:0:0:0:1`) are valid addresses that Node
    // accepts, and they are deliberately classified not-loopback rather than normalised here: declining
    // to probe is a quiet, safe outcome, whereas an address normaliser inside a diagnostic is a second
    // parser to keep correct. Stated as a limit rather than left as a surprise.
    if (family === 6) return value === '::1' ? {kind: 'ipv6', literal: '::1'} : {kind: 'not-loopback'};

    // The whole 127.0.0.0/8 block is loopback, and the CONFIGURED literal is carried through.
    if (family === 4 && value.startsWith('127.')) return {kind: 'ipv4', literal: value};

    return {kind: 'not-loopback'};
}

/**
 * @summary Builds the family list to probe, carrying the CONFIGURED IPv4 literal when there is one.
 *
 * A `127.0.0.5` deployment gets `127.0.0.5` probed and reported. Only when the configured host supplies
 * no IPv4 literal of its own (`::1`, or resolver-decided `localhost`) does the canonical `127.0.0.1`
 * stand in — and then it is the honest choice, because nothing else was specified.
 * @param {String} host Configured host.
 * @returns {Object[]} `[{family, host, label}]`, IPv4 first.
 */
export function resolveLoopbackFamilies(host) {
    const classified = classifyLoopbackHost(host),
          ipv4       = classified.kind === 'ipv4' ? classified.literal : '127.0.0.1';

    return [
        {family: 4, host: ipv4,  label: ipv4},
        {family: 6, host: '::1', label: '[::1]'}
    ];
}

/**
 * @summary Real TCP connect seam: resolves `true` when a listener accepted, `false` when it refused.
 *
 * Only a **refusal** is reported as an empty family. Every other outcome — a timeout, or any error
 * code other than `ECONNREFUSED` — rejects, so the caller records that family as *unknown* instead of
 * asserting it is empty. See the fail-closed note in the module summary.
 *
 * The socket is destroyed on every path and unref'd immediately, so a probe can never hold the event
 * loop open on a boot path even if the remote never answers.
 * @param {Object} spec
 * @param {String} spec.host      Dial host.
 * @param {Number} spec.port      Dial port.
 * @param {Number} spec.timeoutMs Per-family budget.
 * @returns {Promise<Boolean>} `true` accepted, `false` refused; rejects when the outcome is unknown.
 */
export function tcpConnectProbe({host, port, timeoutMs}) {
    return new Promise((resolve, reject) => {
        const socket  = net.connect({host, port});
        let   settled = false;

        const settle = (fn, value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            fn(value);
        };

        socket.unref();
        socket.setTimeout(timeoutMs, () => settle(reject, new Error(`connect to ${host}:${port} timed out after ${timeoutMs}ms`)));
        socket.once('connect', () => settle(resolve, true));
        socket.once('error', error => error?.code === 'ECONNREFUSED' ? settle(resolve, false) : settle(reject, error));
    });
}

/**
 * @summary Dials every loopback family on `port` and reports which ones answered.
 *
 * Never throws. Every refusal path — bad arguments, a non-loopback host, a broken seam — returns a
 * `probed: false` observation carrying the reason, because this runs on a boot path whose whole
 * purpose is reporting a failure: a diagnostic that can itself fail the boot is worse than no
 * diagnostic. The seam is a **required** argument rather than a defaulted one so no caller can
 * silently acquire real sockets it did not ask for.
 * @param {Object}   spec
 * @param {String}   spec.host      Configured host, used only to decide whether probing is meaningful.
 * @param {Number}   spec.port      Port to dial on each family.
 * @param {Number}   spec.timeoutMs Per-family budget; pass {@link LOOPBACK_PROBE_TIMEOUT_MS}.
 * @param {Function} spec.connect   Connect seam with {@link tcpConnectProbe}'s contract.
 * @returns {Promise<Object>} `{probed, host, port, reason?, families?}`
 */
export async function probeLoopbackFamilies({host, port, timeoutMs, connect} = {}) {
    const refuse = reason => ({probed: false, host, port, reason});

    if (!isLoopbackHost(host)) {
        return refuse(`configured host ${host ?? '(unset)'} is not a loopback address; a loopback probe cannot describe it`);
    }

    if (!Number.isInteger(port) || port <= 0) {
        return refuse(`port must be a positive integer, received ${JSON.stringify(port)}`);
    }

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return refuse(`timeoutMs must be a positive finite number, received ${JSON.stringify(timeoutMs)}`);
    }

    if (typeof connect !== 'function') {
        return refuse('connect seam is required; pass tcpConnectProbe for real sockets');
    }

    const families = await Promise.all(resolveLoopbackFamilies(host).map(async entry => {
        try {
            const answered = await connect({host: entry.host, port, timeoutMs});

            // A seam that resolves anything but a boolean has not answered the question asked, so its
            // family stays unknown rather than being coerced into a claim.
            return typeof answered === 'boolean' ? {...entry, answered} : {...entry, answered: null, error: `connect seam resolved a non-boolean (${typeof answered})`};
        } catch (error) {
            return {...entry, answered: null, error: error?.message || String(error)};
        }
    }));

    return {probed: true, host, port, families};
}

/**
 * @summary Turns an observation into a verdict, asserting a mismatch only when one is provable.
 *
 * `conclusive` is the signal a caller uses to decide whether its fallback guidance (an `lsof`
 * invocation for the operator to run) is now redundant. It is true only for verdicts that answer the
 * question `lsof` was there to answer — never for `inconclusive` or `skipped`, where the operator
 * still needs the manual command.
 *
 * Verdicts:
 * - `mismatch` — the dialed family is empty and the other one answered. The diagnosis, provable.
 * - `no-listener` — both families definitively refused; the service really is not accepting locally.
 * - `listener-reachable` — the dialed family answered, so the port is live and the fault is above TCP.
 * - `ambiguous-host` — host is `localhost`, whose family is chosen by the resolver; facts, no claim.
 * - `inconclusive` — at least one family is unknown, so no verdict is safe.
 * - `skipped` — probing was refused (non-loopback host, bad input, missing seam).
 * @param {Object} observation Result of {@link probeLoopbackFamilies}.
 * @returns {Object} `{verdict, conclusive, dialed, answering, empty, unknown, reason?}`
 */
export function classifyLoopbackObservation(observation) {
    const {probed, host, port, reason, families} = observation || {};

    if (!probed || !Array.isArray(families)) {
        return {verdict: 'skipped', conclusive: false, reason: reason || 'no observation was taken'};
    }

    const answering  = families.filter(entry => entry.answered === true).map(entry => entry.label),
          empty      = families.filter(entry => entry.answered === false).map(entry => entry.label),
          unknown    = families.filter(entry => entry.answered === null).map(entry => entry.label),
          classified = classifyLoopbackHost(host),
          // `resolver` (localhost) has no observable dialed family — the resolver picks it, and that
          // choice is not visible here, so no mismatch may be asserted. An ipv4/ipv6 literal matches
          // the family carrying that exact literal, so a 127/8 deployment reports its OWN address.
          dialed    = classified.kind === 'ipv4' || classified.kind === 'ipv6'
              ? families.find(entry => entry.host === classified.literal)
              : null,
          base      = {dialed: dialed?.label || String(host ?? ''), answering, empty, unknown, port};

    if (unknown.length > 0) {
        return {...base, verdict: 'inconclusive', conclusive: false, reason: `no result for ${unknown.join(', ')}`};
    }

    if (answering.length === 0) {
        return {...base, verdict: 'no-listener', conclusive: true};
    }

    // `localhost` resolution order decides which family is dialed, and it is not observable from
    // here — so the families that answered are reported as facts without a mismatch claim.
    if (!dialed) {
        return {...base, verdict: 'ambiguous-host', conclusive: true};
    }

    return dialed.answered
        ? {...base, verdict: 'listener-reachable', conclusive: true}
        : {...base, verdict: 'mismatch', conclusive: true};
}
