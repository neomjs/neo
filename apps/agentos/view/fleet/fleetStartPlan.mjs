/**
 * @summary Pure planning + summary helpers for the fleet-level morning start — the SSOT chrome's
 * one-click bring-up: partition the roster records into START-eligible members vs
 * excluded-with-reason, and fold the per-record round-trip results into the honest outcome
 * summary the operator can trust at a glance.
 *
 * Rendering-free and transport-free: the cockpit controller composes these around the landed
 * per-verb C2 adapter (`fleetLifecycleIntentAdapter`), so a fleet start stays N per-record honest
 * round-trips — the per-card pending CASCADE — never one optimistic fleet-wide spinner. Every
 * eligibility rule below reads WIRE truth already on the record (`agentId` presence, the
 * launch-seam `launchable` stamp, the C2 `pendingAction` seam, the runtime-derived session
 * `state`) — nothing is hardcoded per agent, and an excluded member always carries its reason:
 * excluded-with-reason, never silently skipped.
 * @module apps/agentos/view/fleet/fleetStartPlan
 */

/**
 * @summary Partition roster records into start-eligible members and excluded-with-reason entries.
 *
 * Rules, first match wins, each derived from a wire fact on the record:
 * 1. no `agentId` → a guest/identity-only row with no fleet definition — nothing to start;
 * 2. `launchable === false` → the launch seam says this family has no harness template
 *    (tri-state honesty: `null` = not read back yet stays ELIGIBLE — the bridge's own refusal is
 *    the truthful outcome, never a cockpit guess);
 * 3. a `pendingAction` in flight → the C2 round-trip seam owns the card until it settles;
 * 4. session `state` other than `off` → the resident is already up (ok / idle / wedged / limited
 *    are all live states) — a morning start targets the DOWN fleet.
 * @param {Object[]} records FleetAgent records (or plain field bags in tests).
 * @returns {{eligible: Object[], excluded: Object[]}} `excluded` entries are
 * `{record, agentId, reason}` — the reason is always present and wire-derived.
 */
export function partitionFleetStart(records) {
    const
        eligible = [],
        excluded = [];

    (records ?? []).forEach(record => {
        if (!record) return;

        const
            agentId = record.agentId ?? null,
            exclude = reason => excluded.push({agentId, reason, record});

        if (!agentId) {
            exclude('guest — no fleet definition to start')
        } else if (record.launchable === false) {
            exclude(`not launchable — no harness template for the '${record.family ?? 'unknown'}' family`)
        } else if (record.pendingAction) {
            exclude(`'${record.pendingAction}' round-trip already in flight`)
        } else if ((record.state ?? 'off') !== 'off') {
            exclude(`already up — session state '${record.state}'`)
        } else {
            eligible.push(record)
        }
    });

    return {eligible, excluded}
}

/**
 * @summary Fold the partition + the per-record C2 adapter results into the honest outcome
 * summary: started / rejected-with-reasons / excluded-with-reasons, in the roster's own order.
 * A non-`ok` result keeps its terminal kind visible (`rejected` / `timeout` / `unauthorized` —
 * the adapter's settle-or-reject vocabulary), because a timeout is an UNKNOWN outcome, not a
 * failure the operator may silently retry.
 * @param {{eligible: Object[], excluded: Object[]}} partition From {@link partitionFleetStart}.
 * @param {Object[]} results Per-eligible-record results from `handleFleetLifecycleIntent`, index-aligned.
 * @returns {{started: Number, rejected: Object[], excluded: Object[], attempted: Number, total: Number}}
 * `rejected` / `excluded` entries are `{agentId, reason}` pairs in roster order.
 */
export function summarizeFleetStart(partition, results) {
    const
        {eligible, excluded} = partition,
        rejected             = [];

    let started = 0;

    eligible.forEach((record, index) => {
        const result = results?.[index];

        if (result?.ok) {
            started++
        } else {
            const
                kind   = result?.status ?? 'rejected',
                reason = result?.controlReason?.reason ?? `start ${kind}`;

            rejected.push({agentId: record.agentId, reason: kind === 'rejected' ? reason : `${kind}: ${reason}`})
        }
    });

    return {
        attempted: eligible.length,
        excluded : excluded.map(({agentId, reason}) => ({agentId, reason})),
        rejected,
        started,
        total    : eligible.length + excluded.length
    }
}

/**
 * @summary Render the summary as the compact chrome line + the reachable per-member reasons.
 * Pure string building: `text` is the at-a-glance state ("3 started · 1 rejected · 2 excluded");
 * `detail` lists every rejected/excluded member with its reason, one per line — the "reasons
 * reachable from the summary" contract, carried as the summary element's title.
 * @param {Object} summary From {@link summarizeFleetStart}.
 * @returns {{text: String, detail: String}}
 */
export function renderFleetStartSummary(summary) {
    const
        parts  = [`${summary.started} started`],
        detail = [];

    summary.rejected.length && parts.push(`${summary.rejected.length} rejected`);
    summary.excluded.length && parts.push(`${summary.excluded.length} excluded`);

    summary.rejected.forEach(({agentId, reason}) => detail.push(`${agentId}: ${reason}`));
    summary.excluded.forEach(({agentId, reason}) => detail.push(`${agentId ?? '(guest)'}: ${reason}`));

    return {detail: detail.join('\n'), text: parts.join(' · ')}
}
