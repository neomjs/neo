import {test, expect}                                from '@playwright/test';
import fs                                            from 'node:fs';
import os                                            from 'node:os';
import path                                          from 'node:path';
import {EXCLUSIONS, populations, RUN_PATHS, summary} from '../../../../../buildScripts/util/e2eCiSelection.mjs';

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

    test('the residual accounts for EVERY class, including any a named sum would omit', () => {
        // The identity the subtraction relies on, asserted directly rather than through today's
        // figures: the complement of the selected count equals the sum of every exclusion class
        // that exists. It holds when `EXCLUSIONS` is empty as readily as when it is not, so this
        // arm does not require the tree to currently carry a third class — a requirement that would
        // make the guard's own coverage depend on the defect still being present.
        const {brainFree, executed, gpu, ignored, total} = populations(root);

        expect(total - executed, 'the complement must account for every class')
            .toBe(ignored + gpu + EXCLUSIONS.length);

        expect(summary(root)).toContain(`${total - executed} excluded files`);

        // Pins the relationship `assertSelectionFloor` also depends on, so the two cannot drift.
        expect(executed).toBe(brainFree - gpu - EXCLUSIONS.length);
    });

    /**
     * Builds a minimal tree `populations()` can walk: every `RUN_PATHS` directory populated, plus the
     * `workstation` directory the GPU count reads. Returns the root and a helper that adds one more
     * engine-only spec anywhere beneath `e2e`.
     * @returns {Object} `{root, addSpec}`
     */
    const makeSelectionTree = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-e2e-populations-')),
              e2e  = path.join(root, 'test/playwright/e2e'),
              add  = relative => {
                  const file = path.join(e2e, relative);

                  fs.mkdirSync(path.dirname(file), {recursive: true});
                  // The body must not name the Brain fixture. The selector greps file CONTENTS, so
                  // a descriptive string saying which fixture is absent marks the file as needing
                  // it — this fixture first read `no neuralLink fixture` and every spec in it was
                  // deselected, giving an executed count of zero.
                  fs.writeFileSync(file, 'engine only')
              };

        fs.mkdirSync(path.join(e2e, 'workstation'), {recursive: true});

        add('colors/A.spec.mjs');
        add('core/B.spec.mjs');
        add('dashboard/C.spec.mjs');
        add('grid/D.spec.mjs');
        add('rendering/InputModalityMultiWindow.spec.mjs');
        add('rendering/ViewTransitionReveal.spec.mjs');

        return {root, addSpec: add}
    };

    test('a NEW exclusion class moves the published complement, on a controlled tree', () => {
        // The discriminator that does not depend on the real tree's current contents. A spec placed
        // outside `RUN_PATHS` is an exclusion by construction — the same shape as a future class
        // nobody has invented yet — so this exercises the property directly rather than through
        // whichever classes happen to exist today.
        //
        // A summing implementation would enumerate the classes it knows and miss this one, leaving
        // the complement stale while the header moved. The subtraction cannot: both operands change
        // together, and the reporter prose is untouched.
        const {root, addSpec} = makeSelectionTree(),
              stated          = text => Number(text.match(/while the (\d+) excluded files appear nowhere/)?.[1]),
              before          = populations(root),
              beforeStated    = stated(summary(root));

        // One spec per `RUN_PATHS` entry, derived rather than a literal so the fixture does not have
        // to be hand-updated alongside it. It is a PRECONDITION for the complement arithmetic below,
        // not a guard on `RUN_PATHS` itself: `assertSelectionFloor` owns that, against the real tree,
        // and is what catches an entry added without a spec — this arm's tree is synthetic.
        expect(before.executed, 'the fixture selects every RUN_PATHS spec').toBe(RUN_PATHS.length);
        expect(beforeStated,    'and reports their complement').toBe(before.total - before.executed);

        addSpec('portal/Outside.spec.mjs');

        const after = populations(root), afterStated = stated(summary(root));

        expect(after.total - before.total,       'the new spec joins the total').toBe(1);
        expect(after.executed,                   'and is NOT selected — it is outside RUN_PATHS').toBe(before.executed);
        expect(afterStated - beforeStated,       'so the published complement must move with it').toBe(1);
        expect(afterStated,                      'and still equal the header\'s complement').toBe(after.total - after.executed);

        fs.rmSync(root, {recursive: true, force: true})
    });

    test('a class beyond the first two is what a named sum drops — discriminating only when one exists', () => {
        // The conditional discriminator. `ignored + gpu` was correct when written and wrong the
        // moment a third class appeared, so the interesting comparison exists only while one does.
        // Asserted conditionally rather than unconditionally: an arm that REQUIRED the two-class sum
        // to be wrong would fail the day someone legitimately empties `EXCLUSIONS`, which is the
        // outcome this repository is working toward.
        const {executed, gpu, ignored, total} = populations(root);

        if (!EXCLUSIONS.length) {
            expect(ignored + gpu, 'with two classes the sum and the complement coincide')
                .toBe(total - executed);
            return
        }

        expect(ignored + gpu, 'a named two-class sum under-reports by the third')
            .toBe(total - executed - EXCLUSIONS.length);
        expect(summary(root), 'and the under-reporting sum must not be what got published')
            .not.toContain(`${ignored + gpu} excluded files`);
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
