import fs                       from 'fs-extra';
import os                       from 'node:os';
import path                     from 'node:path';
import {test, expect}           from '@playwright/test';
import {createEsmBuildPlan}     from '../../../../../buildScripts/util/esmBuildGraph.mjs';
import {staticModuleSpecifiers} from '../../../../../buildScripts/util/esmDistTransforms.mjs';

test.describe('static ESM package graph boundaries', () => {
    let workspace, external, engine;
    const write = (file, content) => fs.outputFileSync(path.join(workspace, file), content),
          plan  = (packageRoots = []) => createEsmBuildPlan({workspaceRoot: workspace, engineRoot: engine,
              sourceRoots: ['apps', 'node_modules/neo.mjs/src'], packageRoots});

    test.beforeEach(() => {
        workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-graph-')));
        engine = path.join(workspace, 'node_modules/neo.mjs');
        write('node_modules/neo.mjs/src/core/Base.mjs', 'export default class Base {}');
        write('node_modules/widget/package.json', '{"name":"widget","type":"module"}');
        write('node_modules/widget/Widget.mjs', "import Base from '../neo.mjs/src/core/Base.mjs'; export default class Widget extends Base {}");
        write('apps/App.mjs', "import Widget from '../node_modules/widget/Widget.mjs'; export default Widget;")
    });
    test.afterEach(() => {
        fs.removeSync(workspace);
        external && fs.removeSync(external);
        external = null
    });

    test('runtime import expressions are not static discovery, including literal imports', () => {
        expect(staticModuleSpecifiers("import X from './X.mjs'; export {y} from './Y.mjs'; export * from './Z.mjs'; const prose = 'import q from missing'; import('./runtime.mjs'); import(`./${name}.mjs`);"))
            .toEqual(['./X.mjs', './Y.mjs', './Z.mjs'])
    });

    test('ships bundled Circle datasets and preserves an admitted workspace dataset', () => {
        const folder       = 'resources/examples/data/circles',
              group1       = folder + '/group1.json',
              group2       = folder + '/group2.json',
              photo        = folder + '/photo.svg',
              engineGroup1 = path.join(engine, group1),
              engineGroup2 = path.join(engine, group2);

        write('node_modules/neo.mjs/' + group1, '[]');
        write('node_modules/neo.mjs/' + group2, '[{}]');
        write('node_modules/neo.mjs/' + photo, '<svg/>');

        const native = createEsmBuildPlan({workspaceRoot: engine, engineRoot: engine, sourceRoots: ['src'], packageRoots: []});

        expect(native.files.get(engineGroup1)).toEqual({outputPath: path.join(engine, 'dist/esm', group1), type: 'asset'});
        expect(native.files.get(engineGroup2)).toEqual({outputPath: path.join(engine, 'dist/esm', group2), type: 'asset'});
        expect(native.files.has(path.join(engine, photo))).toBe(false);
        expect(plan().files.get(engineGroup1)).toEqual({outputPath: path.join(workspace, 'dist/esm', group1), type: 'asset'});

        write(group1, '[{"workspace":true}]');

        const {files} = createEsmBuildPlan({workspaceRoot: workspace, engineRoot: engine,
            sourceRoots: ['apps', 'node_modules/neo.mjs/src', 'resources'], packageRoots: []});

        expect(files.get(path.join(workspace, group1))).toEqual({outputPath: path.join(workspace, 'dist/esm', group1), type: 'json'});
        expect(files.has(engineGroup1)).toBe(false);
        expect(files.get(engineGroup2)).toEqual({outputPath: path.join(workspace, 'dist/esm', group2), type: 'asset'})
    });

    test('a missing reachable helper names its importer and specifier', () => {
        write('node_modules/widget/Widget.mjs', "import Base from '../neo.mjs/src/core/Base.mjs'; import './missing.mjs'; export default class Widget extends Base {}");
        expect(plan).toThrow(/node_modules\/widget\/Widget\.mjs.*\.\/missing\.mjs.*missing/)
    });

    test('an admitted package file linked outside its owner is refused at its importing edge', () => {
        const linked = path.join(workspace, 'node_modules/widget/Widget.mjs'),
              target = path.join(workspace, 'node_modules/loose/Outside.mjs');
        fs.outputFileSync(target, "export {default} from '../neo.mjs/src/core/Base.mjs';");
        fs.removeSync(linked);
        fs.symlinkSync(target, linked);
        expect(plan).toThrow('apps/App.mjs → ../node_modules/widget/Widget.mjs: module leaves its package through a link')
    });

    for (const specifier of ['neo.mjs/src/core/Base.mjs', '/node_modules/neo.mjs/src/core/Base.mjs']) {
        test(`an unrepresentable Engine edge is refused: ${specifier}`, () => {
            write('node_modules/widget/Widget.mjs', `import Base from ${JSON.stringify(specifier)}; export default class Widget extends Base {}`);
            expect(plan).toThrow(/node_modules\/widget\/Widget\.mjs.*no .*destination/)
        })
    }

    test('a differently named alias of the real Engine maps to its existing emitted file', () => {
        fs.symlinkSync(engine, path.join(workspace, 'node_modules/engine-alias'), 'junction');
        write('node_modules/widget/Widget.mjs', "import Base from '../engine-alias/src/core/Base.mjs'; export default class Widget extends Base {}");
        const files = plan().files, target = path.join(workspace, 'dist/esm/src/core/Base.mjs');
        expect(files.get(path.join(workspace, 'node_modules/engine-alias/src/core/Base.mjs')).outputPath).toBe(target);
        expect([...files.values()].filter(entry => entry.outputPath === target && entry.type !== 'reference')).toHaveLength(1);
        expect(files.has(path.join(workspace, 'node_modules/widget/Widget.mjs'))).toBe(true)
    });

    test('two logical aliases of an Engine-bearing package are refused', () => {
        fs.symlinkSync(path.join(workspace, 'node_modules/widget'), path.join(workspace, 'node_modules/alias'), 'junction');
        write('apps/App.mjs', "import A from '../node_modules/widget/Widget.mjs'; import B from '../node_modules/alias/Widget.mjs'; export {A, B};");
        expect(plan).toThrow(/ambiguous linked module aliases/)
    });

    test('a differently named second Engine installation cannot be classified as an ordinary library', () => {
        write('node_modules/another-engine/package.json', '{"name":"neo.mjs"}');
        write('node_modules/another-engine/src/core/Base.mjs', 'export default class OtherBase {}');
        write('node_modules/widget/Widget.mjs', "import Base from '../another-engine/src/core/Base.mjs'; export default class Widget extends Base {}");
        expect(plan).toThrow(/Widget\.mjs.*another-engine.*different Engine installation/)
    });

    test('a linked package cannot silently change its actual Engine peer', () => {
        external = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-peer-')));
        const logical = path.join(workspace, 'node_modules/widget'), real = path.join(external, 'node_modules/widget'),
              other   = path.join(external, 'node_modules/neo.mjs/src/core/Base.mjs');
        fs.moveSync(logical, real);
        fs.symlinkSync(real, logical, 'junction');
        fs.outputFileSync(other, 'export default class AnotherBase {}');
        expect(plan).toThrow(/Widget\.mjs.*neo\.mjs\/src\/core\/Base\.mjs.*peer graph differs/)
    });

    test('Main-only roots refuse outside-root helpers that reach the Engine', () => {
        write('apps/App.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
        write('node_modules/widget/main/Addon.mjs', "export {default} from '../outside/Helper.mjs';");
        write('node_modules/widget/outside/Helper.mjs', "export {default} from '../../neo.mjs/src/core/Base.mjs';");
        const relativeRoot = 'node_modules/widget/main';
        expect(() => plan([
            {key: 'mainAddons', relativeRoot, sourceRoot: path.join(workspace, relativeRoot), packageName: 'widget'}
        ])).toThrow(/node_modules\/widget\/main\/Addon\.mjs → \.\.\/outside\/Helper\.mjs:.*neo\.mainAddons/)
    });

    for (const reachesEngine of [false, true]) {
        test(`Main fallback classification follows module cycles, not package ownership (${reachesEngine})`, () => {
            write('apps/App.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
            write('node_modules/widget/main/Addon.mjs',
                "import Base from '../../neo.mjs/src/core/Base.mjs'; export * from '../outside/Helper.mjs'; export default Base;");
            write('node_modules/widget/outside/Helper.mjs', "export * from '../../other/Cycle.mjs';");
            write('node_modules/other/Cycle.mjs', "export * from '../widget/outside/Helper.mjs';" +
                (reachesEngine ? "export {default as Base} from '../neo.mjs/src/core/Base.mjs';" : 'export const value = 17;'));
            const relativeRoot = 'node_modules/widget/main', build = () => plan([
                {key: 'mainAddons', relativeRoot, sourceRoot: path.join(workspace, relativeRoot), packageName: 'widget'}
            ]);
            if (reachesEngine) {
                expect(build).toThrow(/main\/Addon\.mjs → \.\.\/outside\/Helper\.mjs:.*neo\.mainAddons/)
            } else {
                const files = build().files;
                expect(files.has(path.join(workspace, 'node_modules/widget/main/Addon.mjs'))).toBe(true);
                expect(files.has(path.join(workspace, 'node_modules/widget/outside/Helper.mjs'))).toBe(false);
                expect(files.has(path.join(workspace, 'node_modules/other/Cycle.mjs'))).toBe(false)
            }
        })
    }

    test('a Main fallback through a file alias cannot hide its Engine edge', () => {
        write('apps/App.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
        const addon = 'node_modules/widget/main/Addon.mjs', alias = 'node_modules/widget/outside/Addon.mjs';
        write(addon, "import '../outside/Addon.mjs'; export {default} from '../../neo.mjs/src/core/Base.mjs';");
        fs.ensureDirSync(path.dirname(path.join(workspace, alias)));
        fs.symlinkSync(path.join(workspace, addon), path.join(workspace, alias));
        const relativeRoot = 'node_modules/widget/main';
        expect(() => plan([{key: 'mainAddons', relativeRoot, sourceRoot: path.join(workspace, relativeRoot), packageName: 'widget'}]))
            .toThrow(/main\/Addon\.mjs → \.\.\/outside\/Addon\.mjs:.*neo\.mainAddons/)
    });

    test('a Main fallback follows an undeclared workspace helper chain', () => {
        write('apps/App.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
        write('node_modules/widget/main/Addon.mjs', "export {default} from '../../../helpers/First.mjs';");
        write('helpers/First.mjs', "export {default} from './Second.mjs';");
        write('helpers/Second.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
        const relativeRoot = 'node_modules/widget/main';
        expect(() => plan([{key: 'mainAddons', relativeRoot, sourceRoot: path.join(workspace, relativeRoot), packageName: 'widget'}]))
            .toThrow(/main\/Addon\.mjs → \.\.\/\.\.\/\.\.\/helpers\/First\.mjs:.*neo\.mainAddons/)
    });

    test('literalDynamicSpecifiers returns only non-computed ImportExpression specifiers', async () => {
        const {literalDynamicSpecifiers} = await import('../../../../../buildScripts/util/esmDistTransforms.mjs');
        expect(typeof literalDynamicSpecifiers).toBe('function');
        expect(literalDynamicSpecifiers(
            "import X from './X.mjs'; export {y} from './Y.mjs'; const prose = \"import('./prose.mjs')\"; import('./literal.mjs'); import(`./cooked.mjs`); import(`./${name}.mjs`); import(base + '.mjs'); import(0);"
        )).toEqual(['./literal.mjs', './cooked.mjs'])
    });

    test('declared roots refuse outside helpers whose literal dynamic imports reach the Engine', () => {
        write('apps/App.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
        write('node_modules/widget/outside/Helper.mjs', "export const load = () => import('../../neo.mjs/src/core/Base.mjs');");

        write('node_modules/widget/main/Addon.mjs', "export {load} from '../outside/Helper.mjs';");
        const mainRoot = 'node_modules/widget/main';
        expect(() => plan([{key: 'mainAddons', relativeRoot: mainRoot, sourceRoot: path.join(workspace, mainRoot), packageName: 'widget'}]))
            .toThrow(/main\/Addon\.mjs → \.\.\/outside\/Helper\.mjs:.*neo\.mainAddons/);

        write('node_modules/widget/canvas/Renderer.mjs', "export {load} from '../outside/Helper.mjs';");
        const canvasRoot = 'node_modules/widget/canvas';
        expect(() => plan([{key: 'canvasModules', relativeRoot: canvasRoot, sourceRoot: path.join(workspace, canvasRoot), packageName: 'widget'}]))
            .toThrow(/canvas\/Renderer\.mjs → \.\.\/outside\/Helper\.mjs:.*neo\.canvasModules/)
    });

    test("a declared root's own literal dynamic import refuses an outside helper that reaches the Engine without admitting ordinary or computed ones", () => {
        write('apps/App.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
        write('node_modules/widget/outside/Ordinary.mjs', 'export const value = 1;');
        write('node_modules/widget/outside/EngineHelper.mjs', "export {default} from '../../neo.mjs/src/core/Base.mjs';");
        write('node_modules/widget/main/Addon.mjs', [
            "export const load = () => import('../outside/Ordinary.mjs');",
            'export const dyn  = name => import(`../outside/${name}.mjs`);'
        ].join('\n'));

        const relativeRoot = 'node_modules/widget/main',
              roots        = [{key: 'mainAddons', relativeRoot, sourceRoot: path.join(workspace, relativeRoot), packageName: 'widget'}],
              {files}      = plan(roots);

        expect(files.has(path.join(workspace, 'node_modules/widget/outside/Ordinary.mjs'))).toBe(false);
        expect(files.has(path.join(workspace, 'node_modules/widget/outside/EngineHelper.mjs'))).toBe(false);

        const symlinkedEngine = path.join(workspace, 'node_modules/widget/node_modules/neo.mjs');
        fs.ensureDirSync(path.dirname(symlinkedEngine));
        fs.symlinkSync(engine, symlinkedEngine, 'junction');
        write('node_modules/widget/main/Addon.mjs', "export const load = () => import('../node_modules/neo.mjs/src/core/Base.mjs');");
        expect(plan(roots).files.has(path.join(symlinkedEngine, 'src/core/Base.mjs'))).toBe(false);

        write('node_modules/widget/outside/EngineHelper.mjs', "export {default} from '../node_modules/neo.mjs/src/core/Base.mjs';");
        write('node_modules/widget/main/Addon.mjs', "export const load = () => import('../outside/EngineHelper.mjs');");
        expect(() => plan(roots)).toThrow(/main\/Addon\.mjs → \.\.\/outside\/EngineHelper\.mjs:.*neo\.mainAddons/);

        write('node_modules/neo.mjs/lib/Lib.mjs', 'export const value = 2;');
        write('node_modules/widget/main/Addon.mjs', "export {value} from '../../neo.mjs/lib/Lib.mjs';");
        expect(() => plan(roots)).toThrow(/main\/Addon\.mjs → \.\.\/\.\.\/neo\.mjs\/lib\/Lib\.mjs:.*neo\.mainAddons/)
    })
});
