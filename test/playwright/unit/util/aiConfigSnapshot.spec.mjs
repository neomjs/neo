import {test, expect}       from '@playwright/test';
import {snapshotConfigKeys} from '../../util/aiConfigSnapshot.mjs';

/**
 * Pure-function coverage for the aiConfig snapshot/restore test-isolation helper.
 * No Neo bootstrap — the util operates on a plain object handed in.
 */
test.describe('test/playwright/util/aiConfigSnapshot', () => {
    const makeConfig = () => ({
        autoIngestFileSystem: true,
        storagePaths        : {graph: '/orig/graph.sqlite'},
        engines             : {chroma: {database: '/orig/chroma'}}
    });

    test('restores a top-level key mutated after the snapshot', () => {
        const cfg     = makeConfig(),
              restore = snapshotConfigKeys(cfg, ['autoIngestFileSystem']);

        cfg.autoIngestFileSystem = false;
        expect(cfg.autoIngestFileSystem).toBe(false);

        restore();
        expect(cfg.autoIngestFileSystem).toBe(true);
    });

    test('restores a deep dotted key', () => {
        const cfg     = makeConfig(),
              restore = snapshotConfigKeys(cfg, ['storagePaths.graph']);

        cfg.storagePaths.graph = '/tmp/test-graph.sqlite';
        restore();
        expect(cfg.storagePaths.graph).toBe('/orig/graph.sqlite');
    });

    test('restores multiple mixed-depth keys in one call', () => {
        const cfg     = makeConfig(),
              restore = snapshotConfigKeys(cfg, ['storagePaths.graph', 'engines.chroma.database', 'autoIngestFileSystem']);

        cfg.storagePaths.graph      = '/tmp/g';
        cfg.engines.chroma.database = '/tmp/c';
        cfg.autoIngestFileSystem    = false;

        restore();
        expect(cfg.storagePaths.graph).toBe('/orig/graph.sqlite');
        expect(cfg.engines.chroma.database).toBe('/orig/chroma');
        expect(cfg.autoIngestFileSystem).toBe(true);
    });

    test('restore is idempotent — calling twice is safe', () => {
        const cfg     = makeConfig(),
              restore = snapshotConfigKeys(cfg, ['storagePaths.graph']);

        cfg.storagePaths.graph = '/tmp/g';
        restore();
        restore();
        expect(cfg.storagePaths.graph).toBe('/orig/graph.sqlite');
    });

    test('captures the value at snapshot time, not at restore time', () => {
        const cfg = makeConfig();
        cfg.storagePaths.graph = '/first';
        const restore = snapshotConfigKeys(cfg, ['storagePaths.graph']); // captures '/first'
        cfg.storagePaths.graph = '/second';

        restore();
        expect(cfg.storagePaths.graph).toBe('/first');
    });

    test('missing intermediate path does not throw (capture undefined, restore no-op)', () => {
        const cfg = makeConfig();
        expect(() => {
            const restore = snapshotConfigKeys(cfg, ['nope.missing.deep']);
            restore();
        }).not.toThrow();
    });

    test('non-array keys yields a no-op restore (no throw)', () => {
        const cfg = makeConfig();
        expect(() => snapshotConfigKeys(cfg, undefined)()).not.toThrow();
    });
});
