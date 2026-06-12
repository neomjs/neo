// Neo namespace bootstrap (entry-point invariant) — orchestrator spawn-child.
// `InstanceManager` binds Neo.find/findFirst/get aliases + consumes pre-singleton
// `Neo.idMap`; required for any consumer of the Neo singleton API.
import Neo                          from '../../../src/Neo.mjs';
import * as core                    from '../../../src/core/_export.mjs';
import InstanceManager              from '../../../src/manager/Instance.mjs';
import KB_Config                    from '../../mcp/server/knowledge-base/config.mjs';
import KB_DatabaseService           from '../../services/knowledge-base/DatabaseService.mjs';
import KB_ChromaManager             from '../../services/knowledge-base/ChromaManager.mjs';
import KB_LifecycleService          from '../../services/knowledge-base/DatabaseLifecycleService.mjs';
import {withHeavyMaintenanceLease}  from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';

/**
 * @module ai/scripts/maintenance/syncKnowledgeBase
 */

async function syncKnowledgeBase() {
    // Enable debug logging to see progress. B4-safe activation: drive NEO_DEBUG via the Provider
    // override API, never mutate the read-only reactive Provider.
    KB_Config.setEnvOverride('NEO_DEBUG', true);
    const staleStrategy   = process.env.NEO_KB_STALE_STRATEGY || undefined;

    console.log('⏳ Initializing Knowledge Base Services...');
    if (staleStrategy) {
        console.log(`   Using explicit stale strategy: ${staleStrategy}`);
    }

    // Run the full sync under the shared heavy-maintenance lease so this CLI cannot
    // collide with the orchestrator's own kbSync task or with other manual graph-heavy
    // scripts.
    let outcome;
    try {
        outcome = await withHeavyMaintenanceLease(
            async () => {
                console.log('   Waiting for Lifecycle Service...');
                await KB_LifecycleService.ready();
                console.log('   Lifecycle Service Ready. Database should be running.');

                console.log('   Waiting for Chroma Manager...');
                await KB_ChromaManager.ready();
                console.log('   Chroma Manager Ready.');

                console.log('   Waiting for Database Service...');
                await KB_DatabaseService.ready();
                console.log('   Database Service Ready.');

                console.log('✅ Services Ready. Starting Synchronization...');

                // Execute the full sync (create + embed). `NEO_KB_STALE_STRATEGY=shadow-swap`
                // opts into the shadow-swap stale-data strategy; default CLI sync remains unchanged.
                return KB_DatabaseService.syncDatabase({staleStrategy});
            },
            {owner: 'kbSync', reason: 'manual-cli', metadata: {script: 'ai/scripts/maintenance/syncKnowledgeBase.mjs'}}
        );
    } catch (e) {
        console.error('❌ Synchronization Failed:', e);
        process.exit(1);
    }

    if (outcome.status === 'held') {
        const held = outcome.lease;
        console.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
        console.log('   This script will not run while another heavy-maintenance task is active. Re-invoke once the active owner completes.');
        process.exit(0);
    }

    console.log('✅ Synchronization Complete:', outcome.result);
    process.exit(0);
}

syncKnowledgeBase();
