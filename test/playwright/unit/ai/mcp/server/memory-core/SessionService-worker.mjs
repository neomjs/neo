import Database from 'better-sqlite3';

const sessionId = process.argv[2];
const workerId = process.argv[3];
const dbPath = process.argv[4];

(async () => {
    try {
        // Setup Neo global
        await import('../../../../../../../src/Neo.mjs');
        await import('../../../../../../../src/core/_export.mjs');

        const db = new Database(dbPath, { timeout: 5000 });
        
        // Import GraphService and inject db
        const { default: GraphService } = await import('../../../../../../../ai/services/memory-core/GraphService.mjs');
        GraphService.db = {
            storage: {
                db: db
            }
        };

        const { default: SessionService } = await import('../../../../../../../ai/services/memory-core/SessionService.mjs');
        
        // Call the claim Summarization job
        const success = SessionService.claimSummarizationJob(sessionId, workerId);
        process.send({ workerId, success });
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
})();
