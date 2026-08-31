import {test, expect} from '@playwright/test';

/**
 * `dist/esm` is a copy-and-minify transform with no module resolver, so every path assumption it
 * makes is load-bearing at runtime rather than at build time. That is why all three defects behind
 * this file shipped: each produced a *successful* build whose output could not boot.
 *
 * Each arm below is written to fail against the code as it shipped, not merely to describe the fix:
 *
 * - the quote class was `["`]`, so the single-quote arm reds on the pattern as it shipped;
 * - `basePath` was prefixed unconditionally, so the fixed-base-path arms red on the old rewrite;
 * - the source-root list and the unresolvable-import guard had no implementation at all.
 *
 * The relative-`basePath` arm is the opposite kind: it passes both before and after by design. It is
 * the non-regression control for the fix, and it is the only arm here that is allowed to be green
 * against the old code.
 *
 * @see https://github.com/neomjs/neo/issues/17921
 */
test.describe('esmDistTransforms — a dist/esm build that finishes must also be able to boot', () => {
    let transforms;

    test.beforeAll(async () => {
        transforms = await import('../../../../buildScripts/util/esmDistTransforms.mjs')
    });

    test.describe('rewriteImportPaths — the workspace rewrite must see house-style code', () => {
        /**
         * The engine's convention, and every generated workspace's, is the single quote. The shipped
         * pattern matched double quotes and backticks only, so the rewrite that exists for exactly
         * this case never fired — and Terser then normalized the untouched specifiers to double
         * quotes, which made the output look rewritten.
         */
        ['\'', '"', '`'].forEach(quote => {
            test(`static import, quoted with ${quote}`, () => {
                const source = `import Base from ${quote}../../../node_modules/neo.mjs/src/core/Base.mjs${quote};`;

                expect(transforms.rewriteImportPaths(source))
                    .toBe(`import Base from ${quote}../../../src/core/Base.mjs${quote};`)
            });

            test(`dynamic import, quoted with ${quote}`, () => {
                const source = `const m = await import(${quote}../../node_modules/neo.mjs/src/Neo.mjs${quote});`;

                expect(transforms.rewriteImportPaths(source))
                    .toBe(`const m = await import(${quote}../../src/Neo.mjs${quote});`)
            })
        });

        /**
         * The depth must survive the rewrite. `node_modules/neo.mjs/src` becomes `dist/esm/src` while
         * `apps` becomes `dist/esm/apps`, so both sides move by the same amount and the number of
         * `../` segments is unchanged. A rewrite that "worked" but shifted depth would resolve to
         * nothing, which is the failure this whole file is about.
         */
        test('the relative depth is preserved exactly', () => {
            const rewritten = transforms.rewriteImportPaths(
                "import x from '../../../../node_modules/neo.mjs/src/util/Function.mjs';");

            expect(rewritten).toBe("import x from '../../../../src/util/Function.mjs';")
        });

        /** A third-party package is not flattened; it moves two levels deeper with the output tree. */
        test('a non-neo package keeps node_modules and gains the output-tree offset', () => {
            expect(transforms.rewriteImportPaths("import x from '../../node_modules/some-lib/index.mjs';"))
                .toBe("import x from '../../../../node_modules/some-lib/index.mjs';")
        });

        /** Nothing without `node_modules` is touched; the rewrite must not be a general path mangler. */
        test('a plain relative import is left alone', () => {
            const source = "import x from '../view/Viewport.mjs';";

            expect(transforms.rewriteImportPaths(source)).toBe(source)
        });

        /**
         * The pattern carries the `g` flag. Handing callers one shared instance would leak
         * `lastIndex` between them and drop matches depending on call order, so it is a factory —
         * asserted here because the failure would be intermittent and blamed on anything else.
         */
        test('repeated calls are independent', () => {
            const source = "import a from '../node_modules/neo.mjs/src/A.mjs';";

            expect(transforms.rewriteImportPaths(source)).toBe(transforms.rewriteImportPaths(source))
        })
    });

    test.describe('rewriteNeoConfig — only a position-relative basePath may be compensated', () => {
        /**
         * The control arm: the relative shape must stay byte-identical. `../../` compensates for the
         * config sitting two directories deeper in the output tree.
         */
        test('a relative basePath still gains the output-tree offset', () => {
            const config = transforms.rewriteNeoConfig(
                {appPath: 'apps/x/app.mjs', basePath: '../../'}, {insideNeo: true});

            expect(config.basePath).toBe('../../../../');
            expect(config.environment).toBe('dist/esm');
            expect(config.mainPath).toBe('./Main.mjs')
        });

        /**
         * The shipped defect: an absolute mount is not position-relative, so prefixing it emitted
         * `../..//mount/` — a value no environment resolves.
         */
        ['/mount/', '//cdn.example.com/neo/', 'https://cdn.example.com/neo/'].forEach(basePath => {
            test(`a fixed basePath passes through unchanged: ${basePath}`, () => {
                const config = transforms.rewriteNeoConfig(
                    {appPath: 'apps/x/app.mjs', basePath}, {insideNeo: true});

                expect(config.basePath).toBe(basePath)
            })
        });

        /**
         * `workerBasePath` composes from the ORIGINAL basePath, never the compensated one. The
         * asymmetry is pre-existing and deliberate, and a fix to `basePath` must not quietly change
         * it — so it is pinned on both shapes.
         */
        test('workerBasePath composes from the original basePath in both shapes', () => {
            expect(transforms.rewriteNeoConfig(
                {appPath: 'apps/x/app.mjs', basePath: '../../'}, {insideNeo: true}).workerBasePath)
                .toBe('../../src/worker/');

            expect(transforms.rewriteNeoConfig(
                {appPath: 'apps/x/app.mjs', basePath: '/mount/'}, {insideNeo: true}).workerBasePath)
                .toBe('/mount/src/worker/')
        });

        test('a workspace build trims the appPath prefix, an in-engine build does not', () => {
            expect(transforms.rewriteNeoConfig(
                {appPath: '../../apps/x/app.mjs', basePath: '../../'}, {insideNeo: false}).appPath)
                .toBe('apps/x/app.mjs');

            expect(transforms.rewriteNeoConfig(
                {appPath: 'apps/x/app.mjs', basePath: '../../'}, {insideNeo: true}).appPath)
                .toBe('apps/x/app.mjs')
        })
    });

    test.describe('resolveSourceRoots — a workspace may keep source outside the four known trees', () => {
        const workspace = {name: 'my-workspace'};

        test('the defaults are unchanged when nothing is declared', () => {
            expect(transforms.resolveSourceRoots({insideNeo: false, packageJson: workspace}))
                .toEqual(['apps', 'docs', 'node_modules/neo.mjs/src', 'src']);

            expect(transforms.resolveSourceRoots({insideNeo: true, packageJson: workspace}))
                .toEqual(['apps', 'docs', 'examples', 'src'])
        });

        /** The shipped defect: a component library beside `apps/` was never copied, and nothing said so. */
        test('declared roots are added to the defaults', () => {
            expect(transforms.resolveSourceRoots({
                insideNeo  : false,
                packageJson: {...workspace, neo: {esmSourceRoots: ['components', 'shared']}}
            })).toEqual(['apps', 'docs', 'node_modules/neo.mjs/src', 'src', 'components', 'shared'])
        });

        /** Additive, never subtractive: a workspace cannot drop a default by re-declaring the list. */
        test('a declared root that duplicates a default does not appear twice', () => {
            expect(transforms.resolveSourceRoots({
                insideNeo  : false,
                packageJson: {...workspace, neo: {esmSourceRoots: ['src', 'components']}}
            })).toEqual(['apps', 'docs', 'node_modules/neo.mjs/src', 'src', 'components'])
        });

        /**
         * A malformed declaration must be loud. Silently ignoring it would reproduce the exact defect
         * this option exists to fix, while looking configured.
         */
        [{esmSourceRoots: 'components'}, {esmSourceRoots: ['ok', '']}, {esmSourceRoots: [1]}].forEach((neo, index) => {
            test(`a malformed esmSourceRoots declaration throws (case ${index})`, () => {
                expect(() => transforms.resolveSourceRoots({insideNeo: false, packageJson: {...workspace, neo}}))
                    .toThrow(/esmSourceRoots/)
            })
        })
    });

    test.describe('relativeSpecifiers — read from emitted code, which Terser has already normalized', () => {
        test('all quote styles and both import forms are seen', () => {
            const emitted = [
                'import a from"./a.mjs";',
                "import b from '../b.mjs';",
                'import(`./c.mjs`);',
                'export*from"../d.mjs";',
                'import"./side-effect.mjs";'
            ].join('');

            expect(transforms.relativeSpecifiers(emitted).sort())
                .toEqual(['../b.mjs', '../d.mjs', './a.mjs', './c.mjs', './side-effect.mjs'])
        });

        /** Bare specifiers are the resolver's business, not the output tree's. */
        test('bare package specifiers are ignored', () => {
            expect(transforms.relativeSpecifiers('import x from"neo.mjs";')).toEqual([])
        })
    });

    test.describe('findUnresolvableImports — existence, not containment, is the property', () => {
        const resolve = (outputPath, specifier) =>
            specifier.startsWith('./')
                ? outputPath.replace(/[^/]+$/, '') + specifier.slice(2)
                : outputPath.replace(/[^/]+\/[^/]+$/, '') + specifier.slice(3);

        test('a resolvable tree reports nothing', () => {
            const failures = transforms.findUnresolvableImports(
                [{outputPath: 'dist/esm/apps/x/app.mjs', specifiers: ['./view.mjs']}],
                candidate => candidate === 'dist/esm/apps/x/view.mjs',
                resolve);

            expect(failures).toEqual([])
        });

        /**
         * The decisive arm. An unrewritten `node_modules` specifier lands at a path that is INSIDE
         * `dist/esm` and was simply never populated — so a containment check calls it fine and the
         * build greens on output that cannot boot. Only existence separates the two.
         */
        test('an import inside the output tree but never emitted is a failure', () => {
            const failures = transforms.findUnresolvableImports(
                [{outputPath: 'dist/esm/apps/x/app.mjs', specifiers: ['./node_modules/neo.mjs/src/Neo.mjs']}],
                () => false,
                resolve);

            expect(failures).toHaveLength(1);
            expect(failures[0].outputPath).toBe('dist/esm/apps/x/app.mjs');
            expect(failures[0].specifier).toBe('./node_modules/neo.mjs/src/Neo.mjs')
        });

        /** The uncopied-source-root shape: a sibling import that no root ever emitted. */
        test('an import into an uncopied source root is a failure and names the specifier', () => {
            const failures = transforms.findUnresolvableImports(
                [{outputPath: 'dist/esm/apps/x/app.mjs', specifiers: ['../../components/Button.mjs']}],
                () => false,
                resolve);

            expect(failures).toHaveLength(1);
            expect(failures[0].specifier).toBe('../../components/Button.mjs')
        });

        test('every offending specifier is reported, not just the first', () => {
            const failures = transforms.findUnresolvableImports(
                [{outputPath: 'dist/esm/a.mjs', specifiers: ['./x.mjs', './y.mjs']}],
                () => false,
                resolve);

            expect(failures.map(entry => entry.specifier)).toEqual(['./x.mjs', './y.mjs'])
        })
    })
});
