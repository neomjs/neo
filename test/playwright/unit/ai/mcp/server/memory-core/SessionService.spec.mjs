import Database from 'better-sqlite3';
import { fork } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const isWorker = process.argv[2] === 'worker';

// Temporary DB in os.tmpdir()
const dbPath = path.join(os.tmpdir(), 'test-concurrent-summarization.sqlite');

function setupTestDb() {
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
    return db;
}

if (isWorker) {
    const sessionId = process.argv[3];
    const workerId = process.argv[4];
    
    (async () => {
        try {
            // Setup Neo global
            await import('../../../../../../../src/Neo.mjs');
            await import('../../../../../../../src/core/_export.mjs');

            const db = new Database(dbPath, { timeout: 5000 });
            
            // Import GraphService and inject db
            const { default: GraphService } = await import('../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs');
            GraphService.db = {
                storage: {
                    db: db
                }
            };

            const { default: SessionService } = await import('../../../../../../../ai/mcp/server/memory-core/services/SessionService.mjs');
            
            // Call the claim Summarization job
            const success = SessionService.claimSummarizationJob(sessionId, workerId);
            process.send({ workerId, success });
            process.exit(0);
        } catch(e) {
            console.error(e);
            process.exit(1);
        }
    })();
} else {
    // Master process
    const db = setupTestDb();
    const sessionId = 'test-session';
    db.prepare('DELETE FROM SummarizationJobs WHERE session_id = ?').run(sessionId);
    
    const NUM_WORKERS = 10;
    let completedWorkers = 0;
    let successCount = 0;
    let failCount = 0;
    
    console.log(`Starting ${NUM_WORKERS} workers trying to claim the same session...`);
    for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = fork(__filename, ['worker', sessionId, `worker-${i}`]);
        worker.on('message', (msg) => {
            if (msg.success) {
                successCount++;
                console.log(`Worker ${msg.workerId} SUCCESSFULLY claimed.`);
            } else {
                failCount++;
                console.log(`Worker ${msg.workerId} FAILED to claim.`);
            }
        });
        worker.on('exit', () => {
            completedWorkers++;
            if (completedWorkers === NUM_WORKERS) {
                console.log(`\nResults: ${successCount} succeeded, ${failCount} failed.`);
                try {
                    db.close();
                } catch(e) {}
                
                if (successCount === 1 && failCount === NUM_WORKERS - 1) {
                    console.log("TEST PASSED: Atomic lock works!");
                    process.exit(0);
                } else {
                    console.error("TEST FAILED");
                    process.exit(1);
                }
            }
        });
    }
}
