import {execFileSync}    from 'node:child_process';
import fs                from 'node:fs';
import os                from 'node:os';
import path              from 'node:path';
import process           from 'node:process';
import {fileURLToPath}   from 'node:url';
import {test, expect}    from '@playwright/test';
import {parsePackOutput} from '../../../../buildScripts/util/check-package-contents.mjs';

/**
 * The check's value is entirely in WHICH packed paths it fires on, so the assertions are the two
 * populations rather than the message text.
 *
 * Pure path controls cover the rule logic; a small real-pack fixture plants generated files to
 * verify the ignore policy. The full checkout is checked by the script's own entrypoint in CI.
 *
 * The carve-out cases are the reason this is not a one-line prefix test. A deliberate export inside a
 * directory of private state makes both "flag everything under the prefix" and "flag nothing under
 * the prefix" wrong, and that boundary is exactly where the original `.npmignore` defect lived. The
 * production `.neo-ai-data/` rule carves nothing out any more (the concept ontology lives in the
 * plane), so the carve-out cases run against `CARVED`, a fixture rule with the same shape.
 */
test.describe('check-package-contents — fires on private state; a carve-out passes only its own subtree', () => {
    const CARVED = [{prefix: '.neo-ai-data/', allow: ['.neo-ai-data/keep/'], why: 'fixture: a deliberate export inside private state'}];

    let findForbiddenEntries, FORBIDDEN_PREFIXES, FORBIDDEN_SUFFIXES, parsePackOutput;

    test.beforeAll(async () => {
        ({findForbiddenEntries, FORBIDDEN_PREFIXES, FORBIDDEN_SUFFIXES, parsePackOutput} =
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

    test('FIRES: the concept files, which no longer ship', () => {
        // The ontology lives in the plane, so a stray copy here is private state like any other.
        expect(findForbiddenEntries([
            '.neo-ai-data/concepts/nodes.jsonl',
            '.neo-ai-data/concepts/edges.jsonl'
        ])).toHaveLength(2);
    });

    test('PASSES: a deliberate carve-out, at any depth', () => {
        expect(findForbiddenEntries(['.neo-ai-data/keep/a.jsonl', '.neo-ai-data/keep/nested/deep.jsonl'], CARVED)).toEqual([]);
    });

    test('FIRES: a NEW sibling of the carve-out, not just the ones that existed when it was written', () => {
        // The whole point of spelling the rule as prefix-plus-allowlist. A subdirectory added next
        // week must fail; a check that enumerated today's siblings would pass it forever.
        expect(findForbiddenEntries(['.neo-ai-data/some-future-subsystem/state.json'], CARVED)).toHaveLength(1);
    });

    test('FIRES: a carve-out lookalike that is not actually inside the carve-out', () => {
        // `keep-backup/` shares a prefix with `keep/` as a STRING but is a different directory.
        // A naive `includes('keep')` would let it through.
        expect(findForbiddenEntries(['.neo-ai-data/keep-backup/nodes.jsonl'], CARVED)).toHaveLength(1);
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

    test('FIRES: an engine spec, in the test tree and in an app', () => {
        // The class is the contract. `.gitignore` re-includes every `.mjs` file of a shipped app, so the
        // second path passes the ignore rule; a rule pinned to `test/playwright/` would pass it here too.
        const findings = findForbiddenEntries([
            'test/playwright/unit/core/Base.spec.mjs',
            'apps/portal/view/Viewport.spec.mjs'
        ]);

        expect(findings.map(finding => finding.suffix)).toEqual(['.spec.mjs', '.spec.mjs']);
    });

    test('PASSES: what a workspace imports from the test tree', () => {
        expect(findForbiddenEntries([
            'test/playwright/setup.mjs',
            'test/playwright/fixtures.mjs',
            'test/playwright/playwright.config.unit.mjs',
            'test/playwright/e2e/utils/pngPixels.mjs'
        ])).toEqual([]);
    });

    test('every rule carries a reason, because the failure message is the whole product', () => {
        // A violation report that names a path without saying why it must not ship sends the reader
        // to `.npmignore` to reason about patterns — which is the activity that produced the defect.
        for (const rule of FORBIDDEN_PREFIXES) {
            expect(rule.prefix.endsWith('/')).toBe(true);
            expect(rule.why.length).toBeGreaterThan(40);
            expect(Array.isArray(rule.allow)).toBe(true);
        }

        for (const rule of FORBIDDEN_SUFFIXES) {
            expect(rule.suffix.startsWith('.')).toBe(true);
            expect(rule.why.length).toBeGreaterThan(40);
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
        // Asserted against the `CARVED` fixture, which carries the prefix-plus-carve-out shape. The
        // case originally rode on the DevIndex corpus rule; that app left the repository, and the
        // property is a property of the rule SHAPE rather than of any one tree.
        expect(findForbiddenEntries(['.neo-ai-data/graph/memory.sqlite'], CARVED)).toHaveLength(1);
        expect(findForbiddenEntries(['.neo-ai-data/renamed-graph/memory.sqlite'], CARVED)).toHaveLength(1);
        expect(findForbiddenEntries(['.neo-ai-data/some-future-subtree/x.json'], CARVED)).toHaveLength(1);

        // and the carve-out still passes, at any depth
        expect(findForbiddenEntries(['.neo-ai-data/keep/nodes.jsonl'], CARVED)).toEqual([]);
        expect(findForbiddenEntries(['.neo-ai-data/keep/nested/deep.jsonl'], CARVED)).toEqual([]);
    });

    test('the rule set names DIRECTORIES and one file CLASS — individual generated files live in .gitignore', () => {
        // Prefixes cover whole private or generated trees, the one suffix a class no folder separates;
        // individual untracked outputs (`apps/portal/sitemap*.xml`, `apps/portal/llms*.txt`) stay in `.gitignore`.
        expect(FORBIDDEN_PREFIXES.every(rule => rule.prefix.endsWith('/'))).toBe(true);
        expect(FORBIDDEN_SUFFIXES.map(rule => rule.suffix)).toEqual(['.spec.mjs']);
    });
});

/** @summary Generated browser dependencies belong to the installed consumer, never its source tarball. */
test.describe('check-package-contents — source-only release', () => {
    const sourcePaths = ['src/Neo.mjs', 'buildScripts/build/parse5.mjs', 'package.json'],
          generated   = ['dist/parse5.mjs', 'dist/marked.mjs', 'dist/mermaid.mjs', 'dist/monaco/editor.mjs',
              'dist/highlight/highlight.custom.js', 'dist/future/nested/asset.bin'];

    test('every generated bundle family and an unknown future subtree are forbidden', async () => {
        const {findForbiddenEntries} = await import('../../../../buildScripts/util/check-package-contents.mjs');

        expect(findForbiddenEntries(generated).map(entry => entry.path)).toEqual(generated);
        expect(findForbiddenEntries(sourcePaths)).toEqual([])
    });

    test('a built package still packs source only', async () => {
        const {withComposedNpmIgnore} = await import('../../../../buildScripts/util/npmIgnoreComposition.mjs'),
              root                    = fileURLToPath(new URL('../../../../', import.meta.url)),
              dir                     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-source-pack-'));

        try {
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'neo-source-pack-fixture', version: '1.0.0'}));
            fs.writeFileSync(path.join(dir, '.npmignore'), fs.readFileSync(path.join(root, '.npmignore')));
            fs.writeFileSync(path.join(dir, '.gitignore'), fs.readFileSync(path.join(root, '.gitignore')));

            for (const file of [...sourcePaths.filter(file => file !== 'package.json'), ...generated,
                '.neo-ai-data/sqlite/synthetic.sqlite', '.neo-ai-data/concepts/synthetic.json',
                'test/playwright/setup.mjs', 'test/playwright/unit/synthetic.spec.mjs']) {
                const target = path.join(dir, file);

                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, 'synthetic fixture\n')
            }

            const files = withComposedNpmIgnore(dir, () => parsePackOutput(execFileSync('npm',
                ['pack', '--dry-run', '--json', '--ignore-scripts'],
                {cwd: dir, encoding: 'utf8', stdio: 'pipe', env: {...process.env, npm_config_update_notifier: 'false'}}
            ))[0].files.map(file => file.path));

            expect(files.filter(file => file.startsWith('dist/'))).toEqual([]);
            expect(files.filter(file => file.endsWith('.spec.mjs'))).toEqual([]);
            expect(files).toEqual(expect.arrayContaining([...sourcePaths, 'test/playwright/setup.mjs']));
            expect(files).not.toContain('.neo-ai-data/sqlite/synthetic.sqlite');
            expect(files).not.toContain('.neo-ai-data/concepts/synthetic.json')
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    })
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

/**
 * @summary A frame is named when a packed text file carries its folder AND its name.
 *
 * A bare-name match is the avoided trap, not the rule: `dark.png` occurs in several folders, so a
 * bare-name search passes a frame that shipped from another folder. The baseline is the escape hatch
 * for the folders whose frame names are data, and every entry has to state why it cannot be a literal.
 */
test.describe('check-package-contents — a packed image needs a reference that names its folder', () => {
    let collectUnnamedImages, diffImageBaseline, IMAGE_BASELINE, FRAME_RULE, imageReferenceKey;

    const reader = files => packedPath => files[packedPath];

    test.beforeAll(async () => {
        ({collectUnnamedImages, diffImageBaseline, IMAGE_BASELINE, FRAME_RULE, imageReferenceKey} =
            await import('../../../../buildScripts/util/check-package-contents.mjs'));
    });

    test('PASSES: a text file that names the image by folder and file name', () => {
        expect(collectUnnamedImages(
            ['src/overlay/dark.png', 'src/overlay/Container.mjs'],
            reader({'src/overlay/Container.mjs': "src: 'overlay/dark.png'"})
        )).toEqual([])
    });

    test('FIRES: an image that no packed text file names', () => {
        expect(collectUnnamedImages(
            ['src/overlay/dark.png', 'src/overlay/Container.mjs'],
            reader({'src/overlay/Container.mjs': 'nothing here'})
        )).toEqual(['src/overlay/dark.png'])
    });

    test('FIRES: preview/dark.png although dark.png occurs in another folder', () => {
        // The measured false pass this rule exists to end.
        expect(collectUnnamedImages(
            ['examples/scheduler/basic/preview/dark.png', 'resources/images/other/dark.png', 'README.md'],
            reader({'README.md': '![frame](other/dark.png)'})
        )).toEqual(['examples/scheduler/basic/preview/dark.png'])
    });

    test('PASSES: the unnamed images a baselined folder prefix covers', () => {
        const prefix = {prefix: 'fixtures/roster/', why: 'the folder base is a constant and each file name is member data'};

        expect(diffImageBaseline(
            ['fixtures/roster/Max-fixture.jpeg', 'fixtures/roster/Tobiu-fixture.png'],
            [prefix]
        )).toEqual({added: [], stale: []})
    });

    test('PASSES: a baselined single file, and FIRES for its sibling', () => {
        const baseline = [{path: 'examples/x/RangeHeader.jpg', why: 'referenced as ./RangeHeader.jpg, relative to its own folder'}];

        expect(diffImageBaseline(['examples/x/RangeHeader.jpg'], baseline)).toEqual({added: [], stale: []});

        // The sibling is a new offender, and the baselined file it replaced is now a stale row: one run says both.
        expect(diffImageBaseline(['examples/x/Other.png'], baseline)).toEqual({
            added: ['examples/x/Other.png'],
            stale: baseline
        })
    });

    test('an unreadable text file leaves its images unnamed instead of throwing', () => {
        // Safe direction: a file the guard could not open reds the check, it never silently passes.
        expect(collectUnnamedImages(['src/x.png', 'src/a.mjs'], () => undefined)).toEqual(['src/x.png'])
    });

    test('the baseline file is not evidence: it names the images it exempts', () => {
        // The list is packed, and every row spells its image. Counting it would retire every row.
        const baselineFile = 'buildScripts/util/check-package-contents-baseline.json';

        expect(collectUnnamedImages(
            ['examples/x/RangeHeader.jpg', baselineFile],
            reader({[baselineFile]: '{"path": "examples/x/RangeHeader.jpg"}'})
        )).toEqual(['examples/x/RangeHeader.jpg'])
    });

    test('other packed files stay evidence, so a real reference still names its image', () => {
        expect(collectUnnamedImages(
            ['examples/x/RangeHeader.jpg', 'examples/x/Container.mjs'],
            reader({'examples/x/Container.mjs': "src: './x/RangeHeader.jpg'"})
        )).toEqual([])
    });

    test('a root-level image is keyed by its own name, which is all it has', () => {
        expect(imageReferenceKey('preview/dark.png')).toBe('preview/dark.png');
        expect(imageReferenceKey('dark.png')).toBe('dark.png')
    });

    test('FIRES DOWN: a path entry whose frame is gone, and one that is now named', () => {
        const gone    = {path: 'examples/x/removed.jpg', why: 'the example that shipped it was deleted'},
              renamed = {path: 'fixtures/roster/Max-fixture.jpeg', why: 'folder base plus a member name from the data file'};

        // Unpacked or deleted: no unnamed image carries its path.
        expect(diffImageBaseline([], [gone]).stale).toEqual([gone]);

        // Now named by folder and file name: the image is still packed, so it is no longer unnamed.
        const unnamed = collectUnnamedImages(
            ['fixtures/roster/Max-fixture.jpeg', 'fixtures/roster/Container.mjs'],
            reader({'fixtures/roster/Container.mjs': "picture: 'roster/Max-fixture.jpeg'"})
        );

        expect(unnamed).toEqual([]);
        expect(diffImageBaseline(unnamed, [renamed]).stale).toEqual([renamed])
    });

    test('FIRES DOWN: a prefix entry that covers no unnamed image', () => {
        const prefix = {prefix: 'fixtures/roster/', why: 'the folder base is a constant and each file name is member data'};

        expect(diffImageBaseline(['examples/x/other.png'], [prefix]).stale).toEqual([prefix])
    });

    test('every baseline entry names a path or a prefix, and states why', () => {
        expect(IMAGE_BASELINE.length).toBeGreaterThan(0);

        for (const entry of IMAGE_BASELINE) {
            expect(Boolean(entry.path) || Boolean(entry.prefix), 'an entry names what it covers').toBe(true);
            expect(entry.why.length, 'the reason is the whole product, as with FORBIDDEN_PREFIXES').toBeGreaterThan(40)
        }
    });

    test('the failure text carries the pinned-link rule, so nobody has to find it in a review', () => {
        expect(FRAME_RULE).toContain('https://github.com/neomjs/neo/blob/');
        expect(FRAME_RULE).toContain('?raw=true');
        expect(FRAME_RULE).toMatch(/pinned/)
    });
});

test.describe('check-package-contents — the pack report is read from either npm shape', () => {
    let parsePackOutput;

    test.beforeAll(async () => {
        ({parsePackOutput} = await import('../../../../buildScripts/util/check-package-contents.mjs'));
    });

    test('the array shape of npm 11 and earlier', () => {
        expect(parsePackOutput('\n[\n  {"entryCount": 2, "files": []}\n]\n')[0].entryCount).toBe(2)
    });

    test('the object shape npm 12 reports, keyed by package name', () => {
        expect(parsePackOutput('prepare output\n{\n  "neo.mjs": {"entryCount": 3, "files": []}\n}\n')[0].entryCount).toBe(3)
    });

    test('a one-line lifecycle object ahead of the payload does not take its place', () => {
        // The anchor is a line of its own, so this object never opens one: the array is still first.
        const raw = '{"status":"completed"}\n[\n  {"entryCount": 4, "files": []}\n]\n';

        expect(parsePackOutput(raw)[0].entryCount).toBe(4)
    });

    test('a pretty-printed lifecycle object ahead of the payload reds the gate instead of guessing', () => {
        // It opens a line, so it IS the payload by position; JSON.parse then rejects the array after it.
        const raw = '{\n  "status": "completed"\n}\n[\n  {"entryCount": 4, "files": []}\n]\n';

        expect(() => parsePackOutput(raw)).toThrow(/Unexpected non-whitespace character/)
    });
});
