import fs                                            from 'node:fs';
import os                                            from 'node:os';
import path                                          from 'node:path';
import {fileURLToPath}                               from 'node:url';
import {test, expect}                                from '@playwright/test';
import {runtimeReferenceEdits}                       from '../../../../buildScripts/util/moveRuntimeReferences.mjs';
import {applySourceEdits, moduleInfo, rewriteModule} from '../../../../buildScripts/util/moveSourceTransforms.mjs';
import {planMove, applyMove}                         from '../../../../buildScripts/util/movePlan.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

/** @summary Parses repository ancestry and combines both transforms against the original source offsets. */
function transform({file, code, moves, classNames=new Map()}) {
    file = path.join(root, file);
    code ??= fs.readFileSync(file, 'utf8');
    const absoluteMoves = moves.map(([from, to]) => [path.join(root, from), path.join(root, to)]),
        mapPath         = file => {
            const move = absoluteMoves.find(([from]) => file === from || file.startsWith(from + path.sep));
            return move ? path.join(move[1], path.relative(move[0], file)) : file
        },
        cache = new Map(),
        getModule = file => {
            if (!cache.has(file)) cache.set(file, fs.existsSync(file) ? moduleInfo(fs.readFileSync(file, 'utf8')) : null);
            return cache.get(file)
        },
        module = rewriteModule({code, from: file, to: mapPath(file), mapPath, classNames}),
        runtime = runtimeReferenceEdits({code, file, root, engineRoot: root, info: moduleInfo(code), getModule, mapPath, classNames}),
        edits = [...module.edits, ...runtime.edits];

    return {original: code, code: applySourceEdits(code, edits), module, runtime, edits}
}

test.describe('moveRuntimeReferences (#5086)', () => {
    test('rewrites the real toolbarItems loadItems URL against the App worker alongside static imports', () => {
        const source = 'examples/serverside/toolbarItems', destination = 'examples/serverside/deeper/toolbarItems',
            result   = transform({file: source + '/Viewport.mjs', moves: [[source, destination]],
                classNames: new Map([['Neo.examples.serverside.toolbarItems.Viewport',
                    'Neo.examples.serverside.deeper.toolbarItems.Viewport']])});

        expect(result.runtime.unresolved).toEqual([]);
        expect(result.runtime.edits).toHaveLength(1);
        expect(result.code).toContain(`this.loadItems({url: "../../${destination}/resources/data/toolbar-items.json"})`);
        expect(result.code).toContain('from "../../../../src/container/Viewport.mjs"');
        expect(result.code).toContain("cls      : ['neo-serverside-toolbaritems-viewport']");
        expect(result.code).toContain("text   : 'Load Toolbar Items'")
    });

    test('rewrites the real fixture neo.loadModule MainStore reference without changing other loads', () => {
        const result = transform({file: 'test/playwright/component/container/CardGridContainment.spec.mjs',
            moves     : [['examples/grid/tree/MainStore.mjs', 'examples/grid/tree/Store.mjs']],
            classNames: new Map([['Neo.examples.grid.tree.MainStore', 'Neo.examples.grid.tree.Store']])});

        expect(result.runtime.unresolved).toEqual([]);
        expect(result.code).toContain('neo.loadModule("../../examples/grid/tree/Store.mjs")');
        expect(result.code).toContain("neo.loadModule('../tab/Container.mjs')");
        expect(result.code).toContain("neo.loadModule('../data/TreeStore.mjs')");
        expect(result.code).toContain('className: "Neo.examples.grid.tree.Store"')
    });

    test('rewrites the real Sparkline renderer path, canonical name and member echoes', () => {
        const result = transform({file: 'src/component/Sparkline.mjs',
            moves     : [['src/canvas/Sparkline.mjs', 'src/canvas/Renamed.mjs']],
            classNames: new Map([['Neo.canvas.Sparkline', 'Neo.canvas.Renamed']])});

        expect(result.runtime.unresolved).toEqual([]);
        expect(result.code).toContain('rendererImportPath: "src/canvas/Renamed.mjs"');
        expect(result.code).toContain('rendererClassName: "Neo.canvas.Renamed"');
        expect(result.code).toContain("@member {String} rendererImportPath='src/canvas/Renamed.mjs'");
        expect(result.code).toContain("@member {String} rendererClassName='Neo.canvas.Renamed'");
        expect(result.code).toContain("className: 'Neo.component.Sparkline'");
        expect(result.code).toContain("ntype: 'sparkline'")
    });

    test('composes class and runtime edits inside the same JSDoc comment without overlapping ranges', () => {
        const code = `import Canvas from '../component/Canvas.mjs';
/**
 * @class Neo.probe.View
 * @member {String} className='Neo.probe.View'
 * @member {String} rendererClassName='Neo.canvas.Sparkline'
 * @member {String} rendererImportPath='src/canvas/Sparkline.mjs'
 * Prose keeps Neo.canvas.Sparkline and src/canvas/Sparkline.mjs.
 */
class View extends Canvas {
    static config = {className: 'Neo.probe.View', rendererClassName: 'Neo.canvas.Sparkline',
        rendererImportPath: 'src/canvas/Sparkline.mjs'};
}`,
            result = transform({code, file: 'src/probe/View.mjs', moves: [
                ['src/probe/View.mjs', 'src/probe/Panel.mjs'], ['src/canvas/Sparkline.mjs', 'src/canvas/Renamed.mjs']
            ], classNames: new Map([['Neo.probe.View', 'Neo.probe.Panel'], ['Neo.canvas.Sparkline', 'Neo.canvas.Renamed']])}),
            ordered = [...result.edits].sort((a, b) => a.start - b.start);

        expect(result.module.edits.length).toBeGreaterThan(0);
        expect(result.runtime.edits.length).toBeGreaterThan(0);
        for (let index = 1; index < ordered.length; index++) expect(ordered[index - 1].end).toBeLessThanOrEqual(ordered[index].start);
        expect(result.code).toContain('@class Neo.probe.Panel');
        expect(result.code).toContain("className='Neo.probe.Panel'");
        expect(result.code).toContain("rendererClassName='Neo.canvas.Renamed'");
        expect(result.code).toContain("rendererImportPath='src/canvas/Renamed.mjs'");
        expect(result.code).toContain('Prose keeps Neo.canvas.Sparkline and src/canvas/Sparkline.mjs.')
    });

    test('does not rewrite renderer fields or their member echoes on an unrelated class', () => {
        const unrelated = `/** @member {String} rendererImportPath='src/canvas/Sparkline.mjs' */
class Other {
    static config = {rendererImportPath: 'src/canvas/Sparkline.mjs', rendererClassName: 'Neo.canvas.Sparkline'};
}`,
            code = `import Canvas from '../component/Canvas.mjs';
/** @member {String} rendererImportPath='src/canvas/Sparkline.mjs' */
class View extends Canvas {
    static config = {rendererImportPath: 'src/canvas/Sparkline.mjs'};
}
${unrelated}`,
            result = transform({code, file: 'src/probe/View.mjs',
                moves     : [['src/canvas/Sparkline.mjs', 'src/canvas/Renamed.mjs']],
                classNames: new Map([['Neo.canvas.Sparkline', 'Neo.canvas.Renamed']])});

        expect(result.code).toContain('rendererImportPath: "src/canvas/Renamed.mjs"');
        expect(result.code).toContain(unrelated)
    });

    test('rewrites qualified Neo APIs only where Neo is not shadowed by a parameter', () => {
        const code = `import Neo from '../Neo.mjs';
const real = Neo.worker.App.loadModule({path: '../../examples/grid/tree/MainStore.mjs'});
const created = Neo.worker.App.createNeoInstance({importPath: '../../examples/grid/tree/MainStore.mjs'});
function local(Neo) {
    Neo.worker.App.loadModule({path: '../../examples/grid/tree/MainStore.mjs'});
    Neo.worker.App.createNeoInstance({importPath: '../../examples/grid/tree/MainStore.mjs'});
}`,
            result = transform({code, file: 'src/probe/Caller.mjs',
                moves: [['examples/grid/tree/MainStore.mjs', 'examples/grid/tree/Store.mjs']]});

        expect(result.code).toBe(code
            .replace("const real = Neo.worker.App.loadModule({path: '../../examples/grid/tree/MainStore.mjs'});",
                'const real = Neo.worker.App.loadModule({path: "../../examples/grid/tree/Store.mjs"});')
            .replace("const created = Neo.worker.App.createNeoInstance({importPath: '../../examples/grid/tree/MainStore.mjs'});",
                'const created = Neo.worker.App.createNeoInstance({importPath: "../../examples/grid/tree/Store.mjs"});'))
    });

    test('does not treat a block-local neo as the enclosing Playwright fixture', () => {
        const code = `import {test} from '../../fixtures.mjs';
test('fixture', async ({neo}) => {
    await neo.loadModule('../../examples/grid/tree/MainStore.mjs');
    {
        const neo = {loadModule() {}};
        await neo.loadModule('../../examples/grid/tree/MainStore.mjs');
    }
});`,
            result = transform({code, file: 'test/playwright/component/probe/Bindings.spec.mjs',
                moves: [['examples/grid/tree/MainStore.mjs', 'examples/grid/tree/Store.mjs']]});

        expect(result.code).toBe(code.replace("neo.loadModule('../../examples/grid/tree/MainStore.mjs')",
            'neo.loadModule("../../examples/grid/tree/Store.mjs")'))
    });

    test('follows arrow this capture but not nested ordinary functions or unrelated methods', () => {
        const code = `import Container from '../container/Base.mjs';
class View extends Container {
    load() {
        const captured = () => this.loadItems({url: '../../examples/serverside/toolbarItems/resources/data/toolbar-items.json'});
        function ownThis() {
            return (() => this.loadItems({url: '../../examples/serverside/toolbarItems/resources/data/toolbar-items.json'}))();
        }
        return other.loadItems({url: '../../examples/serverside/toolbarItems/resources/data/toolbar-items.json'});
    }
}
class Other {
    load() { return this.loadItems({url: '../../examples/serverside/toolbarItems/resources/data/toolbar-items.json'}); }
}`,
            result = transform({code, file: 'src/probe/Containers.mjs',
                moves: [['examples/serverside/toolbarItems', 'examples/serverside/deeper/toolbarItems']]});

        expect(result.code).toBe(code.replace(
            "const captured = () => this.loadItems({url: '../../examples/serverside/toolbarItems/resources/data/toolbar-items.json'});",
            'const captured = () => this.loadItems({url: "../../examples/serverside/deeper/toolbarItems/resources/data/toolbar-items.json"});'))
    });

    test('keeps opaque or spread runtime config carriers unresolved while accepting an import-free literal', () => {
        const code = `Neo.worker.App.createNeoInstance(config);
Neo.worker.App.loadModule(options);
Neo.worker.App.createNeoInstance({...config});
Neo.worker.App.createNeoInstance({className: 'Neo.container.Base'});`,
            result = transform({code, file: 'src/probe/Callers.mjs',
                moves: [['examples/grid/tree/MainStore.mjs', 'examples/grid/tree/Store.mjs']]});

        expect(result.runtime.unresolved).toHaveLength(3);
        expect(result.runtime.unresolved.map(item => code.slice(item.start, item.end))).toEqual(['config', 'options', '{...config}']);
        expect(result.code).toBe(code)
    });

    test('invalidates a workspace plan when the installed ancestry used to qualify its caller changes', () => {
        const workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-runtime-ancestry-')),
            write       = (name, code) => {
                const file = path.join(workspace, name);
                fs.mkdirSync(path.dirname(file), {recursive: true});
                fs.writeFileSync(file, code)
            },
            dependency = 'node_modules/neo.mjs/src/container/Viewport.mjs',
            original = `import Viewport from '../../../node_modules/neo.mjs/src/container/Viewport.mjs';
export default class View extends Viewport {
    static config = {className: 'Demo.view.View'};
    load() { return this.loadItems({url: '../../../../apps/demo/view/layout.json'}); }
}`;

        try {
            write('package.json', '{"name":"runtime-consumer","type":"module"}');
            write('node_modules/neo.mjs/src/container/Base.mjs', 'export default class Base {}');
            write(dependency, "import Base from './Base.mjs'; export default class Viewport extends Base {}");
            write('apps/demo/view/View.mjs', original);
            write('apps/demo/view/layout.json', '{"items":[]}');
            const plan  = planMove({root: workspace, source: 'apps/demo/view', destination: 'apps/demo/panels'}),
                rewrite = plan.rewrites.find(item => item.from === path.join(workspace, 'apps/demo/view/View.mjs'));

            expect(plan.blockers).toEqual([]);
            expect(rewrite.after.toString()).toContain('url: "../../../../apps/demo/panels/layout.json"');
            expect(plan.readOnlyInputs).toEqual(expect.arrayContaining([expect.objectContaining({file: path.join(workspace, dependency)})]));
            write(dependency, 'export default class Viewport {}');
            expect(() => applyMove(plan)).toThrow(/dependency changed/i);
            expect(fs.readFileSync(path.join(workspace, 'apps/demo/view/View.mjs'), 'utf8')).toBe(original);
            expect(fs.existsSync(path.join(workspace, 'apps/demo/panels'))).toBe(false);
            expect(fs.readFileSync(path.join(workspace, dependency), 'utf8')).toBe('export default class Viewport {}')
        } finally {
            fs.rmSync(workspace, {recursive: true, force: true})
        }
    })
});
