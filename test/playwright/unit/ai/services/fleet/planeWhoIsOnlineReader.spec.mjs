import {expect, test}                 from '@playwright/test';
import {createPlaneWhoIsOnlineReader} from '../../../../../../ai/services/fleet/planeWhoIsOnlineReader.mjs';

test.describe('planeWhoIsOnlineReader — the plane-mode presence read', () => {
    test('the production request shape is the verbose contract — argument-captured, not assumed', async () => {
        // The terse report omits the per-agent rows entirely, so the exact request arguments ARE
        // the contract under test: a reader that "works" against a hand-injected verbose payload
        // while sending the terse request would throw on every healthy production call.
        const
            calls   = [],
            payload = {agents: [{identity: '@neo-fable-clio', state: 'online', reason: null, signals: {}}]},
            reader  = createPlaneWhoIsOnlineReader({
                callTool: (name, args) => {
                    calls.push([name, args]);
                    return Promise.resolve(payload)
                }
            });

        await expect(reader()).resolves.toBe(payload);
        expect(calls).toEqual([['who_is_online', {verbose: true}]])
    });

    test('an answer without a top-level agents array throws — the source converts that into honest unknown', async () => {
        const reader = createPlaneWhoIsOnlineReader({
            callTool: () => Promise.resolve({signalStatus: 'terse shape, no rows'})
        });

        await expect(reader()).rejects.toThrow('plane who_is_online answer unreadable')
    });

    test('a client rejection propagates untouched — degradation policy belongs to the consumer', async () => {
        const reader = createPlaneWhoIsOnlineReader({
            callTool: () => Promise.reject(new Error('plane unreachable'))
        });

        await expect(reader()).rejects.toThrow('plane unreachable')
    })
});
