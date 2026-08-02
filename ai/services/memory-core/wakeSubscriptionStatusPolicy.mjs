/**
 * @summary Pure policy owning ONE question: what does an absent `status` on a `WAKE_SUBSCRIPTION`
 * row mean? Every reader derives its answer here, so the four call sites cannot drift apart again.
 *
 * **The failure mode this replaces (reads-active-while-undeliverable).** Four readers each decided
 * the absent case for themselves, and three of them disagreed with the one whose verdict actually
 * decides delivery:
 *
 * | reader | absent `status` was treated as |
 * |---|---|
 * | the durable lister's SQL | `active` (COALESCE) |
 * | the sunsetting check | `active` (`?? 'active'`) |
 * | the fleet identity reader | `active` (`?? 'active'`) |
 * | the receiver-manifest builder | **skipped — route withdrawn** |
 *
 * A row in that state therefore returned from `list()` looking active, counted toward every
 * sunsetting and fleet-identity sweep, and was then silently dropped by the manifest build. If it
 * was the seat's only row the build refused to write an empty manifest. Nothing errored, because
 * the skip was a `continue` whose reason reached only the builder's own `skipped` array. The seat
 * reads healthy on every ordinary inspection and receives nothing.
 *
 * **The chosen meaning: absent ⇒ active.** Two reasons, in order of weight:
 *
 * 1. **It matches the query that FEEDS the manifest.** The durable lister coalesces; the builder
 *    consumes what the lister returns. Any other choice lets the builder silently discard a row the
 *    lister just handed it as active — a disagreement between a producer and its own consumer.
 * 2. **It fails in the loud direction.** Publishing a route whose row is ambiguous surfaces at
 *    delivery, where a failure is attributable and counted. Withholding one produces a deaf seat:
 *    no error, no signal, and the agent cannot tell it is unreachable. Between a noisy failure and
 *    a silent one on the same uncertainty, the substrate takes the noisy one.
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
 * backup would have re-activated the split silently. One definition, four consumers, no drift.
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
 * closed, because only the absent case has the producer-consumer argument behind it.
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
