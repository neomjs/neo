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
        const mockAiConfig = { mcpHttpPort: testPort, auth: {} };
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

    test.describe('resolveAuthContext proxy-identity injection', () => {
        let TransportService;

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
        });

        test('OIDC precedence: native req.auth overrides proxy headers', () => {
            const req = {
                auth: { userId: 'oidc-user', username: 'oidc-user', source: 'jwt' },
                headers: { 'x-preferred-username': 'spoofed-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId: 'oidc-user',
                username: 'oidc-user',
                source: 'jwt'
            });
        });

        test('Active proxy identity injection (canonical header)', () => {
            const req = {
                auth: undefined,
                headers: { 'x-preferred-username': 'proxy-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId: 'proxy-user',
                username: 'proxy-user',
                source: 'proxy-header'
            });
        });

        test('OAuth2-proxy variant header fallback', () => {
            const req = {
                auth: undefined,
                headers: { 'x-auth-request-preferred-username': 'oauth2-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId: 'oauth2-user',
                username: 'oauth2-user',
                source: 'proxy-header'
            });
        });

        test('Gate-disabled behavior: ignores headers when trustProxyIdentity is false', () => {
            const req = {
                auth: undefined,
                headers: { 'x-preferred-username': 'ignored-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: false } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toBeUndefined();
        });

        test('Both headers provided: prioritizes canonical over oauth2-proxy', () => {
            const req = {
                auth: undefined,
                headers: {
                    'x-preferred-username': 'primary-user',
                    'x-auth-request-preferred-username': 'secondary-user'
                }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId: 'primary-user',
                username: 'primary-user',
                source: 'proxy-header'
            });
        });

        test('Header-spoof resistance / required identity: returns 401 when enabled but headers are missing', () => {
            const req = {
                auth: undefined,
                headers: {}
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBe('Unauthorized: Missing proxy identity header');
            expect(result.status).toBe(401);
            expect(result.auth).toBeUndefined();
        });
    });

    test.describe('mcpServerUrl resolution (publicUrl branch)', () => {
        let TransportService;

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
        });

        test.afterEach(() => {
            if (TransportService.app) {
                TransportService.destroy();
            }
        });

        test('uses aiConfig.publicUrl when set', async () => {
            const originalHost = process.env.HOST;
            process.env.HOST = 'internal-host';

            await TransportService.setup({
                server: { mcpServer: { connect: async () => {} } },
                aiConfig: { publicUrl: 'https://public.example.com', mcpHttpPort: 3000, auth: {} },
                logger: { info: () => {} },
                resourceName: 'Test'
            });

            expect(TransportService.mcpServerUrl.href).toBe('https://public.example.com/');
            process.env.HOST = originalHost;
        });

        test('falls back to HOST and port when publicUrl is unset', async () => {
            const originalHost = process.env.HOST;
            process.env.HOST = 'internal-host';

            await TransportService.setup({
                server: { mcpServer: { connect: async () => {} } },
                aiConfig: { mcpHttpPort: 3000, auth: {} },
                logger: { info: () => {} },
                resourceName: 'Test'
            });

            expect(TransportService.mcpServerUrl.href).toBe('https://internal-host:3000/');
            process.env.HOST = originalHost;
        });

        test('falls back to HOST and port when publicUrl is empty string', async () => {
            const originalHost = process.env.HOST;
            process.env.HOST = 'internal-host';

            await TransportService.setup({
                server: { mcpServer: { connect: async () => {} } },
                aiConfig: { publicUrl: '', mcpHttpPort: 3000, auth: {} },
                logger: { info: () => {} },
                resourceName: 'Test'
            });

            expect(TransportService.mcpServerUrl.href).toBe('https://internal-host:3000/');
            process.env.HOST = originalHost;
        });
    });

});
