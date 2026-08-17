import {test, expect}               from '@playwright/test';
import {redeemFleetBearerHandshake} from '../../../../../../apps/agentos/fleet/redeemFleetBearerHandshake.mjs';

// The browser half of the one-command bearer hand-off, witnessed pure: a stub fetchImpl replaces
// the network, so every claim below is about THIS module's contract — the derived handshake URL,
// the no-store request shape, and the fail-closed null on every non-success path. The server half
// (arming, exact-Origin admission, the redemption response itself) is witnessed in
// `test/playwright/unit/ai/services/fleet/fleetBridgeServer.spec.mjs`; the composed launcher
// hand-down in `test/playwright/unit/ai/scripts/fleet/devCockpit.spec.mjs`.
test.describe('redeemFleetBearerHandshake — the page half of the one-command hand-off', () => {
    const validToken = 'A'.repeat(43),
          okEnvelope = token => ({
              ok  : true,
              json: async () => ({ok: true, result: {bearerToken: token}})
          });

    test('derives <fleet-origin>/fleet/handshake from the fleet URL and requests it no-store', async () => {
        const calls = [];

        const result = await redeemFleetBearerHandshake({
            url      : 'http://127.0.0.1:8083/fleet',
            fetchImpl: async (url, options) => {
                calls.push({url, options});
                return okEnvelope(validToken)
            }
        });

        expect(result).toEqual({bearerToken: validToken, mcAuthorization: null});
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://127.0.0.1:8083/fleet/handshake');
        expect(calls[0].options.cache).toBe('no-store');
        expect(calls[0].options.signal).toBeInstanceOf(AbortSignal)
    });

    test('the fleet URL is the ONE endpoint authority: path and query never leak into the handshake URL', async () => {
        let requested;

        await redeemFleetBearerHandshake({
            url      : 'http://localhost:8083/fleet?whatever=1',
            fetchImpl: async url => {
                requested = url;
                return okEnvelope(validToken)
            }
        });

        expect(requested).toBe('http://localhost:8083/fleet/handshake')
    });

    test('non-success responses resolve null: refusal status, ok:false envelope, malformed token, non-JSON body', async () => {
        const cases = [
            ['refused status',   async () => ({ok: false, json: async () => ({ok: false, error: 'fleet: handshake requires an allowlisted browser origin'})})],
            ['ok:false envelope', async () => ({ok: true, json: async () => ({ok: false, error: 'nope'})})],
            ['missing result',   async () => ({ok: true, json: async () => ({ok: true})})],
            ['short token',      async () => okEnvelope('too-short')],
            ['padded token',     async () => okEnvelope(`${'A'.repeat(43)}=`)],
            ['non-string token', async () => okEnvelope(42)],
            ['non-JSON body',    async () => ({ok: true, json: async () => { throw new SyntaxError('not json') }})]
        ];

        for (const [label, fetchImpl] of cases) {
            expect(await redeemFleetBearerHandshake({url: 'http://127.0.0.1:8083/fleet', fetchImpl}), label).toBeNull()
        }
    });

    test('the viewer mint rides the pair when armed — and a malformed or bearer-identical mint is STRIPPED, never adopted', async () => {
        const withMint = mint => async () => ({
            ok  : true,
            json: async () => ({ok: true, result: {bearerToken: validToken, mcAuthorization: mint}})
        });

        // armed: the pair travels together
        expect(await redeemFleetBearerHandshake({url: 'http://127.0.0.1:8083/fleet', fetchImpl: withMint('viewer-mc-mint')}))
            .toEqual({bearerToken: validToken, mcAuthorization: 'viewer-mc-mint'});

        // stripped shapes: the class-1 redemption stays valid, the boot proceeds honestly not-armed
        for (const [label, mint] of [
            ['bearer-identical mint (never-aliased)', validToken],
            ['empty mint', '   '],
            ['non-string mint', 42]
        ]) {
            expect(await redeemFleetBearerHandshake({url: 'http://127.0.0.1:8083/fleet', fetchImpl: withMint(mint)}), label)
                .toEqual({bearerToken: validToken, mcAuthorization: null})
        }
    });

    test('a refused connection (no transport listening) resolves null instead of throwing', async () => {
        const token = await redeemFleetBearerHandshake({
            url      : 'http://127.0.0.1:8083/fleet',
            fetchImpl: async () => { throw new TypeError('fetch failed') }
        });

        expect(token).toBeNull()
    });

    test('a hung listener resolves null within the redemption patience via the abort signal', async () => {
        const token = await redeemFleetBearerHandshake({
            url      : 'http://127.0.0.1:8083/fleet',
            timeoutMs: 25,
            fetchImpl: (url, {signal}) => new Promise((resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason))
            })
        });

        expect(token).toBeNull()
    });

    test('a malformed fleet URL resolves null before any request is issued', async () => {
        let called = false;

        const token = await redeemFleetBearerHandshake({
            url      : 'not a url',
            fetchImpl: async () => {
                called = true;
                return okEnvelope(validToken)
            }
        });

        expect(token).toBeNull();
        expect(called).toBe(false)
    })
});
