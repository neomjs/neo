import {execFileSync, spawnSync}      from 'node:child_process';
import fs                             from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, expect}                 from '@playwright/test';

const script = fileURLToPath(new URL('../../../../buildScripts/create/move.mjs', import.meta.url));

/** @summary Captures fixture paths and bytes so a dry run or refusal cannot hide filesystem changes. */
function snapshot(root) {
    const entries = [];
    const visit   = folder => {
        for (const name of fs.readdirSync(folder).sort()) {
            const file = path.join(folder, name), relative = path.relative(root, file);
            if (fs.statSync(file).isDirectory()) {
                entries.push([relative, 'directory']);
                visit(file)
            } else entries.push([relative, fs.readFileSync(file).toString('base64')])
        }
    };
    visit(root);
    return entries
}

test.describe('move-files CLI (#5086)', () => {
    let root;

    /** @summary Writes a source or declaration file inside this test's temporary tree. */
    const write = (name, code) => {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, code)
    };
    const run  = args => spawnSync(process.execPath, [script, ...args], {cwd: root, encoding: 'utf8'});
    const move = ['--from', 'src/old', '--to', 'src/new'];

    test.beforeEach(() => {
        root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-move-cli-'));
        write('package.json', '{"name":"neo.mjs","type":"module"}');
        write('src/shared.mjs', 'export const value = 17;');
        write('src/old/Value.mjs', `import {value} from '../shared.mjs';
export default class Value { static config = {className: 'Neo.old.Value'}; read() { return value } }`);
        write('entry.mjs', `import Value from './src/old/Value.mjs';
export const result = {className: Value.config.className, value: new Value().read()};`)
    });

    test.afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

    test('defaults to a readable dry plan without filesystem changes', () => {
        const before = snapshot(root), result = run(move);

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('Move plan (dry run)');
        expect(result.stdout).toContain('src/old -> src/new');
        expect(result.stdout).toContain('Rewritten files');
        expect(result.stdout).toContain('Blockers (0)');
        expect(result.stdout).toContain('Scope boundary:');
        expect(snapshot(root)).toEqual(before)
    });

    test('projects changed source as before/after text instead of Buffer arrays', () => {
        const before = snapshot(root), result = run([...move, '--json']), output = JSON.parse(result.stdout),
            changed  = output.rewrites.find(item => item.from === 'src/old/Value.mjs');

        expect(result.status, result.stderr).toBe(0);
        expect(output.applied).toBeNull();
        expect(changed.before).toContain('Neo.old.Value');
        expect(changed.after).toContain('Neo.new.Value');
        expect(typeof changed.before).toBe('string');
        expect(typeof changed.after).toBe('string');
        expect(result.stdout).not.toContain('"type": "Buffer"');
        expect(snapshot(root)).toEqual(before)
    });

    test('applies only with the explicit flag and leaves an executable module graph', () => {
        const result = run([...move, '--root', root, '--apply', '--json']), output = JSON.parse(result.stdout);

        expect(result.status, result.stderr).toBe(0);
        expect(output.applied).toEqual({moved: output.moves.length, rewritten: output.rewrites.length});
        expect(fs.existsSync(path.join(root, 'src/old'))).toBe(false);
        const code = `const {result} = await import(${JSON.stringify(pathToFileURL(path.join(root, 'entry.mjs')).href)}); console.log(JSON.stringify(result));`;
        expect(JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {encoding: 'utf8'})))
            .toEqual({className: 'Neo.new.Value', value: 17})
    });

    for (const apply of [false, true]) {
        test(`returns a source-bound blocked plan without writes${apply ? ' even with --apply' : ''}`, () => {
            write('loader.mjs', 'export const load = () => import(modulePath);');
            const before = snapshot(root), result = run([...move, '--json', ...(apply ? ['--apply'] : [])]),
                output   = JSON.parse(result.stdout);

            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/blocked/);
            expect(output.applied).toBeNull();
            expect(output.blockers.length).toBeGreaterThan(0);
            expect(output.referenceLedger[0]).toMatchObject({file: 'loader.mjs', expression: 'modulePath',
                sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/), start: expect.any(Number)});
            expect(snapshot(root)).toEqual(before)
        })
    }

    test('refuses a collision on stderr before writing anything', () => {
        write('src/new/existing.mjs', 'export const keep = true;');
        const before = snapshot(root), result = run([...move, '--apply']);

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/destination.*exists/i);
        expect(snapshot(root)).toEqual(before)
    });

    test('can be imported without running its command or mutating the tree', () => {
        const before = snapshot(root),
            code     = `const cli = await import(${JSON.stringify(pathToFileURL(script).href)}); console.log(typeof cli.run);`,
            env      = {...process.env};
        delete env.FORCE_COLOR;
        delete env.NO_COLOR;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {cwd: root, encoding: 'utf8', env});

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim()).toBe('function');
        expect(result.stderr).toBe('');
        expect(snapshot(root)).toEqual(before)
    });

    test('shows help without requiring source and destination', () => {
        const before = snapshot(root), result = run(['--help']);

        expect(result.status, result.stderr).toBe(0);
        for (const flag of ['--from', '--to', '--root', '--namespace', '--reference-scopes', '--options', '--apply', '--json']) {
            expect(result.stdout).toContain(flag)
        }
        expect(snapshot(root)).toEqual(before)
    });

    test('requires both paths and provides no force bypass', () => {
        const before = snapshot(root);
        for (const args of [[], ['--from', 'src/old'], [...move, '--force']]) {
            const result = run(args);
            expect(result.status).toBe(1);
            expect(result.stderr.length).toBeGreaterThan(0);
            expect(snapshot(root)).toEqual(before)
        }
    });

    test('accepts repeatable namespace ownership declarations', () => {
        write('components/old/Value.mjs', 'class Value { static config = {className: "Library.old.Value"} }');
        const result = run(['--from', 'components/old', '--to', 'components/new', '--namespace', 'components=Library',
                '--namespace', 'widgets=Widgets', '--json']),
            output = JSON.parse(result.stdout);

        expect(result.status, result.stderr).toBe(0);
        expect(output.classNames).toContainEqual(['Library.old.Value', 'Library.new.Value'])
    });

    test('loads exact-source declarations from a separate JSON array', () => {
        write('loader.mjs', 'export const load = () => import(modulePath);');
        const {file, start, expression, sourceHash} = JSON.parse(run([...move, '--json']).stdout).referenceLedger[0];
        write('scopes.json', JSON.stringify([{file, start, expression, sourceHash, roots: ['unrelated']} ]));
        const before = snapshot(root), result = run([...move, '--reference-scopes', 'scopes.json', '--json']);

        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout).referenceLedger[0].status).toBe('declared');
        expect(snapshot(root)).toEqual(before)
    });

    test('loads custom theme-folder ownership from options without allowing apply through that file', () => {
        write('components/old/Value.mjs', 'class Value { static config = {className: "Library.old.Value"} }');
        write('resources/scss/src/apps/library-ui/old/Value.scss', '.library-value { padding: 1px; }');
        write('options.json', JSON.stringify({namespaceRoots: [
            {path: 'components', namespace: 'Library', appThemeFolder: 'library-ui'}
        ]}));
        const args = ['--from', 'components/old', '--to', 'components/new', '--options', 'options.json', '--json'],
            before = snapshot(root), result = run(args);

        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout).moves).toContainEqual({
            from: 'resources/scss/src/apps/library-ui/old/Value.scss', to: 'resources/scss/src/apps/library-ui/new/Value.scss'
        });
        expect(snapshot(root)).toEqual(before);
        write('options.json', '{"apply":true}');
        const refused = snapshot(root);
        expect(run(args).status).toBe(1);
        expect(snapshot(root)).toEqual(refused)
    })
});
