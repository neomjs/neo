/**
 * @module ai/scripts/swarm-heartbeat-daemon
 * @summary Thin Node-process boot wrapper for the swarm heartbeat daemon (#11058).
 *
 * Owns Neo namespace bootstrap + SIGTERM / SIGINT clean-stop signal handling +
 * `SwarmHeartbeatService.start()` invocation. The class definition (poll loop,
 * pulse(), unread-count queries, etc.) lives in `ai/daemons/SwarmHeartbeatService.mjs`.
 *
 * This split matches the canonical Orchestrator class+wrapper pattern established by
 * #11041 / #11044 / #11049 (PR #11054): class files in `ai/daemons/` never import Neo,
 * entry-point scripts in `ai/scripts/` own the Neo + core/_export + InstanceManager
 * bootstrap chain.
 *
 * Persistent-process invocation: launchd / systemd should target this script
 * (`node ai/scripts/swarm-heartbeat-daemon.mjs`). See
 * `learn/agentos/wake-substrate/PersistentProcessManagement.md` for installation paths.
 *
 * @see ai/daemons/SwarmHeartbeatService.mjs
 * @see ai/scripts/orchestrator-daemon.mjs (sibling wrapper precedent)
 * @see #11058 (this split), #11049 (entry-point-only invariant)
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so any module using `Neo.gatekeep()` / `Neo.setupClass()` at
// module-load (e.g. `src/core/Compare.mjs`, transitively pulled via Base /
// LifecycleService / GraphService) succeeds. Without this prelude the script crashes
// with `ReferenceError: Neo is not defined`. `InstanceManager` binds `Neo.find` /
// `Neo.findFirst` / `Neo.get` aliases and consumes pre-singleton `Neo.idMap`.
import Neo             from '../../src/Neo.mjs';
import * as core       from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';

import logger                from '../mcp/server/memory-core/logger.mjs';
import SwarmHeartbeatService from '../daemons/SwarmHeartbeatService.mjs';

const cleanShutdown = signal => {
    logger.info(`[SwarmHeartbeatService] Received ${signal}; stopping.`);
    SwarmHeartbeatService.stop();
    process.exit(0);
};

process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
process.on('SIGINT',  () => cleanShutdown('SIGINT'));

SwarmHeartbeatService.start().catch(err => {
    logger.error('[SwarmHeartbeatService] Daemon start failed:', err);
    process.exit(1);
});
