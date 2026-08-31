import {test, expect} from '@playwright/test';
import {readFile}     from 'node:fs/promises';

import {
    assertCorpusFreshness,
    assertEmissionStageSet,
    emitGeneratedData,
    readCorpusFacetCommitDates,
    REQUIRED_EMISSION_STAGES
}                     from '../../../../buildScripts/dataSyncPipeline.mjs';

const
    NOW   = new Date('2026-08-31T12:00:00Z'),
    hours = n => new Date(NOW.getTime() - n * 3_600_000).toISOString(),

    /**
     * The stage table as it stands, restated here rather than imported: `emissionCommands` is not
     * exported, and importing it would make the mutation below a mutation of the module's own state.
     * @type {Object[]}
     */
    fullStages = [
        {label: 'install dependencies',   tokenScope: 'none'},
        {label: 'content indexes and SEO', requiresFreshCorpus: true, tokenScope: 'reader'}
    ];

/**
 * The two axes that make `no-generated-changes` unreachable by having no generator.
 *
 * `c623b2f63c` removed the `GitHub Workflow corpus` stage and the pipeline went SHORTER, not red:
 * two stages, both green, `no-generated-changes`, exit 0 — for five days, over a corpus frozen on
 * 2026-08-26, while the surviving derivation stage kept committing fresh-looking portal artifacts
 * derived from it. Every spec here is a negative control against that exact shape: each one is
 * written so that removing the guard it covers turns it red.
 */
test.describe('dataSyncPipeline guards (#17920)', () => {
    test.describe('stage-set assertion (AC-3)', () => {
        test('accepts the stage set that is actually declared', () => {
            expect(() => assertEmissionStageSet({stages: fullStages})).not.toThrow()
        });

        test('a stage removed from the table turns the run RED, naming the stage', () => {
            const mutated = fullStages.filter(stage => stage.label !== 'content indexes and SEO');

            // Not merely `toThrow()`: a guard that threw for any other reason would pass that, and
            // the finding is specifically that the ABSENCE must be named. An operator reading a
            // shorter run needs the missing label, not a generic failure.
            expect(() => assertEmissionStageSet({stages: mutated}))
                .toThrow(/missing "content indexes and SEO"/)
        });

        test('names EVERY missing stage, not just the first', () => {
            let message = '';

            try {
                assertEmissionStageSet({stages: []})
            } catch (error) {
                message = error.message
            }

            // The pipeline's own deferred-failure design learned this: a single slot let one cause
            // hide three others and the operator sized the outage from whichever ran last.
            for (const label of REQUIRED_EMISSION_STAGES) {
                expect(message).toContain(label)
            }
        });

        test('a table carrying only unrelated stages does not lower the bar', () => {
            expect(() => assertEmissionStageSet({stages: [{label: 'something else'}]}))
                .toThrow(/missing/)
        });

        test('the expectation is a LITERAL, not derived from the table it checks', async () => {
            // This assertion is on SOURCE TEXT, and it has to be. The mutation that silently defeats
            // this guard is not deleting it — it is tidying `REQUIRED_EMISSION_STAGES` into
            // `emissionCommands.map(stage => stage.label)`. At runtime that is INVISIBLE while the
            // table is intact: both forms yield the same two labels, so every behavioural assertion
            // here stays green. It only turns dangerous when a stage is later deleted, and by then
            // the expectation deletes itself alongside it — a witness derived from the thing it
            // witnesses attests to nothing.
            //
            // Verified by mutation, not by reasoning: with the derived form in place the whole
            // behavioural suite passed 15/15, and only this check goes red.
            const source = await readFile(
                new URL('../../../../buildScripts/dataSyncPipeline.mjs', import.meta.url), 'utf8'
            );

            const [, declaration] = source.match(/export const REQUIRED_EMISSION_STAGES\s*=\s*([^;]+);/) ?? [];

            expect(declaration, 'REQUIRED_EMISSION_STAGES declaration not found — was it renamed?')
                .toBeDefined();
            expect(declaration, 'the expectation must not be computed from `emissionCommands`')
                .not.toContain('emissionCommands');
            expect(declaration.trim(), 'the expectation must be an inline array literal')
                .toMatch(/^\[[^[\]]*\]$/);

            // And the literal must still describe the running module, or the guard drifts the other
            // way: a stale literal that expects stages nobody runs breaks every green pipeline.
            expect(REQUIRED_EMISSION_STAGES).toEqual(['install dependencies', 'content indexes and SEO'])
        })
    });

    test.describe('corpus freshness assertion (AC-4)', () => {
        const fresh = {discussions: hours(2), issues: hours(1), pulls: hours(3)};

        test('a corpus advancing on cadence derives normally', () => {
            expect(() => assertCorpusFreshness({facetCommitDates: fresh, maxAgeHours: 48, now: NOW}))
                .not.toThrow()
        });

        test('the five-day frozen corpus is refused, naming the facet and its age', () => {
            // The witnessed shape: all three facets last committed 2026-08-26, measured 08-31.
            expect(() => assertCorpusFreshness({
                facetCommitDates: {discussions: hours(120), issues: hours(116), pulls: hours(118)},
                maxAgeHours     : 48,
                now             : NOW
            })).toThrow(/`issues` is 116\.0h old \(threshold 48h\)/)
        });

        test('ONE stale facet is enough — facets drift apart and are certified separately', () => {
            expect(() => assertCorpusFreshness({
                facetCommitDates: {...fresh, pulls: hours(72)},
                maxAgeHours     : 48,
                now             : NOW
            })).toThrow(/`pulls`/)
        });

        test('a facet with no commit visible is stale, not permissive', () => {
            // `null` means the instrument saw nothing. For a corpus published on a cadence that is
            // the loudest state; treating it as "no age to compare" fails OPEN, which is the whole
            // family of defect this ticket sits in.
            expect(() => assertCorpusFreshness({
                facetCommitDates: {...fresh, discussions: null},
                maxAgeHours     : 48,
                now             : NOW
            })).toThrow(/no commit visible for `discussions`/)
        });

        test('the boundary is strictly past the threshold, not at it', () => {
            expect(() => assertCorpusFreshness({
                facetCommitDates: {...fresh, issues: hours(48)},
                maxAgeHours     : 48,
                now             : NOW
            })).not.toThrow();

            expect(() => assertCorpusFreshness({
                facetCommitDates: {...fresh, issues: hours(48.1)},
                maxAgeHours     : 48,
                now             : NOW
            })).toThrow()
        })
    });

    test.describe('facet commit dates are read from the COMMITTED corpus', () => {
        const gitLog = dates => (command, args) => {
            const subpath = args[args.indexOf('--') + 1];

            return Promise.resolve({stderr: '', stdout: (dates[subpath] ?? '') + '\n'})
        };

        test('measures git log, never mtime — the Actions checkout makes every file look fresh', async () => {
            const calls = [];

            await readCorpusFacetCommitDates({
                cwd    : '/repo',
                execute: (command, args) => {
                    calls.push({args, command});

                    return Promise.resolve({stderr: '', stdout: `${hours(1)}\n`})
                }
            });

            expect(calls.every(call => call.command === 'git')).toBe(true);
            expect(calls.every(call => call.args[0] === 'log')).toBe(true);
            expect(calls.every(call => call.args.includes('--format=%cI'))).toBe(true)
        });

        test('a multi-path facet resolves newest-wins, so an archive-only repair is not freshness', async () => {
            // `issues` spans active + archive. Min-wins would breach on a healthy corpus and train
            // everyone to mute the guard; the watchdog settled newest-wins and this must agree.
            const dates = await readCorpusFacetCommitDates({
                cwd    : '/repo',
                execute: gitLog({
                    'resources/content/archive/issues': hours(100),
                    'resources/content/discussions'   : hours(3),
                    'resources/content/issues'        : hours(2),
                    'resources/content/pulls'         : hours(4)
                })
            });

            expect(dates.issues).toBe(hours(2))
        });

        test('a facet git reports nothing for resolves to null, not to now', async () => {
            const dates = await readCorpusFacetCommitDates({
                cwd    : '/repo',
                execute: gitLog({'resources/content/issues': hours(2)})
            });

            expect(dates.pulls).toBeNull();
            expect(dates.discussions).toBeNull()
        })
    });

    test.describe('the refusal reaches the RUN path, not only the pure function', () => {
        // A guard that only exists as an exported function nothing calls is the same silence this
        // ticket is about. These two witness the wiring inside `emitGeneratedData`.
        const runWith = ({corpusAgeHours}) => {
            const executed = [];

            return {
                executed,
                promise: emitGeneratedData({
                    attempt: 1,
                    cwd    : '/repo',
                    execute: (command, args) => {
                        if (command === 'git') {
                            return Promise.resolve({stderr: '', stdout: `${hours(corpusAgeHours)}\n`})
                        }

                        executed.push(args.join(' '));

                        return Promise.resolve({stderr: '', stdout: ''})
                    },
                    log: () => {}
                })
            }
        };

        test('a stale corpus stops the derivation stage from running at all', async () => {
            const {executed, promise} = runWith({corpusAgeHours: 120});

            await expect(promise).rejects.toThrow(/refusing to derive the portal from a stale corpus/);

            // The load-bearing assertion. Failing AFTER derivation would still have published the
            // artifact that made the outage look healthy; the refusal has to precede the work.
            expect(executed.some(args => args.includes('rebuildContentIndexesAndSeo'))).toBe(false)
        });

        test('a fresh corpus lets the derivation stage run', async () => {
            const {executed, promise} = runWith({corpusAgeHours: 1});

            await promise;

            expect(executed.some(args => args.includes('rebuildContentIndexesAndSeo'))).toBe(true)
        });

        test('the stage-set assertion is wired in too, and fires before ANY stage runs', async () => {
            // Witnesses the REAL guard rather than an injected stand-in: a sentinel is added to the
            // expectation the running module holds, so the only way this passes is if
            // `emitGeneratedData` actually calls `assertEmissionStageSet`. Playwright gives each
            // worker its own module instance and tests within one run serially, so the mutation
            // cannot reach a sibling test; it is restored regardless.
            REQUIRED_EMISSION_STAGES.push('a stage nobody declared');

            try {
                const {executed, promise} = runWith({corpusAgeHours: 1});

                await expect(promise).rejects.toThrow(/missing "a stage nobody declared"/);
                expect(executed).toHaveLength(0)
            } finally {
                REQUIRED_EMISSION_STAGES.pop()
            }
        })
    })
});
