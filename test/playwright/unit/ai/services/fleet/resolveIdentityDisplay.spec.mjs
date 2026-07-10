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

    test('resolves every named maintainer to its root facts — unprefixed and @-prefixed inputs alike', () => {
        agentNodes.forEach(node => {
            const login    = node.id.replace(/^@/, ''),
                  expected = {
                      family   : node.properties.family ?? null,
                      engineTag: node.properties.modelDesignation ?? null
                  };

            expect(resolveIdentityDisplay(login)).toEqual(expected);
            expect(resolveIdentityDisplay(node.id)).toEqual(expected)
        })
    });

    test('display facts are real for the full roster — family + engineTag never resolve empty for a named maintainer', () => {
        agentNodes.forEach(node => {
            const {family, engineTag} = resolveIdentityDisplay(node.id);

            expect(typeof family).toBe('string');
            expect(family.length).toBeGreaterThan(0);
            expect(typeof engineTag).toBe('string');
            expect(engineTag.length).toBeGreaterThan(0)
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
