/**
 * @summary Pure planning + summary helpers for the fleet-level start — the SSOT chrome's
 * one-click bring-up: partition the roster records into START-eligible members vs
 * excluded-with-reason, and fold the per-record round-trip results into the honest outcome
 * summary the operator can trust at a glance.
 *
 * Rendering-free and transport-free: the cockpit controller composes these around the landed
 * per-verb C2 adapter (`fleetLifecycleIntentAdapter`), so a fleet start stays N per-record honest
 * round-trips — the per-card pending CASCADE — never one optimistic fleet-wide spinner. Every
 * eligibility rule below reads WIRE truth already on the record (`agentId` presence, the
 * authoritative identity-root `participationStatus`, the launch-seam `launchable` stamp, the C2
 * `pendingAction` seam, the timeout-bearing `controlReason`, the normalized `sources.runtime`
 * provenance, the runtime-derived session `state`) — nothing is hardcoded per agent, and an
 * excluded member always carries its reason:
 * excluded-with-reason, never silently skipped.
 *
 * The two AUTHORITY rules gate before any state read: a KNOWN non-active `participationStatus`
 * is a recorded participation fact no lifecycle fan-out may override — the same hard-gate
 * reading the wake-subscription liveness and heartbeat target-discovery layers apply (known
 * non-active excluded; `null`/unknown identities pass: open-set honesty for forks and custom
 * residents) — and a projected `state: 'off'` over an unusable runtime source is a degraded
 * DISPLAY fallback, not control-plane proof of a stopped runtime — the same fail-closed
 * contract the per-card controls enforce via {@link module:apps/agentos/util/sourceHealth}.
 * @module apps/agentos/util/fleetStartPlan
 */
import {normalizeFleetSources} from './sourceHealth.mjs';

/**
 * @summary Partition roster records into start-eligible members and excluded-with-reason entries.
 *
 * Rules, first match wins, each derived from a wire fact on the record:
 * 1. no `agentId` → a guest/identity-only row with no fleet definition — nothing to start;
 * 2. any KNOWN non-active `participationStatus` (non-null and not `'active'`, including
 *    `operator_benched` and `temporarily_unreachable`) → the identity roots' AUTHORITATIVE
 *    participation fact — the wake-subscription liveness gate and the heartbeat target
 *    discovery both read every known non-active status as a hard exclusion, and lifecycle
 *    fan-out follows the same authority; `null` (no identity root) stays ELIGIBLE — the
 *    open-set case for forks/custom residents, unknown is not a recorded prohibition;
 * 3. `launchable === false` → the launch seam says this family has no harness template
 *    (tri-state honesty: `null` = not read back yet stays ELIGIBLE — the bridge's own refusal is
 *    the truthful outcome, never a cockpit guess);
 * 4. a `pendingAction` in flight → the C2 round-trip seam owns the card until it settles;
 * 5. `sources.runtime` unusable after normalization (`not-wired` / `missing` — the normalizer
 *    guarantees a `wired` fact carries `observed`/`inferred` confidence, never `none`) → fail
 *    closed: the projected `state: 'off'` below is a degraded DISPLAY fallback in this case, not
 *    evidence of a stopped runtime — the same gate that disables the per-card controls;
 * 6. a prior lifecycle `timeout` → the outcome is still UNKNOWN because the bridge Promise was
 *    raced, not cancelled; fleet-level retry stays closed until an explicit card action clears it;
 * 7. session `state` other than `off` → the resident is already up (ok / idle / wedged / limited
 *    are all live states) — a fleet start targets the DOWN fleet (a WIRED stopped record —
 *    `observed` or `inferred` — is exactly that fleet).
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
            runtime = normalizeFleetSources(record.sources).runtime,
            exclude = reason => excluded.push({agentId, reason, record});

        if (!agentId) {
            exclude('guest — no fleet definition to start')
        } else if (record.participationStatus != null && record.participationStatus !== 'active') {
            exclude(`not active — authoritative participation status '${record.participationStatus}'`)
        } else if (record.launchable === false) {
            exclude(`not launchable — no harness template for the '${record.family ?? 'unknown'}' family`)
        } else if (record.pendingAction) {
            exclude(`'${record.pendingAction}' round-trip already in flight`)
        } else if (runtime.state !== 'wired') {
            exclude(`runtime source '${runtime.state}' — no usable lifecycle evidence to start against`)
        } else if (record.controlReason?.kind === 'timeout') {
            exclude(`'${record.controlReason.action ?? 'lifecycle'}' outcome unknown after timeout — retry only through an explicit card control`)
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
 * summary: started / UNKNOWN-with-reasons / rejected-with-reasons / excluded-with-reasons, in
 * each bucket's roster order.
 * A non-`ok` result keeps its terminal kind visible (`rejected` / `timeout` / `unauthorized` —
 * the adapter's terminal vocabulary), because a timeout is an UNKNOWN outcome, not a
 * failure the operator may silently retry.
 * @param {{eligible: Object[], excluded: Object[]}} partition From {@link partitionFleetStart}.
 * @param {Object[]} results Per-eligible-record results from `handleFleetLifecycleIntent`, index-aligned.
 * @returns {{started: Number, unknown: Object[], rejected: Object[], excluded: Object[], attempted: Number, total: Number}}
 * `unknown` / `rejected` / `excluded` entries are `{agentId, reason}` pairs in roster order.
 */
export function summarizeFleetStart(partition, results) {
    const
        {eligible, excluded} = partition,
        rejected             = [],
        unknown              = [];

    let started = 0;

    eligible.forEach((record, index) => {
        const result = results?.[index];

        if (result?.ok) {
            started++
        } else {
            const
                kind   = result?.status ?? 'rejected',
                reason = result?.controlReason?.reason ?? `start ${kind}`;

            const entry = {agentId: record.agentId, reason: kind === 'rejected' ? reason : `${kind}: ${reason}`};

            (kind === 'timeout' ? unknown : rejected).push(entry)
        }
    });

    return {
        attempted: eligible.length,
        excluded : excluded.map(({agentId, reason}) => ({agentId, reason})),
        rejected,
        started,
        total    : eligible.length + excluded.length,
        unknown
    }
}

/**
 * @summary Render the summary as the compact chrome line + the reachable per-member reasons.
 * Pure string building: `text` is the at-a-glance state
 * ("3 started · 1 UNKNOWN · 1 rejected · 2 excluded"); `detail` lists every
 * unknown/rejected/excluded member with its reason, one per line — the "reasons reachable from
 * the summary" contract, carried as the summary element's title.
 * @param {Object} summary From {@link summarizeFleetStart}.
 * @returns {{text: String, detail: String}}
 */
export function renderFleetStartSummary(summary) {
    const
        parts  = [`${summary.started} started`],
        detail = [];

    summary.unknown.length  && parts.push(`${summary.unknown.length} UNKNOWN`);
    summary.rejected.length && parts.push(`${summary.rejected.length} rejected`);
    summary.excluded.length && parts.push(`${summary.excluded.length} excluded`);

    summary.unknown.forEach(({agentId, reason}) => detail.push(`${agentId}: ${reason}`));
    summary.rejected.forEach(({agentId, reason}) => detail.push(`${agentId}: ${reason}`));
    summary.excluded.forEach(({agentId, reason}) => detail.push(`${agentId ?? '(guest)'}: ${reason}`));

    return {detail: detail.join('\n'), text: parts.join(' · ')}
}
