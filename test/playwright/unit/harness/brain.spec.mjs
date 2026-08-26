import {expect, test}                                       from '@playwright/test';
import {EventEmitter}                                       from 'node:events';
import {mkdtemp, rm, symlink}                               from 'node:fs/promises';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import net                                                  from 'node:net';
import {tmpdir}                                             from 'node:os';
import path                                                 from 'node:path';
import {loadAgentOsModule}                                  from '../../fixtures.mjs';
import {
    allocatePort,
    assertIsolatedProfile,
    awaitFleetReady,
    awaitOrchestratorReady,
    awaitReadyMarker,
    buildBrainProfile,
    clearRunState,
    detectLiveBrain,
    FLEET_SERVER_ENTRY,
    ORCHESTRATOR_ENTRY,
    probeFleetServing,
    probePort,
    registerOwnedChild,
    resolveProductBrainPlan,
    resolveRealPath,
    resolveUiFleetTransport,
    startBrainChild,
    stopBrainChild,
    stopBrainTree,
    sweepStaleRunState,
    writeRunState
} from '../../../../harness/brain.mjs';

const {createFleetWireResponse, FLEET_WIRE_RESPONSE_STATES} =
    await loadAgentOsModule('ai/services/fleet/fleetWireMethods.mjs');

/**
 * A stub supervised child: EventEmitter shape matching the ChildProcess surface the lifecycle
 * contract consumes (stdout stream, exit/error events, pid, exitCode).
 */
function createFakeChild({pid = 4242} = {}) {
    const child = new EventEmitter();

    child.pid      = pid;
    child.exitCode = null;
    child.stdout   = new EventEmitter();
    child.stderr   = new EventEmitter();

    child.emitLine = line => child.stdout.emit('data', Buffer.from(line + '\n'));
    child.exit     = (code = 0, signal = null) => {
        child.exitCode = code;
        child.emit('exit', code, signal)
    };

    return child
}

/**
 * A stub process-group registry backing an injected killFn: signal 0 probes liveness (throws
 * ESRCH when the group is gone), SIGINT/SIGKILL transition it per the scenario. Signals must
 * arrive group-addressed (negative pid) — that IS the descendant-ownership contract.
 */
function createFakeGroup({pid, diesOn}) {
    const state = {alive: true, signals: []};

    state.killFn = (target, signal) => {
        if (target !== -pid && signal !== 0) {
            throw new Error(`expected group-addressed signal, got target=${target}`)
        }

        if (!state.alive) {
            const error = new Error('ESRCH');
            error.code  = 'ESRCH';
            throw error
        }

        if (signal !== 0) {
            state.signals.push(signal);

            if (diesOn.includes(signal)) {
                state.alive = false
            }
        }

        return true
    };

    return state
}

test.describe('harness brain lifecycle', () => {
    const
        agentIdentityNodeId = '@neo-gpt-emmy',
        bearerToken         = 'A'.repeat(43);

    let workDir;

    test.beforeEach(async () => {
        workDir = await mkdtemp(path.join(tmpdir(), 'neo-harness-brain-'))
    });

    test.afterEach(async () => {
        await rm(workDir, {force: true, recursive: true})
    });

    test('buildBrainProfile binds every mutable path under the isolation root and gates every side lane off', () => {
        const profile = buildBrainProfile({chromaPort: 18500, fleetPort: 18501, isolationRoot: workDir});

        for (const leafName of ['NEO_AI_DB_PATH', 'NEO_AI_ORCHESTRATOR_DIR', 'NEO_BACKUP_PATH', 'NEO_CHROMA_DATA_DIR_TEST', 'NEO_FLEET_INSTANCE_ROOT', 'NEO_REM_RUN_STATE_DIR']) {
            expect(profile[leafName].startsWith(workDir + path.sep)).toBe(true)
        }

        expect(profile.UNIT_TEST_MODE).toBe('1');
        expect(profile.NEO_CHROMA_PORT_TEST).toBe('18500');
        expect(profile.NEO_FLEET_PLANE_BASE).toBe('');
        expect(profile.NEO_FLEET_PLANE_BEARER).toBe('');
        expect(profile.NEO_FLEET_PORT).toBe('18501');

        // Every gate leaf is OFF — an ungated port-bearing task can reap live listeners
        // (ProcessSupervisorService.reconcileSingletonPort), so this list is a safety contract.
        const gates = Object.entries(profile).filter(([name]) => name.endsWith('_ENABLED'));

        expect(gates.map(([name]) => name).sort()).toEqual([
            'NEO_DEPLOYMENT_STATE_BRIDGE_ENABLED',
            'NEO_ORCHESTRATOR_CORPUS_PROJECTION_ENABLED',
            'NEO_ORCHESTRATOR_DEV_SERVER_ENABLED',
            'NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED',
            'NEO_ORCHESTRATOR_GRAPHLOG_COMPACTION_ENABLED',
            'NEO_ORCHESTRATOR_KB_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_LMS_ENABLED',
            'NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_MLX_ENABLED',
            'NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED',
            'NEO_ORCHESTRATOR_OLLAMA_ENABLED',
            'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED'
        ]);
        gates.forEach(([, value]) => expect(value).toBe('0'))
    });

    test('resolveProductBrainPlan: a declared plane outranks host liveness and can start only Fleet', () => {
        // Port 1 is intentionally unreachable. The classifier never probes it: declaration selects
        // topology, while the spawned Fleet transport owns authenticated readiness and refusal.
        expect(resolveProductBrainPlan({
            fleetServing     : false,
            orchestratorAlive: false,
            planeBase        : '  http://127.0.0.1:1  '
        })).toEqual({
            mode             : 'plane-attach',
            planeBase        : 'http://127.0.0.1:1',
            startFleet       : true,
            startOrchestrator: false
        });

        expect(resolveProductBrainPlan({
            fleetServing     : true,
            orchestratorAlive: true,
            planeBase        : 'http://127.0.0.1:3102'
        })).toEqual({
            mode             : 'plane-attach',
            planeBase        : 'http://127.0.0.1:3102',
            startFleet       : false,
            startOrchestrator: false
        })
    });

    test('resolveProductBrainPlan: without a plane, host liveness selects attach else own', () => {
        expect(resolveProductBrainPlan({
            fleetServing     : false,
            orchestratorAlive: true,
            planeBase        : ''
        })).toEqual({mode: 'attach', planeBase: null, startFleet: true, startOrchestrator: false});

        expect(resolveProductBrainPlan({
            fleetServing     : false,
            orchestratorAlive: false,
            planeBase        : '   '
        })).toEqual({mode: 'own', planeBase: null, startFleet: true, startOrchestrator: true})
    });

    test('assertIsolatedProfile passes an isolated resolution and names every escape', () => {
        const isolated = {
            backupPath         : path.join(workDir, 'backups'),
            chromaDataDir      : path.join(workDir, 'chroma'),
            chromaPort         : 18500,
            dbPath             : path.join(workDir, 'sqlite', 'memory-core-graph.sqlite'),
            fleetInstanceRoot  : path.join(workDir, 'fleet', 'instances'),
            orchestratorDataDir: path.join(workDir, 'orchestrator')
        };

        expect(assertIsolatedProfile({chromaPort: 18500, isolationRoot: workDir, resolved: isolated})).toEqual([]);

        const leaky = assertIsolatedProfile({
            chromaPort   : 18500,
            isolationRoot: workDir,
            resolved     : {...isolated, chromaPort: 8000, dbPath: '.neo-ai-data/sqlite/memory-core-graph.sqlite'}
        });

        expect(leaky.some(violation => violation.includes('dbPath'))).toBe(true);
        expect(leaky.some(violation => violation.includes('chromaPort'))).toBe(true);
        expect(leaky).toHaveLength(2)
    });

    // Isolation is a filesystem-IDENTITY contract: a symlinked ancestor inside the root satisfies
    // a lexical prefix check while the data lands outside. The containment must resolve links.
    test('assertIsolatedProfile flags a symlinked ancestor escaping the root by identity', async () => {
        const outside = await mkdtemp(path.join(tmpdir(), 'neo-harness-outside-'));

        try {
            const isolated = {
                backupPath         : path.join(workDir, 'backups'),
                chromaDataDir      : path.join(workDir, 'chroma'),
                chromaPort         : 18500,
                dbPath             : path.join(workDir, 'sqlite', 'memory-core-graph.sqlite'),
                fleetInstanceRoot  : path.join(workDir, 'fleet', 'instances'),
                orchestratorDataDir: path.join(workDir, 'orchestrator')
            };

            // The lexical form is identical before and after; only the identity changes.
            expect(assertIsolatedProfile({chromaPort: 18500, isolationRoot: workDir, resolved: isolated})).toEqual([]);

            await symlink(outside, path.join(workDir, 'sqlite'));

            const violations = assertIsolatedProfile({chromaPort: 18500, isolationRoot: workDir, resolved: isolated});

            expect(violations.some(violation => violation.includes('dbPath'))).toBe(true);
            // realpath both sides: os.tmpdir() itself sits behind a symlink on macOS (/var → /private/var).
            expect(resolveRealPath(isolated.dbPath).startsWith(resolveRealPath(outside))).toBe(true)
        } finally {
            await rm(outside, {force: true, recursive: true})
        }
    });

    test('probeFleetServing reuses only the canonical same-bearer, same-viewer probe', async () => {
        const fetchFn = async (url, init) => {
            expect(url).toContain('/fleet/probe');
            expect(url).not.toContain(bearerToken);
            expect(init.headers.Authorization).toBe(`Bearer ${bearerToken}`);
            return {ok: true, status: 200, json: async () => ({result: {agentIdentityNodeId, pid: 7}})}
        };

        const admitted = await probeFleetServing({agentIdentityNodeId, bearerToken, fetchFn, port: 1});

        expect(admitted).toEqual({reusable: true, reason: 'same token, same viewer', viewer: agentIdentityNodeId, pid: 7});

        const wrongBearer = await probeFleetServing({
            agentIdentityNodeId,
            bearerToken,
            fetchFn: async () => ({ok: false, status: 401}),
            port   : 1
        });

        expect(wrongBearer.reusable).toBe(false);
        expect(wrongBearer.reason).toContain('rejected our bearer');

        const wrongViewer = await probeFleetServing({
            agentIdentityNodeId,
            bearerToken,
            fetchFn: async () => ({ok: true, status: 200, json: async () => ({result: {agentIdentityNodeId: '@other', pid: 8}})}),
            port   : 1
        });

        expect(wrongViewer.reusable).toBe(false);
        expect(wrongViewer.reason).toContain('wrong-viewer')
    });

    test('awaitReadyMarker resolves on the marker and never on PID existence alone', async () => {
        const
            child = createFakeChild(),
            ready = awaitReadyMarker({child, label: 'orchestrator', marker: '[Orchestrator] Started.', timeoutMs: 2000});

        let settled = false;

        ready.then(() => { settled = true });

        // PID-file-era false readiness: lines flow, process exists — not ready yet.
        child.emitLine('[2026-07-10T20:00:00.000Z] [PID:4242] [INFO] [Orchestrator] Found existing instance');
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(settled).toBe(false);

        child.emitLine('[2026-07-10T20:00:01.000Z] [PID:4242] [INFO] [Orchestrator] Started. summaryInterval=1000ms');
        await expect(ready).resolves.toBeUndefined()
    });

    test('awaitOrchestratorReady rejects deterministically on early exit', async () => {
        const
            child = createFakeChild(),
            ready = awaitOrchestratorReady({child, timeoutMs: 2000});

        child.exit(1);
        await expect(ready).rejects.toThrow(/exited before ready \(code=1/)
    });

    test('awaitReadyMarker rejects on spawn error and on an already-exited child', async () => {
        const errored = createFakeChild();
        const ready   = awaitReadyMarker({child: errored, label: 'orchestrator', marker: 'never', timeoutMs: 2000});

        errored.emit('error', new Error('ENOENT'));
        await expect(ready).rejects.toThrow(/failed to spawn: ENOENT/);

        const dead = createFakeChild();

        dead.exitCode = 127;
        await expect(awaitReadyMarker({child: dead, label: 'fleet', marker: 'never', timeoutMs: 2000}))
            .rejects.toThrow(/exited before ready \(code=127/)
    });

    test('awaitReadyMarker rejects on timeout', async () => {
        const child = createFakeChild();

        await expect(awaitReadyMarker({child, label: 'orchestrator', marker: 'never-emitted', timeoutMs: 120}))
            .rejects.toThrow(/not ready within 120ms/)
    });

    test('awaitFleetReady polls through failures and refuses a legacy ok:true envelope', async () => {
        const child = createFakeChild();

        let calls = 0;

        const fetchFn = async (url, init) => {
            calls++;
            expect(url).toContain('/fleet');
            expect(url).not.toContain(bearerToken);
            expect(init.headers.Authorization).toBe(`Bearer ${bearerToken}`);
            expect(JSON.parse(init.body)).toMatchObject({
                method  : 'listAgents',
                protocol: {versions: [1]}
            });

            if (calls < 3) {
                throw new Error('ECONNREFUSED')
            }

            if (calls === 3) {
                return {json: async () => ({ok: true, result: []})}
            }

            return {
                json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: []})
            }
        };

        await expect(awaitFleetReady({bearerToken, child, fetchFn, port: 18501, timeoutMs: 5000})).resolves.toBeUndefined();
        expect(calls).toBeGreaterThanOrEqual(4)
    });

    test('awaitFleetReady rejects when the transport child dies first', async () => {
        const
            child = createFakeChild(),
            ready = awaitFleetReady({bearerToken, child, fetchFn: async () => { throw new Error('ECONNREFUSED') }, port: 18501, timeoutMs: 5000});

        child.exit(1);
        await expect(ready).rejects.toThrow(/fleet transport exited before ready/)
    });

    test('awaitFleetReady fails closed when the authoritative wire contract cannot load', async () => {
        const
            child    = createFakeChild(),
            repoRoot = await mkdtemp(path.join(tmpdir(), 'neo-fleet-wire-missing-'));

        await rm(repoRoot, {recursive: true});

        await expect(awaitFleetReady({
            bearerToken,
            child,
            fetchFn  : async () => { throw new Error('fetch must not run') },
            port     : 18501,
            repoRoot,
            timeoutMs: 5000
        })).rejects.toThrow(/fleet wire contract unavailable/)
    });

    // SIGINT is the graceful rung by measurement: the chromadb npm wrapper ignores group-SIGTERM
    // indefinitely but exits on SIGINT in milliseconds; every supervised entry handles both.
    test('stopBrainChild settles the graceful group path: SIGINT only, group empty, never forced', async () => {
        const
            child = createFakeChild({pid: 5001}),
            group = createFakeGroup({diesOn: ['SIGINT'], pid: 5001}),
            stop  = await stopBrainChild(child, {graceMs: 500, killFn: group.killFn, pollMs: 20});

        expect(stop).toEqual({exited: true, forced: false, groupEmpty: true});
        expect(group.signals).toEqual(['SIGINT'])
    });

    test('stopBrainChild escalates a SIGINT-ignoring group to SIGKILL and reports forced', async () => {
        const
            child = createFakeChild({pid: 5002}),
            group = createFakeGroup({diesOn: ['SIGKILL'], pid: 5002}),
            stop  = await stopBrainChild(child, {graceMs: 100, killFn: group.killFn, pollMs: 20});

        expect(stop).toEqual({exited: true, forced: true, groupEmpty: true});
        expect(group.signals).toEqual(['SIGINT', 'SIGKILL'])
    });

    test('stopBrainChild is idempotent: a second stop of a dead group settles immediately', async () => {
        const
            child = createFakeChild({pid: 5003}),
            group = createFakeGroup({diesOn: ['SIGINT'], pid: 5003});

        await stopBrainChild(child, {graceMs: 500, killFn: group.killFn, pollMs: 20});

        const again = await stopBrainChild(child, {graceMs: 500, killFn: group.killFn, pollMs: 20});

        expect(again).toEqual({exited: true, forced: false, groupEmpty: true});
        expect(group.signals).toEqual(['SIGINT'])
    });

    test('stopBrainTree stops the consumer (fleet) before the organism (orchestrator)', async () => {
        const
            order        = [],
            orchestrator = createFakeChild({pid: 6001}),
            fleet        = createFakeChild({pid: 6002}),
            groups       = {
                6001: createFakeGroup({diesOn: ['SIGINT'], pid: 6001}),
                6002: createFakeGroup({diesOn: ['SIGINT'], pid: 6002})
            },
            killFn = (target, signal) => {
                const pid = Math.abs(target);

                signal === 'SIGINT' && order.push(pid);
                return groups[pid].killFn(target, signal)
            },
            report = await stopBrainTree([
                {child: orchestrator, label: 'orchestrator'},
                {child: fleet,        label: 'fleet'}
            ], {graceMs: 500, killFn, pollMs: 20});

        expect(order).toEqual([6002, 6001]);
        expect(report.fleet.groupEmpty).toBe(true);
        expect(report.orchestrator.groupEmpty).toBe(true)
    });

    test('startBrainChild exposes an absolute checkout entry and per-spawn argv identity', () => {
        let invocation;

        const child = startBrainChild({
            entry           : ORCHESTRATOR_ENTRY,
            ownershipTokenFn: () => 'spawn-token-a',
            repoRoot        : workDir,
            spawnFn         : (command, args, options) => {
                invocation = {args, command, options};
                return createFakeChild()
            }
        });
        const absoluteEntry = path.join(workDir, ORCHESTRATOR_ENTRY);

        expect(invocation.args).toEqual([absoluteEntry, '--neo-harness-owner=spawn-token-a']);
        expect(invocation.options.cwd).toBe(workDir);
        expect(invocation.options.detached).toBe(true);
        expect(child.neoHarnessIdentity).toEqual({entry: absoluteEntry, ownershipToken: 'spawn-token-a'})
    });

    test('startBrainChild rejects entries outside its checkout root', () => {
        expect(() => startBrainChild({
            entry           : path.join('..', 'sibling', ORCHESTRATOR_ENTRY),
            ownershipTokenFn: () => 'spawn-token-a',
            repoRoot        : workDir,
            spawnFn         : () => createFakeChild()
        })).toThrow(/entry must resolve inside repoRoot/)
    });

    // A bare PGID OR program name is not ownership: ids are recycled and every checkout runs the
    // same scripts. Cleanup requires this checkout's absolute entry AND this spawn's argv token.
    test('run-state sweep requires exact checkout + spawn identity, skips recycled pids, clears state', () => {
        const
            group        = createFakeGroup({diesOn: ['SIGKILL'], pid: 7001}),
            ownedEntry   = path.join(workDir, ORCHESTRATOR_ENTRY),
            siblingEntry = path.join(workDir + '-sibling', ORCHESTRATOR_ENTRY);

        writeRunState({
            children     : [
                {entry: ownedEntry, ownershipToken: 'owned-token', pgid: 7001},
                {entry: ownedEntry, ownershipToken: 'owned-token', pgid: 7002},
                {entry: ownedEntry, ownershipToken: 'owned-token', pgid: 7003},
                {entry: ownedEntry, pgid: 7004},
                {entry: ownedEntry, ownershipToken: 'owned-token', pgid: 7005},
                {entry: ownedEntry, ownershipToken: 'owned-token', pgid: 999999}
            ],
            isolationRoot: workDir
        });

        const killFn = (target, signal) => {
            if ([7002, 7003, 7004, 7005, 999999].includes(Math.abs(target))) {
                if (Math.abs(target) !== 999999 && signal === 0) {
                    return true // alive — but identity will fail closed below
                }

                const error = new Error('ESRCH');
                error.code  = 'ESRCH';
                throw error
            }

            return group.killFn(target, signal)
        };

        const commandFn = pgid => ({
            7001: `node ${ownedEntry} --neo-harness-owner=owned-token`,
            7002: `node ${ownedEntry} --neo-harness-owner=later-spawn`,
            7003: `node ${siblingEntry} --neo-harness-owner=owned-token`,
            7004: `node ${ownedEntry}`,
            7005: `node /prefix${ownedEntry} --neo-harness-owner=owned-token`
        })[pgid] ?? '';

        // 7001 matches both identities. 7002 has a later token. 7003 is a sibling checkout.
        // 7004 is a legacy record without a token; 7005 only contains the entry as a suffix.
        // 999999 is dead. Only 7001 is signal-authorized.
        expect(sweepStaleRunState({commandFn, isolationRoot: workDir, killFn})).toEqual([7001]);
        expect(group.signals).toEqual(['SIGKILL']);
        expect(existsSync(path.join(workDir, 'run-state.json'))).toBe(false);

        // No state file → no-op.
        expect(sweepStaleRunState({commandFn, isolationRoot: workDir, killFn})).toEqual([])
    });

    test('run-state sweep clears malformed JSON without signaling', () => {
        const runStateFile = path.join(workDir, 'run-state.json');

        writeFileSync(runStateFile, '{not-json', 'utf8');
        expect(sweepStaleRunState({
            isolationRoot: workDir,
            killFn       : () => { throw new Error('must not signal') }
        })).toEqual([]);
        expect(existsSync(runStateFile)).toBe(false);

        writeFileSync(runStateFile, JSON.stringify({children: [null, 'legacy', {}]}), 'utf8');
        expect(sweepStaleRunState({isolationRoot: workDir})).toEqual([]);
        expect(existsSync(runStateFile)).toBe(false)
    });

    test('clearRunState removes the record after a clean stop and tolerates absence', () => {
        writeRunState({
            children: [{
                entry         : path.join(workDir, ORCHESTRATOR_ENTRY),
                ownershipToken: 'clean-token',
                pgid          : 7100
            }],
            isolationRoot: workDir
        });
        expect(existsSync(path.join(workDir, 'run-state.json'))).toBe(true);

        clearRunState({isolationRoot: workDir});
        expect(existsSync(path.join(workDir, 'run-state.json'))).toBe(false);

        clearRunState({isolationRoot: workDir}) // idempotent
    });

    test('detectLiveBrain: protocol identity drives attach; a foreign listener reads held-not-serving', async () => {
        const dataDir = path.join(workDir, 'orchestrator');

        mkdirSync(dataDir, {recursive: true});
        writeFileSync(path.join(dataDir, 'orchestrator-daemon.pid'), '8123', 'utf8');

        const live = await detectLiveBrain({
            agentIdentityNodeId,
            bearerToken,
            commandFn          : () => `node ${ORCHESTRATOR_ENTRY}`,
            fleetPort          : 18501,
            killFn             : () => true,
            orchestratorDataDir: dataDir,
            probeFleetFn       : async options => {
                expect(options).toEqual({agentIdentityNodeId, bearerToken, port: 18501});
                return {reusable: true, reason: 'same token, same viewer'}
            },
            probePortFn        : async () => true
        });

        expect(live).toEqual({
            fleetPortHeld     : true,
            fleetRefusalReason: null,
            fleetServing      : true,
            orchestratorAlive : true,
            orchestratorPid   : 8123
        });

        // A foreign HTTP server on the fleet port: occupied, but NOT the fleet protocol —
        // attach must not treat it as a reachable Brain surface.
        const squatted = await detectLiveBrain({
            agentIdentityNodeId,
            bearerToken,
            commandFn          : () => `node ${ORCHESTRATOR_ENTRY}`,
            fleetPort          : 18501,
            killFn             : () => true,
            orchestratorDataDir: dataDir,
            probeFleetFn       : async () => ({reusable: false, reason: 'a process on the Fleet port rejected our bearer — refusing silent reuse'}),
            probePortFn        : async () => true
        });

        expect(squatted.fleetServing).toBe(false);
        expect(squatted.fleetPortHeld).toBe(true);
        expect(squatted.fleetRefusalReason).toContain('rejected our bearer');

        const unresolvedViewer = await detectLiveBrain({
            agentIdentityNodeId: null,
            bearerToken,
            commandFn          : () => `node ${ORCHESTRATOR_ENTRY}`,
            fleetPort          : 18501,
            killFn             : () => true,
            orchestratorDataDir: dataDir,
            probeFleetFn       : probeFleetServing,
            probePortFn        : async () => true
        });

        expect(unresolvedViewer.fleetServing).toBe(false);
        expect(unresolvedViewer.fleetRefusalReason).toContain('canonical expected Fleet viewer');

        // A recycled pid running something else must NOT read as a live Brain.
        const foreign = await detectLiveBrain({
            agentIdentityNodeId,
            bearerToken,
            commandFn          : () => '/usr/bin/some-other-tool',
            fleetPort          : 18501,
            killFn             : () => true,
            orchestratorDataDir: dataDir,
            probeFleetFn       : async () => { throw new Error('a free port must not be probed as an incumbent') },
            probePortFn        : async () => false
        });

        expect(foreign.orchestratorAlive).toBe(false);
        expect(foreign.fleetServing).toBe(false);
        expect(foreign.fleetPortHeld).toBe(false);

        // No PID file at all.
        const missing = await detectLiveBrain({
            agentIdentityNodeId,
            bearerToken,
            fleetPort          : 18501,
            orchestratorDataDir: path.join(workDir, 'nowhere'),
            probeFleetFn       : async () => { throw new Error('a free port must not be probed as an incumbent') },
            probePortFn        : async () => false
        });

        expect(missing.orchestratorAlive).toBe(false)
    });

    test('allocatePort returns a free loopback port and probePort tracks its occupancy', async () => {
        const port = await allocatePort();

        expect(await probePort({port, timeoutMs: 500})).toBe(false);

        const server = net.createServer();

        await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
        expect(await probePort({port, timeoutMs: 500})).toBe(true);
        await new Promise(resolve => server.close(resolve));
        expect(await probePort({port, timeoutMs: 500})).toBe(false)
    });

    test('run-state file content carries the ownership token per group', () => {
        const entry = path.join(workDir, ORCHESTRATOR_ENTRY);

        writeRunState({
            children     : [{entry, ownershipToken: 'token-111', pgid: 111}],
            isolationRoot: workDir
        });

        expect(JSON.parse(readFileSync(path.join(workDir, 'run-state.json'), 'utf8')))
            .toEqual({children: [{entry, ownershipToken: 'token-111', pgid: 111}]})
    })
});

test.describe('registerOwnedChild — teardown ownership is unconditional; Brain observation routes by flag', () => {
    test('owner coverage is deterministic: observed AND unobserved children BOTH join the drain list', () => {
        const
            children = [],
            watched  = [],
            organism = new EventEmitter(),
            uiFleet  = new EventEmitter(),
            watch    = (child, label) => watched.push(label);

        registerOwnedChild({children, entry: {child: organism, label: 'orchestrator'}, watch});
        registerOwnedChild({children, entry: {child: uiFleet, label: 'fleet', observeBrain: false}, watch, onUnobservedExit: () => {}});

        // The cycle-1 falsifier's inverse, pinned: the drain list carries EVERY registered child
        // regardless of observation routing — ownership never narrows with the watcher.
        expect(children.map(entry => entry.label)).toEqual(['orchestrator', 'fleet']);
        expect(watched).toEqual(['orchestrator'])
    });

    test('an unobserved child\'s death reaches the diagnostic sink — and ONLY the sink', () => {
        const
            children = [],
            logged   = [],
            watched  = [],
            uiFleet  = new EventEmitter();

        registerOwnedChild({
            children,
            entry           : {child: uiFleet, label: 'fleet', observeBrain: false},
            onUnobservedExit: summary => logged.push(summary),
            watch           : (child, label) => watched.push(label)
        });

        uiFleet.emit('exit', null, 'SIGKILL');

        // Fault visibility WITHOUT health mutation: the sink names the child and the signal,
        // while the Brain-health watcher was never attached (a UI transport is not a Brain).
        expect(logged).toEqual(['fleet: exit signal SIGKILL']);
        expect(watched).toEqual([])
    });

    test('an observed child routes to the Brain watcher and never to the sink', () => {
        const
            children = [],
            logged   = [],
            watched  = [],
            organism = new EventEmitter();

        registerOwnedChild({
            children,
            entry           : {child: organism, label: 'orchestrator'},
            onUnobservedExit: summary => logged.push(summary),
            watch           : (child, label) => watched.push(label)
        });

        expect(watched).toEqual(['orchestrator']);
        expect(logged).toEqual([])
    })
});

test.describe('resolveUiFleetTransport — the reuse|spawn|foreign OWNER COMPOSITION is witnessed, not just its parts', () => {
    test('reuse: a canonical same-bearer listener is adopted — spawn and registration are NEVER invoked', async () => {
        const
            calls   = {registered: [], spawned: 0},
            outcome = [];

        const result = await resolveUiFleetTransport({
            awaitReady    : async () => { throw new Error('awaitReady must not run on reuse') },
            bearerToken   : 'shell-held-bearer',
            fleetPort     : 18083,
            onOutcome     : line => outcome.push(line),
            probePortFn   : async () => true,
            probeServingFn: async () => ({reusable: true}),
            registerChild : entry => calls.registered.push(entry),
            spawn         : () => { calls.spawned++; throw new Error('spawn must not run on reuse') }
        });

        expect(result).toEqual({fleetPort: 18083, mode: 'reuse', up: true});
        expect(calls.spawned).toBe(0);
        expect(calls.registered).toEqual([]);
        expect(outcome).toEqual(['reuse fleetPort=18083'])
    });

    test('foreign listener: refusal is named, up stays false, the window path never throws — and nothing spawns', async () => {
        const
            calls   = {registered: [], spawned: 0},
            outcome = [];

        const result = await resolveUiFleetTransport({
            awaitReady    : async () => { throw new Error('awaitReady must not run on foreign') },
            bearerToken   : 'shell-held-bearer',
            fleetPort     : 18083,
            onOutcome     : line => outcome.push(line),
            probePortFn   : async () => true,
            probeServingFn: async () => ({reusable: false, reason: 'bearer subject mismatch'}),
            registerChild : entry => calls.registered.push(entry),
            spawn         : () => { calls.spawned++; throw new Error('spawn must not run on foreign') }
        });

        // the refusal travels IN the outcome: the cockpit banner renders the named case, so the
        // shell log must not be the only place the reason exists
        expect(result).toEqual({fleetPort: 18083, mode: 'foreign-listener', reason: 'bearer subject mismatch', up: false});
        expect(calls.spawned).toBe(0);
        expect(calls.registered).toEqual([]);
        expect(outcome).toEqual(['foreign-listener fleetPort=18083 reason=bearer subject mismatch'])
    });

    test('spawn: the composition itself registers observeBrain:false and gates up:true on real readiness', async () => {
        const
            child    = new EventEmitter(),
            sequence = [],
            calls    = {registered: []};

        const result = await resolveUiFleetTransport({
            awaitReady    : async ({bearerToken, port}) => sequence.push(`ready:${bearerToken}:${port}`),
            bearerToken   : 'shell-held-bearer',
            fleetPort     : 18083,
            onOutcome     : line => sequence.push(line),
            probePortFn   : async () => false,
            probeServingFn: async () => { throw new Error('serving probe must not run on a free port') },
            registerChild : entry => { calls.registered.push(entry); sequence.push('registered') },
            spawn         : ({fleetPort}) => { sequence.push(`spawn:${fleetPort}`); return child }
        });

        expect(result).toEqual({fleetPort: 18083, mode: 'spawn', up: true});
        // The cycle-1 invariant is wired IN the composition: ownership without Brain observation.
        expect(calls.registered).toEqual([{child, label: 'fleet', observeBrain: false}]);
        // Registration precedes readiness (an early quit must find the owner non-empty), and
        // readiness precedes the up:true outcome line.
        expect(sequence).toEqual(['spawn:18083', 'registered', 'ready:shell-held-bearer:18083', 'spawn fleetPort=18083'])
    })
});
