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
 * The helper captures aiConfig leaves and returns a restore() thunk; it is pure, so these tests
 * exercise it against a plain fixture object — never the real aiConfig Provider singleton.
 */
test.describe('Neo.ai test-isolation — snapshotAiConfig (#12435)', () => {
    test('restores mutated leaves to their captured values', () => {
        const cfg = {storagePaths: {graph: '/orig/graph.sqlite'}, autoIngestFileSystem: true};

        const restore = snapshotAiConfig(cfg, ['storagePaths.graph', 'autoIngestFileSystem']);

        cfg.storagePaths.graph   = '/tmp/test.sqlite';
        cfg.autoIngestFileSystem = false;

        restore();

        expect(cfg.storagePaths.graph).toBe('/orig/graph.sqlite');
        expect(cfg.autoIngestFileSystem).toBe(true);
    });

    test('deletes a leaf that did not exist at capture time', () => {
        const cfg = {storagePaths: {graph: '/orig/graph.sqlite'}};

        const restore = snapshotAiConfig(cfg, ['handoffFilePath']);

        cfg.handoffFilePath = '/tmp/handoff.md';
        restore();

        expect(Object.prototype.hasOwnProperty.call(cfg, 'handoffFilePath')).toBe(false);
    });

    test('tolerates a missing parent without throwing', () => {
        const cfg = {};

        const restore = snapshotAiConfig(cfg, ['engines.chroma.database']);

        expect(() => restore()).not.toThrow();
        expect(cfg.engines).toBeUndefined();
    });
});
