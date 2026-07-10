import {setup} from '../../../../setup.mjs';

const appName = 'AccountConfigModelTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Instance       from '../../../../../../src/manager/Instance.mjs';
import Store          from '../../../../../../src/data/Store.mjs';

/**
 * Covers the FM account configuration model (the data spine under every account surface):
 * the harness-type registry (adding a harness = ONE registration, fail-closed unknowns), the
 * MCP-server catalog + per-agent matrix resolution (null = catalog defaults, derived never baked),
 * and the AgentDefinition record contract (matrix passthrough, tri-state operational toggles,
 * credential-free shape).
 */
test.describe('FM account configuration model', () => {
    let AgentDefinition, harnessTypes, mcpServers;

    test.beforeAll(async () => {
        AgentDefinition = (await import('../../../../../../apps/agentos/model/AgentDefinition.mjs')).default;
        harnessTypes    = await import('../../../../../../apps/agentos/config/harnessTypes.mjs');
        mcpServers      = await import('../../../../../../apps/agentos/config/mcpServers.mjs');
    });

    test('the harness registry: every entry carries {type, label}; resolution is registry-driven; unknown types fail closed to null', () => {
        const entries = harnessTypes.listHarnessTypes();

        expect(entries.length).toBeGreaterThanOrEqual(3);

        entries.forEach(entry => {
            expect(typeof entry.type).toBe('string');
            expect(typeof entry.label).toBe('string');
            // resolution round-trips through the ONE registry
            expect(harnessTypes.resolveHarnessType(entry.type)).toEqual(entry)
        });

        // the shared-authority entries carry the shipped product-language labels — including the
        // Brain-valid claude-code the cycle-1 app-local fork was missing
        expect(harnessTypes.resolveHarnessType('claude-desktop')?.label).toBe('Claude');
        expect(harnessTypes.resolveHarnessType('claude-code')?.label).toBe('Claude Code');
        expect(harnessTypes.resolveHarnessType('codex')?.label).toBe('Codex');
        expect(harnessTypes.resolveHarnessType('antigravity')?.label).toBe('Antigravity');

        // fail-closed: never guess a launcher or a label
        expect(harnessTypes.resolveHarnessType('made-up-harness')).toBeNull();
        expect(harnessTypes.resolveHarnessType(undefined)).toBeNull()
    });

    test('registry results are caller-owned copies — mutating them never corrupts the registry', () => {
        const entry = harnessTypes.listHarnessTypes()[0];

        entry.label = 'CORRUPTED';

        expect(harnessTypes.resolveHarnessType(entry.type).label).not.toBe('CORRUPTED')
    });

    test('the MCP catalog: the Neo core set defaults ON, workflow servers default OFF', () => {
        const matrix = mcpServers.defaultMcpMatrix();

        expect(matrix['memory-core']).toBe(true);
        expect(matrix['knowledge-base']).toBe(true);
        expect(matrix['neural-link']).toBe(true);
        expect(matrix['github-workflow']).toBe(false);
        expect(matrix['gitlab-workflow']).toBe(false);

        // core flags agree with the defaults story
        mcpServers.listMcpServers().forEach(entry => {
            entry.core && expect(entry.defaultEnabled).toBe(true)
        })
    });

    test('matrix resolution: null = defaults; partial choices merge ON TOP; unknown keys are ignored (fail-closed)', () => {
        expect(mcpServers.resolveMcpMatrix(null)).toEqual(mcpServers.defaultMcpMatrix());

        const resolved = mcpServers.resolveMcpMatrix({
            'github-workflow': true,   // opt-in
            'neural-link'    : false,  // explicit opt-out of a core default
            'made-up-server' : true    // stale/unknown key — must NOT surface
        });

        expect(resolved['github-workflow']).toBe(true);
        expect(resolved['neural-link']).toBe(false);
        expect(resolved['memory-core']).toBe(true); // untouched default
        expect(resolved).not.toHaveProperty('made-up-server');

        // non-boolean junk normalizes to false, never truthy-leaks
        expect(mcpServers.resolveMcpMatrix({'memory-core': 'yes'})['memory-core']).toBe(false)
    });

    test('sparse normalization rejects malformed intent, removes defaults, and follows catalog evolution', () => {
        expect(mcpServers.normalizeMcpOverrides({
            'memory-core'    : true,
            'github-workflow': true
        })).toEqual({'github-workflow': true});
        expect(mcpServers.normalizeMcpOverrides(mcpServers.defaultMcpMatrix())).toBeNull();

        expect(() => mcpServers.normalizeMcpOverrides({'made-up-server': true})).toThrow(/Unknown MCP server/);
        expect(() => mcpServers.normalizeMcpOverrides({'memory-core': 1})).toThrow(/must be boolean/);
        expect(() => mcpServers.normalizeMcpOverrides([])).toThrow(/object or null/);

        const evolvedCatalog = mcpServers.listMcpServers().map(entry => entry.key === 'github-workflow'
            ? {...entry, defaultEnabled: true}
            : entry);

        // No override follows the NEW default; the old explicit opt-in is now redundant.
        expect(mcpServers.resolveMcpMatrix(null, evolvedCatalog)['github-workflow']).toBe(true);
        expect(mcpServers.normalizeMcpOverrides({'github-workflow': true}, evolvedCatalog)).toBeNull()
    });

    test('the AgentDefinition record contract: matrix passthrough, tri-state toggles, credential-free', () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            model      : AgentDefinition,
            data       : [{
                id             : 'neo-gpt',
                githubUsername : 'neo-gpt',
                harnessType    : 'codex',
                credentialState: 'stored-node-side',
                lifecycleState : 'gated',
                mcpServers     : {'github-workflow': true},
                statusText     : 'configured',
                updatedAt      : '2026-07-10T05:00:00.000Z'
            }]
        });

        const record = store.get('neo-gpt');

        // the matrix is an Object field — stored as given, resolved via the catalog at render time
        expect(record.mcpServers).toEqual({'github-workflow': true});
        expect(mcpServers.resolveMcpMatrix(record.mcpServers)['github-workflow']).toBe(true);

        // tri-state honesty: not read back yet = null, never an optimistic boolean
        expect(record.hooksActive).toBeNull();
        expect(record.wakeSubscriptionsActive).toBeNull();
        expect(record.displayName).toBeNull();

        // readback lands as a real boolean and round-trips
        record.set({hooksActive: true, wakeSubscriptionsActive: false});
        expect(record.hooksActive).toBe(true);
        expect(record.wakeSubscriptionsActive).toBe(false);

        // the credential-free shape stands: no credential field exists on the record
        expect(record.credential).toBeUndefined();

        store.destroy()
    });
});
