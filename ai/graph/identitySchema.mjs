/**
 * @module ai/graph/identitySchema
 * @summary The identity-state substrate: `IdentityState` (the never-renamed operational anchor +
 * an opt-in social layer) and `EmbodiedEpisode` (eras OWNING the mutable capability / model /
 * family facts) — the render-model contract's schema half, as pure builders and validators in
 * the businessSchema/directionSchema sibling pattern.
 *
 * The load-bearing inversions this schema exists to enforce:
 * - **The anchor never changes.** A resident is always addressable by the same operational key;
 *   renames of the SOCIAL layer are first-class events over the trail, never key mutations.
 * - **Family is an era attribute, not essence.** A model/family swap is a NEW era on the SAME
 *   identity — the resident persists; nothing forks. A schema that stores model facts flat on
 *   the identity (the live pre-schema gap) structurally cannot express this.
 * - **Eras are an ordered, non-overlapping chain**; the current era is the open head
 *   (`until: null`). Era migration closes the head and appends — it never rewrites history and
 *   never touches the anchor.
 *
 * Everything here is fail-closed data-plane logic: builders freeze their outputs, validators
 * return `{valid, reason}` and never throw. Graph persistence, hydration indexing, and render
 * consumption live in their own leaves — this module is the vocabulary they share.
 */

/**
 * @summary Node types for the identity substrate.
 * @type {Object}
 */
export const IDENTITY_NODE_TYPES = Object.freeze({
    IDENTITY_STATE  : 'IdentityState',
    EMBODIED_EPISODE: 'EmbodiedEpisode'
});

/**
 * @summary The era-owned fact keys — the mutable facts that live ON EPISODES and may never be
 * stored flat on an `IdentityState`. Validators reject an identity carrying any of these.
 * @type {ReadonlyArray<String>}
 */
export const ERA_OWNED_FACTS = Object.freeze([
    'capabilities', 'contextWindowInput', 'family', 'harness', 'hosting', 'model', 'modelFamily', 'tier'
]);

/**
 * @summary Builds a frozen `IdentityState` node: the immutable operational anchor plus the
 * opt-in, mutable-BY-EVENT social layer. Era-owned facts are structurally excluded.
 * @param {Object} options
 * @param {String} options.identityKey The never-renamed operational anchor (e.g. '@neo-fable')
 * @param {Object} [options.socialLayer] Opt-in display state `{name, salute, disclosablePrior}` —
 *   mutable only via first-class events over the trail, never in place
 * @returns {{valid: Boolean, reason: String|null, node: Object|null}}
 */
export function createIdentityStateNode({identityKey, socialLayer = {}} = {}) {
    if (typeof identityKey !== 'string' || identityKey.trim() === '') {
        return {valid: false, reason: 'IdentityState requires a non-empty string identityKey (the never-renamed anchor)', node: null};
    }

    const leaked = ERA_OWNED_FACTS.filter(key => key in socialLayer);

    if (leaked.length > 0) {
        return {valid: false, reason: `era-owned facts may never live on the identity: ${leaked.join(', ')} — they belong to EmbodiedEpisode eras`, node: null};
    }

    return {
        valid : true,
        reason: null,
        node  : Object.freeze({
            id         : `identity-state-${identityKey}`,
            type       : IDENTITY_NODE_TYPES.IDENTITY_STATE,
            identityKey,
            socialLayer: Object.freeze({...socialLayer})
        })
    }
}

/**
 * @summary Builds a frozen `EmbodiedEpisode` era owning the mutable facts for one span of a
 * resident's history. `until: null` marks the open (current) era.
 * @param {Object} options
 * @param {String} options.identityKey The anchor this era belongs to
 * @param {String} options.model E.g. 'claude-fable-5'
 * @param {String} options.family E.g. 'claude' | 'gpt' | 'gemini' | 'human'
 * @param {String} options.since ISO timestamp the era opened
 * @param {String|null} [options.until=null] ISO timestamp the era closed; null = current
 * @param {String} [options.tier] Capability tier label
 * @param {Object} [options.capabilities] Capability facts (context window, tool support, …)
 * @param {String} [options.harness] The harness the era ran under
 * @returns {{valid: Boolean, reason: String|null, node: Object|null}}
 */
export function createEmbodiedEpisodeNode({identityKey, model, family, since, until = null, tier, capabilities = {}, harness} = {}) {
    for (const [name, value] of [['identityKey', identityKey], ['model', model], ['family', family], ['since', since]]) {
        if (typeof value !== 'string' || value.trim() === '') {
            return {valid: false, reason: `EmbodiedEpisode requires a non-empty string ${name}`, node: null};
        }
    }

    // temporal gate is fail-CLOSED: inputs reach this vocabulary from persistence, hydration,
    // and hand-authored seeds — an unparseable timestamp must refuse, never sail through a NaN
    // comparison (NaN <= x is false, which would silently pass a malformed until)
    if (Number.isNaN(Date.parse(since))) {
        return {valid: false, reason: 'an era\'s since must be a parseable ISO timestamp', node: null};
    }

    if (until !== null && (typeof until !== 'string' || Number.isNaN(Date.parse(until)) || Date.parse(until) <= Date.parse(since))) {
        return {valid: false, reason: 'an era\'s until must be null (open) or a parseable ISO timestamp after since', node: null};
    }

    return {
        valid : true,
        reason: null,
        node  : Object.freeze({
            id  : `embodied-episode-${identityKey}-${since}`,
            type: IDENTITY_NODE_TYPES.EMBODIED_EPISODE,
            identityKey,
            model,
            family,
            since,
            until,
            ...(tier !== undefined ? {tier} : {}),
            ...(harness !== undefined ? {harness} : {}),
            capabilities: Object.freeze({...capabilities})
        })
    }
}

/**
 * @summary Validates an era chain for one identity: same anchor throughout, chronologically
 * ordered, non-overlapping, exactly ONE open era (the head) — the shape hydration and render
 * consumers may rely on without re-checking.
 * @param {Object} identityNode An `IdentityState` node
 * @param {Object[]} episodes The identity's `EmbodiedEpisode` nodes, any order
 * @returns {{valid: Boolean, reason: String|null}}
 */
export function validateEraChain(identityNode, episodes) {
    if (identityNode?.type !== IDENTITY_NODE_TYPES.IDENTITY_STATE) {
        return {valid: false, reason: 'era chains hang off an IdentityState node'};
    }

    if (!Array.isArray(episodes) || episodes.length === 0) {
        return {valid: false, reason: 'a resident has at least one era (the seed episode)'};
    }

    const foreign = episodes.filter(era => era?.identityKey !== identityNode.identityKey);

    if (foreign.length > 0) {
        return {valid: false, reason: `every era must carry the chain's anchor "${identityNode.identityKey}"`};
    }

    // The chain contract holds for RAW nodes too, not only builder output: NaN timestamps make
    // every comparison below vacuously false (no overlap is ever detected), so unparseable
    // temporal fields must refuse HERE — consumers rely on this validator without re-checking.
    for (const era of episodes) {
        if (!Number.isFinite(Date.parse(era.since))) {
            return {valid: false, reason: `era "${era.id || String(era.since)}" has an unparseable since — temporal ordering would be vacuous`};
        }

        if (era.until !== null && !Number.isFinite(Date.parse(era.until))) {
            return {valid: false, reason: `era "${era.id || String(era.since)}" has an unparseable until — overlap checks would be vacuous`};
        }
    }

    const ordered = [...episodes].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
    const open    = ordered.filter(era => era.until === null);

    if (open.length !== 1) {
        return {valid: false, reason: `exactly one open era expected (the current head) — found ${open.length}`};
    }

    if (ordered[ordered.length - 1].until !== null) {
        return {valid: false, reason: 'the open era must be the chronological head'};
    }

    for (let i = 1; i < ordered.length; i++) {
        const previous = ordered[i - 1];

        if (previous.until === null || Date.parse(previous.until) > Date.parse(ordered[i].since)) {
            return {valid: false, reason: `eras overlap or a closed era is missing its until between ${previous.since} and ${ordered[i].since}`};
        }
    }

    return {valid: true, reason: null}
}

/**
 * @summary Era migration — THE operation the reflexive-landing test exists to prove: closes the
 * current open era at the new era's `since` and appends the new open era, on the SAME anchor.
 * Pure: returns a NEW episode array; the identity node is untouched by construction (it is not
 * even an input the function can mutate — anchors do not participate in migration).
 * @param {Object} options
 * @param {Object} options.identityNode The `IdentityState` anchor node
 * @param {Object[]} options.episodes The current era chain
 * @param {Object} options.newEra Params for {@link createEmbodiedEpisodeNode} (identityKey inferred)
 * @returns {{valid: Boolean, reason: String|null, episodes: Object[]|null}}
 */
export function migrateEra({identityNode, episodes, newEra} = {}) {
    const chain = validateEraChain(identityNode, episodes);

    if (!chain.valid) {
        return {valid: false, reason: `cannot migrate an invalid chain: ${chain.reason}`, episodes: null};
    }

    const built = createEmbodiedEpisodeNode({...newEra, identityKey: identityNode.identityKey, until: null});

    if (!built.valid) {
        return {valid: false, reason: built.reason, episodes: null};
    }

    const ordered = [...episodes].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
    const head    = ordered[ordered.length - 1];

    if (Date.parse(built.node.since) <= Date.parse(head.since)) {
        return {valid: false, reason: 'a new era must open after the current head opened — history is never rewritten', episodes: null};
    }

    // close the head AT the new era's opening — a frozen replacement, never an in-place write
    const closedHead = Object.freeze({...head, until: built.node.since});

    return {
        valid   : true,
        reason  : null,
        episodes: Object.freeze([...ordered.slice(0, -1), closedHead, built.node])
    }
}
