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
import RequestContextService, {SHARED_USER_ID, normalizeUserId}  from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

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

test.describe('Module-scope exports: SHARED_USER_ID + normalizeUserId (#10556)', () => {
    test('SHARED_USER_ID is the string `shared`', () => {
        // The sentinel value the migration runner tags legacy records with, and the read-side
        // $or filter grants additive access to. Both substrate components MUST use the same
        // string literal — empirical assertion catches accidental drift between the
        // RequestContextService export and the standalone migration script's hardcoded copy
        // (which intentionally avoids importing this module to skip Neo class-system bootstrap).
        expect(SHARED_USER_ID).toBe('shared');
    });

    test('normalizeUserId strips `@`-prefix at the AgentIdentity ↔ userId boundary', () => {
        // AgentIdentity nodeId form is `@neo-opus-4-7`; ChromaDB metadata userId form is
        // `neo-opus-4-7`. The boundary helper canonicalizes both to the no-prefix form
        // so read filters never self-filter.
        expect(normalizeUserId('@neo-opus-4-7')).toBe('neo-opus-4-7');
        expect(normalizeUserId('@alice')).toBe('alice');
        expect(normalizeUserId('@')).toBe('');
    });

    test('normalizeUserId is idempotent — calling on an already-normalized value is a no-op', () => {
        // Critical for the canonical-form invariant: any code path that calls normalizeUserId
        // twice (boundary → service → cache, etc.) must not double-strip into something invalid.
        expect(normalizeUserId('alice')).toBe('alice');
        expect(normalizeUserId('neo-opus-4-7')).toBe('neo-opus-4-7');
        expect(normalizeUserId(normalizeUserId('@alice'))).toBe('alice');
    });

    test('normalizeUserId returns undefined for null/undefined inputs', () => {
        // Null-safe boundary: services pass `RequestContextService.getUserId()` directly,
        // which returns undefined when no context is active. The helper preserves the
        // single-tenant fallthrough signal rather than coercing to empty-string.
        expect(normalizeUserId(undefined)).toBeUndefined();
        expect(normalizeUserId(null)).toBeUndefined();
    });

    test('normalizeUserId preserves empty-string distinct from null', () => {
        // Edge case: an empty-string userId is semantically distinct from "no userId set"
        // (which is undefined). The helper preserves the distinction — services downstream
        // can still treat empty-string as a sentinel if needed.
        expect(normalizeUserId('')).toBe('');
    });

    test('normalizeUserId coerces non-string inputs to strings before processing', () => {
        // Defensive: if a caller accidentally passes a number or boolean (e.g., a metadata
        // field that's been parsed loose), the helper coerces rather than throwing.
        expect(normalizeUserId(42)).toBe('42');
        expect(normalizeUserId(true)).toBe('true');
    });

    test('canonical-form invariant — both prefix forms collapse to the same value', () => {
        // The load-bearing assertion for #10556: any code path that ever produces both forms
        // must converge on a single canonical comparison value at boundary time. Without this
        // invariant, a write tagging `userId: 'x'` would be invisible to a read filtering
        // `userId: '@x'` — the silent-self-filter trap.
        expect(normalizeUserId('@x')).toBe(normalizeUserId('x'));
        expect(normalizeUserId('@neo-opus-4-7')).toBe(normalizeUserId('neo-opus-4-7'));
    });
});
