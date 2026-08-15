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
 * @summary The commit address this roster binds to one agent login, or `null` when unmapped.
 *
 * **This is the seam that makes the trailer check sound rather than inferential.** The push-time
 * guard can only read a commit's author email, which is self-asserted metadata — so on its own it
 * has to infer agent-ness from email shape, and @neo-gpt falsified that inference in both
 * directions. `bootstrapWorktree` is the one place that holds *authenticated* identity: it has
 * already matched `NEO_AGENT_IDENTITY` against the registry and the live GitHub login before it
 * binds a Git author email. Asserting there that the authenticated primary IS this address closes
 * the gap the guard cannot close by itself — an agent seat can no longer end up authoring from an
 * address outside this map, so the guard's shape-based classification stops being a guess and
 * becomes a property the bootstrap guarantees.
 *
 * Exported rather than inlined so the two cannot drift: one map, read by the binder and the guard.
 *
 * @param {String} login GitHub login, with or without the leading `@`.
 * @returns {String|null} Lower-cased commit address, or `null` for a login this map does not carry.
 */
export function rosterEmailForLogin(login) {
    const normalized = typeof login === 'string' ? login.trim().toLowerCase() : '';

    if (!normalized) {
        return null
    }

    return EMAIL_BY_LOGIN[normalized.startsWith('@') ? normalized : `@${normalized}`] ?? null
}

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
 * **The boundary is WHO AUTHORED the commit, not which domain the address is on.**
 *
 * The first version of this check scoped itself to `@neomjs.com` so it could never wall off an
 * outside contributor whose address it was never meant to know. That reasoning is right and is
 * preserved below — but as the *only* boundary it was blind in exactly the direction that does
 * harm. GitHub resolves a trailer by its EMAIL and credits whatever account owns it, so an
 * off-domain address in a trailer credits a **real person**, and off-domain was the one thing the
 * domain check could not see. Measured before this change: 16 commits in 36 hours credited two
 * live human accounts, none of them a maintainer on this project, and the guard was silent on all
 * of them while correctly reporting a harmless on-domain typo.
 *
 * So the rule is now asymmetric, and the asymmetry is the whole design:
 *
 * - **Author is a roster agent** → every trailer must be a roster address, *whatever the domain*.
 *   An agent has no legitimate reason to credit an address this map does not carry, and the
 *   addresses that cause damage are precisely the ones outside the project domain.
 * - **Author is anyone else** → only the project domain is this map's business, exactly as before.
 *   An outside contributor's commit is not agent-authored, so their trailers stay out of scope by
 *   construction rather than by a domain heuristic that cannot tell a fabricated address from a
 *   legitimate one.
 *
 * **Why this cannot be left to discipline.** The operator's own address is injected into every
 * agent's context by the harness as a standing field. Any seat composing a trailer can reach for
 * it, and three of them did. A rule that depends on no agent ever reaching for a value placed in
 * front of every agent has already failed.
 *
 * Comparison is case-insensitive on the address. A known address returns nothing.
 *
 * @param {Object}   args
 * @param {Object[]} args.commits `{sha, subject, body, authorEmail}` rows for the commits being
 * pushed. A missing `authorEmail` is treated as non-agent, keeping the pre-existing domain-scoped
 * behaviour for any caller that has not been updated — this check degrades quiet, never loud.
 * @param {Boolean} [args.agentLane=false] An AUTHENTICATED statement that these commits are being
 * pushed on an agent lane, from a source the committer cannot forge: the hook passes the bootstrap's
 * checkout ownership, CI passes the GitHub-authenticated PR author. When true it overrides the
 * per-commit author entirely.
 *
 * **Why an override rather than one more input to the inference.** `authorEmail` is `%ae`, which a
 * single `git commit --author=…` rewrites — measured: an agent commit carrying a poisoned trailer
 * and an off-domain `--author` exited 0 against the email-only classifier. Authenticated lane
 * identity is not forgeable from inside the commit, so where it exists it is the answer and the
 * email is not consulted. Where it does not exist the email remains a best effort, which is why this
 * defaults to `false` rather than being required.
 * @returns {Array<{sha: String, subject: String, email: String, agentAuthored: Boolean}>} One row
 * per offending trailer. `agentAuthored` is what the caller escalates on.
 */
export function findUnknownCoAuthors({commits = [], agentLane = false}) {
    const
        known     = new Set(Object.values(EMAIL_BY_LOGIN).map(email => email.toLowerCase())),
        trailer   = /^\s*co-authored-by:\s*.*?<([^>]+)>\s*$/gim,
        offenders = [];

    commits.forEach(({sha, subject, body, authorEmail}) => {
        const
            // Authenticated lane FIRST, commit metadata only as a fallback. `%ae` is self-asserted:
            // `git commit --author='X <off-domain>'` rewrites it, and measured against the
            // email-only classifier that one flag carried a poisoned trailer to exit 0. Where the
            // caller can state the lane from an unforgeable source — checkout ownership at the hook,
            // the GitHub-authenticated PR author in CI — that statement is the classification and
            // the email is never consulted.
            //
            // Two earlier shapes were falsified rather than merely improved on, and both are worth
            // not re-proposing: treating any `@neomjs.com` author as an agent (admits laundering AND
            // false-positives a human bound to the domain), and refusing the unmapped project-domain
            // case outright (a non-roster author must stay UNAFFECTED, and the seat gap that refusal
            // protected is closed at the binder, which will not bind an unmapped seat at all).
            agentAuthored = agentLane || known.has((authorEmail || '').trim().toLowerCase()),
            seen          = new Set();
        let match;

        trailer.lastIndex = 0;

        while ((match = trailer.exec(body || '')) !== null) {
            const email = match[1].trim().toLowerCase();

            if (known.has(email) || seen.has(email)) {
                continue
            }

            // Non-agent authors keep the original domain boundary; agent authors have none, because
            // the off-domain address is the one that credits a person.
            if (!agentAuthored && !email.endsWith('@neomjs.com')) {
                continue
            }

            seen.add(email);
            offenders.push({sha, subject, email, agentAuthored})
        }
    });

    return offenders
}

/*
 * REMOVED: `findUnmappedProjectAuthors()`.
 *
 * It blocked a commit whose author was on the project domain but absent from the map, on the
 * reasoning that the case is genuinely ambiguous and a named failure beats a silent guess. The
 * reasoning was fine and the rule was wrong: a commit whose author is NOT a roster agent must stay
 * **unaffected**, and a non-roster human on the project domain is exactly that. A reviewer caught
 * that the check contradicted its own change's stated acceptance criterion — and that the real-git
 * suite had a test PINNING the contradiction, which is how it survived a round of review.
 *
 * The gap it was covering — a newly seeded seat falling into the weak path — is closed upstream
 * instead: `resolveAgentGitIdentity()` refuses to bind a Git identity for a seat with no roster
 * address, so an unmapped agent never reaches a commit in the first place. Closing it at the binder
 * costs no false positives; closing it at the guard cost one, aimed at humans.
 */
