/**
 * @summary Resolves a caller-supplied tenant-sharing policy so it can only NARROW, never widen.
 *
 * `memorySharing` is declared on `query_raw_memories` and `query_summaries`, so a caller can supply
 * it through a public surface. The parameter is not a filter — it selects a read scope. `team`
 * returns every maintainer's records; `legacy` admits caller-owned, shared and untagged rows;
 * `private` restricts to the caller's own. They form a strict ordering, not two tiers.
 *
 * On the shipped `team` default that is harmless, which is precisely why the default is not the case
 * that decides it: a deployment configuring per-org isolation sets `defaultPolicy = 'private'`, and
 * there an unconstrained parameter lets a caller re-select `team` and read past the isolation the
 * operator asked for. Nothing downstream performs an authorization check for the widening.
 *
 * So the boundary is breadth-monotonic: **a request may be no broader than the configured default.**
 * A caller narrowing (`team` default, asks `private`) is always safe and always honoured — that is the
 * legitimate use, including the test seam. A caller widening is clamped to the default rather than
 * throwing, because a throw would turn a previously-working call into an error on deployments that
 * never had isolation configured, while a clamp denies only the escalation.
 *
 * Pure by construction: the configured default is a PARAMETER, never read here. A non-entrypoint
 * module takes pure functions and must not import the config singleton — each caller reads
 * `aiConfig.memorySharing.defaultPolicy` inline at its own use site instead. That also makes both
 * deployment shapes reachable from a test without mutating the shared singleton.
 *
 * @module Neo.ai.services.memory-core.helpers.resolveSharingPolicy
 */

/**
 * Breadth rank of each policy — a STRICT ordering, `private` < `legacy` < `team`.
 *
 * An earlier revision ranked `team` and `legacy` equal on the reasoning that both drop the `userId`
 * predicate. That is only half of what the read path does, and the missing half is the whole
 * boundary: `legacy` additionally runs a post-filter admitting **caller-owned + shared + untagged**
 * rows, while `team` runs **no post-filter at all** and returns every maintainer's records. `team` is
 * therefore a strict superset of `legacy`, not a sibling of it.
 *
 * Ranking them equal left exactly one escalation open — a `legacy`-configured deployment honouring a
 * caller-requested `team` — which is the same class of hole the clamp exists to close, surviving
 * inside the fix for it.
 * @type {Object<String,Number>}
 */
const BREADTH = {
    private: 0,
    legacy : 1,
    team   : 2
};

/**
 * @summary Returns the effective sharing policy, clamped so a caller cannot widen past the default.
 * @param {Object} options
 * @param {String} [options.requested] The caller-supplied `memorySharing` value, if any.
 * @param {String} options.configuredDefault The deployment's `memorySharing.defaultPolicy`.
 * @returns {{policy: String, clamped: Boolean}} `policy` is what the read path must use. `clamped` is
 * true only when a widening request was denied, so a caller-visible surface can say so instead of
 * silently returning a narrower result set than asked for.
 */
export function resolveSharingPolicy({requested, configuredDefault}) {
    if (!requested || requested === configuredDefault) {
        return {clamped: false, policy: configuredDefault}
    }

    const
        requestedBreadth = BREADTH[requested],
        defaultBreadth   = BREADTH[configuredDefault];

    // An unknown policy name is not a licence to widen: fall back to the configured default rather
    // than treating an unrecognised string as a request worth honouring.
    if (requestedBreadth === undefined || defaultBreadth === undefined) {
        return {clamped: requestedBreadth === undefined, policy: configuredDefault}
    }

    return requestedBreadth > defaultBreadth
        ? {clamped: true,  policy: configuredDefault}
        : {clamped: false, policy: requested}
}
