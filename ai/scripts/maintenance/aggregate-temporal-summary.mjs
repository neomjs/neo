/**
 * @module ai/scripts/maintenance/aggregate-temporal-summary
 * @summary One-shot child entry for the temporal-pyramid L1/L2 durable aggregation lane.
 *
 * The Orchestrator owns cadence + the shared heavy-maintenance lease and spawns this as a supervised
 * `supervised-child-process` task per due tick (the landed heavy-maintenance pattern) — it runs exactly one
 * `runCycle()` and exits. This is NOT a poll loop or an independent scheduler: it holds no timer and never
 * self-reschedules, so there is no second scheduler beside the orchestrator. Opt-in: it exits 0 without work
 * unless `AiConfig.temporalSummary.aggregationEnabled` is true.
 *
 * @see ai/daemons/temporal-summary/TemporalSummaryAggregationService.mjs — the aggregation cycle this drives.
 * @see ai/daemons/orchestrator/taskDefinitions.mjs — the supervised-child task definition that spawns this.
 * @plane in-plane
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate `globalThis.Neo` so the
// service class's `Neo.setupClass()` at module-load succeeds; `InstanceManager` binds `Neo.find` / `Neo.get`.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import AiConfig                              from '../../config.mjs';
import logger                                from '../../mcp/server/memory-core/logger.mjs';
import TemporalSummaryAggregationService     from '../../daemons/temporal-summary/TemporalSummaryAggregationService.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import {assertConfigFresh}                   from '../setup/initServerConfigs.mjs';
import {fileURLToPath, pathToFileURL}        from 'node:url';

/**
 * @summary Runs one temporal-pyramid aggregation cycle and exits. Opt-in gated; runs the stale-overlay boot
 * guard before touching the store so a divergent `config.mjs` fails loud rather than aggregating against it.
 * @returns {Promise<void>}
 */
async function main() {
    if (!AiConfig.temporalSummary.aggregationEnabled) {
        logger.info('[temporal-summary] Disabled (aggregationEnabled=false); nothing to aggregate.');
        process.exit(0);
    }

    const {findings} = AiConfig.validateRequiredEnv({entrypoint: 'temporal-summary-aggregate'});

    await assertConfigFresh({
        requiredFindings: findings,
        serverPath      : fileURLToPath(new URL('../../mcp/server/memory-core/', import.meta.url))
    });

    // gate the graph store ready before the first SUMMARY_* node write (runCycle → persistTemporalRecord →
    // GraphService.upsertNode). Base forbids awaiting initAsync() externally (it double-inits — Base.mjs:601);
    // ready() awaits the framework-triggered init exactly once.
    await GraphService.ready();

    await TemporalSummaryAggregationService.runCycle();
    process.exit(0)
}

// Process-entry only: run one cycle when this is the main module, never on import — preserves the
// process-entry isolation invariant (mirrors the sibling maintenance one-shots).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(err => {
        logger.error('[temporal-summary] Aggregation cycle failed:', err);
        process.exit(1)
    })
}
