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
import os             from 'os';
import path           from 'path';
import {EventEmitter} from 'events';
import {
    MAX_SESSION_MS,
    assertDiagnosticPathsWithinRoot,
    canonicalizeOracle,
    createBrowserLaunchOptions,
    createDevServerArgs,
    createManifest,
    createOracleCommitment,
    createProbeFailure,
    createProbeEnvironments,
    finalizeDisposableRoot,
    findFreePort,
    getPhaseTimeout,
    hasChildExited,
    installProbeSignalHandlers,
    isProcessGroupAlive,
    parseArgs,
    parsePort,
    readToolJson,
    spawnLoggedChild,
    stopChild,
    snapshotSqliteFamily,
    toPublicProbeError,
    waitForChildExit,
    waitForPort,
    withTimeout
} from '../../../../../../ai/scripts/diagnostics/genesisProbe.mjs';

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
    });

    test('redacts unknown and classified failures into a closed public shape', () => {
        const hostile = new Error(
            'Authorization: Bearer super-secret; topology={"private":true}; /tmp/neo-genesis-probe-secret'
        );
        const publicUnknown = toPublicProbeError(hostile);
        const publicKnown   = toPublicProbeError(createProbeFailure('TOPOLOGY_MISMATCH', hostile));

        expect(publicUnknown).toEqual({
            code   : 'UNEXPECTED_FAILURE',
            message: 'The probe failed without a public-safe classification.'
        });
        expect(JSON.stringify(publicUnknown)).not.toContain('super-secret');
        expect(JSON.stringify(publicUnknown)).not.toContain('Authorization');
        expect(JSON.stringify(publicUnknown)).not.toContain('/tmp/');
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

    test('detects default SQLite WAL changes even when the main database stays untouched', async () => {
        const
            root         = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-sqlite-family-test-')),
            databasePath = path.join(root, 'memory-core.sqlite'),
            walPath      = `${databasePath}-wal`;

        try {
            await fsPromises.writeFile(databasePath, 'main-database');
            await fsPromises.writeFile(walPath, 'wal-before');

            const before = await snapshotSqliteFamily(databasePath);

            await fsPromises.appendFile(walPath, '-changed');

            const after = await snapshotSqliteFamily(databasePath);

            expect(after.database).toEqual(before.database);
            expect(after.wal).not.toEqual(before.wal);
            expect(after.shm).toEqual({exists: false});
            expect(JSON.stringify(after)).not.toBe(JSON.stringify(before))
        } finally {
            await fsPromises.rm(root, {recursive: true, force: true})
        }
    });

    test('deletes an authorized root even when aggregate telemetry evidence is unreadable', async () => {
        const
            root         = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-cleanup-test-')),
            databasePath = path.join(root, 'memory-core.sqlite'),
            Database     = (await import('better-sqlite3')).default,
            database     = new Database(databasePath);

        database.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
        database.close();

        const result = await finalizeDisposableRoot({
            databasePath,
            defaultPaths      : null,
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
            port    = await findFreePort(),
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
            await waitForPort({child, label: 'test Neural Link Bridge', port, timeoutMs: 15000});
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
