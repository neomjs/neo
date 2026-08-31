import {test, expect}                                  from '@playwright/test';
import {execSync}                                      from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir}                                        from 'node:os';
import {join}                                          from 'node:path';

import {
    RETIREMENT_MARKER,
    SPEC_PATH_PATTERN,
    buildReports,
    collectViolations,
    createGit,
    defaultGit,
    deriveSubjectSuffix,
    findSurvivingSubjects,
    formatFailure,
    formatSurvivingSubjectFailure,
    hasRetirementAccount,
    parseDeletedSpecs,
    pendingRanges,
    retirementAccounts,
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

    test.describe('ambiguous affinity under-reports rather than inventing a survivor (#17964 RC1 RA-2)', () => {
        // Exact-tree controls. `deriveSubjectSuffix` is `<parentDir>/<name>.mjs`, and on THIS tree
        // three real suffixes are answered by more than one tracked path (measured at head):
        //
        //   content/component.mjs  -> apps/portal/view/content/Component.mjs, src/app/content/Component.mjs
        //   button/base.mjs        -> src/button/Base.mjs, src/functional/button/Base.mjs
        //   toolbar/sortzone.mjs   -> 3 paths under src/draggable/{grid,tab,table}/header/
        //
        // The failure this guards against is not theoretical: delete the REAL subject and its spec,
        // and the namesake that survives makes the guard demand an account for a file the author
        // never touched. The header of `deriveSubjectSuffix` commits this guard to under-reporting
        // precisely so that never happens, and these arms hold it to that.
        const AMBIGUOUS_TREE = [
            'apps/portal/view/content/Component.mjs',
            'src/app/content/Component.mjs',
            'src/button/Base.mjs',
            'src/functional/button/Base.mjs',
            'src/draggable/grid/header/toolbar/SortZone.mjs',
            'src/draggable/tab/header/toolbar/SortZone.mjs',
            'src/draggable/table/header/toolbar/SortZone.mjs'
        ];

        const GENERIC = 'chore: split\n\nspec-retired: moved to the Brain repo.';

        test('two candidates yield no finding — portal `content/Component`', () => {
            expect(findSurvivingSubjects('test/playwright/unit/app/content/Component.spec.mjs', AMBIGUOUS_TREE)).toHaveLength(2);
            expect(unaccountedSurvivors(['test/playwright/unit/app/content/Component.spec.mjs'], AMBIGUOUS_TREE, GENERIC)).toEqual([]);
        });

        test('two candidates yield no finding — `button/Base`', () => {
            expect(findSurvivingSubjects('test/playwright/unit/button/Base.spec.mjs', AMBIGUOUS_TREE)).toHaveLength(2);
            expect(unaccountedSurvivors(['test/playwright/unit/button/Base.spec.mjs'], AMBIGUOUS_TREE, GENERIC)).toEqual([]);
        });

        test('three candidates yield no finding — draggable `toolbar/SortZone`', () => {
            expect(findSurvivingSubjects('test/playwright/unit/draggable/tab/header/toolbar/SortZone.spec.mjs', AMBIGUOUS_TREE)).toHaveLength(3);
            expect(unaccountedSurvivors(['test/playwright/unit/draggable/tab/header/toolbar/SortZone.spec.mjs'], AMBIGUOUS_TREE, GENERIC)).toEqual([]);
        });

        test('deleting the REAL subject while an unrelated namesake survives demands nothing', () => {
            // The concrete false-positive shape, and the one a candidate COUNT cannot see:
            // `src/functional/button/Base.mjs` leaves WITH its spec, so the two candidates collapse to
            // one — `src/button/Base.mjs`, a different component entirely. Post-deletion the tree
            // looks unambiguous, and the departed subject is indistinguishable from one that was never
            // there. Only the commit's own deleted paths separate them.
            const treeAfterDeletion = AMBIGUOUS_TREE.filter(path => path !== 'src/functional/button/Base.mjs');

            expect(findSurvivingSubjects('test/playwright/unit/functional/button/Base.spec.mjs', treeAfterDeletion))
                .toEqual(['src/button/Base.mjs']);

            expect(unaccountedSurvivors(
                ['test/playwright/unit/functional/button/Base.spec.mjs'],
                treeAfterDeletion,
                GENERIC,
                ['src/functional/button/Base.mjs', 'test/playwright/unit/functional/button/Base.spec.mjs']
            )).toEqual([]);
        });

        test('without the deleted-path evidence the same shape WOULD fire — the arm is not vacuous', () => {
            // The mutation control for the clause above: drop the deleted-path argument and the false
            // positive returns. This is what the guard did before the repair.
            const treeAfterDeletion = AMBIGUOUS_TREE.filter(path => path !== 'src/functional/button/Base.mjs');

            expect(unaccountedSurvivors(
                ['test/playwright/unit/functional/button/Base.spec.mjs'],
                treeAfterDeletion,
                GENERIC
            )).toHaveLength(1);
        });

        test('a deleted path that is NOT the subject leaves the demand standing', () => {
            // The departure exemption must key on the subject suffix, not on "this commit deleted
            // something". An unrelated deletion does not excuse the account.
            const unambiguous = ['src/draggable/tab/header/toolbar/SortZone.mjs'];

            expect(unaccountedSurvivors(
                ['test/playwright/unit/draggable/tab/header/toolbar/SortZone.spec.mjs'],
                unambiguous,
                GENERIC,
                ['src/unrelated/Thing.mjs']
            )).toHaveLength(1);
        });

        test('a single candidate still fires — the narrowing did not disarm the rule', () => {
            const unambiguous = ['src/draggable/tab/header/toolbar/SortZone.mjs'];

            expect(unaccountedSurvivors(
                ['test/playwright/unit/draggable/tab/header/toolbar/SortZone.spec.mjs'],
                unambiguous,
                GENERIC
            )).toEqual([{
                spec    : 'test/playwright/unit/draggable/tab/header/toolbar/SortZone.spec.mjs',
                subjects: ['src/draggable/tab/header/toolbar/SortZone.mjs']
            }]);
        });
    });

    test.describe('the ACCOUNT must name the survivor, not the message (#17964 RC1 RA-3)', () => {
        const
            TREE  = ['buildScripts/util/check-block-alignment.mjs'],
            SPECS = ['test/playwright/unit/ai/buildScripts/util/check-block-alignment.spec.mjs'];

        test('retirementAccounts reads every payload, and only payloads', () => {
            expect(retirementAccounts('x\n\nspec-retired: one\nspec-retired: two')).toEqual(['one', 'two']);
            expect(retirementAccounts('a path buildScripts/util/check-block-alignment.mjs in prose')).toEqual([]);
        });

        test('a path in the HEADLINE does not discharge a generic account', () => {
            // Euclid's exact falsifier: the subject line names the survivor, the account says nothing
            // about it, and the pre-fix body-wide search accepted that as naming.
            const message = 'refactor: rework buildScripts/util/check-block-alignment.mjs\n\n' +
                'spec-retired: moved to Brain';

            expect(unaccountedSurvivors(SPECS, TREE, message)).toHaveLength(1);
        });

        test('a path in a trailer or rationale does not discharge it either', () => {
            const message = 'chore: split\n\nspec-retired: moved to Brain\n\n' +
                'Rationale: buildScripts/util/check-block-alignment.mjs is unaffected.\n' +
                'Refs: buildScripts/util/check-block-alignment.mjs';

            expect(unaccountedSurvivors(SPECS, TREE, message)).toHaveLength(1);
        });

        test('the same path INSIDE the account discharges it — still satisfiable', () => {
            const message = 'chore: split\n\nspec-retired: buildScripts/util/check-block-alignment.mjs stays, coverage folded into its sibling.';

            expect(unaccountedSurvivors(SPECS, TREE, message)).toEqual([]);
        });

        test('a second account line can carry the name', () => {
            const message = 'chore: split\n\nspec-retired: moved to Brain\nspec-retired: buildScripts/util/check-block-alignment.mjs stays.';

            expect(unaccountedSurvivors(SPECS, TREE, message)).toEqual([]);
        });
    });

    test.describe('the consumed path — the collector, not only its helpers (#17964 RC1 RA-1)', () => {
        // Everything above grades pure helpers. The two defects that actually shipped both lived HERE,
        // in the path the guard really runs, and helper-level green said nothing about either.
        const port = overrides => ({
            revList     : () => ['deadbeef'],
            deletedSpecs: () => ['test/playwright/unit/buildScripts/util/check-block-alignment.spec.mjs'],
            deletedPaths: () => ['test/playwright/unit/buildScripts/util/check-block-alignment.spec.mjs'],
            message     : () => 'chore: split\n\nspec-retired: moved to Brain',
            subject     : () => 'chore: split',
            treePaths   : () => ['buildScripts/util/check-block-alignment.mjs'],
            ...overrides
        });

        test('an unreadable tree REFUSES — it must not read as a clean one', () => {
            // The shipped defect, exactly: `git ls-tree -r` over this repository emits 1,327,472 bytes
            // against node's 1 MB default `maxBuffer`, threw ENOBUFS, and the catch returned ''. The
            // scan then graded every commit against an EMPTY tree, in which nothing has ever survived.
            const enobufs = () => {
                const error = new Error('spawnSync git ENOBUFS');

                error.code = 'ENOBUFS';
                throw error
            };

            expect(() => collectViolations(['a..b'], port({treePaths: enobufs})))
                .toThrow(/cannot read the tree of deadbeef \(ENOBUFS\)/u);
        });

        test('an unresolvable range REFUSES', () => {
            const throws = () => { throw new Error('unknown revision') };

            expect(() => collectViolations(['a..b'], port({revList: throws})))
                .toThrow(/cannot resolve the range/u);
        });

        test('a readable tree still reports the survivor through the collector', () => {
            const {survived} = collectViolations(['a..b'], port());

            expect(survived).toHaveLength(1);
            expect(survived[0].survivors[0].subjects).toEqual(['buildScripts/util/check-block-alignment.mjs']);
        });

        test('the collector passes the commit\'s deleted paths to the survivor check', () => {
            // Wiring arm. The helper-level proof above cannot see whether the collector actually
            // supplies `deletedPaths`; drop that argument at the call site and this goes red while
            // every helper arm stays green.
            const {survived} = collectViolations(['a..b'], port({
                deletedPaths: () => [
                    'buildScripts/util/check-block-alignment.mjs',
                    'test/playwright/unit/buildScripts/util/check-block-alignment.spec.mjs'
                ]
            }));

            expect(survived).toEqual([]);
        });

        test('both violation classes co-report in one run', () => {
            // Mutation target: `if`/`if` in `buildReports`. An `if`→`else if` regression drops the
            // second report, and before this arm existed nothing could observe that.
            const reports = buildReports({
                unaccounted: [{sha: 'a'.repeat(40), subject: 'no account', specs: ['test/playwright/unit/a.spec.mjs']}],
                survived   : [{
                    sha      : 'b'.repeat(40),
                    subject  : 'generic account',
                    survivors: [{spec: 'test/playwright/unit/b.spec.mjs', subjects: ['src/b.mjs']}]
                }]
            });

            expect(reports).toHaveLength(2);
            expect(reports[0]).toMatch(/delete unit spec files with no account/u);
            expect(reports[1]).toMatch(/whose SUBJECT is still in this repository/u);
        });

        test('neither class reported leaves nothing to print', () => {
            expect(buildReports({unaccounted: [], survived: []})).toEqual([]);
            expect(buildReports()).toEqual([]);
        });

        test('reproduces the incident SHAPE against a real repository, through the real port', () => {
            // The end-to-end arm: real git, real `createGit`, real `collectViolations`. It builds a
            // throwaway repository that reproduces `c623b2f63c`'s shape — a commit deleting unit specs
            // under one general account, while one subject stays and one genuinely leaves.
            //
            // It is a FIXTURE rather than a replay of `c623b2f63c` itself, and that was forced by
            // measurement, not preference: the historical replay is correct locally (34 rows, the same
            // 34 the helper-level analysis found) but the `unit` workflow checks out shallow, so
            // `c623b2f63c` is absent on the runner and the range cannot resolve. A load-bearing arm
            // must not depend on how deep CI happened to clone. The 34-row replay stays in the PR body
            // as measured evidence; the property it demonstrates is asserted here, hermetically.
            const
                root = mkdtempSync(join(tmpdir(), 'spec-retirement-')),
                run  = command => execSync(command, {cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']});

            try {
                run('git init -q -b main');
                run('git config user.email fixture@example.com');
                run('git config user.name Fixture');

                mkdirSync(join(root, 'test/playwright/unit/ai'), {recursive: true});
                mkdirSync(join(root, 'src/ai'),                  {recursive: true});
                mkdirSync(join(root, 'buildScripts/util'),       {recursive: true});

                // Two specs. `LockRegistry`'s subject will STAY; `Departed`'s will leave with it.
                writeFileSync(join(root, 'test/playwright/unit/ai/LockRegistry.spec.mjs'), 'export {}\n');
                writeFileSync(join(root, 'test/playwright/unit/ai/Departed.spec.mjs'),     'export {}\n');
                writeFileSync(join(root, 'src/ai/LockRegistry.mjs'),                       'export {}\n');
                writeFileSync(join(root, 'src/ai/Departed.mjs'),                           'export {}\n');
                writeFileSync(join(root, 'buildScripts/util/keep.mjs'),                    'export {}\n');
                run('git add -A');
                run('git commit -q -m base');

                rmSync(join(root, 'test/playwright/unit/ai/LockRegistry.spec.mjs'));
                rmSync(join(root, 'test/playwright/unit/ai/Departed.spec.mjs'));
                rmSync(join(root, 'src/ai/Departed.mjs'));
                run('git add -A');
                run('git commit -q -m "chore: split" -m "spec-retired: moved to the Brain repo."');

                const {unaccounted, survived} = collectViolations(['HEAD^..HEAD'], createGit(root));

                // The account exists, so the marker is satisfied and nothing lands in `unaccounted`.
                expect(unaccounted).toEqual([]);

                // Exactly one row: the subject that STAYED and was never named. `Departed` left in the
                // same commit and is correctly not demanded — the deleted-path disambiguation, proven
                // here against real git rather than a hand-fed array.
                expect(survived).toHaveLength(1);
                expect(survived[0].survivors).toEqual([{
                    spec    : 'test/playwright/unit/ai/LockRegistry.spec.mjs',
                    subjects: ['src/ai/LockRegistry.mjs']
                }]);
            } finally {
                rmSync(root, {recursive: true, force: true})
            }
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
