import {IDENTITIES} from '../../graph/identityRoots.mjs';

/**
 * @summary The ONE fleet↔identity join seam (the single ratified resolver site): maps a
 * fleet-registry agent (by GitHub username or registry id) onto its identity-root display facts —
 * `{family, engineTag}` — for the cockpit DTO.
 *
 * **Source discipline:** reads the flat `ai/graph/identityRoots.mjs` registry — the ratified
 * migration-safe bridge source (usable-now-must-not-ossify). `family` flows as an era/display
 * attribute and `engineTag` as current-session model metadata (`modelDesignation`, the structured
 * mirror of the Model-Stats `name` rows), both READ-ONLY: this seam never writes identity facts.
 * When the EmbodiedEpisode era schema lands, the era swap re-points exactly this resolver — zero
 * change for the assembler or any Body-side consumer.
 *
 * **Closed-set honesty:** an agent with no identity root (a guest / freshly-defined fleet agent
 * that is not a named maintainer) resolves to `{family: null, engineTag: null}` — the cockpit's
 * FamilyRail renders unknown families as `unclassified` and the card hides an absent engine tag,
 * so an unresolved identity degrades honestly instead of guessing.
 * @module ai/services/fleet/resolveIdentityDisplay
 */

/**
 * Identity roots keyed by their handle WITHOUT the `@` prefix (the fleet registry stores GitHub
 * usernames unprefixed, e.g. `neo-gpt`; the graph ids carry the prefix, e.g. `@neo-gpt`). Built
 * once at module load — the roots are a static seed registry.
 * @type {Map<String, Object>}
 */
const identityByLogin = new Map(
    IDENTITIES
        .filter(node => node.type === 'AgentIdentity')
        .map(node => [node.id.replace(/^@/, ''), node])
);

/**
 * @summary Resolve a fleet agent's identity display facts from the identity roots.
 * @param {String|null} agentIdOrLogin The agent's GitHub username or registry id, with or without
 *     a leading `@` (e.g. `neo-gpt`, `@neo-gpt`).
 * @returns {{family: String|null, engineTag: String|null}} the display facts; both `null` when the
 *     agent has no identity root (rendered as unclassified / tagless, never guessed).
 */
export function resolveIdentityDisplay(agentIdOrLogin) {
    const node = typeof agentIdOrLogin === 'string'
        ? identityByLogin.get(agentIdOrLogin.replace(/^@/, ''))
        : null;

    return {
        family   : node?.properties?.family ?? null,
        engineTag: node?.properties?.modelDesignation ?? null
    }
}
