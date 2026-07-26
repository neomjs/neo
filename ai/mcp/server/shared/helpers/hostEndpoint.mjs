/**
 * @module ai/mcp/server/shared/helpers/hostEndpoint
 * @summary Renders a configured host + port as an endpoint string an operator can paste, bracketing
 * bare IPv6 literals so the result stays a valid authority for DNS, IPv4, and unscoped IPv6 hosts
 * (zone-scoped addresses are bracketed for display only — see the scope limit below).
 *
 * A naive `${host}:${port}` template is correct for DNS names and IPv4 but produces a **malformed**
 * endpoint for an IPv6 literal: `::1` + `8000` yields `::1:8000`, which `new URL('http://::1:8000')`
 * rejects outright. That is the exact host family a diagnostic tip is most likely to be printing,
 * because an IPv6-only listener is precisely the condition an operator is trying to understand — so
 * the one case where the guidance matters most is the case the naive template breaks.
 *
 * The bracketing rule mirrors the one already applied by the orchestrator's Chroma health-URL
 * builder. That builder produces a fetchable URL; this produces a human-readable authority for log
 * output, so they are related but not interchangeable. Folding both onto one primitive is worthwhile
 * and deliberately left alone here — it would mean editing a live supervision path to land a logging
 * fix.
 *
 * Detection is structural rather than a regex on the value: **more than one colon** means the host
 * cannot be a DNS name or IPv4 address, so it is an IPv6 literal. An already-bracketed host is
 * passed through untouched, so the function is idempotent and safe to apply to config that may
 * already carry brackets.
 *
 * ## Scope, stated as a limit rather than left implied
 *
 * The output is a valid URL authority for **DNS names, IPv4, and unscoped IPv6 literals**. It is
 * deliberately NOT one for a **zone-scoped** address: `fe80::1%eth0` cannot appear in a URL
 * authority at all, and Node rejects both the raw and the percent-encoded form, so bracketing cannot
 * rescue it. Such a host is still bracketed — that is the conventional display form and keeps the log
 * line readable — but the result is for human eyes, not for `new URL`. Teaching this helper to encode
 * zone IDs would put an address parser inside a logging path, which is the wrong home for it.
 */

/**
 * @summary Formats a host and port into a paste-ready endpoint, bracketing bare IPv6 literals.
 *
 * Pure — no config reads, no I/O — so callers supply already-resolved values and tests can assert
 * the rendering of a host the local config never selects.
 * @param {String|Number} host Resolved host (DNS name, IPv4, bare IPv6, or bracketed IPv6).
 * @param {String|Number} port Resolved port.
 * @returns {String} `host:port`, with `[...]` around a bare IPv6 host.
 * @example
 *     formatHostEndpoint('localhost', 8000)  // 'localhost:8000'
 *     formatHostEndpoint('127.0.0.1', 8000)  // '127.0.0.1:8000'
 *     formatHostEndpoint('::1', 8000)        // '[::1]:8000'   (not the malformed '::1:8000')
 *     formatHostEndpoint('[::1]', 8000)      // '[::1]:8000'   (idempotent)
 */
export function formatHostEndpoint(host, port) {
    const rawHost = String(host ?? '').trim();

    if (rawHost.startsWith('[') || rawHost.split(':').length - 1 <= 1) {
        return `${rawHost}:${port}`;
    }

    return `[${rawHost}]:${port}`;
}

export default formatHostEndpoint;
