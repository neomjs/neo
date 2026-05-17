// Neo namespace bootstrap (entry-point invariant) — orchestrator spawn-child.
// `InstanceManager` binds Neo.find/findFirst/get aliases + consumes pre-singleton
// `Neo.idMap`; required for any consumer of the Neo singleton API.
import Neo                          from '../../src/Neo.mjs';
import * as core                    from '../../src/core/_export.mjs';
import InstanceManager              from '../../src/manager/Instance.mjs';
import KB_Config                    from '../../ai/mcp/server/knowledge-base/config.mjs';
import KB_DatabaseService           from '../../ai/services/knowledge-base/DatabaseService.mjs';
import KB_ChromaManager             from '../../ai/services/knowledge-base/ChromaManager.mjs';
import KB_LifecycleService          from '../../ai/services/knowledge-base/DatabaseLifecycleService.mjs';
import {withHeavyMaintenanceLease}  from '../../ai/daemons/services/HeavyMaintenanceLeaseService.mjs';

/**
 * @module buildScripts/ai/syncKnowledgeBase
 */

async function syncKnowledgeBase() {
    // Enable debug logging to see progress
    KB_Config.data.debug = true;

    console.log('⏳ Initializing Knowledge Base Services...');

    // Lane C of #11503 — wrap the heavy-maintenance work in the shared lease so this
    // CLI cannot collide with the orchestrator's own kbSync task (which is the empirical
    // collision class today's wedge at 19:27Z exhibited) or with other manual heavy
    // scripts. The lease primitive lives in PR #11506 / #11505; Lane C is #11507.
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

                // Execute the full sync (create + embed)
                return KB_DatabaseService.syncDatabase();
            },
            {owner: 'kbSync', reason: 'manual-cli', metadata: {script: 'buildScripts/ai/syncKnowledgeBase.mjs'}}
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