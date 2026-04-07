import Neo              from '../../src/Neo.mjs';
import * as core        from '../../src/core/_export.mjs';
import InstanceManager  from '../../src/manager/Instance.mjs';
import LifecycleService from '../../ai/mcp/server/memory-core/services/DatabaseLifecycleService.mjs';
import DatabaseService  from '../../ai/mcp/server/memory-core/services/DatabaseService.mjs';

async function exportBackup() {
    try {
        console.log('⏳ Waiting for generic database lifecycle to become ready...');
        await LifecycleService.ready();

        console.log('📦 Triggering SQLite export...');
        const result = await DatabaseService.manageDatabaseBackup({ action: 'export' });
        
        console.log('✅ Export successful:');
        console.log(result);
        process.exit(0);
    } catch (e) {
        console.error('❌ Export failed:', e);
        process.exit(1);
    }
}

exportBackup();
