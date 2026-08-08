import {test, expect}           from '@playwright/test';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os                       from 'node:os';
import path                     from 'node:path';
import {
    parseFleetHealthcheckArgs,
    probeFleetHealth
} from '../../../../../../ai/scripts/diagnostics/fleetHealthcheck.mjs';

test.describe('fleetHealthcheck', () => {
    test('reads the bearer from a secret file and never returns the credential', async () => {
        const
            tempDir = await mkdtemp(path.join(os.tmpdir(), 'neo-fleet-health-')),
            file    = path.join(tempDir, 'fleet-token'),
            secret  = 'provider-secret';

        try {
            await writeFile(file, `${secret}\n`, {mode: 0o600});

            const options = parseFleetHealthcheckArgs([], {
                NEO_MCP_HEALTHCHECK_TOKEN_FILE: file,
                NEO_FLEET_DATA_DIR            : '/app/.neo-ai-data/fleet'
            });

            expect(options.bearerToken).toBe(secret);
            expect(options.bearerTokenFile).toBe(file);
            expect(JSON.stringify({...options, bearerToken: '[redacted]'})).not.toContain(secret)
        } finally {
            await rm(tempDir, {recursive: true, force: true})
        }
    });

    test('returns one secret-free receipt for an identity-bearing probe on the expected root', async () => {
        const receipt = await probeFleetHealth({
            url            : 'http://fleet.test/fleet/probe',
            bearerToken    : 'secret',
            expectedDataDir: '/app/.neo-ai-data/fleet',
            fetchImpl      : async (url, init) => {
                expect(url).toBe('http://fleet.test/fleet/probe');
                expect(init.headers.Authorization).toBe('Bearer secret');

                return new Response(JSON.stringify({
                    ok    : true,
                    result: {
                        identity    : {
                            userId         : 'neo-gpt',
                            source         : 'github-pat',
                            authProvider   : 'github',
                            providerBaseUrl: 'https://api.github.com',
                            providerUserId : '280105177'
                        },
                        fleetDataDir: '/app/.neo-ai-data/fleet'
                    }
                }), {status: 200, headers: {'content-type': 'application/json'}})
            }
        });

        expect(Object.isFrozen(receipt)).toBe(true);
        expect(receipt).toEqual({
            ok             : true,
            userId         : 'neo-gpt',
            source         : 'github-pat',
            authProvider   : 'github',
            providerBaseUrl: 'https://api.github.com',
            providerUserId : '280105177',
            fleetDataDir   : '/app/.neo-ai-data/fleet'
        });
        expect(JSON.stringify(receipt)).not.toContain('secret')
    });

    test('accepts the validated OIDC AuthInfo shape without inventing PAT provider metadata', async () => {
        const receipt = await probeFleetHealth({
            url            : 'http://fleet.test/fleet/probe',
            bearerToken    : 'oidc-secret',
            expectedDataDir: '/app/.neo-ai-data/fleet',
            fetchImpl      : async () => new Response(JSON.stringify({
                ok    : true,
                result: {
                    identity    : {userId: 'oidc-subject', username: 'Alice', source: 'oidc'},
                    fleetDataDir: '/app/.neo-ai-data/fleet'
                }
            }), {status: 200, headers: {'content-type': 'application/json'}})
        });

        expect(receipt).toEqual({
            ok             : true,
            userId         : 'oidc-subject',
            source         : 'oidc',
            authProvider   : null,
            providerBaseUrl: null,
            providerUserId : null,
            fleetDataDir   : '/app/.neo-ai-data/fleet'
        })
    });

    test('fails closed on refusal, invalid JSON, missing identity, and wrong root', async () => {
        const base = {
            url            : 'http://fleet.test/fleet/probe',
            bearerToken    : 'secret',
            expectedDataDir: '/app/.neo-ai-data/fleet'
        };

        await expect(probeFleetHealth({
            ...base,
            fetchImpl: async () => new Response('{}', {status: 401})
        })).rejects.toThrow('Fleet healthcheck was refused (HTTP 401)');

        await expect(probeFleetHealth({
            ...base,
            fetchImpl: async () => new Response('{', {status: 200})
        })).rejects.toThrow('Fleet healthcheck returned invalid JSON');

        await expect(probeFleetHealth({
            ...base,
            fetchImpl: async () => new Response(JSON.stringify({ok: true, result: {identity: {}, fleetDataDir: base.expectedDataDir}}), {status: 200})
        })).rejects.toThrow('Fleet healthcheck response is not identity-bearing');

        await expect(probeFleetHealth({
            ...base,
            fetchImpl: async () => new Response(JSON.stringify({
                ok    : true,
                result: {identity: {userId: 'neo-gpt'}, fleetDataDir: base.expectedDataDir}
            }), {status: 200})
        })).rejects.toThrow('Fleet healthcheck response is not identity-bearing');

        await expect(probeFleetHealth({
            ...base,
            fetchImpl: async () => new Response(JSON.stringify({
                ok    : true,
                result: {
                    identity: {
                        userId         : 'neo-gpt',
                        source         : 'github-pat',
                        authProvider   : 'github',
                        providerBaseUrl: 'https://api.github.com',
                        providerUserId : '280105177'
                    },
                    fleetDataDir: '/wrong'
                }
            }), {status: 200})
        })).rejects.toThrow('Fleet healthcheck reported the wrong durable root')
    })
});
