import {parse}                              from 'acorn';
import fs                                   from 'node:fs';
import os                                   from 'node:os';
import path                                 from 'node:path';
import {fileURLToPath}                      from 'node:url';
import {test, expect}                       from '@playwright/test';
import {nativeReferenceSites}               from '../../../../buildScripts/util/moveNativeReferences.mjs';
import {planMove, applyMove}                from '../../../../buildScripts/util/movePlan.mjs';
import {sourceHash}                         from '../../../../buildScripts/util/moveReferenceScopes.mjs';
import {keyName, rewriteModule, visitNodes} from '../../../../buildScripts/util/moveSourceTransforms.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url)),
    cases  = [
        ['docs/app/view/MainContainerController.mjs', 'onExamplesListLeafClick', 'docs/examples.json:path', ['record.path', 'path']],
        ['src/container/Base.mjs', 'loadItems', 'loadItems:modules', ['modulePath']],
        ['src/worker/App.mjs', 'createNeoInstance', 'createNeoInstance:importPath', ['config.importPath']],
        ['src/worker/App.mjs', 'loadModule', 'App.loadModule:path', ['path']],
        ['src/worker/App.mjs', 'importApp', 'neo-config.json:appPath', ['`../../${path}.mjs`']]
    ];

/** @summary Locates a current method and its actual import arguments without executing its module. */
function inspectMethod(code, name) {
    let method;
    visitNodes(parse(code, {ecmaVersion: 'latest', sourceType: 'module'}), node => {
        if (node.type === 'MethodDefinition' && keyName(node.key) === name) method = node
    });
    const imports = [];
    visitNodes(method, node => {
        if (node.type === 'ImportExpression') imports.push({start: node.source.start,
            expression: code.slice(node.source.start, node.source.end)})
    });
    return {method, imports}
}

/** @summary Applies the narrow adapter to canonical Engine files, with an optional complete path mapping. */
const sites = (code, file, mapPath=value => value) => nativeReferenceSites({code, file, root, engineRoot: root, mapPath});

test.describe('pinned native reference readers (#5086)', () => {
    for (const [relative, name, carrier, expressions] of cases) {
        test(`${relative} ${name} requires its current method bytes and an unmoved canonical reader`, () => {
            const file            = path.join(root, relative), code = fs.readFileSync(file, 'utf8'),
                {method, imports} = inspectMethod(code, name), current = sites(code, file);

            expect(imports.map(item => item.expression)).toEqual(expressions);
            for (const reference of imports) expect(current.get(reference.start),
                `${relative}#${name} (${carrier}): inspect its resolution origin and Webpack include/exclude rules before re-pinning the complete method, including comments`).toBe(carrier);

            // File offsets may change without changing the inspected method implementation.
            const shiftedCode = '// unrelated file comment\n' + code,
                shifted       = sites(shiftedCode, file), shiftedMethod = inspectMethod(shiftedCode, name);
            for (const reference of shiftedMethod.imports) expect(shifted.get(reference.start)).toBe(carrier);

            for (const insertion of ['\n        void 0;', '\n        import(extraPath);', '\n        /* webpackInclude: /changed/ */']) {
                const offset      = method.value.body.start + 1,
                    changed       = code.slice(0, offset) + insertion + code.slice(offset),
                    changedMethod = inspectMethod(changed, name), recognized = sites(changed, file);

                expect(changedMethod.imports.length).toBe(imports.length + Number(insertion.includes('import(')));
                expect([...recognized.keys()].filter(start => start >= changedMethod.method.start && start < changedMethod.method.end),
                    'a changed method grants no reader exemptions').toEqual([]);
                expect(recognized.size).toBe(current.size - imports.length)
            }

            expect(sites(code, file, value => value === file ? file + '.moved' : value).size).toBe(0);
            expect(sites(code, path.join(root, 'unrelated', path.basename(file))).size).toBe(0)
        })
    }

    test('exposes exactly six argument offsets across the five inspected carrier adapters', () => {
        const recognized = [];
        for (const relative of [...new Set(cases.map(item => item[0]))]) {
            const file     = path.join(root, relative), code = fs.readFileSync(file, 'utf8'),
                adapters   = sites(code, file),
                unresolved = rewriteModule({code, from: file, to: file, mapPath: value => value}).unresolved;

            expect([...adapters.keys()].every(start => unresolved.some(reference => reference.start === start))).toBe(true);
            recognized.push(...adapters.values())
        }
        expect(recognized.sort()).toEqual([
            'App.loadModule:path', 'createNeoInstance:importPath', 'docs/examples.json:path',
            'docs/examples.json:path', 'loadItems:modules', 'neo-config.json:appPath'
        ].sort())
    });

    test('does not authorize an identical method copied into a different declaring class', () => {
        const file   = path.join(root, 'src/worker/App.mjs'), code = fs.readFileSync(file, 'utf8'),
            {method} = inspectMethod(code, 'loadModule'),
            changed  = code + '\nclass Other {\n' + code.slice(method.start, method.end) + '\n}\n',
            original = sites(code, file), recognized = sites(changed, file);

        expect([...recognized]).toEqual([...original]);
        expect([...recognized.keys()].some(start => start >= code.length)).toBe(false)
    });

    test('uses engineRoot for installed readers and workspace root for the Docs reader', () => {
        const workspace = path.resolve('native-reader-workspace'), engineRoot = path.join(workspace, 'node_modules/neo.mjs');
        for (const [relative, name, carrier] of cases) {
            const code     = fs.readFileSync(path.join(root, relative), 'utf8'),
                file       = path.join(relative.startsWith('docs/') ? workspace : engineRoot, relative),
                recognized = nativeReferenceSites({code, file, root: workspace, engineRoot, mapPath: value => value});
            for (const reference of inspectMethod(code, name).imports) expect(recognized.get(reference.start)).toBe(carrier)
        }
    });

    test('partitions native, external, declared and opaque caller references in one real planner invocation', () => {
        const workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-move-partition-')),
            code        = 'export const remote = name => import(`https://example.test/${name}`);\n' +
                'export const plugin = target => import(target);',
            write = (file, value) => {
                const target = path.join(workspace, file);
                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, value)
            };
        try {
            write('package.json', '{"name":"neo.mjs","type":"module"}');
            write('src/container/Base.mjs', fs.readFileSync(path.join(root, 'src/container/Base.mjs')));
            write('src/old/Widget.mjs', 'export const value = 42;');
            write('layout.json', '{"modules":["src/old/Widget.mjs"],"items":[]}');
            write('src/domains.mjs', code);
            write('src/caller.mjs', 'export const create = config => Neo.worker.App.createNeoInstance(config);');
            const plan = planMove({root: workspace, source: 'src/old', destination: 'src/new', referenceScopes: [{
                file      : 'src/domains.mjs', start: code.indexOf('import(target)') + 7, expression: 'target',
                sourceHash: sourceHash(code), roots: ['plugins']
            }]});

            expect(plan.referenceLedger.map(record => record.status).sort())
                .toEqual(['blocked', 'carrier-resolved', 'declared', 'external']);
            expect(plan.blockers).toHaveLength(1);
            expect(plan.blockers[0].expression).toBe('config');
            expect(plan.rewrites.find(record => record.from === path.join(workspace, 'layout.json')).after.toString())
                .toContain('src/new/Widget.mjs');
            expect(() => applyMove(plan)).toThrow(/unresolved/);
            expect(fs.existsSync(path.join(workspace, 'src/old/Widget.mjs'))).toBe(true)
        } finally {
            fs.rmSync(workspace, {recursive: true, force: true})
        }
    });

    test('does not authorize Canvas, Data, Task or MicroLoader imports', () => {
        for (const relative of ['src/worker/Canvas.mjs', 'src/worker/Data.mjs', 'src/worker/Task.mjs', 'src/MicroLoader.mjs']) {
            const file = path.join(root, relative);
            expect(sites(fs.readFileSync(file, 'utf8'), file).size, relative).toBe(0)
        }
    })
});
