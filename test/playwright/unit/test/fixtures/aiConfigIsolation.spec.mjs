import {setup} from '../../../setup.mjs';

const appName = 'AiConfigIsolationFixtureTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import {snapshotAiConfig} from '../../../fixtures/aiConfigIsolation.mjs';

/**
 * @summary Negative isolation contract for the shared aiConfig snapshot/restore helper.
 *
 * The helper exists so a spec can mutate the aiConfig Provider singleton in setup and
 * restore the exact leaf values afterwards, preventing cross-spec config bleed under a
 * full-suite `--workers=1` run. These tests pin that contract on a plain nested object
 * (the helper is shape-agnostic — it reads/writes leaves via `Neo.ns`), so they are
 * deterministic and service-free: the leaf-restore guarantee is exercised directly,
 * decoupled from any live Memory Core / Chroma lifecycle.
 */
test.describe('aiConfigIsolation fixture contract', () => {
    test('restores a nested leaf after a spec mutates it', () => {
        const cfg     = {storagePaths: {graph: '/original.db'}},
              restore = snapshotAiConfig(cfg, ['storagePaths.graph']);

        cfg.storagePaths.graph = '/mutated.db';
        expect(cfg.storagePaths.graph).toBe('/mutated.db');

        restore();
        expect(cfg.storagePaths.graph).toBe('/original.db');
    });

    test('restores every snapshotted key and leaves unsnapshotted keys as-mutated', () => {
        const cfg = {
            storagePaths       : {graph: '/orig.db'},
            collections        : {memory: 'orig-mem', session: 'orig-sess'},
            autoIngestFileSystem: true
        };

        // Snapshot only two of the three mutated surfaces.
        const restore = snapshotAiConfig(cfg, ['storagePaths.graph', 'autoIngestFileSystem']);

        cfg.storagePaths.graph    = '/mutated.db';
        cfg.autoIngestFileSystem  = false;
        cfg.collections.memory    = 'mutated-mem'; // deliberately NOT snapshotted

        restore();

        expect(cfg.storagePaths.graph).toBe('/orig.db');     // snapshotted -> restored
        expect(cfg.autoIngestFileSystem).toBe(true);         // snapshotted -> restored
        expect(cfg.collections.memory).toBe('mutated-mem');  // not snapshotted -> left as-is
    });

    test('rebuilds a parent chain a spec replaced wholesale (create=true restore path)', () => {
        const cfg     = {storagePaths: {graph: '/orig.db'}},
              restore = snapshotAiConfig(cfg, ['storagePaths.graph']);

        // A spec that swaps the whole parent object out from under the leaf.
        cfg.storagePaths = {};
        expect(cfg.storagePaths.graph).toBeUndefined();

        restore();
        expect(cfg.storagePaths.graph).toBe('/orig.db');
    });

    test('captures the leaf value at call time, not at restore time', () => {
        const cfg = {storagePaths: {graph: '/a.db'}};

        // Snapshot captures '/a.db'…
        const restore = snapshotAiConfig(cfg, ['storagePaths.graph']);

        // …then the leaf changes twice before restore runs.
        cfg.storagePaths.graph = '/b.db';
        cfg.storagePaths.graph = '/c.db';

        restore();
        expect(cfg.storagePaths.graph).toBe('/a.db');
    });
});
