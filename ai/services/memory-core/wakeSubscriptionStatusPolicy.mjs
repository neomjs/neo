/**
 * @summary Pure policy owning ONE question: what does an absent `status` on a `WAKE_SUBSCRIPTION`
 * row mean? All 20 decision points across 10 files derive their answer here, so they cannot drift
 * apart again.
 *
 * **The failure mode this replaces (reads-active-while-undeliverable).** 20 decision points each
 * decided the absent case for themselves, and they did not agree. Most defaulted absence to
 * `active` — via `COALESCE`, `?? 'active'`, or `|| 'active'` — while four compared strictly and
 * treated absence as NOT active: the receiver-manifest builder, the health arming verdict, the hot
 * push path (`pump()`), and the external-active-session exclusion.
 *
 * The `|| 'active'` spelling was worse than duplication: it also coerced `''`, `false` and `0` to
 * active, contradicting the fail-closed rule documented below. Three sweeps were needed to find all
 * three spellings, which is why the vocabulary is enumerated here rather than left to the next grep.
 *
 * **The producer hands absence through untouched.** `list()` routes to
 * `_listDurableSubscriptionsForOwner`, whose query carries NO status predicate at all, and
 * `_hydrateSubscriptionFromDurableNode` preserves a missing `status` as missing. So every consumer
 * receives `undefined` and answers for itself — which is precisely why the answer belongs in one
 * place rather than at each call site.
 *
 * A row in that state therefore returned from `list()` looking usable, counted toward every
 * sunsetting and fleet-identity sweep, and was then silently dropped by the manifest build. If it
 * was the seat's only row the build refused to write an empty manifest. Nothing errored, because
 * the skip was a `continue` whose reason reached only the builder's own `skipped` array. The seat
 * reads healthy on every ordinary inspection and receives nothing.
 *
 * **The chosen meaning: absent ⇒ active.** The reasons, in order of weight:
 *
 * 1. **It fails in the loud direction.** Publishing a route whose row is ambiguous surfaces at
 *    delivery, where a failure is attributable and counted. Withholding one produces a deaf seat:
 *    no error, no signal, and the agent cannot tell it is unreachable. Between a noisy failure and
 *    a silent one on the same uncertainty, the substrate takes the noisy one.
 * 2. **It is the smaller behavioral change.** Sixteen of the 20 decision points already read absence
 *    as active; converging on strict would flip sixteen rather than four, and every flip is a route
 *    that stops being published.
 * 3. **It costs nothing today, measured rather than assumed.** 17 durable rows on the canonical
 *    plane, 15 `active` + 2 `retired`, zero absent — so no seat changes state either way, and the
 *    choice is about which failure a FUTURE such row should produce.
 *
 * **A rationale that was published here and is false:** that the durable lister coalesces and hands
 * the builder an `active` value, making any other choice a producer-consumer disagreement. It does
 * not — see the producer note above. The near-identical owner-scoped query that DOES coalesce lives
 * in `_reconcileDuplicateSubscriptions`, which is not on the `list()` path. Recorded because the
 * mistake is easy to repeat: two similar queries in one file, and only one of them runs here.
 *
 * **Why this is safe to converge rather than migrate.** Measured on the canonical plane
 * 2026-08-02: 17 durable `WAKE_SUBSCRIPTION` rows, 15 `active` + 2 `retired`, **0 with an absent
 * `status`** — so aligning the builder with the majority arms no seat that is dark today. The state
 * is also not currently producible: both creation paths in `WakeSubscriptionService` set
 * `status: 'active'` explicitly, and `GraphService.upsertNode` merges top-level properties, so no
 * update path can remove it.
 *
 * That makes the ambiguity **unreachable but not impossible** — which is exactly why this module
 * exists. Nothing enforced the invariant; a future write path, a hand-inserted row, or a restored
 * backup would have re-activated the split silently. One definition, every consumer, no drift.
 *
 * Kept pure (no DB handle, no config, no I/O) so it is unit-testable in isolation and importable
 * from services, scripts, and the wake daemon alike — mirroring `wakeCoalescePolicy.mjs`, which the
 * daemon already consumes from this directory.
 *
 * @module ai/services/memory-core/wakeSubscriptionStatusPolicy
 */

/**
 * The meaning of an absent `status` property, and the only status that admits a row to delivery.
 * @type {String}
 */
export const WAKE_SUBSCRIPTION_DEFAULT_STATUS = 'active';

/**
 * @summary Decides whether a subscription's `status` admits it to wake delivery.
 *
 * Absent / `null` / `undefined` resolve to {@link WAKE_SUBSCRIPTION_DEFAULT_STATUS}. Any other
 * value (`'retired'`, `'degraded'`, or an unknown future state) is NOT active — unknown states fail
 * closed. Absence is the single defaulted case because it has a known provenance (a row written
 * before the field existed); `''`, `false`, `0` and any future token do not, and a written-but-
 * unrecognized value is a stronger signal of trouble than a never-written one.
 *
 * @param {String|null|undefined} status The persisted `$.properties.status`, or nothing.
 * @returns {Boolean} `true` when the row is deliverable on status grounds alone.
 */
export function isActiveWakeSubscriptionStatus(status) {
    return (status ?? WAKE_SUBSCRIPTION_DEFAULT_STATUS) === WAKE_SUBSCRIPTION_DEFAULT_STATUS
}

/**
 * @summary The SQL expression that RESOLVES a row's effective status — the absent-case rule alone,
 * without asking a question about the result.
 *
 * Readers that ask something other than "is it active" — for example "is it not degraded" — still
 * need the same absent-case answer. They compose this instead of re-typing the default literal,
 * which is how the original split started: the same COALESCE hand-written in several places, each
 * free to drift.
 *
 * @param {String} [column='data'] The column holding the node JSON.
 * @returns {String} A SQL scalar expression yielding the effective status.
 */
export function resolvedWakeSubscriptionStatusSql(column = 'data') {
    return `COALESCE(json_extract(${column}, '$.properties.status'), '${WAKE_SUBSCRIPTION_DEFAULT_STATUS}')`
}

/**
 * @summary The SQL predicate expressing the same rule as {@link isActiveWakeSubscriptionStatus},
 * for readers that filter in the query rather than in JS.
 *
 * Built from {@link resolvedWakeSubscriptionStatusSql} rather than repeating the literal, so a SQL
 * reader and a JS reader cannot express different meanings — the divergence this module exists to
 * remove is exactly the kind that hides in a hand-written COALESCE.
 *
 * @param {String} [column='data'] The column holding the node JSON.
 * @returns {String} A SQL boolean expression, safe to inline into a `WHERE` clause.
 */
export function activeWakeSubscriptionStatusSql(column = 'data') {
    return `${resolvedWakeSubscriptionStatusSql(column)} = '${WAKE_SUBSCRIPTION_DEFAULT_STATUS}'`
}
