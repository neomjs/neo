import {setup} from '../../../../setup.mjs';

const appName = 'MemoryCoreRecorderServiceTest';

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
import fs             from 'fs';
import path           from 'path';
import {
    createProviderActivityStatusWriter,
    resolveProviderActivityStatusFile
} from '../../../../../../ai/services/shared/providerActivityStatusStore.mjs';
import {
    ensureEmbeddingIdentitySchema,
    recordEmbeddingSubmissions
} from '../../../../../../ai/services/shared/embeddingIdentityLedger.mjs';

test.describe('Neo.ai.services.memory-core.MemoryCoreRecorderService', () => {
    test.describe.configure({mode: 'serial'});

    const
        secret     = 'SENTINEL_SECRET_13506',
        testDbName = `mc-recorder-test-${process.pid}-${Date.now()}.sqlite`;

    let originalEnv;
    let testDbPath;
    let kbStatusWriter;
    let memoryCoreConfig;
    let MemoryCoreRecorderService;

    test.beforeAll(async () => {
        originalEnv = {
            NEO_MC_TOOL_TELEMETRY_ENABLED        : process.env.NEO_MC_TOOL_TELEMETRY_ENABLED,
            NEO_MC_TOOL_TELEMETRY_ERROR_MAX_CHARS: process.env.NEO_MC_TOOL_TELEMETRY_ERROR_MAX_CHARS,
            NEO_MC_TOOL_TELEMETRY_SLOW_AFTER_MS  : process.env.NEO_MC_TOOL_TELEMETRY_SLOW_AFTER_MS,
            NEO_MEMORY_DB_PATH_TEST              : process.env.NEO_MEMORY_DB_PATH_TEST,
            UNIT_TEST_MODE                       : process.env.UNIT_TEST_MODE
        };

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }

        testDbPath = path.join(tmpDir, testDbName);

        process.env.UNIT_TEST_MODE = 'true';
        process.env.NEO_MEMORY_DB_PATH_TEST = testDbPath;
        process.env.NEO_MC_TOOL_TELEMETRY_ENABLED = 'true';
        process.env.NEO_MC_TOOL_TELEMETRY_ERROR_MAX_CHARS = '80';

        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }

        memoryCoreConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        memoryCoreConfig.refreshEnv();
        MemoryCoreRecorderService = (await import('../../../../../../ai/services/memory-core/MemoryCoreRecorderService.mjs')).default;

        // A Playwright worker can reuse this singleton after another spec imported it. Rebind it to
        // this fixture's explicit database instead of letting initAsync() return on the stale handle.
        await MemoryCoreRecorderService.flushProviderActivityStatus();
        try { MemoryCoreRecorderService.db?.close(); } catch (e) {}
        MemoryCoreRecorderService.db = null;
        MemoryCoreRecorderService.providerActivityStatusWriter = null;

        await MemoryCoreRecorderService.initAsync();

        kbStatusWriter = createProviderActivityStatusWriter({
            dbPath  : testDbPath,
            recorder: 'knowledge-base'
        });
        await kbStatusWriter.publishSuccess(Date.now());
    });

    test.beforeEach(() => {
        MemoryCoreRecorderService.db.exec('DELETE FROM mc_tool_call_log;');
        MemoryCoreRecorderService.db.exec('DELETE FROM provider_activity_log;');
        MemoryCoreRecorderService.db.exec('DELETE FROM embedding_identity_log;');
        MemoryCoreRecorderService.db.exec('DELETE FROM embedding_identity_state;');
        ensureEmbeddingIdentitySchema(MemoryCoreRecorderService.db, {
            now: () => Date.now() - 3_600_000
        });
    });

    test.afterAll(async () => {
        await kbStatusWriter?.flush();
        await MemoryCoreRecorderService?.flushProviderActivityStatus();

        if (MemoryCoreRecorderService?.db) {
            try { MemoryCoreRecorderService.db.close(); } catch (e) {}
            MemoryCoreRecorderService.db = null;
        }

        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }

        for (const recorder of ['knowledge-base', 'memory-core']) {
            const file = resolveProviderActivityStatusFile(testDbPath, recorder);
            try { fs.unlinkSync(file); } catch (e) {}
        }

        for (const [key, value] of Object.entries(originalEnv || {})) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        memoryCoreConfig?.refreshEnv();
    });

    test('initializes the redacted Memory Core tool telemetry schema', () => {
        const table = MemoryCoreRecorderService.db.prepare(`
            SELECT name
              FROM sqlite_master
             WHERE type = 'table'
               AND name = 'mc_tool_call_log'
        `).get();

        expect(table.name).toBe('mc_tool_call_log');

        const columns = MemoryCoreRecorderService.db.prepare('PRAGMA table_info(mc_tool_call_log)').all();
        expect(columns.some(column => column.name === 'completed_at')).toBe(true);
        expect(MemoryCoreRecorderService.db.prepare(`
            SELECT name
              FROM sqlite_master
             WHERE type = 'table'
               AND name = 'provider_activity_log'
        `).get().name).toBe('provider_activity_log');
        expect(MemoryCoreRecorderService.db.pragma('busy_timeout', {simple: true})).toBe(50);
    });

    test('migrates completed legacy rows without relabeling them as unfinished', async () => {
        const
            Database = (await import('better-sqlite3')).default,
            db       = new Database(':memory:');

        try {
            db.exec(`
                CREATE TABLE mc_tool_call_log (
                    id            TEXT PRIMARY KEY,
                    agent_id      TEXT,
                    user_id       TEXT,
                    session_id    TEXT,
                    sequence_id   TEXT NOT NULL,
                    timestamp     INTEGER NOT NULL,
                    tool          TEXT NOT NULL,
                    success       INTEGER DEFAULT 0,
                    duration_ms   INTEGER,
                    failure_stage TEXT,
                    error_code    TEXT,
                    error_name    TEXT,
                    error_message TEXT,
                    args_bytes    INTEGER DEFAULT 0,
                    result_bytes  INTEGER DEFAULT 0
                );
                INSERT INTO mc_tool_call_log (
                    id, sequence_id, timestamp, tool, success, duration_ms
                ) VALUES ('legacy-call', 'legacy-sequence', 1000, 'healthcheck', 1, 25);
            `);

            MemoryCoreRecorderService.ensureSchema.call({db});

            const row = db.prepare(`
                SELECT completed_at
                  FROM mc_tool_call_log
                 WHERE id = 'legacy-call'
            `).get();

            expect(row.completed_at).toBe(1025);

            // Simulate a process dying after ALTER TABLE but before its legacy-row backfill.
            db.prepare(`
                UPDATE mc_tool_call_log
                   SET completed_at = NULL
                 WHERE id = 'legacy-call'
            `).run();

            MemoryCoreRecorderService.ensureSchema.call({db});

            expect(db.prepare(`
                SELECT completed_at
                  FROM mc_tool_call_log
                 WHERE id = 'legacy-call'
            `).get().completed_at).toBe(1025);
        } finally {
            db.close();
        }
    });

    test('persists an in-flight start boundary and completes the same redacted row', () => {
        const
            t0 = Date.now() - 8,
            id = MemoryCoreRecorderService.beginToolCall({
                toolName: 'list_messages',
                args    : {body: secret, status: 'unread'},
                t0
            });

        const active = MemoryCoreRecorderService.db.prepare(`
            SELECT *
              FROM mc_tool_call_log
             WHERE id = ?
        `).get(id);

        expect(id).toBeTruthy();
        expect(active.tool).toBe('list_messages');
        expect(active.duration_ms).toBeNull();
        expect(active.completed_at).toBeNull();
        expect(JSON.stringify(active)).not.toContain(secret);

        const during = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 10});
        expect(during.totalCalls).toBe(0);
        expect(during.totalUnfinished).toBe(1);
        expect(during.unfinishedCalls[0]).toMatchObject({callId: id, tool: 'list_messages'});
        expect(during.unfinishedCalls[0]).not.toHaveProperty('agentId');
        expect(during.unfinishedCalls[0]).not.toHaveProperty('sessionId');
        expect(JSON.stringify(during)).not.toContain(secret);

        MemoryCoreRecorderService.logToolCall({
            id,
            toolName: 'list_messages',
            args    : {body: secret, status: 'unread'},
            result  : {messages: []},
            success : true,
            t0
        });

        const completed = MemoryCoreRecorderService.db.prepare(`
            SELECT *
              FROM mc_tool_call_log
             WHERE id = ?
        `).get(id);

        expect(completed.completed_at).toBeGreaterThanOrEqual(t0);
        expect(completed.duration_ms).toBeGreaterThanOrEqual(0);
        expect(MemoryCoreRecorderService.db.prepare('SELECT COUNT(*) AS count FROM mc_tool_call_log').get().count).toBe(1);

        const after = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 10});
        expect(after.totalCalls).toBe(1);
        expect(after.totalUnfinished).toBe(0);
        expect(after.unfinishedCalls).toEqual([]);
    });

    test('records bounded metadata without raw Memory Core payloads', () => {
        MemoryCoreRecorderService.logToolCall({
            toolName    : 'add_memory',
            args        : {prompt: secret, thought: secret, metadata: {safe: true}},
            result      : {response: secret},
            success     : false,
            error       : new Error(`provider echoed ${secret}`),
            failureStage: 'dispatch',
            t0          : Date.now() - 4
        });

        const row = MemoryCoreRecorderService.db.prepare(`
            SELECT *
              FROM mc_tool_call_log
             WHERE tool = 'add_memory'
        `).get();

        expect(row.success).toBe(0);
        expect(row.completed_at).not.toBeNull();
        expect(row.failure_stage).toBe('dispatch');
        expect(row.args_bytes).toBeGreaterThan(0);
        expect(row.result_bytes).toBeGreaterThan(0);
        expect(row.error_message).toContain('[redacted]');
        expect(JSON.stringify(row)).not.toContain(secret);
    });

    test('returns aggregate metrics without raw row payloads', () => {
        MemoryCoreRecorderService.logToolCall({
            toolName: 'query_raw_memories',
            args    : {query: 'safe'},
            result  : {count: 1},
            success : true,
            t0      : Date.now() - 12
        });
        MemoryCoreRecorderService.logToolCall({
            toolName    : 'query_raw_memories',
            args        : {query: 'safe'},
            success     : false,
            error       : new Error('query failed'),
            failureStage: 'dispatch',
            t0          : Date.now() - 20
        });

        const metrics = MemoryCoreRecorderService.getMemoryCoreToolMetrics({
            sinceMs: 60_000,
            limit  : 10
        });

        expect(metrics.status).toBe('ok');
        expect(metrics.totalCalls).toBe(2);
        expect(metrics.tools[0].tool).toBe('query_raw_memories');
        expect(metrics.tools[0].calls).toBe(2);
        expect(metrics.tools[0].failures).toBe(1);
        expect(JSON.stringify(metrics)).not.toContain('safe');
    });

    test('projects bounded provider activity beside unchanged tool metrics', () => {
        const now      = Date.now();
        const queuedId = MemoryCoreRecorderService.beginProviderActivity({
            activityId      : 'queued-activity',
            service         : 'memory-core',
            operationStage  : 'mc-session-summary',
            role            : 'chat',
            provider        : 'ollama',
            model           : 'gemma4:26b',
            priority        : 'batch',
            enqueuedAt      : now - 100,
            queueDisposition: 'neo-queued',
            prompt          : secret,
            operationLabel  : `session/${secret}`,
            sessionId       : secret
        });

        MemoryCoreRecorderService.startProviderActivity(queuedId, now - 75);
        MemoryCoreRecorderService.completeProviderActivity(queuedId, {completedAt: now - 25, success: true});

        const inFlightId = MemoryCoreRecorderService.beginProviderActivity({
            activityId      : 'in-flight-activity',
            service         : 'knowledge-base',
            operationStage  : 'kb-query-embedding',
            role            : 'embedding',
            provider        : 'openAiCompatible',
            model           : 'qwen3-embedding',
            priority        : 'interactive',
            enqueuedAt      : now - 50,
            queueDisposition: 'neo-queued'
        });

        const remoteId = MemoryCoreRecorderService.beginProviderActivity({
            activityId      : 'remote-activity',
            service         : 'dream-pipeline',
            operationStage  : 'rem-topology',
            role            : 'chat',
            provider        : 'gemini',
            model           : 'gemini-2.5-flash',
            priority        : 'batch',
            enqueuedAt      : now - 40,
            startedAt       : now - 40,
            queueDisposition: 'not-applicable'
        });

        MemoryCoreRecorderService.completeProviderActivity(remoteId, {
            completedAt : now - 10,
            failureStage: 'provider',
            success     : false
        });

        const metrics = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 10});

        expect(Object.keys(metrics)).toEqual([
            'status',
            'sinceMs',
            'limit',
            'slowAfterMs',
            'totalCalls',
            'totalUnfinished',
            'tools',
            'unfinishedCalls',
            'recentSlowCalls',
            'providerActivity',
            // The denominator. `providerActivity` alone cannot distinguish a busy ingestion from a
            // lane burning against an empty backlog, and this key set is the declared surface — so
            // the addition is recorded here rather than the pin loosened.
            'walDrain',
            'reembedRatio'
        ]);
        expect(metrics.providerActivity).toMatchObject({
            status         : 'ok',
            totalActivities: 3,
            totalInFlight  : 1
        });
        expect(metrics.providerActivity.inFlight).toEqual([
            expect.objectContaining({activityId: inFlightId, operationStage: 'kb-query-embedding'})
        ]);
        expect(metrics.providerActivity.recentCompletions.find(row => row.activityId === queuedId)).toMatchObject({
            queueDisposition: 'neo-queued',
            queueWaitMs     : 25,
            executionMs     : 50,
            success         : true
        });
        expect(metrics.providerActivity.recentCompletions.find(row => row.activityId === remoteId)).toMatchObject({
            queueDisposition: 'not-applicable',
            queueWaitMs     : null,
            executionMs     : 30,
            success         : false,
            failureStage    : 'provider'
        });
        expect(JSON.stringify(metrics.providerActivity)).not.toContain(secret);
    });

    test('returns bounded recent slow completions without caller identity or payloads', () => {
        const
            now    = Date.now(),
            insert = MemoryCoreRecorderService.db.prepare(`
                INSERT INTO mc_tool_call_log (
                    id, agent_id, user_id, session_id, sequence_id, timestamp,
                    tool, success, duration_ms, completed_at, failure_stage,
                    error_message, args_bytes, result_bytes
                ) VALUES (
                    @id, @agentId, @userId, @sessionId, @sequenceId, @timestamp,
                    @tool, @success, @durationMs, @completedAt, @failureStage,
                    @errorMessage, @argsBytes, @resultBytes
                )
            `),
            identity = '@private-agent',
            payload  = 'PRIVATE_PAYLOAD';

        for (const row of [
            {
                id        : 'slow-older', timestamp: now - 9_000, completedAt: now - 7_000,
                durationMs: 2_000, tool: 'list_messages', success: 1, failureStage: null
            },
            {
                id        : 'slow-newer-b', timestamp: now - 2_600, completedAt: now - 1_000,
                durationMs: 1_600, tool: 'healthcheck', success: 1, failureStage: null
            },
            {
                id        : 'slow-newer-a', timestamp: now - 2_500, completedAt: now - 1_000,
                durationMs: 1_500, tool: 'add_message', success: 0, failureStage: 'dispatch'
            },
            {
                id        : 'fast', timestamp: now - 900, completedAt: now - 850,
                durationMs: 50, tool: 'get_message', success: 1, failureStage: null
            },
            {
                id        : 'outside-window', timestamp: now - 120_000, completedAt: now - 118_000,
                durationMs: 2_000, tool: 'query_summaries', success: 1, failureStage: null
            },
            {
                id        : 'slow-cross-window', timestamp: now - 120_000, completedAt: now - 500,
                durationMs: 119_500, tool: 'add_message', success: 1, failureStage: null
            }
        ]) {
            insert.run({
                ...row,
                agentId     : identity,
                userId      : 'private-user',
                sessionId   : 'private-session',
                sequenceId  : `sequence-${row.id}`,
                errorMessage: payload,
                argsBytes   : payload.length,
                resultBytes : payload.length
            });
        }

        const metrics = MemoryCoreRecorderService.getMemoryCoreToolMetrics({
            sinceMs    : 60_000,
            limit      : 10,
            slowAfterMs: 1_000
        });

        expect(metrics.slowAfterMs).toBe(1_000);
        expect(metrics.recentSlowCalls.map(row => row.callId)).toEqual([
            'slow-cross-window',
            'slow-newer-a',
            'slow-newer-b',
            'slow-older'
        ]);
        expect(metrics.recentSlowCalls[1]).toEqual({
            callId      : 'slow-newer-a',
            tool        : 'add_message',
            startedAt   : new Date(now - 2_500).toISOString(),
            completedAt : new Date(now - 1_000).toISOString(),
            durationMs  : 1_500,
            success     : false,
            failureStage: 'dispatch'
        });
        expect(Object.keys(metrics.recentSlowCalls[0])).toEqual([
            'callId',
            'tool',
            'startedAt',
            'completedAt',
            'durationMs',
            'success',
            'failureStage'
        ]);
        expect(JSON.stringify(metrics.recentSlowCalls)).not.toContain(identity);
        expect(JSON.stringify(metrics.recentSlowCalls)).not.toContain(payload);

        const bounded = MemoryCoreRecorderService.getMemoryCoreToolMetrics({
            sinceMs    : 60_000,
            limit      : 2,
            slowAfterMs: 1_000
        });

        expect(bounded.recentSlowCalls.map(row => row.callId)).toEqual([
            'slow-cross-window',
            'slow-newer-a'
        ]);
    });

    test('reads the default slow threshold from the resolved leaf and validates caller overrides', () => {
        const originalSlowAfterMs = process.env.NEO_MC_TOOL_TELEMETRY_SLOW_AFTER_MS;

        try {
            process.env.NEO_MC_TOOL_TELEMETRY_SLOW_AFTER_MS = '1234';
            memoryCoreConfig.refreshEnv();

            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics()).toMatchObject({
                status         : 'ok',
                slowAfterMs    : 1_234,
                recentSlowCalls: []
            });
            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics({slowAfterMs: 0})).toMatchObject({
                slowAfterMs    : 1_234,
                recentSlowCalls: []
            });
            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics({slowAfterMs: 500})).toMatchObject({
                slowAfterMs    : 500,
                recentSlowCalls: []
            })
        } finally {
            if (originalSlowAfterMs === undefined) {
                delete process.env.NEO_MC_TOOL_TELEMETRY_SLOW_AFTER_MS
            } else {
                process.env.NEO_MC_TOOL_TELEMETRY_SLOW_AFTER_MS = originalSlowAfterMs
            }
            memoryCoreConfig.refreshEnv()
        }
    });

    test('captures Memory Core MCP wrapper success and dispatch failure', async () => {
        const {callTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');

        const metrics = await callTool('get_memory_core_tool_metrics', {sinceMs: 60_000, limit: 5});

        expect(metrics.totalUnfinished).toBe(0);
        expect(metrics.unfinishedCalls).toEqual([]);

        await expect(callTool('missing_memory_core_tool', {})).rejects.toThrow(/not found/);

        const rows = MemoryCoreRecorderService.db.prepare(`
            SELECT tool, success, failure_stage
              FROM mc_tool_call_log
             ORDER BY timestamp ASC
        `).all();

        expect(rows.some(row => row.tool === 'get_memory_core_tool_metrics' && row.success === 1)).toBe(true);
        expect(rows.some(row => row.tool === 'missing_memory_core_tool' && row.success === 0 && row.failure_stage === 'dispatch')).toBe(true);
    });

    test('captures health-gate and policy failures through Memory Core server hooks', async () => {
        const Server = (await import('../../../../../../ai/mcp/server/memory-core/Server.mjs')).default;
        const server = Neo.create(Server);

        await server.onHealthGateFailure({
            toolName: 'query_summaries',
            args    : {prompt: secret},
            error   : new Error(`health gate saw ${secret}`),
            t0      : Date.now() - 6
        });

        await expect(server.beforeToolDispatch({
            toolName: 'add_message',
            args    : {from: '@spoofed', body: secret},
            t0      : Date.now() - 3
        })).rejects.toThrow();

        const rows = MemoryCoreRecorderService.db.prepare(`
            SELECT tool, failure_stage, error_message
              FROM mc_tool_call_log
             WHERE success = 0
             ORDER BY timestamp ASC
        `).all();

        expect(rows.some(row => row.tool === 'query_summaries' && row.failure_stage === 'health_gate')).toBe(true);
        expect(rows.some(row => row.tool === 'add_message' && row.failure_stage === 'policy')).toBe(true);
        expect(JSON.stringify(rows)).not.toContain(secret);
    });

    test('returns the bounded empty projection when telemetry is disabled', () => {
        const originalEnabled = process.env.NEO_MC_TOOL_TELEMETRY_ENABLED;

        try {
            process.env.NEO_MC_TOOL_TELEMETRY_ENABLED = 'false';
            memoryCoreConfig.refreshEnv();

            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics({slowAfterMs: 1_000})).toMatchObject({
                status          : 'disabled',
                slowAfterMs     : 1_000,
                totalCalls      : 0,
                totalUnfinished : 0,
                tools           : [],
                unfinishedCalls : [],
                recentSlowCalls : [],
                providerActivity: {
                    status           : 'disabled',
                    aggregates       : [],
                    inFlight         : [],
                    recentCompletions: []
                },
                reembedRatio: {
                    status          : 'disabled',
                    ratio           : null,
                    oldestRetainedAt: null
                }
            });
        } finally {
            process.env.NEO_MC_TOOL_TELEMETRY_ENABLED = originalEnabled;
            memoryCoreConfig.refreshEnv();
        }
    });

    test('fails open when telemetry storage is unavailable', () => {
        const originalDb = MemoryCoreRecorderService.db;
        MemoryCoreRecorderService.db = null;

        try {
            expect(() => MemoryCoreRecorderService.logToolCall({
                toolName: 'add_memory',
                args    : {prompt: secret},
                success : true,
                t0      : Date.now()
            })).not.toThrow();

            expect(MemoryCoreRecorderService.beginToolCall({
                toolName: 'add_memory',
                args    : {prompt: secret},
                t0      : Date.now()
            })).toBeNull();

            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics()).toMatchObject({
                status          : 'unavailable',
                slowAfterMs     : memoryCoreConfig.toolTelemetry.slowAfterMs,
                totalCalls      : 0,
                totalUnfinished : 0,
                tools           : [],
                unfinishedCalls : [],
                recentSlowCalls : [],
                providerActivity: {
                    status           : 'unavailable',
                    aggregates       : [],
                    inFlight         : [],
                    recentCompletions: []
                }
            });

            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics({slowAfterMs: 0})).toMatchObject({
                slowAfterMs    : memoryCoreConfig.toolTelemetry.slowAfterMs,
                recentSlowCalls: []
            });
        } finally {
            MemoryCoreRecorderService.db = originalDb;
        }
    });

    test('reports a partial provider projection when only that observer query fails', () => {
        const originalDb = MemoryCoreRecorderService.db;
        const proxyDb    = {
            exec: originalDb.exec.bind(originalDb),
            prepare(sql) {
                if (String(sql).includes('FROM provider_activity_log')) {
                    throw new Error('provider projection unavailable');
                }

                return originalDb.prepare(sql);
            },
            transaction: originalDb.transaction.bind(originalDb)
        };

        MemoryCoreRecorderService.db = proxyDb;

        try {
            const metrics = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            expect(metrics.status).toBe('ok');
            expect(metrics.providerActivity).toEqual({
                status                    : 'partial',
                // Present-and-empty on a degraded arm, never absent: `undefined` reads as zero
                // demand, which is the one reassuring answer a failed projection must not give.
                nativeAdmission           : {},
                totalActivities           : 0,
                totalInFlight             : 0,
                totalRecentCompletions    : 0,
                totalReaped               : 0,
                inFlightTruncated         : false,
                recentCompletionsTruncated: false,
                reapedTruncated           : false,
                reapedThisRead            : {abandoned: 0, unsettled: 0},
                aggregates                : [],
                inFlight                  : [],
                recentCompletions         : [],
                reaped                    : []
            });
        } finally {
            MemoryCoreRecorderService.db = originalDb;
        }
    });

    test('independently downgrades the identity projection when its writer status is partial', () => {
        const
            originalDb     = MemoryCoreRecorderService.db,
            kbFile         = resolveProviderActivityStatusFile(testDbPath, 'knowledge-base'),
            originalStatus = fs.readFileSync(kbFile, 'utf8'),
            proxyDb        = {
                exec: originalDb.exec.bind(originalDb),
                prepare(sql) {
                    if (String(sql).includes('FROM provider_activity_log')) {
                        throw new Error('provider projection unavailable');
                    }

                    return originalDb.prepare(sql);
                },
                transaction: originalDb.transaction.bind(originalDb)
            },
            partialStatus = {
                ...JSON.parse(originalStatus),
                lastFailureAt: Date.now()
            };

        fs.writeFileSync(kbFile, JSON.stringify(partialStatus));
        MemoryCoreRecorderService.db = proxyDb;

        try {
            const metrics = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            expect(metrics.providerActivity.status).toBe('partial');
            expect(metrics.reembedRatio).toMatchObject({
                status: 'partial',
                reason: 'embedding-identity-writer-partial'
            });
        } finally {
            MemoryCoreRecorderService.db = originalDb;
            fs.writeFileSync(kbFile, originalStatus);
        }
    });

    test('returns no provider rows when one required recorder status is unavailable', () => {
        const
            id = MemoryCoreRecorderService.beginProviderActivity({
                activityId      : 'unverifiable-provider-row',
                service         : 'memory-core',
                operationStage  : 'mc-mini-summary',
                role            : 'chat',
                provider        : 'ollama',
                model           : 'gemma4:26b',
                priority        : 'batch',
                enqueuedAt      : Date.now() - 10,
                queueDisposition: 'neo-queued'
            }),
            kbFile       = resolveProviderActivityStatusFile(testDbPath, 'knowledge-base'),
            withheldFile = `${kbFile}.withheld`;

        MemoryCoreRecorderService.startProviderActivity(id, Date.now() - 8);
        MemoryCoreRecorderService.completeProviderActivity(id, {completedAt: Date.now(), success: true});
        fs.renameSync(kbFile, withheldFile);

        try {
            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5}).providerActivity).toEqual({
                status                    : 'unavailable',
                nativeAdmission           : {},
                totalActivities           : 0,
                totalInFlight             : 0,
                totalRecentCompletions    : 0,
                totalReaped               : 0,
                inFlightTruncated         : false,
                recentCompletionsTruncated: false,
                reapedTruncated           : false,
                reapedThisRead            : {abandoned: 0, unsettled: 0},
                aggregates                : [],
                inFlight                  : [],
                recentCompletions         : [],
                reaped                    : []
            });
        } finally {
            fs.renameSync(withheldFile, kbFile);
        }
    });

    test('keeps the metrics observer read-only after recorder initialization', () => {
        const originalDb = MemoryCoreRecorderService.db;
        const proxyDb    = {
            exec() {
                throw new Error('observer attempted schema DDL');
            },
            prepare    : originalDb.prepare.bind(originalDb),
            transaction: originalDb.transaction.bind(originalDb)
        };

        MemoryCoreRecorderService.db = proxyDb;

        try {
            expect(MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5})).toMatchObject({
                status          : 'ok',
                providerActivity: {status: 'ok'}
            });
        } finally {
            MemoryCoreRecorderService.db = originalDb;
        }
    });

    test.describe('walDrain — the denominator that makes provider load interpretable (#16780 AC-7)', () => {
        let originalProvider;

        test.beforeEach(() => {
            originalProvider = MemoryCoreRecorderService.walDrainDispositionProvider;
        });

        test.afterEach(() => {
            MemoryCoreRecorderService.walDrainDispositionProvider = originalProvider;
        });

        test('an absent drain host reports unavailable with NULL counts — never a fabricated zero', () => {
            MemoryCoreRecorderService.walDrainDispositionProvider = null;

            const {walDrain} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            // The load-bearing assertion of this whole projection. Zero pending against live provider
            // load IS the anomaly, so defaulting the denominator to 0 would not be conservative — it
            // would synthesise the exact alarm the field exists to detect, on every process that does
            // not host the drain.
            expect(walDrain.status).toBe('unavailable');
            expect(walDrain.counts, 'an unknown backlog must never read as an empty one').toBeNull();
            expect(walDrain.reason).toBe('wal-drain-not-hosted-in-this-process');
            expect(walDrain.inProgress, 'unknown live work is null, not "none"').toBeNull();
            expect(walDrain.window, 'unknown window work is null, not an empty aggregate').toBeNull();
        });

        test('a hosted drain publishes its own per-cycle counts beside provider activity', () => {
            const now = Date.now();

            MemoryCoreRecorderService.walDrainDispositionProvider = () => ({
                state       : 'clean',
                drainedClean: true,
                reason      : null,
                counts      : {pending: 12, embedded: 12, failed: 0, cooling: 0, outstanding: 0},
                at          : now - 1_000
            });

            const metrics = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            // One reading now carries both halves: attribution AND the work that justified it.
            expect(metrics.providerActivity).toBeDefined();
            expect(metrics.walDrain.status).toBe('ok');
            expect(metrics.walDrain.counts).toEqual({pending: 12, embedded: 12, failed: 0, cooling: 0, outstanding: 0});
            expect(metrics.walDrain.drainedClean).toBe(true);
            // `counts` describes ONE latest cycle and is not the comparable denominator. The earlier
            // version of this test asserted that a timestamp inside the lookback made it comparable;
            // @neo-gpt falsified that with two healthy sequences, so the claim — and this assertion —
            // are gone. Comparability now lives in `window`, which covers the same interval.
            expect(metrics.walDrain).not.toHaveProperty('withinWindow');
        });

        test('a cycle still waiting on the provider is VISIBLE as selected work (@neo-gpt falsifier 1)', () => {
            // The healthy sequence that defeated the first implementation: the last completed cycle was
            // idle, a new cycle has legitimately selected one item, and its provider call is in flight.
            // The tracker cannot speak about that cycle until the call returns, so the receipt alone
            // reports pending 0 beside real provider load — licensing exactly the divide-by-zero this
            // projection exists to prevent.
            MemoryCoreRecorderService.walDrainDispositionProvider = () => ({
                state : 'clean', drainedClean: true, reason: null,
                counts: {pending: 0, embedded: 0, selected: 0, outstanding: 0}, at: Date.now() - 500
            });
            MemoryCoreRecorderService.walDrainInProgressProvider = () => ({
                pendingAtStart: 1, selectedCount: 1, startedAt: Date.now() - 100
            });
            MemoryCoreRecorderService.walDrainWindowProvider = () => ({
                cycles: 1, oldestRetainedAt: Date.now() - 500,
                totals: {pending: 0, selected: 0, embedded: 0, failed: 0}, truncated: false
            });

            const {walDrain} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            expect(walDrain.inProgress, 'live selected work must not be invisible').not.toBeNull();
            expect(walDrain.inProgress.selectedCount).toBe(1);
        });

        test('work completed inside the lookback survives an idle poll overwriting the receipt (@neo-gpt falsifier 2)', () => {
            // The second healthy sequence: a work-bearing cycle embedded one item, then the next idle
            // poll overwrote the latest receipt while that completion was still inside the 60s provider
            // lookback. `counts` now reads 0/0 and is TRUE of its own cycle — the window aggregate is
            // what keeps the completed work visible.
            MemoryCoreRecorderService.walDrainDispositionProvider = () => ({
                state : 'clean', drainedClean: true, reason: null,
                counts: {pending: 0, embedded: 0, selected: 0, outstanding: 0}, at: Date.now() - 100
            });
            MemoryCoreRecorderService.walDrainInProgressProvider = () => null;
            MemoryCoreRecorderService.walDrainWindowProvider = () => ({
                cycles: 2, oldestRetainedAt: Date.now() - 30_000,
                totals: {pending: 1, selected: 1, embedded: 1, failed: 0}, truncated: false
            });

            const {walDrain} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            expect(walDrain.counts.embedded, 'the latest receipt is idle, truthfully').toBe(0);
            expect(walDrain.window.totals.embedded, 'the window still shows the work that explains the load').toBe(1);
            expect(walDrain.window.cycles).toBe(2);
        });

        test('a lookback older than retained history is marked truncated, never reported as a total', () => {
            MemoryCoreRecorderService.walDrainDispositionProvider = () => ({
                state: 'clean', drainedClean: true, reason: null, counts: {pending: 0}, at: Date.now()
            });
            MemoryCoreRecorderService.walDrainInProgressProvider = () => null;
            MemoryCoreRecorderService.walDrainWindowProvider = () => ({
                cycles: 256, oldestRetainedAt: Date.now() - 10_000,
                totals: {pending: 0, selected: 5, embedded: 5, failed: 0}, truncated: true
            });

            const {walDrain} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 3_600_000, limit: 5});

            expect(walDrain.window.truncated, 'a partial aggregate must say so').toBe(true);
        });

        test('the coverage start reaches the wire as an instant, so `truncated` is bounded not just flagged', () => {
            // These provider stubs prove RELAY only — that is the recorder's whole job here, and it
            // is why `truncated`'s correctness is proven in the producer's own spec
            // (`ai/daemons/shared/drainDisposition.spec.mjs`) rather than through this seam.
            const coverageStartedAt = Date.now() - 45_000;

            MemoryCoreRecorderService.walDrainDispositionProvider = () => ({
                state: 'clean', drainedClean: true, reason: null, counts: {pending: 0}, at: Date.now()
            });
            MemoryCoreRecorderService.walDrainInProgressProvider = () => null;
            MemoryCoreRecorderService.walDrainWindowProvider = () => ({
                coverageStartedAt, cycles: 1, oldestRetainedAt: Date.now() - 40_000,
                totals: {pending: 0, selected: 0, embedded: 0, failed: 0}, truncated: true
            });

            const {walDrain} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 3_600_000, limit: 5});

            expect(walDrain.window.coverageStartedAt, 'epoch ms must not reach the wire raw')
                .toBe(new Date(coverageStartedAt).toISOString());
        });

        test('the metrics surface reads Knowledge Base identities from shared SQLite', () => {
            // Compose runs KB and MC in separate processes. Writing through the shared producer
            // seam proves the MC observer reads identities produced by KB's process.
            const submittedAt = Date.now() - 1000;

            recordEmbeddingSubmissions(MemoryCoreRecorderService.db, {
                source: 'knowledge-base',
                submittedAt,
                texts : ['alpha', 'beta', 'alpha', 'beta']
            });

            const {reembedRatio} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            expect(reembedRatio.status).toBe('ok');
            expect(reembedRatio.ratio, 'four KB submissions for two distinct inputs').toBe(2);
            expect(reembedRatio.submissions).toBe(4);
            expect(reembedRatio.distinct).toBe(2);
            expect(reembedRatio.oldestRetainedAt).toBe(new Date(submittedAt).toISOString());
            expect(typeof reembedRatio.coverageStartedAt, 'epoch ms must not reach the wire raw').toBe('string');
        });

        test('old repeats outside sinceMs do not contaminate the current ratio', () => {
            const now = Date.now();

            recordEmbeddingSubmissions(MemoryCoreRecorderService.db, {
                source     : 'knowledge-base',
                submittedAt: now - 120_000,
                texts      : ['old repeat', 'old repeat']
            });
            MemoryCoreRecorderService.recordEmbeddingSubmissions({
                submittedAt: now - 1000,
                texts      : ['current unique']
            });

            const {reembedRatio} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            expect(reembedRatio).toMatchObject({
                status     : 'ok',
                distinct   : 1,
                ratio      : 1,
                submissions: 1,
                truncated  : false
            });
        });

        test('an observed but empty lookback reports null, never a no-repeat value', () => {

            const {reembedRatio} = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            expect(reembedRatio.status).toBe('ok');
            expect(reembedRatio.ratio, 'no observed batch is not the same fact as no repetition').toBeNull();
            expect(reembedRatio.submissions).toBe(0);
            expect(reembedRatio.oldestRetainedAt).toBeNull();
            expect(reembedRatio.reason).toBeNull();
        });

        test('EVERY status arm carries the required walDrain field (@neo-gpt contract break)', () => {
            // The field is declared required on the response, but the telemetry-disabled and
            // db-unavailable arms returned early without it. OpenAPI and parity checks validate the
            // DECLARATION, not the runtime branch, so both passed green while the wire contract broke.
            const originalDb = MemoryCoreRecorderService.db;

            try {
                MemoryCoreRecorderService.db = null;

                const unavailable = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

                expect(unavailable.status).toBe('unavailable');
                expect(unavailable.walDrain, 'a required field must exist on every arm').toBeDefined();
                expect(unavailable.walDrain.status).toBe('unavailable');
                expect(unavailable.walDrain.counts, 'still null, never zero').toBeNull();
                expect(unavailable.walDrain.window).toBeNull();
                expect(unavailable.walDrain.inProgress).toBeNull();
                expect(unavailable.reembedRatio.oldestRetainedAt).toBeNull();
            } finally {
                MemoryCoreRecorderService.db = originalDb;
            }
        });

        test('a throwing receipt degrades to partial with null counts, and never breaks the metrics call', () => {
            MemoryCoreRecorderService.walDrainDispositionProvider = () => {
                throw new Error('receipt exploded')
            };

            const metrics = MemoryCoreRecorderService.getMemoryCoreToolMetrics({sinceMs: 60_000, limit: 5});

            // Telemetry must not take the tool down, and a failed read must not masquerade as an empty
            // backlog either — the same null-not-zero rule as the absent case.
            expect(metrics.status).toBe('ok');
            expect(metrics.walDrain.status).toBe('partial');
            expect(metrics.walDrain.counts).toBeNull();
            expect(metrics.walDrain.reason).toContain('receipt exploded');
        });
    });
});
