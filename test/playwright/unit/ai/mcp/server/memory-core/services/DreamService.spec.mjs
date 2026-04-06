import {setup} from '../../../../../../setup.mjs';

const appName = 'DreamServiceTest';

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

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../../../src/Neo.mjs';
import fs                   from 'fs';
import path                 from 'path';
import os                   from 'os';

test.describe('Neo.ai.mcp.server.memory-core.services.DreamService', () => {
    let GraphService;
    let DreamService;
    let Ollama;
    const testDbName = `memory-core-dream-test-${process.pid}-${Date.now()}.sqlite`;
    const testDbPath = path.join(os.tmpdir(), testDbName);

    let originalGenerate;
    let originalAppendFile;
    let appendedContent = [];
    let providerPrompt = '';

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.engines.neo.dataDir  = os.tmpdir();
        aiConfig.engines.neo.filename = testDbName;
        aiConfig.autoIngestFileSystem = false; // Prevent differential sync during DreamService tests

        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        DreamService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/DreamService.mjs')).default;
        Ollama       = (await import('../../../../../../../../ai/provider/Ollama.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();
        }

        await GraphService.initAsync();

        // Monkey patch Ollama
        originalGenerate = Ollama.prototype.generate;
        Ollama.prototype.generate = async function(prompt) {
            providerPrompt = prompt;
            return {
                content: JSON.stringify({
                    action: "alert",
                    message: "- **[Codebase Gap]** Node `TestFeature`: Mock Gap detected."
                })
            };
        };

        // Monkey patch fs.writeFileSync
        originalAppendFile = fs.writeFileSync;
        fs.writeFileSync = function(filePath, data, options) {
            if (filePath.endsWith('sandman_handoff.md')) {
                appendedContent.push({ filePath, data });
            } else {
                return originalAppendFile(filePath, data, options);
            }
        };
    });

    test.beforeEach(async () => {
        appendedContent = [];
        providerPrompt  = [];

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterAll(() => {
        if (GraphService?.db) {
            if (GraphService.db.storage && GraphService.db.storage.db) {
                try { GraphService.db.storage.db.close(); } catch (e) {};
            }
            GraphService.db           = null;
            GraphService._initPromise = null;
        }

        // Restore patches
        if (originalGenerate) Ollama.prototype.generate = originalGenerate;
        if (originalAppendFile) fs.writeFileSync = originalAppendFile;

        try { fs.unlinkSync(testDbPath); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
    });

    test('should extract Graph nodes and flag capability gaps without mutating physical files', async () => {
        // 1. Manually populate SQLite graph with mocked FileSystem state
        GraphService.upsertNode({
            id: 'mock-file-1',
            type: 'FILE',
            name: 'Button.mjs',
            description: 'Mock button class',
            properties: { path: 'src/button/Button.mjs' }
        });

        // 2. Prepare mock extracted payload showing a new abstract feature
        const payload = {
            graph: {
                nodes: [
                    {
                        id: 'node-feature-1',
                        type: 'FEATURE',
                        name: 'TestFeature',
                        description: 'A newly formulated architectural concept.'
                    }
                ]
            }
        };

        const session = {
            meta: { sessionId: 'playwright-test-session' }
        };

        // 3. Trigger REM sleep cycle
        await DreamService.executeCapabilityGapInference(session, payload);

        // 4. Validate Provider was hit with the accurate filesystem Native Graph output
        expect(providerPrompt.length).toBeGreaterThan(1);
        expect(providerPrompt[1].content).toContain('TestFeature');
        expect(providerPrompt[1].content).toContain('src/button/Button.mjs');

        // 5. Validate the Sandman interaction logic gracefully appended to the MD file (via proxy)
        console.log("APPENDED ARRAY:", appendedContent); expect(appendedContent.length).toBeGreaterThan(0);
        expect(appendedContent[0].filePath.endsWith('sandman_handoff.md')).toBe(true);
        expect(appendedContent[0].data).toContain('- **[Codebase Gap]** Node `TestFeature`: Mock Gap detected.');
    });
});
