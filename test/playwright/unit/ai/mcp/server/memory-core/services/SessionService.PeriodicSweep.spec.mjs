import {setup} from '../../../../../../setup.mjs';

const appName = 'MemoryCorePeriodicSweepTest';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @summary Coverage for the Piece C periodic safety-net summarization sweep (#10813 AC3).
 *
 * Mechanism C catches sessions that closed without either a graceful sunset event
 * (Piece B) OR an SSE-disconnect signal (queueSummarizationJob) — the hard-crash
 * edge case. Verifies:
 *
 * 1. `runPeriodicSummarizationSweep` fires `summarizeSessions({})` when both
 *    `autoSummarize=true` AND `isPrimary=true` are set.
 * 2. It no-ops when `isPrimary=false` (single-writer enforcement).
 * 3. It no-ops when `autoSummarize=false`.
 * 4. HealthService records the sweep outcome via `recordPeriodicSweep`.
 */
test.describe('SessionService Piece C Periodic Sweep (#10813)', () => {
    let SDK, TextEmbeddingService;

    test.beforeAll(async () => {
        const fs = await import('fs');

        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }

        aiConfig.storagePaths.graph = path.join(tmpDir, `test-graph-sweep-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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
    });

    test.afterAll(async () => {
        const {cleanupChromaManager} = await import('../util.mjs');
        await cleanupChromaManager(SDK);
    });

    test('fires summarizeSessions and records sweep when autoSummarize+isPrimary both true', async () => {
        const sessionService = SDK.Memory_SessionService;
        const healthService  = SDK.Memory_HealthService;
        const aiConfig       = SDK.Memory_Config;

        // Snapshot
        const originalAutoSummarize = aiConfig.data.autoSummarize;
        const originalIsPrimary     = aiConfig.data.isPrimary;
        const originalSummarize     = sessionService.summarizeSessions;
        const originalRecord        = healthService.recordPeriodicSweep;

        try {
            aiConfig.data.autoSummarize = true;
            aiConfig.data.isPrimary     = true;

            let summarizeCalled = 0;
            sessionService.summarizeSessions = async () => {
                summarizeCalled++;
                return {processed: 0};
            };

            const recordedCalls = [];
            healthService.recordPeriodicSweep = (status, details) => {
                recordedCalls.push({status, details});
            };

            await sessionService.runPeriodicSummarizationSweep();

            expect(summarizeCalled).toBe(1);
            expect(recordedCalls.length).toBe(1);
            expect(recordedCalls[0].status).toBe('completed');
            expect(recordedCalls[0].details.lastSweepAt).toBeDefined();
        } finally {
            aiConfig.data.autoSummarize         = originalAutoSummarize;
            aiConfig.data.isPrimary             = originalIsPrimary;
            sessionService.summarizeSessions    = originalSummarize;
            healthService.recordPeriodicSweep   = originalRecord;
        }
    });

    test('no-ops when isPrimary=false (single-writer enforcement)', async () => {
        const sessionService = SDK.Memory_SessionService;
        const aiConfig       = SDK.Memory_Config;

        const originalAutoSummarize = aiConfig.data.autoSummarize;
        const originalIsPrimary     = aiConfig.data.isPrimary;
        const originalSummarize     = sessionService.summarizeSessions;

        try {
            aiConfig.data.autoSummarize = true;
            aiConfig.data.isPrimary     = false;

            let summarizeCalled = 0;
            sessionService.summarizeSessions = async () => {
                summarizeCalled++;
            };

            await sessionService.runPeriodicSummarizationSweep();

            expect(summarizeCalled).toBe(0);
        } finally {
            aiConfig.data.autoSummarize      = originalAutoSummarize;
            aiConfig.data.isPrimary          = originalIsPrimary;
            sessionService.summarizeSessions = originalSummarize;
        }
    });

    test('no-ops when autoSummarize=false', async () => {
        const sessionService = SDK.Memory_SessionService;
        const aiConfig       = SDK.Memory_Config;

        const originalAutoSummarize = aiConfig.data.autoSummarize;
        const originalIsPrimary     = aiConfig.data.isPrimary;
        const originalSummarize     = sessionService.summarizeSessions;

        try {
            aiConfig.data.autoSummarize = false;
            aiConfig.data.isPrimary     = true;

            let summarizeCalled = 0;
            sessionService.summarizeSessions = async () => {
                summarizeCalled++;
            };

            await sessionService.runPeriodicSummarizationSweep();

            expect(summarizeCalled).toBe(0);
        } finally {
            aiConfig.data.autoSummarize      = originalAutoSummarize;
            aiConfig.data.isPrimary          = originalIsPrimary;
            sessionService.summarizeSessions = originalSummarize;
        }
    });

    test('records failed sweep when summarizeSessions throws', async () => {
        const sessionService = SDK.Memory_SessionService;
        const healthService  = SDK.Memory_HealthService;
        const aiConfig       = SDK.Memory_Config;

        const originalAutoSummarize = aiConfig.data.autoSummarize;
        const originalIsPrimary     = aiConfig.data.isPrimary;
        const originalSummarize     = sessionService.summarizeSessions;
        const originalRecord        = healthService.recordPeriodicSweep;

        try {
            aiConfig.data.autoSummarize = true;
            aiConfig.data.isPrimary     = true;

            sessionService.summarizeSessions = async () => {
                throw new Error('mock sweep failure');
            };

            const recordedCalls = [];
            healthService.recordPeriodicSweep = (status, details) => {
                recordedCalls.push({status, details});
            };

            await sessionService.runPeriodicSummarizationSweep();

            expect(recordedCalls.length).toBe(1);
            expect(recordedCalls[0].status).toBe('failed');
            expect(recordedCalls[0].details.error).toBe('mock sweep failure');
            expect(recordedCalls[0].details.lastSweepAt).toBeDefined();
        } finally {
            aiConfig.data.autoSummarize         = originalAutoSummarize;
            aiConfig.data.isPrimary             = originalIsPrimary;
            sessionService.summarizeSessions    = originalSummarize;
            healthService.recordPeriodicSweep   = originalRecord;
        }
    });
});
