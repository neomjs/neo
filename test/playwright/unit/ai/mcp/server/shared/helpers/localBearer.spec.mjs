import {setup} from '../../../../../../setup.mjs';

const appName = 'LocalBearerTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

/**
 * @summary Coverage for the disposable local-bearer generation and comparison contract.
 */
test.describe('LocalBearer helper', () => {
    let createLocalBearerLaunchContract,
        generateLocalBearerToken,
        isLocalBearerToken,
        matchesLocalBearerToken;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs');

        createLocalBearerLaunchContract = mod.createLocalBearerLaunchContract;
        generateLocalBearerToken        = mod.generateLocalBearerToken;
        isLocalBearerToken              = mod.isLocalBearerToken;
        matchesLocalBearerToken         = mod.matchesLocalBearerToken;
    });

    test('generates exactly 32 random bytes as canonical unpadded base64url', () => {
        const first  = generateLocalBearerToken(),
              second = generateLocalBearerToken();

        expect(first).toHaveLength(43);
        expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(first).not.toContain('=');
        expect(Buffer.from(first, 'base64url')).toHaveLength(32);
        expect(Buffer.from(first, 'base64url').toString('base64url')).toBe(first);
        expect(second).not.toBe(first);
    });

    test('rejects padding, invalid characters, non-canonical lengths, and non-strings', () => {
        const token = generateLocalBearerToken();

        expect(isLocalBearerToken(token)).toBe(true);
        expect(isLocalBearerToken(`${token}=`)).toBe(false);
        expect(isLocalBearerToken(`${token.slice(0, -1)}+`)).toBe(false);
        expect(isLocalBearerToken(token.slice(0, -1))).toBe(false);
        expect(isLocalBearerToken(`${token}A`)).toBe(false);
        expect(isLocalBearerToken(null)).toBe(false);
    });

    test('uses the strict equal-length comparison boundary', () => {
        const token = generateLocalBearerToken();

        expect(matchesLocalBearerToken(token, token)).toBe(true);
        expect(matchesLocalBearerToken(generateLocalBearerToken(), token)).toBe(false);
        expect(matchesLocalBearerToken('short', token)).toBe(false);
        expect(matchesLocalBearerToken(token, 'short')).toBe(false);
    });

    test('creates one frozen in-memory value shared by server and client surfaces only', () => {
        const contract = createLocalBearerLaunchContract(),
              token    = contract.serverEnv.NEO_AUTH_LOCAL_BEARER_TOKEN;

        expect(Object.keys(contract).sort()).toEqual(['clientHeaders', 'serverEnv']);
        expect(Object.isFrozen(contract)).toBe(true);
        expect(Object.isFrozen(contract.serverEnv)).toBe(true);
        expect(Object.isFrozen(contract.clientHeaders)).toBe(true);
        expect(contract).not.toHaveProperty('token');
        expect(contract.serverEnv.NEO_AUTH_MODE).toBe('local-bearer');
        expect(contract.serverEnv.NEO_MCP_LISTEN_HOST).toBe('127.0.0.1');
        expect(contract.clientHeaders.Authorization).toBe(`Bearer ${token}`);
        expect(isLocalBearerToken(token)).toBe(true);
    });

    test('reuses an explicitly supplied canonical token and rejects malformed overrides', () => {
        const token    = generateLocalBearerToken(),
              contract = createLocalBearerLaunchContract(token);

        expect(contract.serverEnv.NEO_AUTH_LOCAL_BEARER_TOKEN).toBe(token);
        expect(contract.clientHeaders.Authorization).toBe(`Bearer ${token}`);
        expect(() => createLocalBearerLaunchContract('not-a-canonical-token'))
            .toThrow('canonical 32-byte unpadded-base64url token');
    });
});
