import {test, expect}            from '@playwright/test';
import {spawnSync}               from 'node:child_process';
import {createHash}              from 'node:crypto';
import fs                        from 'node:fs';
import os                        from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';
import {assertInteractivePrompt} from '../../../../../buildScripts/util/assertInteractivePrompt.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * @summary Captures a deterministic recursive directory snapshot (`[relPath, kindOrSha256]`) so non-TTY failure
 * tests prove zero partial `mkdir` or `writeFile` side effects occurred.
 * @param {String} dir
 * @returns {Array<[String, String]>}
 */
function snapshot(dir) {
    const entries = [];

    function visit(folder) {
        for (const name of fs.readdirSync(folder).sort()) {
            const file = path.join(folder, name),
                  stat = fs.lstatSync(file),
                  rel  = path.relative(dir, file);

            if (stat.isSymbolicLink()) {
                entries.push([rel, `link:${fs.readlinkSync(file)}`]);
            } else if (stat.isDirectory()) {
                entries.push([rel, 'dir']);
                visit(file);
            } else {
                entries.push([rel, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
            }
        }
    }

    visit(dir);
    return entries;
}

/**
 * @summary Creates a disposable consumer workspace wired to the repository's `node_modules` and `src`/`resources`
 * without touching the checkout tree.
 * @returns {String}
 */
function createWorkspaceFixture() {
    const root      = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nontty-guard-'))),
          engineDir = path.join(root, 'node_modules/neo.mjs');

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        bugs   : {url: 'https://github.com/neomjs/neo/issues'},
        name   : 'nontty-fixture',
        version: '1.0.0'
    }));

    fs.mkdirSync(path.join(root, 'node_modules'), {recursive: true});
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules/webpack'), path.join(root, 'node_modules/webpack'), 'dir');

    fs.mkdirSync(engineDir, {recursive: true});
    fs.copyFileSync(path.join(REPO_ROOT, 'package.json'), path.join(engineDir, 'package.json'));
    fs.symlinkSync(path.join(REPO_ROOT, 'buildScripts'), path.join(engineDir, 'buildScripts'), 'dir');
    fs.symlinkSync(path.join(REPO_ROOT, 'resources'), path.join(engineDir, 'resources'), 'dir');
    fs.symlinkSync(path.join(REPO_ROOT, 'src'), path.join(engineDir, 'src'), 'dir');

    fs.mkdirSync(path.join(root, 'apps/myapp/view'), {recursive: true});
    fs.writeFileSync(path.join(root, 'apps/myapp/view/Sample.mjs'), [
        "import Base from '../../../../node_modules/neo.mjs/src/container/Base.mjs';",
        '',
        'class Sample extends Base {',
        '    static config = {',
        "        className: 'MyApp.view.Sample'",
        '    }',
        '}',
        '',
        'export default Neo.setupClass(Sample);',
        ''
    ].join('\n'));

    fs.mkdirSync(path.join(root, 'buildScripts'), {recursive: true});
    fs.writeFileSync(path.join(root, 'buildScripts/myApps.json'), JSON.stringify({apps: ['MyApp']}));

    return root;
}

test.describe('buildScripts/util/assertInteractivePrompt (#21482)', () => {
    test('allows interactive TTY sessions or fully resolved question lists and throws on unresolved non-TTY prompts', () => {
        expect(() => assertInteractivePrompt({
            command  : 'npm run build-themes -- -n -e dev -t all',
            isTTY    : false,
            questions: []
        })).not.toThrow();

        expect(() => assertInteractivePrompt({
            command  : 'npm run build-themes -- -n -e dev -t all',
            isTTY    : true,
            questions: [{name: 'themes'}, {name: 'env'}]
        })).not.toThrow();

        expect(() => assertInteractivePrompt({
            command  : 'npm run build-themes -- -n -e dev -t all',
            isTTY    : false,
            questions: [{name: 'themes'}, {name: 'env'}]
        })).toThrow(
            'Unattended non-TTY execution cannot prompt for: themes, env.\n' +
            'Pass explicit CLI flags instead: npm run build-themes -- -n -e dev -t all'
        );

        expect(() => assertInteractivePrompt({
            command: 'npm run create-class -- -c MyApp.view.Main -b container.Base -n no -C no -p no',
            isTTY  : undefined,
            missing: ['className (-c)', 'singleton (-n)']
        })).toThrow('className (-c), singleton (-n)');
    });

    test('all 8 inquirer buildScripts fail fast before any filesystem write on non-TTY stdin when required flags are omitted', () => {
        const root   = createWorkspaceFixture(),
              before = snapshot(root);

        const cases = [
            {
                script  : 'buildScripts/build/all.mjs',
                args    : [],
                expected: 'npm run build-all -- -e dev -l no -t yes -w yes -p no'
            },
            {
                script  : 'buildScripts/build/all.mjs',
                args    : ['-e', 'dev', '-l', 'no', '-w', 'no', '-p', 'no'],
                expected: 'Unattended non-TTY execution cannot prompt for: themes.'
            },
            {
                script  : 'buildScripts/build/themes.mjs',
                args    : ['-f'],
                expected: 'npm run build-themes -- -n -e dev -t all'
            },
            {
                script  : 'buildScripts/webpack/buildThreads.mjs',
                args    : ['-f'],
                expected: 'npm run build-threads -- -n -e dev -t all'
            },
            {
                script  : 'buildScripts/create/addConfig.mjs',
                args    : ['-c', 'MyApp.view.Sample'],
                expected: 'npm run add-config -- -c MyApp.view.MainContainer -n myConfig -t String -d null -h none'
            },
            {
                script  : 'buildScripts/create/app.mjs',
                args    : ['-a', 'NewApp'],
                expected: 'npm run create-app -- -a MyApp -t all -u no'
            },
            {
                script  : 'buildScripts/create/appMinimal.mjs',
                args    : ['-a', 'NewMinimalApp', '-t', 'none', '-u', 'no'],
                expected: 'npm run create-app-minimal -- -a MyApp -t all -u no -s no'
            },
            {
                script  : 'buildScripts/create/class.mjs',
                args    : [],
                expected: 'npm run create-class -- -c MyApp.view.MainContainer -b container.Base -n no -C no -p no'
            },
            {
                script  : 'buildScripts/create/class.mjs',
                args    : ['-c', 'MyApp.model.User', '-b', 'data.Model', '-n', 'no'],
                expected: 'createStore (-m)'
            },
            {
                script  : 'buildScripts/create/class.mjs',
                args    : ['-c', 'MyApp.store.Users', '-b', 'data.Store', '-n', 'no'],
                expected: 'createModel (-M)'
            },
            {
                script  : 'buildScripts/create/class.mjs',
                args    : ['-c', 'MyApp.view.Dashboard', '-b', 'container.Base', '-n', 'no'],
                expected: 'createController (-C), createStateProvider (-p)'
            },
            {
                script  : 'buildScripts/create/component.mjs',
                args    : ['-c', 'MyApp.view.Card', '-b', 'component.Base', '-n', 'no'],
                expected: 'createController (-C), createStateProvider (-p)'
            }
        ];

        try {
            for (const {script, args, expected} of cases) {
                const result = spawnSync(process.execPath, [path.join(REPO_ROOT, script), ...args], {
                    cwd     : root,
                    encoding: 'utf8',
                    stdio   : 'pipe',
                    timeout : 5000
                });

                expect(result.error, `${script} ${args.join(' ')}`).toBeUndefined();
                expect(result.signal, `${script} ${args.join(' ')} exited without hanging`).toBeNull();
                expect(result.status, `${script} ${args.join(' ')} failed fast`).toBeGreaterThan(0);
                expect(result.stderr + result.stdout, `${script} ${args.join(' ')} hint`).toContain(expected);
                expect(snapshot(root), `${script} ${args.join(' ')} wrote nothing`).toEqual(before);
            }
        } finally {
            fs.rmSync(root, {force: true, recursive: true});
        }
    });

    test('non-TTY invocations succeed when all required CLI flags are explicitly supplied', () => {
        const root = createWorkspaceFixture();

        try {
            for (const [script, args] of [
                ['buildScripts/create/addConfig.mjs', ['-c', 'MyApp.view.Sample', '-n', 'active', '-t', 'Boolean', '-d', 'false', '-h', 'afterSetActive()']],
                ['buildScripts/create/class.mjs',     ['-c', 'MyApp.view.Panel', '-b', 'container.Base', '-n', 'no', '-C', 'no', '-p', 'no']],
                ['buildScripts/create/app.mjs',       ['-a', 'FlagApp', '-t', 'none', '-u', 'no']],
                ['buildScripts/create/appMinimal.mjs',['-a', 'MinFlagApp', '-t', 'none', '-u', 'no', '-s', 'no']]
            ]) {
                const result = spawnSync(process.execPath, [path.join(REPO_ROOT, script), ...args], {
                    cwd     : root,
                    encoding: 'utf8',
                    stdio   : 'pipe',
                    timeout : 5000
                });

                expect(result.error, script).toBeUndefined();
                expect(result.signal, script).toBeNull();
                expect(result.status, `${script}: ${result.stderr}`).toBe(0);
            }

            const sample = fs.readFileSync(path.join(root, 'apps/myapp/view/Sample.mjs'), 'utf8');
            expect(sample).toContain('active_: false');
            expect(sample).toContain('afterSetActive(value, oldValue)');
            expect(fs.existsSync(path.join(root, 'apps/myapp/view/Panel.mjs'))).toBe(true);
            expect(fs.existsSync(path.join(root, 'apps/flagapp/app.mjs'))).toBe(true);
            expect(fs.existsSync(path.join(root, 'apps/minflagapp/app.mjs'))).toBe(true);
        } finally {
            fs.rmSync(root, {force: true, recursive: true});
        }
    });

    test('create/component.mjs does not require -C or -p on non-TTY stdin when baseClass is not a view class', () => {
        // component.mjs runs the engine's own class, css and themes steps, so each case is a full run
        test.setTimeout(180_000);

        const root = createWorkspaceFixture();

        try {
            for (const [className, baseClass, expectedFile] of [
                ['MyApp.view.Foo',                  'core.Base',            'apps/myapp/view/Foo.mjs'],
                ['MyApp.controller.MainController', 'controller.Component', 'apps/myapp/controller/MainController.mjs'],
                ['MyApp.state.MainStateProvider',   'state.Provider',       'apps/myapp/state/MainStateProvider.mjs']
            ]) {
                const result = spawnSync(
                    process.execPath,
                    [path.join(REPO_ROOT, 'buildScripts/create/component.mjs'), '-c', className, '-b', baseClass, '-n', 'no'],
                    {
                        cwd     : root,
                        encoding: 'utf8',
                        stdio   : 'pipe',
                        timeout : 60_000
                    }
                );

                expect(result.error, `${className} (${baseClass})`).toBeUndefined();
                expect(result.signal, `${className} (${baseClass})`).toBeNull();
                expect(result.stderr + result.stdout, `${className} (${baseClass}) guard silent`).not.toContain('cannot prompt for');
                expect(result.status, `${className} (${baseClass}): ${result.stderr}`).toBe(0);
                expect(fs.existsSync(path.join(root, expectedFile)), expectedFile).toBe(true);
            }
        } finally {
            fs.rmSync(root, {force: true, recursive: true});
        }
    });
});
