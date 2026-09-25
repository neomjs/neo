import {execFileSync}                      from 'node:child_process';
import fs                                  from 'node:fs';
import os                                  from 'node:os';
import path                                from 'node:path';
import process                             from 'node:process';
import {fileURLToPath}                     from 'node:url';
import {test, expect}                      from '@playwright/test';
import {BROWSER_BUNDLES}                   from '../../../../buildScripts/util/browserBundles.mjs';
import {parsePackOutput, REQUIRED_ENTRIES} from '../../../../buildScripts/util/check-package-contents.mjs';

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
 * Outside BROWSER_BUNDLES: a directory's files, not `dist/<name>.mjs`, so their coupling is asserted below.
 * Read from the registry; whether it names the files the loader requests is `unit/util/HighlightJs.spec.mjs`'s question.
 */
const HIGHLIGHT_BUNDLES = REQUIRED_ENTRIES.map(rule => rule.path).filter(entry => entry.startsWith('dist/highlight/'));
/** The same shape for Monaco's build; whether it names the files the addon requests is `component/wrapper/MonacoEditor.spec.mjs`'s question. */
const MONACO_BUNDLE = REQUIRED_ENTRIES.map(rule => rule.path).filter(entry => entry.startsWith('dist/monaco/'));

/**
 * Every shipped bundle's packed path, minus the one an arm deliberately omits.
 *
 * Written as an exclusion rather than a literal list because the arms below assert "EXACTLY this
 * one is missing" — so a bundle added to `REQUIRED_ENTRIES` and not to these fixtures reds four
 * arms with a failure about parse5, which is the wrong thing to read while adding mermaid.
 * @param {String} [omit] Bundle name to leave out of the packed set.
 * @returns {String[]}
 */
const shippedExcept = omit => [
    ...BROWSER_BUNDLES.filter(name => name !== omit).map(name => `dist/${name}.mjs`),
    ...(omit === 'highlight' ? [] : HIGHLIGHT_BUNDLES),
    ...(omit === 'monaco' ? [] : MONACO_BUNDLE)
];

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

    test('the highlight bundles ship from their subdirectory, which the per-name arms above cannot see', () => {
        // `/dist/*` excludes the `highlight` directory itself, so a file ships only if the directory is
        // re-included, its contents excluded, and that file re-included after the exclusion.
        const ignore  = fs.readFileSync(new URL('../../../../.npmignore', import.meta.url), 'utf8'),
              lines   = ignore.split('\n').map(line => line.trim()),
              include = lines.indexOf('!/dist/highlight/'),
              exclude = lines.indexOf('/dist/highlight/*');

        expect(HIGHLIGHT_BUNDLES.length, 'the registry names the highlight bundles').toBeGreaterThan(0);
        expect(findMissingEntries(shippedExcept('highlight')).map(entry => entry.path)).toEqual(HIGHLIGHT_BUNDLES);
        expect(include).toBeGreaterThan(-1);
        expect(exclude).toBeGreaterThan(include);
        HIGHLIGHT_BUNDLES.forEach(entry => expect(lines.indexOf(`!/${entry}`), entry).toBeGreaterThan(exclude))
    });

    test('the Monaco build ships its whole directory, which the per-name arms above cannot see', () => {
        // Every file the build emits is loaded, so unlike highlight nothing inside is excluded again:
        // re-including the directory after `/dist/*` is the whole rule.
        const lines = fs.readFileSync(new URL('../../../../.npmignore', import.meta.url), 'utf8').split('\n').map(line => line.trim());

        expect(MONACO_BUNDLE.length, 'the registry names the Monaco files').toBeGreaterThan(0);
        expect(findMissingEntries(shippedExcept('monaco')).map(entry => entry.path)).toEqual(MONACO_BUNDLE);
        expect(lines.indexOf('!/dist/monaco/')).toBeGreaterThan(lines.indexOf('/dist/*'));
        expect(lines.filter(line => line.startsWith('/dist/monaco/')), 'nothing inside is excluded again').toEqual([])
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

/**
 * @summary The composition itself, and the spelling axis that made a guard built on it lie.
 *
 * `/dist`, `dist`, `dist/` and `/dist/` all name one directory to an ignore file. The first version of
 * this filter normalized the HEADER pattern and compared it against a RAW copy pattern, so it matched
 * `/dist` and missed the rest. @neo-opus-grace measured the consequence on the real tree: with
 * `.gitignore` spelling it `dist/`, the composed file shipped 0 of 13 `dist` files while the guard
 * reported nothing lost. Both sides normalize now, and every spelling has an arm — this is the axis,
 * so a single happy-path case would be no control at all.
 */
test.describe('composeNpmIgnore — ownership is spelling-independent', () => {
    const HEAD      = '# Original content of the .gitignore file',
          npmIgnore = ['/dist/*', '!/dist/parse5.mjs', HEAD, '/node_modules'].join('\n');

    for (const spelling of ['/dist', 'dist', 'dist/', '/dist/']) {
        test(`a copied \`${spelling}\` is recognised as owned by the header's /dist/*`, async () => {
            const {composeNpmIgnore} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs');

            const {content, dropped} = composeNpmIgnore(npmIgnore, ['/node_modules', spelling].join('\n'));

            expect(dropped.map(entry => entry.line), 'the copy\'s rule is dropped').toEqual([spelling]);
            expect(dropped[0].owner, 'and it names the header path that owns it').toBe('dist');
            expect(content.split('\n').filter(line => line === spelling), 'so it cannot re-exclude the tree').toEqual([])
        })
    }

    test('a copied rule for an unowned path is kept, so the sync still works', async () => {
        const {composeNpmIgnore} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs');

        const {content, dropped} = composeNpmIgnore(npmIgnore, ['/node_modules', '/coverage'].join('\n'));

        expect(dropped).toEqual([]);
        expect(content.split('\n')).toContain('/coverage')
    });

    test('a negation in the copy is matched on the path it names, not on its marker', async () => {
        const {composeNpmIgnore} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs');

        const {dropped} = composeNpmIgnore(npmIgnore, ['/node_modules', '!/dist/other.mjs'].join('\n'));

        expect(dropped.map(entry => entry.line)).toEqual(['!/dist/other.mjs'])
    })
});

/**
 * @summary `.npmignore` is composed where it is consumed: `npm pack` and `npm publish` run the composition as
 * `prepack` and take the copy out again as `postpack`, so the committed file is the header alone.
 *
 * An engine installed from a git commit runs `prepare`, never `prepack`, so it packs the header alone. That is
 * the package a publish ships only while `.gitignore` matches no tracked file, so that is an arm too.
 */
test.describe('.npmignore is composed at pack time', () => {
    const HEAD = '# Original content of the .gitignore file',
          ROOT = fileURLToPath(new URL('../../../../', import.meta.url)),
          read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

    test('the committed .npmignore is its header alone', async () => {
        const {headerOf} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs');

        expect(headerOf(read('.npmignore')), 'every pack rewrites what sits below the marker: move a rule above it').toBe(read('.npmignore'))
    });

    for (const eol of ['\n', '\r\n']) {
        test(`restoring a composed file gives back the committed one (${JSON.stringify(eol)})`, async () => {
            const {composeNpmIgnore, headerOf} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs');

            const header    = ['/dist/*', '!/dist/parse5.mjs', HEAD, ''].join(eol),
                  {content} = composeNpmIgnore(header, ['/node_modules', '/coverage', ''].join(eol));

            expect(content).toBe(['/dist/*', '!/dist/parse5.mjs', HEAD, '/node_modules', '/coverage', ''].join(eol));
            expect(headerOf(content)).toBe(header)
        })
    }

    test('a .npmignore without the marker throws instead of guessing where the header ends', async () => {
        const {composeNpmIgnore, headerOf} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs');

        expect(() => composeNpmIgnore('/dist/*\n', '/node_modules\n')).toThrow(HEAD);
        expect(() => headerOf('/dist/*\n')).toThrow(HEAD)
    });

    test('package.json runs the composition as prepack and removes it as postpack', () => {
        const {scripts} = JSON.parse(read('package.json'));

        expect(scripts.prepack).toBe('node ./buildScripts/util/npmIgnoreComposition.mjs compose');
        expect(scripts.postpack).toBe('node ./buildScripts/util/npmIgnoreComposition.mjs restore')
    });

    // A package holding one path only the header excludes (notes.txt) and one only the copy excludes (local-state.txt)
    const HEADER = ['/notes.txt', HEAD, ''].join('\n'),
          ENTRY  = path.join(ROOT, 'buildScripts/util/npmIgnoreComposition.mjs');

    function withFixture(scripts, fn) {
        const dir   = fs.mkdtempSync(path.join(os.tmpdir(), 'npmignore-')),
              write = (file, content) => fs.writeFileSync(path.join(dir, file), content);

        write('package.json', JSON.stringify({name: 'npmignore-fixture', version: '1.0.0', scripts}));
        write('.npmignore',      HEADER);
        write('.gitignore',      'local-state.txt\n');
        write('index.js',        '');
        write('notes.txt',       '');
        write('local-state.txt', '');

        try {
            fn(dir)
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    }

    function packedFiles(dir, ...flags) {
        const raw = execFileSync('npm', ['pack', '--dry-run', '--json', ...flags], {cwd: dir, encoding: 'utf8', stdio: 'pipe', env: {...process.env, npm_config_update_notifier: 'false'}});

        return parsePackOutput(raw)[0].files.map(file => file.path)
    }

    test('npm pack reads what prepack composed, and postpack restores the committed file', () => {
        withFixture({prepack: `node "${ENTRY}" compose`, postpack: `node "${ENTRY}" restore`}, dir => {
            const files = packedFiles(dir);

            expect(files).toContain('index.js');
            expect(files, 'the header applies').not.toContain('notes.txt');
            expect(files, 'the copy applies, so prepack ran before npm listed the files').not.toContain('local-state.txt');
            expect(fs.readFileSync(path.join(dir, '.npmignore'), 'utf8'), 'postpack restored the header').toBe(HEADER)
        })
    });

    test('a pack that skips the lifecycle composes through withComposedNpmIgnore', async () => {
        const {withComposedNpmIgnore} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs');

        withFixture({}, dir => {
            expect(packedFiles(dir, '--ignore-scripts'), 'control: the header alone ships the local state').toContain('local-state.txt');

            const files = withComposedNpmIgnore(dir, () => packedFiles(dir, '--ignore-scripts'));

            expect(files).toContain('index.js');
            expect(files).not.toContain('notes.txt');
            expect(files).not.toContain('local-state.txt');
            expect(fs.readFileSync(path.join(dir, '.npmignore'), 'utf8'), 'the file is put back as it was').toBe(HEADER)
        })
    });

    test('.gitignore matches no tracked file, so a clean checkout packs the same files without the copy', () => {
        const tracked = execFileSync('git', ['ls-files', '--cached', '--ignored', '--exclude-from=.gitignore'], {cwd: ROOT, encoding: 'utf8'});

        expect(tracked, 'a git-pinned install ships these and a publish does not: re-include them in .gitignore, or untrack them').toBe('')
    })
});
