import {test, expect}                     from '@playwright/test';
import path                               from 'node:path';
import {EXCLUSIONS, populations, summary} from '../../../../../buildScripts/util/e2eCiSelection.mjs';

/**
 * The e2e tier's coverage summary is an honesty guard: `testIgnore` DESELECTS the Brain-dependent
 * specs rather than skipping them, so no reporter can name them and a run missing four fifths of
 * the tier still prints `Skipped: 0`. This summary is the only artifact that says what a green
 * check actually certifies.
 *
 * Which makes its arithmetic load-bearing rather than cosmetic. It shipped stating that
 * `${ignored + gpu}` files were excluded — a sum of two named classes that omitted a third — so the
 * sentence reported 89 while its own header two paragraphs above said 14 of 105. A guard whose one
 * job is accurate counting, contradicting itself in the paragraph a reader trusts most.
 *
 * The arms below assert the numbers RECONCILE rather than pinning any of them. A pinned `14` passes
 * today and rots on the next spec added, which is the failure mode a coverage guard can least
 * afford: it would go on being green while describing a tier that had moved.
 */
test.describe('e2e CI selection — the coverage summary must add up', () => {
    const root = path.resolve(import.meta.dirname, '../../../../..');

    test('selected plus excluded equals the total, in the prose as well as the header', () => {
        const {executed, total} = populations(root),
              text              = summary(root);

        expect(text).toContain(`**${executed} of ${total}**`);

        // The residual as the prose states it, read back rather than recomputed — the defect was
        // that these two sentences disagreed, so reading one and trusting the other proves nothing.
        const stated = Number(text.match(/while the (\d+) excluded files appear nowhere/)?.[1]);

        expect(stated, 'the prose must state a residual at all').not.toBeNaN();
        expect(stated, 'and it must be the header\'s own complement').toBe(total - executed);
    });

    test('the residual survives a new exclusion class, which a sum of named classes would not', () => {
        // The generalising arm. `ignored + gpu` was correct when written and wrong the moment a
        // third class existed; EXCLUSIONS is that third class. This asserts the residual accounts
        // for it — i.e. that the number is derived by subtraction rather than by enumerating the
        // classes someone remembered.
        const {brainFree, executed, gpu, ignored, total} = populations(root);

        expect(EXCLUSIONS.length, 'the arm is void unless a third class exists').toBeGreaterThan(0);

        // The sum that used to be published, reconstructed here purely to show it is NOT the answer.
        expect(ignored + gpu, 'the old sum under-reports by exactly the third class')
            .toBe(total - executed - EXCLUSIONS.length);

        expect(summary(root)).toContain(`${total - executed} excluded files`);
        expect(summary(root), 'the under-reporting sum must not appear').not.toContain(`${ignored + gpu} excluded files`);

        // Pins the relationship the floor check at `assertSelectionFloor` also depends on, so a
        // change to one of them cannot silently drift from the other.
        expect(executed).toBe(brainFree - gpu - EXCLUSIONS.length);
    });

    test('every individually excluded file names a cause and an owner', () => {
        // An exclusion without an owner is a quarantine wearing a different word: the spec stops
        // running and nobody is answerable for it. The summary renders these rows verbatim, so an
        // empty owner would print as a blank in the guard.
        for (const entry of EXCLUSIONS) {
            expect(entry.path, 'path').toMatch(/\.spec\.mjs$/);
            expect(entry.owner, `${entry.path} owner`).toBeTruthy();
            expect(entry.reason, `${entry.path} reason`).toBeTruthy();
            expect(['cause', 'observed', 'partial'], `${entry.path} kind`).toContain(entry.kind);
        }
    });
});
