import {setup} from '../../../../../../setup.mjs';

const appName = 'MemoryCoreSunsetPollerTest';

process.env.NEO_MODEL_PROVIDER          = 'openAiCompatible';
process.env.NEO_OPENAI_COMPATIBLE_MODEL = 'gemma4';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../../src/core/_export.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';
import crypto          from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../../../.env'), quiet: true});

/**
 * @summary Coverage for the Sunset Handover Poller (#10813 Piece B).
 *
 * Verifies that the SessionService directly queries SQLite to detect sunset
 * handover messages and reliably triggers summarization, then marks them as read.
 */
test.describe('SessionService Sunset Protocol Poller (Piece B)', () => {
    let SDK, TextEmbeddingService, sqlite;

    test.beforeAll(async () => {
        const fs = await import('fs');

        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const path = await import("path");
        const tmpDir = path.resolve(process.cwd(), "tmp");
        aiConfig.storagePaths.graph = path.join(tmpDir, "test-graph-" + Date.now() + "-" + Math.random().toString(36).substring(7) + ".db");

        
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }

        aiConfig.collections.memory  = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        SDK                  = await import('../../../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;

        SDK.Memory_Config.data.modelProvider     = 'openAiCompatible';
        SDK.Memory_Config.data.embeddingProvider = 'openAiCompatible';

        TextEmbeddingService.embedText = async () => new Array(4096).fill(Math.random());

        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();
        await SDK.Memory_ChromaManager.ready();

        const GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        await GraphService.ready();
        sqlite = GraphService.db?.storage?.db;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('../util.mjs');
        await cleanupChromaManager(SDK);
    });

    test('detects sunset handovers and triggers summarizeSessions, marking them read', async () => {
        let summarizeCalled = false;

        // Mock summarizeSessions to detect if the poller works
        const originalSummarize = SDK.Memory_SessionService.summarizeSessions;
        SDK.Memory_SessionService.summarizeSessions = async () => {
            summarizeCalled = true;
        };

        const testMessageId = 'MESSAGE:test-sunset-' + crypto.randomUUID();
        const agentId = '@neo-test-agent';

        const nodeData = {
            id: testMessageId,
            type: 'MESSAGE',
            properties: {
                messageId: testMessageId,
                from: agentId,
                to: agentId,
                subject: 'Sunset Protocol Handover',
                sentAt: new Date().toISOString(),
                priority: 'normal',
                status: 'delivered',
                taggedConcepts: ['sunset-protocol-handover'],
                wakeSuppressed: true,
                readAt: null
            }
        };

        const insertStmt = sqlite.prepare(`
            INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)
        `);
        insertStmt.run(testMessageId, null, JSON.stringify(nodeData));

        await SDK.Memory_SessionService.pollForSunsetHandovers();

        expect(summarizeCalled).toBe(true);

        // Assert readAt is set
        const stmt = sqlite.prepare(`
            SELECT id, data FROM Nodes WHERE id = ?
        `);
        const row = stmt.get(testMessageId);
        expect(row).toBeDefined();

        const updatedData = JSON.parse(row.data);
        expect(updatedData.properties.readAt).toBeDefined();
        expect(updatedData.properties.readAt).not.toBeNull();

        // Cleanup
        SDK.Memory_SessionService.summarizeSessions = originalSummarize;
        sqlite.prepare('DELETE FROM Nodes WHERE id = ?').run(testMessageId);
    });
});
