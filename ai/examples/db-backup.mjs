import { 
    Memory_DatabaseService, 
    Memory_LifecycleService, 
    Memory_ChromaManager 
} from '../services.mjs';

async function main() {
    console.log('💾 Starting Memory Core Backup...');

    // 1. Initialize Services
    console.log('   - Initializing Memory Core...');
    await Memory_ChromaManager.ready();

    // 2. Perform Export
    console.log('   - Exporting memories and summaries...');
    try {
        const result = await Memory_DatabaseService.exportDatabase({
            include: ['memories', 'summaries']
        });
        console.log(`   ✅ ${result.message}`);
    } catch (error) {
        console.error(`   ❌ Export failed: ${error.message}`);
        process.exit(1);
    }
    
    console.log('✅ Backup complete.');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
