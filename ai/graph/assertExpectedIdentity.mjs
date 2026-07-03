import {IDENTITIES} from './identityRoots.mjs';

/**
 * @summary Pure, fail-closed assertion that the live authed identity is the *expected* agent —
 * the detection core for GitHub `GH_TOKEN` identity drift (the 2026-06-14 agent identity drift incident).
 *
 * The 2026-06-14 drift was a silent failure: a mis-set `GH_TOKEN` made `gh api user` resolve to the
 * wrong agent, so PRs were opened and reviews posted under a mis-attributed identity with nothing
 * surfacing it. This core turns that into a loud, deterministic check: given the expected agent
 * (the harness `NEO_AGENT_IDENTITY`), the live authed login (`gh api user --jq .login`), and the
 * Memory-Core self-identity (the second surface sharing the same token), it returns `{ok:false}`
 * with an explicit reason the moment any of them disagree.
 *
 * It is deliberately PURE: all inputs are injected and the only dependency is the static
 * `IDENTITIES` table, so it is unit-provable with no live `gh`, no Memory-Core, and no I/O. Both the
 * github-workflow healthcheck (`ai/services/github-workflow/HealthService.mjs`) and the
 * write-boundary guard (`ai/mcp/server/github-workflow/toolService.mjs`) consume this single
 * source of truth rather than re-implementing the comparison.
 *
 * It lives beside `identityRoots.mjs` because the expected-login mapping is read straight from that
 * canonical `IDENTITIES` table; it is identity logic over identity data, not github-workflow-specific.
 */

/**
 * @summary Stable machine codes naming each `assertExpectedIdentity` outcome — a structured contract
 * so consumers branch on a code, not on the human-readable `reason` prose (which is free to reword).
 * Generic by design (not GitHub-specific): a consumer like the write-boundary guard maps these to its
 * own domain codes. `OK` is the pass; each other value names one distinct fail-closed kind.
 * @enum {String}
 */
export const IdentityAssertionCode = Object.freeze({
    OK                  : 'OK',
    EXPECTED_UNMAPPABLE : 'EXPECTED_UNMAPPABLE',
    NO_AUTHED_LOGIN     : 'NO_AUTHED_LOGIN',
    LOGIN_MISMATCH      : 'LOGIN_MISMATCH',
    MEMORY_CORE_MISMATCH: 'MEMORY_CORE_MISMATCH'
});

/**
 * @summary Strips a single leading `@` so the id form (`@neo-gpt`) and the `gh api user` login form
 * (`neo-gpt`) compare equal. Non-string input passes through unchanged for the caller to reject.
 * @param {*} value
 * @returns {*}
 */
const bare = value => typeof value === 'string' ? value.replace(/^@/, '') : value;

/**
 * @summary Resolves the canonical *bare* `githubLogin` for an expected identity reference.
 *
 * Matches `expected` (an `IDENTITIES` `id` or `githubLogin`, in either `@`-prefixed or bare form)
 * against the table and returns its bare `githubLogin`, or `null` when the reference is missing,
 * unmappable, or maps to an identity without a login (e.g. the `@system` sender) — every such case
 * is fail-closed at the call site.
 * @param {String} expected
 * @returns {String|null}
 */
const resolveExpectedLogin = expected => {
    const ref      = bare(expected);
    if (!ref) {return null}

    const identity = IDENTITIES.find(node => bare(node.id) === ref || bare(node.properties?.githubLogin) === ref),
          login    = identity?.properties?.githubLogin;

    return login ? bare(login) : null;
};

/**
 * @summary Fail-closed assertion that the live authed identity matches the expected agent.
 *
 * Returns `{ok:true, reason:null, code:'OK'}` only when the expected agent resolves to a canonical
 * login AND the authed login matches it AND (when supplied) the Memory-Core self-identity matches it
 * too. Any gap — unmappable expected id, absent authed login, login mismatch, or Memory-Core mismatch
 * — returns `{ok:false, reason, code}` with an explicit `"authed as X, expected Y"`-style message
 * suitable for a `degraded` healthcheck status or a write-boundary denial. The `code` is a stable
 * {@link IdentityAssertionCode} naming the outcome kind, so consumers branch on it rather than
 * string-matching the human-readable `reason`.
 *
 * `memoryCoreIdentity` is optional: omit it (or pass `null`/`undefined`) to assert the GitHub surface
 * alone; pass it to also cover the second surface that shares the drifted token.
 *
 * @param {Object} params
 * @param {String} params.expected The expected agent identity — the harness `NEO_AGENT_IDENTITY`
 * (an `IDENTITIES` id / login, `@`-prefixed or bare).
 * @param {String} params.actualLogin The live authed login from `gh api user --jq .login` (bare).
 * @param {String} [params.memoryCoreIdentity] The Memory-Core self-identity, when available.
 * @returns {{ok: Boolean, reason: (String|null), code: String}} `code` is an {@link IdentityAssertionCode} value.
 */
export function assertExpectedIdentity({expected, actualLogin, memoryCoreIdentity} = {}) {
    const expectedLogin = resolveExpectedLogin(expected);

    if (!expectedLogin) {
        return {ok: false, reason: `identity drift: expected identity '${expected}' is missing or unmappable in identityRoots`, code: IdentityAssertionCode.EXPECTED_UNMAPPABLE};
    }

    const authedLogin = bare(actualLogin);

    if (!authedLogin) {
        return {ok: false, reason: `identity drift: no authed login resolved, expected ${expectedLogin}`, code: IdentityAssertionCode.NO_AUTHED_LOGIN};
    }

    if (authedLogin !== expectedLogin) {
        return {ok: false, reason: `identity drift: authed as ${authedLogin}, expected ${expectedLogin}`, code: IdentityAssertionCode.LOGIN_MISMATCH};
    }

    if (memoryCoreIdentity != null) {
        const memoryLogin = bare(memoryCoreIdentity);

        if (memoryLogin !== expectedLogin) {
            return {ok: false, reason: `identity drift: Memory-Core identity ${memoryLogin}, expected ${expectedLogin}`, code: IdentityAssertionCode.MEMORY_CORE_MISMATCH};
        }
    }

    return {ok: true, reason: null, code: IdentityAssertionCode.OK};
}
