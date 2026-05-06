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
 * Pins the soft-rename contract: `MCP_HTTP_PORT` is the canonical operator-facing env var;
 * `SSE_PORT` remains readable during the deprecation window with a warning when both are set
 * with different values. Pattern mirrors the #10810 `resolveEmbeddingProvider` testable-pure-helper
 * extraction (`ai/mcp/server/memory-core/helpers/EmbeddingProviderConfig.mjs`).
 *
 * @see Neo.ai.mcp.server.shared.helpers.DeploymentConfig#resolveMcpHttpPort
 */
test.describe('DeploymentConfig #10808 — resolveMcpHttpPort', () => {
    let resolveMcpHttpPort;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/shared/helpers/DeploymentConfig.mjs');
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

    test('returns MCP_HTTP_PORT when only the new env var is set (no warning)', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: '4001'},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(4001);
        expect(warnings).toEqual([]);
    });

    test('returns SSE_PORT with deprecation warning when only legacy env var is set (backwards-compat)', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {SSE_PORT: '5555'},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(5555);
        expect(warnings.join('\n')).toMatch(/SSE_PORT is deprecated/);
        expect(warnings.join('\n')).not.toMatch(/conflicts/);
    });

    test('MCP_HTTP_PORT wins over SSE_PORT when both set with different values + emits conflict warning', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: '4001', SSE_PORT: '5555'},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(4001);
        expect(warnings.join('\n')).toMatch(/SSE_PORT is deprecated and conflicts with MCP_HTTP_PORT/);
        expect(warnings.join('\n')).toMatch(/using 4001/);
    });

    test('both env vars set with same value — no conflict warning, just deprecation', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: '4001', SSE_PORT: '4001'},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(4001);
        expect(warnings.join('\n')).toMatch(/SSE_PORT is deprecated/);
        expect(warnings.join('\n')).not.toMatch(/conflicts/);
    });

    test('empty-string env values treated as unset (not "0" port)', () => {
        const warnings = [];

        expect(resolveMcpHttpPort({
            env        : {MCP_HTTP_PORT: '', SSE_PORT: ''},
            warn       : message => warnings.push(message),
            defaultPort: 3001
        })).toBe(3001);
        expect(warnings).toEqual([]);
    });
});
