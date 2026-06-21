import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'SnapshotAiConfigTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../src/core/_export.mjs';
import {snapshotAiConfig} from './util.mjs';

/**
 * @summary Unit coverage for the snapshotAiConfig test-isolation helper.
 *
 * Two layers: pure-fixture tests pin the restore-existing / throw-on-absent contract against a plain
 * object, and a Provider-backed block proves the same contract on the real aiConfig Provider
 * singleton — whose proxy has no delete API, the surface the helper actually guards.
 */
test.describe('Neo.ai test-isolation — snapshotAiConfig (#12435)', () => {
    test('restores mutated leaves to their captured values', () => {
        const cfg = {storagePaths: {graph: '/orig/graph.sqlite'}, handoffFilePath: '/orig/handoff.md'};

        const restore = snapshotAiConfig(cfg, ['storagePaths.graph', 'handoffFilePath']);

        cfg.storagePaths.graph = '/tmp/test.sqlite';
        cfg.handoffFilePath    = '/tmp/handoff.md';

        restore();

        expect(cfg.storagePaths.graph).toBe('/orig/graph.sqlite');
        expect(cfg.handoffFilePath).toBe('/orig/handoff.md');
    });

    test('throws on a leaf that does not exist at capture time', () => {
        const cfg = {storagePaths: {graph: '/orig/graph.sqlite'}};

        // No delete API on the real target, so the helper refuses a path it cannot undo rather than
        // hand back a restore() that silently leaks the test-written value.
        expect(() => snapshotAiConfig(cfg, ['handoffFilePath'])).toThrow(/does not resolve to a value/);
    });

    test('throws when a snapshotted path has no parent', () => {
        const cfg = {};

        expect(() => snapshotAiConfig(cfg, ['engines.chroma.database'])).toThrow(/does not resolve to a value/);
    });
});

test.describe('Neo.ai test-isolation — snapshotAiConfig on the real aiConfig Provider', () => {
    let aiConfig;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
    });

    test('restores an existing leaf on the real Provider singleton via the set trap', () => {
        // handoffFilePathProd is a declared scalar leaf (the formula's prod input), not a storage/DB
        // path, so this snapshot→mutate→restore round-trip cannot bleed test state into a live DB
        // (B4). The active `handoffFilePath` is now a read-only computed formula, so the set trap is
        // exercised on its writable underlying leaf. restore() runs in `finally`, so the shared
        // singleton returns to its captured value even if the mid-flight assertion throws.
        const original = aiConfig.handoffFilePathProd,
              restore  = snapshotAiConfig(aiConfig, ['handoffFilePathProd']);

        try {
            aiConfig.handoffFilePathProd = '/tmp/__neo_probe_handoff__.md';
            expect(aiConfig.handoffFilePathProd).toBe('/tmp/__neo_probe_handoff__.md') // set trap wrote through
        } finally {
            restore()
        }

        expect(aiConfig.handoffFilePathProd).toBe(original) // get trap reads the restored value
    });

    test('refuses an absent leaf it cannot undo, instead of returning a leaky restore', () => {
        // Closes the delete-added falsifier at its source: the proxy cannot remove a path a test
        // adds, so the helper throws at capture rather than hand back a restore() that leaks.
        const probe = '__neoAbsentLeafProbe__';

        expect(aiConfig[probe]).toBeUndefined(); // absent on the real Provider
        expect(() => snapshotAiConfig(aiConfig, [probe])).toThrow(/does not resolve to a value/)
    });
});
