import {setup} from '../../../../setup.mjs';

const appName = 'WriteSideInvariantTest';

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

import {test, expect}        from '@playwright/test';
import fs                    from 'fs-extra';
import path                  from 'path';
import Neo                   from '../../../../../../src/Neo.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import {captureAiConfigKeys}  from '../../../../fixtures/aiConfigIsolation.mjs';

/**
 * #10017 write-side invariant regression coverage.
 *
 * The Memory Core's multi-tenant migration strategy (lazy-tag-on-read, per
 * `learn/agentos/tooling/MultiTenantMigrationGuide.md §1`) depends on a write-side
 * invariant: **every write path into the Memory Core MUST require a bound agent
 * identity via `RequestContextService.getAgentIdentityNodeId()` and throw loudly
 * when the context is unbound.** Without this invariant, untagged writes would
 * slip through the write-side discipline, undoing the "legacy rows are the
 * pre-tenant-aware era, new rows are always tagged" semantic the guide codifies.
 *
 * This spec pins the invariant as a regression guard. If a future refactor drops
 * the identity check from any of these write paths, the assertions fail at test
 * time rather than silently shipping unbound writes into production SQLite.
 *
 * Scope:
 *   - `MailboxService.addMessage` — currently enforces the invariant (exemplar
 *     path that pins the pattern; test asserts the enforcement survives refactor).
 *
 * Out of scope (for this ticket):
 *   - Enforcing the invariant in `MemoryService.addMemory` or `SessionService`
 *     write paths if they don't already enforce it today. If those paths are
 *     unguarded, filing the gap as a separate ticket keeps this PR's scope
 *     narrowly on the migration-design anchor rather than silently tightening
 *     write-side discipline under the migration banner.
 *
 * @see learn/agentos/tooling/MultiTenantMigrationGuide.md §1
 * @see ai/services/memory-core/MailboxService.mjs — exemplar enforcement site
 */
test.describe('Neo.ai.services.memory-core.WriteSideInvariant (#10017)', () => {
    let MailboxService, GraphService, LifecycleService;
    let dbPath;
    let restoreAiConfig;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        dbPath = path.join(tmpDir, `neo-writeside-invariant-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        restoreAiConfig = captureAiConfigKeys(aiConfig, ['storagePaths.graph', 'collections']);
        aiConfig.storagePaths.graph = dbPath;
        if (!aiConfig.collections) aiConfig.collections = {};
        aiConfig.collections.memory = `test-memory-${Date.now()}`;
        aiConfig.collections.session = `test-session-${Date.now()}`;

        GraphService     = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService   = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager();
        restoreAiConfig?.();
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
        }
    });

    test('MailboxService.addMessage rejects writes without a bound agent identity', async () => {
        // Exemplar enforcement path. No `RequestContextService.run()` wrap
        // → `getAgentIdentityNodeId()` returns null → write MUST throw.
        await expect(
            MailboxService.addMessage({
                to     : 'AGENT:*',
                subject: 'unbound-write-attempt',
                body   : 'This should fail because no identity is bound.'
            })
        ).rejects.toThrow(/no agent identity context bound/);
    });

    test('MailboxService.addMessage rejects when RequestContextService.run wraps with null identity', async () => {
        // Additional coverage: explicit RequestContextService.run() with a context
        // that lacks `agentIdentityNodeId` must also fail loudly. Guards against a
        // future refactor that accepts the wrap shape but silently degrades on
        // missing identity fields.
        await expect(
            RequestContextService.run({agentIdentityNodeId: null}, () =>
                MailboxService.addMessage({
                    to     : 'AGENT:*',
                    subject: 'null-identity-write-attempt',
                    body   : 'Identity context present but agentIdentityNodeId is null.'
                })
            )
        ).rejects.toThrow(/no agent identity context bound/);
    });

    test('MailboxService.addMessage succeeds with a bound agent identity', async () => {
        // Positive case: proper bind → write succeeds. Anchors the invariant to a
        // working baseline so a future regression that falsely rejects ALL writes
        // (over-tightened guard) is also caught.
        // #11417: also seed `@neo-test-receiver` — `validateMailboxTarget` now rejects
        // unrecognized targets at addMessage-time (instead of letting linkNodes silently
        // cull the SENT_TO edge), so the test must seed both endpoints to exercise the
        // happy path.
        GraphService.upsertNode({id: '@neo-test-writer',   type: 'AgentIdentity',     name: 'TestWriter',   properties: {}});
        GraphService.upsertNode({id: '@neo-test-receiver', type: 'AgentIdentity',     name: 'TestReceiver', properties: {}});
        GraphService.upsertNode({id: 'AGENT:*',            type: 'BroadcastSentinel', name: 'Broadcast',    properties: {}});

        const result = await RequestContextService.run({agentIdentityNodeId: '@neo-test-writer'}, () =>
            MailboxService.addMessage({
                to     : '@neo-test-receiver',
                subject: 'bound-write-succeeds',
                body   : 'Identity is bound; write must succeed.'
            })
        );

        expect(result.status).toBe('sent');
        expect(result.messageId).toMatch(/^MESSAGE:/);
    });
});
