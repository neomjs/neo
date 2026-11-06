import {test, expect}  from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    entryOf,
    FOUNDATION,
    moduleEdges,
    RUNTIME_LOADING,
    specReach
} from '../../../../../buildScripts/util/e2eSpecReach.mjs';

/**
 * The map decides which specs a change can skip, so its failure mode is silence: an edge it cannot read drops a spec
 * that the change does reach, and nothing reports the gap. Each arm below pins one way a module names another.
 */
test.describe('e2e spec reach', () => {
    let root;

    // A tree with one shape per arm. `git add` is enough: the map reads the index, not a commit.
    test.beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-spec-reach-'));

        const tree = {
            'docs/app.mjs'                : "import '../src/docs/Viewport.mjs';",
            'examples/demo/app.mjs'       : "import MainView from './MainView.mjs';",
            'examples/demo/MainView.mjs'  : [
                "import Button from '../../src/button/Base.mjs';",
                "import '../../src/plugin/Untracked.mjs';",
                "const lazy = () => import(/* webpackChunkName: 'lazy' */ '../../src/plugin/Lazy.mjs');",
                'const tick = () => import(`../../src/plugin/Tick.mjs`);',
                'const any  = name => import(`../../src/plugin/${name}.mjs`);',
                "export default {module: '../../src/form/Field.mjs'};"
            ].join('\n'),
            'examples/family/a/app.mjs'   : "import '../../../src/family/A.mjs';",
            'examples/family/b/app.mjs'   : "import '../../../src/family/B.mjs';",
            'src/button/Base.mjs'         : '',
            'src/docs/Viewport.mjs'       : '',
            'src/family/A.mjs'            : '',
            'src/family/B.mjs'            : '',
            'src/form/Field.mjs'          : '',
            'src/plugin/Lazy.mjs'         : '',
            'src/plugin/Other.mjs'        : '',
            'src/plugin/Tick.mjs'         : '',
            'src/unused/Orphan.mjs'       : '',
            'test/playwright/fixtures.mjs': "import './helpers/wait.mjs';",
            'test/playwright/helpers/wait.mjs'      : '',
            'test/playwright/e2e/demo/Bare.spec.mjs': "import {test} from '../../fixtures.mjs';",
            'test/playwright/e2e/demo/Demo.spec.mjs': "import {test} from '../../fixtures.mjs';\nawait page.goto('/examples/demo/sub/index.html');",
            'test/playwright/e2e/demo/Docs.spec.mjs': "const DOCS = '/docs/index.html';",
            'test/playwright/e2e/demo/Family.spec.mjs': 'await page.goto(`/examples/family/${name}/index.html`);'
        };

        for (const [file, text] of Object.entries(tree)) {
            fs.mkdirSync(path.join(root, path.dirname(file)), {recursive: true});
            fs.writeFileSync(path.join(root, file), text)
        }

        execFileSync('git', ['init', '-q'], {cwd: root});
        execFileSync('git', ['add', '.'], {cwd: root});

        // On disk and named by MainView, but never committed: the map reads the committed tree
        fs.writeFileSync(path.join(root, 'src/plugin/Untracked.mjs'), '')
    });

    test.afterAll(() => {
        fs.rmSync(root, {recursive: true, force: true})
    });

    test('a spec reaches its app through every literal module path, and its own helpers', () => {
        const {reach, entries} = specReach({root}).specs.get('test/playwright/e2e/demo/Demo.spec.mjs');

        // `examples/demo/sub/index.html` resolves up to the nearest app.mjs
        expect(entries).toEqual(['examples/demo/app.mjs']);

        [
            'src/button/Base.mjs',              // static import
            'src/plugin/Lazy.mjs',              // import() with a comment inside the call
            'src/plugin/Tick.mjs',              // import() of a template literal without interpolation
            'src/form/Field.mjs',               // a path string
            'test/playwright/fixtures.mjs',     // the spec's own helper
            'test/playwright/helpers/wait.mjs'  // and the helper's helper
        ].forEach(file => expect(reach.has(file), file).toBe(true));

        [
            'src/plugin/Other.mjs',             // named only by an interpolated path
            'src/plugin/Untracked.mjs',         // not committed
            'src/unused/Orphan.mjs'             // named by nothing
        ].forEach(file => expect(reach.has(file), file).toBe(false))
    });

    test('an interpolated app path names every entry beneath it', () => {
        const {entries, reach} = specReach({root}).specs.get('test/playwright/e2e/demo/Family.spec.mjs');

        expect(entries).toEqual(['examples/family/a/app.mjs', 'examples/family/b/app.mjs']);
        expect(reach.has('src/family/A.mjs') && reach.has('src/family/B.mjs')).toBe(true)
    });

    test('the docs app is an entry like any other', () => {
        const {entries, reach} = specReach({root}).specs.get('test/playwright/e2e/demo/Docs.spec.mjs');

        expect(entries).toEqual(['docs/app.mjs']);
        expect(reach.has('src/docs/Viewport.mjs')).toBe(true)
    });

    test('a spec that names no app is unnamed, because no change can rule it out', () => {
        const {specs, unnamed} = specReach({root});

        expect(unnamed).toEqual(['test/playwright/e2e/demo/Bare.spec.mjs']);
        expect([...specs.get('test/playwright/e2e/demo/Bare.spec.mjs').reach].sort())
            .toEqual(['test/playwright/e2e/demo/Bare.spec.mjs', 'test/playwright/fixtures.mjs', 'test/playwright/helpers/wait.mjs'])
    });

    test('an edge resolves against the naming file or the repository root, and only to a tracked file', () => {
        const tracked = new Set(['src/a/B.mjs', 'src/a/C.mjs']),
              text    = "import B from './B.mjs'; const c = 'src/a/C.mjs'; import('./Missing.mjs'); import(`./${x}.mjs`);";

        expect(moduleEdges({file: 'src/a/A.mjs', text, tracked})).toEqual(['src/a/B.mjs', 'src/a/C.mjs']);
        expect(entryOf('apps/none/index', new Set())).toBe(null)
    });

    test('the blind spots name what loads by name or by computed path', () => {
        ['src/core/Base.mjs', 'src/main/addon/Mermaid.mjs', 'src/worker/App.mjs', 'src/vdom/Helper.mjs',
            'src/canvas/Helper.mjs', 'src/Neo.mjs', 'resources/scss/src/grid/Container.scss']
            .forEach(file => expect(FOUNDATION.some(rule => rule.test(file)), file).toBe(true));

        ['src/grid/Container.mjs', 'src/plugin/Responsive.mjs', 'apps/portal/app.mjs']
            .forEach(file => expect(FOUNDATION.some(rule => rule.test(file)), file).toBe(false));

        ["{importPath: 'x'}", 'Neo.loadModule({path})', "this.loadItems({url: 'x.json'})", "mainThreadAddons: ['Stylesheet']"]
            .forEach(text => expect(RUNTIME_LOADING.test(text), text).toBe(true));

        expect(RUNTIME_LOADING.test("import Button from '../button/Base.mjs';")).toBe(false)
    });

    test('on this tree, a lazily loaded plugin and a template-literal import are reached', () => {
        const {specs} = specReach(),
              reach   = specs.get('test/playwright/e2e/grid/IssuesShowcase.spec.mjs').reach;

        // grid.header.Button#afterSetColumnMenu imports the menu plugin lazily
        expect(reach.has('src/grid/header/plugin/Menu.mjs')).toBe(true);
        // component.Base imports the responsive plugin through a template literal
        expect(reach.has('src/plugin/Responsive.mjs')).toBe(true)
    });
});
