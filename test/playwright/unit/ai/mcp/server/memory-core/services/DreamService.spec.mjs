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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import path           from 'path'
import os             from 'os';

test.describe('Neo.ai.mcp.server.memory-core.services.DreamService', () => {
    let GraphService;
    let SystemLifecycleService;
    let DreamService;
    let OpenAiCompatible;
    const testDbName = `memory-core-dream-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath; // Reassigned in beforeAll

    let originalGenerate;
    let originalAppendFile;
    let appendedContent = [];
    let providerPrompt = '';

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        aiConfig.engines.neo.dataDir  = tmpDir;
        aiConfig.engines.neo.filename = testDbName;
        aiConfig.autoIngestFileSystem = false; // Prevent differential sync during DreamService tests
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff.md');

        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        DreamService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/DreamService.mjs')).default;
        OpenAiCompatible       = (await import('../../../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

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

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }

        // Monkey patch OpenAiCompatible
        originalGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async function(prompt) {
            providerPrompt = prompt;
            return {
                content: JSON.stringify({
                    action: "alert",
                    message: "- **[Codebase Gap]** Node `ButtonFeature`: Mock Gap detected."
                })
            };
        };

        // Monkey patch fs.writeFileSync
        originalAppendFile = fs.writeFileSync;
        fs.writeFileSync = function(filePath, data, options) {
            if (filePath.endsWith('mock_sandman_handoff.md')) {
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

    test.afterAll(async () => {
        if (GraphService?.db) {
            if (GraphService.db.storage?.db) {
                try { GraphService.db.storage.db.close(); } catch (e) {}
            }
            GraphService.db           = null;
            GraphService._initPromise = null;
        }

        if (SystemLifecycleService) {
            SystemLifecycleService._initPromise = null;
        }

        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-wal`)) try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-shm`)) try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
        }
        
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        const mockHandoff = path.join(tmpDir, 'mock_sandman_handoff.md');
        if (fs.existsSync(mockHandoff)) {
            try { fs.unlinkSync(mockHandoff); } catch (e) {}
        }

        // Restore patches
        if (originalGenerate)   OpenAiCompatible.prototype.generate = originalGenerate;
        if (originalAppendFile) fs.writeFileSync = originalAppendFile;
    });

    test('should extract Graph nodes and flag capability gaps without mutating physical files', async () => {
        // 1. Manually populate SQLite graph with mocked FileSystem state
        GraphService.upsertNode({
            id         : 'mock-file-1',
            type       : 'FILE',
            name       : 'Button.mjs',
            description: 'Mock button class',
            properties : {path: 'src/button/Button.mjs'}
        });

        // 2. Prepare mock extracted payload showing a new abstract feature
        const payload = {
            session_artifact: {
                graph: {
                    nodes: [{
                        id           : 'node-feature-1',
                        type         : 'CONCEPT',
                        name         : 'ButtonFeature',
                        description  : 'A newly formulated architectural concept.',
                        confidence   : 0.9,
                        logical_layer: 'UI Components',
                        stability    : 'EXPERIMENTAL',
                        tags         : ['Frontend', 'button']
                    }],
                    edges: [{
                        source       : 'node-feature-1',
                        target       : 'node-issue-1',
                        relationship : 'CAUSES_ISSUE',
                        justification: 'The button feature lacks mobile responsiveness resolving strategies.'
                    }]
                }
            }
        };

        const session = {
            meta: {sessionId: 'playwright-test-session'}
        };

        // 3. Trigger REM sleep cycle
        await DreamService.executeCapabilityGapInference(session, payload);

        // 4. Validate Provider was hit with the accurate filesystem Native Graph output
        expect(providerPrompt.length).toBeGreaterThan(1);
        expect(providerPrompt[1].content).toContain('ButtonFeature');
        expect(providerPrompt[1].content).toContain('src/button/Button.mjs');
        expect(providerPrompt[1].content).toContain('CAUSES_ISSUE');
        expect(providerPrompt[1].content).toContain('The button feature lacks mobile');

        // 5. Validate the Sandman interaction logic gracefully appended to the MD file (via proxy)
        console.log("APPENDED ARRAY:", appendedContent); expect(appendedContent.length).toBeGreaterThan(0);
        expect(appendedContent[0].filePath.endsWith('mock_sandman_handoff.md')).toBe(true);
        expect(appendedContent[0].data).toContain('- **[Codebase Gap]** Node `ButtonFeature`: Mock Gap detected.');
    });
});
