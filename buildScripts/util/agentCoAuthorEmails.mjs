import {IDENTITIES} from '../../ai/graph/identityRoots.mjs';

/**
 * @summary The `githubLogin → commit email` map behind the pre-push co-author trailer check.
 *
 * **Why a map here rather than a field on the registry.** `ai/graph/identityRoots.mjs` is the one
 * durable identity registry and already owns `githubLogin`, but it also seeds Memory Core graph
 * nodes — a field added there becomes an ingested, queryable node property, which is real blast
 * radius for what is a git-tooling concern, and that module deliberately retired era-owned facts to
 * stay lean. `deriveFleetRoster.mjs` faced the same question for engine tags and answered it with a
 * small explicit map beside the consumer, every entry naming its source anchor. This follows that
 * precedent, and stays keyed to the registry so the two cannot drift silently.
 *
 * **Every address below is observed in committed history, never derived from a handle.** Deriving
 * is the defect this module exists to catch: a peer needing an address the roster did not document
 * guessed one from the display name (`ada@`) and another from the GitHub login (`neo-opus-ada@`),
 * producing 19 commits that credit an account nobody owns. Three logins do NOT match their local
 * part, which is exactly why the mapping cannot be computed:
 *
 *   `@neo-opus-ada`   → `neo-opus-4-7@`        (historical: the first Claude seat, pre-naming)
 *   `@neo-opus-grace` → `neo-claude-opus@`
 *   `@neo-gemini-pro` → `neo-gemini-3-1-pro@`
 *
 * **Sunset condition.** Once every active seat satisfies `localPart === githubLogin.slice(1)`, this
 * map retires and the check becomes a derivation rule with nothing to maintain. **Retirement
 * trigger:** the first day `MISMATCHED_LOGINS` below is empty. Delete this file then; do not grow
 * it into a general-purpose identity store.
 *
 * @see #16280 — the ticket this module implements (ticket-ref-ok: implementing ticket)
 * @see ai/graph/identityRoots.mjs — the authoritative identity registry this map is keyed to
 * @see buildScripts/util/deriveFleetRoster.mjs — the precedent for a build script consuming that
 *      registry alongside a small source-anchored map of facts the registry does not carry
 */

/**
 * Commit addresses by GitHub login. Source anchor per entry: occurrence count in `origin/dev`
 * history as of 2026-08-01, so no entry rests on a guess.
 * @member {Object}
 */
const EMAIL_BY_LOGIN = Object.freeze({
    '@neo-opus-ada'   : 'neo-opus-4-7@neomjs.com',       // 837 occurrences
    '@neo-opus-grace' : 'neo-claude-opus@neomjs.com',    // 336
    '@neo-opus-vega'  : 'neo-opus-vega@neomjs.com',      // 242
    '@neo-gpt'        : 'neo-gpt@neomjs.com',            // 915
    '@neo-gpt-emmy'   : 'neo-gpt-emmy@neomjs.com',       // 142
    '@neo-kimi-iris'  : 'neo-kimi-iris@neomjs.com',      // 38
    '@neo-kimi-phoebe': 'neo-kimi-phoebe@neomjs.com',    // 51
    '@neo-fable'      : 'neo-fable@neomjs.com',          // 92
    '@neo-fable-clio' : 'neo-fable-clio@neomjs.com',     // 64
    '@neo-gemini-pro' : 'neo-gemini-3-1-pro@neomjs.com'  // 288 — dormant seat, address still real
});

/**
 * @summary Agent logins in the registry, so a typo or a newly seeded seat cannot pass unnoticed.
 *
 * Filtered on `accountType === 'agent'`, not on the `AgentIdentity` node type: the registry types
 * the human operator as an `AgentIdentity` root too, and their personal address is deliberately not
 * carried here — this file is a project-domain map, not a contact list. Keying on the field the
 * registry already uses to draw that line keeps the exclusion declarative rather than a hardcoded
 * name that would silently miss a second human seat.
 *
 * @returns {String[]} `githubLogin` values of every agent-account root.
 */
export function registryAgentLogins() {
    return IDENTITIES
        .filter(entry => entry.properties?.accountType === 'agent' && entry.properties?.githubLogin)
        .map(entry => entry.properties.githubLogin)
}

/**
 * @summary Logins whose email local part differs from the login — the reason this map exists.
 * @returns {String[]} Empty when the derivation rule becomes safe and this file can retire.
 */
export function mismatchedLogins() {
    return Object.entries(EMAIL_BY_LOGIN)
        .filter(([login, email]) => email.split('@')[0] !== login.slice(1))
        .map(([login]) => login)
}

/**
 * @summary Reconciles the map against the registry so the two cannot drift silently.
 *
 * Returns both directions rather than a boolean: a login in the registry with no address is a seat
 * whose trailers cannot be validated, and an address keyed to a login the registry does not know is
 * a typo that would silently never match. Callers decide severity; this stays pure.
 *
 * @returns {{missingEmail: String[], unknownLogin: String[]}}
 */
export function reconcileWithRegistry() {
    const
        registry = new Set(registryAgentLogins()),
        mapped   = new Set(Object.keys(EMAIL_BY_LOGIN));

    return {
        missingEmail: [...registry].filter(login => !mapped.has(login)).sort(),
        unknownLogin: [...mapped].filter(login => !registry.has(login)).sort()
    }
}

/**
 * @summary Finds `Co-Authored-By` addresses that credit no known agent account.
 *
 * **Scoped to `@neomjs.com` by construction.** A trailer for a human contributor, an outside
 * collaborator, or a bot is out of scope and can never warn — the domain check is the boundary, not
 * a special case, so this guard cannot wall off someone whose address it was never meant to know.
 *
 * Comparison is case-insensitive on the address. A known address returns nothing; anything else on
 * the project domain is reported with the commit that carries it.
 *
 * @param {Object}   args
 * @param {Object[]} args.commits `{sha, subject, body}` rows for the commits being pushed.
 * @returns {Array<{sha: String, subject: String, email: String}>} One row per offending trailer.
 */
export function findUnknownCoAuthors({commits = []}) {
    const
        known     = new Set(Object.values(EMAIL_BY_LOGIN).map(email => email.toLowerCase())),
        trailer   = /^\s*co-authored-by:\s*.*?<([^>]+)>\s*$/gim,
        offenders = [];

    commits.forEach(({sha, subject, body}) => {
        const seen = new Set();
        let   match;

        trailer.lastIndex = 0;

        while ((match = trailer.exec(body || '')) !== null) {
            const email = match[1].trim().toLowerCase();

            // Only the project domain is this map's business — see the scoping note above.
            if (!email.endsWith('@neomjs.com') || known.has(email) || seen.has(email)) {
                continue
            }

            seen.add(email);
            offenders.push({sha, subject, email})
        }
    });

    return offenders
}
