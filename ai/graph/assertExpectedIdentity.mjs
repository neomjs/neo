import {IDENTITIES} from './identityRoots.mjs';

/**
 * @summary Pure, fail-closed assertion that the live authed identity is the expected agent.
 *
 * The 2026-06-14 drift was a silent failure: a mis-set `GH_TOKEN` made
 * `gh api user` resolve to the wrong agent, so PRs were opened and reviews
 * posted under a mis-attributed identity. This core turns that into a loud,
 * deterministic check: given the expected agent, the live authed login, and
 * the optional Memory Core self-identity, it returns `{ok:false}` with an
 * explicit reason the moment any of them disagree.
 *
 * It is deliberately pure: all live inputs are injected and the only dependency
 * is the static `IDENTITIES` table. Both github-workflow healthcheck and the
 * write-boundary guard consume this single source of truth rather than
 * re-implementing the comparison.
 */

/**
 * @summary Strips a single leading `@` so identity node ids and GitHub logins compare equal.
 * @param {*} value Value to normalize.
 * @returns {*} Normalized value.
 */
const bare = value => typeof value === 'string' ? value.replace(/^@/, '') : value;

/**
 * @summary Resolves the canonical bare `githubLogin` for an expected identity reference.
 *
 * Matches `expected` against `IDENTITIES` by node id or `githubLogin`, accepting either
 * `@`-prefixed or bare form. Returns null when the identity is missing, unmappable, or
 * intentionally has no GitHub login.
 *
 * @param {String} expected Expected AgentIdentity id or GitHub login.
 * @returns {String|null} Bare GitHub login.
 */
const resolveExpectedLogin = expected => {
    const ref = bare(expected);

    if (!ref) {
        return null;
    }

    const identity = IDENTITIES.find(node => {
        return bare(node.id) === ref || bare(node.properties?.githubLogin) === ref;
    });
    const login = identity?.properties?.githubLogin;

    return login ? bare(login) : null;
};

/**
 * @summary Fail-closed assertion that the live authed identity matches the expected agent.
 *
 * Returns `{ok:true, reason:null}` only when the expected agent resolves to a canonical
 * login, the authed login matches it, and, when supplied, the Memory Core self-identity
 * also matches it. Any gap returns `{ok:false, reason}` with a human-readable diagnostic
 * suitable for healthcheck degradation or write-boundary denial.
 *
 * @param {Object} params
 * @param {String} params.expected The expected AgentIdentity id or GitHub login.
 * @param {String} params.actualLogin Live login from `gh api user --jq .login`.
 * @param {String} [params.memoryCoreIdentity] Memory Core self-identity, when available.
 * @returns {{ok: Boolean, reason: (String|null)}}
 */
function assertExpectedIdentity({expected, actualLogin, memoryCoreIdentity} = {}) {
    const expectedLogin = resolveExpectedLogin(expected);

    if (!expectedLogin) {
        return {ok: false, reason: `identity drift: expected identity '${expected}' is missing or unmappable in identityRoots`};
    }

    const authedLogin = bare(actualLogin);

    if (!authedLogin) {
        return {ok: false, reason: `identity drift: no authed login resolved, expected ${expectedLogin}`};
    }

    if (authedLogin !== expectedLogin) {
        return {ok: false, reason: `identity drift: authed as ${authedLogin}, expected ${expectedLogin}`};
    }

    if (memoryCoreIdentity != null) {
        const memoryLogin = bare(memoryCoreIdentity);

        if (memoryLogin !== expectedLogin) {
            return {ok: false, reason: `identity drift: Memory-Core identity ${memoryLogin}, expected ${expectedLogin}`};
        }
    }

    return {ok: true, reason: null};
}

export {assertExpectedIdentity};
