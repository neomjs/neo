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
import Neo                                    from '../../../src/Neo.mjs';
import * as core                              from '../../../src/core/_export.mjs';
import InstanceManager                        from '../../../src/manager/Instance.mjs';
import AiConfig                               from '../../config.mjs';
import memoryCoreConfig                       from '../../mcp/server/memory-core/config.mjs';
import FleetManager                           from './FleetManager.mjs';
import {startFleetBridgeServer}               from './fleetBridgeServer.mjs';
import {readActiveWakeSubscriptionIdentities} from './readActiveWakeSubscriptionIdentities.mjs';
import {wireBootIdentityReadSource}           from './wireBootIdentityReadSource.mjs';
import {wireFleetActivityReadSource}          from './wireFleetActivityReadSource.mjs';
import path                                   from 'node:path';
import {fileURLToPath, pathToFileURL}         from 'node:url';

const port = Number(process.env.NEO_FLEET_PORT) || 8083;

// Process-entry only: start + register signal handlers ONLY when this file is the main module, never
// on import — preserves the process-entry isolation invariant (mirrors the orchestrator/kb daemons).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    // Wire the cross-process boot-identity reader BEFORE serving: getBootIdentity() then serves the
    // orchestrator's advisory fact from the shared runtime-state dir (read at this use site), instead of
    // the advisory-unknown fallback. Fail-soft — an absent dir leaves the seam honestly unwired.
    wireBootIdentityReadSource({dir: AiConfig.orchestrator.dataDir});

    // Wire the wake-telltale producer sources (the S2 axis): the config-resolved daemon PID path +
    // the trusted bulk subscription scan. This entrypoint is where config resolution belongs; the
    // adapter itself never resolves it. Fail-soft by construction — a failing scan or an absent
    // daemon degrades to honest per-row `unknown` inside the adapter, never a fabricated state.
    //
    // The `wakeDaemon` subtree is owned by the memory-core config, NOT Tier-1 `AiConfig` (which
    // carries only the flat `wakeDaemonHeartbeatAlivePath` leaf) — so the daemon's own authority
    // (`ai/daemons/wake/daemon.mjs`) is the one to mirror here.
    FleetManager.wakeStateOptions = {
        pidFilePath                     : path.join(memoryCoreConfig.wakeDaemon.dataDir, 'wake-daemon.pid'),
        listActiveSubscriptionIdentities: readActiveWakeSubscriptionIdentities
    };

    // Wire the composed activitySource onto FleetControlBridge. The memory-core mailbox + graph
    // singletons are imported lazily at this boot use site (mirroring readActiveWakeSubscriptionIdentities's
    // lazy GraphService) and INJECTED — the composer's slot readers never import a singleton, so the
    // mailbox identity/permission binding stays here. issuesDir is the synced content tree; readPrs is
    // omitted in v1 (no synced-`pulls` reader yet — the feed carries issues + lane-claims + stall), which
    // is honest-empty, not a stub. Fail-soft: an unavailable singleton leaves activitySource unwired.
    Promise.all([
        import('../memory-core/MailboxService.mjs'),
        import('../memory-core/GraphService.mjs')
    ]).then(([{default: MailboxService}, {default: GraphService}]) => {
        wireFleetActivityReadSource({
            issuesDir   : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../resources/content/issues'),
            listMessages: MailboxService.listMessages.bind(MailboxService),
            graphService: GraphService
        })
    }).catch(error => console.warn('[fleet] activity source not wired:', error?.message ?? error));

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
