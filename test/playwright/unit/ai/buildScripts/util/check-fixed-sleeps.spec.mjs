import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    modulePath = path.resolve(__dirname, '../../../../../../buildScripts/util/check-fixed-sleeps.mjs');

/**
 * check-fixed-sleeps.mjs — baseline reconciliation.
 *
 * The load-bearing case is the third one. These sites are overwhelmingly ONE byte-identical line,
 * `setTimeout(resolve, 1000)`, repeated dozens of times in a single spec file — so any reconciliation
 * keyed on file+text alone collapses them into ONE entry. Removing all but one then leaves the key
 * still matching, nothing stale, and the guard green: a baseline that permits the original population
 * forever while a single site remains. That is weaker than the per-file count this baseline was
 * deliberately chosen OVER, wearing per-site clothes, and it is why reconciliation counts occurrences
 * rather than testing membership.
 *
 * The fixtures below say 64 because a fixture is a stated premise, not a measurement — `site(64)` is
 * true by construction. The prose above deliberately does NOT, because that would be a claim about a
 * tree that moves: it read 64 while the tree held 63 until a reviewer caught it.
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

    test('a stale row reports its SURVIVORS, because the surplus alone picks the wrong remedy', () => {
        const partial = reconcile({baseline: [site(64)], found: many(21)}),
              total   = reconcile({baseline: [site(64)], found: []});

        // Both lost sites, so both are stale by `count` alone — and the two take OPPOSITE remedies.
        expect(partial.stale[0].count, 'the surplus is what the allowance overstates by').toBe(43);
        expect(total.stale[0].count).toBe(64);

        expect(partial.stale[0].remaining, 'reduce the row to these').toBe(21);
        expect(total.stale[0].remaining, 'nothing survives, so the row goes').toBe(0);
    });

    test('deleting a PARTIALLY converted row fails the guard from the other side', () => {
        // The remedy the old message prescribed, executed literally: 43 of 64 converted, row removed.
        // The 21 survivors were legitimately grandfathered and now are not, so they re-enter as NEW —
        // a conversion reported back to its author as a regression, which is why the row must be
        // REDUCED. This is the failure the `remaining` field exists to stop, not a hypothetical.
        const {fresh, stale} = reconcile({baseline: [], found: many(21)});

        expect(fresh.length, 'the survivors come back as unaccounted').toBe(1);
        expect(fresh[0].count, 'all 21 of them').toBe(21);
        expect(stale, 'and the row that would have explained them is gone').toEqual([]);
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

    test('a bypass is a spelling the guard cannot read — every candidate, and the delay by VALUE', async () => {
        // Three executable bypasses, found by @neo-gpt reading the matcher rather than trusting its
        // green run against the tree. Each is a legal way to write a one-second wait that the guard
        // reported as no wait at all — the most expensive kind of gate, because it prints OK.
        //
        //   1. `exec` without /g returns the LEFTMOST match, so a sub-threshold call earlier on the
        //      line consumed the line's only inspection and the real site behind it went unexamined.
        //   2. `1_000` and 3. `1e3` are ordinary JavaScript spellings of 1000 that a `(\d+)` capture
        //      cannot match at all — not mis-measured, invisible.
        //
        // The fixture lives on disk rather than in this file because the guard's own noise-control
        // asserts THIS file yields nothing; embedding real call sites here would make two correct
        // tests contradict each other. Each line is written from inside a quoted string for the same
        // reason the `site()` fixture is.
        const {findUnjustifiedSleeps} = await import(modulePath);

        const
            dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'check-fixed-sleeps-')),
            fixture = path.join(dir, 'bypass.spec.mjs');

        try {
            fs.writeFileSync(fixture, [
                "await new Promise(resolve => setTimeout(resolve, 50)); await new Promise(resolve => setTimeout(resolve, 5000));",
                "await new Promise(resolve => setTimeout(resolve, 1_000));",
                "await new Promise(resolve => setTimeout(resolve, 1e3));",
                "await new Promise(resolve => setTimeout(resolve, 1e+3));",
                "await new Promise(resolve => setTimeout(resolve, 0x3e8));",
                "await new Promise(resolve => setTimeout(resolve, 0o1750));",
                "await new Promise(resolve => setTimeout(resolve, 0b1111101000));",
                "await new Promise(resolve => setTimeout(resolve, 1000.));",
                "await new Promise(resolve => setTimeout(resolve, .1e4));",
                // Not a fixed literal: a named constant is already injectable, so it is not this
                // guard's subject. It is the control proving the loose token match did not turn into
                // a match-everything — `Number('DELAY_MS')` is NaN and the site is skipped.
                "await new Promise(resolve => setTimeout(resolve, DELAY_MS));"
            ].join('\n'), 'utf8');

            const {sites} = findUnjustifiedSleeps({files: [fixture], rootDir: dir});

            expect(sites.map(entry => entry.ms), 'every legal spelling of the threshold is read as milliseconds')
                .toEqual([5000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
            expect(sites.length, 'the second call on line 1 is not shadowed by the first').toBe(9);
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('FORMATTING is not a bypass either — multiline, parenthesised, and comment-interposed calls', async () => {
        // Found by @neo-gpt on re-review, after the spelling bypasses above were already closed: the
        // matcher was applied one source LINE at a time, so a call the parser reads as a single
        // 1000ms wait produced zero candidates whenever a newline or a comment fell inside it. Three
        // more legal ways to write the same wait, each reported as no wait at all.
        //
        // This is why discovery moved to the parse tree. Spellings are enumerable and the previous
        // fix enumerated them; FORMATTING is not, because whitespace and comments may sit between any
        // two tokens. A text pattern cannot be made complete here — it can only be made longer.
        const {findUnjustifiedSleeps} = await import(modulePath);

        const
            dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'check-fixed-sleeps-fmt-')),
            fixture = path.join(dir, 'formatting.spec.mjs');

        try {
            fs.writeFileSync(fixture, [
                // The control: the single-line form the line-based matcher already caught. It anchors
                // the other three — without it a zero-detection bug would read as a passing test.
                "await new Promise(resolve => setTimeout(resolve, 1000));",
                // 1. The call spans lines, so no single line holds the whole pattern.
                "await new Promise(resolve => setTimeout(",
                "    resolve,",
                "    1000",
                "));",
                // 2. The delay is parenthesised — the parser reads the same Literal 1000.
                "await new Promise(resolve => setTimeout(resolve, (1000)));",
                // 3. A comment sits between the arguments.
                "await new Promise(resolve => setTimeout(resolve, /* settle */ 1000));",
                // The negative control travels with them: widening what the guard SEES must not widen
                // what it REFUSES, and a named constant stays out regardless of how it is formatted.
                "await new Promise(resolve => setTimeout(",
                "    resolve,",
                "    DELAY_MS",
                "));"
            ].join('\n'), 'utf8');

            const {sites} = findUnjustifiedSleeps({files: [fixture], rootDir: dir});

            expect(sites.map(entry => entry.ms), 'all four forms are one 1000ms wait each')
                .toEqual([1000, 1000, 1000, 1000]);
            // Line numbers, because "four sites" would also pass if the guard found the control four
            // times. Each must be the site it claims: the multiline call reports its FIRST line, which
            // is what keys the baseline.
            expect(sites.map(entry => entry.line), 'each form is found at its own call site')
                .toEqual([1, 2, 6, 7]);
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('an unparseable spec is reported, never skipped', async () => {
        // A guard that swallows a parse failure reports the same OK for "nothing to find" and "could
        // not look", and those differ by exactly the thing it exists to catch.
        const {findUnjustifiedSleeps} = await import(modulePath);

        const
            dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'check-fixed-sleeps-bad-')),
            fixture = path.join(dir, 'broken.spec.mjs');

        try {
            fs.writeFileSync(fixture, 'const = ;', 'utf8');

            expect(() => findUnjustifiedSleeps({files: [fixture], rootDir: dir}))
                .toThrow(/cannot parse/)
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('a justified bypass spelling is still discharged — the widened matcher did not widen the verdict', async () => {
        // The mirror of the case above, and the reason it matters: widening what the guard can SEE must
        // not widen what it REFUSES. A `1e3` wait carrying the marker is an accounted wait exactly as a
        // `1000` one is, or the repair would have converted a bypass into a false positive.
        const {findUnjustifiedSleeps} = await import(modulePath);

        const
            dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'check-fixed-sleeps-')),
            fixture = path.join(dir, 'justified.spec.mjs');

        try {
            fs.writeFileSync(fixture, [
                "// wall-clock-under-test: the scheduler's own elapsed time is the assertion",
                "await new Promise(resolve => setTimeout(resolve, 1e3));"
            ].join('\n'), 'utf8');

            const {backlog, sites} = findUnjustifiedSleeps({files: [fixture], rootDir: dir});

            expect(sites, 'the marker discharges it').toEqual([]);
            expect(backlog, 'wall-clock-under-test is not leaf backlog').toEqual([]);
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
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
