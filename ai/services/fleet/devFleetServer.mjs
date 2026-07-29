/**
 * @module ai/services/fleet/devFleetServer
 * @summary Node-process entry that runs the dev-server (Option B) app↔fleet HTTP transport — the
 * companion process a developer starts alongside `npm run server-start` so the `apps/agentos` pane's
 * fleet controls go live in a plain browser, without the Electron shell (Option A, the product
 * target). It owns the Neo namespace bootstrap (so the `FleetControlBridge → FleetManager /
 * FleetRegistryService` singletons behind `startFleetBridgeServer` construct) + SIGTERM/SIGINT
 * clean-stop, and delegates all HTTP + routing to {@link startFleetBridgeServer}.
 *
 * **The launch contract (trust boundary, entry half).** Before serving, this entry:
 * 1. resolves the process bearer — `NEO_FLEET_BEARER` when canonically set (the coordinated-launch
 *    mode: the launcher holds the value in memory and hands the browser its half in-process; env is
 *    the in-memory channel, and a malformed value REFUSES startup rather than silently regenerating),
 *    else generates a fresh one. The bearer is never logged, persisted, or echoed by this process.
 * 2. resolves and BINDS the viewer — the stdio identity chain (`NEO_AGENT_IDENTITY` → gh CLI) must
 *    land on a seeded `AgentIdentity` graph node, or startup fails closed with a named remediation:
 *    every admitted request is stamped with this viewer, so serving without one is unattributable.
 * 3. on an occupied port, probes the incumbent through its authenticated `/fleet/probe`: reuse only
 *    on "same token, same viewer"; anything else exits with the probe's named refusal — an unknown,
 *    stale, or wrong-viewer process is never silently adopted.
 * 4. wires the mailbox-mirror source BEHIND the boundary: the adapter reads through the real
 *    `MailboxService.listMessages` under the per-request identity `RequestContextService` carries —
 *    admission is the Memory Core's decision, attributed to the transport-stamped viewer.
 *
 * Invocation: `node ai/services/fleet/devFleetServer.mjs` (or `npm run ai:fleet-server`). Loopback
 * only; the port is `NEO_FLEET_PORT` (default 8083) and must match the URL the App Worker's
 * `installFleetBridge` targets; the exact cockpit origins come from `NEO_FLEET_COCKPIT_ORIGIN`
 * (comma-separated, default `http://localhost:8080,http://127.0.0.1:8080`).
 *
 * @see ai/services/fleet/fleetBridgeServer.mjs
 * @see ai/services/fleet/fleetLaunchContract.mjs
 * @see src/ai/fleet/installFleetBridge.mjs (the App-Worker consumer)
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate globalThis.Neo so
// the fleet singletons' `Neo.setupClass` succeeds at module-load; `InstanceManager` binds the aliases.
import Neo                                                                from '../../../src/Neo.mjs';
import * as core                                                          from '../../../src/core/_export.mjs';
import InstanceManager                                                    from '../../../src/manager/Instance.mjs';
import AiConfig                                                           from '../../config.mjs';
import memoryCoreConfig                                                   from '../../mcp/server/memory-core/config.mjs';
import RequestContextService                                              from '../../mcp/server/shared/services/RequestContextService.mjs';
import FleetControlBridge                                                 from './FleetControlBridge.mjs';
import FleetManager                                                       from './FleetManager.mjs';
import {startFleetBridgeServer}                                           from './fleetBridgeServer.mjs';
import {probeExistingFleetServer, resolveFleetBearer, resolveFleetViewer} from './fleetLaunchContract.mjs';
import {readActiveWakeSubscriptionIdentities}                             from './readActiveWakeSubscriptionIdentities.mjs';
import {wireBootIdentityReadSource}                                       from './wireBootIdentityReadSource.mjs';
import {wireFleetActivityReadSource}                                      from './wireFleetActivityReadSource.mjs';
import {wireFleetCatchUpSource}                                           from './wireFleetCatchUpSource.mjs';
import {wireOperatorComposeWriter}                                        from './wireOperatorComposeWriter.mjs';
import path                                                               from 'node:path';
import {fileURLToPath, pathToFileURL}                                     from 'node:url';

const port = Number(process.env.NEO_FLEET_PORT) || 8083;

/**
 * @summary Composes the launch contract and starts the authenticated Fleet transport.
 * @returns {Promise<void>}
 * @private
 */
async function boot() {
    const bearerToken = resolveFleetBearer({suppliedToken: process.env.NEO_FLEET_BEARER}),
          viewer      = await resolveFleetViewer(),
          origins     = (process.env.NEO_FLEET_COCKPIT_ORIGIN || 'http://localhost:8080,http://127.0.0.1:8080')
              .split(',').map(origin => origin.trim()).filter(Boolean);

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
        deliveryFailureFilePath         : path.join(memoryCoreConfig.wakeDaemon.dataDir, 'wake-delivery-failures.json'),
        listActiveSubscriptionIdentities: readActiveWakeSubscriptionIdentities
    };

    // Wire the composed activitySource onto FleetControlBridge. The memory-core mailbox + graph
    // singletons are imported lazily at this boot use site (mirroring readActiveWakeSubscriptionIdentities's
    // lazy GraphService) and INJECTED — the composer's slot readers never import a singleton, so the
    // mailbox identity/permission binding stays here. issuesDir + pullsDir are the synced content trees;
    // the pulls reader fills the composer's last honest-empty slot so the PR/lane slot emits pr-activity
    // events (opens/reviews/merges) alongside issues + lane-claims + stall. Fail-soft: an unavailable
    // singleton leaves activitySource unwired.
    Promise.all([
        import('../memory-core/MailboxService.mjs'),
        import('../memory-core/GraphService.mjs')
    ]).then(([{default: MailboxService}, {default: GraphService}]) => {
        wireFleetActivityReadSource({
            issuesDir   : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../resources/content/issues'),
            pullsDir    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../resources/content/pulls'),
            listMessages: MailboxService.listMessages.bind(MailboxService),
            graphService: GraphService
        });

        // The write-side sibling: the composeOperatorMessage verb's writer. Same lazy-singleton
        // boundary discipline — the bound addMessage resolves the author + principal class from
        // the request context the authenticated ingress stamped; the seam carries payload, never
        // identity. Fail-soft: an unavailable singleton leaves the compose seam honestly unwired.
        wireOperatorComposeWriter({
            addMessage: MailboxService.addMessage.bind(MailboxService)
        })
    }).catch(error => console.warn('[fleet] activity source not wired:', error?.message ?? error));

    // The mailbox mirror goes live ONLY behind the boundary: the adapter + MailboxService load
    // lazily (the established cross-process read pattern — pay the memory-core import when a pane
    // actually asks), and the bound identity resolves PER REQUEST from the context the transport
    // stamped — the composer never receives, trusts, or forwards a caller-supplied viewer.
    // The whoami bootstrap seam: the SAME per-request binding the mirror source reads — the
    // ingress stamps the viewer, this exposes it as the identity the cockpit passes back
    // explicitly as the mirror's subject (the anti-fork contract's missing first leg).
    FleetControlBridge.viewerIdentitySource = {
        resolveViewerIdentity: () => RequestContextService.getAgentIdentityNodeId()
    };

    // The S3 catch-up source stays behind the authenticated ingress. Its two calls reuse the exact
    // Memory Core registered operations (schema validation, source ownership, recorder, and
    // notAuthority envelopes included) through a lazy import; no MCP code crosses into the Body.
    // The closure holds zero result cache. The source instance holds only per-viewer runtime anchors,
    // so a cockpit reload preserves them while this process lives and a service restart resets them.
    const callHistoryOperation = async (name, args) => {
        const {callTool} = await import('../../mcp/server/memory-core/toolService.mjs');

        return callTool(name, args)
    };

    wireFleetCatchUpSource({
        exploreMemoryHistory     : args => callHistoryOperation('explore_memory_history', args),
        explorePullRequestHistory: args => callHistoryOperation('explore_pull_request_history', args),
        resolveViewerIdentity    : () => RequestContextService.getAgentIdentityNodeId()
    });

    FleetControlBridge.mailboxMirrorSource = {
        async readMailboxMirror(params = {}) {
            const [{readFleetMailboxMirror}, {default: MailboxService}] = await Promise.all([
                import('./fleetMailboxMirrorAdapter.mjs'),
                import('../memory-core/MailboxService.mjs')
            ]);

            return readFleetMailboxMirror({
                mailboxService      : MailboxService,
                resolveBoundIdentity: () => RequestContextService.getAgentIdentityNodeId(),
                ...params
            })
        }
    };

    try {
        const server = await startFleetBridgeServer({
            port,
            bearerToken,
            viewerContext : viewer,
            allowedOrigins: origins,
            runInContext  : (context, fn) => RequestContextService.run(context, fn)
        });

        const cleanShutdown = signal => {
            console.log(`[fleet] received ${signal}; stopping.`);
            server.close(() => process.exit(0))
        };

        process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
        process.on('SIGINT',  () => cleanShutdown('SIGINT'));

        // Identity facts only — the bearer is deliberately absent from every log line this
        // process emits; the launcher that supplied (or will inject) it owns the hand-off.
        console.log(`[fleet] authenticated app<->fleet transport listening on http://127.0.0.1:${server.address().port}/fleet (viewer: ${viewer.agentIdentityNodeId}, bearer: ${process.env.NEO_FLEET_BEARER ? 'supplied' : 'generated'})`)
    } catch (error) {
        if (error?.code !== 'EADDRINUSE') throw error;

        // Occupied port: reuse-or-refuse through the incumbent's authenticated probe — never
        // silent adoption of a process we cannot verify.
        const probe = await probeExistingFleetServer({
            probeUrl           : `http://127.0.0.1:${port}/fleet/probe`,
            bearerToken,
            agentIdentityNodeId: viewer.agentIdentityNodeId
        });

        if (probe.reusable) {
            console.log(`[fleet] healthy Fleet already listening on port ${port} (${probe.reason}; viewer: ${probe.viewer}, pid: ${probe.pid}) — reusing it.`);
            process.exit(0)
        }

        console.error(`[fleet] port ${port} is occupied and NOT reusable: ${probe.reason}`);
        process.exit(1)
    }
}

// Process-entry only: start + register signal handlers ONLY when this file is the main module, never
// on import — preserves the process-entry isolation invariant (mirrors the orchestrator/kb daemons).
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    boot().catch(error => {
        console.error('[fleet] dev server failed to start:', error.message);
        process.exit(1)
    })
}
