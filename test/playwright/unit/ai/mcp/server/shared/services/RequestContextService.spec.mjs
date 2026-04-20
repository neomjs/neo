import { setup } from '../../../../../../setup.mjs';

const appName = 'RequestContextServiceTest';

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

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../../src/core/_export.mjs';
import RequestContextService  from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Neo.ai.mcp.server.shared.services.RequestContextService (#10000)', () => {
    test('get/getUserId/getUsername return undefined when no context is active', () => {
        // stdio-mode posture: no middleware ever called run(), so no context has been established.
        // This is the safety case that keeps single-tenant local-agent workflows working unchanged.
        expect(RequestContextService.get()).toBeUndefined();
        expect(RequestContextService.getUserId()).toBeUndefined();
        expect(RequestContextService.getUsername()).toBeUndefined();
    });

    test('run() exposes context to synchronous accessors inside the callback', () => {
        const context = {userId: 'u-alice', username: 'alice@example.com'};

        const inside = RequestContextService.run(context, () => ({
            ctx     : RequestContextService.get(),
            userId  : RequestContextService.getUserId(),
            username: RequestContextService.getUsername()
        }));

        expect(inside.ctx).toEqual(context);
        expect(inside.userId).toBe('u-alice');
        expect(inside.username).toBe('alice@example.com');
    });

    test('context does not leak outside run() — accessors return undefined after the callback', () => {
        RequestContextService.run({userId: 'u-alice'}, () => {
            expect(RequestContextService.getUserId()).toBe('u-alice');
        });

        // After run() returns, the AsyncLocalStorage store is popped.
        expect(RequestContextService.getUserId()).toBeUndefined();
    });

    test('context survives async boundaries (await) inside the callback', async () => {
        const result = await RequestContextService.run({userId: 'u-async'}, async () => {
            // The classic AsyncLocalStorage guarantee — the store flows through await.
            await new Promise(resolve => setImmediate(resolve));
            return RequestContextService.getUserId();
        });

        expect(result).toBe('u-async');
    });

    test('nested run() calls establish a scoped inner context that unwinds cleanly', () => {
        const observations = [];

        RequestContextService.run({userId: 'u-outer'}, () => {
            observations.push(RequestContextService.getUserId());

            RequestContextService.run({userId: 'u-inner'}, () => {
                observations.push(RequestContextService.getUserId());
            });

            observations.push(RequestContextService.getUserId());
        });

        expect(observations).toEqual(['u-outer', 'u-inner', 'u-outer']);
    });

    test('concurrent run() calls remain isolated — each callback sees only its own context', async () => {
        // Each concurrent request that enters the /mcp handler gets its own RequestContextService.run()
        // wrapper. AsyncLocalStorage guarantees they do not cross-contaminate. This test models that
        // by launching two simultaneous async flows with distinct contexts and verifying they never
        // observe each other's userId even when they interleave on the event loop.
        const [resultA, resultB] = await Promise.all([
            RequestContextService.run({userId: 'u-alpha'}, async () => {
                await new Promise(resolve => setImmediate(resolve));
                return RequestContextService.getUserId();
            }),
            RequestContextService.run({userId: 'u-beta'}, async () => {
                await new Promise(resolve => setImmediate(resolve));
                return RequestContextService.getUserId();
            })
        ]);

        expect(resultA).toBe('u-alpha');
        expect(resultB).toBe('u-beta');
    });
});
