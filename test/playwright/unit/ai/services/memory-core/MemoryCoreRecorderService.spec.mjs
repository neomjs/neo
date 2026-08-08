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

test.describe('Neo.ai.services.memory-core.MemoryCoreRecorderService', () => {
    const
        secret     = 'SENTINEL_SECRET_13506',
        testDbName = `mc-recorder-test-${process.pid}-${Date.now()}.sqlite`;

    let originalEnv;
    let testDbPath;
    let MemoryCoreRecorderService;

    test.beforeAll(async () => {
        originalEnv = {
            NEO_MC_TOOL_TELEMETRY_ENABLED        : process.env.NEO_MC_TOOL_TELEMETRY_ENABLED,
            NEO_MC_TOOL_TELEMETRY_ERROR_MAX_CHARS: process.env.NEO_MC_TOOL_TELEMETRY_ERROR_MAX_CHARS,
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

        MemoryCoreRecorderService = (await import('../../../../../../ai/services/memory-core/MemoryCoreRecorderService.mjs')).default;
        await MemoryCoreRecorderService.initAsync();
    });

    test.beforeEach(() => {
        MemoryCoreRecorderService.db.exec('DELETE FROM mc_tool_call_log;');
    });

    test.afterAll(() => {
        if (MemoryCoreRecorderService?.db) {
            try { MemoryCoreRecorderService.db.close(); } catch (e) {}
            MemoryCoreRecorderService.db = null;
        }

        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }

        for (const [key, value] of Object.entries(originalEnv || {})) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
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
                status         : 'unavailable',
                totalCalls     : 0,
                totalUnfinished: 0,
                tools          : [],
                unfinishedCalls: []
            });
        } finally {
            MemoryCoreRecorderService.db = originalDb;
        }
    });
});
