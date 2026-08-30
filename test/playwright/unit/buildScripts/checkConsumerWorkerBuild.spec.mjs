import {test, expect} from '@playwright/test';

/**
 * The consumer worker-build guard (ticket-ref-ok: the spec pins #17881's enforcement AC — a guard
 * that fails when an installed Data worker resolves the framework's modules instead of the
 * consumer's, or fails outright on an app-space root the consumer does not have).
 *
 * Only the rule logic is exercised here. The guard's expensive half — `npm pack`, install into a
 * fixture nested under an `apps/` ancestor, and two real webpack compiles — is what the CI workflow
 * runs, and it cannot be meaningfully faked: a simulated layout is exactly the instrument that
 * reported every root correct while the physical build failed on two of them. So this spec asserts
 * the failure DIRECTIONS, and the workflow asserts the behaviour.
 */
test.describe('check-consumer-worker-build — rule logic', () => {
    let collectConsumerBuildFailures;

    const CONSUMER  = './apps/probe/data/ConsumerOnly.mjs',
          ROOT_ONLY = './RootOnly.mjs',
          UNRELATED = './client/src/Unrelated.mjs',
          healthy   = {mode: 'development', moduleNames: [CONSUMER, './src/worker/Data.mjs'], errors: []};

    test.beforeAll(async () => {
        ({collectConsumerBuildFailures} = await import('../../../../buildScripts/util/check-consumer-worker-build.mjs'))
    });

    test('a build resolving only the consumer\'s modules passes', () => {
        expect(collectConsumerBuildFailures(healthy)).toEqual([])
    });

    test('a missing consumer module fails — the context resolved somewhere else', () => {
        const failures = collectConsumerBuildFailures({...healthy, moduleNames: ['./src/worker/Data.mjs']});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('ConsumerOnly.mjs is absent, expected present')
    });

    test('a root-level Node script reaching a worker bundle fails', () => {
        const failures = collectConsumerBuildFailures({...healthy, moduleNames: [CONSUMER, ROOT_ONLY]});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('RootOnly.mjs is present, expected absent')
    });

    test('an unrelated application tree reaching a worker bundle fails', () => {
        const failures = collectConsumerBuildFailures({...healthy, moduleNames: [CONSUMER, UNRELATED]});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('Unrelated.mjs is present, expected absent')
    });

    test('a resolution error fails even when every module expectation holds', () => {
        // The optional-root regression: the graph can be correct while an absent root fails the build.
        const failures = collectConsumerBuildFailures({...healthy, errors: ["Module not found: Error: Can't resolve '../../../../examples'"]});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain("Can't resolve '../../../../examples'")
    });

    test('every violation is reported, not just the first', () => {
        const failures = collectConsumerBuildFailures({mode: 'production', moduleNames: [ROOT_ONLY, UNRELATED], errors: ['boom']});

        // one error + missing consumer module + two forbidden modules
        expect(failures).toHaveLength(4);
        failures.forEach(failure => expect(failure).toContain('[production]'))
    })
});
