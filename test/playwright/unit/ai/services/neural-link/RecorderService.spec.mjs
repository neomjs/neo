import {setup} from '../../../../setup.mjs';

const appName = 'RecorderServiceTest';

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

test.describe('Neo.ai.services.neural-link.RecorderService', () => {
    let RecorderService;
    let config;
    const testDbName = `nl-recorder-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;
    
    test.beforeAll(async () => {
        config = (await import('../../../../../../ai/mcp/server/neural-link/config.mjs')).default;
        RecorderService = (await import('../../../../../../ai/services/neural-link/RecorderService.mjs')).default;
        
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);
        
        // Override the path for this test run
        config.data.memoryCoreDbPath = testDbPath;
        
        // Ensure old DB is gone just in case
        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }
        
        await RecorderService.initAsync();
    });
    
    test.afterAll(async () => {
        if (RecorderService.db) {
            try { RecorderService.db.close(); } catch (e) {}
            RecorderService.db = null;
        }
        
        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-wal`)) try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-shm`)) try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
        }
    });
    
    test('should initialize the database schema', async () => {
        expect(RecorderService.db).toBeTruthy();
        
        const tables = RecorderService.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nl_action_log'").all();
        expect(tables.length).toBe(1);
    });
    
    test('should log tool invocations correctly', () => {
        const dummyLog = {
            agent_id: 'agent-123',
            session_id: 'session-456',
            sequence_id: 'seq-789',
            timestamp: Date.now(),
            tool: 'test_tool',
            args: JSON.stringify({ arg1: 'value' }),
            result: JSON.stringify({ res: 'ok' }),
            success: true,
            duration_ms: 150,
            app_name: appName
        };
        
        RecorderService.log(dummyLog);
        
        const rows = RecorderService.db.prepare("SELECT * FROM nl_action_log WHERE sequence_id = 'seq-789'").all();
        expect(rows.length).toBe(1);
        
        const row = rows[0];
        expect(row.agent_id).toBe('agent-123');
        expect(row.session_id).toBe('session-456');
        expect(row.sequence_id).toBe('seq-789');
        expect(row.tool).toBe('test_tool');
        expect(row.success).toBe(1);
        expect(row.reward).toBeNull();
        expect(row.app_name).toBe(appName);
    });
    
    test('should handle success as 0 when log indicates failure', () => {
        const dummyLog = {
            agent_id: 'agent-123',
            session_id: 'session-456',
            sequence_id: 'seq-fail-123',
            timestamp: Date.now(),
            tool: 'test_tool2',
            args: '{}',
            result: 'error',
            success: false,
            duration_ms: 10
        };
        
        RecorderService.log(dummyLog);
        
        const rows = RecorderService.db.prepare("SELECT * FROM nl_action_log WHERE sequence_id = 'seq-fail-123'").all();
        expect(rows.length).toBe(1);
        expect(rows[0].success).toBe(0);
        expect(rows[0].reward).toBeNull();
    });
    
    test('querySequences should group and filter records', () => {
        const timeNow = Date.now();
        // create a future log
         RecorderService.log({
            agent_id: 'agent-future',
            sequence_id: 'seq-future',
            timestamp: timeNow + 5000,
            tool: 'future_tool',
            args: '{}',
            success: true
        });
        
        const futureRows = RecorderService.querySequences({ sinceTimestamp: timeNow + 1000 });
        expect(futureRows.length).toBe(1);
        expect(futureRows[0].sequence_id).toBe('seq-future');
    });
    
    test('pruneOlderThan should delete old rows', () => {
        // Insert a very old row
        RecorderService.db.prepare(`
            INSERT INTO nl_action_log (id, agent_id, sequence_id, timestamp, tool, args)
            VALUES ('old-1', 'ag', 'seq-old', ?, 'tool', '{}')
        `).run(Date.now() - (10 * 24 * 60 * 60 * 1000)); // 10 days ago
        
        const allBefore = RecorderService.db.prepare("SELECT count(*) as c FROM nl_action_log").get().c;
        
        // prune older than 5 days
        RecorderService.pruneOlderThan(5);
        
        const allAfter = RecorderService.db.prepare("SELECT count(*) as c FROM nl_action_log").get().c;
        expect(allAfter).toBe(allBefore - 1);
        
        const oldCheck = RecorderService.db.prepare("SELECT * FROM nl_action_log WHERE id = 'old-1'").get();
        expect(oldCheck).toBeUndefined();
    });
});
