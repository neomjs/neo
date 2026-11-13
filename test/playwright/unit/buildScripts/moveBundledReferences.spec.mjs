import {parse, parseExpressionAt}     from 'acorn';
import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, expect}                 from '@playwright/test';
import webpack                        from 'webpack';
import workerContextRebasePlugin      from '../../../../buildScripts/webpack/workerContextRebasePlugin.mjs';
import {planMove, applyMove}          from '../../../../buildScripts/util/movePlan.mjs';
import {keyName, visitNodes}          from '../../../../buildScripts/util/moveSourceTransforms.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * @summary Reads the real worker method and parses the webpack filters of its app-space import (the `../../`
 * template) as regex literals, without eval. A method can hold several imports, each with its own context.
 */
function reader(name, methodName) {
    const code = fs.readFileSync(path.join(repoRoot, `src/worker/${name}.mjs`), 'utf8'), comments = [];
    let method, appSpace;
    visitNodes(parse(code, {ecmaVersion: 'latest', sourceType: 'module', onComment: comments}), node => {
        if (node.type === 'MethodDefinition' && keyName(node.key) === methodName) method = node
    });
    visitNodes(method, node => {
        if (node.type === 'ImportExpression' && node.source.quasis?.[0].value.cooked === '../../') appSpace = node
    });
    const methodCode = code.slice(method.start, method.end),
        magic        = comments.filter(c => c.start >= appSpace.start && c.end <= appSpace.source.start).map(c => c.value).join('\n'),
        filters      = Object.fromEntries(['Include', 'Exclude'].map(kind => {
            const match    = new RegExp(`webpack${kind}\\s*:\\s*`).exec(magic),
                expression = parseExpressionAt(magic, match.index + match[0].length, {ecmaVersion: 'latest'});
            return [kind.toLowerCase(), new RegExp(expression.regex.pattern, expression.regex.flags)]
        }));
    return {code, methodCode, methodName, ...filters}
}

const readers = {App: reader('App', 'importApp'), Canvas: reader('Canvas', 'loadModule')};

/**
 * @summary Checks source include/exclude membership as webpack does on absolute paths.
 * A synthetic prefix prevents an ancestor directory named apps/examples/src from accidentally admitting a target.
 */
function membership(reader, target) {
    const absolute = '/opt/move-fixture/workspace/' + target;
    return {included: reader.include.test(absolute), excluded: reader.exclude.test(absolute)}
}

/** @summary Compiles the exact App method with the real workspace context rebase plugin, without building Engine. */
async function compileProbe(workspace, entry) {
    const output = path.join(workspace, 'dist/probe'),
        compiler = webpack({context: workspace, mode: 'development', devtool: false, target: 'node', entry,
            plugins: [workerContextRebasePlugin(false)],
            output : {path: output, filename: 'reader.cjs', chunkFilename: '[id].cjs', library: {type: 'commonjs2'}}});
    try {
        await new Promise((resolve, reject) => compiler.run((error, stats) => {
            if (error) reject(error);
            else if (stats.hasErrors()) reject(new Error(stats.toString({all: false, errors: true})));
            else resolve()
        }))
    } finally {
        await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    }
    return path.join(output, 'reader.cjs')
}

test.describe('source moves preserve worker bundle reach (#5086)', () => {
    let root, engineRoot;

    /** @summary Writes only within the temporary consumer and its physical installed Engine fixture. */
    const write = (relative, code) => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, code)
    };

    /** @summary Runs the exact real method from the same worker directory in a fresh native Node module graph. */
    const native = (name, argument) => {
        const url      = pathToFileURL(path.join(engineRoot, `src/worker/${name}Probe.mjs`)).href,
            expression = name === 'App' ? '{value: result.onStart()}' : 'result',
            code       = `const {default: Reader} = await import(${JSON.stringify(url)});\n` +
                `const result = await new Reader().${readers[name].methodName}(${JSON.stringify(argument)});\n` +
                `console.log(JSON.stringify(${expression}));`;
        return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {encoding: 'utf8'}))
    };

    /** @summary Executes a webpack context request, retaining MODULE_NOT_FOUND as the observed result. */
    const bundled = (bundle, appPath) => {
        const code = `const {default: Reader} = require(${JSON.stringify(bundle)});\n` +
            `new Reader().importApp(${JSON.stringify(appPath)}).then(result => console.log(JSON.stringify({value: result.onStart()})))` +
            `.catch(error => console.log(JSON.stringify({code: error.code, message: error.message})));`;
        return JSON.parse(execFileSync(process.execPath, ['-e', code], {encoding: 'utf8'}))
    };

    test.beforeEach(() => {
        root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-bundled-move-'));
        engineRoot = path.join(root, 'node_modules/neo.mjs');
        write('package.json', '{"name":"bundled-move-consumer","type":"module"}');
        for (const [name, source] of Object.entries(readers)) {
            write(`node_modules/neo.mjs/src/worker/${name}.mjs`, source.code);
            write(`node_modules/neo.mjs/src/worker/${name}Probe.mjs`, `export default class Probe {\n${source.methodCode}\n}`)
        }
        write('apps/demo/app.mjs', 'export const onStart = () => "native entry";');
        write('apps/demo/neo-config.json', '{"appPath":"../../apps/demo/app.mjs"}')
    });

    test.afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

    for (const [label, source, destination, entry, config] of [
        ['excluded test root', 'apps/demo', 'test/apps/demo', 'test/apps/demo/app.mjs', 'test/apps/demo/neo-config.json'],
        ['renamed app entry', 'apps/demo/app.mjs', 'apps/demo/entry.mjs', 'apps/demo/entry.mjs', 'apps/demo/neo-config.json']
    ]) {
        test(`refuses ${label}: native resolution succeeds but the real App context excludes the destination`, () => {
            expect(native('App', '../../apps/demo/app.mjs')).toEqual({value: 'native entry'});
            expect(membership(readers.App, 'apps/demo/app.mjs')).toEqual({included: true, excluded: false});
            expect(membership(readers.App, entry)).toEqual(label === 'excluded test root'
                ? {included: true, excluded: true} : {included: false, excluded: false});
            const plan = planMove({root, source, destination});

            // Demonstrate the current false green without bypassing a future planner refusal.
            if (!plan.blockers.length) {
                applyMove(plan);
                const {appPath} = JSON.parse(fs.readFileSync(path.join(root, config), 'utf8'));
                expect(path.resolve(engineRoot, appPath)).toBe(path.join(root, entry));
                expect(native('App', appPath)).toEqual({value: 'native entry'})
            }
            expect(plan.blockers.some(item => item.reason.includes('bundled import context')),
                'a source-only success cannot authorize a bundle-unreachable entry').toBe(true);
            expect(() => applyMove(plan)).toThrow(/unresolved/);
            expect(fs.existsSync(path.join(root, source))).toBe(true)
        })
    }

    test('admits a deeper application folder that retains app.mjs and context membership', async () => {
        const destination = 'apps/deeper/nested/demo',
            plan          = planMove({root, source: 'apps/demo', destination});

        expect(membership(readers.App, destination + '/app.mjs')).toEqual({included: true, excluded: false});
        expect(plan.blockers).toEqual([]);
        applyMove(plan);
        const {appPath} = JSON.parse(fs.readFileSync(path.join(root, destination, 'neo-config.json'), 'utf8'));
        expect(path.resolve(engineRoot, appPath)).toBe(path.join(root, destination, 'app.mjs'));
        expect(native('App', appPath)).toEqual({value: 'native entry'});
        const bundle = await compileProbe(root, path.join(engineRoot, 'src/worker/AppProbe.mjs'));
        expect(bundled(bundle, destination + '/app.mjs')).toEqual({value: 'native entry'})
    });

    for (const allowed of [false, true]) {
        test(`${allowed ? 'admits' : 'refuses'} a Canvas renderer move ${allowed ? 'within' : 'outside'} its bundled canvas directory`, () => {
            const source    = 'apps/demo/canvas/Renderer.mjs',
                destination = allowed ? 'apps/demo/canvas/deeper/Renderer.mjs' : 'apps/demo/renderers/Renderer.mjs';
            write('node_modules/neo.mjs/src/component/Canvas.mjs',
                fs.readFileSync(path.join(repoRoot, 'src/component/Canvas.mjs'), 'utf8'));
            write(source, 'export default class Renderer { static config = {className: "Demo.canvas.Renderer"} }');
            write('apps/demo/Host.mjs', `import Canvas from '../../node_modules/neo.mjs/src/component/Canvas.mjs';
export default class Host extends Canvas {
    static config = {className: 'Demo.Host', rendererClassName: 'Demo.canvas.Renderer',
        rendererImportPath: '../../apps/demo/canvas/Renderer.mjs'};
}`);
            expect(native('Canvas', {path: '../../' + source}).success).toBe(true);
            expect(membership(readers.Canvas, source)).toEqual({included: true, excluded: false});
            expect(membership(readers.Canvas, destination)).toEqual({included: allowed, excluded: false});
            const plan = planMove({root, source, destination});
            if (!plan.blockers.length) {
                applyMove(plan);
                const host   = fs.readFileSync(path.join(root, 'apps/demo/Host.mjs'), 'utf8'),
                    renderer = /rendererImportPath:\s*(['"])(.*?)\1/.exec(host)[2];
                expect(path.resolve(engineRoot, renderer)).toBe(path.join(root, destination));
                expect(native('Canvas', {path: renderer}).success).toBe(true)
            }
            if (allowed) expect(plan.blockers).toEqual([]);
            else {
                expect(plan.blockers.some(item => item.reason.includes('bundled import context')),
                    'the app-space Canvas context requires a canvas directory').toBe(true);
                expect(() => applyMove(plan)).toThrow(/unresolved/);
                expect(fs.existsSync(path.join(root, source))).toBe(true)
            }
        })
    }

    test('a changed magic comment requires re-admission and invalidates an earlier plan', () => {
        const options = {root, source: 'apps/demo', destination: 'apps/deeper/demo'},
            plan      = planMove(options), readerPath = path.join(engineRoot, 'src/worker/App.mjs');
        expect(plan.blockers).toEqual([]);
        expect(plan.readOnlyInputs.some(input => input.file === readerPath && input.hash)).toBe(true);
        fs.writeFileSync(readerPath, readers.App.code.replace('webpackInclude: /', 'webpackInclude: /changed|'));
        expect(() => applyMove(plan)).toThrow(/dependency changed/);
        expect(planMove(options).blockers.some(item => item.reason.includes('App#importApp') && item.reason.includes('re-admit'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'apps/demo/app.mjs'))).toBe(true)
    });

    test('the actual workspace webpack context loads app.mjs but omits a natively importable entry.mjs', async () => {
        write('apps/demo/entry.mjs', fs.readFileSync(path.join(root, 'apps/demo/app.mjs'), 'utf8'));
        expect(native('App', '../../apps/demo/app.mjs')).toEqual({value: 'native entry'});
        expect(native('App', '../../apps/demo/entry.mjs')).toEqual({value: 'native entry'});
        const bundle = await compileProbe(root, path.join(engineRoot, 'src/worker/AppProbe.mjs'));

        // The workspace builder removes the development-only ../../ prefix from bundled appPath.
        expect(bundled(bundle, 'apps/demo/app.mjs')).toEqual({value: 'native entry'});
        expect(bundled(bundle, 'apps/demo/entry.mjs')).toMatchObject({code: 'MODULE_NOT_FOUND',
            message: expect.stringContaining('entry.mjs')})
    })
});
