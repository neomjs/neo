import {attributeMotion, deriveAlignmentStates} from './directionAttribution.mjs';

/**
 * @module ai/graph/directionHindcastReplay
 * @summary The direction hindcast replay — the falsifier between computation and render: a
 * forecastless replay of the attribution machinery over a HISTORICAL window, using only
 * information that existed inside that window. No rendered forecast exists until this replay
 * demonstrates skill; a prediction without a falsifying backtest is invalid by construction.
 *
 * The epistemics, mechanized:
 * - **Only-in-W by construction, not by discipline:** the replay CUTS history at the window
 *   boundaries before the attribution pass ever sees it — the anchor set is reconstructed as it
 *   stood at window start (declared before, not retired before), and motion is restricted to the
 *   window span. The leakage falsifier is executable: appending post-window events or goals to
 *   the input MUST NOT change the output.
 * - **June 2026 is a GATE, never a tuning set:** the born-labeled fixture below encodes the
 *   operator's documented post-mortem; a run over June that fails to flag the starved design/UX
 *   direction fails the whole approach, full stop. Iterate the MACHINERY elsewhere.
 * - **May 2026 is a HOLDOUT, locked structurally:** no May fixture ships in this repo, and the
 *   holdout entry point refuses to run without the single-shot ceremony (explicit flag + operator
 *   provenance string). It is scored ONCE, by the recorded protocol, and the result stands
 *   whatever it says.
 */

/**
 * @summary Reconstructs the declared-anchor set AS IT STOOD at a moment: goals declared at or
 * before the moment and not yet retired at it. Future declarations and future retirements are
 * both invisible — a goal retired AFTER window start is still active FOR that window.
 * @param {Object[]} declaredGoals Full goal history: `{id, matchers, lifecycle, declaredAt, retiredAt?}`
 * @param {String} atIso The reconstruction moment (window start)
 * @returns {Object[]} the as-of anchor set, each entry projected to the attribution contract
 */
export function reconstructAnchorSet(declaredGoals, atIso) {
    const at = Date.parse(atIso);

    if (!Number.isFinite(at)) return [];

    return (Array.isArray(declaredGoals) ? declaredGoals : [])
        .filter(goal => {
            if (goal == null || typeof goal.id !== 'string') return false;

            const declared = Date.parse(goal.declaredAt);

            if (!Number.isFinite(declared) || declared > at) return false;

            const retired = goal.retiredAt ? Date.parse(goal.retiredAt) : null;

            return retired === null || !Number.isFinite(retired) || retired > at;
        })
        .map(goal => ({id: goal.id, matchers: goal.matchers, lifecycle: 'active'}))
}

/**
 * @summary Cuts motion history to the window span `[since, until)`. Events without a parseable
 * timestamp are excluded (an undatable event cannot prove it belongs to the window).
 * @param {Object[]} motionEvents Full motion history: `{id, conceptIds, at}`
 * @param {String} sinceIso
 * @param {String} untilIso
 * @returns {Object[]}
 */
export function cutWindowEvents(motionEvents, sinceIso, untilIso) {
    const since = Date.parse(sinceIso);
    const until = Date.parse(untilIso);

    if (!Number.isFinite(since) || !Number.isFinite(until)) return [];

    return (Array.isArray(motionEvents) ? motionEvents : []).filter(event => {
        const at = Date.parse(event?.at);

        return Number.isFinite(at) && at >= since && at < until;
    })
}

/**
 * @summary Runs one hindcast window: cut → attribute → derive alignment. Pure replay of the
 * merged attribution machinery over only-in-W inputs; no clock, no I/O, deterministic.
 * @param {Object} options
 * @param {Object} options.window `{since, until}` ISO bounds
 * @param {Object} options.history `{motionEvents, declaredGoals}` — FULL history; the replay cuts
 * @param {Object} [options.clusterMapping={}] The versioned emergent mapping as-of the window
 * @param {Number} options.mappingVersion
 * @param {String} options.filterSet
 * @returns {Object} `{anchorSet, events, breakdown, facts, alignment, conservation, errors}`
 */
export function runHindcastWindow({window, history, clusterMapping = {}, mappingVersion, filterSet} = {}) {
    const anchorSet = reconstructAnchorSet(history?.declaredGoals, window?.since);
    const events    = cutWindowEvents(history?.motionEvents, window?.since, window?.until);

    const attribution = attributeMotion({
        motionEvents   : events,
        declaredGoals  : anchorSet,
        clusterMapping,
        mappingVersion,
        filterSet,
        falsifyingQuery: `replay window [${window?.since}, ${window?.until}) under filters [${filterSet}] at mapping v${mappingVersion} — the replay IS the falsifier`
    });

    const alignment = deriveAlignmentStates({
        activeGoals: anchorSet,
        facts      : attribution.facts,
        breakdown  : attribution.breakdown
    });

    return {
        anchorSet,
        events,
        breakdown   : attribution.breakdown,
        facts       : attribution.facts,
        alignment,
        conservation: attribution.conservation,
        errors      : attribution.errors
    }
}

/**
 * @summary The June-2026 born-labeled fixture — curated FROM THE RECORD, never tuned. Ground
 * truth is the operator's documented post-mortem of the month: design and UX intent existed
 * (declared, active, never retired) while the month's motion ran almost entirely down the
 * engine/backlog line — "design and UX got fully lost; the board looked almost complete, which
 * made it misleading; the team was hunting scraps without realising." A hindcast run over this
 * window that does NOT flag the design direction as intent-starved falsifies the approach.
 *
 * Curation notes (provenance, so the fixture is auditable): volumes are representative, not
 * transcripts — heavy engine-clustered motion with a visible unattributed tail and ZERO attributed
 * design motion mirrors the recorded board shape. "Fully lost" is the label, so zero is the
 * faithful encoding — an earlier draft softened it to near-zero, which is exactly the curation
 * drift this note exists to forbid. The label is the post-mortem; the fixture only encodes it.
 * @type {Object}
 */
export const JUNE_2026_FIXTURE = Object.freeze({
    window        : Object.freeze({since: '2026-06-01T00:00:00Z', until: '2026-07-01T00:00:00Z'}),
    mappingVersion: 1,
    filterSet     : 'non-chore',
    history       : Object.freeze({
        declaredGoals: Object.freeze([
            Object.freeze({id: 'evolution-goal-engine-hardening', matchers: Object.freeze(['concept-engine', 'concept-worker', 'concept-vdom']), declaredAt: '2026-05-01T00:00:00Z'}),
            Object.freeze({id: 'evolution-goal-design-ux',        matchers: Object.freeze(['concept-design', 'concept-ux', 'concept-theme']),   declaredAt: '2026-05-01T00:00:00Z'}),
            // declared AFTER June — must be invisible to the June anchor set (the leakage guard's sibling)
            Object.freeze({id: 'evolution-goal-post-window',      matchers: Object.freeze(['concept-engine']),                                   declaredAt: '2026-07-02T00:00:00Z'})
        ]),
        motionEvents: Object.freeze([
            ...Array.from({length: 24}, (_, index) => Object.freeze({
                id        : `june-engine-${index + 1}`,
                conceptIds: Object.freeze(['concept-engine']),
                at        : `2026-06-${String(2 + index).padStart(2, '0')}T12:00:00Z`
            })),
            Object.freeze({id: 'june-untagged-1', conceptIds: Object.freeze([]), at: '2026-06-10T12:00:00Z'}),
            Object.freeze({id: 'june-untagged-2', conceptIds: Object.freeze([]), at: '2026-06-20T12:00:00Z'}),
            // July motion — must be invisible to the June window (the leakage falsifier's target)
            Object.freeze({id: 'july-design-flood-1', conceptIds: Object.freeze(['concept-design']), at: '2026-07-03T12:00:00Z'}),
            Object.freeze({id: 'july-design-flood-2', conceptIds: Object.freeze(['concept-design']), at: '2026-07-03T13:00:00Z'})
        ])
    })
});

/**
 * @summary The May-2026 divergence holdout — LOCKED. No May fixture ships in this repository;
 * this entry point exists so the single-shot ceremony has a door, and so that door refuses
 * everything else. The ceremony: the recorded labeled-sample protocol (operator + at least two
 * agents, adjudicated), executed once, result recorded regardless of outcome.
 * @param {Object} options
 * @param {Boolean} options.singleShot Must be literally `true`
 * @param {String} options.operatorProvenance Non-empty pointer to the ceremony record
 * @param {Object} options.window May bounds
 * @param {Object} options.history The assembled May history (from the ceremony, never from this repo)
 * @param {Object} [options.clusterMapping]
 * @param {Number} options.mappingVersion
 * @param {String} options.filterSet
 * @returns {Object} the hindcast run result
 * @throws when invoked without the ceremony — the holdout is scored once, and not by accident
 */
export function runHoldout({singleShot, operatorProvenance, ...runOptions} = {}) {
    if (singleShot !== true || typeof operatorProvenance !== 'string' || operatorProvenance.trim() === '') {
        throw new Error('the May holdout is scored ONCE, under the recorded ceremony: pass {singleShot: true, operatorProvenance} from the adjudicated protocol — casual invocation would burn the holdout');
    }

    return runHindcastWindow(runOptions)
}
