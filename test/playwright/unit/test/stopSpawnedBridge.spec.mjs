import {test, expect}                                              from '@playwright/test';
import {assertUnnavigatedBeforeNeuralLinkRoute, stopSpawnedBridge} from '../../fixtures.mjs';

/**
 * Coverage for the rule the neuralLink fixture's worker teardown applies: a Bridge is stopped only when this
 * process spawned it, which `ConnectionService` records as its `bridgeProcess`. A Bridge found listening (the
 * operator's live `:8081`, another seat's) leaves `bridgeProcess` null and must survive every run.
 */
function connection(bridgeProcess) {
    const calls = [];

    return {
        bridgeProcess,
        calls,
        async manageConnection(args) {
            calls.push(args);
            return {message: 'stopped'}
        }
    }
}

test.describe('test/playwright/fixtures — stopSpawnedBridge', () => {
    test('a Bridge this process spawned is stopped through the Brain stop contract', async () => {
        const spawned = connection({pid: 4242});

        expect(await stopSpawnedBridge(spawned)).toBe(true);
        expect(spawned.calls).toEqual([{action: 'stop'}])
    });

    test('a Bridge found already listening is never stopped', async () => {
        const external = connection(null);

        expect(await stopSpawnedBridge(external)).toBe(false);
        expect(external.calls).toEqual([])
    });

    test('a worker that never loaded the Neural Link services stops nothing', async () => {
        expect(await stopSpawnedBridge(null)).toBe(false);
        expect(await stopSpawnedBridge(undefined)).toBe(false)
    });

    test('assertUnnavigatedBeforeNeuralLinkRoute allows about:blank and rejects pre-navigated pages (#20142)', () => {
        expect(() => assertUnnavigatedBeforeNeuralLinkRoute({url: () => 'about:blank'})).not.toThrow();
        expect(() => assertUnnavigatedBeforeNeuralLinkRoute({url: () => ''})).not.toThrow();
        expect(() => assertUnnavigatedBeforeNeuralLinkRoute(null)).not.toThrow();

        expect(() => assertUnnavigatedBeforeNeuralLinkRoute({
            url: () => 'http://localhost:8080/examples/grid/lockedColumns/'
        })).toThrow(/Include \{ neuralLink \} in test\.beforeEach whenever beforeEach calls page\.goto\(\)\./)
    })
});
