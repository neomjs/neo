import {setup} from '../../../../setup.mjs';

const appName = 'MemoryCoreSessionResumeValidationTest';
const skipCiSubstrateData = !!process.env.NEO_TEST_SKIP_CI;

process.env.NEO_MODEL_PROVIDER = 'openAiCompatible';
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
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';
import crypto          from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../.env'), quiet: true});

test.describe('SessionService validateSessionForResume (#10725)', () => {
    test.skip(skipCiSubstrateData, 'CI-skip: Memory Core substrate data not seeded - bucket C (#10903)');

    let SDK, TextEmbeddingService;

    test.beforeAll(async () => {
        const fs = await import('fs');

        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const path = await import("path");
        const tmpDir = path.resolve(process.cwd(), "tmp");
        aiConfig.storagePaths.graph = path.join(tmpDir, "test-graph-" + Date.now() + "-" + Math.random().toString(36).substring(7) + ".db");

        
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }

        aiConfig.collections.memory  = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        SDK                  = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        SDK.Memory_Config.data.modelProvider           = 'openAiCompatible';
        SDK.Memory_Config.data.embeddingProvider       = 'openAiCompatible';
        SDK.Memory_Config.data.autoSummarize           = false;

        TextEmbeddingService.embedText = async () => new Array(4096).fill(Math.random());
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager(SDK);
    });

    test.beforeEach(async () => {
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();
        await SDK.Memory_ChromaManager.ready();
    });

    test('SESSION_NOT_FOUND when no memories and no SummarizationJobs row', async () => {
        const sessionId = `nonexistent-${crypto.randomUUID()}`;

        const result = await SDK.Memory_SessionService.validateSessionForResume({sessionId});

        expect(result.success).toBeUndefined();
        expect(result.code).toBe('SESSION_NOT_FOUND');
        expect(result.sessionId).toBe(sessionId);
    });

    test('#12199: queueSummarizationJob writes an idempotent pending marker', async () => {
        const sessionId    = `pending-marker-${crypto.randomUUID()}`;
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        try {
            expect(SDK.Memory_SessionService.queueSummarizationJob(sessionId)).toBe(true);
            expect(SDK.Memory_SessionService.queueSummarizationJob(sessionId)).toBe(true);

            const row = sqlite.prepare('SELECT status, lease_token, expires_at, retry_count FROM SummarizationJobs WHERE session_id = ?').get(sessionId);

            expect(row.status).toBe('pending');
            expect(row.lease_token).toBeNull();
            expect(row.expires_at).toBeNull();
            expect(row.retry_count).toBe(0);
        } finally {
            sqlite.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
        }
    });

    test('#12199: queueSummarizationJob does not steal an active summarization lease', async () => {
        const sessionId    = `active-lease-${crypto.randomUUID()}`;
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        const futureExpiresAt = Date.now() + 60_000;
        sqlite.prepare(`
            INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
            VALUES (?, 'in_progress', 'active-token', ?, 3)
        `).run(sessionId, futureExpiresAt);

        try {
            expect(SDK.Memory_SessionService.queueSummarizationJob(sessionId)).toBe(true);

            const row = sqlite.prepare('SELECT status, lease_token, expires_at, retry_count FROM SummarizationJobs WHERE session_id = ?').get(sessionId);

            expect(row.status).toBe('in_progress');
            expect(row.lease_token).toBe('active-token');
            expect(row.expires_at).toBe(futureExpiresAt);
            expect(row.retry_count).toBe(3);
        } finally {
            sqlite.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
        }
    });

    test('#12199: queueSummarizationJob does not reopen a completed summary', async () => {
        const sessionId    = `completed-summary-${crypto.randomUUID()}`;
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        sqlite.prepare(`
            INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
            VALUES (?, 'completed', NULL, NULL, 2)
        `).run(sessionId);

        try {
            expect(SDK.Memory_SessionService.queueSummarizationJob(sessionId)).toBe(true);

            const row = sqlite.prepare('SELECT status, lease_token, expires_at, retry_count FROM SummarizationJobs WHERE session_id = ?').get(sessionId);

            expect(row.status).toBe('completed');
            expect(row.lease_token).toBeNull();
            expect(row.expires_at).toBeNull();
            expect(row.retry_count).toBe(2);
        } finally {
            sqlite.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
        }
    });

    test('#12199: summarizePendingSessions drains explicit pending ids through summarizeSessions', async () => {
        const calls = [];
        const originalGetPending = SDK.Memory_SessionService.getPendingSummarizationJobIds;
        const originalSummarize = SDK.Memory_SessionService.summarizeSessions;

        SDK.Memory_SessionService.getPendingSummarizationJobIds = ({limit}) => {
            calls.push({type: 'getPending', limit});
            return ['pending-session-1', 'pending-session-2'];
        };
        SDK.Memory_SessionService.summarizeSessions = async ({sessionId}) => {
            calls.push({type: 'summarize', sessionId});
            return {processed: 1, sessions: [{sessionId}]};
        };

        try {
            const result = await SDK.Memory_SessionService.summarizePendingSessions({limit: 2});

            expect(result).toEqual({
                pending  : 2,
                processed: 2,
                sessions : [{sessionId: 'pending-session-1'}, {sessionId: 'pending-session-2'}]
            });
            expect(calls).toEqual([
                {type: 'getPending', limit: 2},
                {type: 'summarize', sessionId: 'pending-session-1'},
                {type: 'summarize', sessionId: 'pending-session-2'}
            ]);
        } finally {
            SDK.Memory_SessionService.getPendingSummarizationJobIds = originalGetPending;
            SDK.Memory_SessionService.summarizeSessions = originalSummarize;
        }
    });

    test('resumable success when memories exist with no SummarizationJobs row', async () => {
        const sessionId = `resumable-memories-${crypto.randomUUID()}`;
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        await RequestContextService.run({sessionId}, async () => {
            await SDK.Memory_Service.addMemory({
                prompt  : 'resume validation prompt',
                response: 'resume validation response',
                thought : 'resume validation thought'
            });
        });

        const result = await SDK.Memory_SessionService.validateSessionForResume({sessionId});

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe(sessionId);
        expect(result.status).toBe('resumable');
        expect(result.memoryCount).toBe(1);
        expect(result.summarizationStatus).toBe('none');
        expect(result.lastActivityAt).toBeTruthy();
    });

    test('SESSION_FINALIZED when SummarizationJobs.status === completed', async () => {
        const sessionId       = `finalized-${crypto.randomUUID()}`;
        const GraphService    = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        // Plant a completed-status row directly to simulate a finalized session.
        sqlite.prepare(`
            INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
            VALUES (?, 'completed', NULL, NULL, 0)
        `).run(sessionId);

        try {
            const result = await SDK.Memory_SessionService.validateSessionForResume({sessionId});

            expect(result.success).toBeUndefined();
            expect(result.code).toBe('SESSION_FINALIZED');
            expect(result.sessionId).toBe(sessionId);
            expect(result.summarizationStatus).toBe('completed');
        } finally {
            sqlite.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
        }
    });

    test('SESSION_BUSY when SummarizationJobs.status === in_progress with future expires_at', async () => {
        const sessionId    = `busy-${crypto.randomUUID()}`;
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        const futureExpiresAt = Date.now() + 60_000;
        sqlite.prepare(`
            INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
            VALUES (?, 'in_progress', 'test-lease', ?, 0)
        `).run(sessionId, futureExpiresAt);

        try {
            const result = await SDK.Memory_SessionService.validateSessionForResume({sessionId});

            expect(result.success).toBeUndefined();
            expect(result.code).toBe('SESSION_BUSY');
            expect(result.sessionId).toBe(sessionId);
            expect(result.summarizationStatus).toBe('in_progress');
            expect(result.leaseExpiresAt).toBeTruthy();
        } finally {
            sqlite.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
        }
    });

    test('resumable when SummarizationJobs.status === in_progress but lease has expired', async () => {
        const sessionId             = `expired-lease-${crypto.randomUUID()}`;
        const GraphService          = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        // Plant a memory so the resumable path has a non-zero count + last activity.
        await RequestContextService.run({sessionId}, async () => {
            await SDK.Memory_Service.addMemory({
                prompt  : 'expired-lease prompt',
                response: 'expired-lease response',
                thought : 'expired-lease thought'
            });
        });

        // Plant an in_progress row with expired lease — should be treated as resumable.
        const expiredAt = Date.now() - 60_000;
        sqlite.prepare(`
            INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
            VALUES (?, 'in_progress', 'expired-lease-token', ?, 0)
        `).run(sessionId, expiredAt);

        try {
            const result = await SDK.Memory_SessionService.validateSessionForResume({sessionId});

            expect(result.success).toBe(true);
            expect(result.sessionId).toBe(sessionId);
            expect(result.status).toBe('resumable');
            expect(result.summarizationStatus).toBe('in_progress');
            expect(result.memoryCount).toBe(1);
        } finally {
            sqlite.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
        }
    });
});
