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
 * @summary The contributing slots, named by the COMPOSER rather than by the adapters.
 *
 * A slot is what this module asked; `capability.source` is what the adapter says it is. Attributing a
 * failure by the adapter's self-report lets a broken contributor blame a healthy one — the reason
 * line an operator debugs from must come from the party that knows which slot it called.
 * @type {Object}
 */
export const FLEET_ACTIVITY_SLOTS = Object.freeze({
    a2a   : 'a2a',
    prLane: 'pr-lane'
});

/**
 * @summary The cap on a failure reason reaching the cockpit.
 * @type {Number}
 */
export const FLEET_ACTIVITY_REASON_MAX = 200;

/**
 * @summary Resolves the event bound, refusing values that would silently unbound the read.
 *
 * `params.limit ?? limit` accepted `-1`, `NaN`, `0` and `'50'` — a caller-supplied bound reaches the
 * adapters verbatim, so a bad one is a caller-controlled unbounded read rather than a display quirk.
 * An unusable bound falls back to the configured default instead of being obeyed.
 *
 * @param {*} requested The caller's `limit`.
 * @param {Number} fallback The configured default.
 * @returns {Number}
 * @private
 */
function normalizeBound(requested, fallback) {
    const value = Number(requested);

    return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * @summary Renders a failure into a reason safe to hand a cockpit.
 *
 * Adapter errors carry filesystem paths, tokens and query fragments. A capability reason is rendered
 * verbatim to an operator and travels through the projection, so it is a leak surface and an unbounded
 * one: an error's `message` has no length contract. Capped and stripped of newlines so one failure
 * cannot flood or restructure the pane it lands in.
 *
 * @param {*} failure Error or string.
 * @returns {String}
 * @private
 */
function redactReason(failure) {
    const raw = `${failure?.message ?? failure ?? 'unknown failure'}`.replace(/\s+/g, ' ').trim();

    return raw.length > FLEET_ACTIVITY_REASON_MAX ? `${raw.slice(0, FLEET_ACTIVITY_REASON_MAX - 1)}…` : raw
}

/**
 * @summary Reads one slot, containing every failure mode as that slot's degraded capability.
 *
 * `Promise.resolve(read(params))` does NOT contain a synchronous throw — the call is evaluated before
 * the wrapper exists, so the error escapes the `.catch` and takes the whole snapshot down. An async
 * stub cannot surface that; a real adapter validating its arguments throws exactly that way. `await`
 * inside `try` contains both shapes.
 *
 * A malformed return is contained too: a contributor that answers `undefined`, or without a
 * capability, has not reported sight, and inventing one for it is the failure this module exists to
 * prevent.
 *
 * @param {Function} read The slot's reader.
 * @param {String} slot The composer-owned slot name.
 * @param {Object} params Bounds forwarded to the adapter.
 * @param {String} capturedAt ISO capture stamp.
 * @returns {Promise<{capability: Object, events: Object[]}>}
 * @private
 */
async function readSlot(read, slot, params, capturedAt) {
    const degraded = reason => ({
        capability: {source: FLEET_COCKPIT_SOURCES.activity, state: 'degraded', confidence: 'none', capturedAt, reason: `${slot}: ${reason}`},
        events    : []
    });

    let snapshot;

    try {
        snapshot = await read(params)
    } catch (error) {
        return degraded(redactReason(error))
    }

    if (!snapshot?.capability) {
        return degraded('returned no capability')
    }

    return {
        // The slot owns the attribution: an adapter's own `source` is its claim about itself, and a
        // composite reason built from it lets a broken contributor name a healthy slot.
        capability: {...snapshot.capability, slot},
        events    : Array.isArray(snapshot.events) ? snapshot.events : []
    }
}

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
    //
    // Attribution is by SLOT — what this composer asked — not by `capability.source`, which is the
    // adapter's claim about itself. A contributor that mislabels its source would otherwise send the
    // operator to a healthy adapter, and the one surface that exists to be trusted when things break
    // must not be forgeable by the thing that broke.
    const reason = blind
        .map(capability => `${capability?.slot ?? 'unknown slot'}: ${redactReason(capability?.reason ?? capability?.state ?? 'unavailable')}`)
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

    const slots = [
        {read: readA2ASnapshot,    slot: FLEET_ACTIVITY_SLOTS.a2a},
        {read: readPrLaneSnapshot, slot: FLEET_ACTIVITY_SLOTS.prLane}
    ];

    return {
        async readActivitySnapshot(params = {}) {
            const
                capturedAt = new Date().toISOString(),
                bound      = normalizeBound(params.limit, limit),
                // Every slot is asked even when one is expected to fail: a contributor that cannot
                // read must return its OWN degraded capability, and short-circuiting would replace
                // that adapter's stated reason with the composer's guess about it.
                contributions = await Promise.all(slots.map(({read, slot}) => readSlot(read, slot, {...params, limit: bound}, capturedAt)));

            return {
                capability: composeCapability(contributions.map(contribution => contribution.capability), capturedAt),
                events    : boundEvents(contributions.flatMap(contribution => contribution.events), bound)
            }
        }
    }
}
