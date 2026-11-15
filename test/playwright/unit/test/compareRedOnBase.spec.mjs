import {test, expect}                                                       from '@playwright/test';
import {compareRedOnBase, indexReport, redOnBaseSummary, redOnBaseWarnings} from '../../compareRedOnBase.mjs';

/**
 * @summary Builds a minimal reporter fixture with real nested suite and retry-result shapes.
 * @param {Object[]} rows
 * @param {Object[]} [errors=[]]
 * @returns {Object}
 */
function report(rows, errors = []) {
    return {
        errors,
        suites: [{title: 'example.spec.mjs', file: 'example.spec.mjs', suites: [{
            title: 'group', file: 'example.spec.mjs',
            specs: rows.map(({title = 'arm', status = 'passed', line = 10, project = 'unit-engine', file = 'example.spec.mjs'}) => ({
                title, file, line, tests: [{projectName: project, expectedStatus: 'passed',
                    status : status === 'passed' ? 'expected' : status === 'skipped' ? 'skipped' : 'unexpected',
                    results: [{status}]}]
            }))
        }]}]
    }
}

test.describe('red-on-base report comparison', () => {
    test('a passing head arm fails on base without conflating moved line numbers', () => {
        const rows = compareRedOnBase(report([{line: 90}]), report([{status: 'failed', line: 2}]), report([]));
        expect(rows[0]).toMatchObject({isNew: true, classification: 'fails-without-change', line: 90});
        expect(rows[0].titlePath).toEqual(['group', 'arm']);
        expect(redOnBaseWarnings(rows)).toEqual([])
    });

    test('warns at the head line for a new test that passes both ways', () => {
        const rows = compareRedOnBase(report([{}]), report([{}]), report([]));
        expect(redOnBaseWarnings(rows)).toEqual([
            '::warning file=test/playwright/unit/example.spec.mjs,line=10::group › arm passes with and without the source change.'
        ]);
        expect(redOnBaseSummary(rows)).toContain('| passed | passed | passes-both |')
    });

    test('does not warn on an existing title even when its line or body changed', () => {
        const rows = compareRedOnBase(report([{line: 100}]), report([{}]), report([{line: 1}]));
        expect(rows[0].isNew).toBe(false);
        expect(redOnBaseWarnings(rows)).toEqual([]);
        expect(redOnBaseSummary(rows)).toContain('| test/playwright/unit/example.spec.mjs | passes-both | 1 |')
    });

    test('a renamed arm reads as new', () => {
        expect(compareRedOnBase(report([{title: 'new'}]), report([{title: 'new'}]), report([{title: 'old'}]))[0].isNew).toBe(true)
    });

    test('an added spec is new even if discovery of another base spec failed', () => {
        const rows = compareRedOnBase(report([{}]), report([{}]), report([], [{message: 'load error'}]), ['test/playwright/unit/example.spec.mjs']);
        expect(rows[0].isNew).toBe(true)
    });

    test('missing base tests after an import error are not proof of the fix', () => {
        const rows = compareRedOnBase(report([{}]), report([], [{message: 'Cannot find module'}]), report([]));
        expect(rows[0]).toMatchObject({classification: 'cannot-load', baseStatus: 'load-error'});
        expect(redOnBaseWarnings(rows)).toEqual([])
    });

    test('a failing head, a skipped base and a missing result are inconclusive', () => {
        for (const [head, base] of [[report([{status: 'failed'}]), report([{status: 'failed'}])],
            [report([{}]), report([{status: 'skipped'}])], [report([{}]), report([])]]) {
            expect(compareRedOnBase(head, base, report([]))[0].classification).toBe('inconclusive')
        }
    });

    test('unreadable or wrong-shaped reports fail rather than certify an empty run', () => {
        expect(() => indexReport(null)).toThrow(/Playwright/);
        expect(() => compareRedOnBase(report([]), {}, report([]))).toThrow(/Playwright/)
    });

    test('projects and files are identity, while line numbers are not', () => {
        const rows = compareRedOnBase(report([{project: 'a'}, {project: 'b'}, {file: 'other.spec.mjs'}]),
            report([{project: 'a', status: 'failed'}, {project: 'b'}, {file: 'other.spec.mjs'}]), report([]));
        expect(rows.map(row => row.classification)).toEqual(['fails-without-change', 'passes-both', 'passes-both'])
    });

    test('base discovery failures do not mislabel all existing tests as new', () => {
        const rows = compareRedOnBase(report([{}]), report([{}]), report([], [{message: 'load'}]));
        expect(rows[0].isNew).toBeNull();
        expect(redOnBaseWarnings(rows)).toEqual([]);
        expect(redOnBaseSummary(rows)).toContain('novelty is unknown')
    });

    test('test titles cannot inject workflow commands or summary table rows', () => {
        const rows = compareRedOnBase(report([{title: 'hello\n::error::bad | <b>%'}]),
            report([{title: 'hello\n::error::bad | <b>%'}]), report([]));
        expect(redOnBaseWarnings(rows)[0]).toContain('%0A::error::bad | <b>%25');
        expect(redOnBaseWarnings(rows)[0].split('\n')).toHaveLength(1);
        expect(redOnBaseSummary(rows)).toContain('&#124; &lt;b&gt;')
    });

    test('a load error in one file does not erase a successful result from another', () => {
        const head = report([{}, {file: 'other.spec.mjs'}]),
              base = report([{}], [{message: 'load error in other'}]);
        base.errorFiles = ['test/playwright/unit/other.spec.mjs'];
        const rows = compareRedOnBase(head, base, report([]));
        expect(rows.map(row => row.classification)).toEqual(['passes-both', 'cannot-load']);
        expect(redOnBaseWarnings(rows)).toHaveLength(1)
    });

    test('normalizes Windows reporter paths without changing title identity', () => {
        const head = report([{file: 'C:\\repo\\test\\playwright\\unit\\example.spec.mjs'}]),
              base = report([{file: '/repo/test/playwright/unit/example.spec.mjs'}]);
        expect(compareRedOnBase(head, base, report([{}]))[0]).toMatchObject({classification: 'passes-both', isNew: false})
    });

    test('an unexpected pass of an expected-failure arm is a base failure, not a skipped run', () => {
        const head     = report([{status: 'failed'}]),
              base     = report([{}]),
              headTest = head.suites[0].suites[0].specs[0].tests[0],
              baseTest = base.suites[0].suites[0].specs[0].tests[0];
        headTest.expectedStatus = baseTest.expectedStatus = 'failed';
        headTest.status = 'expected';
        baseTest.status = 'unexpected';
        expect(compareRedOnBase(head, base, report([]))[0].classification).toBe('fails-without-change')
    })
});
