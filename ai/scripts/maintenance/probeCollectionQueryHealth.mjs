/**
 * @plane in-plane
 */
import 'dotenv/config';

import {
    Memory_StorageRouter    as StorageRouter,
    Memory_GraphService     as GraphService,
    Memory_LifecycleService as LifecycleService
} from '../../services.mjs';

/**
 * @summary On-demand probe of each Memory Core collection's vector-query (HNSW) path.
 *
 * Thin operator entrypoint over {@link Neo.ai.services.memory-core.managers.StorageRouter#probeCollectionQueryHealth}.
 * This lives in a script — NOT the healthcheck payload and NOT an MCP tool — because a per-collection
 * `query()` probe (plus its response-schema bytes) would tax every always-on `is-it-healthy?` poll and
 * load into every agent's context unconditionally. A populated-but-corrupt collection passes `count()`
 * but throws on `query()`; run this when an operator suspects such a desynced-HNSW collection.
 *
 * Exit code: 0 = all collections queryable, 1 = at least one degraded, 2 = the probe itself failed.
 *
 * @module ai/scripts/maintenance/probeCollectionQueryHealth
 */
async function main() {
    await LifecycleService.ready();
    await GraphService.ready();
    await StorageRouter.ready();

    const result = await StorageRouter.probeCollectionQueryHealth();

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'healthy' ? 0 : 1);
}

main().catch(err => {
    console.error('[probeCollectionQueryHealth] probe failed:', err.stack);
    process.exit(2);
});
