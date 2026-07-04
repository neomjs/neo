import {
    UNATTRIBUTED_DIRECTION_KEY,
    composeBreakdownKey,
    createAttributionFactId,
    createClusterDirectionKey,
    validateAttributionFact,
    validateConservation
} from './directionSchema.mjs';

/**
 * @summary The direction-attribution pass (the direction contract §2.2, attribute-then-aggregate) — pure logic.
 *
 * Attributes each motion event to direction keys FIRST, then aggregates per direction: the
 * substrate-owner-disposed composition under which per-direction velocity stays exact per period
 * and history is append-only under mapping version. This module is deliberately pure (no graph
 * reads/writes, no clock): the Dream-pipeline writer supplies motion events, declared goals, and
 * the versioned cluster mapping; this module returns validated facts, the durable-record
 * `directionBreakdown`, the conservation verdict, and the derived alignment states. Purity is what
 * makes the hindcast protocol possible — replaying window W with only-in-W inputs is just calling
 * these functions with historical arguments.
 *
 * The hybrid representation (the direction contract's OQ1 shape): motion matches DECLARED anchors
 * via each goal's canonical concept matchers, and EMERGENT clusters via the versioned
 * `conceptId → clusterId` mapping. THE MAPPING IS THE SIGNAL — three derived states per unit of
 * motion: aligned (a declared goal it serves), unattributed (innovation-or-drift, human judges),
 * and starved (`INTENT_STARVED`: a declared active goal NO motion serves — the June-2026 failure
 * class, machine-detectable). Multi-match splits the event's measure equally across its matched
 * directions (measure-preserving: splitting a goal splits its measure; no event ever counts twice).
 */

/**
 * @summary Attributes one window's motion events to direction keys and aggregates the breakdown.
 *
 * Every motion event carries measure 1, distributed over its matched directions. Events matching
 * nothing land WHOLLY in the first-class UNATTRIBUTED pool. Matching is deterministic: canonical
 * concept ids only (callers canonicalize through the concept-spine SSOT before invoking — this
 * module never sees aliases).
 *
 * @param {Object}   options
 * @param {Object[]} options.motionEvents Window motion facts, each `{id, conceptIds?: String[]}`
 * @param {Object[]} options.declaredGoals `EVOLUTION_GOAL` records, each
 *   `{id, lifecycle, matchers?: String[]}` — `matchers` are canonical concept ids/slugs the goal declares
 * @param {Object}   [options.clusterMapping={}] Versioned emergent mapping `conceptId → clusterId`
 * @param {Number}   options.mappingVersion Positive integer version of `clusterMapping`
 * @param {String}   options.filterSet The declared motion-class filter set this window was built under
 * @param {String}   options.falsifyingQuery The window-level falsifying query (carries the SAME
 *   filter set + version pin — the direction contract §2.4 falsifier symmetry); stamped onto every fact
 * @returns {{facts: Object[], breakdown: Object, conservation: Object, states: Object, errors: String[]}}
 */
export function attributeMotion({
    motionEvents = [],
    declaredGoals = [],
    clusterMapping = {},
    mappingVersion,
    filterSet,
    falsifyingQuery
}) {
    const errors      = [];
    const facts       = [];
    const shareByKey  = new Map([[UNATTRIBUTED_DIRECTION_KEY, 0]]);
    const activeGoals = (Array.isArray(declaredGoals) ? declaredGoals : [])
        .filter(goal => goal != null && goal.lifecycle === 'active' && typeof goal.id === 'string');

    for (const event of Array.isArray(motionEvents) ? motionEvents : []) {
        if (event == null || typeof event.id !== 'string' || event.id.trim() === '') {
            errors.push('motion event without a valid id skipped — motion identity is required');
            continue;
        }

        const conceptIds  = Array.isArray(event.conceptIds) ? event.conceptIds : [];
        const matchedKeys = new Set();

        for (const goal of activeGoals) {
            const matchers = Array.isArray(goal.matchers) ? goal.matchers : [];

            if (matchers.some(matcher => conceptIds.includes(matcher))) {
                matchedKeys.add(goal.id);
            }
        }

        for (const conceptId of conceptIds) {
            const clusterId = clusterMapping?.[conceptId];

            if (clusterId != null && clusterId !== '') {
                matchedKeys.add(createClusterDirectionKey(clusterId));
            }
        }

        if (matchedKeys.size === 0) {
            // Whole measure to the pool — visible, never faked into a split (the direction contract §2.3).
            shareByKey.set(UNATTRIBUTED_DIRECTION_KEY, shareByKey.get(UNATTRIBUTED_DIRECTION_KEY) + 1);
            continue;
        }

        const share = 1 / matchedKeys.size;

        for (const directionKey of matchedKeys) {
            const fact = {
                factId  : createAttributionFactId({motionId: event.id, directionKey, mappingVersion}),
                motionId: event.id,
                directionKey,
                mappingVersion,
                share,
                filterSet,
                falsifyingQuery
            };

            const {valid, errors: factErrors} = validateAttributionFact(fact);

            if (!valid) {
                errors.push(...factErrors.map(message => `${event.id} → ${directionKey}: ${message}`));
                continue;
            }

            facts.push(fact);

            const breakdownKey = composeBreakdownKey(directionKey, mappingVersion);
            shareByKey.set(breakdownKey, (shareByKey.get(breakdownKey) ?? 0) + share);
        }
    }

    const eventCount = (Array.isArray(motionEvents) ? motionEvents : [])
        .filter(event => event != null && typeof event.id === 'string' && event.id.trim() !== '')
        .length;

    // Normalize absolute measures to shares-of-window so the conservation identity checks against 1.
    const breakdown = {};

    for (const [key, measure] of shareByKey) {
        breakdown[key] = eventCount === 0 ? (key === UNATTRIBUTED_DIRECTION_KEY ? 1 : 0) : measure / eventCount;
    }

    const conservation = validateConservation(breakdown);
    const states       = deriveAlignmentStates({activeGoals, facts, breakdown});

    if (!conservation.valid) {
        errors.push(...conservation.errors);
    }

    return {facts, breakdown, conservation, states, errors};
}

/**
 * @summary Derives the three alignment states from one window's attribution (the mapping IS the
 * signal): `aligned` goals (motion served them), `starved` goals (`INTENT_STARVED` — declared
 * ACTIVE intent that NO motion served this window; the June-2026 planning-failure class rendered
 * machine-detectable), and the `unattributedShare` (innovation-or-drift; a human judges).
 *
 * Advisory-only by contract: these states annotate, they never gate — a starved goal raises an
 * alarm for humans, it must not re-rank or suppress routes (the direction contract §2.6).
 * @param {Object}   options
 * @param {Object[]} options.activeGoals Active `EVOLUTION_GOAL` records `{id, ...}`
 * @param {Object[]} options.facts Validated attribution facts from the same window
 * @param {Object}   options.breakdown The normalized share breakdown (for the pool share)
 * @returns {{aligned: String[], starved: String[], unattributedShare: Number}}
 */
export function deriveAlignmentStates({activeGoals = [], facts = [], breakdown = {}}) {
    const servedKeys = new Set(facts.map(fact => fact.directionKey));
    const aligned    = [];
    const starved    = [];

    for (const goal of activeGoals) {
        (servedKeys.has(goal.id) ? aligned : starved).push(goal.id);
    }

    return {
        aligned,
        starved,
        unattributedShare: breakdown[UNATTRIBUTED_DIRECTION_KEY] ?? 0
    };
}
