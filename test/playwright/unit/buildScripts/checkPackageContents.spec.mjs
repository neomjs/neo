import {test, expect} from '@playwright/test';

/**
 * The check's value is entirely in WHICH packed paths it fires on, so the assertions are the two
 * populations rather than the message text.
 *
 * The rule logic is tested here rather than the pack invocation, deliberately: spawning `npm pack`
 * takes tens of seconds and runs lifecycle scripts, and the interesting failure is never "did npm
 * produce a list" but "does an entry that should never ship get flagged". The pack side is the
 * script's own entrypoint, run in CI and by `npm run check-package-contents`.
 *
 * The carve-out cases are the reason this is not a one-line prefix test. `.neo-ai-data/concepts/` is
 * tracked, exported on purpose, and sits inside a directory whose other contents are Agent OS
 * private state — so "flag everything under the prefix" and "flag nothing under the prefix" are both
 * wrong, and the boundary between them is exactly where the original `.npmignore` defect lived.
 */
test.describe('check-package-contents — fires on private state, not on the tracked carve-out', () => {
    let findForbiddenEntries, FORBIDDEN_PREFIXES, parsePackOutput;

    test.beforeAll(async () => {
        ({findForbiddenEntries, FORBIDDEN_PREFIXES, parsePackOutput} =
            await import('../../../../buildScripts/util/check-package-contents.mjs'));
    });

    test('FIRES: the Memory Core graph, server logs and wake-daemon state', () => {
        // The empirical shape. A negation under a bare directory exclusion did not widen that
        // exclusion, it removed it — so every sibling of the carved-out subtree became packable.
        const findings = findForbiddenEntries([
            '.neo-ai-data/sqlite/memory-core-graph.sqlite',
            '.neo-ai-data/logs/mc-server-2026-08-03.log',
            '.neo-ai-data/wake-daemon/inflight-sunset_restart.txt',
            '.neo-ai-data/deployment-state/snapshot.json'
        ]);

        expect(findings).toHaveLength(4);
        expect(findings.every(finding => finding.prefix === '.neo-ai-data/')).toBe(true);
    });

    test('PASSES: the tracked concept ontology, which ships on purpose', () => {
        expect(findForbiddenEntries([
            '.neo-ai-data/concepts/nodes.jsonl',
            '.neo-ai-data/concepts/edges.jsonl'
        ])).toEqual([]);
    });

    test('FIRES: a NEW sibling of the carve-out, not just the ones that existed when it was written', () => {
        // The whole point of spelling the rule as prefix-plus-allowlist. A subdirectory added next
        // week must fail; a check that enumerated today's siblings would pass it forever.
        expect(findForbiddenEntries(['.neo-ai-data/some-future-subsystem/state.json'])).toHaveLength(1);
    });

    test('FIRES: a carve-out lookalike that is not actually inside the carve-out', () => {
        // `concepts-backup/` shares a prefix with `concepts/` as a STRING but is a different
        // directory. A naive `includes('concepts')` would let it through.
        expect(findForbiddenEntries(['.neo-ai-data/concepts-backup/nodes.jsonl'])).toHaveLength(1);
    });

    test('FIRES: the DevIndex corpus regardless of extension', () => {
        // The original rule was `apps/devindex/resources/*.json` and the largest file is `.jsonl`.
        // Extension independence is the property that failed, so it is the property asserted.
        const findings = findForbiddenEntries([
            'apps/devindex/resources/data/users.jsonl',
            'apps/devindex/resources/data/tracker.json',
            'apps/devindex/resources/data/nested/deeper/whatever.bin'
        ]);

        expect(findings).toHaveLength(3);
    });

    test('PASSES: DevIndex app source and images, which are legitimately part of the package', () => {
        expect(findForbiddenEntries([
            'apps/devindex/view/Viewport.mjs',
            'apps/devindex/resources/images/neo_logo_favicon.svg',
            'apps/devindex/index.html'
        ])).toEqual([]);
    });

    test('PASSES: an ordinary framework file', () => {
        expect(findForbiddenEntries(['src/Neo.mjs', 'src/util/Array.mjs', 'package.json'])).toEqual([]);
    });

    test('every rule carries a reason, because the failure message is the whole product', () => {
        // A violation report that names a path without saying why it must not ship sends the reader
        // to `.npmignore` to reason about patterns — which is the activity that produced the defect.
        for (const rule of FORBIDDEN_PREFIXES) {
            expect(rule.prefix.endsWith('/')).toBe(true);
            expect(rule.why.length).toBeGreaterThan(40);
            expect(Array.isArray(rule.allow)).toBe(true);
        }
    });

    test('parsePackOutput survives lifecycle-script stdout ahead of the payload', () => {
        // `npm pack` is preceded by the `prepare` script's output, so the raw stdout is not
        // parseable as-is. This is the only reason the helper exists.
        const raw = '> neo.mjs@13.1.0 prepare\n[Neo AI] Checking config...\n{"status":"completed"}\n[\n  {"entryCount": 2, "files": []}\n]\n';

        expect(parsePackOutput(raw)[0].entryCount).toBe(2);
    });

    test('parsePackOutput throws rather than returning an empty result when there is no payload', () => {
        // Failing loud matters more than usual here: a silent empty list would make the check report
        // "no forbidden entries" over a pack that never happened.
        expect(() => parsePackOutput('npm ERR! something went wrong\n')).toThrow(/no JSON array/);
    });

    test('parsePackOutput finds a payload that starts at offset 0', () => {
        // The lifecycle scripts are not a contract. The moment `prepare` stops writing to stdout the
        // payload begins the string, and a matcher requiring a PRECEDING newline threw
        // "no JSON array found" over output that had one. Safe direction — a throw reds the gate and
        // can never false-pass — but a guard that breaks on a cleaner environment gets distrusted.
        expect(parsePackOutput('[\n  {"entryCount": 2, "files": []}\n]\n')[0].entryCount).toBe(2);
    });

    test('the DevIndex rule survives the corpus being RENAMED — the defect it exists to end', () => {
        // The sharpest case in this file, because the guard nearly reproduced defect #1 itself.
        //
        // The original `.npmignore` rule was pinned to `apps/devindex/resources/*.json` and went
        // vacuous when the corpus moved into `data/` and became `.jsonl`. A gate pinned to
        // `resources/data/` would go vacuous on the SAME move — rename `data/` → `corpus/` and both
        // the ignore rule and its observer fall silent together, printing OK over a 26.5 MiB leak.
        //
        // Anchoring on `resources/` with `images/` allowed means a subtree that does not exist yet is
        // excluded by default, so only a deliberate allowlist edit can widen it.
        expect(findForbiddenEntries(['apps/devindex/resources/data/users.jsonl'])).toHaveLength(1);
        expect(findForbiddenEntries(['apps/devindex/resources/corpus/users.jsonl'])).toHaveLength(1);
        expect(findForbiddenEntries(['apps/devindex/resources/some-future-dataset/x.json'])).toHaveLength(1);

        // and the one carve-out still passes, at any depth
        expect(findForbiddenEntries(['apps/devindex/resources/images/logo.svg'])).toEqual([]);
        expect(findForbiddenEntries(['apps/devindex/resources/images/icons/nested.svg'])).toEqual([]);
    });

    test('the rule set names DIRECTORIES only — the two generated portal FILES are a boundary, not a gap', () => {
        // `.npmignore` also excludes `/apps/portal/sitemap.xml` and `/apps/portal/llms.txt` (3.22 MiB),
        // and they are deliberately not gated here. Every prefix in the set names a tree whose leak
        // would be a DISCLOSURE; the portal files are already public on neomjs.com, so shipping them
        // is waste and not exposure. Asserted so the distinction is enforced rather than merely
        // written down — a later editor adding a file-shaped rule has to change this test and say why.
        expect(FORBIDDEN_PREFIXES.every(rule => rule.prefix.endsWith('/'))).toBe(true);
    });
});
