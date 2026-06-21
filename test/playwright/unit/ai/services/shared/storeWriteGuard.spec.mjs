import {test, expect}                                                        from '@playwright/test';
import {isDisposableStorePath, isTestRunnerContext, assertTestWriteIsolated} from '../../../../../../ai/services/shared/storeWriteGuard.mjs';
import os                                                                    from 'node:os';
import path                                                                  from 'node:path';

// A production-like absolute path: not :memory:, no tmp/test segment.
const PROD_PATH = '/srv/neo/.neo-ai-data/datasets/rlaif/trajectories.jsonl';

test.describe('ai/services/shared/storeWriteGuard', () => {
    test('isDisposableStorePath: :memory:/tmp/*test*/empty are disposable; production paths are not', () => {
        expect(isDisposableStorePath(':memory:')).toBe(true);
        expect(isDisposableStorePath('/var/folders/q/tmp/neo.jsonl')).toBe(true);
        expect(isDisposableStorePath('/x/concepts-test/nodes.jsonl')).toBe(true);
        expect(isDisposableStorePath(null)).toBe(true);
        expect(isDisposableStorePath('')).toBe(true);
        expect(isDisposableStorePath(PROD_PATH)).toBe(false);
    });

    test('isDisposableStorePath: a real os.tmpdir() path is disposable even without a tmp/test segment', () => {
        // macOS os.tmpdir() is /var/folders/.../T — no `tmp`/`test` substring — so the substring arms miss
        // it; the os.tmpdir() prefix arm is what classifies it disposable. A file-store guard whose tests
        // use os.tmpdir() (e.g. ConceptDiscoveryService) would false-positive on every run without this.
        expect(isDisposableStorePath(os.tmpdir())).toBe(true);
        expect(isDisposableStorePath(path.join(os.tmpdir(), 'neo-store-xyz', 'nodes.jsonl'))).toBe(true);
    });

    test('isTestRunnerContext: TEST_WORKER_INDEX or UNIT_TEST_MODE → true; neither → false', () => {
        expect(isTestRunnerContext({TEST_WORKER_INDEX: '0'})).toBe(true);
        expect(isTestRunnerContext({TEST_WORKER_INDEX: '3'})).toBe(true);
        expect(isTestRunnerContext({UNIT_TEST_MODE: 'true'})).toBe(true);
        expect(isTestRunnerContext({})).toBe(false);
        expect(isTestRunnerContext({UNIT_TEST_MODE: 'false'})).toBe(false);
    });

    test('assertTestWriteIsolated: throws for a test runner targeting a production store path', () => {
        expect(() => assertTestWriteIsolated({storePath: PROD_PATH, subsystem: 'rlaif',   env: {TEST_WORKER_INDEX: '0'}})).toThrow(/STORE_WRITE_GUARD/);
        expect(() => assertTestWriteIsolated({storePath: PROD_PATH, subsystem: 'concept', env: {UNIT_TEST_MODE: 'true'}})).toThrow(/STORE_WRITE_GUARD/);
    });

    test('assertTestWriteIsolated: allows disposable targets from a test context', () => {
        expect(() => assertTestWriteIsolated({storePath: ':memory:',        env: {TEST_WORKER_INDEX: '0'}})).not.toThrow();
        expect(() => assertTestWriteIsolated({storePath: '/tmp/neo.jsonl',  env: {TEST_WORKER_INDEX: '0'}})).not.toThrow();
        expect(() => assertTestWriteIsolated({storePath: '/x/foo-test.db',  env: {UNIT_TEST_MODE: 'true'}})).not.toThrow();
    });

    test('zero production blast: the live runtime (no test signal) writing to a production path is never guarded', () => {
        expect(() => assertTestWriteIsolated({storePath: PROD_PATH, env: {}})).not.toThrow();
    });
});
