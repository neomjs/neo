import {expect, test} from '@playwright/test';

import {createSeatArmingReader, normalizeWakeIdentity} from '../../../../../../ai/services/fleet/seatArmingReader.mjs';

const SIGNING_KEY = 'a-very-secret-hmac-key-material-0123456789abcdef';

/**
 * A loader-shaped manifest: two routes for one seat (two subscriptions), one for another, keyed by
 * WAKE_SUB id exactly as the receiver's loader returns it. The signing key rides every route —
 * which is precisely why the projection's omission of it is the load-bearing assertion here.
 */
function manifestFixture() {
    return {
        schemaVersion: 1,
        routes       : {
            'WAKE_SUB:one': {
                signingKey           : SIGNING_KEY,
                agentIdentity        : '@neo-fable-clio',
                harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude', addressType: 'userDataDir', instanceAddress: '/Users/x/.claude-instances/neo-fable-clio'},
                adapterConfig        : {attemptTimeoutMs: 30000}
            },
            'WAKE_SUB:two': {
                signingKey           : SIGNING_KEY,
                agentIdentity        : 'neo-fable-clio',
                harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude', addressType: 'userDataDir', instanceAddress: '/Users/x/.claude-instances/neo-fable-clio'},
                adapterConfig        : {attemptTimeoutMs: 30000}
            },
            'WAKE_SUB:three': {
                signingKey           : SIGNING_KEY,
                agentIdentity        : '@neo-gpt',
                harnessTargetMetadata: {adapter: 'codex-app-server', appName: 'Codex', addressType: 'userDataDir', instanceAddress: '/Users/x/.codex-instances/neo-gpt'},
                adapterConfig        : {attemptTimeoutMs: 30000, codexBinary: '/usr/local/bin/codex'}
            }
        }
    };
}

test.describe('seatArmingReader — armed iff the receiver manifest carries a loader-valid route', () => {
    test('construction refuses a missing manifest path — an unaddressable read cannot exist half-alive', () => {
        expect(() => createSeatArmingReader()).toThrow(TypeError);
        expect(() => createSeatArmingReader({manifestPath: ''})).toThrow(TypeError)
    });

    test('a healthy manifest resolves observed rows: identity-normalized, route-counted, allowlist-projected', async () => {
        const resolve = createSeatArmingReader({
            manifestPath: '/tmp/manifest.json',
            loadManifest: async () => manifestFixture()
        });

        const answer = await resolve();

        expect(answer.state).toBe('observed');
        expect(answer.reason).toBeNull();

        // '@neo-fable-clio' and bare 'neo-fable-clio' are ONE seat with TWO routes — the manifest
        // convention and the fleet's wake-identity convention meet at the normalizer.
        expect([...answer.byIdentity.keys()].sort()).toEqual(['@neo-fable-clio', '@neo-gpt']);
        expect(answer.byIdentity.get('@neo-fable-clio')).toEqual({
            routeCount: 2, adapter: 'osascript', appName: 'Claude', addressType: 'userDataDir'
        });
        expect(answer.byIdentity.get('@neo-gpt')).toEqual({
            routeCount: 1, adapter: 'codex-app-server', appName: 'Codex', addressType: 'userDataDir'
        })
    });

    test('the key-leak negative: no signing key and no instance address survive into the projection', async () => {
        // The manifest carries HMAC key material on every route. The projection is built from an
        // explicit field allowlist — this asserts the OMISSION, so a future refactor that spreads
        // the route object reddens here rather than publishing a secret into the fleet envelope.
        const resolve = createSeatArmingReader({
            manifestPath: '/tmp/manifest.json',
            loadManifest: async () => manifestFixture()
        });

        const answer     = await resolve(),
              serialized = JSON.stringify([...answer.byIdentity.entries()]);

        expect(serialized).not.toContain(SIGNING_KEY);
        expect(serialized).not.toContain('signingKey');
        // The instance address is a host filesystem path — seat-local detail with no business in a
        // fleet-wide diagnostic surface.
        expect(serialized).not.toContain('.claude-instances');

        for (const row of answer.byIdentity.values()) {
            expect(Object.keys(row).sort()).toEqual(['adapter', 'addressType', 'appName', 'routeCount'])
        }
    });

    test('a refusing loader answers UNKNOWN with the refusal — mode violations and absent files are a diagnosis, not rows', async () => {
        const resolve = createSeatArmingReader({
            manifestPath: '/tmp/manifest.json',
            loadManifest: async () => { throw new Error(`Wake receiver manifest '/tmp/manifest.json' must be mode 0600`) }
        });

        const answer = await resolve();

        expect(answer.state).toBe('unknown');
        expect(answer.reason).toContain('mode 0600');
        expect(answer.byIdentity.size).toBe(0)
    });

    test('a route with an unusable identity is skipped without taking the manifest down', async () => {
        const broken = manifestFixture();

        broken.routes['WAKE_SUB:junk'] = {
            signingKey           : SIGNING_KEY,
            agentIdentity        : '   @@@   ',
            harnessTargetMetadata: {adapter: 'tmux'},
            adapterConfig        : {attemptTimeoutMs: 30000}
        };

        const resolve = createSeatArmingReader({
            manifestPath: '/tmp/manifest.json',
            loadManifest: async () => broken
        });

        const answer = await resolve();

        expect(answer.state).toBe('observed');
        expect(answer.byIdentity.size).toBe(2)
    });

    test('normalizeWakeIdentity: one convention, both directions', () => {
        expect(normalizeWakeIdentity('@neo-opus-ada')).toBe('@neo-opus-ada');
        expect(normalizeWakeIdentity('neo-opus-ada')).toBe('@neo-opus-ada');
        expect(normalizeWakeIdentity('  @neo-opus-ada  ')).toBe('@neo-opus-ada');
        expect(normalizeWakeIdentity('')).toBeNull();
        expect(normalizeWakeIdentity('   ')).toBeNull();
        expect(normalizeWakeIdentity(null)).toBeNull();
        expect(normalizeWakeIdentity('@')).toBeNull()
    });
});
