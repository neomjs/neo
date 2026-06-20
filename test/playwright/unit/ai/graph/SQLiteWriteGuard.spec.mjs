import {setup} from '../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'AiSQLiteWriteGuardTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import SQLite         from '../../../../../ai/graph/storage/SQLite.mjs';

// A production-like absolute path: not `:memory:`, no `tmp`/`test` segment.
const PROD_PATH          = '/srv/neo/.neo-ai-data/sqlite/memory-core-graph.sqlite';
const PLAYWRIGHT_WORKER  = {TEST_WORKER_INDEX: '0'}; // Playwright sets this in every worker process
const UNIT_TEST_MODE_ENV = {UNIT_TEST_MODE: 'true'};
const PRODUCTION_RUNTIME = {};                       // neither test signal — the live MCP server / orchestrator

test.describe('Neo.ai.graph.storage.SQLite — test-write isolation guard (#13639 / #13624 axis-3)', () => {
    let storage;

    test.beforeEach(() => {
        storage = Neo.create(SQLite, {dbPath: ':memory:'});
    });

    test.afterEach(() => {
        storage?.destroy?.();
        storage = null;
    });

    test('isDisposableDbPath: :memory:/tmp/*test*/empty are disposable; production paths are not', () => {
        expect(storage.isDisposableDbPath(':memory:')).toBe(true);
        expect(storage.isDisposableDbPath('/var/folders/q/tmp/neo-graph.db')).toBe(true);
        expect(storage.isDisposableDbPath('/Users/x/neo-graph-test-42.db')).toBe(true);
        expect(storage.isDisposableDbPath(null)).toBe(true);
        expect(storage.isDisposableDbPath(PROD_PATH)).toBe(false);
    });

    test('blocks a write to a production graph from a Playwright worker (TEST_WORKER_INDEX set)', () => {
        expect(() => storage.assertTestWriteIsolated({dbPath: PROD_PATH, env: PLAYWRIGHT_WORKER}))
            .toThrow(/GRAPH_WRITE_GUARD/);
    });

    test('blocks a write to a production graph under UNIT_TEST_MODE (test mode resolved to a prod path = misconfig)', () => {
        expect(() => storage.assertTestWriteIsolated({dbPath: PROD_PATH, env: UNIT_TEST_MODE_ENV}))
            .toThrow(/GRAPH_WRITE_GUARD/);
    });

    test('allows disposable targets from a test context (:memory:, tmp, *test*)', () => {
        expect(() => storage.assertTestWriteIsolated({dbPath: ':memory:',        env: PLAYWRIGHT_WORKER})).not.toThrow();
        expect(() => storage.assertTestWriteIsolated({dbPath: '/tmp/neo.db',      env: PLAYWRIGHT_WORKER})).not.toThrow();
        expect(() => storage.assertTestWriteIsolated({dbPath: '/x/graph-test.db', env: UNIT_TEST_MODE_ENV})).not.toThrow();
    });

    test('zero production blast: the live runtime (no test signal) writing to a production path is never guarded', () => {
        expect(() => storage.assertTestWriteIsolated({dbPath: PROD_PATH, env: PRODUCTION_RUNTIME})).not.toThrow();
    });

    test('wired into the real write funnel: addNodes to a production-bound graph throws in a test context', async () => {
        // Await async init so the in-memory DB handle exists — otherwise addNodes early-returns on `!this.db`
        // BEFORE reaching the guard, which would false-green this assertion.
        for (let i = 0; i < 200 && !storage.db; i++) { await new Promise(resolve => setTimeout(resolve, 5)); }
        expect(storage.db, 'SQLite in-memory DB should be initialised before the write-path assertion').toBeTruthy();

        // The DB stays in-memory (disposable + harmless); only dbPath is repointed at a prod path, so the
        // guard fires BEFORE any row is written — proving the funnel is guarded without ever touching prod.
        storage.dbPath = PROD_PATH;
        expect(() => storage.addNodes([{id: 'pollution-node', label: 'X', properties: {}}])).toThrow(/GRAPH_WRITE_GUARD/);

        // And with the DB still bound to :memory: (disposable), the same funnel allows the write (no false-positive).
        storage.dbPath = ':memory:';
        expect(() => storage.addNodes([{id: 'ok-node', label: 'X', properties: {name: 'ok'}}])).not.toThrow();
    });
});
