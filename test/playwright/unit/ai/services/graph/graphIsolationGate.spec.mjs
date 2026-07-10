import {test, expect}              from '@playwright/test';
import {assertIsolatedGraphTarget} from './graphIsolationGate.mjs';

/**
 * @summary The graph-isolation gate must validate the RESOLVED target, not just the intent
 * toggle — the negative case is a true test-path-aliased-onto-prod configuration, which a
 * toggle-only gate accepts and then pollutes the live advisory's source set.
 */
test.describe('graphIsolationGate — resolved-target validation', () => {

    test('toggle off refuses (the bare-invocation class)', () => {
        expect(() => assertIsolatedGraphTarget({
            useTestDatabase: false,
            graph          : '/data/prod-graph.sqlite',
            graphProd      : '/data/prod-graph.sqlite'
        })).toThrow(/useTestDatabase is not true/);
    });

    test('toggle ON but test path aliased onto the production path STILL refuses — the resolved fact wins over the intent flag', () => {
        expect(() => assertIsolatedGraphTarget({
            useTestDatabase: true,
            graph          : '/data/prod-graph.sqlite',
            graphProd      : '/data/prod-graph.sqlite'
        })).toThrow(/RESOLVED storagePaths.graph equals storagePaths.graphProd/);
    });

    test('toggle ON with a distinct resolved target passes', () => {
        expect(() => assertIsolatedGraphTarget({
            useTestDatabase: true,
            graph          : ':memory:',
            graphProd      : '/data/prod-graph.sqlite'
        })).not.toThrow();
    });
});
