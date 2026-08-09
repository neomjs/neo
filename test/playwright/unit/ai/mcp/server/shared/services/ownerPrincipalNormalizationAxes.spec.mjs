import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import path           from 'path';
import Neo            from '../../../../../../../../src/Neo.mjs';
import '../../../../../../../../src/core/_export.mjs';
import ConfigProvider, {createConfigProxy} from '../../../../../../../../ai/ConfigProvider.mjs';
import RootConfigBase                      from '../../../../../../../../ai/configBase.mjs';

/**
 * Witness matrix for owner-principal normalization: measures BLAST RADIUS PER AXIS and
 * deliberately asserts no target behaviour.
 *
 * Whether normalization should be frozen or versioned, and whether it belongs at the config
 * leaf or at the principal boundary, are open design questions at the time of writing. A spec
 * that assumed either would pin a decision nobody has taken. What is pinned here is only what
 * is TRUE TODAY, so that the moment normalization lands anywhere — a leaf `metadata.parse`, or
 * a principal-side projection — these assertions change and force a deliberate re-read instead
 * of silently absorbing a re-key.
 *
 * Why this matters beyond tidiness: `ownerPrincipal` is
 * `(authProvider, normalizedProviderBaseUrl, providerUserId)`. Every axis on which the base URL
 * is NOT normalized is an axis on which one human resolves to two principals — and a principal
 * is an ownership key, so a split re-owns Fleet records and grant edges.
 *
 * Isolation is by construction per ADR-0019 §4/B4 (ticket-ref-ok: the no-singleton-mutation rule
 * this spec obeys is defined there; without the citation the isolation looks like style):
 * each case builds its own `RootConfigBase`
 * instance and never mutates the shared `AiConfig` singleton. The real declaration is used
 * rather than a replica leaf, because a replica would assert the framework's behaviour instead
 * of this repository's configuration — a witness that cannot fail.
 */

const
    AUTH_SERVICE_REL = 'ai/mcp/server/shared/services/AuthService.mjs',
    ENV_NAME         = 'NEO_AUTH_GITLAB_API_BASE_URL',

    /**
     * Spellings a maintainer would call "the same GitLab host". Each is a legal value for
     * `NEO_AUTH_GITLAB_API_BASE_URL`; none is exotic. `relativeRoot` is the GitLab
     * self-managed shape (an instance served under a path prefix), which is why the tuple
     * cannot simply take the origin and discard the path.
     */
    EQUIVALENT_SPELLINGS = Object.freeze({
        canonical    : 'https://gitlab.example.com',
        trailingSlash: 'https://gitlab.example.com/',
        upperCaseHost: 'https://GitLab.Example.com',
        defaultPort  : 'https://gitlab.example.com:443',
        relativeRoot : 'https://gitlab.example.com/gitlab'
    });

/**
 * @summary Resolves the real `auth.gitlabApiBaseUrl` leaf under one env spelling, in isolation.
 *
 * @param {String} envValue Raw environment spelling under test.
 * @returns {String} The leaf's resolved value.
 */
function resolveLeafUnderEnv(envValue) {
    const previous = process.env[ENV_NAME];

    process.env[ENV_NAME] = envValue;

    try {
        return createConfigProxy(Neo.create(RootConfigBase)).auth.gitlabApiBaseUrl
    } finally {
        previous === undefined ? delete process.env[ENV_NAME] : (process.env[ENV_NAME] = previous)
    }
}

let AuthService, originalFetch;

class FakeInvalidTokenError extends Error {}

/**
 * @summary Runs the REAL GitLab-PAT verifier and returns the AuthInfo it produces.
 *
 * The point of the indirection is that nothing here recomputes what production computes. The
 * verifier factory takes `aiConfig` as a plain parameter and `globalThis.fetch` is stubbed, so the
 * provider round-trip is replaced while the identity mapping — including the trailing-slash strip
 * that yields `providerBaseUrl` — stays the shipped code path. A test-local re-implementation
 * would only ever prove the replica agrees with today's source.
 *
 * Each call needs a distinct `token`: the verifier caches by token hash, so a reused token would
 * return the previous envelope and silently answer a question this spec never asked.
 * @param {Object}  options
 * @param {String}  options.baseUrl Configured API base URL spelling under test
 * @param {String}  [options.login='octocat'] Provider handle the API returns
 * @param {Number}  [options.providerId=4242] Immutable provider id the API returns
 * @param {String}  options.token Bearer presented to the verifier; must be unique per call
 * @returns {Promise<Object>} The produced AuthInfo
 */
async function produceAuthInfo({baseUrl, login = 'octocat', providerId = 4242, token}) {
    globalThis.fetch = async () => ({
        ok    : true,
        status: 200,
        json  : async () => ({id: providerId, username: login, name: login})
    });

    const verifier = AuthService.createGitlabPatVerifier({
        aiConfig         : {auth: {
            gitlabApiBaseUrl      : baseUrl,
            patCacheTtlSeconds    : 300,
            patValidationTimeoutMs: 5000
        }},
        logger           : {info: () => {}, warn: () => {}, error: () => {}},
        InvalidTokenError: FakeInvalidTokenError
    });

    return verifier.verifyAccessToken(token)
}

/**
 * @summary Produced `providerBaseUrl` for one configured spelling — the actual principal coordinate.
 * @param {Object} options
 * @param {String} options.baseUrl
 * @param {String} options.token
 * @returns {Promise<String>}
 */
async function produceProviderBaseUrl({baseUrl, token}) {
    return (await produceAuthInfo({baseUrl, token})).providerBaseUrl
}

/**
 * @summary Runs the REAL GitHub-PAT verifier — the second provider axis of the stable tuple.
 *
 * `authProvider` is one of the three coordinates backing the principal, so a matrix that only ever
 * executes the GitLab verifier holds it constant and can never exercise the cross-provider case.
 * GitHub's payload names the handle `login` rather than `username`, which is precisely why the
 * mapping has to be executed rather than assumed equivalent.
 * @param {Object} options
 * @param {String} [options.baseUrl='https://api.github.com']
 * @param {String} [options.login='octocat']
 * @param {Number} [options.providerId=4242]
 * @param {String} options.token Must be unique per call — the verifier caches by token hash
 * @returns {Promise<Object>} The produced AuthInfo
 */
async function produceGithubAuthInfo({baseUrl = 'https://api.github.com', login = 'octocat', providerId = 4242, token}) {
    globalThis.fetch = async () => ({
        ok     : true,
        status : 200,
        headers: {get: () => 'repo, read:user'},
        json   : async () => ({id: providerId, login, name: login})
    });

    const verifier = AuthService.createGithubPatVerifier({
        aiConfig         : {auth: {
            githubApiBaseUrl      : baseUrl,
            patCacheTtlSeconds    : 300,
            patValidationTimeoutMs: 5000,
            allowedUsers          : []
        }},
        logger           : {info: () => {}, warn: () => {}, error: () => {}},
        InvalidTokenError: FakeInvalidTokenError
    });

    return verifier.verifyAccessToken(token)
}

test.describe('ownerPrincipal normalization axes — OQ9 witness matrix (#16738)', () => {
    test.beforeAll(async () => {
        AuthService   = (await import('../../../../../../../../ai/mcp/server/shared/services/AuthService.mjs')).default;
        originalFetch = globalThis.fetch
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch
    });

    test('the leaf normalizes on NO axis: every spelling resolves byte-identical to its env input', () => {
        Object.entries(EQUIVALENT_SPELLINGS).forEach(([axis, spelling]) => {
            expect(resolveLeafUnderEnv(spelling), `axis ${axis} must pass through unchanged`).toBe(spelling)
        })
    });

    test('BLAST RADIUS: 5 leaf spellings PRODUCE only 4 coordinates, executed through the real verifier', async () => {
        const
            leafValues = Object.values(EQUIVALENT_SPELLINGS).map(resolveLeafUnderEnv),
            produced   = [];

        for (const [axis, spelling] of Object.entries(EQUIVALENT_SPELLINGS)) {
            produced.push(await produceProviderBaseUrl({baseUrl: spelling, token: `glpat-${axis}`}))
        }

        expect(new Set(leafValues).size, 'the leaf normalizes on no axis').toBe(5);

        // EXECUTED, not replicated. An earlier revision computed this with a test-local
        // `value.replace(/\/+$/, '')`, which only proved the replica matched today's source — it
        // would have kept passing if the verifier stopped stripping. This runs the real
        // `createGitlabPatVerifier` and reads `AuthInfo.providerBaseUrl` off the produced envelope,
        // so the count is a property of production rather than of the test's own arithmetic.
        expect(new Set(produced).size, 'the produced coordinate set is smaller than the leaf set').toBe(4);

        // Which axis merges is the useful half: exactly one pair, so normalization here is PARTIAL
        // and axis-inconsistent rather than absent. Whoever owns the transport contract inherits
        // three unnormalized axes beside one already handled.
        const byAxis = Object.fromEntries(Object.keys(EQUIVALENT_SPELLINGS).map((axis, index) => [axis, produced[index]]));

        expect(byAxis.trailingSlash, 'trailing slash is the one axis production already merges').toBe(byAxis.canonical);

        ['upperCaseHost', 'defaultPort', 'relativeRoot'].forEach(axis => {
            expect(byAxis[axis], `${axis} still produces its own coordinate`).not.toBe(byAxis.canonical)
        })
    });

    test('IDENTITY SPLIT: one stable tuple whose login is renamed becomes two durable graph nodes', async () => {
        const {normalizeAgentIdentityNodeId} = await import('../../../../../../../../ai/graph/normalizeAgentIdentityNodeId.mjs');

        // Same human, same instance, same immutable provider id — only the handle changed. The
        // produced coordinate is identical, so a principal backed by the stable tuple survives;
        // the durable graph key does not, because it is derived from the login.
        const
            before = await produceAuthInfo({baseUrl: EQUIVALENT_SPELLINGS.canonical, login: 'octocat', providerId: 4242, token: 'glpat-split-a'}),
            after  = await produceAuthInfo({baseUrl: EQUIVALENT_SPELLINGS.canonical, login: 'octodog', providerId: 4242, token: 'glpat-split-b'});

        expect(before.providerBaseUrl, 'the stable coordinate is unchanged').toBe(after.providerBaseUrl);
        expect(before.providerUserId, 'the immutable provider id is unchanged').toBe(after.providerUserId);

        expect(
            normalizeAgentIdentityNodeId(after.userId),
            'the durable key splits even though the stable tuple did not'
        ).not.toBe(normalizeAgentIdentityNodeId(before.userId))
    });

    test('IDENTITY COLLISION: two DIFFERENT stable tuples sharing one login become ONE durable graph node', async () => {
        const {normalizeAgentIdentityNodeId} = await import('../../../../../../../../ai/graph/normalizeAgentIdentityNodeId.mjs');

        // The dangerous direction, and the one a count cannot show. Two different accounts — a
        // different instance AND a different immutable provider id — that happen to share a
        // username resolve to the SAME durable key, because the key carries neither coordinate.
        const
            self  = await produceAuthInfo({baseUrl: 'https://gitlab.example.com',  login: 'octocat', providerId: 4242, token: 'glpat-collide-a'}),
            other = await produceAuthInfo({baseUrl: 'https://gitlab.other-host.com', login: 'octocat', providerId: 9999, token: 'glpat-collide-b'});

        expect(self.providerBaseUrl, 'the tuples differ on instance').not.toBe(other.providerBaseUrl);
        expect(self.providerUserId,  'the tuples differ on provider id').not.toBe(other.providerUserId);

        expect(
            normalizeAgentIdentityNodeId(other.userId),
            'two distinct principals collapse onto one durable key'
        ).toBe(normalizeAgentIdentityNodeId(self.userId));

        // Distinct-login control: the collapse is specific to the shared handle, not an artifact
        // of the derivation flattening everything it is handed.
        const distinct = await produceAuthInfo({baseUrl: 'https://gitlab.other-host.com', login: 'hubcat', providerId: 9999, token: 'glpat-collide-c'});

        expect(
            normalizeAgentIdentityNodeId(distinct.userId),
            'a different login is a different key — the collision is login-specific'
        ).not.toBe(normalizeAgentIdentityNodeId(self.userId))
    });

    test('CROSS-PROVIDER COLLISION: a GitLab and a GitHub account sharing one login share one durable key', async () => {
        const {normalizeAgentIdentityNodeId} = await import('../../../../../../../../ai/graph/normalizeAgentIdentityNodeId.mjs');

        // The widest form of the collision, and the one the earlier arms could not reach because
        // they held `authProvider` constant. `authProvider` is one of the three coordinates backing
        // the principal, so a matrix that only executes one verifier tests two thirds of the tuple.
        // Both verifiers are executed here, so the divergence is produced rather than assumed.
        const
            gitlabInfo = await produceAuthInfo({baseUrl: 'https://gitlab.example.com', login: 'octocat', providerId: 4242, token: 'glpat-xprov'}),
            githubInfo = await produceGithubAuthInfo({login: 'octocat', providerId: 777001, token: 'ghp-xprov'});

        // All three stable coordinates differ — different provider, different instance, different
        // immutable id. These are two unrelated humans by every measure the principal is built on.
        expect(gitlabInfo.authProvider,    'provider differs').not.toBe(githubInfo.authProvider);
        expect(gitlabInfo.providerBaseUrl, 'instance differs').not.toBe(githubInfo.providerBaseUrl);
        expect(gitlabInfo.providerUserId,  'immutable id differs').not.toBe(githubInfo.providerUserId);

        // …and the durable key is identical, because it carries none of them. A GitLab `octocat`
        // and a GitHub `octocat` are one AgentIdentity node today.
        expect(
            normalizeAgentIdentityNodeId(githubInfo.userId),
            'two accounts on different providers collapse onto one durable key'
        ).toBe(normalizeAgentIdentityNodeId(gitlabInfo.userId));

        // Control on the widened axis: the collapse still tracks the handle, not the provider pair.
        const otherLogin = await produceGithubAuthInfo({login: 'hubcat', providerId: 777002, token: 'ghp-xprov-control'});

        expect(
            normalizeAgentIdentityNodeId(otherLogin.userId),
            'a different GitHub login is still a different key'
        ).not.toBe(normalizeAgentIdentityNodeId(gitlabInfo.userId))
    });

    test('the same leaf yields TWO spellings, because the trailing-slash strip lives at the consumer', async () => {
        const
            leafSpelling = resolveLeafUnderEnv(EQUIVALENT_SPELLINGS.trailingSlash),
            source       = await fs.readFile(path.join(process.cwd(), AUTH_SERVICE_REL), 'utf8'),
            // Source-anchored rather than imported: AuthService builds its verifiers inside a
            // factory and exports no pure normalizer, and the unit-test workflow forbids
            // importing a service singleton merely to reach its logic. BOUND, stated so the
            // next reader does not over-read this: matching the literal proves the strip is
            // declared at the consumer, NOT that every code path executes it.
            stripSites   = source.match(/ApiBaseUrl\.replace\(\/\\\/\+\$\/, ''\)/g) || [];

        expect(stripSites.length, 'both forge verifiers strip at the use site').toBe(2);

        // The sanctioned pattern is to read the resolved leaf at the use site. Doing exactly
        // that yields the slash-bearing spelling, while `AuthInfo.providerBaseUrl` carries the
        // stripped one — so a principal keyed on this coordinate takes a different value
        // depending on which reader supplies it.
        expect(leafSpelling).toBe('https://gitlab.example.com/');
        expect(leafSpelling.replace(/\/+$/, '')).toBe('https://gitlab.example.com');
        expect(leafSpelling).not.toBe(leafSpelling.replace(/\/+$/, ''))
    });

    test('MECHANISM REACH: a leaf `parse` normalizes the env layer ONLY — default and runtime override bypass it', async () => {
        const {leaf: leafFactory} = await import('../../../../../../../../ai/ConfigProvider.mjs');

        // Measures the ConfigProvider mechanism a leaf-side normalization proposal would rely on,
        // using a purpose-built leaf rather than the auth ones (which declare no custom parse
        // today, so they cannot exercise this path). The question is reach, not the auth values.
        const
            envName    = 'NEO_UNIT_PRINCIPAL_PARSE_REACH_URL',
            slashy     = 'https://gitlab.example.com/',
            stripSlash = name => {
                const raw = process.env[name];
                return raw === undefined ? undefined : raw.replace(/\/+$/, '')
            },
            build = () => createConfigProxy(Neo.create(ConfigProvider, {
                data: {probe: leafFactory(slashy, envName, 'string', {parse: stripSlash})}
            })),
            previous = process.env[envName];

        try {
            // (a) env layer — the parser runs, so the env spelling is normalized.
            process.env[envName] = slashy;
            expect(build().probe, 'env layer is parsed').toBe('https://gitlab.example.com');

            // (b) DEFAULT — the leaf default is never routed through `parse`, so a
            //     slash-bearing default survives normalization entirely.
            delete process.env[envName];
            expect(build().probe, 'default bypasses parse').toBe(slashy);
        } finally {
            previous === undefined ? delete process.env[envName] : (process.env[envName] = previous)
        }

        // (c) runtime override — `#applyEnvLayer` uses an override verbatim and skips `decode`,
        //     so `setEnvOverride` is a third un-normalized entry point.
        const overridden = Neo.create(ConfigProvider, {
            data: {probe: leafFactory('https://gitlab.example.com', envName, 'string', {parse: stripSlash})}
        });

        overridden.setEnvOverride(envName, slashy);
        expect(createConfigProxy(overridden).probe, 'runtime override bypasses parse').toBe(slashy)
    });

    test('MIGRATION SURFACE: the admission pin keys on the mutable login while the stable id sits beside it', async () => {
        const source = await fs.readFile(path.join(process.cwd(), AUTH_SERVICE_REL), 'utf8');

        // Source-anchored for the same reason as the strip above: the verifiers and their pin
        // live inside factories and export nothing pure. BOUND: this proves what the file
        // DECLARES, not what a given request executes.

        // Both AuthInfo builders derive the caller identity from a mutable provider handle.
        expect(source.match(/^\s+userId\s+: user\.(login|username),$/gm) || [],
            'exactly two login-derived userId assignments').toHaveLength(2);

        // …while the IMMUTABLE provider id is resolved in the very same object literal. The
        // stable coordinate is not missing and does not need plumbing — it is present and
        // simply not the thing ownership keys on.
        expect(source.match(/^\s+providerUserId\s+: user\.id == null \? undefined : String\(user\.id\),$/gm) || [],
            'both builders already resolve the stable provider id').toHaveLength(2);

        // The single ownership decision that compares identities compares the login-derived
        // field, so a provider-side rename refuses admission even though the stable id — and
        // therefore any principal backed by it — is unchanged.
        expect(source).toContain('pinnedProviderSubject = info.userId');
        expect(source).toContain('if (info.userId !== pinnedProviderSubject)')
    });

    test('FIRST WRITE: the durable graph key is the mutable login, and the stable id rides along as a property', async () => {
        const {normalizeAgentIdentityNodeId} = await import('../../../../../../../../ai/graph/normalizeAgentIdentityNodeId.mjs');

        // The real derivation, imported rather than replicated — it is a pure module.
        expect(normalizeAgentIdentityNodeId('octocat')).toBe('@octocat');

        // A provider-side rename is a DIFFERENT durable node. Everything written under the old
        // id stays there; the same human resumes with an empty history. This is the re-key the
        // principal design exists to prevent, and it is the CURRENT behaviour rather than a
        // risk the principal would introduce.
        expect(normalizeAgentIdentityNodeId('octodog')).not.toBe(normalizeAgentIdentityNodeId('octocat'));

        // The derivation takes ONE argument and no provider coordinate, so the durable key
        // structurally cannot carry the stable id — this is not a defaulting choice that could
        // be flipped by passing something else.
        expect(normalizeAgentIdentityNodeId).toHaveLength(1);

        // The persistence half is NOT asserted from source text here. It is executed where the
        // seam lives — `Server.spec.mjs`, "a second provider sharing one login overwrites the
        // first identity on ONE persisted node" — which drives two produced identities through
        // `buildRequestContext()` and reads the stored row. That arm shows the concrete damage a
        // source read cannot: the later write does not merely share the key, it OVERWRITES the
        // first principal's stored coordinates on the same node.
        //
        // Migration-feasibility fact carried by that same row: every provisioned identity already
        // persists the stable coordinate, so a re-key derives from stored data without
        // re-contacting any provider. Freeze-vs-version is a separate question, but it is not
        // gated on data we would have to go and collect.
    });

    test('case is significant here and INSIGNIFICANT for agent identity — one system, two rules', async () => {
        const {parseAgentList} = await import('../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs');

        // Agent identity lower-cases by contract.
        expect(parseAgentList('Neo-Gemini-Pro')).toEqual(['neo-gemini-pro']);

        // The provider coordinate does not — so the repository already answers "is case
        // significant in an identity key?" in both directions, in two adjacent identity
        // domains. Whichever way OQ2/OQ3 resolves, that inconsistency is now recorded rather
        // than rediscovered.
        expect(resolveLeafUnderEnv(EQUIVALENT_SPELLINGS.upperCaseHost))
            .not.toBe(resolveLeafUnderEnv(EQUIVALENT_SPELLINGS.canonical))
    })
});
