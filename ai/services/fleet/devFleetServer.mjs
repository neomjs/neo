/**
 * @module ai/services/fleet/devFleetServer
 * @summary Node-process entry that runs the dev-server (Option B) app↔fleet HTTP transport — the
 * companion process a developer starts alongside `npm run server-start` so the `apps/agentos` pane's
 * fleet controls go live in a plain browser, without the Electron shell (Option A, the product
 * target). It owns the Neo namespace bootstrap (so the `FleetControlBridge → FleetManager /
 * FleetRegistryService` singletons behind `startFleetBridgeServer` construct) + SIGTERM/SIGINT
 * clean-stop, and delegates all HTTP + routing to {@link startFleetBridgeServer}.
 *
 * Invocation: `node ai/services/fleet/devFleetServer.mjs` (or `npm run ai:fleet-server`). Loopback
 * only; the port is `NEO_FLEET_PORT` (default 8083) and must match the URL the App Worker's
 * `installFleetBridge` targets.
 *
 * @see ai/services/fleet/fleetBridgeServer.mjs
 * @see src/ai/fleet/installFleetBridge.mjs (the App-Worker consumer)
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate globalThis.Neo so
// the fleet singletons' `Neo.setupClass` succeeds at module-load; `InstanceManager` binds the aliases.
import Neo                      from '../../../src/Neo.mjs';
import * as core                from '../../../src/core/_export.mjs';
import InstanceManager          from '../../../src/manager/Instance.mjs';
import {startFleetBridgeServer} from './fleetBridgeServer.mjs';
import {pathToFileURL}          from 'node:url';

const port = Number(process.env.NEO_FLEET_PORT) || 8083;

// Process-entry only: start + register signal handlers ONLY when this file is the main module, never
// on import — preserves the process-entry isolation invariant (mirrors the orchestrator/kb daemons).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startFleetBridgeServer({port})
        .then(server => {
            const cleanShutdown = signal => {
                console.log(`[fleet] received ${signal}; stopping.`);
                server.close(() => process.exit(0))
            };

            process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
            process.on('SIGINT',  () => cleanShutdown('SIGINT'));

            console.log(`[fleet] dev app<->fleet HTTP transport listening on http://127.0.0.1:${server.address().port}/fleet`)
        })
        .catch(error => {
            console.error('[fleet] dev server failed to start:', error);
            process.exit(1)
        })
}
