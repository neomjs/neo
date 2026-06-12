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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import crypto         from 'crypto';
import fs             from 'fs';
import path           from 'path';

test.describe('Neo.ai.services.knowledge-base.KBRecorderService', () => {
    const testDbName = `kb-recorder-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;
    let KBRecorderService;

    test.beforeAll(async () => {
        const config = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }

        testDbPath = path.join(tmpDir, testDbName);
        config.data.memoryCoreDbPath = testDbPath;

        if (fs.existsSync(testDbPath)) {
            try {fs.unlinkSync(testDbPath);}          catch (e) {}
            try {fs.unlinkSync(`${testDbPath}-wal`);} catch (e) {}
            try {fs.unlinkSync(`${testDbPath}-shm`);} catch (e) {}
        }

        KBRecorderService = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;
        await KBRecorderService.initAsync();
    });

    test.beforeEach(() => {
        KBRecorderService.db.exec('DELETE FROM kb_query_log; DELETE FROM kb_query_faqs;');
    });

    test.afterAll(() => {
        if (KBRecorderService?.db) {
            try {KBRecorderService.db.close();} catch (e) {}
            KBRecorderService.db = null;
        }

        try {fs.unlinkSync(testDbPath);}          catch (e) {}
        try {fs.unlinkSync(`${testDbPath}-wal`);} catch (e) {}
        try {fs.unlinkSync(`${testDbPath}-shm`);} catch (e) {}
    });

    test('initializes the Knowledge Base telemetry schema', () => {
        const tables = KBRecorderService.db.prepare(`
            SELECT name
              FROM sqlite_master
             WHERE type = 'table'
               AND name IN ('kb_query_log', 'kb_query_faqs')
        `).all();

        expect(tables.map(row => row.name).sort()).toEqual(['kb_query_faqs', 'kb_query_log']);
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
