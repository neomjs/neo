import {test, expect} from '@playwright/test';
import path           from 'node:path';

/**
 * The consumer runtime-build guard fails when installed Data/Main contexts resolve framework
 * modules instead of consumer-owned modules, or fail outright on an optional consumer root.
 *
 * Only the rule logic is exercised here. The guard's expensive half — `npm pack`, install into a
 * fixture nested under an `apps/` ancestor, and six real webpack compiles — is what the CI workflow
 * runs, and it cannot be meaningfully faked: a simulated layout is exactly the instrument that
 * reported every root correct while the physical build failed on two of them. So this spec asserts
 * the failure DIRECTIONS, and the workflow asserts the behaviour.
 */
test.describe('check-consumer-runtime-build — rule logic', () => {
    let collectConsumerBuildFailures, collectMainContextFailures;

    const CONSUMER         = './apps/probe/data/ConsumerOnly.mjs',
          ROOT_ONLY        = './RootOnly.mjs',
          UNRELATED        = './client/src/Unrelated.mjs',
          healthy          = {mode: 'development', moduleNames: [CONSUMER, './src/worker/Data.mjs'], errors: []},
          workspace        = path.join(path.sep, 'fixture'),
          packageContext   = {context: path.join(workspace, 'node_modules/neo.mjs/src/main/addon'), regExpSource: '^\\.\\/.*\\.mjs$'},
          emptyContext     = {...packageContext, regExpSource: '(?!)'},
          workspaceContext = {context: path.join(workspace, 'src/main/addon'), regExpSource: '^\\.\\/.*\\.mjs$'};

    test.beforeAll(async () => {
        ({collectConsumerBuildFailures, collectMainContextFailures} = await import('../../../../buildScripts/util/check-consumer-runtime-build.mjs'))
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
    });

    test('an absent workspace root keeps one live package context plus one empty WS fallback', () => {
        expect(collectMainContextFailures(
            {mode: 'development/main-absent', contextModules: [packageContext, emptyContext]},
            workspace,
            'absent'
        )).toEqual([])
    });

    test('an absent workspace root fails if the WS fallback can expose package addons', () => {
        const failures = collectMainContextFailures(
            {mode: 'development/main-absent', contextModules: [packageContext]},
            workspace,
            'absent'
        );

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('matches-nothing package fallbacks')
    });

    test('a present workspace root must stay live instead of falling back to an empty package context', () => {
        expect(collectMainContextFailures(
            {mode: 'production/main-present', contextModules: [packageContext, workspaceContext]},
            workspace,
            'present'
        )).toEqual([]);

        const failures = collectMainContextFailures(
            {mode: 'production/main-present', contextModules: [packageContext, emptyContext]},
            workspace,
            'present'
        );

        expect(failures).toHaveLength(2);
        expect(failures[0]).toContain('live workspace roots');
        expect(failures[1]).toContain('empty package fallbacks')
    })
});
