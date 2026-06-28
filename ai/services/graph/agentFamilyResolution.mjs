import {IDENTITIES} from '../../graph/identityRoots.mjs';
import logger       from '../../mcp/server/memory-core/logger.mjs';

/**
 * @module ai/services/graph/agentFamilyResolution
 * @summary Pure agent-identity / model-family resolution, extracted from `GoldenPathSynthesizer`
 * as part of the GoldenPathSynthesizer SRP decomposition.
 *
 * Owner contract: resolve a maintainer's bare GitHub login + model family from the canonical
 * `identityRoots.mjs` roster (and a PR body's `Authored by …` self-id), and decide whether a PR
 * carries cross-family review coverage. These are stateless utilities over the identity roster;
 * `GoldenPathSynthesizer` keeps thin static delegating shims so its public API stays stable.
 */

/**
 * Social Name → `@`-stripped GitHub login, derived from the canonical identity roster. The PR-body
 * self-id leads with the Social Name (`Authored by <Social Name> (…)`); this resolves it to the login
 * the family map keys on. The legacy `@identity` form is still parsed for transitional / pre-trim bodies.
 */
export const SOCIAL_NAME_TO_LOGIN = Object.freeze(Object.fromEntries(
    IDENTITIES
        .filter(identity => identity.name && identity.properties?.githubLogin)
        .map(identity => [identity.name, identity.properties.githubLogin.replace(/^@/, '')])
));

/**
 * @summary Normalizes an `identityRoots.mjs` GitHub login for local GitHub payload matching.
 *
 * AgentIdentity roots store canonical handles with a leading `@`, while GitHub API
 * payloads expose bare login strings. Keeping the conversion in one helper prevents
 * repo-enrichment projections from reintroducing hardcoded handle lists.
 *
 * @param {Object} identity AgentIdentity root entry.
 * @returns {String|null} Bare GitHub login, or `null` when unavailable.
 */
export function getIdentityGithubLogin(identity) {
    const login = identity.properties?.githubLogin;

    return typeof login === 'string' && login ? login.replace(/^@/, '') : null
}

/**
 * @summary Derives the core swarm login-to-family map from the AgentIdentity registry.
 *
 * `identityRoots.mjs` is the canonical handle indirection seam for named Neo maintainers.
 * Golden Path renders must consume that registry instead of duplicating agent handles in
 * daemon code.
 *
 * @returns {Object<String,String>} GitHub login to model-family map.
 */
export function getCoreSwarmAgentFamilies() {
    return Object.fromEntries(
        IDENTITIES
            .filter(identity =>
                identity.type === 'AgentIdentity' &&
                identity.properties?.accountType === 'agent' &&
                identity.properties?.githubLogin &&
                identity.properties?.modelFamily
            )
            .map(identity => [
                getIdentityGithubLogin(identity),
                identity.properties.modelFamily
            ])
    )
}

/**
 * @summary Returns canonical Neo agent GitHub logins from `identityRoots.mjs`.
 *
 * @returns {String[]} Agent logins without leading `@`.
 */
export function getAgentLogins() {
    return Object.keys(getCoreSwarmAgentFamilies())
}

/**
 * @summary Extracts the canonical author login (`@`-stripped) from a PR body's `Authored by …`
 * self-id line, resolving both the Social-Name-led form and the legacy `@identity` form.
 *
 * The body self-id is the drift-free author source: the GitHub PR opener can mis-resolve (an MCP
 * `@me` identity-resolution drift stamps a different agent's login on the opener), but the body
 * declares its own canonical author. The current convention leads with the **Social Name**
 * (`Authored by <Social Name> (<Model>, <Wrapper>).`), resolved to a login via the identity roster;
 * the legacy `Authored by … @identity` form is still parsed for transitional / pre-trim bodies.
 * Returns null when no self-id is present (external bodies) or the Social Name is unregistered, so the
 * caller falls back to the advisory login. The pattern is **line-anchored** (`^…/m`) to the self-id
 * line, so a `Co-Authored by` trailer or prose that merely contains `Authored by` mid-line does not match.
 * @param {String} body
 * @returns {(String|null)} The `@`-stripped author login, or null.
 */
export function parseSelfIdLogin(body) {
    if (typeof body !== 'string') return null;

    // Legacy form first: `Authored by … @identity` (transitional / pre-trim bodies).
    const legacyMatch = body.match(/^Authored by[^\n]*?@([A-Za-z0-9-]+)/m);
    if (legacyMatch) return legacyMatch[1];

    // Current form: `Authored by <Social Name> (…)` — resolve the Social Name to a login via the roster.
    const socialMatch = body.match(/^Authored by (.+?) \(/m);
    return socialMatch ? (SOCIAL_NAME_TO_LOGIN[socialMatch[1].trim()] ?? null) : null
}

/**
 * @summary Resolves a PR author's model family from the canonical body self-id (Social-Name-led, or
 * legacy `@identity`), falling back to the drift-prone GitHub login as an advisory source.
 *
 * The body's self-declared `@identity` wins; the GitHub author login is advisory-only (used when the
 * body carries no self-id), and a body-vs-login family disagreement is logged as drift rather than
 * silently trusted. Model-name substring inference is deliberately NOT used — the self-id is the
 * canonical source, the login is the legacy bridge until every agent PR body carries `@identity`.
 * @param {Object} pr GitHub PR payload (`author`, `body`, `number`).
 * @param {Object} agentFamilies Login-to-family map (`@`-stripped logins).
 * @returns {(String|undefined)} The model family, or undefined when neither source resolves.
 */
export function resolveAuthorFamily(pr, agentFamilies) {
    const selfIdLogin  = parseSelfIdLogin(pr?.body),
          selfIdFamily = selfIdLogin ? agentFamilies[selfIdLogin] : undefined,
          loginFamily  = agentFamilies[pr?.author?.login];

    if (selfIdFamily) {
        if (loginFamily && loginFamily !== selfIdFamily) {
            logger.warn(`[GoldenPathSynthesizer] PR #${pr.number}: author identity drift — body self-id @${selfIdLogin} (${selfIdFamily}) != GitHub login @${pr.author?.login} (${loginFamily}); using the canonical self-id.`);
        }

        return selfIdFamily
    }

    return loginFamily
}

/**
 * @summary Determines whether a PR has cross-family review coverage.
 *
 * @param {Object} pr GitHub PR payload from `gh pr list`.
 * @param {Object} [agentFamilies=getCoreSwarmAgentFamilies()] Login-to-family map.
 * @returns {Boolean}
 */
export function hasCrossFamilyReview(pr, agentFamilies = getCoreSwarmAgentFamilies()) {
    const authorFamily = resolveAuthorFamily(pr, agentFamilies);
    const reviews      = Array.isArray(pr.reviews) ? pr.reviews : [];

    return reviews.some(review => {
        const reviewerLogin  = review.author?.login || review.author?.name || review.author?.login;
        const reviewerFamily = agentFamilies[reviewerLogin];

        if (!reviewerFamily) return false;
        if (!authorFamily) return true;

        return reviewerFamily !== authorFamily
    })
}
