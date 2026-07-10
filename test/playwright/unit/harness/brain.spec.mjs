import {expect, test}                                       from '@playwright/test';
import {EventEmitter}                                       from 'node:events';
import {mkdtemp, rm}                                        from 'node:fs/promises';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import net                                                  from 'node:net';
import {tmpdir}                                             from 'node:os';
import path                                                 from 'node:path';
import {
    allocatePort,
    assertIsolatedProfile,
    awaitFleetReady,
    awaitOrchestratorReady,
    awaitReadyMarker,
    buildBrainProfile,
    detectLiveBrain,
    ORCHESTRATOR_ENTRY,
    probePort,
    stopBrainChild,
    stopBrainTree,
    sweepStaleRunState,
    writeRunState
} from '../../../../harness/brain.mjs';

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
        expect(profile.NEO_FLEET_PORT).toBe('18501');

        // Every gate leaf is OFF — an ungated port-bearing task can reap live listeners
        // (ProcessSupervisorService.reconcileSingletonPort), so this list is a safety contract.
        const gates = Object.entries(profile).filter(([name]) => name.endsWith('_ENABLED'));

        expect(gates.length).toBeGreaterThanOrEqual(14);
        gates.forEach(([, value]) => expect(value).toBe('0'))
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

    test('awaitFleetReady polls through failures and requires a real ok:true wire envelope', async () => {
        const child = createFakeChild();

        let calls = 0;

        const fetchFn = async (url, init) => {
            calls++;
            expect(url).toContain('/fleet');
            expect(JSON.parse(init.body).method).toBe('listAgents');

            if (calls < 3) {
                throw new Error('ECONNREFUSED')
            }

            return {json: async () => ({ok: true, result: []})}
        };

        await expect(awaitFleetReady({child, fetchFn, port: 18501, timeoutMs: 5000})).resolves.toBeUndefined();
        expect(calls).toBeGreaterThanOrEqual(3)
    });

    test('awaitFleetReady rejects when the transport child dies first', async () => {
        const
            child = createFakeChild(),
            ready = awaitFleetReady({child, fetchFn: async () => { throw new Error('ECONNREFUSED') }, port: 18501, timeoutMs: 5000});

        child.exit(1);
        await expect(ready).rejects.toThrow(/fleet transport exited before ready/)
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

    test('run-state round-trip: a crashed run\'s live groups are swept, dead ones skipped, state cleared', () => {
        const group = createFakeGroup({diesOn: ['SIGKILL'], pid: 7001});

        writeRunState({isolationRoot: workDir, pgids: [7001, 999999]});

        const killFn = (target, signal) => {
            if (Math.abs(target) === 999999) {
                const error = new Error('ESRCH');
                error.code  = 'ESRCH';
                throw error
            }

            return group.killFn(target, signal)
        };

        expect(sweepStaleRunState({isolationRoot: workDir, killFn})).toEqual([7001]);
        expect(group.signals).toEqual(['SIGKILL']);
        expect(existsSync(path.join(workDir, 'run-state.json'))).toBe(false);

        // No state file → no-op.
        expect(sweepStaleRunState({isolationRoot: workDir, killFn})).toEqual([])
    });

    test('detectLiveBrain: live pid + orchestrator command + fleet probe drive the attach decision', async () => {
        const dataDir = path.join(workDir, 'orchestrator');

        mkdirSync(dataDir, {recursive: true});
        writeFileSync(path.join(dataDir, 'orchestrator-daemon.pid'), '8123', 'utf8');

        const live = await detectLiveBrain({
            commandFn          : () => `node ${ORCHESTRATOR_ENTRY}`,
            fleetPort          : 18501,
            killFn             : () => true,
            orchestratorDataDir: dataDir,
            probePortFn        : async () => true
        });

        expect(live).toEqual({fleetListening: true, orchestratorAlive: true, orchestratorPid: 8123});

        // A recycled pid running something else must NOT read as a live Brain.
        const foreign = await detectLiveBrain({
            commandFn          : () => '/usr/bin/some-other-tool',
            fleetPort          : 18501,
            killFn             : () => true,
            orchestratorDataDir: dataDir,
            probePortFn        : async () => false
        });

        expect(foreign.orchestratorAlive).toBe(false);
        expect(foreign.fleetListening).toBe(false);

        // No PID file at all.
        const missing = await detectLiveBrain({
            fleetPort          : 18501,
            orchestratorDataDir: path.join(workDir, 'nowhere'),
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

    test('run-state file content stays a minimal pgid list', () => {
        writeRunState({isolationRoot: workDir, pgids: [111, 222]});

        expect(JSON.parse(readFileSync(path.join(workDir, 'run-state.json'), 'utf8'))).toEqual({pgids: [111, 222]})
    })
});
