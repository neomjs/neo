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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * @summary Contract tests for the shared `aiConfig` snapshot/restore isolation helper.
 *
 * `captureAiConfigKeys` must:
 *   1. restore mutated leaf primitives to their captured values;
 *   2. restore a key the spec CREATES (originally `undefined`) back to `undefined`;
 *   3. deep-clone object captures so a later in-place mutation of the live config
 *      cannot corrupt the snapshot (the by-reference trap);
 *   4. be idempotent (restore twice = restore once).
 *
 * Tested against plain mock objects rather than the live `aiConfig` so the contract
 * spec is itself immune to the cross-test bleed it exists to prevent.
 */
test.describe('aiConfigIsolation fixture contract (#12435)', () => {
    let captureAiConfigKeys;

    test.beforeAll(async () => {
        ({captureAiConfigKeys} = await import('../../../fixtures/aiConfigIsolation.mjs'));
    });

    test('restores mutated leaf primitives', () => {
        const cfg     = {storagePaths: {graph: 'original.db'}, autoIngestFileSystem: true},
              restore = captureAiConfigKeys(cfg, ['storagePaths.graph', 'autoIngestFileSystem']);

        cfg.storagePaths.graph   = 'test.db';
        cfg.autoIngestFileSystem = false;
        restore();

        expect(cfg.storagePaths.graph).toBe('original.db');
        expect(cfg.autoIngestFileSystem).toBe(true);
    });

    test('restores a spec-created key back to undefined', () => {
        const cfg     = {storagePaths: {graph: 'g'}},
              restore = captureAiConfigKeys(cfg, ['collections']);

        cfg.collections = {memory: 'test-mem', session: 'test-sess'};
        restore();

        expect(cfg.collections).toBeUndefined();
    });

    test('deep-clones object captures so live mutation cannot corrupt the snapshot', () => {
        const cfg     = {engines: {chroma: {database: 'prod'}}},
              restore = captureAiConfigKeys(cfg, ['engines']);

        cfg.engines.chroma.database = 'test'; // in-place mutation of the live object AFTER capture
        restore();

        expect(cfg.engines.chroma.database).toBe('prod');
    });

    test('restore is idempotent', () => {
        const cfg     = {storagePaths: {graph: 'original.db'}},
              restore = captureAiConfigKeys(cfg, ['storagePaths.graph']);

        cfg.storagePaths.graph = 'test.db';
        restore();
        restore();

        expect(cfg.storagePaths.graph).toBe('original.db');
    });
});
