import Database from 'better-sqlite3';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const isWorker = process.argv[2] === 'worker';

// For test purposes, we'll use an in-memory DB or a temporary file.
const dbPath = path.join(process.cwd(), 'test-concurrent.sqlite');

function createDb() {
    const db = new Database(dbPath);
    // Ensure table exists
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

function claimSummarizationJob(db, sessionId, leaseToken, ttlMs = 300000) {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    
    try {
        const claimTx = db.transaction(() => {
            const existing = db.prepare('SELECT status, expires_at FROM SummarizationJobs WHERE session_id = ?').get(sessionId);
            
            if (!existing) {
                db.prepare(`
                    INSERT INTO SummarizationJobs (session_id, status, lease_token, expires_at, retry_count)
                    VALUES (?, 'in_progress', ?, ?, 0)
                `).run(sessionId, leaseToken, expiresAt);
                return true;
            }
            
            if (existing.status === 'completed') {
                return false;
            }
            
            if (existing.status === 'in_progress' && existing.expires_at < now) {
                db.prepare(`
                    UPDATE SummarizationJobs 
                    SET lease_token = ?, expires_at = ?, retry_count = retry_count + 1
                    WHERE session_id = ?
                `).run(leaseToken, expiresAt, sessionId);
                return true;
            }
            
            if (existing.status === 'pending' || existing.status === 'failed') {
                    db.prepare(`
                    UPDATE SummarizationJobs 
                    SET status = 'in_progress', lease_token = ?, expires_at = ?, retry_count = retry_count + 1
                    WHERE session_id = ?
                `).run(leaseToken, expiresAt, sessionId);
                return true;
            }
            
            return false;
        });
        
        return claimTx();
    } catch (e) {
        if (e.code === 'SQLITE_BUSY') {
            // It means another process is locking the DB
            return false;
        }
        return false;
    }
}

if (isWorker) {
    const sessionId = process.argv[3];
    const workerId = process.argv[4];
    const db = new Database(dbPath, { timeout: 5000 }); // Wait up to 5000ms if DB is busy (standard WAL behavior)
    
    const success = claimSummarizationJob(db, sessionId, workerId);
    process.send({ workerId, success });
    process.exit(0);
} else {
    // Master process
    const db = createDb();
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
                if (successCount === 1 && failCount === NUM_WORKERS - 1) {
                    console.log("TEST PASSED: Atomic lock works!");
                } else {
                    console.error("TEST FAILED");
                    process.exit(1);
                }
            }
        });
    }
}
