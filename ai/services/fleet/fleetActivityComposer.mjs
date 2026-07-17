import {DEFAULT_FLEET_ACTIVITY_EVENT_LIMIT} from './fleetPrLaneActivityAdapter.mjs';
import {FLEET_COCKPIT_SOURCES}              from '../../../src/ai/fleet/fleetCockpitStatus.mjs';

/**
 * @module ai/services/fleet/fleetActivityComposer
 * @summary The producer for `FleetControlBridge.activitySource` — one bounded `{capability, events}`
 * snapshot composed from the landed A2A and PR/lane adapters.
 *
 * The bridge has consumed `readActivitySnapshot(params)` since it was written, and nothing ever
 * produced it: the capability's own name (`fleet:activity-adapters`) promised a composition that did
 * not exist, so `fleetActivity` answered `not-wired` permanently, by construction.
 *
 * **Composing two truths means composing two capabilities, and that is the whole design.** Events
 * merge trivially; sight does not. A composite may only claim `wired` when EVERY contributing adapter
 * is wired — because a caller reading `wired` concludes it is seeing the fleet's activity, and one
 * blind adapter makes that false while leaving the event list looking perfectly healthy. A degraded
 * adapter's missing events are indistinguishable from quiet ones, so the capability is the only place
 * that difference can survive.
 *
 * The adapters are INJECTED readers, never imported singletons: the mailbox / PR read paths own
 * identity binding and read permissions, so composing must not smuggle a second path to them.
 */

/**
 * @summary Merges two adapter snapshots into one, newest-first and bounded.
 *
 * @param {Object[]} events Every contributing adapter's events.
 * @param {Number} limit Maximum rows to return.
 * @returns {Object[]}
 * @private
 */
function boundEvents(events, limit) {
    return events
        .filter(Boolean)
        .sort((left, right) => String(right?.occurredAt ?? '').localeCompare(String(left?.occurredAt ?? '')))
        .slice(0, limit)
}

/**
 * @summary Composes the contributing capabilities into the one the caller may trust.
 *
 * Fail-honest and deliberately pessimistic: `wired` requires unanimity. Any contributor that is
 * not wired downgrades the composite and names itself in the reason, because "we saw everything"
 * and "we saw what we could" are different claims and only one of them is true here. Confidence
 * follows the same rule — the composite is never more confident than its weakest contributor.
 *
 * @param {Object[]} capabilities Contributing adapter capabilities.
 * @param {String} capturedAt ISO capture stamp.
 * @returns {Object} `{source, state, confidence, capturedAt, reason}`
 * @private
 */
function composeCapability(capabilities, capturedAt) {
    const blind = capabilities.filter(capability => capability?.state !== 'wired');

    if (blind.length === 0) {
        return {
            source    : FLEET_COCKPIT_SOURCES.activity,
            state     : 'wired',
            confidence: 'observed',
            capturedAt,
            reason    : null
        }
    }

    // Name every blind contributor, not just the first: an operator debugging a partial feed needs to
    // know which half is missing, and a single-source reason invites fixing the wrong adapter.
    const reason = blind
        .map(capability => `${capability?.source ?? 'unknown source'}: ${capability?.reason ?? capability?.state ?? 'unavailable'}`)
        .join('; ');

    return {
        source    : FLEET_COCKPIT_SOURCES.activity,
        // `not-wired` only when NOTHING could be read — otherwise the feed genuinely carries partial
        // truth and `degraded` is the honest word for it. Collapsing both into one state would tell a
        // caller with half a feed the same thing it tells one with none.
        state     : blind.length === capabilities.length ? 'not-wired' : 'degraded',
        confidence: 'none',
        capturedAt,
        reason
    }
}

/**
 * @summary Builds the injectable activity read-source the bridge consumes.
 *
 * @param {Object}   options={}
 * @param {Function} options.readA2ASnapshot `params => Promise<{capability, events}>` — the A2A
 *   adapter's read path, already bound to its own injected `listMessages`.
 * @param {Function} options.readPrLaneSnapshot `params => Promise<{capability, events}>` — the
 *   PR/lane adapter's read path. The adapter itself is a pure builder over already-read facts, so
 *   the caller owns the reading and this composer never reaches for GitHub or the graph directly.
 * @param {Number}   [options.limit=DEFAULT_FLEET_ACTIVITY_EVENT_LIMIT] Default event bound.
 * @returns {{readActivitySnapshot: Function}} The `FleetControlBridge.activitySource` contract.
 * @throws {TypeError} When a reader is missing — an unreadable half must be an explicit degraded
 *   capability from a real adapter, never a composer quietly composing one contributor and calling
 *   the result the fleet's activity.
 */
export function createFleetActivityReadSource({readA2ASnapshot, readPrLaneSnapshot, limit = DEFAULT_FLEET_ACTIVITY_EVENT_LIMIT} = {}) {
    if (typeof readA2ASnapshot !== 'function' || typeof readPrLaneSnapshot !== 'function') {
        throw new TypeError('[fleetActivityComposer] readA2ASnapshot and readPrLaneSnapshot must be injected')
    }

    return {
        async readActivitySnapshot(params = {}) {
            const
                capturedAt = new Date().toISOString(),
                bound      = params.limit ?? limit,
                // Both are asked even when one is expected to fail: a contributor that cannot read
                // must return its OWN degraded capability, and short-circuiting would replace that
                // adapter's stated reason with the composer's guess about it.
                contributions = await Promise.all([
                    Promise.resolve(readA2ASnapshot({...params, limit: bound})).catch(error => ({
                        capability: {
                            source    : FLEET_COCKPIT_SOURCES.activity,
                            state     : 'degraded',
                            confidence: 'none',
                            capturedAt,
                            reason    : `a2a adapter threw: ${error?.message ?? error}`
                        },
                        events: []
                    })),
                    Promise.resolve(readPrLaneSnapshot({...params, limit: bound})).catch(error => ({
                        capability: {
                            source    : FLEET_COCKPIT_SOURCES.activity,
                            state     : 'degraded',
                            confidence: 'none',
                            capturedAt,
                            reason    : `pr-lane adapter threw: ${error?.message ?? error}`
                        },
                        events: []
                    }))
                ]);

            return {
                capability: composeCapability(contributions.map(contribution => contribution?.capability), capturedAt),
                events    : boundEvents(contributions.flatMap(contribution => contribution?.events ?? []), bound)
            }
        }
    }
}
