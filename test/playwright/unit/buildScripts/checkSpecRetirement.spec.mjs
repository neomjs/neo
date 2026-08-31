import {test, expect} from '@playwright/test';

import {
    RETIREMENT_MARKER,
    SPEC_PATH_PATTERN,
    deriveSubjectSuffix,
    findSurvivingSubjects,
    formatFailure,
    formatSurvivingSubjectFailure,
    hasRetirementAccount,
    parseDeletedSpecs,
    pendingRanges,
    unaccountedSurvivors
}                     from '../../../../buildScripts/util/check-spec-retirement.mjs';

test.describe('check-spec-retirement', () => {
    test.describe('parseDeletedSpecs — the rename exclusion', () => {
        test('a deletion row is reported', () => {
            const out = 'D\ttest/playwright/unit/buildScripts/prepare.spec.mjs';

            expect(parseDeletedSpecs(out)).toEqual(['test/playwright/unit/buildScripts/prepare.spec.mjs']);
        });

        test('a RENAME is not a deletion, even though its first path looks like one', () => {
            // The control the whole guard turns on. `git mv` produces `R100 <old> <new>`; a reader that
            // took field 1 whenever the row "looked deleted" would report `<old>` and fire on every
            // legitimate move. Two paths on the row is what distinguishes them.
            const renamed = 'R100\ttest/playwright/unit/a.spec.mjs\ttest/playwright/unit/b.spec.mjs';

            expect(parseDeletedSpecs(renamed)).toEqual([]);

            // …and a partial-similarity rename behaves identically — the score varies, the shape does not.
            expect(parseDeletedSpecs('R087\ttest/playwright/unit/a.spec.mjs\ttest/playwright/unit/c.spec.mjs')).toEqual([]);
        });

        test('a COPY is not a deletion — the source survives', () => {
            expect(parseDeletedSpecs('C75\ttest/playwright/unit/a.spec.mjs\ttest/playwright/unit/b.spec.mjs')).toEqual([]);
        });

        test('added and modified rows are ignored', () => {
            const out = [
                'A\ttest/playwright/unit/buildScripts/new.spec.mjs',
                'M\ttest/playwright/unit/buildScripts/old.spec.mjs'
            ].join('\n');

            expect(parseDeletedSpecs(out)).toEqual([]);
        });

        test('deletions OUTSIDE the unit tree are out of scope', () => {
            // Source deletion is already loud (something stops importing it); e2e/integration suites
            // report counts a human reads per run. The unit tree is where a file vanishes into a total.
            const out = [
                'D\tsrc/component/Base.mjs',
                'D\ttest/playwright/e2e/some.spec.mjs',
                'D\ttest/playwright/unit/buildScripts/kept.spec.mjs'
            ].join('\n');

            expect(parseDeletedSpecs(out)).toEqual(['test/playwright/unit/buildScripts/kept.spec.mjs']);
        });

        test('a non-spec deletion inside the unit tree is out of scope', () => {
            expect(parseDeletedSpecs('D\ttest/playwright/unit/buildScripts/helper.mjs')).toEqual([]);
        });

        test('empty and malformed input degrade to no findings, never to a throw', () => {
            expect(parseDeletedSpecs('')).toEqual([]);
            expect(parseDeletedSpecs(null)).toEqual([]);
            expect(parseDeletedSpecs('garbage-with-no-tab')).toEqual([]);
        });

        test('reproduces the incident population', () => {
            // The five suites a lint-matcher branch removed while CI stayed green. Restored in
            // `c7cb86b3fb`; all five sit inside this guard's scope, which is what makes the scope right.
            const deleted = [
                'checkCommitAuthorship', 'checkContentLogicalIdentity', 'checkDerivedDomain', 'installBrain', 'prepare'
            ].map(name => `test/playwright/unit/buildScripts/${name}.spec.mjs`);

            expect(parseDeletedSpecs(deleted.map(path => `D\t${path}`).join('\n'))).toEqual(deleted);
        });
    });

    test.describe('parseDeletedSpecs — combined-diff rows from a merge', () => {
        // A merge renders ONE status letter per parent. Scanning merges is what closes the
        // resolution-deletion hole (a spec neither parent deleted, dropped while resolving), and it is
        // only safe because these rows keep the same delete-vs-rename discrimination.
        const SPEC = 'test/playwright/unit/buildScripts/prepare.spec.mjs';

        test('a two-parent resolution deletion (`DD`) is reported', () => {
            expect(parseDeletedSpecs(`DD\t${SPEC}`)).toEqual([SPEC]);
        });

        test('an octopus resolution deletion (`DDD`) is reported', () => {
            expect(parseDeletedSpecs(`DDD\t${SPEC}`)).toEqual([SPEC]);
        });

        test('a resolution RENAME (`RR`) is NOT a deletion', () => {
            // Load-bearing, and the shape differs from an ordinary diff: a combined rename row carries
            // ONE path (the new one), not the two of `R100 old new`. So the path-count test cannot be
            // what saves us here — only the status letter can.
            expect(parseDeletedSpecs(`RR\t${SPEC}`)).toEqual([]);
        });

        test('resolution modifications and additions are not deletions', () => {
            expect(parseDeletedSpecs([`MM\t${SPEC}`, `AA\t${SPEC}`, `AM\t${SPEC}`].join('\n'))).toEqual([]);
        });

        test('a mixed merge block reports only the deleted spec', () => {
            const block = [
                `MM\ttest/playwright/unit/buildScripts/installBrain.spec.mjs`,
                `DD\t${SPEC}`,
                `RR\ttest/playwright/unit/buildScripts/prepare.renamed.spec.mjs`,
                'DD\tsrc/some/source.mjs'
            ].join('\n');

            expect(parseDeletedSpecs(block)).toEqual([SPEC]);
        });
    });

    test.describe('hasRetirementAccount', () => {
        test('accepts the marker anywhere in the message, case-insensitively', () => {
            expect(hasRetirementAccount(`refactor: fold suites\n\n${RETIREMENT_MARKER} merged into sibling.spec.mjs`)).toBe(true);
            expect(hasRetirementAccount('refactor: fold\n\nSpec-Retired: behavior removed in #123')).toBe(true);
        });

        test('rejects a message with no account', () => {
            expect(hasRetirementAccount('fix(build): tighten the lint matcher')).toBe(false);
            expect(hasRetirementAccount('')).toBe(false);
            expect(hasRetirementAccount(null)).toBe(false);
        });

        test('the marker WITHOUT content does not satisfy the account (#17151 RC1)', () => {
            // A substring test is not a grammar. `includes()` accepted every line below, so the
            // guard could be satisfied by costume — including by a message that DENIES having one.
            expect(hasRetirementAccount('spec-retired:'),        'marker alone, zero information').toBe(false);
            expect(hasRetirementAccount('spec-retired:     '),   'marker + whitespace only').toBe(false);
            expect(hasRetirementAccount('spec-retired:\t\t'),    'marker + tabs only').toBe(false);
        });

        test('a NEGATED or merely-mentioned marker does not satisfy the account (#17151 RC1)', () => {
            // `not-spec-retired:` contains the marker as a substring, so a commit explicitly stating
            // there is no account previously passed the guard. This is the arm that settles why the
            // check had to become line-anchored rather than merely stricter about payload.
            expect(hasRetirementAccount('not-spec-retired: no account'), 'negated mention').toBe(false);
            expect(hasRetirementAccount('see the docs: add a spec-retired: line to account for it'),
                'the marker mentioned mid-sentence in prose').toBe(false);
        });

        test('real accounts survive the tightening, including wrapped and bulleted bodies (#17151 RC1)', () => {
            expect(hasRetirementAccount('refactor: fold suites\n\nspec-retired: merged into sibling.spec.mjs')).toBe(true);
            expect(hasRetirementAccount('x\n\n- spec-retired: split into two files'), 'list-bulleted').toBe(true);
            expect(hasRetirementAccount('x\n\n> spec-retired: quoted in a reply'),    'quote-prefixed').toBe(true);
            expect(hasRetirementAccount('x\n\n  spec-retired: indented'),             'indented').toBe(true);
        });

        test('a near-miss spelling does NOT satisfy the account', () => {
            // The marker is the machine-checkable half of the contract; a guard that accepted
            // "spec retired" or "retired spec" would accept prose that no tool can find later.
            expect(hasRetirementAccount('chore: spec retired, coverage moved')).toBe(false);
            expect(hasRetirementAccount('chore: retired the spec')).toBe(false);
        });
    });

    test.describe('pendingRanges — guarding the push, not a guess about it', () => {
        const zero = '0'.repeat(40);

        test('uses the remote boundary git actually supplies', () => {
            expect(pendingRanges('refs/heads/x aaa refs/heads/x bbb')).toEqual(['bbb..aaa']);
        });

        test('a NEW remote branch falls back to the trunk range', () => {
            expect(pendingRanges(`refs/heads/x aaa refs/heads/x ${zero}`)).toEqual(['origin/dev..aaa']);
        });

        test('a ref DELETION sends no commits', () => {
            expect(pendingRanges(`refs/heads/x ${zero} refs/heads/x bbb`)).toEqual([]);
        });

        test('empty stdin scans the branch rather than no-opping', () => {
            // A guard that passes when it cannot see its input has the exact failure shape it exists
            // to catch — silence indistinguishable from success.
            expect(pendingRanges('')).toEqual(['origin/dev..HEAD']);
            expect(pendingRanges(null)).toEqual(['origin/dev..HEAD']);
        });

        test('multiple refs each contribute a range', () => {
            expect(pendingRanges('refs/heads/a 111 refs/heads/a 222\nrefs/heads/b 333 refs/heads/b 444'))
                .toEqual(['222..111', '444..333']);
        });
    });

    test.describe('formatFailure', () => {
        const rendered = formatFailure([
            {sha: 'abcdef1234567890', subject: 'fix(build): tighten the lint matcher', specs: ['test/playwright/unit/buildScripts/prepare.spec.mjs']}
        ]);

        test('names the deleted path and the marker', () => {
            expect(rendered).toContain('test/playwright/unit/buildScripts/prepare.spec.mjs');
            expect(rendered).toContain(RETIREMENT_MARKER);
            expect(rendered).toContain('abcdef1234');
        });

        test('does NOT tell the author to restore the file', () => {
            // The deletion is usually intentional and merely unaccounted, so prescribing a restore
            // trains people to route around the guard. Asserted rather than trusted to review.
            expect(rendered.toLowerCase()).not.toMatch(/restore the file|re-?add|revert the deletion|put it back/u);
        });

        test('states that legitimate deletion stays cheap', () => {
            expect(rendered).toMatch(/account, not a veto/u);
        });
    });

    test.describe('the surviving subject — the gradeable half of the account (#17922 AC-4)', () => {
        // The guard asks whether an account EXISTS, never whether it is TRUE, and that stands. What
        // these arms add is the one part of "true" that is a fact about the tree rather than prose:
        // the deleted spec's subject is still here.
        const TREE = [
            'buildScripts/util/check-block-alignment.mjs',
            'buildScripts/dataSyncPipeline.mjs',
            'buildScripts/build/themes.mjs',
            'src/ai/LockRegistry.mjs',
            'src/ai/client/DockService.mjs',
            'src/util/Logger.mjs',
            'src/form/field/Picker.mjs',
            'examples/form/field/fileupload/server.mjs',
            // A NON-spec helper inside the test tree, positioned so that it WOULD satisfy the suffix
            // `util/check-parse.mjs`. Without the `test/` exclusion this is a match, which is what
            // makes the arm below able to fail. A sibling `*.spec.mjs` cannot serve here: the suffix
            // ends in `.mjs`, never `.spec.mjs`, so it never matched and the arm was vacuously green.
            'test/playwright/unit/buildScripts/util/check-parse.mjs'
        ];

        test.describe('deriveSubjectSuffix', () => {
            test('is the parent directory plus the name, lower-cased', () => {
                expect(deriveSubjectSuffix('test/playwright/unit/ai/buildScripts/util/check-block-alignment.spec.mjs'))
                    .toBe('util/check-block-alignment.mjs');
                expect(deriveSubjectSuffix('test/playwright/unit/ai/LockRegistry.spec.mjs')).toBe('ai/lockregistry.mjs');
            });

            test('a path with no parent directory yields nothing rather than throwing', () => {
                expect(deriveSubjectSuffix('a.spec.mjs')).toBe('');
                expect(deriveSubjectSuffix('')).toBe('');
                expect(deriveSubjectSuffix(null)).toBe('');
            });
        });

        test.describe('findSurvivingSubjects', () => {
            test('resolves a subject that stayed behind', () => {
                expect(findSurvivingSubjects('test/playwright/unit/ai/buildScripts/util/check-block-alignment.spec.mjs', TREE))
                    .toEqual(['buildScripts/util/check-block-alignment.mjs']);
            });

            test('matches case-insensitively, which the split population requires', () => {
                // `DataSyncPipeline.spec.mjs` covers `dataSyncPipeline.mjs`. A case-sensitive match
                // would call that subject departed and wave the deletion through.
                expect(findSurvivingSubjects('test/playwright/unit/ai/buildScripts/DataSyncPipeline.spec.mjs', TREE))
                    .toEqual(['buildScripts/dataSyncPipeline.mjs']);
            });

            test('a genuinely departed subject resolves to nothing', () => {
                // The positive control: this narrows what the marker must assert, it never widens it.
                expect(findSurvivingSubjects('test/playwright/unit/ai/buildScripts/util/check-atomic-write-shape.spec.mjs', TREE))
                    .toEqual([]);
            });

            test('a bare basename collision is NOT a surviving subject', () => {
                // The measured false positives from replaying `c623b2f63c` with a basename-only rule.
                // None of these files is the deleted spec's subject, and demanding an account for a
                // file the author never touched is what trains people to route around the guard.
                expect(findSurvivingSubjects('test/playwright/unit/ai/mcp/server/shared/logger.spec.mjs', TREE),
                    'src/util/Logger.mjs is not the mcp server logger').toEqual([]);
                expect(findSurvivingSubjects('test/playwright/unit/ai/daemons/orchestrator/scheduling/picker.spec.mjs', TREE),
                    'src/form/field/Picker.mjs is not the scheduling picker').toEqual([]);
                expect(findSurvivingSubjects('test/playwright/unit/ai/mcp/server/memory-core/Server.spec.mjs', TREE),
                    'the fileupload example server is not the MCP server').toEqual([]);
            });

            test('a file inside the TEST tree never counts as the surviving implementation', () => {
                // The question is whether the SUBJECT survived, not whether some other file under
                // `test/` happens to carry the name. `test/playwright/unit/buildScripts/util/check-parse.mjs`
                // satisfies this suffix on every axis except the one that matters.
                expect(findSurvivingSubjects('test/playwright/unit/ai/buildScripts/util/check-parse.spec.mjs', TREE))
                    .toEqual([]);
            });

            test('a longer name is not satisfied by a prefix match', () => {
                // `endsWith('/' + suffix)` anchors on a directory boundary, so `check-parse.mjs` is
                // not answered by `check-parse-extra.mjs`.
                expect(findSurvivingSubjects('test/playwright/unit/ai/buildScripts/util/check-parse.spec.mjs',
                    ['buildScripts/util/check-parse-extra.mjs'])).toEqual([]);
            });
        });

        test.describe('unaccountedSurvivors', () => {
            const specs = [
                'test/playwright/unit/ai/buildScripts/util/check-block-alignment.spec.mjs',
                'test/playwright/unit/ai/buildScripts/util/check-atomic-write-shape.spec.mjs'
            ];

            test('a general account that names no surviving file does not discharge the row', () => {
                // This IS the incident: one sentence accounted for 796 unit-spec deletions, and 34 of
                // the subjects it described as departed were still in the tree it produced.
                const message = 'feat(engine): remove received Brain implementation\n\n' +
                    'spec-retired: Brain-owned specs leave Engine with Agent OS; retained Fleet and\n' +
                    'Neural Link coverage now binds an explicit external Brain runtime.';

                expect(unaccountedSurvivors(specs, TREE, message)).toEqual([{
                    spec    : 'test/playwright/unit/ai/buildScripts/util/check-block-alignment.spec.mjs',
                    subjects: ['buildScripts/util/check-block-alignment.mjs']
                }]);
            });

            test('naming the surviving path discharges it — the rule is satisfiable', () => {
                const message = 'x\n\nspec-retired: buildScripts/util/check-block-alignment.mjs stays; coverage folded elsewhere.';

                expect(unaccountedSurvivors(specs, TREE, message)).toEqual([]);
            });

            test('a deletion whose subjects all genuinely left stays green', () => {
                const departed = ['test/playwright/unit/ai/buildScripts/util/check-atomic-write-shape.spec.mjs'];

                expect(unaccountedSurvivors(departed, TREE, 'x\n\nspec-retired: moved to the Brain repo.')).toEqual([]);
            });

            test('empty and malformed input degrade to no findings, never to a throw', () => {
                expect(unaccountedSurvivors(null, TREE, 'x')).toEqual([]);
                expect(unaccountedSurvivors(specs, null, 'x')).toEqual([]);
                expect(unaccountedSurvivors(specs, TREE, null).length).toBe(1);
            });
        });

        test.describe('formatSurvivingSubjectFailure', () => {
            const rendered = formatSurvivingSubjectFailure([{
                sha      : 'c623b2f63cabcdef',
                subject  : 'feat(engine): remove received Brain implementation',
                survivors: [{
                    spec    : 'test/playwright/unit/ai/buildScripts/util/check-block-alignment.spec.mjs',
                    subjects: ['buildScripts/util/check-block-alignment.mjs']
                }]
            }]);

            test('names both the deleted spec and the file that stayed', () => {
                expect(rendered).toContain('test/playwright/unit/ai/buildScripts/util/check-block-alignment.spec.mjs');
                expect(rendered).toContain('buildScripts/util/check-block-alignment.mjs');
                expect(rendered).toContain('c623b2f63c');
            });

            test('asks for one path in the existing account rather than a new ceremony', () => {
                expect(rendered).toContain(RETIREMENT_MARKER);
                expect(rendered).toMatch(/one path is enough/u);
            });
        });
    });

    test('SPEC_PATH_PATTERN admits the unit tree and nothing else', () => {
        expect(SPEC_PATH_PATTERN.test('test/playwright/unit/a.spec.mjs')).toBe(true);
        expect(SPEC_PATH_PATTERN.test('test/playwright/unit/deep/nested/a.spec.mjs')).toBe(true);
        expect(SPEC_PATH_PATTERN.test('test/playwright/e2e/a.spec.mjs')).toBe(false);
        expect(SPEC_PATH_PATTERN.test('test/playwright/unit/a.mjs')).toBe(false);
        expect(SPEC_PATH_PATTERN.test('src/a.spec.mjs')).toBe(false);
    });
});
