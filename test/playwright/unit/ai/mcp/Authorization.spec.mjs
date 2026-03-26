/**
 * @summary Functional tests for MCP OIDC/OAuth 2.1 Authorization.
 *
 * This test suite verifies the **Authorization Anchor** implementation for Neo.mjs MCP servers.
 * It simulates a complete **Logical Handshake** between an AI agent (Playwright) and the
 * Knowledge Base server by mocking a standard OIDC identity provider.
 *
 * Testing Strategy:
 * 1. **Identity Simulation:** Mocks OIDC discovery and introspection endpoints.
 * 2. **Process Orchestration:** Spawns the MCP server in a separate Node.js process with
 *    custom environment variables to simulate a real IaC deployment.
 * 3. **Handshake Verification:** Validates 401 (Unauthorized), 200 (Authorized with SSE),
 *    CORS headers, and Protected Resource Metadata (PRM) discovery.
 */
import {test, expect}  from '@playwright/test';
import {spawn}         from 'child_process';
import path            from 'path';
import {fileURLToPath} from 'url';
import express         from 'express';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, '../../../../../ai/mcp/server/knowledge-base/mcp-server.mjs');

test.describe('MCP Server OIDC/OAuth 2.1 Authorization (Functional)', () => {
    test.describe.configure({mode: 'serial'});
    let mockOidcServer;
    let mcpServerProcess;
    const MOCK_OIDC_PORT = 8888;
    const MCP_SSE_PORT   = 3333;
    const TEST_TOKEN     = 'valid-test-token';
    const TEST_CLIENT_ID = 'test-client';

    test.beforeAll(async () => {
        // 1. Start Mock OIDC Provider
        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({extended: true}));

        // Discovery Endpoint
        app.get('/realms/test/.well-known/openid-configuration', (req, res) => {
            const baseUrl = `http://localhost:${MOCK_OIDC_PORT}/realms/test`;
            res.json({
                issuer                  : baseUrl,
                authorization_endpoint  : `${baseUrl}/protocol/openid-connect/auth`,
                token_endpoint          : `${baseUrl}/protocol/openid-connect/token`,
                introspection_endpoint  : `${baseUrl}/protocol/openid-connect/token/introspect`,
                response_types_supported: ['code']
            });
        });

        // Introspection Endpoint
        app.post('/realms/test/protocol/openid-connect/token/introspect', (req, res) => {
            const {token, client_id} = req.body;

            if (token === TEST_TOKEN && client_id === TEST_CLIENT_ID) {
                res.json({
                    active   : true,
                    client_id: TEST_CLIENT_ID,
                    scope    : 'mcp:tools',
                    aud      : ['http://localhost:3333', 'http://localhost:3334'],
                    exp      : Math.floor(Date.now() / 1000) + 3600
                });
            } else {
                res.json({active: false});
            }
        });

        mockOidcServer = app.listen(MOCK_OIDC_PORT);
        console.log(`[Test] Mock OIDC Server listening on port ${MOCK_OIDC_PORT}`);

        // 2. Start MCP Server in SSE mode with Auth enabled
        mcpServerProcess = spawn('node', [SERVER_PATH, '--debug'], {
            env: {
                ...process.env,
                TRANSPORT      : 'sse',
                SSE_PORT       : MCP_SSE_PORT.toString(),
                AUTO_SYNC      : 'false',
                AUTO_SUMMARIZE : 'false',
                AUTH_HOST      : 'localhost',
                AUTH_PORT      : MOCK_OIDC_PORT.toString(),
                AUTH_REALM     : 'test',
                OAUTH_CLIENT_ID: TEST_CLIENT_ID,
                HOST           : 'localhost'
            }
        });

        // Wait for server to start
        await new Promise((resolve, reject) => {
            mcpServerProcess.stdout.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('Server started on SSE transport')) {
                    resolve();
                }
            });
            mcpServerProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                console.error(`[MCP Server Error] ${msg}`);
                // Often SSE server logs to stderr
                if (msg.includes('Server started on SSE transport')) {
                    resolve();
                }
            });
            setTimeout(() => reject(new Error('MCP Server startup timeout')), 20000);
        });
    });

    test.afterAll(async () => {
        if (mcpServerProcess) {
            mcpServerProcess.kill();
        }
        if (mockOidcServer) {
            await new Promise(resolve => mockOidcServer.close(resolve));
        }
    });

    test('should return 401 when no token is provided', async ({request}) => {
        const response = await request.post(`http://localhost:${MCP_SSE_PORT}/mcp`);
        expect(response.status()).toBe(401);
    });

    test('should return 401 when an invalid token is provided', async ({request}) => {
        const response = await request.post(`http://localhost:${MCP_SSE_PORT}/mcp`, {
            headers: {
                'Authorization': 'Bearer invalid-token'
            }
        });
        expect(response.status()).toBe(401);
    });

    test('should allow access with a valid token', async ({request}) => {
        const response = await request.post(`http://localhost:${MCP_SSE_PORT}/mcp`, {
            headers: {
                'Authorization': `Bearer ${TEST_TOKEN}`,
                'Content-Type' : 'application/json',
                'Accept'       : 'application/json, text/event-stream'
            },
            data   : {
                jsonrpc: '2.0',
                id     : 1,
                method : 'initialize',
                params : {
                    protocolVersion: '2024-11-05',
                    capabilities   : {},
                    clientInfo     : {name: 'test-client', version: '1.0.0'}
                }
            }
        });

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/event-stream');

        const body = await response.text();
        expect(body).toContain('event: message');
        expect(body).toContain('protocolVersion');
        expect(body).toContain('2024-11-05');
    });

    test('should verify CORS headers are present', async ({request}) => {
        const response = await request.fetch(`http://localhost:${MCP_SSE_PORT}/mcp`, {
            method : 'OPTIONS',
            headers: {
                'Origin'                        : 'http://localhost:3000',
                'Access-Control-Request-Method' : 'POST',
                'Access-Control-Request-Headers': 'Authorization'
            }
        });

        expect(response.headers()['access-control-allow-origin']).toBe('*');
        expect(response.headers()['access-control-expose-headers']).toContain('Mcp-Session-Id');
    });

    test('should serve OAuth metadata at discovery endpoint', async ({request}) => {
        const response = await request.get(`http://localhost:${MCP_SSE_PORT}/.well-known/oauth-protected-resource`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.resource).toBe(`http://localhost:${MCP_SSE_PORT}/`);
        expect(body.authorization_servers).toContain(`http://localhost:${MOCK_OIDC_PORT}/realms/test/`);
    });

    test('should support OIDC discovery via AUTH_ISSUER_URL', async ({request}) => {
        const DISCOVERY_MCP_PORT = 3334;

        // Start a new MCP server process using issuerUrl
        const discoveryProcess = spawn('node', [SERVER_PATH, '--debug'], {
            env: {
                ...process.env,
                TRANSPORT      : 'sse',
                SSE_PORT       : DISCOVERY_MCP_PORT.toString(),
                AUTO_SYNC      : 'false',
                AUTO_SUMMARIZE : 'false',
                AUTH_ISSUER_URL: `http://localhost:${MOCK_OIDC_PORT}/realms/test`,
                OAUTH_CLIENT_ID: TEST_CLIENT_ID,
                HOST           : 'localhost'
            }
        });

        try {
            // Wait for server to start
            await new Promise((resolve, reject) => {
                discoveryProcess.stdout.on('data', (data) => {
                    if (data.toString().includes('Server started on SSE transport')) {
                        resolve();
                    }
                });
                discoveryProcess.stderr.on('data', (data) => {
                    if (data.toString().includes('Server started on SSE transport')) {
                        resolve();
                    }
                });
                setTimeout(() => reject(new Error('Discovery MCP Server startup timeout')), 20000);
            });

            const response = await request.post(`http://localhost:${DISCOVERY_MCP_PORT}/mcp`, {
                headers: {
                    'Authorization': `Bearer ${TEST_TOKEN}`,
                    'Content-Type' : 'application/json',
                    'Accept'       : 'application/json, text/event-stream'
                },
                data   : {
                    jsonrpc: '2.0',
                    id     : 1,
                    method : 'initialize',
                    params : {
                        protocolVersion: '2024-11-05',
                        capabilities   : {},
                        clientInfo     : {name: 'test-client', version: '1.0.0'}
                    }
                }
            });

            expect(response.status()).toBe(200);
            expect(response.headers()['content-type']).toContain('text/event-stream');
        } finally {
            discoveryProcess.kill();
        }
    });
});
