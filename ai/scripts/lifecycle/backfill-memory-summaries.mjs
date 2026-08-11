#!/usr/bin/env node
/**
 * @summary Lifecycle child that backfills `AGENT_MEMORY.miniSummary` in bounded batches.
 *
 * The Orchestrator schedules this as a supervised child process, mirroring
 * `summarize-sessions.mjs`. The business logic remains in `MemoryService` so this entry point is
 * a thin bootstrap + observability wrapper and can also be run manually for recovery.
 *
 * Exit codes:
 *  - 0: batch completed (including successful no-op or fail-soft deferred rows)
 *  - 1: lifecycle or storage failure prevented the batch from running
 *
 * @see ai/services/memory-core/MemoryService.backfillMiniSummaries
 * @see ai/scripts/lifecycle/summarize-sessions.mjs
 * @plane in-plane
 */
import Neo       from '../../../src/Neo.mjs';
import AiConfig  from '../../config.mjs';
import * as core from '../../../src/core/_export.mjs';
import {
    resolveHeavyMaintenanceLeasePath,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import LifecycleService from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import MemoryService    from '../../services/memory-core/MemoryService.mjs';

async function main() {
    const outcome = await withHeavyMaintenanceLease(
        async () => {
            await LifecycleService.ready();
            return MemoryService.backfillMiniSummaries();
        },
        {
            leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: AiConfig.orchestrator.dataDir}),
            owner       : 'memory-summary-backfill',
            reason      : 'manual-cli',
            staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
            metadata    : {script: 'ai/scripts/lifecycle/backfill-memory-summaries.mjs'}
        }
    );

    if (outcome.status === 'held') {
        const held = outcome.lease;
        console.log(JSON.stringify({
            success : true,
            deferred: true,
            reason  : 'heavy-maintenance-lease-held',
            holder  : held ? {
                owner     : held.owner,
                reason    : held.reason,
                pid       : held.pid,
                acquiredAt: held.acquiredAt
            } : null
        }));
        process.exit(0)
    }

    console.log(JSON.stringify({success: true, ...(outcome.result || {})}));
    process.exit(0)
}

main().catch(error => {
    console.error('backfill-memory-summaries failed:', error.message);
    process.exit(1)
});
