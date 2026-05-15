import {setup} from '../../../../setup.mjs';
setup({neoConfig: {unitTestMode: true}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import fs from 'fs-extra';
import path from 'path';

test.describe('Neo.ai.services.knowledge-base.DatabaseService sync', () => {
    let DatabaseService;
    let aiConfig;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        DatabaseService = (await import('../../../../../../ai/services.mjs')).KB_DatabaseService;
    });

    test('createKnowledgeBase() emits type: adr chunks', async () => {
        const originalDataPath = aiConfig.dataPath;
        const testDataPath = path.join(aiConfig.neoRootDir, 'dist', 'test-ai-knowledge-base.jsonl');

        try {
            aiConfig.dataPath = testDataPath;

            // Generate the knowledge base
            const result = await DatabaseService.createKnowledgeBase();
            expect(result.message).toMatch(/created with \d+ chunks/);

            // Read the output
            expect(fs.existsSync(testDataPath)).toBe(true);
            const content = await fs.readFile(testDataPath, 'utf8');

            // Assert that ADR chunks were emitted
            const lines = content.trim().split('\n');
            const adrChunks = lines.filter(line => {
                if (!line) return false;
                const chunk = JSON.parse(line);
                return chunk.type === 'adr';
            });

            expect(adrChunks.length).toBeGreaterThan(0);
        } finally {
            aiConfig.dataPath = originalDataPath;
            if (fs.existsSync(testDataPath)) {
                await fs.unlink(testDataPath);
            }
        }
    });
});
