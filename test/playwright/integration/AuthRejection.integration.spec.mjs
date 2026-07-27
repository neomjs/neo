import {test, expect} from '@playwright/test';
import {
    callJsonTool,
    createIdentityClient,
    getReadiness
} from './fixtures/mcpClient.mjs';

const MC_URL                = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';
const REFERENCE_INGRESS_URL = process.env.NEO_INTEGRATION_REFERENCE_INGRESS_URL || 'http://127.0.0.1:13004';

/**
 * @summary Sends a real MCP initialize request through the documented Caddy reference ingress.
 * @param {String} pathName Ingress path (`/mc/mcp` or `/kb/mcp`)
 * @param {Object} headers Test-control and caller-supplied headers
 * @returns {Promise<Response>} HTTP response from the upstream MCP server or auth boundary
 */
function initializeThroughReferenceIngress(pathName, headers) {
    return fetch(`${REFERENCE_INGRESS_URL}${pathName}`, {
        method : 'POST',
        headers: {
            Accept        : 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id     : 1,
            method : 'initialize',
            params : {
                protocolVersion: '2024-11-05',
                capabilities   : {},
                clientInfo     : {name: 'reference-ingress-test', version: '1.0.0'}
            }
        })
    })
}

test.describe('Dockerized MC proxy identity rejection integration (#10895)', () => {
    test('MC rejects missing proxy identity and accepts an identity-bearing client', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        let rejectionError;
        let unexpectedClient;

        try {
            unexpectedClient = await createIdentityClient({
                baseUrl   : MC_URL,
                clientName: 'neo-integration-auth-rejection'
            });
        } catch (error) {
            rejectionError = error;
        } finally {
            await unexpectedClient?.close();
        }

        expect(rejectionError).toBeTruthy();
        expect(String(rejectionError?.message || rejectionError)).toMatch(/401|Unauthorized/i);

        const client = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-auth-positive',
            identity  : 'alice-auth-positive'
        });

        try {
            // The 401 rejection above (missing proxy identity) and this successful
            // identity-bearing healthcheck together prove the proxy-header auth path is active.
            // Auth-path observability is a runtime concern, no longer a static healthcheck field.
            const health = await callJsonTool(client, 'healthcheck');

            expect(health.status).toBe('healthy');
        } finally {
            await client.close();
        }
    });

    test('#15992: reference ingress strips caller identity and injects only authenticated identity', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        for (const pathName of ['/mc/mcp', '/kb/mcp']) {
            const spoofed = await initializeThroughReferenceIngress(pathName, {
                'X-Preferred-Username': 'caller-spoof',
                'X-Test-Auth-Mode'    : 'allow-without-identity'
            });

            expect(spoofed.status).toBe(401);
            expect(spoofed.headers.get('mcp-session-id')).toBeNull();

            const authenticated = await initializeThroughReferenceIngress(pathName, {
                'X-Preferred-Username'     : 'caller-spoof',
                'X-Test-Authenticated-User': 'trusted-proxy-user'
            });

            expect(authenticated.status).toBe(200);
            expect(authenticated.headers.get('mcp-session-id')).toBeTruthy()
        }
    });
});
