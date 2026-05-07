import {setup} from '../../../../../../setup.mjs';

const appName = 'MemoryCorePrimaryFlagGateTest';

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
 * @summary Coverage for the `NEO_MC_PRIMARY` single-writer-enforcement gate (#10813 Piece A).
 *
 * Exercises `queueSummarizationJob` against the truth table of `(autoSummarize × isPrimary)`:
 * the existing SQLite-backed disconnect-lifecycle queue is the integration surface where the
 * gate is most directly observable. The startup-hook gate at `initAsync` is harder to assert
 * post-hoc on a singleton service; that path is covered indirectly via the same conditional
 * logic and via the docstring on `HealthService.recordStartupSummarization` ("skipped-non-primary").
 */
test.describe('SessionService.queueSummarizationJob primary-flag gate (#10813)', () => {
    let SDK, TextEmbeddingService, sqlite, originalAutoSummarize, originalIsPrimary;

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

    test.beforeEach(() => {
        originalAutoSummarize = SDK.Memory_Config.data.autoSummarize;
        originalIsPrimary     = SDK.Memory_Config.data.isPrimary;
    });

    test.afterEach(() => {
        SDK.Memory_Config.data.autoSummarize = originalAutoSummarize;
        SDK.Memory_Config.data.isPrimary     = originalIsPrimary;
    });

    test('writes a pending job when autoSummarize=true AND isPrimary=true', () => {
        SDK.Memory_Config.data.autoSummarize = true;
        SDK.Memory_Config.data.isPrimary     = true;

        const sessionId = `gate-pass-${crypto.randomUUID()}`;
        SDK.Memory_SessionService.queueSummarizationJob(sessionId);

        const job = sqlite.prepare('SELECT session_id, status FROM SummarizationJobs WHERE session_id = ?').get(sessionId);
        expect(job).toBeDefined();
        expect(job.status).toBe('pending');

        sqlite.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
    });

    test('no-ops when autoSummarize=true AND isPrimary=false (single-writer enforcement)', () => {
        SDK.Memory_Config.data.autoSummarize = true;
        SDK.Memory_Config.data.isPrimary     = false;

        const sessionId = `gate-skip-non-primary-${crypto.randomUUID()}`;
        SDK.Memory_SessionService.queueSummarizationJob(sessionId);

        const job = sqlite.prepare('SELECT session_id FROM SummarizationJobs WHERE session_id = ?').get(sessionId);
        expect(job).toBeUndefined();
    });

    test('no-ops when autoSummarize=false regardless of isPrimary', () => {
        SDK.Memory_Config.data.autoSummarize = false;
        SDK.Memory_Config.data.isPrimary     = true;

        const sessionId = `gate-skip-summarize-off-${crypto.randomUUID()}`;
        SDK.Memory_SessionService.queueSummarizationJob(sessionId);

        const job = sqlite.prepare('SELECT session_id FROM SummarizationJobs WHERE session_id = ?').get(sessionId);
        expect(job).toBeUndefined();
    });
});
