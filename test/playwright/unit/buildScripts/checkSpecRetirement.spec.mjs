import {test, expect} from '@playwright/test';

import {
    RETIREMENT_MARKER,
    SPEC_PATH_PATTERN,
    formatFailure,
    hasRetirementAccount,
    parseDeletedSpecs,
    pendingRanges
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

    test('SPEC_PATH_PATTERN admits the unit tree and nothing else', () => {
        expect(SPEC_PATH_PATTERN.test('test/playwright/unit/a.spec.mjs')).toBe(true);
        expect(SPEC_PATH_PATTERN.test('test/playwright/unit/deep/nested/a.spec.mjs')).toBe(true);
        expect(SPEC_PATH_PATTERN.test('test/playwright/e2e/a.spec.mjs')).toBe(false);
        expect(SPEC_PATH_PATTERN.test('test/playwright/unit/a.mjs')).toBe(false);
        expect(SPEC_PATH_PATTERN.test('src/a.spec.mjs')).toBe(false);
    });
});
