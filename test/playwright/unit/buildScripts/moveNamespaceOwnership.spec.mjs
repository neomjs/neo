import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, expect}                 from '@playwright/test';
import {compile}                      from 'sass';
import {moduleInfo, moduleClassNames} from '../../../../buildScripts/util/moveSourceTransforms.mjs';
import {planMove, applyMove}          from '../../../../buildScripts/util/movePlan.mjs';

const repoRoot  = fileURLToPath(new URL('../../../../', import.meta.url)),
    source      = 'examples/functional/defineComponent/Component.mjs',
    destination = 'examples/functional/moved/Panel.mjs',
    oldName     = 'Neo.examples.functional.defineComponent.Component',
    newName     = 'Neo.examples.functional.moved.Panel';

/** @summary Records the complete small fixture tree, including installed package bytes, before a refusal. */
function snapshot(root) {
    const result = [];
    const visit  = directory => {
        for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(directory, entry.name), relative = path.relative(root, file);
            if (entry.isDirectory()) {
                result.push([relative, 'directory']);
                visit(file)
            } else result.push([relative, fs.readFileSync(file).toString('base64')])
        }
    };
    visit(root);
    return result
}

test.describe('move namespace ownership (#5086)', () => {
    let root;

    /** @summary Writes a temporary source module or style without importing the real Neo runtime. */
    const write = (relative, code) => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, code)
    };

    /** @summary Executes the fixture's relocated functional factory through a fresh Node module graph. */
    const execute = () => {
        const url = pathToFileURL(path.join(root, 'entry.mjs')).href;
        return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
            `const {default: component} = await import(${JSON.stringify(url)}); console.log(JSON.stringify({className: component.config.className, vdom: component.render()}));`
        ], {encoding: 'utf8'}))
    };

    test.beforeEach(() => {
        root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-move-namespace-'));
        write('package.json', '{"name":"neo.mjs","type":"module"}')
    });

    test.afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

    test('recognizes the shipped defineComponent example declaration without executing it', () => {
        const code = fs.readFileSync(path.join(repoRoot, source), 'utf8');

        expect(moduleInfo(code).classNames).toEqual([oldName]);
        expect(moduleClassNames(code)).toEqual([oldName])
    });

    for (const alias of [false, true]) {
        test(`moves an executable functional component and its SCSS through the ${alias ? 'aliased' : 'named'} Engine factory import`, () => {
            const binding = alias ? 'defineView' : 'defineComponent',
                imported  = alias ? 'defineComponent as defineView' : 'defineComponent';
            write('src/functional/_export.mjs', `export function defineComponent(spec) {
    return {config: spec.config, render: () => spec.createVdom(spec.config)};
}`);
            write(source, `import {${imported}} from '../../../src/functional/_export.mjs';
export default ${binding}({
    config: {className: '${oldName}', message: 'functional content'},
    createVdom(config) { return {text: config.message} }
});`);
            write('entry.mjs', `export {default} from './${source}';`);
            for (const surface of ['src', 'theme-light']) {
                write(`resources/scss/${surface}/examples/functional/defineComponent/Component.scss`,
                    '.functional-component { padding: 3px; }')
            }
            write('resources/scss/bundle.scss', `@use 'src/examples/functional/defineComponent/Component' as structural;
@use 'theme-light/examples/functional/defineComponent/Component' as themed;`);
            const original = execute(), css = compile(path.join(root, 'resources/scss/bundle.scss')).css,
                plan       = planMove({root, source, destination});

            expect(original).toEqual({className: oldName, vdom: {text: 'functional content'}});
            expect(plan.blockers).toEqual([]);
            applyMove(plan);
            expect(execute()).toEqual({...original, className: newName});
            expect(plan.classNames).toEqual([[oldName, newName]]);
            for (const surface of ['src', 'theme-light']) {
                expect(fs.existsSync(path.join(root, `resources/scss/${surface}/examples/functional/defineComponent/Component.scss`))).toBe(false);
                expect(fs.existsSync(path.join(root, `resources/scss/${surface}/examples/functional/moved/Panel.scss`))).toBe(true)
            }
            expect(compile(path.join(root, 'resources/scss/bundle.scss')).css).toBe(css)
        })
    }

    test('does not treat an unrelated same-named function as an Engine class declaration', () => {
        const code = `function defineComponent(spec) { return spec; }
export default defineComponent({config: {className: '${oldName}'}});`;
        write(source, code);
        write('resources/scss/src/examples/functional/defineComponent/Component.scss', '.unrelated { padding: 1px; }');
        const plan = planMove({root, source, destination});

        expect(moduleInfo(code).classNames).toEqual([]);
        expect(moduleClassNames(code)).toEqual([]);
        expect(plan.blockers).toEqual([]);
        expect(plan.classNames).toEqual([]);
        applyMove(plan);
        expect(fs.readFileSync(path.join(root, destination), 'utf8')).toBe(code);
        expect(fs.existsSync(path.join(root, 'resources/scss/src/examples/functional/defineComponent/Component.scss'))).toBe(true)
    });

    test('does not grant namespace ownership to an identically named factory from another package', () => {
        const code = `import {defineComponent} from '../../../vendor/factory.mjs';
export default defineComponent({config: {className: '${oldName}'}});`;

        expect(moduleInfo(code).classNames).toEqual([]);
        expect(moduleClassNames(code)).toEqual([])
    });

    test('refuses a destination namespace already declared by the installed Engine before any write', () => {
        write('package.json', '{"name":"namespace-consumer","type":"module"}');
        write('node_modules/neo.mjs/src/component/Existing.mjs',
            'export default class Existing { static config = {className: "Neo.component.Existing"} }');
        write('src/custom/Original.mjs',
            'export default class Original { static config = {className: "Neo.custom.Original"} }');
        const before = snapshot(root);

        expect(fs.existsSync(path.join(root, 'src/component/Existing.mjs'))).toBe(false);
        expect(() => applyMove(planMove({root, source: 'src/custom/Original.mjs',
            destination: 'src/component/Existing.mjs'}))).toThrow();
        expect(snapshot(root)).toEqual(before)
    });

    test('does not classify a shadowed factory binding or a lookalike Engine path', () => {
        const code = `import {defineComponent} from '../../../src/functional/_export.mjs';
export function create(defineComponent) { return defineComponent({config: {className: '${oldName}'}}); }`;
        expect(moduleInfo(code).classNames).toEqual([]);
        expect(moduleInfo(code.replace('export function create(defineComponent)', 'export function create()'), {
            file: path.join(root, 'vendor', source), engineRoot: root
        }).classNames).toEqual([])
    });

    test('invalidates a plan when an installed namespace appears after planning', () => {
        write('package.json', '{"name":"namespace-consumer","type":"module"}');
        write('src/custom/Original.mjs',
            'export default class Original { static config = {className: "Neo.custom.Original"} }');
        const plan = planMove({root, source: 'src/custom/Original.mjs', destination: 'src/component/Existing.mjs'});
        expect(plan.blockers).toEqual([]);
        write('node_modules/neo.mjs/src/component/Existing.mjs',
            'export default class Existing { static config = {className: "Neo.component.Existing"} }');
        const before = snapshot(root);
        expect(() => applyMove(plan)).toThrow(/dependency changed/);
        expect(snapshot(root)).toEqual(before)
    })
});
