import Neo                  from '../src/Neo.mjs';
import * as core            from '../src/core/_export.mjs';
import MC_Config            from '../ai/mcp/server/memory-core/config.mjs';
import MC_DatabaseService   from '../ai/mcp/server/memory-core/services/DatabaseService.mjs';
import MC_ChromaManager     from '../ai/mcp/server/memory-core/services/ChromaManager.mjs';
import MC_LifecycleService  from '../ai/mcp/server/memory-core/services/DatabaseLifecycleService.mjs';
import fs                   from 'fs';
import path                 from 'path';

const args = process.argv.slice(2);
const help = `
Usage: node buildScripts/migrateMemoryCore.mjs <backup-file.jsonl>

Arguments:
  <backup-file.jsonl>  Path to the JSONL backup file to import and re-embed.

Description:
  This script migrates a Memory Core database backup to the current embedding model 
  (gemini-embedding-001). It performs a destructive 'replace' import, clearing the 
  existing collection and re-generating embeddings for every record in the backup file.

      WARNING: This operation completely overwrites the target collection!
    
  Options:
    --test-mode          Use test collections (test-re-embed-*) instead of production DB.
  `;
  
  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
      console.log(help);
      process.exit(args.length >= 1 ? 0 : 1);
  }
  
  const backupFile = path.resolve(args[0]);
  
  if (!fs.existsSync(backupFile)) {
      console.error(`❌ Error: Backup file not found at: ${backupFile}`);
      process.exit(1);
  }
  
  if (args.includes('--test-mode')) {
      console.log('🧪 TEST MODE ENABLED: Using test collections.');
      MC_Config.data.memoryDb.collectionName = 'test-re-embed-memories';
      MC_Config.data.sessionDb.collectionName = 'test-re-embed-summaries';
  }
  
  async function migrate() {
      console.log('🚀 Starting Memory Core Migration...');    console.log(`📂 Input File: ${backupFile}`);
    console.log(`🤖 Target Model: ${MC_Config.embeddingModel}`);
    
    // Check for API Key
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ Error: GEMINI_API_KEY environment variable is not set.');
        console.error('   Re-embedding requires access to the Google Gemini API.');
        process.exit(1);
    }

    // Enable debug logging for visibility
    MC_Config.data.debug = true;

    try {
        console.log('⏳ Initializing Services...');
        await MC_LifecycleService.ready();
        await MC_ChromaManager.ready();
        await MC_DatabaseService.ready();
        console.log('✅ Services Ready.');

        console.log('🔄 Starting Import & Re-embedding Process...');
        console.log('   (This may take a while due to API rate limiting: 50 items/10s)');

        const result = await MC_DatabaseService.importDatabase({
            file: backupFile,
            mode: 'replace',
            reEmbed: true
        });

        console.log('✨ Migration Complete!');
        console.log('----------------------------------------');
        console.log(`📄 Total Documents: ${result.total}`);
        console.log(`📥 Imported:        ${result.imported}`);
        console.log(`⚙️  Mode:            ${result.mode}`);
        console.log('----------------------------------------');
        
        process.exit(0);

    } catch (e) {
        console.error('❌ Migration Failed:', e);
        process.exit(1);
    }
}

migrate();