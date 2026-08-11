import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ConnectionServiceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}            from '@playwright/test';
import fs                        from 'fs';
import os                        from 'os';
import path                      from 'path';
import Neo                       from '../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../src/core/_export.mjs';
import {STALE_BRIDGE_ERROR_CODE} from '../../../../../../ai/mcp/server/neural-link/BridgeProtocol.mjs';

/**
 * @summary Unit coverage for Neural Link connection freshness and Bridge process boundaries.
 *
 * These tests deliberately stub `connectToBridge` / `spawnBridge` rather than opening a WebSocket:
 * importing the singleton is safe because `unitTestMode` suppresses auto-connect, and the branch logic
 * is what decides whether a stale shared Bridge is reused, spawned over, or failed loudly.
 */
test.describe('Neo.ai.services.neural-link.ConnectionService — bridge freshness gate (#13299)', () => {
    let ConnectionService, getBridgeStdioLogPath, logBridgePayload,
        normalizeBridgePayloadDebugMaxChars, stringifyBridgePayloadForDebug,
        originalConnectToBridge, originalCwd, originalOpenBridgeLogFile,
        originalSpawnBridge, originalSpawnBridgeProcess;

    test.beforeAll(async () => {
        const module = await import('../../../../../../ai/services/neural-link/ConnectionService.mjs');

        ConnectionService                    = module.default;
        getBridgeStdioLogPath                = module.getBridgeStdioLogPath;
        logBridgePayload                     = module.logBridgePayload;
        normalizeBridgePayloadDebugMaxChars  = module.normalizeBridgePayloadDebugMaxChars;
        stringifyBridgePayloadForDebug       = module.stringifyBridgePayloadForDebug;
    });

    test.beforeEach(() => {
        originalConnectToBridge    = ConnectionService.connectToBridge;
        originalCwd                = ConnectionService.cwd;
        originalOpenBridgeLogFile  = ConnectionService.openBridgeLogFile;
        originalSpawnBridge        = ConnectionService.spawnBridge;
        originalSpawnBridgeProcess = ConnectionService.spawnBridgeProcess;
        ConnectionService.bridgeSocket = null;
    });

    test.afterEach(() => {
        ConnectionService.connectToBridge      = originalConnectToBridge;
        ConnectionService.cwd                  = originalCwd;
        ConnectionService.openBridgeLogFile    = originalOpenBridgeLogFile;
        ConnectionService.spawnBridge          = originalSpawnBridge;
        ConnectionService.spawnBridgeProcess   = originalSpawnBridgeProcess;
        ConnectionService.bridgeProcess        = null;
        ConnectionService.bridgeSocket         = null;
    });

    test('builds the Bridge URL from an explicit port and encoded fleet token', () => {
        const url = ConnectionService.createBridgeUrl({
            agentId: 'agent-test',
            port   : 19081,
            token  : 'token with spaces'
        });

        expect(url).toBe('ws://127.0.0.1:19081/?role=agent&id=agent-test&token=token+with+spaces');
    });

    test('resolves Bridge stdio logs only under the injected Neural Link log directory', () => {
        const logDir = path.resolve(os.tmpdir(), `nl-bridge-stdio-path-${process.pid}`);

        expect(getBridgeStdioLogPath({logPath: logDir}))
            .toBe(path.join(logDir, 'neural-link-bridge-stdio.log'));
        expect(() => getBridgeStdioLogPath({
            cwd       : '/repo',
            logPath   : '',
            neoRootDir: '/repo'
        })).toThrow(/aiConfig\.logPath/);
        expect(() => getBridgeStdioLogPath({logPath: '  '})).toThrow(/aiConfig\.logPath/);
    });

    test('fails before opening or spawning when the injected log directory is absent', async () => {
        let opened = false, spawned = false;

        ConnectionService.openBridgeLogFile = () => {
            opened = true;
        };
        ConnectionService.spawnBridgeProcess = () => {
            spawned = true;
        };

        await expect(ConnectionService.spawnBridge({
            logPath       : '',
            neoRootDir    : '/real-seat',
            startupDelayMs: 0
        })).rejects.toThrow(/aiConfig\.logPath/);

        expect(opened).toBe(false);
        expect(spawned).toBe(false);
    });

    test('writes Bridge stdio only inside an injected overlay path on a real-dir seat', () => {
        const
            seatRoot         = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-bridge-real-seat-')),
            canonicalLogPath = path.join(seatRoot, '.neo-ai-data', 'logs'),
            overlayLogDir    = path.join(seatRoot, '.neo-ai-data-overlay', 'logs'),
            overlayLogPath   = getBridgeStdioLogPath({logPath: overlayLogDir}),
            fd               = ConnectionService.openBridgeLogFile(overlayLogPath);

        fs.closeSync(fd);

        try {
            expect(fs.existsSync(overlayLogDir)).toBe(true);
            expect(fs.existsSync(overlayLogPath)).toBe(true);
            expect(fs.existsSync(canonicalLogPath)).toBe(false);
        } finally {
            fs.rmSync(seatRoot, {recursive: true, force: true});
        }
    });

    test('wires spawned Bridge stdio to the configured log file without launching it (#13899)', async () => {
        const logDir = path.resolve(os.tmpdir(), `nl-bridge-stdio-spawn-${process.pid}-${Date.now()}`);

        let openedPath, spawnCall, unrefCalled = false;

        ConnectionService.openBridgeLogFile = filePath => {
            openedPath = filePath;
            return 42
        };
        ConnectionService.spawnBridgeProcess = (command, args, options) => {
            spawnCall = {command, args, options};

            return {
                unref() {
                    unrefCalled = true
                }
            }
        };

        // A real caller's cwd comes from the MCP entrypoint's `--cwd`. This arm previously supplied
        // none and still spawned, because `this.cwd || process.cwd()` invented one — the test relied
        // on the very fallback that put `/` in front of `npm run`.
        ConnectionService.cwd = '/real-seat';

        await ConnectionService.spawnBridge({logPath: logDir, startupDelayMs: 0});

        expect(spawnCall.options.cwd, 'the entrypoint-supplied cwd reaches the spawn').toBe('/real-seat');
        expect(openedPath).toBe(path.join(logDir, 'neural-link-bridge-stdio.log'));
        expect(path.basename(openedPath)).not.toBe('bridge.log');
        expect(spawnCall.command).toBe('npm');
        expect(spawnCall.args).toEqual(['run', 'ai:server-neural-link']);
        expect(spawnCall.options.stdio).toEqual(['ignore', 42, 42]);
        expect(unrefCalled).toBe(true);
    });

    /**
     * @summary An unresolved working directory must fail loudly, never substitute one.
     *
     * `this.cwd || process.cwd()` looked like a sensible default and was a wrong-value substitution.
     * A GUI-launched MCP server has `process.cwd() === '/'`, so `npm run` looked for `/package.json`,
     * the Bridge never started, and the resulting ECONNREFUSED took the whole server down — the seat
     * lost every Neural Link tool for the session. The cwd IS supplied, by the entrypoint's `--cwd`;
     * the singleton is just constructed at import and an auto-connect can outrun that assignment.
     *
     * The error names the missing input, where `/` named nothing and
     * surfaced as an ENOENT three layers away.
     */
    test('#16429: an unresolved cwd fails with a named error and spawns nothing', async () => {
        const logDir = path.resolve(os.tmpdir(), `nl-bridge-nocwd-${process.pid}-${Date.now()}`);

        let spawned = false;

        ConnectionService.openBridgeLogFile   = () => 42;
        ConnectionService.spawnBridgeProcess  = () => { spawned = true };
        ConnectionService.cwd                 = null;

        await expect(ConnectionService.spawnBridge({logPath: logDir, startupDelayMs: 0}))
            .rejects.toThrow(/`cwd` is unresolved/);

        expect(spawned, 'no process is launched against an invented directory').toBe(false);
    });

    test('#16429: spawnBridge HONORS startupDelayMs instead of a hardcoded wait', async () => {
        // The body ignored its own parameter and always waited 2000ms, so every caller's value was
        // silently discarded and the contract could not be tested. Measured Bridge bind is ~498ms —
        // this is a correctness fix, not a latency one.
        const logDir = path.resolve(os.tmpdir(), `nl-bridge-delay-${process.pid}-${Date.now()}`);

        ConnectionService.openBridgeLogFile  = () => 42;
        ConnectionService.spawnBridgeProcess = () => ({unref() {}});
        ConnectionService.cwd                = '/real-seat';

        const startedAt = Date.now();

        await ConnectionService.spawnBridge({logPath: logDir, startupDelayMs: 0});

        // Generous bound: the point is that it does not wait the discarded 2000ms literal.
        expect(Date.now() - startedAt, 'a 0ms delay must not wait two seconds').toBeLessThan(500);
    });

    test('logs bridge receives as bounded metadata when debug is disabled (#13473)', () => {
        const
            largeResult = `payload-${'x'.repeat(500)}`,
            calls       = [],
            testLogger  = {
                debug: (...args) => calls.push({level: 'debug', text: args.join(' ')}),
                info : (...args) => calls.push({level: 'info',  text: args.join(' ')})
            };

        logBridgePayload({
            type       : 'app_message',
            appWorkerId: 'app-worker-1',
            message    : {
                id    : 42,
                method: 'get_component_tree',
                result: {
                    tree: largeResult
                }
            }
        }, {
            logger  : testLogger,
            debug   : false,
            maxChars: 80
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].level).toBe('info');
        expect(calls[0].text).toContain('type=app_message');
        expect(calls[0].text).toContain('appWorkerId=app-worker-1');
        expect(calls[0].text).toContain('messageId=42');
        expect(calls[0].text).toContain('method=get_component_tree');
        expect(calls[0].text).toContain('payloadBytes=');
        expect(calls[0].text).not.toContain(largeResult);
        expect(calls[0].text).not.toContain('result');
    });

    test('caps full bridge payload detail behind opt-in debug logging (#13473)', () => {
        const
            largeValue = `debug-${'y'.repeat(300)}`,
            calls      = [],
            testLogger = {
                debug: (...args) => calls.push({level: 'debug', text: args.join(' ')}),
                info : (...args) => calls.push({level: 'info',  text: args.join(' ')})
            };

        logBridgePayload({
            type       : 'app_message',
            appWorkerId: 'app-worker-2',
            message    : {
                id    : 7,
                method: 'inspect',
                result: {largeValue}
            }
        }, {
            logger  : testLogger,
            debug   : true,
            maxChars: 90
        });

        expect(calls.map(call => call.level)).toEqual(['info', 'debug']);
        expect(calls[1].text).toContain('[ConnectionService] Bridge payload ');
        expect(calls[1].text).toContain('... [truncated ');
        expect(calls[1].text.length).toBeLessThan(170);
        expect(calls[1].text).not.toContain('y'.repeat(120));
    });

    test('serializes circular debug payloads without throwing (#13473)', () => {
        const circular = {type: 'app_message'};
        circular.self = circular;

        expect(() => stringifyBridgePayloadForDebug(circular, 40)).not.toThrow();
        expect(stringifyBridgePayloadForDebug(circular, 40)).toBe('[object Object]');
    });

    test('fails loudly instead of shadowing the AiConfig debug payload cap default (#13473)', () => {
        expect(() => normalizeBridgePayloadDebugMaxChars(undefined)).toThrow(/bridgePayloadDebugMaxChars/);
        expect(() => normalizeBridgePayloadDebugMaxChars(0)).toThrow(/bridgePayloadDebugMaxChars/);
    });

    test('spawns a Bridge only when the first connection attempt is a missing listener', async () => {
        let attempts = 0,
            spawned  = false;

        ConnectionService.connectToBridge = async () => {
            attempts++;

            if (attempts === 1) {
                throw new Error('connect ECONNREFUSED 127.0.0.1:8081')
            }
        };
        ConnectionService.spawnBridge = async () => {
            spawned = true;
        };

        await ConnectionService.ensureBridgeAndConnect();

        expect(attempts).toBe(2);
        expect(spawned).toBe(true);
    });

    test('fails loudly instead of spawning over a reachable stale Bridge', async () => {
        let   spawned    = false;
        const staleError = new Error('Stale Neural Link Bridge on port 8081: missing bridge_info freshness handshake.');
        staleError.code  = STALE_BRIDGE_ERROR_CODE;

        ConnectionService.connectToBridge = async () => {
            throw staleError
        };
        ConnectionService.spawnBridge = async () => {
            spawned = true;
        };

        await expect(ConnectionService.ensureBridgeAndConnect()).rejects.toThrow(/Stale Neural Link Bridge/);

        expect(spawned).toBe(false);
    });
});
