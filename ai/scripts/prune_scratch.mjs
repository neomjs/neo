import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * @summary Prunes agent-generated scratch and artifact files older than 7 days.
 * 
 * Automates the cleanup policy defined in PR #10620 to eliminate IDE harness-freeze
 * bottlenecks and manage disk space for high-churn directories.
 */

const APP_DATA_DIR = process.env.APPDATA_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
const BRAIN_DIR = path.join(APP_DATA_DIR, 'brain');
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function pruneDirectory(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isFile()) {
                const stats = await fs.stat(fullPath);
                const ageMs = Date.now() - stats.mtimeMs;
                if (ageMs > RETENTION_MS) {
                    await fs.unlink(fullPath);
                    console.log(`[prune_scratch] Deleted: ${fullPath}`);
                }
            } else if (entry.isDirectory()) {
                // Recursively prune subdirectories inside scratch/artifacts
                await pruneDirectory(fullPath);
                
                // Remove directory if empty after pruning
                const remaining = await fs.readdir(fullPath);
                if (remaining.length === 0) {
                    await fs.rmdir(fullPath);
                    console.log(`[prune_scratch] Removed empty directory: ${fullPath}`);
                }
            }
        }
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`[prune_scratch] Error pruning ${dirPath}:`, e.message);
        }
    }
}

async function main() {
    console.log(`[prune_scratch] Starting cleanup in ${BRAIN_DIR}...`);
    try {
        const conversations = await fs.readdir(BRAIN_DIR, { withFileTypes: true });
        
        for (const convo of conversations) {
            if (!convo.isDirectory()) continue;
            
            const convoPath = path.join(BRAIN_DIR, convo.name);
            const scratchPath = path.join(convoPath, 'scratch');
            const artifactsPath = path.join(convoPath, 'artifacts');
            
            await pruneDirectory(scratchPath);
            await pruneDirectory(artifactsPath);
        }
        
        console.log('[prune_scratch] Cleanup complete.');
    } catch (e) {
        console.error('[prune_scratch] Fatal error during cleanup:', e.message);
        process.exit(1);
    }
}

main();
