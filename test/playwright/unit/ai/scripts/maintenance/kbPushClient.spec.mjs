import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'KbPushClientCliTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {Readable}     from 'stream';

/**
 * Unit coverage for the tenant-side KB push client (#11743).
 *
 * The script is the operator-facing StreamableHTTP/SSE invocation primitive for repo-push
 * ingestion envelopes. Tests keep network/client work injected so parsing, auth headers,
 * envelope defaults, and MCP result failure semantics are verified without a live KB server.
 */

test.describe('ai/scripts/maintenance/kbPushClient — repo-push MCP client (#11743)', () => {
    let applyEnvelopeDefaults,
        buildServerConfig,
        decodeToolResult,
        hasIngestFailure,
        parseArgs,
        readJsonPayload,
        runPush,
        validateArgs;

    test.beforeAll(async () => {
        ({
            applyEnvelopeDefaults,
            buildServerConfig,
            decodeToolResult,
            hasIngestFailure,
            parseArgs,
            readJsonPayload,
            runPush,
            validateArgs
        } = await import('../../../../../../ai/scripts/maintenance/kbPushClient.mjs'));
    });

    test('parseArgs reads endpoint, token-env, tenant, repo, transport, and stdin mode', () => {
        const args = parseArgs(
            [
                '--url', 'https://kb.example.com/mcp',
                '--from-stdin',
                '--tenant-id', 'tenant-a',
                '--repo-slug', 'neomjs/create-app',
                '--transport', 'sse',
                '--token-env', 'TOKEN_ENV'
            ],
            {TOKEN_ENV: 'secret-token'}
        );

        expect(args).toMatchObject({
            fromStdin: true,
            repoSlug : 'neomjs/create-app',
            tenantId : 'tenant-a',
            token    : 'secret-token',
            tokenEnv : 'TOKEN_ENV',
            transport: 'sse',
            url      : 'https://kb.example.com/mcp'
        });
    });

    test('parseArgs falls back to dotenv-compatible environment defaults', () => {
        const args = parseArgs(['--from-file', 'envelope.json'], {
            NEO_KB_INGEST_TOKEN : 'env-token',
            NEO_KB_MCP_URL      : 'https://kb.example.com/mcp',
            NEO_KB_MCP_TRANSPORT: 'streamable-http',
            NEO_KB_REPO_SLUG    : 'neomjs/create-app',
            NEO_KB_TENANT_ID    : 'tenant-a'
        });

        expect(args).toMatchObject({
            fromFile : 'envelope.json',
            repoSlug : 'neomjs/create-app',
            tenantId : 'tenant-a',
            token    : 'env-token',
            tokenEnv : 'NEO_KB_INGEST_TOKEN',
            transport: 'streamable-http',
            url      : 'https://kb.example.com/mcp'
        });
    });

    test('validateArgs requires an endpoint, payload source, and bearer token by default', () => {
        expect(validateArgs(parseArgs([], {}))).toEqual([
            'Missing --url or NEO_KB_MCP_URL.',
            'Provide --from-file or --from-stdin.',
            'Missing bearer token: set --token, --token-env, or NEO_KB_INGEST_TOKEN. Use --allow-unauthenticated only for a local demo deployment.'
        ]);
    });

    test('validateArgs allows unauthenticated only when explicitly requested', () => {
        const args = parseArgs([
            '--url', 'http://127.0.0.1:3000/mcp',
            '--from-stdin',
            '--allow-unauthenticated'
        ], {});

        expect(validateArgs(args)).toEqual([]);
    });

    test('validateArgs rejects unsupported transport aliases before client startup', () => {
        const args = parseArgs([
            '--url', 'https://kb.example.com/mcp',
            '--from-stdin',
            '--transport', 'http',
            '--token', 'secret-token'
        ], {});

        expect(validateArgs(args)).toEqual([
            "Unsupported --transport 'http'. Expected streamable-http or sse."
        ]);
    });

    test('validateArgs surfaces Commander parse errors instead of accepting malformed argv', () => {
        const args = parseArgs(['--url'], {});

        expect(validateArgs(args)).toEqual([
            "error: option '--url <url>' argument missing"
        ]);
    });

    test('readJsonPayload parses a single envelope object from a stream', async () => {
        const payload = await readJsonPayload(Readable.from(' { "files": [{"sourcePath":"a.mjs"}] } \n'));

        expect(payload).toEqual({
            files: [{sourcePath: 'a.mjs'}]
        });
    });

    test('applyEnvelopeDefaults adds tenant and repo defaults without overwriting explicit payload fields', () => {
        const normalized = applyEnvelopeDefaults({
            tenantId        : 'payload-tenant',
            manifestSnapshot: {pathsAfterPush: ['src/a.mjs']}
        }, {
            tenantId: 'cli-tenant',
            repoSlug : 'neomjs/create-app'
        });

        expect(normalized).toEqual({
            tenantId        : 'payload-tenant',
            repoSlug         : 'neomjs/create-app',
            manifestSnapshot: {
                repoSlug      : 'neomjs/create-app',
                pathsAfterPush: ['src/a.mjs']
            }
        });
    });

    test('buildServerConfig wires Authorization as a bearer token for remote MCP transport', () => {
        expect(buildServerConfig({
            token    : 'abc123',
            transport: 'streamable-http',
            url      : 'https://kb.example.com/mcp'
        })).toEqual({
            transportType   : 'streamable-http',
            url             : 'https://kb.example.com/mcp',
            transportOptions: {
                requestInit: {
                    headers: {
                        Authorization: 'Bearer abc123'
                    }
                }
            }
        });
    });

    test('decodeToolResult parses JSON text payloads and failure detection catches structured failures', () => {
        const decoded = decodeToolResult({
            content: [{
                type: 'text',
                text: '{"code":"KB_INGEST_VOLUME_EXCEEDED","errors":[]}'
            }]
        });

        expect(decoded.code).toBe('KB_INGEST_VOLUME_EXCEEDED');
        expect(hasIngestFailure(decoded)).toBe(true);
        expect(hasIngestFailure({errors: []})).toBe(false);
        expect(hasIngestFailure({errors: [{code: 'X'}]})).toBe(true);
    });

    test('runPush calls ingest_source_files with envelope defaults and cleans transient client config', async () => {
        const calls = [];
        const clientConfig = {data: {mcpServers: {}}};
        const args = parseArgs([
            '--url', 'https://kb.example.com/mcp',
            '--from-stdin',
            '--tenant-id', 'tenant-a',
            '--repo-slug', 'neomjs/create-app',
            '--token', 'secret-token'
        ], {});

        const result = await runPush({
            args,
            input        : Readable.from('{"files":[{"sourcePath":"src/a.mjs","content":"x"}]}'),
            clientConfig,
            clientFactory: ({serverName, clientName}) => ({
                async initAsync() {
                    calls.push({type: 'init', serverName, clientName});
                },
                async callTool(name, envelope) {
                    calls.push({type: 'call', name, envelope});
                    return {content: [{type: 'text', text: '{"ingested":1,"errors":[]}'}]};
                },
                async close() {
                    calls.push({type: 'close'});
                }
            })
        });

        expect(result).toEqual({ingested: 1, errors: []});
        expect(calls[0].type).toBe('init');
        expect(calls[1]).toEqual({
            type    : 'call',
            name    : 'ingest_source_files',
            envelope: {
                tenantId: 'tenant-a',
                repoSlug : 'neomjs/create-app',
                files    : [{sourcePath: 'src/a.mjs', content: 'x'}]
            }
        });
        expect(calls[2].type).toBe('close');
        expect(Object.keys(clientConfig.data.mcpServers)).toHaveLength(0);
    });
});
