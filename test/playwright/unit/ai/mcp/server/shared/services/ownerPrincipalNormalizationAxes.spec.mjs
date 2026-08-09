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

test.describe('ownerPrincipal normalization axes — OQ9 witness matrix (#16738)', () => {
    test('the leaf normalizes on NO axis: every spelling resolves byte-identical to its env input', () => {
        Object.entries(EQUIVALENT_SPELLINGS).forEach(([axis, spelling]) => {
            expect(resolveLeafUnderEnv(spelling), `axis ${axis} must pass through unchanged`).toBe(spelling)
        })
    });

    test('BLAST RADIUS: five spellings of one host resolve to five distinct principal coordinates', () => {
        const resolved = Object.values(EQUIVALENT_SPELLINGS).map(resolveLeafUnderEnv);

        // The measurement the fold needs: today the equivalence class does not collapse at all.
        // Five spellings a human calls one host are five ownership keys. If a later change
        // collapses any subset, this count drops and the drop is the migration's blast radius.
        // Red-proved 2026-08-09: asserting a collapsed class (`toBe(1)`) fails with
        // `Received: 5`, so this measures five genuinely distinct resolutions rather than
        // passing vacuously on an env override that never applied.
        expect(new Set(resolved).size).toBe(Object.keys(EQUIVALENT_SPELLINGS).length)
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
