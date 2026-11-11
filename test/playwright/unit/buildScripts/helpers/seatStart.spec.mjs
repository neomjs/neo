import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {seatStart} from '../../../../../buildScripts/helpers/seatStart.mjs';

const
    __dirname   = path.dirname(fileURLToPath(import.meta.url)),
    REPO_ROOT   = path.resolve(__dirname, '../../../../..'),
    ENTRY_POINT = path.join(REPO_ROOT, 'buildScripts/helpers/seatStart.mjs');

/**
 * @summary `npm run seat:start`: every Start regenerates `AGENTS.md` from the installed skills,
 * and rebuilds the development themes only when the checkout serves CSS older than its SCSS.
 */
test.describe('buildScripts/helpers/seatStart (#20429)', () => {
    const roots = [];

    function createRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-seat-start-'));

        roots.push(root);
        return root
    }

    /**
     * @summary Declares the checkout's `generate-agents-md` script and, unless `installed` is
     * false, installs a skills package whose generator writes a stamped `AGENTS.md`.
     * @param {String} root
     * @param {Object} [options]
     * @param {Boolean} [options.installed=true]
     */
    function declareAgentsMd(root, {installed=true}={}) {
        const dir = path.join(root, 'node_modules', 'neo-agent-skills');

        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            scripts: {'generate-agents-md': 'neo-agent-skills-agents-md --repo neo --out AGENTS.md'}
        }));

        if (installed) {
            fs.mkdirSync(dir, {recursive: true});
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({bin: {'neo-agent-skills-agents-md': 'generate.mjs'}}));
            fs.writeFileSync(path.join(dir, 'generate.mjs'),
                "import {writeFileSync} from 'node:fs';\n" +
                "const args = process.argv.slice(2);\n" +
                "writeFileSync(args[args.indexOf('--out') + 1], `rules for ${args[args.indexOf('--repo') + 1]}\\n`);\n")
        }
    }

    function writeFile(root, relativePath, mtimeMs, content='fixture') {
        const file = path.join(root, relativePath);

        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, content);
        fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000)
    }

    function materialize(root, mtimeMs) {
        writeFile(root, 'resources/theme-map.json', mtimeMs, JSON.stringify({
            Neo: {Global: ['src', 'theme-neo-dark']}
        }));
        writeFile(root, 'dist/development/css/src/Global.css', mtimeMs);
        writeFile(root, 'dist/development/css/theme-neo-dark/Global.css', mtimeMs)
    }

    function seedScss(root, mtimeMs) {
        writeFile(root, 'resources/scss/src/Global.scss', mtimeMs);
        writeFile(root, 'resources/scss/theme-neo-dark/Global.scss', mtimeMs)
    }

    test.afterAll(() => {
        roots.forEach(root => fs.rmSync(root, {force: true, recursive: true}))
    });

    test('current themes exit without a build', async () => {
        const
            root = createRoot(),
            logs = [];
        let builds = 0;

        seedScss(root, 1000);
        materialize(root, 2000);

        const result = await seatStart({
            repoRoot: root,
            build   : async () => builds++,
            logger  : {log: line => logs.push(line)}
        });

        expect(result.built).toBe(false);
        expect(builds).toBe(0);
        expect(logs.at(-1)).toContain('current')
    });

    test('an SCSS change rebuilds once, and a second Start is a no-op', async () => {
        const
            root = createRoot(),
            logs = [];
        let builds = 0;

        seedScss(root, 1000);
        materialize(root, 2000);
        // The fast-forward brought in a peer SCSS change
        writeFile(root, 'resources/scss/src/Global.scss', 3000);

        const build = async () => {
            builds++;
            materialize(root, 4000)
        };

        const first = await seatStart({repoRoot: root, build, logger: {log: line => logs.push(line)}});

        expect(first.built).toBe(true);
        expect(builds).toBe(1);
        expect(logs.at(-1)).toContain('rebuilt');

        const second = await seatStart({repoRoot: root, build, logger: {log() {}}});

        expect(second.built).toBe(false);
        expect(builds).toBe(1)
    });

    test('a failed build rejects and names the recovery command', async () => {
        const root = createRoot();

        seedScss(root, 1000);
        materialize(root, 2000);
        writeFile(root, 'resources/scss/src/Global.scss', 3000);

        await expect(seatStart({
            repoRoot: root,
            build   : async () => { throw new Error('sass exploded') },
            logger  : {log() {}}
        })).rejects.toThrow(/sass exploded[\s\S]*Recovery: npm run build-themes/)
    });

    test('a deleted AGENTS.md is back after the next Start, with nothing reinstalled', async () => {
        const
            root   = createRoot(),
            target = path.join(root, 'AGENTS.md');

        seedScss(root, 1000);
        materialize(root, 2000);
        declareAgentsMd(root);

        const first = await seatStart({repoRoot: root, build: async () => {}, logger: {log() {}}});

        expect(first.agentsMd).toEqual({skipped: null, stage: 'agents-md', status: 0});
        expect(fs.readFileSync(target, 'utf8')).toBe('rules for neo\n');

        // `git clean -X`, or a fast-forward over the commit that untracked it
        fs.rmSync(target);

        await seatStart({repoRoot: root, build: async () => {}, logger: {log() {}}});

        expect(fs.readFileSync(target, 'utf8')).toBe('rules for neo\n')
    });

    test('a checkout without the script is left alone, and the themes are still checked', async () => {
        const
            root = createRoot(),
            logs = [];

        seedScss(root, 1000);
        materialize(root, 2000);

        const result = await seatStart({repoRoot: root, build: async () => {}, logger: {log: line => logs.push(line)}});

        expect(result.agentsMd).toEqual({skipped: 'not-declared', stage: 'agents-md', status: 0});
        expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
        expect(logs).toContain('[seat:start] AGENTS.md: this checkout declares no generate-agents-md script')
    });

    test('a failed generation rejects with its reason, after the theme check has run', async () => {
        const root   = createRoot();
        let   builds = 0;

        seedScss(root, 1000);
        materialize(root, 2000);
        writeFile(root, 'resources/scss/src/Global.scss', 3000);
        declareAgentsMd(root, {installed: false});

        await expect(seatStart({
            repoRoot: root,
            build   : async () => { builds++; materialize(root, 4000) },
            logger  : {log() {}}
        })).rejects.toThrow(/AGENTS\.md is not ready \(prepare: neo-agent-skills package not found[\s\S]*Recovery: npm run generate-agents-md/);

        expect(builds).toBe(1)
    });

    test('a generator that exits non-zero fails the Start, and so does a failed build beside it', async () => {
        const root = createRoot();

        seedScss(root, 1000);
        materialize(root, 2000);
        writeFile(root, 'resources/scss/src/Global.scss', 3000);

        await expect(seatStart({
            repoRoot  : root,
            build     : async () => { throw new Error('sass exploded') },
            logger    : {log() {}},
            runStageFn: () => ({skipped: null, stage: 'agents-md', status: 2})
        })).rejects.toThrow(/AGENTS\.md is not ready \(the generator exited 2\)[\s\S]*sass exploded/)
    });

    test('the entry point exits 0 at once on a current checkout', () => {
        const root = createRoot();

        seedScss(root, 1000);
        materialize(root, 2000);

        const stdout = execFileSync(process.execPath, [ENTRY_POINT], {cwd: root, encoding: 'utf8'});

        expect(stdout).toContain('[seat:start] development themes are current')
    });

    test('the entry point exits 1 and reports when the build cannot run', () => {
        const root = createRoot();

        seedScss(root, 1000);
        materialize(root, 2000);
        writeFile(root, 'resources/scss/src/Global.scss', 3000);

        // A root without a package.json has no `build-themes` script, so the canonical build fails
        let error;

        try {
            execFileSync(process.execPath, [ENTRY_POINT], {cwd: root, encoding: 'utf8', stdio: 'pipe'})
        } catch (e) {
            error = e
        }

        expect(error?.status).toBe(1);
        expect(error.stderr).toContain('[seat:start]');
        expect(error.stderr).toContain('npm run build-themes')
    });

    test('the entry point exits 1 and names AGENTS.md when the generation fails', () => {
        const root = createRoot();

        seedScss(root, 1000);
        materialize(root, 2000);
        declareAgentsMd(root, {installed: false});

        let error;

        try {
            execFileSync(process.execPath, [ENTRY_POINT], {cwd: root, encoding: 'utf8', stdio: 'pipe'})
        } catch (e) {
            error = e
        }

        expect(error?.status).toBe(1);
        expect(error.stderr).toContain('[seat:start] AGENTS.md is not ready');
        expect(error.stderr).toContain('npm run generate-agents-md')
    })
});
