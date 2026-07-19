import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'CommunityBatchPushClientTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {Readable}     from 'stream';

/**
 * @summary Remote client witnesses for auth-header isolation, exact-envelope retry, and local bounds.
 */
test.describe('communityBatchPushClient — hosted connector push (#15156)', () => {
    let buildServerConfig, hasPushFailure, parseArgs, runPush, validateArgs;

    const envelope = () => ({
        source: {
            canonicalProviderHost: 'github.com',
            resourceKind         : 'repository',
            providerResourceId   : 'neomjs/neo'
        },
        batch: {
            schemaVersion             : 'community-activity-batch.v1',
            resourceFamily            : 'issues',
            adapterSchemaVersion      : 'github-issue.v1',
            providerStateSchemaVersion: 'gh-state.v1',
            baseCheckpointVersion     : 0,
            baseInventoryHash         : null,
            batchId                   : 'batch-1',
            observations              : [{
                providerEntityId    : '1',
                occurrenceKind      : 'issue.opened',
                occurrenceCoordinate: '1:create',
                occurredAt          : '2026-07-18T10:00:00Z',
                actorKind           : 'user'
            }],
            nextProviderState: {cursor: 'page-2'},
            nextInventoryHash: 'inv-1',
            coverage         : {fromBasis: 'c1', toBasis: 'c9', complete: true}
        }
    });

    test.beforeAll(async () => {
        ({buildServerConfig, hasPushFailure, parseArgs, runPush, validateArgs} =
            await import('../../../../../../ai/scripts/maintenance/communityBatchPushClient.mjs'))
    });

    test('argv/env parsing keeps bearer auth in transient transport config', () => {
        const args = parseArgs([
            '--url', 'https://memory.example.com/mcp',
            '--from-stdin',
            '--token-env', 'CONNECTOR_TOKEN',
            '--max-attempts', '3'
        ], {CONNECTOR_TOKEN: 'secret-token'});

        expect(validateArgs(args)).toEqual([]);
        expect(args.maxAttempts).toBe(3);
        expect(buildServerConfig(args).transportOptions.requestInit.headers.Authorization).toBe('Bearer secret-token');
        expect(envelope()).not.toHaveProperty('token');
    });

    test('validation requires endpoint, payload, and bearer token by default', () => {
        expect(validateArgs(parseArgs([], {}))).toEqual([
            'Missing --url or NEO_MEMORY_CORE_MCP_URL.',
            'Provide --from-file or --from-stdin.',
            'Missing bearer token: set --token-env or NEO_COMMUNITY_BATCH_TOKEN.'
        ])
    });

    test('an unknown-outcome retry sends the exact same batch id and bytes, then closes the client', async () => {
        const
            args = parseArgs([
                '--url', 'https://memory.example.com/mcp', '--from-stdin', '--token-env', 'CONNECTOR_TOKEN'
            ], {CONNECTOR_TOKEN: 'secret-token'}),
            calls = [];

        let closed = false;

        const result = await runPush({
            args,
            input        : Readable.from(JSON.stringify(envelope())),
            clientFactory: () => ({
                async ready() {},
                async callTool(name, payload) {
                    calls.push({name, payload: JSON.stringify(payload)});
                    if (calls.length === 1) throw new Error('response connection lost');
                    return {content: [{type: 'text', text: '{"status":"idempotent","digest":"sha256:x"}'}]}
                },
                async close() { closed = true }
            })
        });

        expect(result).toEqual({status: 'idempotent', digest: 'sha256:x'});
        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual(calls[1]);
        expect(calls[0].name).toBe('admit_community_batch');
        expect(closed).toBe(true);
    });

    test('credential-shaped payloads fail client-side without constructing a remote client', async () => {
        const payload = envelope();
        payload.batch.nextProviderState = {accessToken: 'must-not-cross'};

        let   constructed = false;
        const result      = await runPush({
            args         : parseArgs(['--url', 'https://memory.example.com/mcp', '--from-stdin', '--token-env', 'CONNECTOR_TOKEN'], {CONNECTOR_TOKEN: 'x'}),
            input        : Readable.from(JSON.stringify(payload)),
            clientFactory: () => {
                constructed = true;
                return {}
            }
        });

        expect(result.code).toBe('COMMUNITY_BATCH_ENVELOPE_INVALID');
        expect(result.errors).toContain('HOSTED_CREDENTIAL_MATERIAL_FORBIDDEN');
        expect(constructed).toBe(false);
        expect(hasPushFailure(result)).toBe(true);
    });

    test('the client factory receives an instance-local connection object with no provider write', async () => {
        const args = parseArgs([
            '--url', 'https://memory.example.com/mcp', '--from-stdin', '--token-env', 'CONNECTOR_TOKEN'
        ], {CONNECTOR_TOKEN: 'secret-token'});

        let receivedConfig;

        await runPush({
            args,
            input        : Readable.from(JSON.stringify(envelope())),
            clientFactory: ({connectionConfig}) => {
                receivedConfig = connectionConfig;
                return {
                    async ready() {},
                    async callTool() { return {content: [{type: 'text', text: '{"status":"accepted"}'}]} },
                    async close() {}
                }
            }
        });

        expect(receivedConfig).toEqual(buildServerConfig(args));
    });

    test('a client-close failure remains visible to the connector process', async () => {
        const args = parseArgs([
            '--url', 'https://memory.example.com/mcp', '--from-stdin', '--token-env', 'CONNECTOR_TOKEN'
        ], {CONNECTOR_TOKEN: 'secret-token'});

        await expect(runPush({
            args,
            input        : Readable.from(JSON.stringify(envelope())),
            clientFactory: () => ({
                async ready() {},
                async callTool() { return {content: [{type: 'text', text: '{"status":"accepted"}'}]} },
                async close() { throw new Error('close failed') }
            })
        })).rejects.toThrow('close failed');
    });
});
