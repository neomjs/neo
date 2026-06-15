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
    let ConnectionService, originalConnectToBridge, originalSpawnBridge;

    test.beforeAll(async () => {
        ConnectionService = (await import('../../../../../../ai/services/neural-link/ConnectionService.mjs')).default;
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
