import FleetControlBridge                  from './FleetControlBridge.mjs';
import {createFleetActivityReadSource}     from './fleetActivityComposer.mjs';
import {readFleetA2AActivitySnapshot}      from './fleetA2AActivityAdapter.mjs';
import {createFleetPrLaneActivitySnapshot} from './fleetPrLaneActivityAdapter.mjs';
import {buildWorkGraphStallFindings,
        readSyncedPullRecords,
        readWorkGraphIssueRecords}           from '../graph/issueFocusSections.mjs';

/**
 * @module ai/services/fleet/wireFleetActivityReadSource
 * @summary Installs the composed `activitySource` onto `FleetControlBridge.activitySource` at the
 * fleet-bridge-server boot, so `readActivitySnapshot(params)` serves real A2A + PR/lane activity
 * instead of the by-construction `not-wired` default the bridge has answered since it was written.
 *
 * **Read-at-use-site, mirroring `wireBootIdentityReadSource`.** The caller (the fleet-server process
 * entry) resolves config + the cross-process memory-core singletons at the boot use site and passes
 * them in; this module owns no config default and captures no leaf. **Fail-soft:** with neither slot
 * readable it leaves `activitySource` unwired (the honest `not-wired` snapshot), never a fabricated
 * source. **No stub:** an unreadable slot degrades honestly through the composer's unanimity rule —
 * the composite is `wired` only when BOTH slots read, `degraded` when one cannot.
 *
 * **This is where the two read-path ownerships are honoured or broken:**
 *  - **A2A** — `readFleetA2AActivitySnapshot` over the **injected** `listMessages`. The caller binds
 *    the `MailboxService` singleton (lazily imported at the entry, like `readActiveWakeSubscriptionIdentities`
 *    binds `GraphService`); this module never imports it, so identity/permission binding stays at the boundary.
 *  - **PR/lane** — the *pure builder* `createFleetPrLaneActivitySnapshot` over facts THIS module reads:
 *    local-synced issue records (`readWorkGraphIssueRecords` — the same records the stall inference walks,
 *    so the two stay graph-consistent) + work-graph stall findings (`buildWorkGraphStallFindings`) +
 *    injected PR payloads. The reading is the substantive work of this leaf, not a passthrough.
 *
 * @see ai/services/fleet/wireBootIdentityReadSource.mjs — the wire-shape precedent
 * @see ai/services/memory-core/readActiveWakeSubscriptionIdentities.mjs — the lazy-singleton cross-process precedent
 */

/**
 * @summary The A2A slot reader — one bounded snapshot over the injected mailbox read path. The caller
 * owns the `listMessages` binding, so a broken/absent mailbox surfaces as this slot's own degraded
 * capability rather than a composer guess about it.
 * @param {Function} listMessages MailboxService-compatible `listMessages(args)`.
 * @returns {Function} `params => Promise<{capability, events}>`
 * @private
 */
function makeReadA2ASnapshot(listMessages) {
    return params => readFleetA2AActivitySnapshot({listMessages, limit: params.limit})
}

/**
 * @summary The PR/lane slot reader — reads local-synced issue + pull records + work-graph stall
 * findings, then hands them to the pure builder. A read failure becomes a degraded
 * capability naming the slot (the builder's `error` path), never a thrown snapshot that would take the
 * whole composite down.
 * @param {Object} options
 * @param {String} options.issuesDir Local synced issue directory (`resources/content/issues`).
 * @param {String} [options.pullsDir] Local synced pulls directory (`resources/content/pulls`); omit for no PR events.
 * @param {Object} [options.graphService] memory-core GraphService for stall-finding defer disposition.
 * @returns {Function} `params => Promise<{capability, events}>`
 * @private
 */
function makeReadPrLaneSnapshot({issuesDir, pullsDir, graphService}) {
    return async params => {
        const capturedAt = new Date();

        try {
            const prs           = (typeof pullsDir === 'string' && pullsDir.length > 0) ? readSyncedPullRecords(pullsDir, {limit: params.limit}) : [],
                  issues        = readWorkGraphIssueRecords(issuesDir),
                  stallFindings = buildWorkGraphStallFindings({issuesDir, prs, now: capturedAt, graphService});

            return createFleetPrLaneActivitySnapshot({prs, issues, stallFindings, limit: params.limit, capturedAt})
        } catch (error) {
            // Contained as this slot's degraded capability — an unreadable content tree or graph must
            // name its slot, not reject the snapshot the other slot may still be filling honestly.
            return createFleetPrLaneActivitySnapshot({error, limit: params.limit, capturedAt})
        }
    }
}

/**
 * @summary Wire the composed activity read-source onto the fleet control bridge.
 *
 * Each slot is wired only when its own source is present; an absent source throws inside the composer's
 * per-slot containment and surfaces as that slot's degraded capability — honest, never fabricated. With
 * NEITHER source present the bridge is left unwired (the by-construction `not-wired` snapshot stands).
 *
 * @param {Object} options
 * @param {String} [options.issuesDir] Local synced issue directory (`resources/content/issues`), read
 *     at the caller's use site. Absent → the PR/lane slot degrades.
 * @param {Function} [options.listMessages] MailboxService-compatible `listMessages(args)`, bound by the
 *     caller (never imported here). Absent → the A2A slot degrades.
 * @param {Object} [options.graphService] memory-core GraphService for stall-finding defer disposition
 *     (injected; the caller lazily imports the singleton).
 * @param {String} [options.pullsDir] Local synced pulls directory (`resources/content/pulls`), read at
 *     the caller's use site. Absent → the PR/lane slot emits no pr-activity events (honest-empty).
 * @param {Number} [options.limit] Default event bound forwarded to the composer.
 * @param {Object} [options.bridge=FleetControlBridge] The control bridge to wire (a stub in specs).
 * @param {Function} [options.createSource=createFleetActivityReadSource] The composer factory (injected in specs).
 * @returns {Object|null} the wired read-source, or `null` when no slot is readable (left unwired).
 */
export function wireFleetActivityReadSource({
    issuesDir,
    listMessages,
    graphService,
    pullsDir,
    limit,
    bridge       = FleetControlBridge,
    createSource = createFleetActivityReadSource
} = {}) {
    const hasA2A    = typeof listMessages === 'function',
          hasPrLane = typeof issuesDir === 'string' && issuesDir.length > 0;

    // No readable slot at all → leave the seam unwired (honest not-wired), never fabricate a source.
    if (!hasA2A && !hasPrLane) {
        return null
    }

    // A missing source throws inside the composer's per-slot `try` → that slot degrades naming itself,
    // and the unanimity rule reports the composite as degraded (not wired) — the honest partial state.
    const readA2ASnapshot = hasA2A
        ? makeReadA2ASnapshot(listMessages)
        : () => { throw new Error('a2a activity source not wired — no listMessages bound') };

    const readPrLaneSnapshot = hasPrLane
        ? makeReadPrLaneSnapshot({issuesDir, pullsDir, graphService})
        : () => { throw new Error('pr-lane activity source not wired — no issuesDir') };

    bridge.activitySource = createSource({readA2ASnapshot, readPrLaneSnapshot, limit});

    return bridge.activitySource
}
