import {test, expect} from '@playwright/test';

/**
 * The guard fails on a new literal path into the frozen `resources/content` mirror and holds its
 * census baseline in both directions. Asserted here: what counts as a derivation, and the ratchet.
 * The tree itself is the CI workflow's run against the committed baseline.
 */
test.describe('check-content-root-derivations — literal paths into the mirror, ratchet fails both ways', () => {
    let findMirrorLiterals, diffAgainstBaseline, tallyLiterals;

    const baseline = [{file: 'buildScripts/docs/index/tickets.mjs', literal: 'resources/content/issues', count: 1}];

    test.beforeAll(async () => {
        ({findMirrorLiterals, diffAgainstBaseline, tallyLiterals} =
            await import('../../../../buildScripts/util/check-content-root-derivations.mjs'));
    });

    test('FIRES: a cwd-joined string literal and a template literal', () => {
        const findings = findMirrorLiterals([
            `const INPUT_DIR = path.resolve(process.cwd(), 'resources/content/issues');`,
            'const dir = `${root}/resources/content/pulls`;'
        ].join('\n'), 'buildScripts/docs/index/new.mjs');

        expect(findings.map(entry => [entry.line, entry.literal])).toEqual([
            [1, 'resources/content/issues'],
            [2, '/resources/content/pulls']
        ])
    });

    test('PASSES: comments describing the old layout read nothing', () => {
        expect(findMirrorLiterals([
            '// the mirror lived at resources/content/issues',
            '/** @param {String} dir e.g. `resources/content/pulls` */',
            'const dir = config.contentRoot;'
        ].join('\n'), 'src/Example.mjs')).toEqual([])
    });

    test('a literal in a file the baseline does not cover fails upward', () => {
        const {added, burnedDown} = diffAgainstBaseline([
            {file: 'buildScripts/docs/index/tickets.mjs', literal: 'resources/content/issues'},
            {file: 'apps/portal/model/New.mjs', literal: 'resources/content/issues'}
        ], baseline);

        expect(added.map(entry => entry.file)).toEqual(['apps/portal/model/New.mjs']);
        expect(burnedDown).toEqual([])
    });

    test('a second occurrence in a baselined file fails upward: the count is the assertion', () => {
        const {added} = diffAgainstBaseline([
            {file: 'buildScripts/docs/index/tickets.mjs', literal: 'resources/content/issues'},
            {file: 'buildScripts/docs/index/tickets.mjs', literal: 'resources/content/issues'}
        ], baseline);

        expect(added).toEqual([{file: 'buildScripts/docs/index/tickets.mjs', literal: 'resources/content/issues', count: 2}])
    });

    test('a repointed reader fails downward until its row leaves the baseline', () => {
        const {added, burnedDown} = diffAgainstBaseline([], baseline);

        expect(added).toEqual([]);
        expect(burnedDown).toEqual(baseline)
    });

    test('the tally the baseline is written from is stable and counted', () => {
        expect(tallyLiterals([
            {file: 'b.mjs', literal: 'resources/content', line: 3},
            {file: 'a.mjs', literal: 'resources/content', line: 9},
            {file: 'b.mjs', literal: 'resources/content', line: 7}
        ])).toEqual([
            {file: 'a.mjs', literal: 'resources/content', count: 1},
            {file: 'b.mjs', literal: 'resources/content', count: 2}
        ])
    })
});
