import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

import {
    DEFAULT_THRESHOLDS,
    evaluateMeasurements,
    isInScopePath,
    measureSource,
    parseGrowthDeclarations,
    reconcileBaseline
} from '../../../../buildScripts/util/check-file-sizes.mjs';

const measured = codeLines => ({
    codeLines,
    docLines  : 0,
    docPercent: 0,
    status    : 'measured',
    totalLines: codeLines
});

const evaluate = ({
    current,
    base = {},
    head = {},
    body = '',
    changed = null,
    compareBase = true
}) => evaluateMeasurements({
    measurements: Object.fromEntries(
        Object.entries(current).map(([file, codeLines]) => [file, measured(codeLines)])
    ),
    baseBaseline: base,
    changedFiles: changed && new Set(changed),
    headBaseline: head,
    declarations: parseGrowthDeclarations(body),
    compareBase,
    thresholds  : DEFAULT_THRESHOLDS
});

test.describe('check-file-sizes', () => {
    test('scope admits the four guarded roots and rejects adjacent trees', () => {
        expect([
            'src/a.mjs',
            'apps/a.mjs',
            'examples/a.mjs',
            'buildScripts/a.mjs'
        ].every(file => isInScopePath(file))).toBe(true);
        expect(isInScopePath('test/a.mjs')).toBe(false);
        expect(isInScopePath('src/a.js')).toBe(false);
    });

    test.describe('parser-owned measurement', () => {
        test('counts token-bearing lines while excluding comments and blanks', () => {
            const source = [
                '/**',
                ' * Documentation, not code.',
                ' */',
                '',
                'const value = 1; // trailing documentation',
                'const url = "https://example.test/a//b";',
                'const marker = "/* still a string */";',
                '',
                'export default value;'
            ].join('\n');

            const result = measureSource(source, 'src/example.mjs');

            expect(result).toMatchObject({
                codeLines : 4,
                docLines  : 4,
                status    : 'measured',
                totalLines: 9
            });
        });

        test('counts each nonblank line spanned by a multiline token', () => {
            const result = measureSource('const text = `one\n\ntwo`;\nexport default text;', 'src/template.mjs');

            expect(result.codeLines).toBe(3);
        });

        test('returns not-measured on parse failure, never a clean zero', () => {
            const result = measureSource('export const broken = ;', 'src/broken.mjs');

            expect(result.status).toBe('not-measured');
            expect(result.codeLines).toBeNull();
            expect(result.error).toContain('Unexpected token');

            const evaluation = evaluateMeasurements({
                measurements: {'src/broken.mjs': result},
                baseBaseline: {},
                headBaseline: {},
                declarations: parseGrowthDeclarations(''),
                compareBase : true,
                thresholds  : DEFAULT_THRESHOLDS
            });

            expect(evaluation.rows[0]).toMatchObject({band: 'not-measured', verdict: 'fail'});
            expect(evaluation.violations[0].reason).toContain('not-measured');
        });
    });

    test.describe('three thresholds, one gate', () => {
        test('labels admitted files yellow and red without changing their verdict', () => {
            const result = evaluate({
                current: {
                    'src/yellow.mjs': 1_500,
                    'src/red.mjs'   : 2_000
                },
                base: {
                    'src/yellow.mjs': 1_500,
                    'src/red.mjs'   : 2_000
                },
                head: {
                    'src/yellow.mjs': 1_500,
                    'src/red.mjs'   : 2_000
                }
            });

            expect(result.violations).toEqual([]);
            expect(result.rows.map(row => [row.file, row.band, row.verdict])).toEqual([
                ['src/red.mjs', 'red', 'pass'],
                ['src/yellow.mjs', 'yellow', 'pass']
            ]);
        });

        test('an unbaselined file fails at 1001 and passes at 1000', () => {
            const result = evaluate({
                current: {
                    'src/at-target.mjs'  : 1_000,
                    'src/over-target.mjs': 1_001
                }
            });

            expect([...new Set(result.violations.map(item => item.file))]).toEqual(['src/over-target.mjs']);
            expect(result.violations.map(item => item.reason).join('\n')).toMatch(/enroll[\s\S]*size-guard-growth/u);
            expect(result.rows.find(row => row.file === 'src/at-target.mjs').verdict).toBe('pass');
        });

        test('doc percentage is reported but cannot change the verdict', () => {
            const measurements = {
                'src/doc-heavy.mjs': {
                    ...measured(1_000),
                    docLines  : 9_000,
                    docPercent: 90,
                    totalLines: 10_000
                }
            };

            const result = evaluateMeasurements({
                measurements,
                baseBaseline: {},
                headBaseline: {},
                declarations: parseGrowthDeclarations(''),
                compareBase : true,
                thresholds  : DEFAULT_THRESHOLDS
            });

            expect(result.violations).toEqual([]);
            expect(result.rows[0]).toMatchObject({docPercent: 90, verdict: 'pass'});
        });
    });

    test.describe('row demands are scoped to the changed set (#18345)', () => {
        const
            mine   = 'src/large.mjs',
            theirs = 'src/other.mjs';

        test('a stale row on a path this change did not touch is reported, not gated', () => {
            // The defect, twice in ninety minutes: a baseline row goes stale on the base branch and
            // every unrelated pull request — a dependency bot's included — is told to lower a number
            // its diff never touched, and cannot justify.
            const result = evaluate({
                changed: [mine],
                current: {[mine]: 1_100, [theirs]: 1_415},
                base   : {[mine]: 1_100, [theirs]: 1_419},
                head   : {[mine]: 1_100, [theirs]: 1_419}
            });

            expect(result.violations).toEqual([]);
            expect(result.rows.find(row => row.file === theirs).verdict).toBe('pass');
            // Reported, not silenced — the row still carries its measurement.
            expect(result.rows.find(row => row.file === theirs).codeLines).toBe(1_415);
        });

        test('NON-VACUITY: the same stale row on a path this change DID touch still fails', () => {
            // Without this, the arm above passes on a guard that stopped checking anything at all.
            const result = evaluate({
                changed: [mine, theirs],
                current: {[mine]: 1_100, [theirs]: 1_415},
                base   : {[mine]: 1_100, [theirs]: 1_419},
                head   : {[mine]: 1_100, [theirs]: 1_419}
            });

            expect(result.violations[0].reason).toContain('lower the HEAD baseline');
        });

        test('the GROWTH gate is untouched by the scoping', () => {
            // The one that must never be scoped away. Growth is why the ratchet exists, and a future
            // refactor that applies the changed-set filter to the declaration branch would disarm it
            // while leaving every other arm green.
            const result = evaluate({
                changed: [mine],
                current: {[mine]: 1_201},
                base   : {[mine]: 1_200},
                head   : {[mine]: 1_201}
            });

            expect(result.violations[0].reason).toContain('size-guard-growth');
        });

        test('enrollment of a newly added offender still needs declaration and row', () => {
            const result = evaluate({changed: [mine], current: {[mine]: 1_201}, base: {}, head: {}});

            expect(result.violations.map(violation => violation.reason).join(' ')).toContain('enroll');
        });

        test('whole-tree mode has no diff to be outside of, so every path stays in scope', () => {
            // `changed: null` is the on-demand audit. Exempting everything there would make the
            // whole-tree run structurally incapable of reporting the very drift it exists to find.
            const result = evaluate({
                current: {[theirs]: 1_415},
                base   : {[theirs]: 1_419},
                head   : {[theirs]: 1_419}
            });

            expect(result.violations[0].reason).toContain('lower the HEAD baseline');
        })
    });

    test.describe('base-to-HEAD ratchet', () => {
        const file = 'src/large.mjs';

        test('equality passes only with the ceiling preserved', () => {
            expect(evaluate({current: {[file]: 1_200}, base: {[file]: 1_200}, head: {[file]: 1_200}}).violations)
                .toEqual([]);

            const raised = evaluate({current: {[file]: 1_200}, base: {[file]: 1_200}, head: {[file]: 1_300}});

            expect(raised.violations[0].reason).toContain('HEAD baseline must equal the measured count');
        });

        test('a shrink fails with a stale ceiling and passes when the HEAD entry turns', () => {
            const stale   = evaluate({current: {[file]: 1_199}, base: {[file]: 1_200}, head: {[file]: 1_200}}),
                  lowered = evaluate({current: {[file]: 1_199}, base: {[file]: 1_200}, head: {[file]: 1_199}});

            expect(stale.violations[0].reason).toContain('lower the HEAD baseline');
            expect(lowered.violations).toEqual([]);
        });

        test('raising only the JSON cannot disguise code growth', () => {
            const result = evaluate({current: {[file]: 1_201}, base: {[file]: 1_200}, head: {[file]: 1_201}});

            expect(result.violations[0].reason).toContain('size-guard-growth');
        });

        test('declared growth passes only when the HEAD entry equals the measured count', () => {
            const body = `size-guard-growth: ${file} — the destination owner lands in the next leaf`;

            expect(evaluate({current: {[file]: 1_201}, base: {[file]: 1_200}, head: {[file]: 1_201}, body}).violations)
                .toEqual([]);

            const staleHead = evaluate({current: {[file]: 1_201}, base: {[file]: 1_200}, head: {[file]: 1_200}, body});

            expect(staleHead.violations[0].reason).toContain('HEAD baseline must equal the measured count');
        });

        test('a new offender requires both exact declaration and enrollment', () => {
            const body = `size-guard-growth: ${file} — temporarily owns the new parser seam`;

            expect(evaluate({current: {[file]: 1_001}, head: {[file]: 1_001}, body}).violations).toEqual([]);

            expect(evaluate({current: {[file]: 1_001}, head: {[file]: 1_001}}).violations[0].reason)
                .toContain('size-guard-growth');

            expect(evaluate({current: {[file]: 1_001}, body}).violations[0].reason)
                .toContain('enroll');
        });

        test('at-target and deleted paths cannot retain baseline entries', () => {
            const atTarget = evaluate({current: {[file]: 1_000}, base: {[file]: 1_200}, head: {[file]: 1_200}}),
                  deleted  = evaluate({current: {}, base: {[file]: 1_200}, head: {[file]: 1_200}});

            expect(atTarget.violations[0].reason).toContain('remove');
            expect(deleted.violations[0].reason).toContain('remove');

            expect(evaluate({current: {[file]: 1_000}, base: {[file]: 1_200}}).violations).toEqual([]);
            expect(evaluate({current: {}, base: {[file]: 1_200}}).violations).toEqual([]);
        });

        test('on-demand mode verifies HEAD alignment and declares that history was not evaluated', () => {
            const result = evaluate({
                current    : {[file]: 1_200},
                head       : {[file]: 1_200},
                compareBase: false
            });

            expect(result.violations).toEqual([]);
            expect(result.monotonicityEvaluated).toBe(false);
        });
    });

    test.describe('growth declaration grammar', () => {
        test('accepts the exact anchored grammar and records the reason', () => {
            const parsed = parseGrowthDeclarations('size-guard-growth: src/large.mjs — the owner does not exist yet');

            expect(parsed.declarations.get('src/large.mjs')).toBe('the owner does not exist yet');
            expect(parsed.malformed).toEqual([]);
        });

        test('ignores prose that merely names the marker', () => {
            const parsed = parseGrowthDeclarations('Use `size-guard-growth:` only when a measured path grew.');

            expect([...parsed.declarations]).toEqual([]);
            expect(parsed.malformed).toEqual([]);
        });

        test('rejects malformed, wrong-dash, unsafe, and duplicate lines', () => {
            const parsed = parseGrowthDeclarations([
                'size-guard-growth: src/no-reason.mjs —',
                'size-guard-growth: src/ascii.mjs - reason',
                'size-guard-growth: ../outside.mjs — reason',
                'size-guard-growth: src/dup.mjs — first',
                'size-guard-growth: src/dup.mjs — second'
            ].join('\n'));

            expect(parsed.declarations.has('src/dup.mjs')).toBe(false);
            expect(parsed.malformed).toHaveLength(4);
            expect(parsed.duplicates).toEqual(['src/dup.mjs']);
        });

        test('a declaration for another path does not admit growth', () => {
            const result = evaluate({
                current: {'src/large.mjs': 1_201},
                base   : {'src/large.mjs': 1_200},
                head   : {'src/large.mjs': 1_201},
                body   : 'size-guard-growth: src/other.mjs — unrelated'
            });

            expect(result.violations[0].reason).toContain('src/large.mjs');
            expect(result.unusedDeclarations).toEqual(['src/other.mjs']);
        });
    });

    test('reconcileBaseline writes measured offenders only and removes target/deleted entries', () => {
        const next = reconcileBaseline({
            measurements: {
                'src/b.mjs' : measured(1_200),
                'src/a.mjs' : measured(1_100),
                'src/ok.mjs': measured(1_000)
            },
            thresholds: DEFAULT_THRESHOLDS
        });

        expect(next).toEqual({
            'src/a.mjs': 1_100,
            'src/b.mjs': 1_200
        });
    });

    test('the workflow fetches current PR truth and never reads the event-snapshot body', () => {
        const workflow = readFileSync('.github/workflows/file-size-guard.yml', 'utf8');

        expect(workflow).toContain('github.rest.pulls.get');
        expect(workflow).toContain('data.body');
        expect(workflow).not.toContain('context.payload.pull_request.body');
        expect(workflow).toContain('fetch-depth: 0');
        expect(workflow).toContain('--base');
        expect(workflow).toContain('--pr-body-file');
    });
});
