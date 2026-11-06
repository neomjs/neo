import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, expect}                 from '@playwright/test';
import {compile}                      from 'sass';
import {planMove, applyMove}          from '../../../../buildScripts/util/movePlan.mjs';

/** @summary Writes a fixture file, creating its parent directories. */
function write(root, name, contents) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, contents)
}

/** @summary Records bytes, modes, directories and symlinks without following external targets. */
function snapshot(root) {
    const result = [];
    const visit  = directory => {
        for (const name of fs.readdirSync(directory).sort()) {
            const file = path.join(directory, name), stat = fs.lstatSync(file), relative = path.relative(root, file);
            if (stat.isSymbolicLink()) result.push([relative, 'link', fs.readlinkSync(file)]);
            else if (stat.isDirectory()) {
                result.push([relative, 'directory', stat.mode]);
                visit(file)
            } else result.push([relative, 'file', stat.mode, fs.readFileSync(file).toString('base64')])
        }
    };
    visit(root);
    return result
}

/** @summary Executes a fixture's public entry in a fresh Node process, avoiding import-cache reuse. */
function execute(root) {
    const url = pathToFileURL(path.join(root, 'entry.mjs')).href;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
        `const entry = await import(${JSON.stringify(url)}); console.log(JSON.stringify(await entry.inspect()));`
    ], {encoding: 'utf8'}))
}

/** @summary Creates executable Engine modules and structural/theme companions with local Sass partials. */
function engineFixture(root) {
    write(root, 'package.json', JSON.stringify({name: 'neo-move-fixture', type: 'module'}));
    write(root, 'src/shared/Base.mjs', 'export default class Base { get value() { return 7 } }');
    write(root, 'src/old/Sibling.mjs', `export default class Sibling {
    static config = {className: 'Neo.old.Sibling'};
    static label = 'sibling';
}`);
    write(root, 'src/old/support.mjs', 'export const suffix = "support";');
    write(root, 'src/old/Widget.mjs', `import Base from '../shared/Base.mjs';
import Sibling from './Sibling.mjs';
import {suffix} from './support.mjs';
export default class Widget extends Base {
    static config = {className: 'Neo.old.Widget', ntype: 'old-widget'};
    describe() { return [this.value, Sibling.label, suffix] }
}`);
    write(root, 'entry.mjs', `import Widget from './src/old/Widget.mjs';
export {default as Widget} from './src/old/Widget.mjs';
export * from './src/old/support.mjs';
export async function inspect() {
    const {default: Sibling} = await import('./src/old/Sibling.mjs');
    return {className: Widget.config.className, ntype: Widget.config.ntype,
        sibling: Sibling.config.className, values: new Widget().describe()}
}`);

    for (const [surface, property, value] of [
        ['src', 'padding', '3px'], ['theme-light', 'color', '#123456'], ['theme-dark', 'color', '#abcdef']
    ]) {
        write(root, `resources/scss/${surface}/old/_tokens.scss`, `$value: ${value};`);
        write(root, `resources/scss/${surface}/old/Widget.scss`,
            `@use './tokens';\n.neo-old-widget { ${property}: tokens.$value; }\n`)
    }
    write(root, 'resources/scss/bundle.scss', `@use 'src/old/Widget' as structural;
@use 'theme-light/old/Widget' as light;
@use 'theme-dark/old/Widget' as dark;
`)
}

test.describe('movePlan (#5086)', () => {
    let root, external;

    test.beforeEach(() => {
        root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-move-plan-'))
    });

    test.afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
        if (external) fs.rmSync(external, {recursive: true, force: true});
        external = null
    });

    test('plans without writes, then preserves executable Engine edges and compiled companion CSS', () => {
        engineFixture(root);
        const before = snapshot(root),
            css      = compile(path.join(root, 'resources/scss/bundle.scss')).css,
            original = execute(root),
            plan     = planMove({root, source: 'src/old', destination: 'src/new/deep'});

        expect(snapshot(root)).toEqual(before);
        expect(plan.blockers).toEqual([]);
        expect(new Map(plan.classNames)).toEqual(new Map([
            ['Neo.old.Sibling', 'Neo.new.deep.Sibling'], ['Neo.old.Widget', 'Neo.new.deep.Widget']
        ]));
        expect(plan.snapshot.length).toBeGreaterThan(0);
        expect(applyMove(plan)).toEqual({moved: plan.moves.length, rewritten: plan.rewrites.length});
        expect(fs.existsSync(path.join(root, 'src/old'))).toBe(false);
        expect(execute(root)).toEqual({...original,
            className: 'Neo.new.deep.Widget', sibling: 'Neo.new.deep.Sibling'});
        expect(compile(path.join(root, 'resources/scss/bundle.scss')).css).toBe(css);

        for (const surface of ['src', 'theme-light', 'theme-dark']) {
            expect(fs.existsSync(path.join(root, `resources/scss/${surface}/old/Widget.scss`))).toBe(false);
            expect(fs.readFileSync(path.join(root, `resources/scss/${surface}/new/deep/Widget.scss`), 'utf8'))
                .toContain('.neo-old-widget');
            expect(fs.existsSync(path.join(root, `resources/scss/${surface}/old/_tokens.scss`))).toBe(true)
        }
    });

    test('honors explicit workspace namespaces and theme folders without mutating the installed Engine', () => {
        write(root, 'package.json', JSON.stringify({name: 'consumer', type: 'module'}));
        write(root, 'neo-config.json', JSON.stringify({basePath: './', appPath: 'apps/shop/app.mjs'}));
        write(root, 'index.html', '<script type="module" src="node_modules/neo.mjs/src/MicroLoader.mjs"></script>');
        write(root, 'node_modules/neo.mjs/src/Base.mjs', 'export default class Base { value() { return "engine" } }');
        write(root, 'apps/shop/view/Widget.mjs', `import Base from '../../../node_modules/neo.mjs/src/Base.mjs';
export default class Widget extends Base { static config = {className: 'Shop.view.Widget', ntype: 'shop-widget'} }`);
        write(root, 'entry.mjs', `import Widget from './apps/shop/view/Widget.mjs';
export function inspect() { return {className: Widget.config.className, ntype: Widget.config.ntype, value: new Widget().value()} }`);
        for (const surface of ['src', 'theme-light']) {
            write(root, `resources/scss/${surface}/apps/storefront/_tokens.scss`, '$spacing: 4px;');
            write(root, `resources/scss/${surface}/apps/storefront/Widget.scss`,
                '@use "./tokens";\n.shop-widget { margin: tokens.$spacing; }');
        }
        write(root, 'resources/scss/bundle.scss', `@use 'src/apps/storefront/Widget' as structural;
@use 'theme-light/apps/storefront/Widget' as themed;`);

        const engine = snapshot(path.join(root, 'node_modules')),
            css      = compile(path.join(root, 'resources/scss/bundle.scss')).css,
            original = execute(root),
            plan     = planMove({root, source: 'apps/shop/view/Widget.mjs', destination: 'apps/admin/view/inventory/Card.mjs',
                namespaceRoots: [
                    {path: 'apps/shop', namespace: 'Shop', appThemeFolder: 'storefront'},
                    {path: 'apps/admin', namespace: 'Admin', appThemeFolder: 'admin-ui'}
                ]});

        expect(plan.blockers).toEqual([]);
        expect(plan.classNames).toEqual([['Shop.view.Widget', 'Admin.view.inventory.Card']]);
        applyMove(plan);
        expect(execute(root)).toEqual({...original, className: 'Admin.view.inventory.Card'});
        expect(snapshot(path.join(root, 'node_modules'))).toEqual(engine);
        expect(compile(path.join(root, 'resources/scss/bundle.scss')).css).toBe(css);
        for (const surface of ['src', 'theme-light']) {
            expect(fs.existsSync(path.join(root, `resources/scss/${surface}/apps/admin-ui/inventory/Card.scss`))).toBe(true)
        }
    });

    for (const workspace of [false, true]) {
        test(`moves an example with boot and metadata carriers using the ${workspace ? 'installed' : 'local'} Engine origins`, () => {
            const source     = 'examples/probe/demo', destination = 'examples/deeper/nested/probe/demo',
                enginePrefix = workspace ? 'node_modules/neo.mjs/' : '',
                engineRoot   = path.resolve(root, enginePrefix), modulePrefix = workspace ? '../../' : '',
                oldClass     = 'Neo.examples.probe.demo.Widget', newClass = 'Neo.examples.deeper.nested.probe.demo.Widget',
                catalogs     = [['devmode', ''], ['dist_dev', 'dist/development/'],
                    ['dist_esm', 'dist/esm/'], ['dist_prod', 'dist/production/']],
                read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

            write(root, 'package.json', JSON.stringify({name: workspace ? 'example-consumer' : 'neo.mjs', type: 'module'}));
            write(root, enginePrefix + 'src/MicroLoader.mjs', 'export const loader = true;');
            write(root, enginePrefix + 'src/Main.mjs', 'export const main = true;');
            write(root, enginePrefix + 'src/worker/App.mjs', 'export const worker = true;');
            write(root, enginePrefix + 'src/component/Base.mjs', 'export default class Base { answer() { return 42 } }');
            write(root, source + '/Widget.mjs', `import Base from '../../../${enginePrefix}src/component/Base.mjs';
export default class Widget extends Base { static config = {className: '${oldClass}'} }`);
            write(root, source + '/app.mjs', `import Widget from './Widget.mjs';
export function inspect() { return {className: Widget.config.className, answer: new Widget().answer()} }`);
            write(root, 'entry.mjs', `export {inspect} from './${source}/app.mjs';`);
            write(root, source + '/index.html',
                `<script type="module" src="../../../${enginePrefix}src/MicroLoader.mjs"></script>`);
            write(root, source + '/neo-config.json', JSON.stringify({
                appPath : modulePrefix + source + '/app.mjs', basePath: '../../../' + enginePrefix,
                mainPath: './Main.mjs', workerBasePath: '../../../' + enginePrefix + 'src/worker/'
            }));
            write(root, source + '/resources/layout.json', JSON.stringify({
                modules: [modulePrefix + source + '/Widget.mjs'], items: [{className: oldClass, text: 'unchanged'}]
            }));
            write(root, 'docs/examples.json', JSON.stringify([
                {path: '../../../' + source + '/Widget.mjs'},
                {path: ['../../../' + source + '/Widget.mjs', '../../../' + source + '/app.mjs']}
            ]));
            for (const [catalog, prefix] of catalogs) {
                write(root, `apps/portal/resources/data/examples_${catalog}.json`, JSON.stringify([
                    {url: prefix + source + '/index.html?probe=1#demo', sourceUrl: source}
                ]))
            }
            for (const surface of ['src', 'theme-light']) {
                write(root, `resources/scss/${surface}/${source}/Widget.scss`, '.probe-widget { padding: 3px; }')
            }
            write(root, 'resources/scss/bundle.scss',
                `@use 'src/${source}/Widget' as structural;\n@use 'theme-light/${source}/Widget' as theme;`);

            const before = snapshot(root), original = execute(root),
                css      = compile(path.join(root, 'resources/scss/bundle.scss')).css,
                plan     = planMove({root, source, destination});

            expect(snapshot(root)).toEqual(before);
            expect(original).toEqual({className: oldClass, answer: 42});
            expect(plan.blockers).toEqual([]);
            applyMove(plan);
            expect(execute(root)).toEqual({className: newClass, answer: 42});
            expect(fs.existsSync(path.join(root, source))).toBe(false);
            expect(compile(path.join(root, 'resources/scss/bundle.scss')).css).toBe(css);

            // These are unit-level URL and module-resolution witnesses, not a browser boot.
            const document = pathToFileURL(path.join(root, destination, 'index.html')),
                html       = fs.readFileSync(fileURLToPath(document), 'utf8'),
                loader     = new URL(/src="([^"]+)"/.exec(html)[1], document),
                config     = read(destination + '/neo-config.json'),
                layout     = read(destination + '/resources/layout.json'),
                docs       = read('docs/examples.json'),
                controller = pathToFileURL(path.join(root, 'docs/app/view/MainContainerController.mjs'));

            expect(fileURLToPath(new URL('./neo-config.json', document))).toBe(path.join(root, destination, 'neo-config.json'));
            expect(fileURLToPath(loader)).toBe(path.join(engineRoot, 'src/MicroLoader.mjs'));
            expect(config.mainPath).toBe('./Main.mjs');
            expect(fileURLToPath(new URL(config.mainPath, loader))).toBe(path.join(engineRoot, 'src/Main.mjs'));
            expect(fileURLToPath(new URL(config.basePath, document))).toBe(engineRoot + path.sep);
            expect(fileURLToPath(new URL(config.workerBasePath, document))).toBe(path.join(engineRoot, 'src/worker') + path.sep);
            expect(path.resolve(engineRoot, config.appPath)).toBe(path.join(root, destination, 'app.mjs'));
            expect(path.resolve(engineRoot, layout.modules[0])).toBe(path.join(root, destination, 'Widget.mjs'));
            expect(layout.items).toEqual([{className: newClass, text: 'unchanged'}]);
            expect(fileURLToPath(new URL(docs[0].path, controller))).toBe(path.join(root, destination, 'Widget.mjs'));
            expect(docs[1].path.map(value => fileURLToPath(new URL(value, controller))))
                .toEqual(['Widget.mjs', 'app.mjs'].map(name => path.join(root, destination, name)));
            for (const [catalog, prefix] of catalogs) {
                const [record] = read(`apps/portal/resources/data/examples_${catalog}.json`);
                expect(record.url).toBe(prefix + destination + '/index.html?probe=1#demo');
                expect(record.sourceUrl).toBe(destination)
            }
        })
    }

    for (const selfReference of [false, true]) {
        test(`refuses or safely rewrites an owned source reached through package ${selfReference ? 'self-reference' : 'imports'}`, () => {
            const specifier = selfReference ? 'move-alias-fixture/widget' : '#widget',
                manifest    = {name: 'move-alias-fixture', type: 'module',
                    ...(selfReference ? {exports: {'./widget': './src/old/Widget.mjs'}} :
                        {imports: {'#widget': './src/old/Widget.mjs'}})};
            write(root, 'package.json', JSON.stringify(manifest));
            write(root, 'src/old/Widget.mjs', `export default class Widget {
    static config = {className: 'Neo.old.Widget'};
    value() { return 'owned source' }
}
export const sourceUrl = import.meta.url;`);
            write(root, 'entry.mjs', `import Widget, {sourceUrl} from '${specifier}';
export function inspect() { return {sourceUrl, className: Widget.config.className, value: new Widget().value()} }`);
            const original = execute(root), before = snapshot(root),
                plan       = planMove({root, source: 'src/old', destination: 'src/new'});

            expect(original).toEqual({sourceUrl: pathToFileURL(path.join(root, 'src/old/Widget.mjs')).href,
                className: 'Neo.old.Widget', value: 'owned source'});
            expect(snapshot(root)).toEqual(before);
            if (plan.blockers.length) {
                expect(() => applyMove(plan)).toThrow(/unresolved/i);
                expect(snapshot(root)).toEqual(before)
            } else {
                applyMove(plan);
                expect(execute(root)).toEqual({...original, className: 'Neo.new.Widget',
                    sourceUrl: pathToFileURL(path.join(root, 'src/new/Widget.mjs')).href})
            }
        })
    }

    test('infers an app root and discovers its custom theme folder outside the moved view subtree', () => {
        const application = 'Neo.app({name: "Demo", appThemeFolder: "demo-theme"});';
        write(root, 'apps/demo/app.mjs', application);
        write(root, 'apps/demo/view/Widget.mjs',
            'export default class Widget { static config = {className: "Demo.view.Widget"} }');
        write(root, 'entry.mjs', `import Widget from './apps/demo/view/Widget.mjs';
export function inspect() { return {className: Widget.config.className} }`);
        for (const surface of ['src', 'theme-light']) {
            write(root, `resources/scss/${surface}/apps/demo-theme/Widget.scss`, '.demo-widget { padding: 2px; }')
        }
        write(root, 'resources/scss/bundle.scss', `@use 'src/apps/demo-theme/Widget' as structural;
@use 'theme-light/apps/demo-theme/Widget' as themed;`);
        const css = compile(path.join(root, 'resources/scss/bundle.scss')).css,
            plan  = planMove({root, source: 'apps/demo/view', destination: 'apps/demo/panels'});

        expect(plan.blockers).toEqual([]);
        expect(plan.classNames).toEqual([['Demo.view.Widget', 'Demo.panels.Widget']]);
        applyMove(plan);
        expect(execute(root)).toEqual({className: 'Demo.panels.Widget'});
        expect(fs.readFileSync(path.join(root, 'apps/demo/app.mjs'), 'utf8')).toBe(application);
        expect(compile(path.join(root, 'resources/scss/bundle.scss')).css).toBe(css);
        for (const surface of ['src', 'theme-light']) {
            expect(fs.existsSync(path.join(root, `resources/scss/${surface}/apps/demo-theme/panels/Widget.scss`))).toBe(true)
        }
    });

    test('blocks moving a projected theme sheet still used by an unmoved class', () => {
        write(root, 'apps/demo/view/Widget.mjs', 'class Widget { static config = {className: "Demo.view.Widget"} }');
        write(root, 'apps/demo/Widget.mjs', 'class Widget { static config = {className: "Demo.Widget"} }');
        write(root, 'resources/scss/src/apps/demo/Widget.scss', '.demo-widget { padding: 2px; }');
        const before = snapshot(root),
            plan     = planMove({root, source: 'apps/demo/view/Widget.mjs', destination: 'apps/demo/view/Card.mjs'});

        expect(plan.blockers.some(blocker => /theme sheet.*shared/i.test(blocker.reason))).toBe(true);
        expect(() => applyMove(plan)).toThrow(/unresolved/i);
        expect(snapshot(root)).toEqual(before)
    });

    test('blocks a destination canonical name already declared at a different file path', () => {
        engineFixture(root);
        write(root, 'src/aliases/Other.mjs', 'class Other { static config = {className: "Neo.new.Card"} }');
        const before = snapshot(root),
            plan     = planMove({root, source: 'src/old/Widget.mjs', destination: 'src/new/Card.mjs'});

        expect(plan.blockers.some(blocker => /class name.*already declared/i.test(blocker.reason))).toBe(true);
        expect(() => applyMove(plan)).toThrow(/unresolved/i);
        expect(snapshot(root)).toEqual(before)
    });

    test('preserves an implicit Sass module namespace when its companion filename changes', () => {
        write(root, 'src/old/Widget.mjs', 'class Widget { static config = {className: "Neo.old.Widget"} }');
        write(root, 'resources/scss/src/old/Widget.scss',
            '$spacing: 4px !default;\n.neo-old-widget { padding: $spacing; }');
        write(root, 'resources/scss/bundle.scss', `@use './src/old/Widget' with ($spacing: 9px);
.consumer { margin: Widget.$spacing; }`);
        const css = compile(path.join(root, 'resources/scss/bundle.scss')).css,
            plan  = planMove({root, source: 'src/old/Widget.mjs', destination: 'src/new/Card.mjs'});

        expect(plan.blockers).toEqual([]);
        applyMove(plan);
        expect(compile(path.join(root, 'resources/scss/bundle.scss')).css).toBe(css);
        expect(fs.readFileSync(path.join(root, 'resources/scss/bundle.scss'), 'utf8')).toContain('as Widget');
        expect(fs.existsSync(path.join(root, 'resources/scss/src/new/Card.scss'))).toBe(true)
    });

    test('refuses a Git-ignored file inside the moved folder before changing the tree', () => {
        engineFixture(root);
        execFileSync('git', ['init', '--quiet', root], {stdio: 'pipe'});
        write(root, '.gitignore', 'src/old/private-data.txt\n');
        write(root, 'src/old/private-data.txt', 'This ignored file must not be carried by the move.');
        const before = snapshot(root);

        expect(() => planMove({root, source: 'src/old', destination: 'src/new/deep'})).toThrow(/outside.*owned scan/i);
        expect(snapshot(root)).toEqual(before)
    });

    for (const collision of ['src/new/deep/existing.mjs', 'resources/scss/src/new/deep/Widget.scss']) {
        test(`refuses a destination collision before writes: ${collision}`, () => {
            engineFixture(root);
            write(root, collision, 'existing');
            const before = snapshot(root);

            expect(() => planMove({root, source: 'src/old', destination: 'src/new/deep'})).toThrow(/destination.*exists/i);
            expect(snapshot(root)).toEqual(before)
        })
    }

    for (const change of ['changed source', 'new consumer']) {
        test(`refuses a stale plan after ${change} without applying any move`, () => {
            engineFixture(root);
            const plan = planMove({root, source: 'src/old', destination: 'src/new/deep'});
            if (change === 'changed source') write(root, 'src/old/support.mjs', 'export const suffix = "updated";');
            else write(root, 'new-consumer.mjs', 'export {default} from "./src/old/Widget.mjs";');
            const before = snapshot(root);

            expect(() => applyMove(plan)).toThrow(/stale/i);
            expect(snapshot(root)).toEqual(before)
        })
    }

    test('blocks computed imports intersecting the moved folder while retaining their source', () => {
        engineFixture(root);
        write(root, 'lazy.mjs', 'export const load = name => import(`./src/old/${name}.mjs`);');
        const before = snapshot(root),
            plan     = planMove({root, source: 'src/old', destination: 'src/new/deep'});

        expect(plan.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({file: path.join(root, 'lazy.mjs'), prefix: './src/old/'})
        ]));
        expect(() => applyMove(plan)).toThrow(/unresolved/i);
        expect(snapshot(root)).toEqual(before)
    });

    test('requires a declared domain even when a computed import has an apparently disjoint prefix', () => {
        engineFixture(root);
        const lazy = 'export const load = name => import(`./unrelated/${name}.mjs`);';
        write(root, 'lazy.mjs', lazy);
        const initial = planMove({root, source: 'src/old', destination: 'src/new/deep'}),
            reference = initial.referenceLedger.find(entry => entry.file === path.join(root, 'lazy.mjs'));
        expect(initial.blockers.length).toBeGreaterThan(0);
        const plan = planMove({root, source: 'src/old', destination: 'src/new/deep', referenceScopes: [{
            file      : 'lazy.mjs', start: reference.start, expression: reference.expression,
            sourceHash: reference.sourceHash, roots: ['unrelated']
        }]});

        expect(plan.blockers).toEqual([]);
        applyMove(plan);
        expect(fs.readFileSync(path.join(root, 'lazy.mjs'), 'utf8')).toBe(lazy)
    });

    for (const boundary of ['source', 'destination ancestor', 'source descendant']) {
        test(`refuses a symlink ${boundary} without changing either tree`, () => {
            engineFixture(root);
            external = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-move-external-'));
            write(external, 'external.mjs', 'export const outside = true;');
            let source = 'src/old', destination = 'src/new/deep';
            if (boundary === 'source') {
                fs.symlinkSync(external, path.join(root, 'linked'));
                source = 'linked'
            } else if (boundary === 'destination ancestor') {
                fs.symlinkSync(external, path.join(root, 'linked'));
                destination = 'linked/moved'
            } else fs.symlinkSync(path.join(external, 'external.mjs'), path.join(root, 'src/old/external.mjs'));
            const before = snapshot(root), outside = snapshot(external);

            expect(() => applyMove(planMove({root, source, destination}))).toThrow();
            expect(snapshot(root)).toEqual(before);
            expect(snapshot(external)).toEqual(outside)
        })
    }

    test('restores the complete original tree after a failure following the first rewrite', () => {
        engineFixture(root);
        const before      = snapshot(root),
            plan          = planMove({root, source: 'src/old', destination: 'src/new/deep'}),
            originalWrite = fs.writeFileSync;
        let writes = 0, injected = false;

        fs.writeFileSync = function(file, ...args) {
            if (typeof file === 'string' && file.startsWith(root + path.sep) && ++writes === 2) {
                injected = true;
                throw new Error('injected move rewrite failure')
            }
            return originalWrite.call(this, file, ...args)
        };

        try {
            expect(() => applyMove(plan)).toThrow('injected move rewrite failure')
        } finally {
            fs.writeFileSync = originalWrite
        }

        expect(injected).toBe(true);
        expect(snapshot(root)).toEqual(before);
        expect(execute(root).className).toBe('Neo.old.Widget')
    })
});
