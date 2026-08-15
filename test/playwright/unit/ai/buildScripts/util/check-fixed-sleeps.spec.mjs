import {test, expect}  from '@playwright/test';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    modulePath = path.resolve(__dirname, '../../../../../../buildScripts/util/check-fixed-sleeps.mjs');

/**
 * check-fixed-sleeps.mjs — baseline reconciliation.
 *
 * The load-bearing case is the third one. These sites are overwhelmingly the byte-identical line
 * `setTimeout(resolve, 1000)` — 64 occurrences in a single spec file — so any reconciliation keyed on
 * file+text alone collapses them into ONE entry. Removing 63 of the 64 then leaves the key still
 * matching, nothing stale, and the guard green: a baseline that permits 64 sites forever while one
 * remains. That is weaker than the per-file count this baseline was deliberately chosen OVER, wearing
 * per-site clothes, and it is why reconciliation counts occurrences rather than testing membership.
 *
 * Line numbers are deliberately NOT part of the key: they shift under any edit above them, so keying
 * on them turns every unrelated change into a wall of false staleness — a guard nobody can keep green
 * gets routed around, which is the failure this whole ticket is about.
 */
test.describe('check-fixed-sleeps.mjs — baseline reconciliation (#17124)', () => {
    let reconcile;

    test.beforeAll(async () => {
        ({reconcile} = await import(modulePath))
    });

    const site = (count = 1) => ({count, file: 'a.spec.mjs', text: 'setTimeout(resolve, 1000);'}),
          many = n => Array.from({length: n}, () => site());

    test('a matching occurrence count is clean in both directions', () => {
        const {fresh, stale} = reconcile({baseline: [site(64)], found: many(64)});

        expect(fresh, 'nothing new').toEqual([]);
        expect(stale, 'nothing stale').toEqual([]);
    });

    test('an ADDED occurrence is fresh even though its text already has a baseline entry', () => {
        const {fresh, stale} = reconcile({baseline: [site(64)], found: many(65)});

        expect(fresh.length).toBe(1);
        expect(fresh[0].count, 'one occurrence beyond the allowance').toBe(1);
        expect(stale).toEqual([]);
    });

    test('removing ONE of 64 identical sites goes stale — the key-collapse blind spot', () => {
        const {fresh, stale} = reconcile({baseline: [site(64)], found: many(63)});

        expect(stale.length, 'the shrink must be visible').toBe(1);
        expect(stale[0].count, 'exactly one occurrence went away').toBe(1);
        expect(fresh).toEqual([]);
    });

    test('a fully removed text goes stale for its whole count', () => {
        const {fresh, stale} = reconcile({baseline: [site(64)], found: []});

        expect(stale[0].count).toBe(64);
        expect(fresh).toEqual([]);
    });

    test('the pattern in a COMMENT or a STRING is not a sleep — this file is the fixture', async () => {
        // This spec's own docstring and its `site()` fixture both contain the literal text the guard
        // matches, and neither sleeps. A guard that fires on prose about itself is a noise generator,
        // and a noisy gate gets routed around within a week — the trap this whole ticket is against.
        // Scanning this very file is the control: it would report two findings under the naive match.
        const {findUnjustifiedSleeps} = await import(modulePath);

        const {sites} = findUnjustifiedSleeps({
            files  : [__filename],
            rootDir: path.resolve(__dirname, '../../../../../..')
        });

        expect(sites).toEqual([]);
    });

    test('importing the module runs no lint and exits no process', () => {
        // The module exports SCAN_SURFACE so the workflow-parity spec can import it as authority. Its
        // CLI body must therefore stay behind a direct-invocation guard: an unguarded top-level body
        // calls process.exit() inside whatever imports it, which kills a Playwright worker with NO
        // failure message — the suite reports nothing rather than red. Reaching this assertion at all
        // is the proof, since the import happens in beforeAll.
        expect(typeof reconcile, 'the module imported without exiting the worker').toBe('function');
    });
});
