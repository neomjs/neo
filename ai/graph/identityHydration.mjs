import {IDENTITY_NODE_TYPES, validateEraChain} from './identitySchema.mjs';

/**
 * @module ai/graph/identityHydration
 * @summary Hydration as a REGENERABLE INDEX over the identity trail — the fast "who is this
 * resident now?" read, built by projection, never by snapshotting a self.
 *
 * The inversion this module enforces (the Fork-8 trap, refused by construction):
 * - **The trail is the truth; the index is a view.** `buildHydrationIndex` is a pure,
 *   deterministic projection over a VALIDATED era chain — no clock, no I/O, no hidden state.
 *   Building twice over the same trail yields deep-equal indexes, so losing the index loses
 *   NOTHING: delete → rebuild → diff = ∅ is an executable property, not a promise. (The live
 *   empirical anchor: the mailbox read-state rollback — index-layer state proved fragile while
 *   the message trail stayed intact; regenerability is what made that survivable.)
 * - **The index cannot masquerade as an identity.** It carries its own node type and a
 *   `regenerable: true` flag, is frozen, and the schema's chain validator rejects it as an
 *   anchor by construction — a consumer structurally cannot write it back as "the self".
 * - **Staleness is detected, never trusted.** The index goes stale the instant the resident's
 *   trail grows; `isIndexCurrent` makes that a cheap honest check so consumers rebuild instead
 *   of reading a frozen self.
 */

/**
 * @summary The hydration index node type — deliberately NOT an identity type.
 * @type {String}
 */
export const HYDRATION_INDEX_TYPE = 'IdentityHydrationIndex';

/**
 * @summary Builds the frozen hydration index for one resident: the anchor + social projection,
 * the current era's facts, and the chain stats consumers page against. Pure and deterministic —
 * the SAME trail always yields a deep-equal index.
 * @param {Object} options
 * @param {Object} options.identityNode The `IdentityState` anchor node
 * @param {Object[]} options.episodes The resident's `EmbodiedEpisode` chain
 * @returns {{valid: Boolean, reason: String|null, index: Object|null}}
 */
export function buildHydrationIndex({identityNode, episodes} = {}) {
    const chain = validateEraChain(identityNode, episodes);

    if (!chain.valid) {
        return {valid: false, reason: `hydration only projects VALIDATED chains: ${chain.reason}`, index: null};
    }

    const ordered = [...episodes].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
    const head    = ordered[ordered.length - 1];

    return {
        valid : true,
        reason: null,
        index : Object.freeze({
            type       : HYDRATION_INDEX_TYPE,
            regenerable: true,
            identityKey: identityNode.identityKey,
            socialLayer: identityNode.socialLayer,
            currentEra : projectCurrentEra(head),
            eraCount   : ordered.length,
            firstSince : ordered[0].since
        })
    }
}

/**
 * @summary The ONE current-era projection — used by the builder AND the staleness check, so the
 * comparison can never drift from the projected shape (one rule set, two call sites: the same
 * structural-symmetry move as merge-then-validate on the blueprint side).
 * @param {Object} head The chain's open head era
 * @returns {Object} frozen projection
 */
function projectCurrentEra(head) {
    return Object.freeze({
        model : head.model,
        family: head.family,
        since : head.since,
        ...(head.tier    !== undefined ? {tier: head.tier}       : {}),
        ...(head.harness !== undefined ? {harness: head.harness} : {}),
        capabilities: head.capabilities
    })
}

/**
 * @summary Cheap staleness check: an index is current exactly when the trail it projected has
 * neither grown nor re-headed. A stale result means REBUILD — never read the frozen self.
 * @param {Object} index A hydration index from {@link buildHydrationIndex}
 * @param {Object[]} episodes The resident's live era chain
 * @returns {Boolean}
 */
export function isIndexCurrent(index, episodes) {
    if (index?.type !== HYDRATION_INDEX_TYPE || !Array.isArray(episodes) || episodes.length === 0) return false;

    const ordered = [...episodes].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
    const head    = ordered[ordered.length - 1];

    // Full projected-shape comparison via the SAME projection the builder uses: an index whose
    // head-era FACTS changed (capabilities, tier, harness, family) is stale even when since and
    // model still match — a partial-key check would silently serve outdated facts as current.
    return index.eraCount === ordered.length &&
        JSON.stringify(index.currentEra) === JSON.stringify(projectCurrentEra(head))
}
