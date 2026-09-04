import {test, expect}                                 from '@playwright/test';
import fs                                             from 'node:fs';
import os                                             from 'node:os';
import path                                           from 'node:path';
import {excludedSpecNotice, selectExternalBrainSpecs} from '../../externalBrainSelection.mjs';

/**
 * Coverage for the e2e tier's selection split and the notice that discloses it.
 *
 * The contract worth pinning is not "which specs are excluded" — that is a grep, and it changes every
 * time a spec gains or loses the fixture. It is that the two numbers a reader needs can never drift
 * apart: `testIgnore` deletes files from selection rather than skipping them, so a run missing four
 * fifths of the tier still prints `Skipped: 0`, and the only honest moment is the walk itself. A
 * selection that reports its exclusions and a total that came from somewhere else would be the same
 * silence wearing a number.
 *
 * The tree fixtures are synthetic on purpose: a suite that asserted counts against the real `e2e`
 * directory would go red on any unrelated spec being added, which is how a guard gets deleted rather
 * than fixed. One arm does read the real tree — for the invariant, never for the figures.
 */
test.describe('test/playwright/externalBrainSelection — the e2e selection split and its disclosure', () => {
    const makeTree = layout => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-e2e-selection-'));

        for (const [relative, contents] of Object.entries(layout)) {
            const file = path.join(root, relative);

            fs.mkdirSync(path.dirname(file), {recursive: true});
            fs.writeFileSync(file, contents)
        }

        return root
    };

    test('a spec requesting the neuralLink fixture is excluded; its siblings are not', () => {
        const root = makeTree({
            'dashboard/DockPinNL.spec.mjs': 'import {neuralLink} from "../fixtures.mjs";',
            'dashboard/DockPin.spec.mjs'  : 'plain engine spec, no fixture',
            'grid/Tree.spec.mjs'          : 'plain engine spec, no fixture'
        });

        const {ignore, total} = selectExternalBrainSpecs(root);

        expect(total).toBe(3);
        expect(ignore).toHaveLength(1);
        expect(ignore[0].test('/any/prefix/dashboard/DockPinNL.spec.mjs')).toBe(true);
        expect(ignore[0].test('/any/prefix/dashboard/DockPin.spec.mjs')).toBe(false)
    });

    test('the total counts every spec file, excluded or not — the two numbers come from one walk', () => {
        const root = makeTree({
            'a/OneNL.spec.mjs': 'neuralLink',
            'a/TwoNL.spec.mjs': 'neuralLink',
            'b/c/Deep.spec.mjs': 'engine only',
            'b/notes.md'       : 'neuralLink appears here but this is not a spec',
            'helper.mjs'       : 'neuralLink appears here too'
        });

        const {ignore, total} = selectExternalBrainSpecs(root);

        // Three spec files, of which two need a Brain. The two non-spec files mention the fixture and
        // must not be counted by either number — the walk keys on `.spec.mjs`, never on the match.
        expect(total).toBe(3);
        expect(ignore).toHaveLength(2)
    });

    test('a nested spec matches by its full path from the root, not by its basename', () => {
        const root = makeTree({
            'workstation/deep/TabRestoreNL.spec.mjs': 'neuralLink',
            'other/TabRestoreNL.spec.mjs'           : 'engine only'
        });

        const [matcher] = selectExternalBrainSpecs(root).ignore;

        expect(matcher.test('/repo/e2e/workstation/deep/TabRestoreNL.spec.mjs')).toBe(true);
        // Same basename, different directory: a basename-keyed matcher would drop this one too, which
        // is how an exclusion set quietly grows past what it was allowed to remove.
        expect(matcher.test('/repo/e2e/other/TabRestoreNL.spec.mjs')).toBe(false)
    });

    test('regex metacharacters in a path are escaped, not interpreted', () => {
        const root = makeTree({'a+b/Dock(1).spec.mjs': 'neuralLink'});

        const [matcher] = selectExternalBrainSpecs(root).ignore;

        expect(matcher.test('/repo/e2e/a+b/Dock(1).spec.mjs')).toBe(true);
        expect(matcher.test('/repo/e2e/aab/Dock1.spec.mjs')).toBe(false)
    });

    test('the notice names both counts, the survivors and the variable that restores them', () => {
        const notice = excludedSpecNotice({ignore: new Array(78), total: 95});

        expect(notice).toContain('NEO_AGENTOS_RUNTIME_ROOT');
        expect(notice).toContain('78 of 95');
        // The survivor count is the number a reader is about to mistake for the whole tier.
        expect(notice).toContain('covers 17');
        // "not skipped" is load-bearing prose, not decoration: `Skipped: 0` is what the summary will
        // say a few lines below, and this sentence is the only thing that contradicts it.
        expect(notice).toContain('not skipped')
    });

    test('nothing excluded means nothing announced — no exclusion-of-zero notice', () => {
        expect(excludedSpecNotice({ignore: [], total: 95})).toBeNull();
        expect(excludedSpecNotice(selectExternalBrainSpecs(makeTree({'a/Plain.spec.mjs': 'engine only'}))))
            .toBeNull()
    });

    test('against the real e2e tree: the total matches an independent walk, and both counts are real', () => {
        const root = path.resolve(import.meta.dirname, '../../e2e');

        // Counted by a second instrument rather than by the function under test — a total the walk
        // reports about itself proves only that it is self-consistent.
        const countSpecs = dir => fs.readdirSync(dir, {withFileTypes: true}).reduce((sum, entry) => sum +
            (entry.isDirectory() ? countSpecs(path.join(dir, entry.name)) : Number(entry.name.endsWith('.spec.mjs'))), 0);

        const {ignore, total} = selectExternalBrainSpecs(root);

        expect(total).toBe(countSpecs(root));
        // No figures pinned: the invariant is that the tier is genuinely split, so an unset seat is
        // running a strict subset and the notice has something true to say.
        expect(ignore.length).toBeGreaterThan(0);
        expect(ignore.length).toBeLessThan(total);
        expect(excludedSpecNotice({ignore, total})).toContain(`${ignore.length} of ${total}`)
    })
});
