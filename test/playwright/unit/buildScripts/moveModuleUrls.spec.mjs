import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, expect}                 from '@playwright/test';
import {rewriteModule}                from '../../../../buildScripts/util/moveSourceTransforms.mjs';
import {classifyReferences}           from '../../../../buildScripts/util/moveReferenceScopes.mjs';
import {planMove, applyMove}          from '../../../../buildScripts/util/movePlan.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

test.describe('module-relative URL and filesystem references (#5086)', () => {
    let root;

    /** @summary Executes only a synthetic path-producing module in a fresh Node process. */
    const execute = (file, code) => {
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, code);
        return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
            `const {default: value} = await import(${JSON.stringify(pathToFileURL(file).href)}); console.log(JSON.stringify(value));`
        ], {encoding: 'utf8'}))
    };

    /** @summary Relocates an importer and optional resource targets using the public source-transform API. */
    const transform = (code, {from='tools/Source.mjs', to='tools/deeper/Source.mjs', targets=[]}={}) => {
        from = path.join(root, from);
        to = path.join(root, to);
        const moves = [[from, to], ...targets.map(([before, after]) => [path.join(root, before), path.join(root, after)])],
            mapPath = file => {
                const move = moves.find(([before]) => file === before || file.startsWith(before + path.sep));
                return move ? path.join(move[1], path.relative(move[0], file)) : file
            };
        return {from, to, moves: moves.map(([from, to]) => ({from, to})),
            result: rewriteModule({code, from, to, mapPath})}
    };

    test.beforeEach(() => {
        root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-move-module-url-'))
    });

    test.afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

    test('retains the real create/theme command target when that importer moves deeper', () => {
        const from = path.join(repoRoot, 'buildScripts/create/theme.mjs'),
            to     = path.join(repoRoot, 'buildScripts/create/deeper/theme.mjs'),
            code   = fs.readFileSync(from, 'utf8'),
            result = rewriteModule({code, from, to, mapPath: file => file}),
            match  = /new URL\((['"])(.*?)\1,\s*import\.meta\.url\)/.exec(result.code);

        expect(match).not.toBeNull();
        expect(fileURLToPath(new URL(match[2], pathToFileURL(to)))).toBe(path.join(repoRoot, 'buildScripts/build/themes.mjs'));
        expect(result.references.some(reference => reference.specifier === '../build/themes.mjs')).toBe(true)
    });

    test('rewrites a URL resource with query/hash while preserving unrelated source bytes', () => {
        const code = '/* ./asset.json?mode=1#data */\nexport default new URL("./asset.json?mode=1#data", import.meta.url);\n' +
                'const prose = "./asset.json?mode=1#data";\n',
            {from, to, result} = transform(code, {targets: [['tools/asset.json', 'resources/renamed.json']]}),
            expected = pathToFileURL(path.join(root, 'resources/renamed.json'));
        expected.search = '?mode=1';
        expected.hash = '#data';

        expect(execute(from, code)).toBe(pathToFileURL(path.join(root, 'tools/asset.json')).href + '?mode=1#data');
        expect(execute(to, result.code)).toBe(expected.href);
        const references = result.references.filter(reference => reference.specifier === './asset.json?mode=1#data');
        expect(references).toHaveLength(1);
        const {start, end} = references[0];
        expect(code.slice(start, end)).toBe('"./asset.json?mode=1#data"');
        expect(result.code.startsWith(code.slice(0, start))).toBe(true);
        expect(result.code.endsWith(code.slice(end))).toBe(true)
    });

    test('treats a URL without a dot prefix as a relative path rather than a package specifier', () => {
        const code             = 'export default new URL("assets/schema.json", import.meta.url);',
            {from, to, result} = transform(code), before = execute(from, code);

        expect(execute(to, result.code)).toBe(before)
    });

    test('counts a fileURLToPath-wrapped URL once and supports the imported URL constructor alias', () => {
        const code = 'import {URL as ModuleURL, fileURLToPath as asPath} from "node:url";\n' +
                'export default asPath(new ModuleURL("./asset%20name.json", import.meta.url));',
            {from, to, result} = transform(code), before = execute(from, code);

        expect(execute(to, result.code)).toBe(before);
        expect(result.references.filter(reference => reference.specifier === './asset%20name.json')).toHaveLength(1)
    });

    test('rebases multi-segment node:path.resolve with an import alias using filesystem filename semantics', () => {
        const code = 'import {resolve as locate} from "node:path";\n' +
                'export default locate(import.meta.dirname, "..", "assets", "schema #1?.json");',
            {from, to, result} = transform(code, {targets: [['assets/schema #1?.json', 'data/new #2?.json']]});

        expect(execute(from, code)).toBe(path.join(root, 'assets/schema #1?.json'));
        expect(execute(to, result.code)).toBe(path.join(root, 'data/new #2?.json'));
        expect(result.code).not.toContain('%23');
        expect(result.code).not.toContain('%3F')
    });

    test('rewrites the genuine node:path receiver but leaves a same-named parameter untouched', () => {
        const shadow           = 'export function local(path) { return path.resolve(import.meta.dirname, "./asset.json"); }',
            code               = 'import path from "node:path";\nexport default path.resolve(import.meta.dirname, "./asset.json");\n' + shadow,
            {from, to, result} = transform(code), before = execute(from, code);

        expect(execute(to, result.code)).toBe(before);
        expect(result.code).toContain(shadow)
    });

    test('rewrites the global URL constructor but leaves a same-named parameter untouched', () => {
        const shadow           = 'export function local(URL) { return new URL("./asset.json", import.meta.url); }',
            code               = 'export default new URL("./asset.json", import.meta.url);\n' + shadow,
            {from, to, result} = transform(code), before = execute(from, code);

        expect(execute(to, result.code)).toBe(before);
        expect(result.code).toContain(shadow)
    });

    for (const [label, expression] of [
        ['unknown URL value', 'new URL(name, import.meta.url)'],
        ['computed URL template', 'new URL(`./assets/${name}.json`, import.meta.url)'],
        ['computed filesystem segment', 'path.resolve(import.meta.dirname, "assets", name)']
    ]) {
        test(`retains ${label} as an unresolved source-bound reference`, () => {
            const code                    = `import path from "node:path";\nexport const locate = name => ${expression};`,
                {from, to, moves, result} = transform(code),
                records                   = classifyReferences({root, file: from, to, code, references: result.unresolved, moves});

            expect(result.code).toBe(code);
            expect(records.length).toBeGreaterThan(0);
            expect(records.every(record => record.status === 'blocked')).toBe(true);
            expect(records.some(record => code.slice(record.start, record.end) === record.expression &&
                record.expression.includes('name') && /^[a-f0-9]{64}$/.test(record.sourceHash))).toBe(true)
        })
    }

    test('keeps external URLs, direct module identity and unrelated resolver bindings untouched', () => {
        const code = 'import path from "custom-resolver";\nimport {fileURLToPath} from "node:url";\n' +
                'const ownFile = fileURLToPath(import.meta.url);\n' +
                'const remote = new URL("https://example.test/asset.json", import.meta.url);\n' +
                'const other = path.resolve(import.meta.dirname, "./asset.json");\n' +
                'function custom(URL) { return new URL("./asset.json", import.meta.url); }',
            {result} = transform(code);

        expect(result.code).toBe(code);
        expect(result.unresolved).toEqual([])
    });

    test('respects named expressions, hoisted vars and loop-local URL bindings', () => {
        const code = `export const self = function URL() { return new URL('./asset.json', import.meta.url); };
export function hoisted(condition) {
    if (condition) { var URL = condition; }
    return new URL('./asset.json', import.meta.url);
}
for (const URL of []) { new URL('./asset.json', import.meta.url); }`,
            {result} = transform(code);

        expect(result.code).toBe(code);
        expect(result.references).toEqual([])
    });

    test('a computed module URL blocks planner application instead of disappearing from its census', () => {
        fs.mkdirSync(path.join(root, 'src/old'), {recursive: true});
        fs.writeFileSync(path.join(root, 'src/old/Value.mjs'), 'export const value = 1;');
        fs.writeFileSync(path.join(root, 'src/loader.mjs'), 'export const locate = name => new URL(name, import.meta.url);');
        const plan = planMove({root, source: 'src/old', destination: 'src/new'});

        expect(plan.blockers.length).toBeGreaterThan(0);
        expect(() => applyMove(plan)).toThrow(/unresolved/i);
        expect(fs.existsSync(path.join(root, 'src/old/Value.mjs'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'src/new'))).toBe(false)
    });

    test('imports a moved module through its static URL without a duplicate computed-import blocker', () => {
        const code             = 'export default (await import(new URL("./Value.mjs", import.meta.url).href)).value;',
            {from, to, result} = transform(code, {targets: [['tools/Value.mjs', 'data/Value.mjs']]});
        fs.mkdirSync(path.join(root, 'tools'), {recursive: true});
        fs.writeFileSync(path.join(root, 'tools/Value.mjs'), 'export const value = 42;');
        expect(execute(from, code)).toBe(42);
        fs.mkdirSync(path.join(root, 'data'), {recursive: true});
        fs.renameSync(path.join(root, 'tools/Value.mjs'), path.join(root, 'data/Value.mjs'));
        expect(execute(to, result.code)).toBe(42);
        expect(result.unresolved).toEqual([]);
        expect(result.references).toHaveLength(1)
    })
});
