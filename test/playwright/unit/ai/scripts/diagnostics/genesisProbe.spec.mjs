import {setup} from '../../../../setup.mjs';

const appName = 'GenesisProbeTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fsPromises     from 'fs/promises';
import net            from 'net';
import os             from 'os';
import path           from 'path';
import {EventEmitter} from 'events';
import {
    MAX_SESSION_MS,
    assertDiagnosticPathsWithinRoot,
    canonicalizeOracle,
    createBrowserLaunchOptions,
    createCleanupDeadline,
    createDevServerArgs,
    createManifest,
    createOracleCommitment,
    createProbeFailure,
    createProbeEnvironments,
    finalizeDisposableRoot,
    getPhaseTimeout,
    hasChildExited,
    installProbeSignalHandlers,
    isProcessGroupAlive,
    parseArgs,
    parsePort,
    readToolJson,
    spawnLoggedChild,
    stopChild,
    toPublicProbeError,
    waitForChildExit,
    waitForChildReady,
    withTimeout
} from '../../../../../../ai/scripts/diagnostics/genesisProbe.mjs';
import {
    GENESIS_DIAGNOSTIC_ATTESTATION_ENV,
    GENESIS_DIAGNOSTIC_PATH_MISMATCH,
    attestDiagnosticPaths,
    createDiagnosticPathAttestation
} from '../../../../../../ai/mcp/server/neural-link/diagnosticPathAttestation.mjs';

/**
 * Worker-isolated free-port allocator for the child-spawning tests.
 *
 * Production `findFreePort` binds an ephemeral port, closes it, and returns the number; the spawned
 * child binds it a moment later. That allocate → close → hand-off gap is a real collision under
 * `--workers=N`: two workers' ephemeral draws can land on the same just-freed port, and the second
 * child to bind it exits `EADDRINUSE` "before opening port". Single-worker ordering masks it.
 *
 * Disjoint per-worker bands make the cross-worker collision UNREPRESENTABLE rather than merely rarer:
 * each worker probes only within its own 1000-port band, so no two workers can ever hand the same
 * number to a child. The same worker runs its child-spawning tests serially, so its own hand-off
 * window never races itself. The probe-then-bind still skips a port a stale process happens to hold.
 * @returns {Promise<Number>}
 */
async function findFreeWorkerPort() {
    const bandStart = 20000 + test.info().workerIndex * 1000,
          bandEnd   = bandStart + 1000;

    for (let candidate = bandStart; candidate < bandEnd; candidate++) {
        const free = await new Promise(resolve => {
            const probe = net.createServer();
            probe.once('error', () => resolve(false));
            probe.listen(candidate, '127.0.0.1', () => probe.close(() => resolve(true)))
        });

        if (free) return candidate
    }

    throw new Error(`no free port in this worker's band [${bandStart}, ${bandEnd})`)
}

test.describe('Neo.ai.scripts.diagnostics.genesisProbe', () => {
    test('canonicalizes the blind oracle and reproduces the fixed commitment bytes', () => {
        const {oracle, canonicalJson} = canonicalizeOracle({
            className: 'Neo.container.Viewport',
            items    : [
                {className: 'Neo.grid.Container'},
                {className: 'Neo.toolbar.Base'}
            ]
        });

        expect(oracle).toEqual({
            rootClass     : 'Neo.container.Viewport',
            directChildren: [
                {index: 0, className: 'Neo.grid.Container'},
                {index: 1, className: 'Neo.toolbar.Base'}
            ]
        });
        expect(canonicalJson).toBe('{"rootClass":"Neo.container.Viewport","directChildren":[{"index":0,"className":"Neo.grid.Container"},{"index":1,"className":"Neo.toolbar.Base"}]}');
        expect(createOracleCommitment({canonicalJson, saltHex: '00'.repeat(32)}))
            .toBe('7661f2f7d3bc14ded75892f9b9249f7f713913e1f637e8a7fb13999502c52346');
    });

    test('rejects malformed oracle input, salt, ports, and escaping diagnostic sinks', () => {
        expect(() => canonicalizeOracle({className: '', items: []})).toThrow('root className');
        expect(() => canonicalizeOracle({className: 'Root', items: [{}]})).toThrow('Direct child 0');
        expect(() => createOracleCommitment({canonicalJson: '{}', saltHex: 'abc'})).toThrow('32 bytes');
        expect(() => parsePort('0')).toThrow('1..65535');
        expect(() => parsePort('8081.5')).toThrow('1..65535');
        expect(() => assertDiagnosticPathsWithinRoot({
            databasePath: path.join(os.tmpdir(), 'escaped.sqlite'),
            logPath     : '/tmp',
            root        : path.join(os.tmpdir(), 'probe-root')
        })).toThrow('escapes the disposable root');
    });

    test('builds least-authority child environments without inheriting provider secrets', () => {
        const
            root = path.join(os.tmpdir(), 'genesis-probe-env'),
            envs = createProbeEnvironments({
                baseEnv: {
                    Path                       : '/windows/path',
                    NODE_OPTIONS               : '--import=must-not-run.mjs',
                    OPENAI_API_KEY             : 'must-not-leak',
                    ANTHROPIC_API_KEY          : 'must-not-leak',
                    NEO_AUTH_LOCAL_BEARER_TOKEN: 'must-not-leak'
                },
                bearerToken: 'A'.repeat(43),
                ports      : {dev: 19001, bridge: 19002, mcp: 19003},
                root
            });

        expect(envs.devEnv.Path).toBe('/windows/path');
        expect(envs.devEnv).not.toHaveProperty('NODE_OPTIONS');
        expect(envs.devEnv).not.toHaveProperty('OPENAI_API_KEY');
        expect(envs.devEnv).not.toHaveProperty('ANTHROPIC_API_KEY');
        expect(envs.devEnv).not.toHaveProperty('NEO_AUTH_LOCAL_BEARER_TOKEN');
        expect(envs.bridgeEnv).not.toHaveProperty('NEO_AUTH_LOCAL_BEARER_TOKEN');
        expect(envs.mcpEnv.NEO_AUTH_LOCAL_BEARER_TOKEN).toBe('A'.repeat(43));
        expect(envs.clientHeaders.Authorization).toBe(`Bearer ${'A'.repeat(43)}`);
        expect(envs.mcpEnv.NEO_AUTH_MODE).toBe('local-bearer');
        expect(envs.mcpEnv.NEO_MCP_LISTEN_HOST).toBe('127.0.0.1');
        expect(envs.mcpEnv.NEO_MEMORY_DB_PATH).toBe(path.join(root, 'memory-core.sqlite'));
        expect(envs.mcpEnv.NEO_NL_LOG_PATH).toBe(root);
        expect(envs.mcpEnv.NEO_NL_TOOL_PROJECTION_MODE).toBe('local-readonly-probe');
        // Action logging is OFF by default; the probe's per-tool telemetry oracle reads
        // nl_action_log, so the rendered child env must carry the explicit opt-in — asserted on
        // the INVOKED builder output, not on source text. Safe because NEO_MEMORY_DB_PATH above
        // already pins every write inside this run's disposable root.
        expect(envs.mcpEnv.NEO_NL_ACTION_LOGGING).toBe('true');
        expect(envs.bridgeEnv[GENESIS_DIAGNOSTIC_ATTESTATION_ENV])
            .toBe(envs.diagnosticAttestations.bridge.commitment);
        expect(envs.mcpEnv[GENESIS_DIAGNOSTIC_ATTESTATION_ENV])
            .toBe(envs.diagnosticAttestations.mcp.commitment);
        expect(envs.diagnosticAttestations.bridge.marker).not.toContain(root);
        expect(envs.diagnosticAttestations.mcp.marker).not.toContain(root);
    });

    test('launches the browser with the same least-authority environment boundary', () => {
        const options = createBrowserLaunchOptions({
            baseEnv: {
                HOME                       : '/safe/home',
                PATH                       : '/safe/bin',
                OPENAI_API_KEY             : 'must-not-leak',
                GH_TOKEN                   : 'must-not-leak',
                NEO_AUTH_LOCAL_BEARER_TOKEN: 'must-not-leak'
            },
            browserChannel: 'bundled',
            headed        : true
        });

        expect(options).toEqual({
            env: {
                HOME: '/safe/home',
                PATH: '/safe/bin'
            },
            headless: false
        });
        expect(options.env).not.toHaveProperty('OPENAI_API_KEY');
        expect(options.env).not.toHaveProperty('GH_TOKEN');
        expect(options.env).not.toHaveProperty('NEO_AUTH_LOCAL_BEARER_TOKEN')
    });

    test('pins all three listeners to literal loopback authority', () => {
        const args = createDevServerArgs(19001);

        expect(args.slice(args.indexOf('--host'), args.indexOf('--host') + 2))
            .toEqual(['--host', '127.0.0.1']);
        expect(args.slice(args.indexOf('--port'), args.indexOf('--port') + 2))
            .toEqual(['--port', '19001']);
    });

    test('enforces one global deadline without resetting it between phases', () => {
        const deadline = 10000;
        let   deadlineError;

        expect(getPhaseTimeout({deadline, timeoutMs: 60000, now: 9000})).toBe(1000);
        expect(getPhaseTimeout({deadline, timeoutMs: 60000, now: 9500})).toBe(500);
        try {
            getPhaseTimeout({deadline, timeoutMs: 60000, now: 10000})
        } catch (error) {
            deadlineError = error
        }

        expect(deadlineError).toMatchObject({code: 'SESSION_LIMIT_EXCEEDED'});
        expect(() => parseArgs(['--timeout-ms', String(MAX_SESSION_MS + 1)], {}))
            .toThrow(`1000..${MAX_SESSION_MS}ms`);
        expect(createCleanupDeadline(deadline)).toBeGreaterThan(deadline)
    });

    test('redacts failures into the closed public shape and fixed unexpected phase vocabulary', () => {
        const hostile = new Error(
            'Authorization: Bearer super-secret; topology={"private":true}; /tmp/neo-genesis-probe-secret'
        );
        const
            publicUnknown = toPublicProbeError(hostile),
            publicPhased  = toPublicProbeError(createProbeFailure(
                'UNEXPECTED_FAILURE',
                hostile,
                'child-readiness'
            )),
            publicForged  = toPublicProbeError(createProbeFailure(
                'UNEXPECTED_FAILURE',
                hostile,
                '/tmp/private-phase'
            )),
            publicKnown   = toPublicProbeError(createProbeFailure('TOPOLOGY_MISMATCH', hostile));

        expect(publicUnknown).toEqual({
            code   : 'UNEXPECTED_FAILURE',
            message: 'The probe failed without a public-safe classification.',
            phase  : 'unclassified'
        });
        expect(publicPhased.phase).toBe('child-readiness');
        expect(publicForged.phase).toBe('unclassified');
        expect(JSON.stringify(publicUnknown)).not.toContain('super-secret');
        expect(JSON.stringify(publicUnknown)).not.toContain('Authorization');
        expect(JSON.stringify(publicUnknown)).not.toContain('/tmp/');
        expect(JSON.stringify(publicPhased)).not.toContain('super-secret');
        expect(JSON.stringify(publicForged)).not.toContain('private-phase');
        expect(publicKnown).toEqual({
            code   : 'TOPOLOGY_MISMATCH',
            message: 'Exactly one intended BigData App Worker was not available.'
        })
    });

    test('routes SIGINT/SIGTERM once into the active wait and disposes both listeners', async () => {
        const
            controller = new AbortController(),
            target     = new EventEmitter(),
            dispose    = installProbeSignalHandlers({controller, processTarget: target}),
            pending    = withTimeout(new Promise(() => {}), 10000, 'pending probe phase', controller.signal);

        expect(target.listenerCount('SIGINT')).toBe(1);
        expect(target.listenerCount('SIGTERM')).toBe(1);

        target.emit('SIGINT');
        target.emit('SIGTERM');

        await expect(pending).rejects.toMatchObject({code: 'PROBE_INTERRUPTED'});
        expect(controller.signal.reason.code).toBe('PROBE_INTERRUPTED');

        dispose();
        expect(target.listenerCount('SIGINT')).toBe(0);
        expect(target.listenerCount('SIGTERM')).toBe(0)
    });

    test('waitForChildExit handles already-exited, racing, and bounded non-exit states', async () => {
        const alreadyExited = Object.assign(new EventEmitter(), {exitCode: 0, signalCode: null});
        const racing        = Object.assign(new EventEmitter(), {exitCode: null, signalCode: null});
        const running       = Object.assign(new EventEmitter(), {exitCode: null, signalCode: null});

        expect(await waitForChildExit(alreadyExited, 1000)).toBe(true);

        queueMicrotask(() => {
            racing.exitCode = 0;
            racing.emit('exit', 0, null)
        });

        expect(await waitForChildExit(racing, 1000)).toBe(true);
        expect(await waitForChildExit(running, 10)).toBe(false)
    });

    test('rejects an unrelated open listener until the child-private readiness marker exists', async () => {
        const
            root    = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-readiness-test-')),
            logPath = path.join(root, 'child.log'),
            server  = net.createServer(),
            child   = Object.assign(new EventEmitter(), {
                exitCode        : null,
                probeLaunchError: null,
                signalCode      : null
            });

        let connections = 0;
        server.on('connection', socket => {
            connections++;
            socket.destroy()
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve)
        });

        const port = server.address().port;

        try {
            await fsPromises.writeFile(logPath, `ready on 127.0.0.1:${port + 1}`);
            await expect(waitForChildReady({
                child,
                label    : 'unrelated listener',
                logPath,
                markers  : [`ready on 127.0.0.1:${port}`],
                port,
                timeoutMs: 150
            })).rejects.toThrow('did not prove child-owned readiness');
            expect(connections).toBe(0);

            const marker = `ready on 127.0.0.1:${port}`;

            await fsPromises.writeFile(logPath, `${marker}\n${marker}`);
            await expect(waitForChildReady({
                child,
                label        : 'duplicate marker listener',
                logPath,
                markers      : [marker],
                port,
                timeoutMs    : 1000,
                uniqueMarkers: [marker]
            })).rejects.toThrow('duplicate child-private readiness evidence');

            await fsPromises.writeFile(logPath, marker);
            await waitForChildReady({
                child,
                label        : 'marked listener',
                logPath,
                markers      : [marker],
                port,
                timeoutMs    : 1000,
                uniqueMarkers: [marker]
            });
            await expect.poll(() => connections).toBe(1)
        } finally {
            await new Promise(resolve => server.close(resolve));
            await fsPromises.rm(root, {recursive: true, force: true})
        }
    });

    test('captures asynchronous spawn failures and treats a pid-less child as stopped', async () => {
        const
            root    = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-spawn-test-')),
            logPath = path.join(root, 'missing.log'),
            child   = spawnLoggedChild({
                args   : [],
                command: path.join(root, 'missing-command'),
                env    : {PATH: process.env.PATH},
                logPath,
                name   : 'missing child'
            });

        try {
            await expect(waitForChildReady({
                child,
                label    : 'missing child',
                logPath,
                markers  : ['never-ready'],
                port     : await findFreeWorkerPort(),
                timeoutMs: 1000
            })).rejects.toMatchObject({code: 'ENOENT'});
            await expect(stopChild(child)).resolves.toMatchObject({
                leaderExited      : true,
                processGroupExited: process.platform !== 'win32'
            })
        } finally {
            await fsPromises.rm(root, {recursive: true, force: true})
        }
    });

    test('verifies process-group absence after a transient signal-send error', async () => {
        test.skip(process.platform === 'win32', 'POSIX process-group proof only');

        const
            root    = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-stop-test-')),
            logPath = path.join(root, 'child.log'),
            child   = spawnLoggedChild({
                args: ['-e', 'setInterval(() => {}, 1000)'],
                env : {PATH: process.env.PATH},
                logPath,
                name: 'transient-stop child'
            }),
            originalKill = process.kill;

        let injected = false;

        await new Promise(resolve => setTimeout(resolve, 100));
        process.kill = (pid, signal) => {
            if (!injected && pid === -child.pid && signal === 'SIGTERM') {
                injected = true;
                originalKill(pid, signal);
                const error = new Error('transient signal delivery race');
                error.code  = 'EPERM';
                throw error
            }

            return originalKill(pid, signal)
        };

        try {
            await expect(stopChild(child, 'SIGTERM', 0)).resolves.toMatchObject({
                leaderExited      : true,
                processGroupExited: true
            });
            expect(injected).toBe(true)
        } finally {
            process.kill = originalKill;
            await stopChild(child).catch(() => {});
            await fsPromises.rm(root, {recursive: true, force: true})
        }
    });

    test('records every disposable artifact and proves whole-root absence after cleanup', async () => {
        const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-manifest-test-'));

        try {
            await fsPromises.mkdir(path.join(root, 'nested'));
            await fsPromises.writeFile(path.join(root, 'memory-core.sqlite'), 'sqlite');
            await fsPromises.writeFile(path.join(root, 'nested', 'neural-link-bridge-stdio.log'), 'bridge');

            expect(await createManifest(root)).toEqual({
                rootPresent: true,
                entries    : [
                    {path: 'memory-core.sqlite', type: 'file', bytes: 6},
                    {path: 'nested', type: 'directory', bytes: expect.any(Number)},
                    {path: 'nested/neural-link-bridge-stdio.log', type: 'file', bytes: 6}
                ]
            });
        } finally {
            await fsPromises.rm(root, {recursive: true, force: true})
        }

        expect(await createManifest(root)).toEqual({rootPresent: false, entries: []})
    });

    test('keeps child-scoped isolation evidence stable while unrelated writers mutate other paths', async () => {
        const
            probeRoot     = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-attestation-test-')),
            unrelatedRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-unrelated-writer-test-')),
            sinks         = {
                database: path.join(probeRoot, 'memory-core.sqlite'),
                logs    : probeRoot
            },
            expected      = createDiagnosticPathAttestation({role: 'mcp', sinks}),
            unrelatedWal  = path.join(unrelatedRoot, 'memory-core.sqlite-wal');

        try {
            const unrelatedLog = path.join(unrelatedRoot, 'neural-link.log');

            await fsPromises.writeFile(unrelatedWal, 'before');
            await fsPromises.writeFile(unrelatedLog, 'before');

            const ambientBefore = await createManifest(unrelatedRoot);

            const before = attestDiagnosticPaths({
                expectedCommitment: expected.commitment,
                role              : 'mcp',
                sinks
            });

            await fsPromises.appendFile(unrelatedWal, '-concurrent-change');
            await fsPromises.appendFile(unrelatedLog, '-concurrent-change');

            const ambientAfter = await createManifest(unrelatedRoot);

            expect(attestDiagnosticPaths({
                expectedCommitment: expected.commitment,
                role              : 'mcp',
                sinks
            })).toBe(before);
            expect(ambientAfter).not.toEqual(ambientBefore);
            expect(before).toBe(expected.marker);
            expect(before).not.toContain(probeRoot);
            expect(before).not.toContain(unrelatedRoot)
        } finally {
            await Promise.all([
                fsPromises.rm(probeRoot, {recursive: true, force: true}),
                fsPromises.rm(unrelatedRoot, {recursive: true, force: true})
            ])
        }
    });

    test('fails path-attestation mismatches without exposing paths or commitments', () => {
        const
            expectedPath = path.join(os.tmpdir(), 'expected-private-root'),
            actualPath   = path.join(os.tmpdir(), 'unexpected-private-root'),
            expected     = createDiagnosticPathAttestation({
                role : 'mcp',
                sinks: {database: path.join(expectedPath, 'memory-core.sqlite'), logs: expectedPath}
            });

        let error;

        try {
            attestDiagnosticPaths({
                expectedCommitment: expected.commitment,
                role              : 'mcp',
                sinks             : {database: path.join(actualPath, 'memory-core.sqlite'), logs: actualPath}
            })
        } catch (caught) {
            error = caught
        }

        expect(error?.code).toBe(GENESIS_DIAGNOSTIC_PATH_MISMATCH);
        expect(error?.message).not.toContain(expectedPath);
        expect(error?.message).not.toContain(actualPath);
        expect(error?.message).not.toContain(expected.commitment);
        expect(() => createDiagnosticPathAttestation({
            role : 'mcp',
            sinks: {logs: expectedPath}
        })).toThrow('complete writable-sink role set');
        expect(() => createDiagnosticPathAttestation({
            role : 'mcp',
            sinks: {database: expectedPath, logs: expectedPath, extra: expectedPath}
        })).toThrow('complete writable-sink role set')
    });

    test('deletes an authorized root even when aggregate telemetry evidence is unreadable', async () => {
        // The evidence is a seat-written JSON aggregate since the NL data relocation, so a corrupt one
        // is what "unreadable" now means. The subject is unchanged: a failed capture must not become a
        // veto that strands the disposable root on disk. Corrupt-but-present still RAISES — an absent
        // file is the separate "nothing recorded" answer and would leave `failures` empty here.
        const
            root          = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-cleanup-test-')),
            aggregatePath = path.join(root, 'nl-action-aggregate.json');

        await fsPromises.writeFile(aggregatePath, '{not-json', 'utf8');

        const result = await finalizeDisposableRoot({
            aggregatePath,
            deletionAuthorized: true,
            root
        });

        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].label).toBe('Aggregate telemetry read');
        expect(result.beforeManifest.rootPresent).toBe(true);
        expect(result.afterManifest).toEqual({rootPresent: false, entries: []});
        expect(await createManifest(root)).toEqual({rootPresent: false, entries: []})
    });

    test('unwraps standard SDK tool payloads and surfaces MCP errors', () => {
        expect(readToolJson({structuredContent: {result: [{appName: 'BigData'}]}}))
            .toEqual([{appName: 'BigData'}]);
        expect(readToolJson({content: [{type: 'text', text: '{"status":"healthy"}'}]}))
            .toEqual({status: 'healthy'});
        expect(() => readToolJson({isError: true, content: [{type: 'text', text: 'denied'}]}))
            .toThrow('denied');
        expect(hasChildExited({exitCode: null, signalCode: null})).toBe(false);
        expect(hasChildExited({exitCode: null, signalCode: 'SIGTERM'})).toBe(true);
    });

    test('the standalone Bridge binds the AiConfig-owned non-default port', async () => {
        const
            root    = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-bridge-test-')),
            port    = await findFreeWorkerPort(),
            logPath = path.join(root, 'bridge.log'),
            child   = spawnLoggedChild({
                args: [path.resolve(process.cwd(), 'ai/mcp/server/neural-link/run-bridge.mjs')],
                env : {
                    PATH                     : process.env.PATH,
                    HOME                     : process.env.HOME,
                    NEO_DEBUG                : 'false',
                    NEO_NL_LOG_PATH          : root,
                    NEO_NL_PORT              : String(port),
                    NEO_TEST_CONFIG_TEMPLATES: 'false',
                    UNIT_TEST_MODE           : 'true'
                },
                logPath,
                name: 'test Neural Link Bridge'
            });

        let stopResult;

        try {
            await waitForChildReady({
                child,
                label    : 'test Neural Link Bridge',
                logPath,
                markers  : [`Bridge: Listening on 127.0.0.1:${port}`],
                port,
                timeoutMs: 15000
            });
            expect(await fsPromises.readFile(logPath, 'utf8')).toContain(`Listening on 127.0.0.1:${port}`)
        } finally {
            stopResult = await stopChild(child, 'SIGINT');
            await fsPromises.rm(root, {recursive: true, force: true})
        }

        expect(stopResult.leaderExited).toBe(true);

        if (process.platform !== 'win32') {
            expect(stopResult.processGroupExited).toBe(true);
            expect(isProcessGroupAlive(child.pid)).toBe(false)
        }
    });
});
