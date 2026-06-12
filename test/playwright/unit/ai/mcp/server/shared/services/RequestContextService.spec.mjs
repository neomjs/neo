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
import RequestContextService, {
    CORE_SWARM_AGENT_IDS,
    CORE_SWARM_USER_IDS,
    SHARED_USER_ID,
    hasCoreSwarmParticipant,
    normalizeUserId,
    resolveSummaryVisibilityUserId
} from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

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

test.describe('Module-scope exports: SHARED_USER_ID + normalizeUserId (#10556, #11181)', () => {
    test('SHARED_USER_ID is the string `shared`', () => {
        // The sentinel value the migration runner tags legacy records with, and the read-side
        // $or filter grants additive access to.
        expect(SHARED_USER_ID).toBe('shared');
    });

    test('SHARED_USER_ID is in sync with the migration runner script\'s hardcoded copy', async () => {
        // The standalone runner at `ai/scripts/migrations/backfillChromaSharedUserId.mjs` intentionally
        // does NOT import this module — it avoids the Neo class-system bootstrap to keep the
        // script dependency-light and fast to invoke. Instead, it hardcodes the same sentinel
        // value with a sync-with-RequestContextService comment. This test enforces the sync
        // invariant: the literal in the script MUST match the exported constant. Without this
        // assertion, the script could silently drift (e.g., someone renames the export but
        // misses the script copy → migrator tags records with the old value while reads filter
        // for the new value, yielding zero observable rows after a successful-looking migration).
        const fs   = await import('fs');
        const path = await import('path');

        // Resolve relative to the spec file's directory; the spec lives 8 levels deep from repo root.
        const repoRoot   = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../../../..');
        const scriptPath = path.join(repoRoot, 'ai/scripts/migrations/backfillChromaSharedUserId.mjs');
        const source     = fs.readFileSync(scriptPath, 'utf-8');

        // Match the `const SHARED_USER_ID = '<value>';` line at module scope.
        const match = source.match(/^const\s+SHARED_USER_ID\s*=\s*['"](.+?)['"]\s*;?\s*$/m);
        expect(match, 'expected `const SHARED_USER_ID = ...` in migration runner script').not.toBeNull();
        expect(match[1]).toBe(SHARED_USER_ID);
    });

    test('CORE_SWARM_USER_IDS is in sync with the migration runner script\'s hardcoded copy', async () => {
        const fs   = await import('fs');
        const path = await import('path');

        const repoRoot   = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../../../..');
        const scriptPath = path.join(repoRoot, 'ai/scripts/migrations/backfillChromaSharedUserId.mjs');
        const source     = fs.readFileSync(scriptPath, 'utf-8');

        const match = source.match(/^const\s+CORE_SWARM_USER_IDS\s*=\s*Object\.freeze\(\s*\[([\s\S]+?)\]\s*\)\s*;?\s*$/m);
        expect(match, 'expected `const CORE_SWARM_USER_IDS = Object.freeze([...])` in migration runner script').not.toBeNull();

        const scriptUserIds = match[1]
            .split(',')
            .map(value => value.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);

        expect(scriptUserIds).toEqual(CORE_SWARM_USER_IDS);
    });

    test('migration runner uses the lightweight Chroma registry instead of suppressing schema warnings', async () => {
        const fs   = await import('fs');
        const path = await import('path');

        const repoRoot   = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../../../..');
        const scriptPath = path.join(repoRoot, 'ai/scripts/migrations/backfillChromaSharedUserId.mjs');
        const source     = fs.readFileSync(scriptPath, 'utf-8');

        expect(source).toContain('createDynamicTextEmbeddingFunction');
        expect(source).toContain('registerNeoChromaEmbeddingFunctions');
        expect(source).not.toContain('console.warn = () => {}');
        expect(source).not.toContain('origWarn');
    });

    test('CORE_SWARM_AGENT_IDS mirrors user ids in AgentIdentity form', () => {
        expect(CORE_SWARM_AGENT_IDS).toEqual(CORE_SWARM_USER_IDS.map(userId => `@${userId}`));
    });

    test('normalizeUserId strips `@`-prefix at the AgentIdentity ↔ userId boundary', () => {
        // AgentIdentity nodeId form is `@neo-opus-ada`; ChromaDB metadata userId form is
        // `neo-opus-ada`. The boundary helper canonicalizes both to the no-prefix form
        // so read filters never self-filter.
        expect(normalizeUserId('@neo-opus-ada')).toBe('neo-opus-ada');
        expect(normalizeUserId('@alice')).toBe('alice');
        expect(normalizeUserId('@')).toBe('');
    });

    test('normalizeUserId is idempotent — calling on an already-normalized value is a no-op', () => {
        // Critical for the canonical-form invariant: any code path that calls normalizeUserId
        // twice (boundary → service → cache, etc.) must not double-strip into something invalid.
        expect(normalizeUserId('alice')).toBe('alice');
        expect(normalizeUserId('neo-opus-ada')).toBe('neo-opus-ada');
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
        // The load-bearing assertion: any code path that ever produces both forms
        // must converge on a single canonical comparison value at boundary time. Without this
        // invariant, a write tagging `userId: 'x'` would be invisible to a read filtering
        // `userId: '@x'` — the silent-self-filter trap.
        expect(normalizeUserId('@x')).toBe(normalizeUserId('x'));
        expect(normalizeUserId('@neo-opus-ada')).toBe(normalizeUserId('neo-opus-ada'));
    });

    test('hasCoreSwarmParticipant detects comma-separated and array-form agent lists', () => {
        expect(hasCoreSwarmParticipant('@neo-gpt')).toBe(true);
        expect(hasCoreSwarmParticipant('@alice, @neo-opus-ada')).toBe(true);
        expect(hasCoreSwarmParticipant('@neo-claude-opus')).toBe(true);
        expect(hasCoreSwarmParticipant('@neo-opus-vega')).toBe(true);
        expect(hasCoreSwarmParticipant(['neo-gemini-pro', '@alice'])).toBe(true);
        expect(hasCoreSwarmParticipant('@alice,@bob')).toBe(false);
        expect(hasCoreSwarmParticipant(undefined)).toBe(false);
    });

    test('resolveSummaryVisibilityUserId promotes core-swarm summaries to shared', () => {
        expect(resolveSummaryVisibilityUserId({
            userId: 'neo-gemini-pro',
            participatingAgents: '@neo-gpt'
        })).toBe(SHARED_USER_ID);

        expect(resolveSummaryVisibilityUserId({
            userId: undefined,
            participatingAgents: '@neo-opus-ada'
        })).toBe(SHARED_USER_ID);

        expect(resolveSummaryVisibilityUserId({
            userId: 'neo-opus-vega',
            participatingAgents: '@neo-opus-vega'
        })).toBe(SHARED_USER_ID);

        expect(resolveSummaryVisibilityUserId({
            userId: '@alice',
            participatingAgents: '@alice'
        })).toBe('alice');

        expect(resolveSummaryVisibilityUserId({
            userId: undefined,
            participatingAgents: ''
        })).toBeUndefined();
    });
});
