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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {STALE_BRIDGE_ERROR_CODE} from '../../../../../../ai/mcp/server/neural-link/BridgeProtocol.mjs';

/**
 * @summary Unit coverage for the Neural Link ConnectionService freshness gate.
 *
 * These tests deliberately stub `connectToBridge` / `spawnBridge` rather than opening a WebSocket:
 * importing the singleton is safe because `unitTestMode` suppresses auto-connect, and the branch logic
 * is what decides whether a stale shared Bridge is reused, spawned over, or failed loudly.
 */
test.describe('Neo.ai.services.neural-link.ConnectionService — bridge freshness gate (#13299)', () => {
    let ConnectionService, logBridgePayload,
        normalizeBridgePayloadDebugMaxChars, stringifyBridgePayloadForDebug,
        originalConnectToBridge, originalSpawnBridge;

    test.beforeAll(async () => {
        const module = await import('../../../../../../ai/services/neural-link/ConnectionService.mjs');

        ConnectionService                    = module.default;
        logBridgePayload                     = module.logBridgePayload;
        normalizeBridgePayloadDebugMaxChars  = module.normalizeBridgePayloadDebugMaxChars;
        stringifyBridgePayloadForDebug       = module.stringifyBridgePayloadForDebug;
    });

    test.beforeEach(() => {
        originalConnectToBridge = ConnectionService.connectToBridge;
        originalSpawnBridge     = ConnectionService.spawnBridge;
        ConnectionService.bridgeSocket = null;
    });

    test.afterEach(() => {
        ConnectionService.connectToBridge = originalConnectToBridge;
        ConnectionService.spawnBridge     = originalSpawnBridge;
        ConnectionService.bridgeSocket    = null;
    });

    test('builds the Bridge URL from an explicit port and encoded fleet token', () => {
        const url = ConnectionService.createBridgeUrl({
            agentId: 'agent-test',
            port   : 19081,
            token  : 'token with spaces'
        });

        expect(url).toBe('ws://127.0.0.1:19081/?role=agent&id=agent-test&token=token+with+spaces');
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
        let spawned = false;
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
