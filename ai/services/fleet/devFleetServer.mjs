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
 * 2. resolves and BINDS the viewer — the stdio identity chain (`NEO_AGENT_IDENTITY` → gh CLI)
 *    produces the claim; its VERIFICATION authority depends on the mailbox-seam plane (step 5):
 *    in-process mode verifies against a seeded host `AgentIdentity` graph node, while plane mode
 *    verifies plane-side (the client's `list_permissions` proof binds the bearer's server-resolved
 *    subject to the claim) and deliberately never opens host Memory Core — a missing or stale host
 *    graph cannot veto a healthy configured plane. Either way startup fails closed with a named
 *    remediation: every admitted request is stamped with this viewer.
 * 3. on an occupied port, probes the incumbent through its authenticated `/fleet/probe`: reuse only
 *    on "same token, same viewer"; anything else exits with the probe's named refusal — an unknown,
 *    stale, or wrong-viewer process is never silently adopted.
 * 4. wires the mailbox-mirror source BEHIND the boundary: the adapter reads through the real
 *    `MailboxService.listMessages` under the per-request identity `RequestContextService` carries —
 *    admission is the Memory Core's decision, attributed to the transport-stamped viewer.
 * 5. decides the mailbox-seam plane ONCE: a configured `fleet.planeBase` binds the
 *    mailbox, compose, and catch-up seams to the containerized plane through an identity-verified
 *    MCP client — the bearer's plane-side subject must BE the boot-resolved viewer, else startup
 *    refuses plane mode fail-closed; an empty base keeps the in-process singletons. All-or-nothing
 *    per boot, logged either way — the operator can always trust which plane the cockpit shows.
 *
 * Invocation: `node ai/services/fleet/devFleetServer.mjs` (or `npm run ai:fleet-server`). Loopback
 * only; the port is `NEO_FLEET_PORT` (default 8083) and must match the URL the App Worker's
 * `installFleetBridge` targets; the exact cockpit origins come from `NEO_FLEET_COCKPIT_ORIGIN`
 * (comma-separated, default `http://localhost:8080,http://127.0.0.1:8080`).
 *
 * @see ai/services/fleet/fleetBridgeServer.mjs
 * @see ai/services/fleet/fleetLaunchContract.mjs
 * @see apps/agentos/fleet/installFleetBridge.mjs (the App-Worker consumer)
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate globalThis.Neo so
// the fleet singletons' `Neo.setupClass` succeeds at module-load; `InstanceManager` binds the aliases.
import Neo                      from '../../../src/Neo.mjs';
import * as core                from '../../../src/core/_export.mjs';
import InstanceManager          from '../../../src/manager/Instance.mjs';
import AiConfig                 from '../../config.mjs';
import memoryCoreConfig         from '../../mcp/server/memory-core/config.mjs';
import RequestContextService    from '../../mcp/server/shared/services/RequestContextService.mjs';
import FleetControlBridge       from './FleetControlBridge.mjs';
import FleetManager             from './FleetManager.mjs';
import {startFleetBridgeServer} from './fleetBridgeServer.mjs';
import {probeExistingFleetServer, resolveFleetBearer, resolveFleetViewer,
        resolveFleetViewerClaim}                                          from './fleetLaunchContract.mjs';
import {assertFleetPlaneAdmissionBearerClass}                            from './fleetServer.mjs';
import {createPlaneMailboxClient}                                        from './planeMailboxClient.mjs';
import {createPlaneWakeIdentitiesReader}                                 from './planeWakeIdentitiesReader.mjs';
import {createFleetWakeSseConsumer}                                      from './fleetWakeSseConsumer.mjs';
import {createPlaneWhoIsOnlineReader}                                    from './planeWhoIsOnlineReader.mjs';
import {readActiveWakeSubscriptionIdentities}                            from '../memory-core/readActiveWakeSubscriptionIdentities.mjs';
import {createTerminalDeliveryFailuresFileReader, resolveDaemonLiveness} from './fleetWakeStateAdapter.mjs';
import {wireBootIdentityReadSource}                                      from './wireBootIdentityReadSource.mjs';
import {wireFleetActivityReadSource}                                     from './wireFleetActivityReadSource.mjs';
import {wireFleetCatchUpSource}                                          from './wireFleetCatchUpSource.mjs';
import {wireFleetMemoriesSource}                                         from './wireFleetMemoriesSource.mjs';
import {wireFleetWakeRoutesSource}                                       from './wireFleetWakeRoutesSource.mjs';
import {wireOperatorComposeWriter}                                       from './wireOperatorComposeWriter.mjs';
import path                                                              from 'node:path';
import {fileURLToPath, pathToFileURL}                                    from 'node:url';

/**
 * @summary Composes the launch contract and starts the authenticated Fleet transport.
 * @returns {Promise<void>}
 * @private
 */
async function boot() {
    // Resolved HERE, at the use site, not captured at module scope: an overlay applied after
    // import must still be honoured. `cockpitOrigins` is csv-typed, so the split/trim the caller
    // used to do belongs to the leaf machinery instead.
    const port        = AiConfig.fleet.port,
          bearerToken = resolveFleetBearer({suppliedToken: AiConfig.fleet.bearer}),
          origins     = AiConfig.fleet.cockpitOrigins;

    // The mailbox-seam plane decision: resolved ONCE at boot, BEFORE viewer binding, all-or-nothing,
    // logged. The leaves resolve here at the use site (the AiConfig SSOT contract); the client itself
    // reads no config. The decision also selects the viewer's VERIFICATION AUTHORITY:
    //  - plane mode: the graphless identity claim (env/gh chain only) is verified by the PLANE —
    //    the client's init proves the bearer's server-resolved subject IS the claim. Host Memory
    //    Core is never opened, so a missing/stale host graph cannot veto a healthy plane. Fail-closed:
    //    a bearer resolving to any OTHER subject would silently re-attribute every admission
    //    decision — refusal is the only honest outcome.
    //  - in-process mode: the existing host-graph verification (seeded AgentIdentity node).
    const planeBase   = AiConfig.fleet.planeBase.trim(),
          planeClient = planeBase ? createPlaneMailboxClient({
              baseUrl   : `${planeBase.replace(/\/+$/, '')}/mc/mcp`,
              credential: AiConfig.fleet.planeBearer
          }) : null;

    let
        fleetWakeStreamConsumer = null,
        viewer;

    if (planeClient) {
        viewer = await resolveFleetViewerClaim();

        const admission = await planeClient.init({expectedIdentity: viewer.agentIdentityNodeId});

        if (!admission.ok) {
            console.error(`[fleet] plane mode refused (${planeBase}): ${admission.reason} — fix fleet.planeBase / fleet.planeBearer, or empty the base for in-process mode.`);
            process.exit(1)
        }

        // The boot witness: name the verification authority explicitly so a capture/log always
        // shows WHICH plane verified this viewer (and that the host graph was not consulted).
        console.log(`[fleet] mailbox/compose/catch-up seams bound to the containerized plane at ${planeBase} (viewer ${admission.identity} verified plane-side; host graph not consulted)`)
    } else {
        viewer = await resolveFleetViewer();

        console.log('[fleet] fleet.planeBase is empty — mailbox/compose/catch-up seams stay in-process (host plane; viewer verified against the host graph).')
    }

    // From here on, EVERY exit — wiring throws included — closes the proven plane session awaited:
    // the try below spans the whole post-admission life (wiring + serve + occupied-port handling),
    // so the ALL-exits close guarantee is structural, not prose.
    try {

    // Wire the cross-process boot-identity reader BEFORE serving: getBootIdentity() then serves the
    // orchestrator's advisory fact from the shared runtime-state dir (read at this use site), instead of
    // the advisory-unknown fallback. Fail-soft — an absent dir leaves the seam honestly unwired.
    wireBootIdentityReadSource({dir: AiConfig.orchestrator.dataDir});

    // Wire the wake-telltale producer sources (the S2 axis). This entrypoint is where config
    // resolution belongs; the adapter itself never resolves it. Fail-soft by construction — a
    // failing scan or an absent source degrades to honest per-row `unknown` inside the adapter,
    // never a fabricated state.
    //
    // The axes follow the mailbox-seam plane decision: truth that moved with the hard cut is read
    // where it now lives. In-process mode keeps the host truths (local daemon PID file + host
    // graph scan). Plane mode reads subscription intent from the containerized plane through the
    // proven client — the host graph holds only pre-cut relic rows there, and the retired local
    // daemon's absent PID file would read as OBSERVED not-running, fabricating `suppressed` for
    // every genuinely subscribed seat. The delivery axes stay honestly `unknown` in plane mode
    // until the plane exposes a vouching surface: delivery runs container-side and behind the
    // signed host receiver, and neither is observable from this process today.
    if (planeClient) {
        // The plane NOW exposes the vouching surface this branch was honestly waiting for: the
        // composed fleet-server's `/fleet/events` stream. This process consumes it with the
        // fleet-client PLANE-ADMISSION bearer — its own mint, class-checked at resolution: the
        // plane-MCP credential must never dial the fleet surface, and an ALIASED declaration
        // refuses the boot loudly right here (the structural close below still runs). An EMPTY
        // declaration arms nothing: the axis renders the honest reason and poll stays the truth
        // lane. One credential either way — no second header is synthesized, and the composed
        // server's boot arming covers the shared viewer identity. Connection catch-up rides
        // `poll-digest` through the proven plane client, cold start included (the stream's
        // `state` handshake vouches the subscription id). Fail-soft past construction: a dead
        // stream degrades the axis back to honest `unknown` with the disconnect reason.
        const planeAdmissionBearer = assertFleetPlaneAdmissionBearerClass();

        if (planeAdmissionBearer) {
            const wakeStreamConsumer = createFleetWakeSseConsumer({
                eventsUrl : `${planeBase.replace(/\/+$/, '')}/fleet/events`,
                credential: planeAdmissionBearer,
                pollDigest: args => planeClient.callTool('manage_wake_subscription', {action: 'poll-digest', ...args})
            });

            wakeStreamConsumer.start();
            fleetWakeStreamConsumer = wakeStreamConsumer
        }

        FleetManager.wakeStateOptions = {
            // The proven client returns PARSED payloads (its mapToolResult owns envelope handling)
            // — the reader consumes them directly; a second parse here would reject every healthy
            // answer and silently blind the whole axis.
            listActiveSubscriptionIdentities: createPlaneWakeIdentitiesReader(planeClient),
            resolveDeliveryLiveness         : fleetWakeStreamConsumer
                ? () => fleetWakeStreamConsumer.resolveDeliveryLiveness()
                : () => ({
                    alive : 'unknown',
                    reason: 'no fleet-surface credential declared (fleet.planeAdmissionBearer / fleet.planeAdmissionBearerFile) — poll remains the truth lane'
                }),
            resolveTerminalDeliveryFailures : () => ({
                state     : 'unknown',
                reason    : 'terminal delivery receipts live with the containerized delivery authority; not exposed yet',
                byIdentity: new Map()
            }),
            // The signed host receiver survives the hard cut HOST-side in both modes, so its
            // manifest coordinate is mode-independent truth: the `fleet.wakeReceiverManifestPath`
            // leaf binds the SAME `NEO_WAKE_RECEIVER_MANIFEST` export the runbook materializes the
            // receiver's plist from. Declared-empty ⇒ no local wake lane ⇒ arming typed-unobserved.
            wakeReceiverManifestPath: AiConfig.fleet.wakeReceiverManifestPath
        };

        console.log(`[fleet] wake-state seam bound to the containerized plane at ${planeBase} (subscription axis plane-side; delivery liveness ${fleetWakeStreamConsumer ? 'observed from the composed wake stream' : 'unarmed — no fleet-surface credential declared'}; terminal receipts honest-unknown)`)
    } else {
        // The `wakeDaemon` subtree is owned by the memory-core config, NOT Tier-1 `AiConfig` (which
        // carries only the flat `wakeDaemonHeartbeatAlivePath` leaf) — so the daemon's own authority
        // (`ai/daemons/wake/daemon.mjs`) is the one to mirror here.
        FleetManager.wakeStateOptions = {
            pidFilePath                     : path.join(memoryCoreConfig.wakeDaemon.dataDir, 'wake-daemon.pid'),
            deliveryFailureFilePath         : path.join(memoryCoreConfig.wakeDaemon.dataDir, 'wake-delivery-failures.json'),
            listActiveSubscriptionIdentities: readActiveWakeSubscriptionIdentities,
            // Same mode-independent receiver-manifest coordinate as the plane branch — the signed
            // host receiver is host-bound truth either way (see the plane-branch comment).
            wakeReceiverManifestPath        : AiConfig.fleet.wakeReceiverManifestPath
        };

        console.log('[fleet] wake-state seam stays host-local (host plane: daemon PID file + host graph subscription scan)')
    }

    // The roster's presence AXIS rides the same proven plane reader as the decomposed
    // routes verb below — one producer contract, two consumers, never a second authority. Host
    // mode stays null ⇒ the adapter renders every row honestly `unknown` under a degraded
    // capability until a host presence surface lands.
    FleetManager.presenceStateOptions = planeClient
        ? {readPresence: createPlaneWhoIsOnlineReader(planeClient)}
        : null;

    // The decomposed wake-routes verb rides the SAME per-mode truth the fused wake axis was bound
    // to above — one authority per axis, never a second source. Presence joins plane-side over the
    // proven client; host mode wraps the daemon PID-file liveness read and leaves presence and
    // terminal receipts honestly unbound until host surfaces exist for them.
    wireFleetWakeRoutesSource({
        listAgents                      : () => FleetManager.getLifecycleService().getRegistry().listAgents(),
        resolveViewerIdentity           : () => RequestContextService.getAgentIdentityNodeId(),
        listActiveSubscriptionIdentities: FleetManager.wakeStateOptions.listActiveSubscriptionIdentities ?? null,
        resolveDeliveryLiveness         : FleetManager.wakeStateOptions.resolveDeliveryLiveness ??
            (FleetManager.wakeStateOptions.pidFilePath
                ? () => resolveDaemonLiveness({pidFilePath: FleetManager.wakeStateOptions.pidFilePath})
                : null),
        resolveTerminalDeliveryFailures: FleetManager.wakeStateOptions.resolveTerminalDeliveryFailures ??
            (FleetManager.wakeStateOptions.deliveryFailureFilePath
                ? createTerminalDeliveryFailuresFileReader({
                    deliveryFailureFilePath: FleetManager.wakeStateOptions.deliveryFailureFilePath
                })
                : null),
        // Arming reads the published wake-receiver manifest through the receiver's own loader. The
        // coordinate is deployment-declared through ONE env name (`NEO_WAKE_RECEIVER_MANIFEST`,
        // bound by the `fleet.wakeReceiverManifestPath` leaf) and rides the same wakeStateOptions
        // vehicle as its sibling read paths; the path→reader composition lives in the routes
        // SOURCE, the Neo-free site the spec exercises. An explicit resolver stays the override seam.
        resolveSeatArming       : FleetManager.wakeStateOptions.resolveSeatArming ?? null,
        wakeReceiverManifestPath: FleetManager.wakeStateOptions.wakeReceiverManifestPath ?? null,
        readPresence            : planeClient ? createPlaneWhoIsOnlineReader(planeClient) : null
    });

    // Wire the composed activitySource onto FleetControlBridge. The memory-core mailbox + graph
    // singletons are imported lazily at this boot use site (mirroring readActiveWakeSubscriptionIdentities's
    // lazy GraphService) and INJECTED — the composer's slot readers never import a singleton, so the
    // mailbox identity/permission binding stays here. issuesDir + pullsDir are the synced content trees;
    // the pulls reader fills the composer's last honest-empty slot so the PR/lane slot emits pr-activity
    // events (opens/reviews/merges) alongside issues + lane-claims + stall. Fail-soft: an unavailable
    // singleton leaves activitySource unwired.
    if (planeClient) {
        // Plane mode: both seams ride the verified client — no in-process memory-core spin-up at
        // all (opening the host graph/mailbox is the split-brain read this mode exists to end).
        // The PR/lane slot's OPTIONAL graphService is deliberately absent: its stall
        // defer-disposition degrades per that slot's own fail-soft contract while issues/pulls
        // keep reading the git-synced local trees (correctly host-local, ticket Out of Scope).
        wireFleetActivityReadSource({
            issuesDir   : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../resources/content/issues'),
            pullsDir    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../resources/content/pulls'),
            listMessages: args => planeClient.listMessages(args)
        });

        wireOperatorComposeWriter({
            addMessage: args => planeClient.addMessage(args)
        })
    } else {
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
        }).catch(error => console.warn('[fleet] activity source not wired:', error?.message ?? error))
    }

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
    const callHistoryOperation = planeClient
        ? (name, args) => planeClient.callTool(name, args)
        : async (name, args) => {
            const {callTool} = await import('../../mcp/server/memory-core/toolService.mjs');

            return callTool(name, args)
        };

    wireFleetCatchUpSource({
        exploreMemoryHistory     : args => callHistoryOperation('explore_memory_history', args),
        explorePullRequestHistory: args => callHistoryOperation('explore_pull_request_history', args),
        resolveViewerIdentity    : () => RequestContextService.getAgentIdentityNodeId()
    });

    // The memories view rides the SAME operation boundary as the catch-up source: the single
    // registered `get_all_summaries` op through the proven plane client (plane mode) or the lazy
    // tool-service import (in-process mode). Zero new Memory Core surface — the session-summary
    // corpus is the deployment's settled team-visible cross-author read, so no per-request
    // authority is simulated here.
    wireFleetMemoriesSource({
        getAllSummaries      : args => callHistoryOperation('get_all_summaries', args),
        resolveViewerIdentity: () => RequestContextService.getAgentIdentityNodeId()
    });

    FleetControlBridge.mailboxMirrorSource = {
        async readMailboxMirror(params = {}) {
            const {readFleetMailboxMirror} = await import('./fleetMailboxMirrorAdapter.mjs');

            // Plane mode keeps the audit contract intact: the read executes as the plane bearer's
            // subject, which init PROVED is the boot viewer — the same identity the ingress stamps
            // on every request and resolveBoundIdentity reports. One identity, two witnesses.
            if (planeClient) {
                return readFleetMailboxMirror({
                    listMessages        : args => planeClient.listMessages(args),
                    resolveBoundIdentity: () => RequestContextService.getAgentIdentityNodeId(),
                    ...params
                })
            }

            const {default: MailboxService} = await import('../memory-core/MailboxService.mjs');

            return readFleetMailboxMirror({
                mailboxService      : MailboxService,
                resolveBoundIdentity: () => RequestContextService.getAgentIdentityNodeId(),
                ...params
            })
        }
    };

        const server = await startFleetBridgeServer({
            port,
            bearerToken,
            viewerContext : viewer,
            allowedOrigins: origins,
            // The launcher's custody decision, resolved at the use site: `npm run cockpit` arms
            // the browser bearer handshake in this child's env; a standalone boot defaults off.
            bearerHandshake: AiConfig.fleet.bearerHandshake,
            runInContext   : (context, fn) => RequestContextService.run(context, fn)
        });

        // AWAITED plane teardown before every exit: an un-awaited close races process death, which
        // leaks the proven plane session (the server reaps it only on its own timeline).
        const cleanShutdown = async signal => {
            console.log(`[fleet] received ${signal}; stopping.`);
            fleetWakeStreamConsumer?.stop();
            await planeClient?.close();
            server.close(() => process.exit(0))
        };

        process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
        process.on('SIGINT',  () => cleanShutdown('SIGINT'));

        // Identity facts only — the bearer is deliberately absent from every log line this
        // process emits; the launcher that supplied (or will inject) it owns the hand-off.
        console.log(`[fleet] authenticated app<->fleet transport listening on http://127.0.0.1:${server.address().port}/fleet (viewer: ${viewer.agentIdentityNodeId}, bearer: ${AiConfig.fleet.bearer ? 'supplied' : 'generated'})`)
    } catch (error) {
        // EVERY exit below this line closes the proven plane session AWAITED — startup failures,
        // probe failures, reuse, and refusal alike would otherwise orphan it on the plane. The
        // client's close() is a shared terminal barrier, so overlapping closers are safe. The
        // wake-stream consumer stops on the same paths: its reconnect loop must not outlive boot.
        if (error?.code !== 'EADDRINUSE') {
            fleetWakeStreamConsumer?.stop();
            await planeClient?.close();
            throw error
        }

        // Occupied port: reuse-or-refuse through the incumbent's authenticated probe — never
        // silent adoption of a process we cannot verify.
        let probe;

        try {
            probe = await probeExistingFleetServer({
                probeUrl           : `http://127.0.0.1:${port}/fleet/probe`,
                bearerToken,
                agentIdentityNodeId: viewer.agentIdentityNodeId
            })
        } catch (probeError) {
            fleetWakeStreamConsumer?.stop();
            await planeClient?.close();
            throw probeError
        }

        if (probe.reusable) {
            console.log(`[fleet] healthy Fleet already listening on port ${port} (${probe.reason}; viewer: ${probe.viewer}, pid: ${probe.pid}) — reusing it.`);
            fleetWakeStreamConsumer?.stop();
            await planeClient?.close();
            process.exit(0)
        }

        console.error(`[fleet] port ${port} is occupied and NOT reusable: ${probe.reason}`);
        fleetWakeStreamConsumer?.stop();
        await planeClient?.close();
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
