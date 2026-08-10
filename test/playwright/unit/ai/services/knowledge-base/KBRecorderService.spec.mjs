import {setup} from '../../../../setup.mjs';

const appName = 'KBRecorderServiceTest';

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

import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../src/core/_export.mjs';
import crypto                          from 'crypto';
import {inspectProviderActivityStatus} from '../../../../../../ai/services/shared/providerActivityStatusStore.mjs';

test.describe('Neo.ai.services.knowledge-base.KBRecorderService', () => {
    let KBRecorderService;

    test.beforeAll(async () => {
        KBRecorderService = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;
        await KBRecorderService.initAsync();
    });

    test.beforeEach(() => {
        KBRecorderService.db.exec('DELETE FROM kb_query_log; DELETE FROM kb_query_faqs; DELETE FROM provider_activity_log; DELETE FROM embedding_identity_log;');
    });

    test.afterAll(() => {
        if (KBRecorderService?.db) {
            try {KBRecorderService.db.close();} catch (e) {}
            KBRecorderService.db = null;
        }

    });

    test('initializes the Knowledge Base telemetry schema', () => {
        const tables = KBRecorderService.db.prepare(`
            SELECT name
              FROM sqlite_master
             WHERE type = 'table'
               AND name IN ('embedding_identity_log', 'kb_query_log', 'kb_query_faqs', 'provider_activity_log')
        `).all();

        expect(tables.map(row => row.name).sort()).toEqual([
            'embedding_identity_log',
            'kb_query_faqs',
            'kb_query_log',
            'provider_activity_log'
        ]);
        expect(KBRecorderService.db.pragma('busy_timeout', {simple: true})).toBe(50);
    });

    test('writes batch identities with recorder-owned Knowledge Base attribution', () => {
        KBRecorderService.recordEmbeddingSubmissions({
            submittedAt: 1234,
            texts      : ['alpha', 'beta']
        });

        const rows = KBRecorderService.db.prepare(`
            SELECT source, submitted_at, fingerprint
              FROM embedding_identity_log
             ORDER BY fingerprint
        `).all();

        expect(rows).toHaveLength(2);
        expect(rows.every(row => row.source === 'knowledge-base')).toBe(true);
        expect(rows.every(row => row.submitted_at === 1234)).toBe(true);
        expect(JSON.stringify(rows)).not.toContain('alpha');
        expect(JSON.stringify(rows)).not.toContain('beta');
    });

    test('writes bounded Knowledge Base provider activity into the shared ledger shape', () => {
        const id = KBRecorderService.beginProviderActivity({
            activityId      : 'kb-provider-activity',
            service         : 'knowledge-base',
            operationStage  : 'kb-query-embedding',
            role            : 'embedding',
            provider        : 'ollama',
            model           : 'qwen3-embedding',
            priority        : 'interactive',
            enqueuedAt      : 100,
            queueDisposition: 'not-applicable',
            prompt          : 'must-not-persist'
        });

        KBRecorderService.startProviderActivity(id, 100);
        KBRecorderService.completeProviderActivity(id, {completedAt: 125, success: true});

        const row = KBRecorderService.db.prepare(`
            SELECT *
              FROM provider_activity_log
             WHERE activity_id = ?
        `).get(id);

        expect(row).toMatchObject({
            service          : 'knowledge-base',
            operation_stage  : 'kb-query-embedding',
            role             : 'embedding',
            provider         : 'ollama',
            queue_disposition: 'not-applicable',
            queue_wait_ms    : null,
            execution_ms     : 25,
            success          : 1
        });
        expect(JSON.stringify(row)).not.toContain('must-not-persist');
    });

    test('keeps provider work live and discloses a locked ledger as partial', async () => {
        const
            Database = (await import('better-sqlite3')).default,
            dbPath   = KBRecorderService.db.prepare('PRAGMA database_list').all()
                .find(row => row.name === 'main').file,
            lockDb = new Database(dbPath, {timeout: 50}),
            sinceTs = Date.now();

        try {
            lockDb.exec('BEGIN IMMEDIATE;');

            const startedAt = Date.now();
            const id        = KBRecorderService.beginProviderActivity({
                service         : 'knowledge-base',
                operationStage  : 'kb-query-embedding',
                role            : 'embedding',
                provider        : 'ollama',
                model           : 'qwen3-embedding',
                priority        : 'interactive',
                enqueuedAt      : startedAt,
                queueDisposition: 'not-applicable'
            });

            expect(id).toBeNull();
            expect(Date.now() - startedAt).toBeLessThan(250);
            await KBRecorderService.flushProviderActivityStatus();

            expect(KBRecorderService.db.prepare('SELECT COUNT(*) AS count FROM provider_activity_log').get().count).toBe(0);
            expect(inspectProviderActivityStatus({
                dbPath,
                sinceTs,
                requiredRecorders: ['knowledge-base']
            })).toEqual({status: 'partial'});
        } finally {
            try { lockDb.exec('ROLLBACK;'); } catch (e) {}
            lockDb.close();
        }

        const id = KBRecorderService.beginProviderActivity({
            service         : 'knowledge-base',
            operationStage  : 'kb-query-embedding',
            role            : 'embedding',
            provider        : 'ollama',
            model           : 'qwen3-embedding',
            priority        : 'interactive',
            enqueuedAt      : Date.now(),
            queueDisposition: 'not-applicable'
        });

        KBRecorderService.startProviderActivity(id, Date.now());
        KBRecorderService.completeProviderActivity(id, {completedAt: Date.now(), success: true});
        await KBRecorderService.flushProviderActivityStatus();

        expect(id).toBeTruthy();
        expect(inspectProviderActivityStatus({
            dbPath,
            sinceTs,
            requiredRecorders: ['knowledge-base']
        })).toEqual({status: 'partial'});
    });

    test('captures KB MCP tool calls through the per-server wrapper', async () => {
        const {callTool} = await import('../../../../../../ai/mcp/server/knowledge-base/toolService.mjs');

        await callTool('list_agent_faqs', {limit: 5});

        const row = KBRecorderService.db.prepare(`
            SELECT tool, success, duration_ms
              FROM kb_query_log
             WHERE tool = 'list_agent_faqs'
        `).get();

        expect(row.tool).toBe('list_agent_faqs');
        expect(row.success).toBe(1);
        expect(row.duration_ms).toBeGreaterThanOrEqual(0);
    });

    test('deduplicates repeated KB questions into Agent FAQ clusters', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: kb_query_log singleton-data pollution (#10936)');
        const
            originalResolve  = KBRecorderService.resolveRelatedConceptIds,
            originalCoverage = KBRecorderService.hasStrongGuideCoverage;

        KBRecorderService.resolveRelatedConceptIds = () => ['concept-reactive-config'];
        KBRecorderService.hasStrongGuideCoverage   = () => false;

        try {
            for (const query of [
                'How does reactive config work?',
                'how does reactive config work',
                'How does reactive   config work!'
            ]) {
                KBRecorderService.log({
                    agent_id   : 'neo-gpt',
                    sequence_id: crypto.randomUUID?.() || `seq-${Date.now()}`,
                    timestamp  : Date.now(),
                    tool       : 'ask_knowledge_base',
                    args       : {query},
                    result     : {answer: 'stub'},
                    success    : true,
                    duration_ms: 1
                });
            }

            const built = await KBRecorderService.buildAgentFaqs({minCount: 2});
            expect(built.count).toBe(1);
            expect(built.faqs[0].count).toBe(3);
            expect(built.faqs[0].relatedConceptIds).toEqual(['concept-reactive-config']);
            expect(built.faqs[0].hasStrongGuideCoverage).toBe(false);

            const listed = await KBRecorderService.listAgentFaqs({minCount: 2});
            console.log('LISTED:', listed);
            expect(listed.faqs[0].canonicalQuery).toContain('reactive');
        } finally {
            KBRecorderService.resolveRelatedConceptIds = originalResolve;
            KBRecorderService.hasStrongGuideCoverage   = originalCoverage;
        }
    });
});
