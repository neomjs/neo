import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { fork } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('SessionService Concurrency', () => {
    test('exclusive lease prevents concurrent claim of same session (#10693)', async () => {
        const dbPath = path.join(os.tmpdir(), `test-concurrent-summarization-${Date.now()}.sqlite`);
        
        const db = new Database(dbPath);
        db.prepare(`
            CREATE TABLE IF NOT EXISTS SummarizationJobs (
                session_id TEXT PRIMARY KEY,
                status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
                lease_token TEXT,
                expires_at INTEGER,
                retry_count INTEGER DEFAULT 0
            )
        `).run();
        db.pragma('journal_mode = WAL');

        const sessionId = 'test-session';
        db.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
        
        const NUM_WORKERS = 10;
        let successCount = 0;
        let failCount = 0;
        const workerPromises = [];
        
        const workerPath = path.join(__dirname, 'SessionService-worker.mjs');

        for (let i = 0; i < NUM_WORKERS; i++) {
            workerPromises.push(new Promise((resolve, reject) => {
                const worker = fork(workerPath, [sessionId, `worker-${i}`, dbPath]);
                worker.on('message', (msg) => {
                    if (msg.success) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                });
                worker.on('exit', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Worker exited with code ${code}`));
                });
            }));
        }

        await Promise.all(workerPromises);

        try {
            db.close();
        } catch(e) {}

        expect(successCount).toBe(1);
        expect(failCount).toBe(NUM_WORKERS - 1);
    });
});
