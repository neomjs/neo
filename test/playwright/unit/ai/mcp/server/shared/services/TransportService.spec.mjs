import {setup} from '../../../../../../setup.mjs';

const appName = 'TransportServiceTest';

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

import { test, expect } from '@playwright/test';
import http from 'http';
import Neo from '../../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../../src/core/_export.mjs';

test.describe('Neo.ai.mcp.server.shared.services.TransportService', () => {

    test('onsessionclosed hook removes transport and calls server.onSessionClosed via actual HTTP request', async () => {
        const TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;

        let closedSessionId = null;
        let resolveClosed;
        const closedPromise = new Promise(resolve => resolveClosed = resolve);

        const mockServer = {
            mcpServer: { connect: async () => {} },
            onSessionClosed: (id) => {
                closedSessionId = id;
                resolveClosed();
            }
        };

        const testPort = 3125;
        const mockAiConfig = { ssePort: testPort, auth: {} };
        const mockLogger = { info: () => {} };

        // Setup the real transport service which starts the Express app
        await TransportService.setup({
            server: mockServer,
            aiConfig: mockAiConfig,
            logger: mockLogger,
            resourceName: 'TestResource'
        });

        // 1. Initialize the session via POST
        const initResponse = await fetch(`http://localhost:${testPort}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: { name: "test", version: "1.0.0" }
                }
            })
        });

        const sessionId = initResponse.headers.get('mcp-session-id');

        // 2. Terminate the session via DELETE
        // This triggers handleDeleteRequest -> onsessionclosed
        await fetch(`http://localhost:${testPort}/mcp`, {
            method: 'DELETE',
            headers: {
                'mcp-session-id': sessionId,
                'mcp-protocol-version': '2024-11-05'
            }
        });

        // Wait for the server-side callback to fire
        await closedPromise;

        // Verify the server's onSessionClosed was called with a valid string ID
        expect(typeof closedSessionId).toBe('string');
        expect(closedSessionId.length).toBeGreaterThan(0);

        // Verify the transport service map was cleaned up
        expect(TransportService.transports.has(closedSessionId)).toBe(false);

        TransportService.destroy();
    });

});
