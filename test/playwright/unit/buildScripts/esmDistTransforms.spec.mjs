import path           from 'path';
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

        /**
         * A re-export is a request the browser makes, so it needs the same rewrite. The pattern
         * matched `import` only, which left `export … from` addressing the workspace's own engine
         * from inside `dist/esm` — a path that resolves, so nothing failed; it simply booted a second
         * engine graph. Reds against the shipped pattern.
         */
        [
            ["export {default} from '../../node_modules/neo.mjs/src/core/Base.mjs';",
             "export {default} from '../../src/core/Base.mjs';"],
            ['export*from"../node_modules/neo.mjs/src/Neo.mjs";',
             'export*from"../src/Neo.mjs";'],
            ["export * as Neo from '../node_modules/neo.mjs/src/Neo.mjs';",
             "export * as Neo from '../src/Neo.mjs';"]
        ].forEach(([source, expected], index) => {
            test(`a re-export of the engine is rewritten too (form ${index})`, () => {
                expect(transforms.rewriteImportPaths(source)).toBe(expected)
            })
        });

        /** The rewrite must stay a specifier rewrite: an ordinary export naming the string is not one. */
        test('an exported string that merely contains node_modules is untouched', () => {
            const source = "export const dir = 'x/node_modules/neo.mjs/y';";

            expect(transforms.rewriteImportPaths(source)).toBe(source)
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
        });

        /**
         * The declared root is not only an input path: the build resolves it a second time against
         * `dist/esm` to decide where to WRITE. An unconstrained entry is therefore an output
         * authority, and type-checking it while leaving containment open is what turns a convenience
         * into an overwrite primitive.
         *
         * Each entry below is a shape the shipped `resolveSourceRoots` returned verbatim:
         *
         * - `/tmp/external` — `path.resolve` discards everything before an absolute segment, so the
         *   build's input and output become the SAME external directory and it minifies a foreign
         *   tree in place;
         * - `C:\external` / `..\..\outside` — the Windows spellings of the same two requests, which
         *   a POSIX-only check reads as harmless relative directory names;
         * - `../../outside` — writes into the workspace beside `dist/esm` rather than inside it;
         * - `dist/esm`, `dist`, `.` — feed the build its own output tree.
         *
         * All red against the shipped implementation, which validated only "non-empty string".
         */
        ['/tmp/external', 'C:\\external', '../../outside', '..\\..\\outside', 'dist/esm', 'dist/esm/nested', 'dist', '.', './']
            .forEach(entry => {
                test(`an unsafe declared root is refused: ${JSON.stringify(entry)}`, () => {
                    expect(() => transforms.resolveSourceRoots({
                        insideNeo  : false,
                        packageJson: {...workspace, neo: {esmSourceRoots: [entry]}}
                    })).toThrow(/esmSourceRoots/)
                })
            });

        /** The guard must not be a blanket refusal: ordinary roots, in either spelling, still pass. */
        test('safe roots are normalized to the workspace-relative form and kept', () => {
            expect(transforms.resolveSourceRoots({
                insideNeo  : false,
                packageJson: {...workspace, neo: {esmSourceRoots: ['./components/', 'shared\\ui', 'distribution']}}
            })).toEqual(['apps', 'docs', 'node_modules/neo.mjs/src', 'src', 'components', 'shared/ui', 'distribution'])
        });

        /** Normalization happens before the check, so the same request cannot be spelled past it. */
        test('a traversing root is refused however it is spelled', () => {
            ['.././../outside', './../outside', 'a/../../outside'].forEach(entry => {
                expect(() => transforms.resolveSourceRoots({
                    insideNeo  : false,
                    packageJson: {...workspace, neo: {esmSourceRoots: [entry]}}
                }), entry).toThrow(/esmSourceRoots/)
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

    test.describe('findUnresolvableImports — existence for a foreign package, identity for the engine', () => {
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
        });

        /**
         * These arms use the production resolver rather than the toy one above, because the shape they
         * describe only exists at real depth: an unrewritten engine specifier climbs out of `dist/esm`
         * and lands back in the workspace it was copied FROM.
         */
        const resolveReal = (outputPath, specifier) => path.resolve(path.dirname(outputPath), specifier);

        /**
         * The arm that reds against the existence-only guard. The target is the workspace's real
         * `node_modules/neo.mjs` source, so `exists` says yes and the build greened — while the app
         * loaded a second engine graph beside the copy in `dist/esm/src`, each with its own class
         * registry and its own singletons. Nothing about that is observable as a missing file, which
         * is exactly why existence is the wrong property for the one package the output owns.
         */
        test('an engine import that resolves to the real workspace source is still a failure', () => {
            const failures = transforms.findUnresolvableImports(
                [{
                    outputPath: '/workspace/dist/esm/apps/x/app.mjs',
                    specifiers: ['../../../../node_modules/neo.mjs/src/Neo.mjs']
                }],
                () => true,
                resolveReal);

            expect(failures).toHaveLength(1);
            expect(failures[0].reason).toBe('engine-identity');
            expect(failures[0].resolved).toBe('/workspace/node_modules/neo.mjs/src/Neo.mjs')
        });

        /**
         * The non-vacuity control for the arm above: the rewrite deliberately points third-party
         * packages back OUT of the output tree, so an existing target outside `dist/esm` must still
         * pass. A guard that failed this one would be a containment check wearing an identity label,
         * and it would break every workspace that imports a package.
         */
        test('a third-party package outside the output tree passes when it exists', () => {
            expect(transforms.findUnresolvableImports(
                [{
                    outputPath: '/workspace/dist/esm/apps/x/app.mjs',
                    specifiers: ['../../../../node_modules/some-lib/index.mjs']
                }],
                () => true,
                resolveReal)).toEqual([])
        });

        /** A package whose name merely starts with the engine's is somebody else's package. */
        test('a look-alike package name is not mistaken for the engine', () => {
            expect(transforms.findUnresolvableImports(
                [{
                    outputPath: '/workspace/dist/esm/apps/x/app.mjs',
                    specifiers: ['../../../../node_modules/neo.mjs-examples/index.mjs']
                }],
                () => true,
                resolveReal)).toEqual([])
        });

        /** The two classes are distinguishable downstream, because the build reports them apart. */
        test('a missing import is reported as missing, not as an identity failure', () => {
            const failures = transforms.findUnresolvableImports(
                [{outputPath: '/workspace/dist/esm/apps/x/app.mjs', specifiers: ['../../components/Button.mjs']}],
                () => false,
                resolveReal);

            expect(failures).toHaveLength(1);
            expect(failures[0].reason).toBe('missing')
        })
    });

    /**
     * The guard as first shipped could not exit 0 against the engine's own tree: Terser strips the
     * webpack magic comments that hid the lazy-loader families from `relativeSpecifiers`, so the
     * emitted specifier reaching the guard is literal text carrying an interpolation — a path no
     * filesystem can hold, reported as `missing`, on every real-engine build.
     *
     * Each arm here reds against that shipped code. The first two red because the old guard resolved
     * the interpolated text itself and reported `missing`; the third reds because the old guard
     * reported at all. The exemption these replace would have passed all three and checked nothing.
     *
     * @see https://github.com/neomjs/neo/issues/17942
     */
    test.describe('findUnresolvableImports — a computed specifier is judged by its prefix directory', () => {
        const resolveReal = (outputPath, specifier) => path.resolve(path.dirname(outputPath), specifier);

        test('the prefix directory is what gets resolved, and its presence passes', () => {
            expect(transforms.findUnresolvableImports(
                [{outputPath: '/w/dist/esm/src/worker/Data.mjs', specifiers: ['../data/parser/${t}.mjs']}],
                candidate => candidate === '/w/dist/esm/src/data/parser',
                resolveReal)).toEqual([])
        });

        /** The signal the exemption would have thrown away: a source root nothing copied. */
        test('an absent prefix directory fails as computed-root and resolves to the directory', () => {
            const failures = transforms.findUnresolvableImports(
                [{outputPath: '/w/dist/esm/src/worker/Data.mjs', specifiers: ['../data/parser/${t}.mjs']}],
                () => false,
                resolveReal);

            expect(failures).toHaveLength(1);
            expect(failures[0].reason).toBe('computed-root');
            expect(failures[0].specifier).toBe('../data/parser/${t}.mjs');
            expect(failures[0].resolved).toBe('/w/dist/esm/src/data/parser')
        });

        /**
         * `../../${path}/task.mjs` knows nothing beyond `../../`, so the guard must say nothing about
         * it. Pinned, because a later tightening that started resolving the interpolation would red
         * every workspace on a value only the runtime holds.
         */
        test('a specifier interpolated from its first segment is never reported', () => {
            expect(transforms.findUnresolvableImports(
                [{outputPath: '/w/dist/esm/src/worker/Task.mjs', specifiers: ['../../${path}/task.mjs']}],
                candidate => candidate === '/w/dist/esm',
                resolveReal)).toEqual([])
        });

        /**
         * Truncating to the prefix must not launder the two-graph defect: identity is checked on the
         * specifier as written, so a computed family reaching the workspace engine still fails as
         * `engine-identity` rather than passing on a directory that happens to exist.
         */
        test('a computed specifier addressing the workspace engine is still an identity failure', () => {
            const failures = transforms.findUnresolvableImports(
                [{
                    outputPath: '/w/dist/esm/apps/x/app.mjs',
                    specifiers: ['../../../node_modules/neo.mjs/src/main/addon/${name}.mjs']
                }],
                () => true,
                resolveReal);

            expect(failures).toHaveLength(1);
            expect(failures[0].reason).toBe('engine-identity')
        });

        test('a literal specifier keeps reporting as missing, so no path becomes exempt', () => {
            const failures = transforms.findUnresolvableImports(
                [{outputPath: '/w/dist/esm/src/f/u/HtmlTemplateProcessor.mjs', specifiers: ['../../../dist/parse5.mjs']}],
                () => false,
                resolveReal);

            expect(failures).toHaveLength(1);
            expect(failures[0].reason).toBe('missing')
        });

        test.describe('computedSpecifierRoot', () => {
            test('a literal specifier has no computed root', () => {
                expect(transforms.computedSpecifierRoot('../data/parser/json.mjs')).toBeNull()
            });

            test('the root ends at the last separator before the interpolation', () => {
                expect(transforms.computedSpecifierRoot('../data/parser/${t}.mjs')).toBe('../data/parser/')
            });

            /** A later segment must not widen the root a second interpolation already bounded. */
            test('only the first interpolation bounds the root', () => {
                expect(transforms.computedSpecifierRoot('../${a}/b/${c}.mjs')).toBe('../')
            })
        })
    })
});
