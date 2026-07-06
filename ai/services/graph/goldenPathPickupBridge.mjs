/**
 * @module ai/services/graph/goldenPathPickupBridge
 * @summary GP pickup bridge — frontier-empty declared-intent fallback + parent-inherited structural weight (#14659; ticket-ref-ok: owning-leaf anchor).
 *
 * Bridges the autonomous-pickup blindness that appears when the REM-starved frontier is empty AND
 * newly-filed tickets carry ~0 structural weight (cold-start) — the exact failure where the Computed
 * Golden Path recommended ONE semantic-only item on the night ~80 fat tickets were filed. Two additive,
 * FAIL-OPEN branches, both designed to DISSOLVE once the sibling EVOLUTION_GOAL direction chain is live
 * (the removal trigger: the direction anchors make declared intent a first-class ranking axis).
 *
 * Fail-open discipline (inherited hard AC; ticket-ref-ok: #13751 fail-open-AC anchor): neither branch can
 * zero or gate the base route. The fallback activates ONLY when the frontier anchor is empty OR the
 * routed-node count is zero; parent-inheritance only LIFTS a cold-start item, never lowers a scored one.
 */

/**
 * Parent-epic structural inheritance coefficient. A new tree-filed leaf with ~0 structural weight
 * inherits α × its parent epic's structural weight, so the NORMAL `2×semantic + 1×structural` formula can
 * see it — not just the fallback. Constant + documented; deliberately no runtime knob (no tuning theater).
 */
export const PICKUP_BRIDGE_PARENT_ALPHA = 0.5;

/**
 * Structural weights at or below this are the cold-start "~0" class (the traced mechanism zeroes every
 * new / unlinked item). Inheritance lifts these; anything above is already visible and left untouched.
 */
export const STRUCTURAL_COLD_START_EPSILON = 1e-9;

/**
 * Provenance line rendered on a fallback capture so the handoff never masquerades as the semantic ranking.
 */
export const DECLARED_INTENT_PROVENANCE = 'fallback: declared-intent (frontier empty)';

/**
 * Stable, honest cause codes for WHY the semantic frontier is empty — the vocabulary the render
 * attributes from MEASURED pipeline state instead of asserting a fixed mechanism. `UNATTRIBUTED` is
 * the least-asserting default: when the signals cannot distinguish a cause, we say so rather than
 * inventing one. (Distinct from `INTENT_STARVED` in `ai/graph/directionAttribution.mjs`, which is a
 * declared-GOAL-attribution state, not a frontier-pipeline cause.)
 */
export const FRONTIER_EMPTY_CAUSE = Object.freeze({
    COLD_START         : 'COLD_START',
    REM_STALLED        : 'REM_STALLED',
    FRONTIER_UNANCHORED: 'FRONTIER_UNANCHORED',
    UNATTRIBUTED       : 'UNATTRIBUTED'
});

/**
 * @summary Fail-open activation predicate: the declared-intent fallback fires ONLY when the semantic
 * frontier anchor is empty OR the base route produced zero nodes. It can never fire alongside a healthy
 * route, so it cannot displace the semantic ranking.
 * @param {Object}  input
 * @param {Boolean} input.frontierEmpty The semantic frontier anchor set is empty.
 * @param {Number}  input.routedCount   Nodes the base route produced (post-guard).
 * @returns {Boolean}
 */
export function shouldActivateFallback({frontierEmpty, routedCount} = {}) {
    return frontierEmpty === true || routedCount === 0;
}

/**
 * @summary Honest cause classification for the frontier-empty fallback: maps MEASURED pipeline state
 * to a stable {@link FRONTIER_EMPTY_CAUSE} code + human phrase, so the render attributes the real
 * reason the semantic frontier is empty instead of asserting a fixed mechanism. The prior hardcoded
 * "REM-starved / cold-start" was false whenever the frontier was empty for a different reason — e.g.
 * the consolidation cycle not firing (the wake daemon off) while digestion itself was healthy
 * (V-B-A 2026-07-06: `undigested` 7, cycles completing, yet the anchor was empty).
 *
 * Least-asserting by design: `recentCycleCount > 0` rules out a stall regardless of `undigested`, and
 * when the inputs cannot distinguish a cause it returns `UNATTRIBUTED` — it never re-asserts a
 * mechanism it did not measure.
 *
 * @param {Object}  [state]
 * @param {Number}  [state.digested]           Digested-node count (`0` ⇒ genuine cold-start).
 * @param {Number}  [state.undigested]         Undigested-node count (backlog signal).
 * @param {Number}  [state.recentCycleCount]   Completed REM cycles in the recent window (`0` ⇒ not cycling).
 * @param {Boolean} [state.frontierAnchorEmpty] The semantic frontier anchor set is empty.
 * @returns {{code: String, phrase: String}}
 */
export function classifyFrontierEmptyCause({digested, undigested, recentCycleCount, frontierAnchorEmpty} = {}) {
    const dig = Number(digested),
          und = Number(undigested),
          cyc = Number(recentCycleCount);

    // Genuine cold-start: nothing has ever been digested, so there is no history to anchor.
    if (Number.isFinite(dig) && dig === 0) {
        return {code: FRONTIER_EMPTY_CAUSE.COLD_START, phrase: 'cold-start — no digested history to anchor yet'};
    }

    // REM stalled: undigested work exists but no recent cycle drained it (the consolidation pipeline
    // is not running). `recentCycleCount > 0` below rules this out even under a transient backlog.
    if (Number.isFinite(cyc) && cyc === 0 && Number.isFinite(und) && und > 0) {
        return {code: FRONTIER_EMPTY_CAUSE.REM_STALLED, phrase: 'REM consolidation stalled — undigested work, no recent cycles'};
    }

    // Digestion is healthy (history exists) yet the anchor is empty: the cycle that repopulates the
    // frontier is not running even though throughput is fine — the daemon-off case.
    if (frontierAnchorEmpty === true && Number.isFinite(dig) && dig > 0) {
        return {code: FRONTIER_EMPTY_CAUSE.FRONTIER_UNANCHORED, phrase: 'frontier unanchored — digested history exists but the anchor is empty'};
    }

    // Signals cannot distinguish a cause — assert nothing.
    return {code: FRONTIER_EMPTY_CAUSE.UNATTRIBUTED, phrase: 'cause unattributed — frontier anchor empty for an unmeasured reason'};
}

/**
 * @summary Parent-inherited structural weight: a cold-start (~0) item inherits α × its parent epic's
 * structural weight; an already-scored item is returned UNCHANGED. Never lowers a weight (fail-open).
 * @param {Object} input
 * @param {Number} input.structuralWeight          The item's own structural weight.
 * @param {Number} [input.parentStructuralWeight=0] The parent epic's structural weight.
 * @param {Number} [input.alpha=PICKUP_BRIDGE_PARENT_ALPHA]
 * @returns {Number} the (possibly lifted) structural weight — always `>=` the input.
 */
export function inheritParentStructuralWeight({structuralWeight, parentStructuralWeight = 0, alpha = PICKUP_BRIDGE_PARENT_ALPHA} = {}) {
    const own = Number(structuralWeight) || 0;

    // Already visible to the normal formula — inheritance must not touch it.
    if (own > STRUCTURAL_COLD_START_EPSILON) return own;

    const inherited = alpha * (Number(parentStructuralWeight) || 0);

    // Fail-open: only ever lift, never lower.
    return inherited > own ? inherited : own;
}

/**
 * @summary Ranks actionable items by DECLARED INTENT for the frontier-empty fallback: open-epic-tree
 * membership (weighted by the epic's activity), unblocked status (blocked items are dropped — not
 * actionable now), filing recency as the tiebreak. Attaches the fallback provenance to each result.
 *
 * @param {Object[]} items
 * @param {String}   items[].id
 * @param {Boolean}  items[].inOpenEpic       Item has a parent edge into an OPEN epic.
 * @param {Number}   [items[].epicActivity=0] Parent epic's open-PR / recent-motion activity.
 * @param {Boolean}  [items[].blocked=false]  Item has an open `blocked_by`.
 * @param {String}   [items[].filedAt]        ISO filing time (recency tiebreak).
 * @returns {Object[]} unblocked items sorted by declared-intent score then recency, provenance-tagged.
 */
export function rankByDeclaredIntent(items = []) {
    const actionable = (Array.isArray(items) ? items : []).filter(item => item && item.blocked !== true);

    const scored = actionable.map(item => ({
        ...item,
        declaredIntentScore: item.inOpenEpic ? 1 + (Number(item.epicActivity) || 0) : 0,
        provenance         : DECLARED_INTENT_PROVENANCE
    }));

    return scored.sort((a, b) =>
        b.declaredIntentScore - a.declaredIntentScore ||
        String(b.filedAt || '').localeCompare(String(a.filedAt || ''))
    );
}

/**
 * @summary Renders the frontier-empty declared-intent fallback as a markdown section, LED by the
 * provenance line so the handoff never masquerades as the semantic ranking. Bounded to `limit` items;
 * returns an empty string when there is nothing to surface (the caller then renders the empty section).
 * @param {Object[]} rankedItems Output of `rankByDeclaredIntent` (already sorted + provenance-tagged).
 * @param {Number}   [limit=5]
 * @param {{code: String, phrase: String}} [cause] The MEASURED frontier-empty cause from
 *   {@link classifyFrontierEmptyCause}. When omitted, the render attributes no mechanism (the honest
 *   `UNATTRIBUTED` phrase) rather than the former hardcoded "REM-starved / cold-start".
 * @returns {String} the markdown section, or `''` when there are no items.
 */
export function renderDeclaredIntentFallback(rankedItems = [], limit = 5, cause) {
    const items = (Array.isArray(rankedItems) ? rankedItems : []).slice(0, Math.max(0, limit));

    if (items.length === 0) return '';

    // Attribute the MEASURED cause; never re-assert an unmeasured mechanism (the honest-states fix).
    // A malformed/absent `cause` degrades to the least-asserting UNATTRIBUTED phrase (single source).
    const causePhrase = (cause && typeof cause.phrase === 'string' && cause.phrase) || classifyFrontierEmptyCause().phrase;

    const lines = items.map((item, index) =>
        `${index + 1}. #${item.id}${item.inOpenEpic ? ` — open-epic leaf (activity ${Number(item.epicActivity) || 0})` : ''}`
    );

    return [
        `### Computed Golden Path — ${DECLARED_INTENT_PROVENANCE}`,
        '',
        `> The semantic frontier is empty (${causePhrase}). Ranking ${items.length} unblocked open-epic-tree leaf/leaves by declared intent instead — **provisional, not the semantic ranking.**`,
        '',
        ...lines,
        ''
    ].join('\n');
}
