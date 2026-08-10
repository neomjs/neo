import {isLocalBearerToken, matchesLocalBearerToken} from '../../mcp/server/shared/helpers/localBearer.mjs';

/**
 * @module ai/services/fleet/fleetIngressAuth
 * @summary The Fleet HTTP ingress trust decision — one pure guard every request must pass BEFORE the
 * server reads a body byte or names a dispatch method.
 *
 * The threat model: loopback reachability is not authentication, bearer possession is not
 * viewer identity, and a browser-supplied viewer id is not authority. This module owns the first two
 * boundaries — transport admission (Host / Origin / bearer). Viewer identity is deliberately NOT
 * decided here: it is resolved once at trusted server bootstrap and stamped per-request by the
 * server, so nothing a caller sends can become an identity fact.
 *
 * Decision order is cheapest-reject-first and side-effect-free: Host allowlist (exact, port
 * included), then Origin policy (exact cockpit origin echoed with `Vary: Origin`; foreign or
 * literal-`null` origins refused; an ABSENT origin is admissible because the bearer still gates),
 * then the constant-time bearer check via the shared `localBearer` primitives (canonical 32-byte
 * unpadded base64url; length-mismatched values fail closed before the equal-length compare).
 * CORS preflights (`OPTIONS`) cannot carry an `Authorization` header, so they are admitted on
 * Host + Origin alone — a preflight grants nothing: no body is read, no method dispatches, and the
 * echoed headers only permit the real request to present its bearer. When the launcher arms the
 * browser bearer handshake (`bearerHandshake`), `GET /fleet/handshake` is additionally admitted on
 * Host + a present-and-allowlisted Origin — the single deliberate pre-bearer admission, documented
 * as the Option-B dev-mode custody widening on the `fleet.bearerHandshake` config leaf.
 *
 * The guard returns a decision object; applying it (status codes, headers, socket teardown) stays
 * the transport's job. Pure data-plane module by design — no Neo import, no config read, no state.
 */

/**
 * @summary Builds the per-request admission decision function for one Fleet server process.
 *
 * @param {Object}   options
 * @param {String}   options.bearerToken The process-lifetime secret (canonical 32-byte unpadded
 *     base64url). Anything else throws — a Fleet ingress without a valid bearer must not construct.
 * @param {String[]} options.allowedOrigins Exact cockpit origins (scheme://host[:port]) the browser
 *     app may call from. Compared verbatim — no wildcard, no suffix logic.
 * @param {Function} options.resolveAllowedHosts Returns the iterable of exact `Host` header values
 *     admitted right now. A thunk because the bound port is only known after `listen` (ephemeral
 *     port 0 in tests); resolving late keeps the guard honest instead of freezing a guess.
 * @param {Boolean}  [options.bearerHandshake=false] Arms the browser bearer-handshake admission:
 *     `GET /fleet/handshake` is then admitted on Host + a PRESENT-and-allowlisted Origin — stricter
 *     than preflight, which tolerates an absent Origin. The handshake exists to hand the bearer to
 *     a browser page, so a caller that states no browser origin has no business on the path; the
 *     boot probe and every non-browser caller keep using the bearer-gated routes. Unarmed
 *     (default), the path has no special admission and falls through to the bearer check —
 *     byte-identical to the pre-handshake surface.
 * @returns {Function} `admit(req)` → `{admitted: true, corsOrigin: String|null}` (plus
 *     `handshake: true` on an armed handshake admission) or
 *     `{admitted: false, status: Number, error: String, corsOrigin: String|null}`.
 * @throws {TypeError} When the bearer is not canonical or the origin/host inputs are malformed.
 */
export function createFleetIngressGuard({bearerToken, allowedOrigins, resolveAllowedHosts, bearerHandshake = false} = {}) {
    if (!isLocalBearerToken(bearerToken)) {
        throw new TypeError('[fleetIngressAuth] a canonical 32-byte unpadded-base64url bearerToken is required')
    }

    if (!Array.isArray(allowedOrigins) || allowedOrigins.length < 1 || allowedOrigins.some(origin => typeof origin !== 'string' || !origin.trim())) {
        throw new TypeError('[fleetIngressAuth] allowedOrigins must name at least one exact cockpit origin')
    }

    if (typeof resolveAllowedHosts !== 'function') {
        throw new TypeError('[fleetIngressAuth] resolveAllowedHosts must be a function returning the admitted Host values')
    }

    const origins = Object.freeze([...allowedOrigins]);

    return function admit(req) {
        const
            hostHeader   = req.headers?.host,
            originHeader = req.headers?.origin,
            allowedHosts = new Set(resolveAllowedHosts()),
            // The exact-origin echo is only ever the request's own origin AFTER it matched the
            // allowlist — a rejected request gets no CORS grant of any kind.
            corsOrigin   = originHeader && origins.includes(originHeader) ? originHeader : null;

        // 1. Host — exact match including port. An absent Host header (HTTP/1.0 shapes) fails
        // closed: this transport only serves the cockpit contract, never generic HTTP clients.
        if (!hostHeader || !allowedHosts.has(hostHeader)) {
            return {admitted: false, status: 403, error: 'fleet: host not admitted', corsOrigin: null}
        }

        // 2. Origin — when the browser states one, it must be exactly a configured cockpit origin.
        // The literal string 'null' (sandboxed iframe / opaque origin) is a stated-and-foreign
        // origin, not an absent one. Absent Origin passes through: the bearer below still gates,
        // and non-browser callers (the boot probe) legitimately send none.
        if (originHeader !== undefined && corsOrigin === null) {
            return {admitted: false, status: 403, error: 'fleet: origin not admitted', corsOrigin: null}
        }

        // 3. Preflight — cannot carry Authorization by construction, so it is admitted on
        // Host + Origin alone. It reads no body and dispatches nothing; its only effect is the
        // header echo permitting the real request to present the bearer.
        if (req.method === 'OPTIONS') {
            return {admitted: true, preflight: true, corsOrigin}
        }

        // 3.5 Armed bearer handshake — the one admission that runs BEFORE the bearer check,
        // because it exists to bootstrap it. Stricter than preflight: the Origin must be PRESENT
        // and allowlisted (a browser cannot forge its Origin; a caller stating none is not the
        // browser page this path serves). Unarmed, the path falls through to step 4 and refuses
        // 401 like any other bearer-less request — the default surface is unchanged.
        if (bearerHandshake && req.method === 'GET' &&
            new URL(req.url, 'http://127.0.0.1').pathname === '/fleet/handshake') {
            return corsOrigin === null
                ? {admitted: false, status: 403, error: 'fleet: handshake requires an allowlisted browser origin', corsOrigin: null}
                : {admitted: true, handshake: true, corsOrigin}
        }

        // 4. Bearer — constant-time via the shared localBearer primitives; malformed and
        // length-mismatched values fail closed before the equal-length compare runs.
        const authorization = req.headers?.authorization,
              presented     = typeof authorization === 'string' && authorization.startsWith('Bearer ')
                  ? authorization.slice(7).trim()
                  : null;

        if (!presented || !matchesLocalBearerToken(presented, bearerToken)) {
            return {admitted: false, status: 401, error: 'fleet: bearer required', corsOrigin}
        }

        return {admitted: true, preflight: false, corsOrigin}
    }
}
