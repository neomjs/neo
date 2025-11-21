import { 
    Memory_DatabaseService, 
    Memory_LifecycleService, 
    Memory_ChromaManager 
} from '../services.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function main() {
    console.log('🔄 Starting Memory Core Restore...');

    // 1. Initialize Services
    console.log('   - Initializing Memory Core...');
    await Memory_ChromaManager.ready();

    // 2. Locate Backup Files
    // We assume the backup script created them in dist/memory-backups and dist/session-backups
    const memoryBackupDir  = path.resolve(__dirname, '../../dist/memory-backups');
    const sessionBackupDir = path.resolve(__dirname, '../../dist/session-backups');

    async function findLatestBackup(dir, prefix) {
        try {
            const files = await fs.readdir(dir);
            const backups = files
                .filter(f => f.startsWith(prefix) && f.endsWith('.jsonl'))
                .sort()
                .reverse(); // Newest first
            return backups.length > 0 ? path.join(dir, backups[0]) : null;
        } catch (e) {
            return null;
        }
    }

    const memoryBackupFile  = await findLatestBackup(memoryBackupDir, 'memory-backup');
    const sessionBackupFile = await findLatestBackup(sessionBackupDir, 'summaries-backup');

    if (!memoryBackupFile && !sessionBackupFile) {
        console.error('   ❌ No backup files found.');
        process.exit(1);
    }

    // 3. Restore Memories (Replace Mode)
    if (memoryBackupFile) {
        console.log(`   - Restoring Memories from: ${path.basename(memoryBackupFile)}`);
        try {
            const result = await Memory_DatabaseService.importDatabase({
                file: memoryBackupFile,
                mode: 'replace'
            });
            console.log(`     ✅ Imported ${result.imported} memories.`);
        } catch (error) {
            console.error(`     ❌ Restore failed: ${error.message}`);
        }
    }

    // 4. Restore Summaries (Replace Mode)
    if (sessionBackupFile) {
        console.log(`   - Restoring Summaries from: ${path.basename(sessionBackupFile)}`);
        try {
            const result = await Memory_DatabaseService.importDatabase({
                file: sessionBackupFile,
                mode: 'replace'
            });
            console.log(`     ✅ Imported ${result.imported} summaries.`);
        } catch (error) {
            console.error(`     ❌ Restore failed: ${error.message}`);
        }
    }

    console.log('✅ Restore complete.');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
