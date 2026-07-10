/**
 * @module ai/daemons/temporal-summary/daemon
 * @summary Thin Node-process boot wrapper for the temporal-pyramid aggregation daemon.
 *
 * Owns Neo namespace bootstrap + SIGTERM / SIGINT clean-stop signal handling +
 * `TemporalSummaryAggregationService.start()` invocation. The class definition (the lease-aware
 * poll loop, bounded daily-window planning, the six velocity source fetches, and the unified +
 * per-agent partition writes) lives in
 * `ai/daemons/temporal-summary/TemporalSummaryAggregationService.mjs`.
 *
 * This split matches the canonical Orchestrator class+wrapper pattern: class files in
 * `ai/daemons/` never import Neo; entry-point scripts own the Neo + core/_export +
 * InstanceManager bootstrap chain.
 *
 * The service takes `enabled` / `pollIntervalMs` as required injected arguments and fails loud
 * without them — it carries no config defaults of its own. This entry point is the config-aware
 * boundary that resolves them from the SSOT at the use site.
 *
 * Persistent-process invocation: launchd / systemd should target this script
 * (`node ai/daemons/temporal-summary/daemon.mjs`), or `npm run ai:temporal-summary`. The daemon is
 * opt-in — it exits early unless `AiConfig.temporalSummary.aggregationEnabled` is true.
 *
 * @see ai/daemons/temporal-summary/TemporalSummaryAggregationService.mjs
 * @see ai/daemons/kb-gc/daemon.mjs (sibling wrapper precedent)
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so any module using `Neo.setupClass()` at module-load succeeds.
// `InstanceManager` binds `Neo.find` / `Neo.get` aliases.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import AiConfig                          from '../../config.mjs';
import logger                            from '../../mcp/server/memory-core/logger.mjs';
import TemporalSummaryAggregationService from './TemporalSummaryAggregationService.mjs';
import {assertConfigFresh}               from '../../scripts/setup/initServerConfigs.mjs';
import {fileURLToPath, pathToFileURL}    from 'node:url';

const cleanShutdown = signal => {
    logger.info(`[TemporalSummaryAggregationService] Received ${signal}; stopping.`);
    TemporalSummaryAggregationService.stop();
    process.exit(0);
};

// Process-entry only: register signal handlers + run the stale-overlay boot guard + start the
// service ONLY when this daemon is the main module, never on import — preserves the process-entry
// isolation invariant (mirrors the kb-gc + orchestrator daemons).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
    process.on('SIGINT',  () => cleanShutdown('SIGINT'));

    const {findings} = AiConfig.validateRequiredEnv({entrypoint: 'temporal-summary-daemon'});
    assertConfigFresh({
        requiredFindings: findings,
        serverPath      : fileURLToPath(new URL('../../mcp/server/memory-core/', import.meta.url))
    })
        .then(() => TemporalSummaryAggregationService.start({
            enabled       : AiConfig.temporalSummary.aggregationEnabled,
            pollIntervalMs: AiConfig.temporalSummary.aggregationIntervalMs
        }))
        .catch(err => {
            logger.error('[TemporalSummaryAggregationService] Daemon start failed:', err);
            process.exit(1);
        });
}
