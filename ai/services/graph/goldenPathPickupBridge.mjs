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
