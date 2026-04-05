import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const dbPath = path.resolve(PROJECT_ROOT, '.neo-ai-data/neo-sqlite/knowledge-graph.sqlite');

/**
 * @summary A lightweight CLI tool to defragment the SQLite Native Vector Database.
 * This script runs the SQLite VACUUM command to optimize the knowledge-graph.sqlite file.
 */
function defragSQLiteDB() {
    console.log('🧹 Starting Defragmentation for SQLite Memory Core');
    
    if (fs.existsSync(dbPath)) {
        const initialSize = fs.statSync(dbPath).size;
        console.log(`   📂 Database Path: ${dbPath}`);
        console.log(`   📊 Initial Size: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   🧹 Running SQLite VACUUM on .neo-ai-data/neo-sqlite/knowledge-graph.sqlite...`);
        
        try {
            execSync(`sqlite3 "${dbPath}" "VACUUM;"`, { stdio: 'inherit' });
            
            const finalSize = fs.statSync(dbPath).size;
            const reduction = initialSize - finalSize;
            const reductionPercent = initialSize > 0 ? (reduction / initialSize) * 100 : 0;
            
            console.log(`   ✅ VACUUM complete.`);
            console.log(`   📉 Final Size   : ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   🔥 Reduction    : ${(reduction / 1024 / 1024).toFixed(2)} MB (${reductionPercent.toFixed(1)}%)`);
        } catch (e) {
            console.warn(`   ⚠️  VACUUM failed (sqlite3 CLI might be missing?): ${e.message}`);
            process.exit(1);
        }
    } else {
        console.log(`   ℹ️  No database found to vacuum at: ${dbPath}`);
    }
}

defragSQLiteDB();
