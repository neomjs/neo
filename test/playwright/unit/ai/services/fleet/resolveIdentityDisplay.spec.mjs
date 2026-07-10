import {setup} from '../../../../setup.mjs';

const appName = 'ResolveIdentityDisplayTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../src/core/_export.mjs';
import {IDENTITIES}             from '../../../../../../ai/graph/identityRoots.mjs';
import {resolveIdentityDisplay} from '../../../../../../ai/services/fleet/resolveIdentityDisplay.mjs';

/**
 * The ONE fleet↔identity join seam: fleet-registry agents (GitHub usernames, unprefixed) resolve
 * onto their identity-root display facts. Assertions compare against the LIVE roots rather than
 * pinning designation literals, so a model-rotation PR (the `identityRoots.spec` pins those) never
 * breaks this seam's contract.
 */
test.describe('ai/services/fleet/resolveIdentityDisplay — the fleet↔identity display join', () => {
    const agentNodes = IDENTITIES.filter(node => node.type === 'AgentIdentity' && node.properties?.accountType === 'agent');

    test('resolves every named maintainer to its root family — unprefixed and @-prefixed inputs alike', () => {
        agentNodes.forEach(node => {
            const login    = node.id.replace(/^@/, ''),
                  expected = {
                      family   : node.properties.family ?? null,
                      engineTag: null
                  };

            expect(resolveIdentityDisplay(login)).toEqual(expected);
            expect(resolveIdentityDisplay(node.id)).toEqual(expected)
        })
    });

    test('family is real for the full roster; engineTag is ALWAYS null — no truthful flat current-engine source exists', () => {
        agentNodes.forEach(node => {
            const {family, engineTag} = resolveIdentityDisplay(node.id);

            expect(typeof family).toBe('string');
            expect(family.length).toBeGreaterThan(0);
            // engine is session/era metadata: a flat identity literal would publish baseline facts
            // as current and go stale on any unmanaged engine boost — null is the honest value
            // until the era layer (or a managed modelAssignment projection) supplies truth
            expect(engineTag).toBeNull()
        })
    });

    test('an agent without an identity root resolves to null facts — unclassified/tagless, never guessed', () => {
        expect(resolveIdentityDisplay('freshly-defined-fleet-agent')).toEqual({family: null, engineTag: null})
    });

    test('non-string / absent input degrades to null facts, never throws', () => {
        expect(resolveIdentityDisplay(null)).toEqual({family: null, engineTag: null});
        expect(resolveIdentityDisplay(undefined)).toEqual({family: null, engineTag: null});
        expect(resolveIdentityDisplay(42)).toEqual({family: null, engineTag: null})
    });
});
