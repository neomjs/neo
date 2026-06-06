import {setup} from '../../../../../../setup.mjs';

const appName = 'DeploymentConfigTest';

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
 * @summary Coverage for #10808 MCP HTTP port resolver (`resolveMcpHttpPort`).
 *
 * Pins the canonical-only contract: `MCP_HTTP_PORT` is the operator-facing env var.
 * Pattern mirrors the #10810 `resolveEmbeddingProvider` testable-pure-helper extraction
 * (`ai/services/memory-core/helpers/embeddingProviderConfig.mjs`).
 *
 * @see Neo.ai.mcp.server.shared.helpers.DeploymentConfig#resolveMcpHttpPort
 */
test.describe('DeploymentConfig #10808 — resolveMcpHttpPort', () => {
    let resolveMcpHttpPort;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/shared/helpers/deploymentConfig.mjs');
        resolveMcpHttpPort = mod.resolveMcpHttpPort;
    });

    test('returns defaultPort when neither env var is set', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(3001);
        expect(warnings).toEqual([]);
    });

    test('returns MCP_HTTP_PORT when the env var is set', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: '4001'},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(4001);
        expect(warnings).toEqual([]);
    });

    test('empty-string env values treated as unset (not "0" port)', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: ''},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(3001);
        expect(warnings).toEqual([]);
    });

    test('non-numeric MCP_HTTP_PORT falls back to default with explicit warning (no NaN leak)', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: 'abc'},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(3001);
        expect(warnings.join('\n')).toMatch(/Invalid MCP_HTTP_PORT value: "abc"/);
    });

    test('out-of-range port (negative / zero / >65535) rejected with warning', () => {
        for (const invalidPort of ['0', '-1', '65536', '99999']) {
            const warnings = [];
            expect(resolveMcpHttpPort({
                env        : {MCP_HTTP_PORT: invalidPort},
                warn       : message => warnings.push(message),
                defaultPort: 3001
            })).toBe(3001);
            expect(warnings.join('\n')).toMatch(/Invalid MCP_HTTP_PORT/);
        }
    });

    test('non-integer port (float) rejected with warning', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: '3001.5'},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(3001);
        expect(warnings.join('\n')).toMatch(/Invalid MCP_HTTP_PORT/);
    });
});

/**
 * @summary Coverage for #10808 `resolveChromaHost` / `resolveChromaPort` helpers.
 *
 * Pins the AC2 Chroma host/port resolution contract from the #10808 Contract Ledger.
 * Pure-function tests; no config-template dynamic import (would trigger
 * `Namespace collision in unitTestMode` due to `Neo.setupClass` global registration
 * from re-imports). Same testable-pure-helper pattern as `resolveMcpHttpPort` above.
 *
 * @see Neo.ai.mcp.server.shared.helpers.DeploymentConfig#resolveChromaHost
 * @see Neo.ai.mcp.server.shared.helpers.DeploymentConfig#resolveChromaPort
 */
test.describe('DeploymentConfig #10808 — resolveChromaHost', () => {
    let resolveChromaHost;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/shared/helpers/deploymentConfig.mjs');
        resolveChromaHost = mod.resolveChromaHost;
    });

    test('returns defaultHost when no env var is set', () => {
        expect(resolveChromaHost({env: {}})).toBe('localhost');
    });

    test('NEO_CHROMA_HOST consumed when set', () => {
        expect(resolveChromaHost({
            env: {NEO_CHROMA_HOST: 'team-chroma.example.com'}
        })).toBe('team-chroma.example.com');
    });

    test('empty-string env values treated as unset', () => {
        expect(resolveChromaHost({
            env: {NEO_CHROMA_HOST: ''}
        })).toBe('localhost');
    });

    test('custom defaultHost honored when provided', () => {
        expect(resolveChromaHost({
            env        : {},
            defaultHost: 'chroma-internal.svc.cluster.local'
        })).toBe('chroma-internal.svc.cluster.local');
    });
});

test.describe('DeploymentConfig #10808 — resolveChromaPort', () => {
    let resolveChromaPort;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/shared/helpers/deploymentConfig.mjs');
        resolveChromaPort = mod.resolveChromaPort;
    });

    test('returns defaultPort (8000) when no env var is set', () => {
        const warnings = [];
        expect(resolveChromaPort({
            env : {},
            warn: m => warnings.push(m)
        })).toBe(8000);
        expect(warnings).toEqual([]);
    });

    test('NEO_CHROMA_PORT consumed when set (valid integer)', () => {
        expect(resolveChromaPort({
            env: {NEO_CHROMA_PORT: '9000'}
        })).toBe(9000);
    });

    test('non-numeric NEO_CHROMA_PORT falls back with warning (no NaN leak)', () => {
        const warnings = [];
        expect(resolveChromaPort({
            env : {NEO_CHROMA_PORT: 'abc'},
            warn: m => warnings.push(m)
        })).toBe(8000);
        expect(warnings.join('\n')).toMatch(/Invalid NEO_CHROMA_PORT value: "abc"/);
    });

    test('out-of-range port (negative / zero / >65535) rejected with warning', () => {
        for (const invalid of ['0', '-1', '65536']) {
            const warnings = [];
            expect(resolveChromaPort({
                env : {NEO_CHROMA_PORT: invalid},
                warn: m => warnings.push(m)
            })).toBe(8000);
            expect(warnings.join('\n')).toMatch(/Invalid NEO_CHROMA_PORT/);
        }
    });

    test('custom defaultPort honored when provided', () => {
        expect(resolveChromaPort({
            env        : {},
            defaultPort: 9001
        })).toBe(9001);
    });
});

test.describe('DeploymentConfig.resolvePublicUrl', () => {
    let resolvePublicUrl;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/shared/helpers/deploymentConfig.mjs');
        resolvePublicUrl = mod.resolvePublicUrl;
    });

    test('returns null when NEO_PUBLIC_URL is undefined', () => {
        expect(resolvePublicUrl({ env: {} })).toBeNull();
    });

    test('returns null when NEO_PUBLIC_URL is empty', () => {
        expect(resolvePublicUrl({ env: { NEO_PUBLIC_URL: '' } })).toBeNull();
    });

    test('returns parsed URL when NEO_PUBLIC_URL is valid', () => {
        expect(resolvePublicUrl({ env: { NEO_PUBLIC_URL: 'https://mcp.neo.mjs.com' } })).toBe('https://mcp.neo.mjs.com');
    });

    test('removes trailing slash from valid URL', () => {
        expect(resolvePublicUrl({ env: { NEO_PUBLIC_URL: 'https://mcp.neo.mjs.com/' } })).toBe('https://mcp.neo.mjs.com');
    });


    test('warns and returns null for invalid URL', () => {
        let warning = null;
        const result = resolvePublicUrl({
            env: { NEO_PUBLIC_URL: 'not-a-url' },
            warn: msg => { warning = msg; }
        });
        expect(result).toBeNull();
        expect(warning).toContain('Invalid NEO_PUBLIC_URL value: "not-a-url"');
    });
});
