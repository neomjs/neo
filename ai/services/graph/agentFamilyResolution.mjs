import {buildHydrationIndex} from '../../graph/identityHydration.mjs';
import {migrateResident}     from '../../graph/identityRootsMigration.mjs';
import {IDENTITIES}          from '../../graph/identityRoots.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';

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
 * The roster's placeholder for a seat whose underlying model is not publicly known — an unreleased
 * preview behind a codename. It is a recorded VALUE, never a family: two seats both carrying it are
 * not thereby the same family, and one carrying it is not thereby different from any other. Any
 * consumer asking whether two families DIFFER must treat it as unresolved.
 * @type {String}
 */
export const UNKNOWN_FAMILY = 'unknown';

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
 * @summary Resolves one resident's model family through the identity trail — the hydration index
 * is the truth source; the flat registry property is the DOCUMENTED, retirement-gated fallback.
 *
 * Read order:
 *  1. **Era chain** (`migrateResident` → `buildHydrationIndex` → `index.currentEra.family`): the
 *     regenerable projection over the resident's validated era chain. No caching happens here, so
 *     no `isIndexCurrent` gate applies — every call projects the trail fresh (a consumer that
 *     caches the index owns that gate).
 *  2. **Flat `properties.modelFamily` fallback**: engaged exactly for residents the migration
 *     module refuses by design — post-epoch residents whose first era is observation-owned and
 *     does not exist until the graph-seeding slice lands. The fallback population is the
 *     mechanical witness of the flat-field retirement blocker: when it reaches zero, the
 *     era-owned flat fields can leave the registry entries.
 * @param {Object} identity AgentIdentity root entry.
 * @returns {String|undefined} The model family, or undefined when neither source resolves.
 */
export function resolveResidentFamily(identity) {
    const migrated = migrateResident(identity);

    if (migrated.valid) {
        const hydrated = buildHydrationIndex({identityNode: migrated.identity, episodes: migrated.episodes});

        if (hydrated.valid) {
            return hydrated.index.currentEra.family
        }
    }

    return identity?.properties?.modelFamily
}

/**
 * Registry entries keyed by canonical `@<identity>` id — the lookup seam for id-keyed family
 * resolution ({@link resolveResidentFamilyById}).
 * @type {Map<String,Object>}
 */
const IDENTITY_BY_ID = new Map(IDENTITIES.map(identity => [identity.id, identity]));

/**
 * @summary Resolves a model family by canonical identity id — era-chain-first for rostered
 * residents ({@link resolveResidentFamily}), `undefined` for ids outside the static registry.
 *
 * Consumers holding a GRAPH node (mailbox alias resolution, wake routing) call this with the
 * node id and fall back to the node's own flat property when it returns `undefined` — that
 * fallback population is runtime-provisioned identities (auto-provisioned at request time,
 * never in the static roster), the second retirement witness beside the post-epoch residents.
 * @param {String} id Canonical `@<identity>` node id.
 * @returns {String|undefined} The model family, or `undefined` when the id is not rostered.
 */
export function resolveResidentFamilyById(id) {
    const identity = IDENTITY_BY_ID.get(id);

    return identity ? resolveResidentFamily(identity) : undefined
}

/**
 * @summary Derives the core swarm login-to-family map from the AgentIdentity registry.
 *
 * `identityRoots.mjs` is the canonical handle indirection seam for named Neo maintainers.
 * Golden Path renders must consume that registry instead of duplicating agent handles in
 * daemon code. Family facts read through the identity trail ({@link resolveResidentFamily});
 * the flat property remains only as the documented post-epoch fallback until retirement.
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
                resolveResidentFamily(identity)
            )
            .map(identity => [
                getIdentityGithubLogin(identity),
                resolveResidentFamily(identity)
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
 * @summary Resolves the model family that a submitted review SPENDS budget against.
 *
 * Separate from {@link resolveAuthorFamily} because the two answer different questions from
 * different evidence. An author is resolved through the PR body's self-id, which survives an
 * opener whose login mis-resolved. A reviewer has no such body convention: the submitting login
 * IS the act, so the login is the only honest source and no fallback exists to soften it.
 *
 * The verdict is a pair rather than a bare family, and that distinction is the whole point of
 * this function. A budget consumer must be able to tell "resolved to `gpt`" from "could not be
 * resolved", because those demand opposite handling — one spends a family's round, the other
 * must refuse rather than quietly spend nobody's. Returning `undefined` for both would let an
 * unclassifiable reviewer slip through whichever branch happened to be the permissive one.
 *
 * @param {Object} review GitHub review payload; `author.login` is the subject.
 * @param {Object} [agentFamilies=getCoreSwarmAgentFamilies()] Login-to-family map.
 * @returns {{classified: Boolean, family: (String|null), login: (String|null)}}
 */
export function resolveReviewerFamily(review, agentFamilies = getCoreSwarmAgentFamilies()) {
    const login = review?.author?.login || null;

    if (!login) return {classified: false, family: null, login: null};

    const family = agentFamilies[login.replace(/^@/, '')];

    return family
        ? {classified: true,  family, login}
        : {classified: false, family: null, login}
}

/**
 * @summary Groups submitted reviews by the family whose budget each one spends.
 *
 * The counting unit is the FAMILY, never the identity: two identities of one family reviewing the
 * same PR are one family's round, or a family could buy extra rounds by rotating seats. Counting
 * is by occurrence across the whole review population, so later heads and retractions cannot
 * refund a round that was already spent — a spent round is a fact about the review economy, not
 * about the current diff.
 *
 * Unclassifiable reviewers are returned SEPARATELY rather than dropped or bucketed under a
 * placeholder family. Dropping them would let an unrostered login review without limit; bucketing
 * them together would let two unrelated strangers share one budget. Neither is a decision this
 * function may make silently, so it reports and lets the admission point fail closed.
 *
 * @param {Object[]} reviews Submitted review payloads.
 * @param {Object} [agentFamilies=getCoreSwarmAgentFamilies()] Login-to-family map.
 * @returns {{byFamily: Object<String,Number>, unclassified: Array<{login: (String|null)}>}}
 */
export function groupReviewsByFamily(reviews = [], agentFamilies = getCoreSwarmAgentFamilies()) {
    const byFamily = {}, unclassified = [];

    for (const review of reviews) {
        const resolved = resolveReviewerFamily(review, agentFamilies);

        if (resolved.classified) byFamily[resolved.family] = (byFamily[resolved.family] || 0) + 1;
        else                     unclassified.push({login: resolved.login})
    }

    return {byFamily, unclassified}
}

/**
 * @summary Determines whether a PR has cross-family review coverage.
 *
 * @param {Object} pr GitHub PR payload from `gh pr list`.
 * @param {Object} [agentFamilies=getCoreSwarmAgentFamilies()] Login-to-family map.
 * @returns {Boolean}
 */
export function hasCrossFamilyReview(pr, agentFamilies = getCoreSwarmAgentFamilies()) {
    const verdict = resolveCrossFamilyVerdict(pr, agentFamilies);

    // `null` (author family unresolvable) maps to TRUE here, preserving this function's original
    // reading: an unrostered author is an EXTERNAL contributor, and the mandate exists to stop one
    // model family self-approving — a risk an external human's PR does not carry. That is why any
    // classified approver satisfies it. The verdict form below keeps `null` distinct so a gate can
    // decide for itself rather than inheriting a report's charity.
    return verdict.crossFamily === null
        ? verdict.approvingFamilies.length > 0
        : verdict.crossFamily
}

/**
 * @summary The cross-family mandate as a VERDICT rather than a boolean — the shape a merge gate needs.
 *
 * `hasCrossFamilyReview` above answers a report line, where an optimistic guess costs a wrong word.
 * A gate cannot spend the same optimism, and the two differences are load-bearing:
 *
 * **1. Only an APPROVED review counts.** The mandate is "at least one cross-family *Approved*
 * review", so a cross-family `COMMENT` or `CHANGES_REQUESTED` is not coverage — it is the opposite
 * of coverage in the `CHANGES_REQUESTED` case. Reviews arrive in every state on the same
 * connection, so the state filter is the difference between counting approvals and counting
 * attention.
 *
 * **2. An unresolvable author family reports `null`, not a verdict.** The boolean form treats that
 * case as satisfied, and deliberately so — an unrostered author is an external contributor, and the
 * mandate exists to stop one model family self-approving, which is not a risk an external human's
 * PR carries. That charity is right for a report and is not a decision this function should make
 * for a caller. `null` is deliberately neither `true` nor `false`: "the author is not one of ours,
 * so the mandate may not even apply" is a third state, and a consumer that collapses it into either
 * boolean has silently chosen a policy. The gate decides; the resolver reports.
 *
 * The approving families are returned alongside the verdict because a blocker that cannot name who
 * approved and what family they belong to sends the reader back to the API to find out.
 *
 * @param {Object} pr GitHub PR payload (`author`, `body`, `reviews`).
 * @param {Object} [agentFamilies=getCoreSwarmAgentFamilies()] Login-to-family map.
 * @returns {{crossFamily: (Boolean|null), authorFamily: (String|null), approvingFamilies: String[], unclassifiedApprovers: String[]}}
 */
export function resolveCrossFamilyVerdict(pr, agentFamilies = getCoreSwarmAgentFamilies()) {
    const
        rawAuthorFamily = resolveAuthorFamily(pr, agentFamilies) ?? null,
        authorFamily    = rawAuthorFamily === UNKNOWN_FAMILY ? null : rawAuthorFamily,
        reviews      = Array.isArray(pr?.reviews) ? pr.reviews : [],
        approvals    = reviews.filter(review => review?.state === 'APPROVED'),
        resolved     = approvals.map(review => resolveReviewerFamily(review, agentFamilies)),

        // `'unknown'` is a recorded family VALUE, not a family. The roster uses it for a seat whose
        // underlying model nobody can state — an unreleased preview behind a codename, where even
        // the seat itself does not know what it is running on. It is truthy, so a naive difference
        // test reads it as "a family that differs from claude" and certifies the mandate on it.
        //
        // That inverts the gate's whole question. §6.1 asks whether the approval came from a
        // DIFFERENT family; `'unknown' !== 'claude'` is true as a string comparison and unknowable
        // as a fact. Treating it as unresolved is the only reading that cannot certify a guarantee
        // nobody can make — and it fails toward the blocker, which is where an unknown belongs.
        knowable              = family => Boolean(family) && family !== UNKNOWN_FAMILY,

        approvingFamilies     = [...new Set(resolved.filter(item => item.classified && knowable(item.family)).map(item => item.family))],
        unclassifiedApprovers = resolved.filter(item => !item.classified || !knowable(item.family)).map(item => item.login).filter(Boolean);

    return {
        authorFamily,
        approvingFamilies,
        unclassifiedApprovers,
        // Order matters: an unknown author short-circuits BEFORE the comparison, because comparing
        // against `null` would silently make every classified approver look cross-family — the same
        // fail-open the boolean form takes deliberately and a gate must not.
        crossFamily: authorFamily === null
            ? null
            : approvingFamilies.some(family => family !== authorFamily)
    }
}
