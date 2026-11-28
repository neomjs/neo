import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import {tmpdir}                  from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';
import {findViolations}          from '../../../../buildScripts/util/check-coding-guidelines.mjs';

const guardPath = fileURLToPath(new URL('../../../../buildScripts/util/check-coding-guidelines.mjs', import.meta.url)),
      probeFile = 'src/test/Probe.mjs';

function classSource(members) {
    return `class Probe extends Base {
${members}
}
export default Neo.setupClass(Probe);`
}

function configSource(config) {
    return classSource(`static config = {
/** @member {String} className='Test.Probe' */
className: 'Test.Probe',
${config}
}`)
}

function rules(source, file = probeFile) {
    return findViolations(source, file).map(finding => finding.rule)
}

/** @summary Starts the real CLI in a checkout with one pre-existing violation and a recorded baseline. */
function withRecordedDebt(check) {
    const cwd      = fs.mkdtempSync(path.join(tmpdir(), 'neo guideline test ')),
          oldFile  = 'src/Probe.mjs',
          baseline = 'buildScripts/util/check-coding-guidelines-baseline.json',
          original = classSource('#redraw() {}'),
          git      = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {cwd}),
          commit   = message => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.org',
              '-c', 'commit.gpgsign=false', 'commit', '-qm', message),
          run      = (...args) => spawnSync(process.execPath, [guardPath, ...args], {
              cwd, encoding: 'utf8', env: {...process.env, BASE_SHA: ''}
          });

    try {
        git('init', '-q');
        fs.mkdirSync(path.join(cwd, 'src'));
        fs.mkdirSync(path.join(cwd, 'buildScripts/util'), {recursive: true});
        fs.writeFileSync(path.join(cwd, oldFile), original);
        git('add', oldFile);
        commit('Existing source');
        expect(run('--write-baseline').status).toBe(0);
        git('add', baseline);
        const bootstrap = run('--staged');
        expect(bootstrap.status, bootstrap.stderr).toBe(0);
        commit('Record existing debt');
        expect(run().status).toBe(0);
        check({cwd, oldFile, original, baseline, git, commit, run})
    } finally {
        fs.rmSync(cwd, {force: true, recursive: true})
    }
}

test.describe('coding guidelines for Neo classes', () => {
    test('requires setup for internal declarations and class expressions', () => {
        const source = `class Translation {}
export const create = () => class Swipe extends Base {};
const Press = class extends Base {};
class Registered extends Base {}
Neo.setupClass(Registered);`;

        expect(findViolations(source, probeFile)).toEqual([
            {file: probeFile, rule: 'neo-class-setup', name: 'Translation', line: 1},
            {file: probeFile, rule: 'neo-class-setup', name: 'Swipe', line: 2},
            {file: probeFile, rule: 'neo-class-setup', name: 'Press', line: 3}
        ])
    });

    test('requires a Neo superclass even when setup is present', () => {
        for (const inheritance of ['', ' extends Error', " extends globalThis['HTMLElement']", ' extends null']) {
            expect(rules(`class Probe${inheritance} {}\nNeo.setupClass(Probe);`)).toEqual(['neo-class-base'])
        }
        expect(rules(`class Local {}
class Probe extends Local {}
Neo.setupClass(Local);
Neo.setupClass(Probe);`)).toEqual(['neo-class-base', 'neo-class-base'])
    });

    test('accepts subclasses registered in the visible scope and the exact bootstrap root', () => {
        expect(rules(classSource(''))).toEqual([]);
        expect(rules('export default Neo.setupClass(class extends Base {});')).toEqual([]);
        expect(rules(`export function make() {
            const Local = class extends Base {};
            return Neo.setupClass(Local)
        }`)).toEqual([]);
        expect(rules(`import {Parent as Error} from './Parent.mjs';
            export default Neo.setupClass(class extends Error {});`)).toEqual([]);
        expect(rules(`import Neo from '../Neo.mjs';
            export default Neo.setupClass(class extends Base {});`)).toEqual([]);

        const bootstrap = 'class Base {}\nexport default Neo.setupClass(Base);';
        expect(rules(bootstrap, 'src/core/Base.mjs')).toEqual([]);
        expect(rules(bootstrap)).toEqual(['neo-class-base']);
        expect(rules('export default class Base {}', 'src/core/Base.mjs')).toEqual(['neo-class-setup'])
    });

    test('ignores lookalike setup calls and preserves class binding identity', () => {
        expect(rules(`class Probe extends Base {}
            function register(Neo) {return Neo.setupClass(Probe)}`)).toEqual(['neo-class-setup']);
        expect(rules(`import Neo from './fake.mjs';
            export default Neo.setupClass(class extends Base {});`)).toEqual(['neo-class-setup']);
        expect(rules(`class Probe extends Base {}
            function register(Probe) {return Neo.setupClass(Probe)}`)).toEqual(['neo-class-setup'])
    });

    test('credits setup only in the class execution context and outside dormant literal branches', () => {
        for (const statement of [
            'function unused() { Neo.setupClass(Probe); }',
            'if (false) Neo.setupClass(Probe);',
            'if (true) {} else Neo.setupClass(Probe);',
            'false && Neo.setupClass(Probe);',
            'true || Neo.setupClass(Probe);',
            'null === null && (false ? Neo.setupClass(Probe) : null);',
            'while (false) Neo.setupClass(Probe);',
            'for (; false; Neo.setupClass(Probe)) Neo.setupClass(Probe);'
        ]) {
            expect(rules(`export default class Probe extends Base {}
${statement}`), statement).toEqual(['neo-class-setup'])
        }

        expect(rules(`class Probe extends Base {}
if (true) { Neo.setupClass(Probe); }
export default Probe;`)).toEqual([]);
        expect(rules(`export function make() {
            class Local extends Base {}
            return Neo.setupClass(Local)
        }`)).toEqual([])
    });

    test('resolves loop and switch bindings before treating Neo as the class-system namespace', () => {
        const cases = [
            'for (const Neo of bindings) { Neo.setupClass(Probe); }',
            'for (let Neo = fake; enabled;) { Neo.setupClass(Probe); }',
            'for (let Neo in bindings) { Neo.setupClass(Probe); }',
            'switch (mode) { case 1: const Neo = fake; Neo.setupClass(Probe); break; }',
            'for (var Neo of bindings) {} Neo.setupClass(Probe);'
        ];

        for (const statement of cases) {
            expect(rules(`export default class Probe extends Base {}
${statement}`), statement).toEqual(['neo-class-setup'])
        }

        expect(rules(`switch (mode) {
            case 1: class Local extends Base {} Neo.setupClass(Local); break;
        }`)).toEqual([]);
        expect(rules(`for (const Neo of bindings) {}
            export default Neo.setupClass(class extends Base {});`)).toEqual([])
    });

    test('flags the documented forms that lose a default, description or tag in the generated API', () => {
        const invalid = [
            "/** @member {String[]} option=['a','b'] */",
            '/** @member {Object} option={width:3} */',
            '/** @member {Object} option=defaultOptions */',
            '/** @member {Map} option=new Map() */',
            "/** @member {Function} option=() => import('./view.mjs') */",
            '/** @member {Number} option=1 @protected */',
            "/** @member {String} option='hello world' */",
            '/**\n * @member {Object} option={width: 3}\n */',
            "/**\n * @member {String[]} option=['one two']\n */",
            '/**\n * @member {Object} option\n * @default {width:3}\n */',
            "/**\n * @member {String[]} option\n * @default ['a','b']\n */"
        ];

        for (const doc of invalid) {
            expect(rules(configSource(`${doc}\noption: null`)), doc).toContain('compact-jsdoc-loss')
        }
    });

    test('accepts lossless defaults, including a separate string default containing whitespace', () => {
        const valid = [
            "/** @member {String} option='neo' */",
            '/** @member {Object|null} option=null */',
            '/** @member {Number} option=3 The size */',
            '/** @member {Number} option=3 Shared by @emmy and the team */',
            "/**\n * @member {String[]} option=['a','b']\n */",
            '/**\n * @member {Object} option={width:3}\n */',
            "/**\n * @member {String} option\n * @default 'hello world'\n */",
            '/**\n * See {@link Neo.core.Base} for the owner.\n * @member {{width: Number}} option\n */'
        ];

        for (const doc of valid) {
            expect(rules(configSource(`${doc}\noption: null`)), doc).toEqual([])
        }
    });

    test('requires an attached config doc and a real reactive tag for a locally underscored declaration', () => {
        const source = configSource(`
            /** @member {String} color='red' */
            color: 'red',
            // Text in a line comment does not document this config.
            count: 0,
            /**
             * @member {Number} size_=2 Lost inline. @reactive
             */
            size_: 2
        `);
        const findings = findViolations(source, probeFile);

        expect(findings.map(({rule}) => rule)).toEqual(expect.arrayContaining([
            'compact-jsdoc-loss', 'local-reactive-tag', 'missing-config-jsdoc'
        ]));
        const missing = findings.filter(({rule}) => rule === 'missing-config-jsdoc');
        expect(missing).toHaveLength(1);
        expect(missing[0]).toMatchObject({
            file: probeFile,
            line: source.split('\n').findIndex(line => line.includes('count: 0')) + 1
        })
    });

    test('accepts inherited reactive tags, locally reactive arrays, ordinary subclass overrides and private fields', () => {
        const source = classSource(`
            static config = {
                /** @member {String} className='Test.Probe' */
                className: 'Test.Probe',
                /** @member {String} ntype='probe' */
                ntype: 'probe',
                /** @member {Object} commonConfig */
                commonConfig: {text: 'Subclass override'},
                /**
                 * @member {Object} layout
                 * @reactive
                 */
                layout: {ntype: 'hbox'},
                /**
                 * @member {Object[]} taskColumns_
                 * @reactive
                 */
                taskColumns_: [{type: 'tree', width: 260}],
                /** @member {Object} _vdom */
                _vdom: {cn: [{tag: 'span'}]}
            }
            #rippleTimeoutId = null
        `);

        expect(rules(source)).toEqual([])
    });

    test('the content container inherits reactive layout from its parent', () => {
        const file   = 'src/app/content/Container.mjs',
              source = fs.readFileSync(new URL('../../../../' + file, import.meta.url), 'utf8'),
              line   = source.split('\n').findIndex(value => /^\s*layout:/.test(value)) + 1;

        expect(source).toMatch(/@reactive\s*\n\s*\*\/\s*layout:/);
        expect(line).toBeGreaterThan(0);
        expect(findViolations(source, file)).not.toContainEqual(expect.objectContaining({line, rule: 'local-reactive-tag'}))
    });

    test('catches misplaced className, ntype, alphabetical keys and a non-terminal vdom', () => {
        for (const keys of [
            ['z', 'className'], ['className', 'foo', 'ntype'],
            ['className', 'b', 'a'], ['className', '_vdom', 'a']
        ]) {
            const declarations = keys.map(key => `/** @member {Object} ${key} */\n${key}: {}`).join(',\n');

            expect(rules(classSource(`static config = {\n${declarations}\n}`)), keys.join(','))
                .toContain('static-config-order')
        }
    });

    test('finds explicit divs in VDOM nodes while leaving records with a tag property alone', () => {
        for (const entry of [
            "_vdom: {cn: [{tag: 'div'}]}",
            "vdom: {tag: 'div'}",
            "itemTpl_: {cn: [{tag: 'div'}]}",
            "itemTpl: data => [{tag: 'div', text: data.label}]"
        ]) {
            expect(rules(configSource(`/** @member {Object} ${entry.split(':')[0]} */\n${entry}`)), entry)
                .toContain('redundant-vdom-div')
        }
        expect(rules(configSource("/** @member {Object[]} data */\ndata: [{tag: 'div'}]"))).toEqual([])
    });

    test('checks VDOM in an application entry module while leaving application data unchanged', () => {
        const source = `const data = [{tag: 'div'}];
Neo.app({mainView: {ntype: 'container', data, items: [
    {ntype: 'component', vdom: {cn: [{tag: 'div'}]}}
]}});`;
        const findings = findViolations(source, 'apps/example/app.mjs');
        expect(findings.map(({rule, line}) => [rule, line])).toEqual([['redundant-vdom-div', 3]])
    });

    test('keeps behavior overridable and checks only calls to the instance merger inside construct', () => {
        const methods = `
            #redraw() {}
            mergeConfig(config) {return super.mergeConfig(config)}
            construct(config) {
                const me = this;
                me.mergeConfig(config);
                this.mergeConfig(config)
            }
        `;
        const findings = rules(classSource(methods));

        expect(findings.filter(rule => rule === 'no-private-methods')).toHaveLength(1);
        expect(findings.filter(rule => rule === 'leaf-merge-config')).toHaveLength(3);
        expect(rules(classSource('#preDestroyHook() {}'))).toEqual(['no-private-methods']);
        expect(rules(classSource(`
            construct(config) {return Neo.mergeConfig({}, config)}
            hydrate(source) {return source.mergeConfig({})}
        `))).toEqual([]);
        expect(rules(classSource(`
            construct(other) {
                const me = other;
                me.mergeConfig();
                return function() { return this.mergeConfig() }.call(other)
            }
        `))).toEqual([]);
        expect(rules(classSource(`
            construct(other) {
                const me = this;
                { const me = other; me.mergeConfig() }
                return () => me.mergeConfig()
            }
        `))).toEqual(['leaf-merge-config']);
        expect(rules(classSource(`
            construct(other) {
                let me = this;
                me = other;
                me.mergeConfig()
            }
        `))).toEqual([]);
        expect(rules('class Ordinary { #local() {} }')).toEqual(['neo-class-setup']);
        expect(rules('class Incomplete {')).toEqual([])
    });

    test('keeps the existing class-system invariant and the four owners of instance config merging', () => {
        const root = new URL('../../../../', import.meta.url);
        for (const file of ['src/core/Base.mjs', 'src/component/Base.mjs', 'src/container/Base.mjs', 'src/form/field/Text.mjs']) {
            const source = fs.readFileSync(new URL(file, root), 'utf8');

            expect(source, file).toMatch(/^    mergeConfig\(/m);
            expect(rules(source, file), file).not.toContain('leaf-merge-config');
            if (file === 'src/core/Base.mjs') {
                const invariantLine = source.split('\n').findIndex(line => line.startsWith('    #preDestroyHook()')) + 1;
                expect(invariantLine).toBeGreaterThan(0);
                expect(findViolations(source, file)).not.toContainEqual(expect.objectContaining({
                    line: invariantLine, rule: 'no-private-methods'
                }))
            }
        }
    });

    test('checks the Git index on commit, finds new and stale entries, and accounts for renames and deletions', () => {
        withRecordedDebt(({cwd, oldFile, original, baseline, git, run}) => {
            const newFile = 'src/Renamed.mjs';
            fs.writeFileSync(path.join(cwd, oldFile), classSource('#secondAction() {}'));
            git('add', oldFile);
            fs.writeFileSync(path.join(cwd, oldFile), original);

            const staged = run('--staged');
            expect(staged.status, staged.stderr).toBe(1);
            expect(staged.stderr).toContain(oldFile);
            expect(staged.stderr).toContain('§8');
            expect(run().status).toBe(0);

            fs.renameSync(path.join(cwd, oldFile), path.join(cwd, newFile));
            git('add', '-A');
            const rename = run('--staged');
            expect(rename.status, rename.stderr).toBe(1);
            expect(rename.stderr).toContain(oldFile);
            expect(rename.stderr).toContain(newFile);

            fs.rmSync(path.join(cwd, newFile));
            git('add', '-A');
            const removed = run('--staged');
            expect(removed.status, removed.stderr).toBe(1);
            expect(removed.stderr).toContain(oldFile);
            expect(run('--write-baseline').status).toBe(0);
            git('add', baseline);
            expect(run('--staged').status).toBe(0);

            const docsFile = 'docs/app/Probe.mjs';
            fs.mkdirSync(path.join(cwd, 'docs/app'), {recursive: true});
            fs.writeFileSync(path.join(cwd, docsFile), classSource(`
                static config = {
                    z_: false,
                    /** @member {Object} a={} */
                    a: {},
                    /** @member {Object} _vdom */
                    _vdom: {tag: 'div'}
                }
                #redraw() {}
                mergeConfig() {}
            `));
            git('add', docsFile);
            const report = run(docsFile).stderr.split('\n');
            for (const [rule, section] of [
                ['compact-jsdoc-loss', '§12'], ['local-reactive-tag', '§5'], ['missing-config-jsdoc', '§4'],
                ['static-config-order', '§5'], ['redundant-vdom-div', '§6'],
                ['no-private-methods', '§8'], ['leaf-merge-config', '§8']
            ]) {
                const diagnostic = report.find(line => line.includes(`[${rule}]`));
                expect(diagnostic, rule).toContain(docsFile);
                expect(diagnostic, rule).toContain('.github/CODING_GUIDELINES.md');
                expect(diagnostic, rule).toContain(section)
            }
        })
    });

    test('defers unparseable source to check-parse and refuses to regenerate an incomplete baseline', () => {
        withRecordedDebt(({cwd, oldFile, baseline, git, run}) => {
            const baselinePath = path.join(cwd, baseline),
                  before       = fs.readFileSync(baselinePath);
            fs.writeFileSync(path.join(cwd, oldFile), 'class Probe { #redraw(');
            git('add', oldFile);

            for (const result of [run(), run('--staged')]) {
                expect(result.status, result.stderr).toBe(0);
                expect(result.stderr).not.toContain('retired')
            }
            const regenerate = run('--write-baseline');
            expect(regenerate.status, regenerate.stderr).toBe(1);
            expect(regenerate.stderr).toContain(oldFile);
            expect(fs.readFileSync(baselinePath)).toEqual(before)
        })
    });

    test('a regenerated baseline cannot admit a private method introduced in the same commit', () => {
        withRecordedDebt(({cwd, oldFile, baseline, git, run}) => {
            fs.writeFileSync(path.join(cwd, oldFile), classSource('#redraw() {}\n#newDebt() {}'));
            git('add', oldFile);
            expect(run('--write-baseline').status).toBe(0);
            git('add', baseline);

            const result = run('--staged');
            expect(result.status, result.stderr).toBe(1);
            expect(result.stderr).toContain(oldFile);
            expect(result.stderr).toContain('newDebt')
        })
    });

    test('a regenerated baseline cannot admit an unregistered helper introduced in the same commit', () => {
        withRecordedDebt(({cwd, oldFile, original, baseline, git, run}) => {
            fs.writeFileSync(path.join(cwd, oldFile), original + '\nclass Translation {}');
            git('add', oldFile);
            expect(run('--write-baseline').status).toBe(0);
            git('add', baseline);

            const result = run('--staged');
            expect(result.status, result.stderr).toBe(1);
            expect(result.stderr).toContain('[neo-class-setup] Translation');
            expect(result.stderr).toContain('absent from the base revision')
        })
    });

    test('an unparseable prior source cannot certify a new baseline exception', () => {
        withRecordedDebt(({cwd, oldFile, baseline, git, commit, run}) => {
            fs.writeFileSync(path.join(cwd, oldFile), 'class Probe {');
            fs.writeFileSync(path.join(cwd, baseline), '{}');
            git('add', oldFile, baseline);
            commit('Malformed prior source');
            fs.writeFileSync(path.join(cwd, oldFile), classSource('#newDebt() {}'));
            git('add', oldFile);
            expect(run('--write-baseline').status).toBe(0);
            git('add', baseline);
            const result = run('--staged');
            expect(result.status, result.stderr).toBe(1);
            expect(result.stderr).toContain('newDebt')
        })
    })
});
