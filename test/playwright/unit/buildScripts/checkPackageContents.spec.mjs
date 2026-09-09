import fs                from 'node:fs';
import {test, expect}    from '@playwright/test';
import {BROWSER_BUNDLES} from '../../../../buildScripts/util/browserBundles.mjs';

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
/**
 * Every shipped bundle's packed path, minus the one an arm deliberately omits.
 *
 * Written as an exclusion rather than a literal list because the arms below assert "EXACTLY this
 * one is missing" — so a bundle added to `REQUIRED_ENTRIES` and not to these fixtures reds four
 * arms with a failure about parse5, which is the wrong thing to read while adding mermaid.
 * @param {String} [omit] Bundle name to leave out of the packed set.
 * @returns {String[]}
 */
const shippedExcept = omit => BROWSER_BUNDLES.filter(name => name !== omit).map(name => `dist/${name}.mjs`);

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

    test('FIRES: a forbidden tree regardless of extension', () => {
        // The first defect was a rule pinned to a path AND an extension, which went vacuous when the corpus
        // changed both. Extension independence is the property that failed, so it is the property
        // asserted — a prefix rule must not care what the file is called.
        const findings = findForbiddenEntries([
            '.neo-ai-data/graph/memory.sqlite',
            '.neo-ai-data/logs/server.json',
            '.neo-ai-data/nested/deeper/whatever.bin'
        ]);

        expect(findings).toHaveLength(3);
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

    test('a rule survives its tree being RENAMED — the defect this guard exists to end', () => {
        // The sharpest case in this file, because the guard nearly reproduced the first defect itself.
        //
        // The original `.npmignore` rule was pinned to a path AND an extension, and went vacuous when
        // the tree it named moved and changed extension. A gate pinned one level too deep reproduces
        // that exactly: rename the inner directory and both the ignore rule and its observer fall
        // silent TOGETHER, printing OK over the leak. An observer that inherits the blind spot of the
        // thing it observes is not an observer.
        //
        // Anchoring on the top of the tree with an explicit carve-out means a subtree that does not
        // exist yet is excluded by default, so only a deliberate allowlist edit can widen it — a
        // decision someone makes, rather than one a rename makes for them.
        //
        // Asserted against `.neo-ai-data/`, which carries the same prefix-plus-carve-out shape. The
        // case originally rode on the DevIndex corpus rule; that app left the repository, and the
        // property is a property of the rule SHAPE rather than of any one tree.
        expect(findForbiddenEntries(['.neo-ai-data/graph/memory.sqlite'])).toHaveLength(1);
        expect(findForbiddenEntries(['.neo-ai-data/renamed-graph/memory.sqlite'])).toHaveLength(1);
        expect(findForbiddenEntries(['.neo-ai-data/some-future-subtree/x.json'])).toHaveLength(1);

        // and the one carve-out still passes, at any depth
        expect(findForbiddenEntries(['.neo-ai-data/concepts/nodes.jsonl'])).toEqual([]);
        expect(findForbiddenEntries(['.neo-ai-data/concepts/nested/deep.jsonl'])).toEqual([]);
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

/**
 * The mirror image of the suite above. A leak announces itself to anyone who unpacks the tarball; a
 * silent DROP announces itself to a consumer, at the point of use, as a module-not-found error naming
 * a path nobody recognises. Only one of those two is discoverable from this repository, which is why
 * the presence half needs a gate at all.
 *
 * `dist/parse5.mjs` is the case that motivated it: `/dist` was excluded wholesale, so the bundle
 * `HtmlTemplateProcessor` imports never shipped, and — because `templateBuildProcessor` imports it at
 * module scope — an installed engine could not even START a `dist/esm` build. The `.npmignore` shape
 * that fixes it (`/dist/*` plus a negation) is one careless edit away from `/dist` again, and an
 * ignore rule cannot express "keep exactly this one".
 */
test.describe('check-package-contents — a required entry cannot be silently dropped', () => {
    let findMissingEntries, REQUIRED_ENTRIES;

    test.beforeAll(async () => {
        ({findMissingEntries, REQUIRED_ENTRIES} =
            await import('../../../../buildScripts/util/check-package-contents.mjs'));
    });

    test('FIRES: the parse5 bundle absent from the packed set', () => {
        // The exact regression `/dist` produced: a plausible-looking tarball with the producer script
        // present and the artifact it produces missing.
        const packed = ['src/Neo.mjs', 'buildScripts/build/parse5.mjs', 'package.json', ...shippedExcept('parse5')];

        expect(findMissingEntries(packed).map(entry => entry.path)).toEqual(['dist/parse5.mjs'])
    });

    test('PASSES: the same set once the artifact ships', () => {
        const packed = ['src/Neo.mjs', 'buildScripts/build/parse5.mjs', ...shippedExcept()];

        expect(findMissingEntries(packed)).toEqual([])
    });

    test('the match is EXACT, so a lookalike path cannot satisfy the rule', () => {
        // A prefix or suffix match would let `dist/esm/dist/parse5.mjs` — the copy the build emits
        // INTO the output tree — stand in for the published bundle at the root. They are different
        // files with different consumers, and only the root one is what an installed engine imports.
        const packed = ['dist/esm/dist/parse5.mjs', 'vendor/dist/parse5.mjs', 'dist/parse5.mjs.map', ...shippedExcept('parse5')];

        expect(findMissingEntries(packed).map(entry => entry.path)).toEqual(['dist/parse5.mjs'])
    });

    test('every shipped bundle has a required-entry row — the list cannot fall behind the build', () => {
        // `build/esmodules.mjs` copies BROWSER_BUNDLES into the output tree, so the set is what the
        // build BELIEVES it ships. This is the arm that makes the pack gate agree with it: a bundle
        // added to the build and not here would pack, or not pack, with nothing observing either.
        const covered = REQUIRED_ENTRIES.map(rule => rule.path);

        expect(BROWSER_BUNDLES.map(name => `dist/${name}.mjs`).filter(entry => !covered.includes(entry))).toEqual([])
    });

    test('every shipped bundle is re-included in .npmignore — the one copy that cannot import', () => {
        // `/dist/*` excludes the tree and a negation cannot re-include a file whose PARENT directory
        // is excluded, so `!/dist/<name>.mjs` per file is the only shape that ships one. `.npmignore`
        // is the sole gate on package contents and cannot import BROWSER_BUNDLES, which is precisely
        // why the coupling is asserted here instead of trusted.
        const ignore = fs.readFileSync(new URL('../../../../.npmignore', import.meta.url), 'utf8'),
              lines  = ignore.split('\n').map(line => line.trim());

        expect(BROWSER_BUNDLES.filter(name => !lines.includes(`!/dist/${name}.mjs`))).toEqual([])
    });

    test('every required entry carries a reason, because the failure message is the whole product', () => {
        // Same contract the forbidden rules carry: the consumer reading this failure is holding a
        // broken install and needs to know what the file is FOR, not merely that it is absent.
        expect(REQUIRED_ENTRIES.length).toBeGreaterThan(0);

        REQUIRED_ENTRIES.forEach(rule => {
            expect(rule.path).toBeTruthy();
            expect(rule.why.length).toBeGreaterThan(40)
        })
    })
});

test('the marked producer cannot substitute for the shipped runtime bundle', async () => {
    const {findMissingEntries} = await import('../../../../buildScripts/util/check-package-contents.mjs');

    expect(findMissingEntries([...shippedExcept('marked'), 'buildScripts/build/marked.mjs']).map(entry => entry.path))
        .toEqual(['dist/marked.mjs'])
});
