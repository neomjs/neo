import {IDENTITY_NODE_TYPES, validateEraChain} from './identitySchema.mjs';
import {buildHydrationIndex}                   from './identityHydration.mjs';

/**
 * @module ai/graph/identityRenderContract
 * @summary The consumer read-contract: the Institution-Cockpit render-model's READ surface over
 * the identity-state schema — the schema's named downstream consumer. It resolves a resident —
 * `IdentityState` anchor + its ordered `EmbodiedEpisode` era chain — into a frozen RENDER-VIEW
 * the render-model binds against, so the era-shape actually *renders* an object-permanent self.
 *
 * The load-bearing property this contract exists to guarantee (the reflexive landing — the
 * schema's acceptance fixture — at the consumer boundary):
 * - **The self is keyed by the ANCHOR, never the current era's model/family.** `view.selfKey` is
 *   the never-renamed `identityKey`. So a family switch (Opus→Fable = a new era) yields a view
 *   with the SAME `selfKey` — the render-model re-renders one continuous resident, it does not
 *   fork a new self. {@link sameResident} is that predicate, made executable.
 * - **The current era is a *view*, not the self.** `view.current` carries the head era's mutable
 *   facts (model/family/tier/capabilities) for "who is this resident now"; the resident's identity
 *   does not live there. Rendering the current model as the self is the Fork-8 trap this refuses.
 * - **No snapshot-as-self read path** (§2.2.3): the contract reads via the *regenerable* hydration
 *   index, and its own output carries `regenerable: true` + a non-identity node type — a consumer
 *   structurally cannot persist the view back as "the self". The view is derived, never authored.
 *
 * Fail-closed data-plane logic in the `identitySchema` / `identityHydration` sibling pattern:
 * pure, frozen, `{valid, reason, view}`, never throws. It defines the READ shape only — the
 * render-model's VISUAL design is a separate leaf (the constellation self-view SSOT).
 *
 * Scope: this leaf reads a resident's identity + era facts only. A resident's *direction* (the
 * plan/forecast the render-model may also surface) is a later render concern consumed from the
 * direction contract, not from here — noted so the boundary is explicit, not assumed.
 */

/**
 * @summary The render-view node type — deliberately NOT an identity type, so the schema's chain
 * validator rejects it as an anchor and no consumer can write it back as the self.
 * @type {String}
 */
export const RENDER_VIEW_TYPE = 'IdentityRenderView';

/**
 * @summary Resolves one resident into the frozen render-view the render-model binds against:
 * the object-permanent `selfKey` (the anchor) + the display layer + the current-era facts + the
 * era timeline. Reads via the regenerable hydration index (never a snapshot); refuses a resident
 * whose chain does not validate — the render-model only ever renders certified history.
 * @param {Object} options
 * @param {Object} options.identityNode The `IdentityState` anchor node
 * @param {Object[]} options.episodes The resident's `EmbodiedEpisode` era chain
 * @returns {{valid: Boolean, reason: String|null, view: Object|null}}
 */
export function readResidentForRender({identityNode, episodes} = {}) {
    // reads the regenerable index (never a snapshot-as-self); the index refuses invalid chains,
    // so the render-model binds only against a validated resident
    const hydrated = buildHydrationIndex({identityNode, episodes});

    if (!hydrated.valid) {
        return {valid: false, reason: `render-contract only reads a validated resident: ${hydrated.reason}`, view: null};
    }

    const index   = hydrated.index;
    const ordered = [...episodes].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));

    return {
        valid : true,
        reason: null,
        view  : Object.freeze({
            type       : RENDER_VIEW_TYPE,
            regenerable: true,                          // a derived VIEW — never persist as the self
            selfKey    : index.identityKey,             // the object-permanent key: a family switch keeps THIS
            display    : index.socialLayer,             // {name, salute, …} — the opt-in display layer (frozen)
            current    : index.currentEra,              // full head-era facts: {model, family, since, tier?, harness?, capabilities}
            // compact era-boundary history — model/family/since/until/tier only; `current` carries the full facts (capabilities/harness) for "who now"
            timeline   : Object.freeze(ordered.map(era => Object.freeze({
                model : era.model,
                family: era.family,
                since : era.since,
                until : era.until,
                ...(era.tier !== undefined ? {tier: era.tier} : {})
            }))),                                       // the object-permanent history: N eras, ONE self
            eraCount  : index.eraCount,
            firstSince: index.firstSince
        })
    }
}

/**
 * @summary The object-permanence predicate the render-model uses: two render-views are the SAME
 * resident exactly when they share a **non-empty** anchor `selfKey` — regardless of current
 * model/family. **Fail-closed:** a missing/blank/non-string anchor never matches, so two
 * anchorless render-view-shaped objects are NOT one resident (never collapse via `undefined ===
 * undefined`). This is the reflexive-landing property at the consumer boundary: an Opus-era view
 * and a Fable-era view of the same anchor render as one continuous resident, never two selves.
 * @param {Object} viewA A render-view from {@link readResidentForRender}
 * @param {Object} viewB A render-view from {@link readResidentForRender}
 * @returns {Boolean}
 */
export function sameResident(viewA, viewB) {
    return viewA?.type === RENDER_VIEW_TYPE &&
           viewB?.type === RENDER_VIEW_TYPE &&
           typeof viewA.selfKey === 'string' && viewA.selfKey.trim() !== '' &&
           viewA.selfKey === viewB.selfKey;
}
