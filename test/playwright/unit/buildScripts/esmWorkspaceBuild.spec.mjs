import {spawnSync}     from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {pathToFileURL} from 'node:url';
import {test, expect}  from '@playwright/test';

/**
 * Drives the real `buildScripts/build/esmodules.mjs` over a synthetic greenfield workspace.
 *
 * The sibling spec pins the transforms in isolation; this one exists because every defect it covers
 * was a *composition* failure. Each transform looked reasonable on its own — the build finished, it
 * printed success, and it exited 0. What was broken was the relationship between what the build
 * copied and what the emitted code asked for, and only running the script end to end over a workspace
 * layout can observe that.
 *
 * The workspace shape is the one that broke: an app importing the engine from `node_modules/neo.mjs`
 * with house-style single quotes, plus a component library in a root-level tree outside the four
 * hardcoded roots.
 *
 * BOUNDS: this asserts the build produces a tree whose every import resolves. It does NOT boot the
 * output; `e2e/core/DistEsmWorkspaceBoot.spec.mjs` builds the packed engine and boots what it emits.
 *
 * @see https://github.com/neomjs/neo/issues/17921
 */
test.describe('esmodules.mjs — a greenfield workspace build', () => {
    const
        engineRoot = path.resolve(import.meta.dirname, '../../../..'),
        buildPath  = path.join(engineRoot, 'buildScripts/build/esmodules.mjs');

    let workspace, external;

    /**
     * Writes the minimum workspace that reproduces the shipped failure. The engine copy is a stub
     * rather than the real `src/`: the defect is about path arithmetic and copy sets, so a real
     * engine would add minutes of Terser work without adding a single observation.
     */
    const createWorkspace = ({computedFamily, declareExtraRoot, engineReExport, sourceRoots}) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-ws-'));

        fs.outputJsonSync(path.join(root, 'package.json'), {
            name   : 'my-workspace',
            version: '1.0.0',
            ...(sourceRoots ? {neo: {esmSourceRoots: sourceRoots}} : {}),
            ...(declareExtraRoot ? {neo: {esmSourceRoots: ['components']}} : {})
        });

        // A re-export of the engine. The rewrite matched `import` only, so this specifier used to
        // survive into the output and address the workspace's own engine from inside dist/esm.
        if (engineReExport) {
            fs.outputFileSync(path.join(root, 'components/engine.mjs'),
                "export {default as Base} from '../node_modules/neo.mjs/src/core/Base.mjs';\n")
        }

        // A lazily-loaded family whose directory the output tree does not have. The module itself is
        // emitted and every literal specifier in it resolves; only the interpolated root is absent,
        // which is the shape the engine's own optional branches take (`examples/`, `docs/app/`, `WS/`
        // addons) and which no consuming workspace can supply.
        if (computedFamily) {
            fs.outputFileSync(path.join(root, 'components/Lazy.mjs'),
                'export const load = name => import(`../plugins/${name}.mjs`);\n')
        }

        // The engine, as a workspace consumes it.
        fs.outputFileSync(path.join(root, 'node_modules/neo.mjs/src/core/Base.mjs'),
            'export default class Base {}\n');

        // The component library that lives outside the four hardcoded roots.
        fs.outputFileSync(path.join(root, 'components/Button.mjs'),
            "import Base from '../node_modules/neo.mjs/src/core/Base.mjs';\nexport default class Button extends Base {}\n");

        // The app. Single-quoted, which is the house style the rewrite used not to match.
        fs.outputFileSync(path.join(root, 'apps/myapp/view/Viewport.mjs'),
            "import Base   from '../../../node_modules/neo.mjs/src/core/Base.mjs';\n" +
            "import Button from '../../../components/Button.mjs';\n" +
            'export default class Viewport extends Base {static button = Button}\n');

        fs.outputJsonSync(path.join(root, 'apps/myapp/neo-config.json'), {
            appPath : '../../apps/myapp/app.mjs',
            basePath: '../../'
        });

        return root
    };

    /**
     * Runs the build in the workspace, returning `{status, output}` rather than throwing.
     *
     * Both streams, on every exit code. The previous shape returned `execFileSync`'s stdout when the
     * build succeeded and only reached stderr through the throw path — which made a diagnostic that
     * does NOT fail the build unobservable to a spec, exactly the shape of the warning arm below.
     */
    const runBuild = cwd => {
        const {status, stdout, stderr} = spawnSync('node', [buildPath], {cwd, encoding: 'utf8'});

        return {status, output: `${stdout || ''}${stderr || ''}`}
    };

    test.afterEach(() => {
        workspace && fs.removeSync(workspace);
        external && fs.removeSync(external);
        workspace = external = null
    });

    test('browser parser imports retain their engine-owned bundles in consumer output', async () => {
        workspace = createWorkspace({declareExtraRoot: true});

        // Exercise the real import addresses at both source depths. View lifecycle is outside
        // this build fixture; the exported function observes the parser the emitted import loads.
        for (const file of ['src/component/Markdown.mjs', 'src/app/content/Component.mjs']) {
            const source    = fs.readFileSync(path.join(engineRoot, file), 'utf8'),
                  statement = source.match(/^import\s+\{marked\}.*$/m)?.[0];

            expect(statement).toBeTruthy();
            fs.outputFileSync(path.join(workspace, 'node_modules/neo.mjs', file),
                `${statement}\nexport const render = input => marked.parse(input);\n`)
        }

        expect(fs.existsSync(path.join(workspace, 'dist/marked.mjs'))).toBe(false);

        const {status, output} = runBuild(workspace);

        expect(status, output).toBe(0);

        for (const file of ['src/component/Markdown.mjs', 'src/app/content/Component.mjs']) {
            const {render} = await import(pathToFileURL(path.join(workspace, 'dist/esm', file)).href);

            expect(render('**consumer**')).toBe('<p><strong>consumer</strong></p>\n')
        }

        for (const name of ['marked', 'parse5']) {
            expect(fs.readFileSync(path.join(workspace, `dist/esm/dist/${name}.mjs`)))
                .toEqual(fs.readFileSync(path.join(engineRoot, `dist/${name}.mjs`)))
        }
    });

    test('dereferences symlinked engine browser bundles so emitted dist/esm/dist files stay regular files', async () => {
        workspace = createWorkspace({declareExtraRoot: true});
        external  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-worktree-'));

        const realDist     = path.join(external, 'real-engine/dist'),
              worktreeRoot = path.join(external, 'worktree');

        fs.copySync(path.join(engineRoot, 'buildScripts'), path.join(worktreeRoot, 'buildScripts'));
        fs.symlinkSync(path.join(engineRoot, 'node_modules'), path.join(worktreeRoot, 'node_modules'), 'dir');
        fs.symlinkSync(path.join(engineRoot, 'src'), path.join(worktreeRoot, 'src'), 'dir');

        for (const name of ['marked', 'parse5']) {
            const realBundle = path.join(realDist, `${name}.mjs`),
                  linkBundle = path.join(worktreeRoot, 'dist', `${name}.mjs`);

            fs.copySync(path.join(engineRoot, `dist/${name}.mjs`), realBundle, {dereference: true});
            fs.ensureDirSync(path.dirname(linkBundle));
            fs.symlinkSync(path.relative(path.dirname(linkBundle), realBundle), linkBundle);

            expect(fs.lstatSync(linkBundle).isSymbolicLink()).toBe(true);
            expect(fs.existsSync(linkBundle)).toBe(true)
        }

        for (const file of ['src/component/Markdown.mjs', 'src/app/content/Component.mjs']) {
            const source    = fs.readFileSync(path.join(engineRoot, file), 'utf8'),
                  statement = source.match(/^import\s+\{marked\}.*$/m)?.[0];

            expect(statement).toBeTruthy();
            fs.outputFileSync(path.join(workspace, 'node_modules/neo.mjs', file),
                `${statement}\nexport const render = input => marked.parse(input);\n`)
        }

        const {status, stdout, stderr} = spawnSync(
            'node',
            [path.join(worktreeRoot, 'buildScripts/build/esmodules.mjs')],
            {cwd: workspace, encoding: 'utf8'}
        );

        expect(status, `${stdout || ''}${stderr || ''}`).toBe(0);

        for (const name of ['marked', 'parse5']) {
            const emittedBundle = path.join(workspace, `dist/esm/dist/${name}.mjs`);

            expect(fs.lstatSync(emittedBundle).isSymbolicLink()).toBe(false);
            expect(fs.lstatSync(emittedBundle).isFile()).toBe(true);
            expect(fs.readFileSync(emittedBundle))
                .toEqual(fs.readFileSync(path.join(engineRoot, `dist/${name}.mjs`)))
        }

        for (const file of ['src/component/Markdown.mjs', 'src/app/content/Component.mjs']) {
            const {render} = await import(pathToFileURL(path.join(workspace, 'dist/esm', file)).href);

            expect(render('**worktree**')).toBe('<p><strong>worktree</strong></p>\n')
        }
    });

    test('a configured workspace builds a tree whose every import resolves', () => {
        workspace = createWorkspace({declareExtraRoot: true});

        const {status, output} = runBuild(workspace);

        expect(status, `build failed:\n${output}`).toBe(0);

        // The extra root was copied at all — the silent-drop defect.
        expect(fs.existsSync(path.join(workspace, 'dist/esm/components/Button.mjs'))).toBe(true);

        // The engine was flattened out of node_modules, and the app's single-quoted specifier was
        // rewritten to reach it. Asserted through the emitted code, which is what the browser reads.
        const emitted = fs.readFileSync(path.join(workspace, 'dist/esm/apps/myapp/view/Viewport.mjs'), 'utf8');

        expect(emitted).not.toContain('node_modules');
        expect(fs.existsSync(path.join(workspace, 'dist/esm/src/core/Base.mjs'))).toBe(true);

        // The config's relative basePath still gains the output-tree offset.
        expect(fs.readJsonSync(path.join(workspace, 'dist/esm/apps/myapp/neo-config.json')).basePath)
            .toBe('../../../../')
    });

    test('an ordinary library file linked outside its package retains its host import', async () => {
        workspace = fs.realpathSync(createWorkspace({declareExtraRoot: true}));
        external = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-ordinary-link-')));
        const library      = path.join(external, 'Library.mjs'),
              slot         = path.join(workspace, 'node_modules/plain'),
              viewportPath = 'apps/myapp/view/Viewport.mjs';
        fs.outputFileSync(library, 'export const shared = {value: 17}; export const moduleUrl = import.meta.url;\n');
        fs.ensureDirSync(slot);
        fs.outputJsonSync(path.join(slot, 'package.json'), {name: 'plain', version: '1.0.0', type: 'module'});
        fs.symlinkSync(library, path.join(slot, 'index.mjs'));
        const manifest = fs.readJsonSync(path.join(workspace, 'package.json'));
        fs.outputJsonSync(path.join(workspace, 'package.json'), {...manifest, dependencies: {plain: '1.0.0'}});
        fs.outputFileSync(path.join(workspace, viewportPath), [
            "import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';",
            "import * as library from '../../../node_modules/plain/index.mjs';",
            'export default class Viewport extends Base {static library = library}', ''
        ].join('\n'));
        const source           = (await import(pathToFileURL(path.join(workspace, viewportPath)).href)).default,
              {status, output} = runBuild(workspace);
        expect(status, output).toBe(0);
        const emitted = (await import(pathToFileURL(path.join(workspace, 'dist/esm', viewportPath)).href)).default;
        expect(emitted.library).toBe(source.library);
        expect(emitted.library.shared.value).toBe(17);
        expect(emitted.library.moduleUrl).toBe(pathToFileURL(library).href);
        expect(fs.existsSync(path.join(workspace, 'dist/esm/node_modules/plain'))).toBe(false)
    });

    for (const mode of ['undeclared', 'declared', 'ordinary']) {
        test(`Main outside-root helpers preserve Engine identity (${mode})`, async () => {
            workspace = fs.realpathSync(createWorkspace({declareExtraRoot: true}));
            const write    = (file, content) => fs.outputFileSync(path.join(workspace, file), content),
                  manifest = fs.readJsonSync(path.join(workspace, 'package.json')),
                  addon    = 'node_modules/widget/main/Addon.mjs', helper = 'node_modules/widget/outside/Helper.mjs';
            fs.outputJsonSync(path.join(workspace, 'package.json'), {...manifest, dependencies: {widget: '1.0.0'}});
            fs.outputJsonSync(path.join(workspace, 'node_modules/widget/package.json'), {
                name: 'widget', version: '1.0.0', neo: {mainAddons: mode === 'declared' ? ['main', 'outside'] : ['main']}
            });
            write('node_modules/neo.mjs/src/core/Base.mjs', 'export default class Base {static engineUrl = import.meta.url}');
            write(addon, "export {default} from '../outside/Helper.mjs';");
            write(helper, mode === 'ordinary' ? 'export default {value: 17, moduleUrl: import.meta.url};'
                : "export {default} from '../../neo.mjs/src/core/Base.mjs';");
            const {status, output} = runBuild(workspace);
            if (mode === 'undeclared') {
                expect(status, output).toBe(1);
                expect(output).toContain(`${addon} → ../outside/Helper.mjs`);
                expect(output).toContain('neo.mainAddons');
                expect(fs.existsSync(path.join(workspace, 'dist/esm', helper))).toBe(false);
                return
            }
            expect(status, output).toBe(0);
            const emitted = (await import(pathToFileURL(path.join(workspace, 'dist/esm', addon)).href)).default;
            if (mode === 'declared') {
                const base = (await import(pathToFileURL(path.join(workspace, 'dist/esm/src/core/Base.mjs')).href)).default;
                expect(emitted).toBe(base);
                expect(emitted.engineUrl).toBe(pathToFileURL(path.join(workspace, 'dist/esm/src/core/Base.mjs')).href);
                expect(fs.existsSync(path.join(workspace, 'dist/esm', helper))).toBe(true)
            } else {
                const source = (await import(pathToFileURL(path.join(workspace, helper)).href)).default;
                expect(emitted).toBe(source);
                expect(emitted.value).toBe(17);
                expect(emitted.moduleUrl).toBe(pathToFileURL(path.join(workspace, helper)).href);
                expect(fs.existsSync(path.join(workspace, 'dist/esm', helper))).toBe(false)
            }
        })
    }

    /**
     * Writes a workspace whose `widget` dependency declares `canvas` under `neo.canvasModules`, beside an `other`
     * dependency that ships the same tree without declaring it.
     * @param {Object<String, String>} widgetFiles Package-relative file → content, added to `widget`
     * @returns {String} The workspace root
     */
    const createCanvasWorkspace = widgetFiles => {
        const root     = fs.realpathSync(createWorkspace({declareExtraRoot: true})),
              write    = (file, content) => fs.outputFileSync(path.join(root, file), content),
              manifest = fs.readJsonSync(path.join(root, 'package.json'));

        fs.outputJsonSync(path.join(root, 'package.json'), {...manifest, dependencies: {other: '1.0.0', widget: '1.0.0'}});
        fs.outputJsonSync(path.join(root, 'node_modules/widget/package.json'), {name: 'widget', version: '1.0.0', neo: {canvasModules: ['canvas']}});
        fs.outputJsonSync(path.join(root, 'node_modules/other/package.json'), {name: 'other', version: '1.0.0'});
        write('node_modules/neo.mjs/src/core/Base.mjs', 'export default class Base {static engineUrl = import.meta.url}');
        write('node_modules/other/canvas/Renderer.mjs', "import Base from '../../neo.mjs/src/core/Base.mjs';\nexport default class Renderer extends Base {}");
        Object.entries(widgetFiles).forEach(([file, content]) => write(path.join('node_modules/widget', file), content));
        return root
    };

    test('the emitted Canvas worker loads a declared package module on the one Engine graph', async () => {
        // The stub worker carries the real worker's package import, so the build rewrites what the Engine ships
        const packageImport = '`../../../${path.slice(13)}.mjs`';

        expect(fs.readFileSync(path.join(engineRoot, 'src/worker/Canvas.mjs'), 'utf8'), 'the real worker still imports this way')
            .toContain(packageImport);

        workspace = createCanvasWorkspace({
            'canvas/Renderer.mjs': "import Base from '../../neo.mjs/src/core/Base.mjs';\nexport default class Renderer extends Base {}"
        });
        fs.outputFileSync(path.join(workspace, 'node_modules/neo.mjs/src/worker/Canvas.mjs'),
            `export const loadModule = path => import(${packageImport});\n`);

        const {status, output} = runBuild(workspace);

        expect(status, output).toBe(0);

        const emitted = path.join(workspace, 'dist/esm/node_modules/widget/canvas/Renderer.mjs'),
              base    = (await import(pathToFileURL(path.join(workspace, 'dist/esm/src/core/Base.mjs')).href)).default,
              worker  = await import(pathToFileURL(path.join(workspace, 'dist/esm/src/worker/Canvas.mjs')).href),
              loaded  = await worker.loadModule('node_modules/widget/canvas/Renderer');

        expect(fs.existsSync(emitted), 'the declared root is emitted').toBe(true);
        expect(loaded, 'the worker loads the emitted copy').toBe(await import(pathToFileURL(emitted).href));
        expect(Object.getPrototypeOf(loaded.default), 'which extends the emitted Engine').toBe(base);
        expect(fs.existsSync(path.join(workspace, 'dist/esm/node_modules/other')), 'an undeclared package stays out').toBe(false)
    });

    test('a Canvas module root refuses an outside-root helper that reaches the Engine, naming its own key', () => {
        workspace = createCanvasWorkspace({
            'canvas/Renderer.mjs': "export {default} from '../shared/Helper.mjs';",
            'shared/Helper.mjs'  : "import Base from '../../neo.mjs/src/core/Base.mjs';\nexport default class Helper extends Base {}"
        });

        const {status, output} = runBuild(workspace);

        expect(status, output).toBe(1);
        expect(output).toContain('node_modules/widget/canvas/Renderer.mjs → ../shared/Helper.mjs');
        expect(output).toContain('neo.canvasModules');
        expect(output).not.toContain('neo.mainAddons')
    });

    test('a Main addon root refuses an outside-root helper whose literal dynamic import reaches the Engine', () => {
        workspace = fs.realpathSync(createWorkspace({declareExtraRoot: true}));
        const write    = (file, content) => fs.outputFileSync(path.join(workspace, file), content),
              manifest = fs.readJsonSync(path.join(workspace, 'package.json'));

        fs.outputJsonSync(path.join(workspace, 'package.json'), {...manifest, dependencies: {widget: '1.0.0'}});
        fs.outputJsonSync(path.join(workspace, 'node_modules/widget/package.json'), {
            name: 'widget', version: '1.0.0', neo: {mainAddons: ['main']}
        });
        write('node_modules/neo.mjs/src/core/Base.mjs', 'export default class Base {static engineUrl = import.meta.url}');
        write('node_modules/widget/main/Addon.mjs', "export {load} from '../outside/Helper.mjs';");
        write('node_modules/widget/outside/Helper.mjs', "export const load = () => import('../../neo.mjs/src/core/Base.mjs');");

        const {status, output} = runBuild(workspace);

        expect(status, output).toBe(1);
        expect(output).toContain('node_modules/widget/main/Addon.mjs → ../outside/Helper.mjs');
        expect(output).toContain('neo.mainAddons');
        expect(fs.existsSync(path.join(workspace, 'dist/esm/node_modules/widget/outside/Helper.mjs'))).toBe(false)
    });

    test('a Canvas module root refuses an outside-root helper whose literal dynamic import reaches the Engine, naming its own key', () => {
        workspace = createCanvasWorkspace({
            'canvas/Renderer.mjs': "export {load} from '../outside/Helper.mjs';",
            'outside/Helper.mjs' : "export const load = () => import('../../neo.mjs/src/core/Base.mjs');"
        });

        const {status, output} = runBuild(workspace);

        expect(status, output).toBe(1);
        expect(output).toContain('node_modules/widget/canvas/Renderer.mjs → ../outside/Helper.mjs');
        expect(output).toContain('neo.canvasModules');
        expect(output).not.toContain('neo.mainAddons')
    });

    test("a declared root's own literal dynamic import refuses an outside-root helper that reaches the Engine while preserving ordinary and computed dynamic imports", async () => {
        workspace = fs.realpathSync(createWorkspace({declareExtraRoot: true}));
        const write    = (file, content) => fs.outputFileSync(path.join(workspace, file), content),
              manifest = fs.readJsonSync(path.join(workspace, 'package.json'));

        fs.outputJsonSync(path.join(workspace, 'package.json'), {...manifest, dependencies: {widget: '1.0.0'}});
        fs.outputJsonSync(path.join(workspace, 'node_modules/widget/package.json'), {
            name: 'widget', version: '1.0.0', neo: {mainAddons: ['main']}
        });
        write('node_modules/neo.mjs/src/core/Base.mjs', 'export default class Base {static engineUrl = import.meta.url}');
        write('node_modules/widget/outside/Ordinary.mjs', 'export default {value: 17, moduleUrl: import.meta.url};');
        write('node_modules/widget/outside/EngineHelper.mjs', "export {default} from '../../neo.mjs/src/core/Base.mjs';");
        write('node_modules/widget/main/Addon.mjs', [
            "export const loadOrdinary = () => import('../outside/Ordinary.mjs');",
            'export const loadComputed = name => import(`../outside/${name}.mjs`);',
            'export const loadExpr     = spec => import(spec);'
        ].join('\n'));

        const green = runBuild(workspace);
        expect(green.status, green.output).toBe(0);
        expect(fs.existsSync(path.join(workspace, 'dist/esm/node_modules/widget/outside'))).toBe(false);

        const emitted = await import(pathToFileURL(path.join(workspace, 'dist/esm/node_modules/widget/main/Addon.mjs')).href);
        expect((await emitted.loadOrdinary()).default).toEqual({
            value    : 17,
            moduleUrl: pathToFileURL(path.join(workspace, 'node_modules/widget/outside/Ordinary.mjs')).href
        });
        expect((await emitted.loadComputed('Ordinary')).default.value).toBe(17);

        const symlinkedEngine = path.join(workspace, 'node_modules/widget/node_modules/neo.mjs');
        fs.ensureDirSync(path.dirname(symlinkedEngine));
        fs.symlinkSync(path.join(workspace, 'node_modules/neo.mjs'), symlinkedEngine, 'junction');
        write('node_modules/widget/main/Addon.mjs', "export const loadAlias = () => import('../node_modules/neo.mjs/src/core/Base.mjs');");
        fs.removeSync(path.join(workspace, 'dist/esm'));

        const aliasRed = runBuild(workspace);
        expect(aliasRed.status, aliasRed.output).toBe(1);
        expect(aliasRed.output).toContain('still address the workspace engine at node_modules/neo.mjs');

        write('node_modules/widget/main/Addon.mjs', "export const load = () => import('../outside/EngineHelper.mjs');");
        fs.removeSync(path.join(workspace, 'dist/esm'));

        const red = runBuild(workspace);
        expect(red.status, red.output).toBe(1);
        expect(red.output).toContain('node_modules/widget/main/Addon.mjs → ../outside/EngineHelper.mjs');
        expect(red.output).toContain('neo.mainAddons');

        fs.outputJsonSync(path.join(workspace, 'package.json'), {
            ...manifest, dependencies: {widget: '1.0.0'}, neo: {esmSourceRoots: ['components', 'lib']}
        });
        write('lib/Lib.mjs', "export const from = 'workspace';");
        write('node_modules/neo.mjs/lib/Lib.mjs', "export const from = 'engine';");
        write('node_modules/widget/main/Addon.mjs', "export {from} from '../../neo.mjs/lib/Lib.mjs';");
        fs.removeSync(path.join(workspace, 'dist/esm'));

        const staticEngineRed = runBuild(workspace);
        expect(staticEngineRed.status, staticEngineRed.output).toBe(1);
        expect(staticEngineRed.output).toContain('node_modules/widget/main/Addon.mjs → ../../neo.mjs/lib/Lib.mjs');
        expect(staticEngineRed.output).toContain('neo.mainAddons')
    });

    for (const linked of [false, true]) {
        test(`static package classes share the emitted Engine graph (${linked ? 'linked' : 'installed'})`, async () => {
            workspace = fs.realpathSync(createWorkspace({declareExtraRoot: true}));
            const manifest = fs.readJsonSync(path.join(workspace, 'package.json')),
                  engine   = path.join(workspace, 'node_modules/neo.mjs'),
                  write    = (file, content) => fs.outputFileSync(path.join(workspace, file), content);
            fs.outputJsonSync(path.join(workspace, 'package.json'), {...manifest, type: 'module', dependencies: {
                'neo.mjs'        : '0.0.0', '@fixture/widgets': '1.0.0', '@fixture/adapter': '1.0.0',
                '@fixture/helper': '1.0.0', '@fixture/unrelated': '1.0.0', 'plain-library': '1.0.0'
            }});
            fs.outputJsonSync(path.join(engine, 'package.json'), {name: 'neo.mjs', version: '0.0.0', type: 'module'});
            write('node_modules/neo.mjs/src/core/Base.mjs',
                'export default class Base {static engineUrl = import.meta.url}\n');
            for (const name of ['widgets', 'adapter', 'helper', 'unrelated']) {
                fs.outputJsonSync(path.join(workspace, `node_modules/@fixture/${name}/package.json`), {
                    name: `@fixture/${name}`, version: '1.0.0', type: 'module', peerDependencies: {'neo.mjs': '0.0.0'},
                    ...(name === 'widgets' ? {neo: {mainAddons: ['src/native']}} : {})
                })
            }
            write('node_modules/@fixture/widgets/src/index.mjs', "export {default} from './Widget.mjs';\n");
            write('node_modules/@fixture/widgets/src/Widget.mjs', [
                "import Base from '../../../neo.mjs/src/core/Base.mjs';",
                "import {read} from './helper.mjs';",
                "import {state} from './state.mjs';",
                "import {sharedState} from '../../helper/src/Helper.mjs';",
                "import {CoreBase} from './native/Shared.mjs';",
                'export default class Widget extends Base {static label = read()(); static state = state; static shared = state === sharedState; static nativeBase = CoreBase}', ''
            ].join('\n'));
            write('node_modules/@fixture/widgets/src/helper.mjs',
                "import {cycle} from './cycle.mjs'; import {label} from './data.js'; export {label}; export const read = () => cycle;\n");
            write('node_modules/@fixture/widgets/src/cycle.mjs',
                "import {label} from './helper.mjs'; export const cycle = () => label;\n");
            write('node_modules/@fixture/widgets/src/data.js',
                "import data from './neo-config.json' with {type: 'json'}; export const label = data.label;\n");
            write('node_modules/@fixture/widgets/src/neo-config.json', '{"label":"package"}');
            write('node_modules/@fixture/widgets/src/state.mjs', 'export const state = {};\n');
            write('node_modules/@fixture/helper/src/Helper.mjs',
                "export {state as sharedState} from '../../widgets/src/state.mjs';\n");
            write('node_modules/@fixture/widgets/src/native/Shared.mjs',
                "export {default as CoreBase} from '../../../../neo.mjs/src/core/Base.mjs';\n");
            write('node_modules/@fixture/widgets/src/native/Addon.mjs',
                "import Base from '../../../../neo.mjs/src/core/Base.mjs'; import {state} from '../state.mjs'; export default class Addon extends Base {static state = state}\n");
            write('node_modules/@fixture/widgets/unreachable.mjs', "import './not-installed.mjs';\n");
            write('node_modules/@fixture/adapter/src/index.mjs',
                "export {default} from '../../widgets/src/index.mjs'; export {value} from './local.mjs';\n");
            write('node_modules/@fixture/adapter/src/local.mjs', "export const value = 'adapter';\n");
            write('node_modules/@fixture/unrelated/Unused.mjs',
                "export {default} from '../../neo.mjs/src/core/Base.mjs';\n");
            write('node_modules/plain-library/index.mjs', "export const value = 'ordinary';\n");
            write('components/Again.mjs', "export {default} from '../node_modules/@fixture/widgets/src/Widget.mjs';\n");
            write('apps/myapp/view/Viewport.mjs', [
                "import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';",
                "import Widget from '../../../node_modules/@fixture/adapter/src/index.mjs';",
                "import {value} from '../../../node_modules/plain-library/index.mjs';",
                'export default class Viewport extends Base {static widget = Widget; static ordinary = value}', ''
            ].join('\n'));

            if (linked) {
                external = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-package-store-')));
                const physical = {};
                for (const name of ['widgets', 'adapter', 'helper']) {
                    const logical = path.join(workspace, 'node_modules/@fixture', name),
                          real    = physical[name] = path.join(external, `${name}@1.0.0/node_modules/@fixture`, name);
                    fs.moveSync(logical, real);
                    fs.symlinkSync(real, logical, 'junction');
                    fs.symlinkSync(engine, path.resolve(real, '../../neo.mjs'), 'junction')
                }
                // Supply the linked package's real peer graph, as the package manager would.
                fs.symlinkSync(physical.widgets, path.join(path.dirname(physical.adapter), 'widgets'), 'junction');
                fs.symlinkSync(physical.widgets, path.join(path.dirname(physical.helper), 'widgets'), 'junction');
                fs.symlinkSync(physical.helper, path.join(path.dirname(physical.widgets), 'helper'), 'junction')
            }

            const viewportPath = 'apps/myapp/view/Viewport.mjs',
                  source       = (await import(pathToFileURL(path.join(workspace, viewportPath)).href)).default;
            expect(source.widget.engineUrl).toBe(source.engineUrl);
            expect(source.widget.shared).toBe(true);
            const {status, output} = runBuild(workspace);
            expect(status, output).toBe(0);

            const emitted = (await import(pathToFileURL(path.join(workspace, 'dist/esm', viewportPath)).href)).default;
            expect(emitted.widget.engineUrl).toBe(emitted.engineUrl);
            expect(emitted.engineUrl).toBe(pathToFileURL(path.join(workspace, 'dist/esm/src/core/Base.mjs')).href);
            expect(emitted.widget.label).toBe('package');
            expect(emitted.widget.shared).toBe(true);
            expect(emitted.widget.nativeBase).toBe(Object.getPrototypeOf(emitted));
            expect(emitted.ordinary).toBe('ordinary');
            const addon = (await import(pathToFileURL(path.join(workspace,
                'dist/esm/node_modules/@fixture/widgets/src/native/Addon.mjs')).href)).default;
            expect(addon.engineUrl).toBe(emitted.engineUrl);
            expect(addon.state).toBe(emitted.widget.state);
            const copied = [
                'widgets/src/index.mjs', 'widgets/src/Widget.mjs', 'widgets/src/helper.mjs',
                'widgets/src/cycle.mjs', 'widgets/src/data.js', 'widgets/src/neo-config.json', 'widgets/src/state.mjs',
                'widgets/src/native/Shared.mjs', 'widgets/src/native/Addon.mjs',
                'adapter/src/index.mjs', 'adapter/src/local.mjs', 'helper/src/Helper.mjs'
            ];
            for (const file of copied) {
                const target = path.join(workspace, 'dist/esm/node_modules/@fixture', file);
                expect(fs.existsSync(target), file).toBe(true);
                const kind = file.endsWith('.json') ? 'JSON' : 'JS';
                expect(output.split('\n').filter(line => line === `Minified ${kind}: ${target}`)).toHaveLength(1);
                if (linked) expect(fs.readFileSync(target, 'utf8')).not.toContain(external)
            }
            for (const file of ['@fixture/widgets/unreachable.mjs', '@fixture/unrelated', 'plain-library']) {
                expect(fs.existsSync(path.join(workspace, 'dist/esm/node_modules', file)), file).toBe(false)
            }
        })
    }

    /**
     * The decisive arm. Before this change the same workspace built "successfully" and exited 0 while
     * emitting an app that imports a component tree nobody copied — the app worker then died on
     * `Failed to fetch dynamically imported module`, with nothing in the build output to explain it.
     */
    test('an undeclared source root fails the build and names the file and specifier', () => {
        workspace = createWorkspace({declareExtraRoot: false});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have failed, output:\n${output}`).toBe(1);
        expect(output).toContain('do not resolve inside the output tree');
        expect(output).toContain('apps/myapp/view/Viewport.mjs');
        expect(output).toContain('components/Button.mjs');
        expect(output).toContain('neo.esmSourceRoots')
    });

    /**
     * The counterpart arm, and the reason the two are worth reading together: an absent directory is
     * a defect when a LITERAL specifier names it (above) and merely a diagnostic when only a computed
     * family reads it (here). This stage cannot tell an uncopied source root from a branch the
     * workspace never takes, and inside this repository the second reading never applies — every
     * default root exists — so the arm shipped fatal and no build here ever noticed. Every consuming
     * workspace failed on it.
     */
    test('a computed family whose root is absent warns and leaves the build green', () => {
        workspace = createWorkspace({computedFamily: true, declareExtraRoot: true});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have stayed green, output:\n${output}`).toBe(0);

        // The diagnostic still reaches the developer, naming the module and the absent directory.
        expect(output).toContain('computed import(s) read from a directory the output tree does not have');
        expect(output).toContain('components/Lazy.mjs');

        // Both readings are offered. Asserting the wording is the point: the old text asserted the
        // uncopied-root reading as fact, which is what made a warning look like a build error.
        expect(output).toContain('the branch that reads it is one this workspace never takes');

        // Non-vacuity: the module carrying the computed specifier was really emitted, so the arm
        // cannot pass by the build having skipped the file altogether.
        expect(fs.existsSync(path.join(workspace, 'dist/esm/components/Lazy.mjs'))).toBe(true)
    });

    /**
     * The third arm's exit gate, pinned end to end because narrowing `computed-root` narrowed the
     * expression all three share. `esmDistTransforms.spec.mjs` proves `findUnresolvableImports`
     * still CLASSIFIES this as `engine-identity`; only a real build proves the classification still
     * reaches `process.exit(1)`.
     *
     * The specifier is deliberately root-relative rather than a shape house style produces. The
     * rewrite drops the `node_modules/neo.mjs/` segment only from a specifier containing it with a
     * leading slash; without one it takes the other branch, gains `../../`, and arrives in the output
     * tree still addressing the workspace's own engine. Contrived as authorship, exact as a probe:
     * the point is a surviving engine-identity residual, and this is the cheapest way to get one.
     */
    test('an emitted specifier that still reaches the workspace engine fails the build', () => {
        workspace = createWorkspace({declareExtraRoot: true});

        fs.outputFileSync(path.join(workspace, 'components/Second.mjs'),
            "export {default} from 'node_modules/neo.mjs/src/core/Base.mjs';\n");

        const {status, output} = runBuild(workspace);

        expect(status, `build should have failed, output:\n${output}`).toBe(1);
        expect(output).toContain('still address the workspace engine at node_modules/neo.mjs');
        expect(output).toContain('two engine graphs cannot share a class registry')
    });

    /**
     * The identity arm's counterpart, run the way `neomjs/pages` deploys: the engine package builds
     * itself with its own `node_modules/neo.mjs` directory as the root. Every absolute path in that tree
     * contains the segment identity looks for, so a guard reading absolute paths failed every import.
     */
    test('an engine built inside node_modules/neo.mjs builds its own tree', async () => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-inplace-'));

        const engine = path.join(workspace, 'node_modules/neo.mjs');

        fs.outputJsonSync(path.join(engine, 'package.json'), {name: 'neo.mjs', version: '0.0.0'});
        fs.outputFileSync(path.join(engine, 'src/core/Base.mjs'), 'export default class Base {}\n');
        fs.ensureDirSync(path.join(engine, 'node_modules'));
        fs.symlinkSync(engine, path.join(engine, 'node_modules/neo.mjs'), 'junction');
        fs.outputFileSync(path.join(engine, 'node_modules/plain/index.mjs'), 'export const value = 17;');
        fs.outputFileSync(path.join(engine, 'node_modules/widget/Widget.mjs'),
            "import Base from '../neo.mjs/src/core/Base.mjs'; import {value} from '../plain/index.mjs'; export default class Widget extends Base {static value = value}");
        fs.outputFileSync(path.join(engine, 'apps/myapp/view/Viewport.mjs'),
            "import Base from '../../../src/core/Base.mjs'; import Widget from '../../../node_modules/widget/Widget.mjs';\nexport default class Viewport extends Base {static widget = Widget}\n");

        const {status, output} = runBuild(engine);

        expect(status, `build failed:\n${output}`).toBe(0);

        // Non-vacuity: the emitted module still carries the sibling import the guard had to judge.
        expect(fs.readFileSync(path.join(engine, 'dist/esm/apps/myapp/view/Viewport.mjs'), 'utf8'))
            .toContain('../../../src/core/Base.mjs');
        expect(fs.existsSync(path.join(engine, 'dist/esm/src/core/Base.mjs'))).toBe(true);
        const {default: Viewport} = await import(pathToFileURL(path.join(engine, 'dist/esm/apps/myapp/view/Viewport.mjs')).href);
        expect(Object.getPrototypeOf(Viewport.widget)).toBe(Object.getPrototypeOf(Viewport));
        expect(Viewport.widget.value).toBe(17);
        expect(fs.existsSync(path.join(engine, 'dist/esm/node_modules/plain/index.mjs'))).toBe(false)
    });

    /**
     * The declared root decides where the build WRITES, so an unvalidated one is an overwrite
     * primitive rather than a copy list. `path.resolve` discards every earlier segment once it meets
     * an absolute one, which collapses the build's input and output onto the same external directory:
     * the tree is read, minified, and written back over itself, outside the workspace entirely.
     *
     * The sentinel is the point of the arm. Asserting only the exit code would pass against a build
     * that refused for some unrelated reason while still having touched the directory.
     */
    test('an absolute declared root is refused and the external tree is left byte-identical', () => {
        external = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-external-'));

        const
            sentinelPath = path.join(external, 'keep.mjs'),
            sentinel     = '// not the build\'s to touch\nexport default class Keep {}\n';

        fs.outputFileSync(sentinelPath, sentinel);

        workspace = createWorkspace({sourceRoots: [external]});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have refused, output:\n${output}`).toBe(1);
        expect(output).toContain('esmSourceRoots');
        expect(fs.readFileSync(sentinelPath, 'utf8')).toBe(sentinel);
        expect(fs.existsSync(path.join(external, 'dist'))).toBe(false)
    });

    /** The traversing spelling of the same request: it must not emit beside the output tree. */
    test('a traversing declared root is refused before anything is written', () => {
        workspace = createWorkspace({sourceRoots: ['../../outside']});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have refused, output:\n${output}`).toBe(1);
        expect(output).toContain('esmSourceRoots');
        expect(fs.existsSync(path.join(workspace, 'dist'))).toBe(false)
    });

    /**
     * The re-export arm. `export … from` was not part of the rewrite pattern, so this specifier
     * reached the output unchanged — and there it either dangles or, worse, resolves back to the
     * workspace's own engine source and boots a second module graph. Either way the build used to
     * exit 0.
     */
    test('a re-export of the engine is rewritten to the flattened copy', () => {
        workspace = createWorkspace({declareExtraRoot: true, engineReExport: true});

        const {status, output} = runBuild(workspace);

        expect(status, `build failed:\n${output}`).toBe(0);

        const emitted = fs.readFileSync(path.join(workspace, 'dist/esm/components/engine.mjs'), 'utf8');

        expect(emitted).not.toContain('node_modules');
        expect(emitted).toContain('../src/core/Base.mjs')
    });

    /** An absolute mount must survive the config rewrite; `../..//mount/` resolves nowhere. */
    test('an absolute basePath passes through the emitted neo-config', () => {
        workspace = createWorkspace({declareExtraRoot: true});
        fs.outputJsonSync(path.join(workspace, 'apps/myapp/neo-config.json'), {
            appPath : '../../apps/myapp/app.mjs',
            basePath: '/mount/'
        });

        const {status, output} = runBuild(workspace);

        expect(status, `build failed:\n${output}`).toBe(0);

        const config = fs.readJsonSync(path.join(workspace, 'dist/esm/apps/myapp/neo-config.json'));

        expect(config.basePath).toBe('/mount/');
        expect(config.workerBasePath).toBe('/mount/src/worker/')
    })
});
