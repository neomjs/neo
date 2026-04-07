import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import Neo from './src/Neo.mjs';
import * as core from './src/core/_export.mjs';
import SQLiteVectorManager from './ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs';
import TextEmbeddingService from './ai/mcp/server/memory-core/services/TextEmbeddingService.mjs';
import aiConfig from './ai/mcp/server/memory-core/config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runRescue() {
    console.log("=== STARTING RAW SQLITE MIGRATION (BYPASSING CHROMA API) ===");
    
    // Boot Neo Native SQLite
    await SQLiteVectorManager.ready();
    await TextEmbeddingService.initAsync();
    
    const targetProvider = 'ollama'; // Configured Qwen3 locally
    aiConfig.neoEmbeddingProvider = targetProvider;
    
    const chromaDbPath = path.join(__dirname, '.neo-ai-data/chroma/memory-core/chroma.sqlite3');
    if (!fs.existsSync(chromaDbPath)) {
        throw new Error("Chroma DB not found at " + chromaDbPath);
    }
    
    const chromaDb = new Database(chromaDbPath, { readonly: true });
    
    // Build segment -> collection maps to know where each record goes
    const segments = chromaDb.prepare("SELECT s.id as segment_id, c.name as collection_name FROM segments s JOIN collections c ON s.collection = c.id;").all();
    const collectionMap = {};
    for (const seg of segments) {
        collectionMap[seg.segment_id] = seg.collection_name;
    }
    
    const sqliteSummaries = await SQLiteVectorManager.getSummaryCollection();
    const sqliteMemories = await SQLiteVectorManager.getMemoryCollection();

    // Query all records natively
    const query = `
        SELECT e.id as internal_id, e.embedding_id as id, e.segment_id, f.c0 as document 
        FROM embeddings e 
        JOIN embedding_fulltext_search_content f ON e.id = f.rowid
    `;
    const rows = chromaDb.prepare(query).all();
    console.log(`[Neo DB] Found ${rows.length} total raw records in Chroma SQLite.`);
    
    // Check if they are already in neo-sqlite to avoid re-embedding everything if we rerun
    const allSummaries = (await sqliteSummaries.get({ limit: 1000000 })).ids || [];
    const existingSummaries = new Set(allSummaries);
    const allMemories = (await sqliteMemories.get({ limit: 1000000 })).ids || [];
    const existingMemories  = new Set(allMemories);

    const metaQuery = chromaDb.prepare(`SELECT key, string_value, int_value, float_value, bool_value FROM embedding_metadata WHERE id = ?`);

    let summariesMigrated = 0;
    let memoriesMigrated = 0;
    let skipped = 0;
    
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const targetCollName = collectionMap[r.segment_id];
        
        let targetColl = null;
        let isExisting = false;
        
        if (targetCollName === 'neo-agent-sessions') {
            targetColl = sqliteSummaries;
            if (existingSummaries.has(r.id)) isExisting = true;
        } else if (targetCollName === 'neo-agent-memory') {
            targetColl = sqliteMemories;
            if (existingMemories.has(r.id)) isExisting = true;
        }
        
        if (!targetColl) continue;
        
        if (isExisting) {
            skipped++;
            continue;
        }

        // Aggregate Metadata
        const metadataRows = metaQuery.all(r.internal_id);
        const md = {};
        for (const mr of metadataRows) {
            if (mr.string_value !== null) md[mr.key] = mr.string_value;
            else if (mr.int_value !== null) md[mr.key] = mr.int_value;
            else if (mr.float_value !== null) md[mr.key] = mr.float_value;
            else if (mr.bool_value !== null) md[mr.key] = mr.bool_value ? true : false;
        }

        // Re-Embed Record using fast local Ollama
        try {
            const vec = await TextEmbeddingService.embedText(r.document, targetProvider);
            
            await targetColl.upsert({
                ids: [r.id],
                embeddings: [vec],
                metadatas: [md],
                documents: [r.document]
            });
            
            if (targetCollName === 'neo-agent-sessions') summariesMigrated++;
            else memoriesMigrated++;
            
        } catch(e) {
             console.error(`Failed on record ${r.id}: ${e.message}`);
        }
        
        if ((i + 1) % 50 === 0) {
            process.stdout.write(`... Processed ${i + 1} / ${rows.length} records (Migrated: ${summariesMigrated + memoriesMigrated}, Skipped: ${skipped})\r`);
        }
    }
    
    console.log(`\n=== MIGRATION COMPLETE ===`);
    console.log(`Migrated: ${summariesMigrated} summaries | ${memoriesMigrated} memories.`);
    console.log(`Skipped (already in DB): ${skipped}`);
    process.exit(0);
}

runRescue().catch(e => {
    console.error(e);
    process.exit(1);
});
