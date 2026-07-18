import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    DEVELOPMENT_THEME_BUILD_COMMAND,
    ensureDevelopmentThemeAssets,
    inspectDevelopmentThemeAssets
} from '../../../../../../buildScripts/util/developmentThemeAssets.mjs';

/**
 * @summary Pins the ordinary E2E theme preflight across fresh, missing, stale, failed-build,
 * incomplete-output, and foreign-symlink states.
 */
test.describe('buildScripts/util/developmentThemeAssets (#15449)', () => {
    const roots = [];

    function createRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-e2e-themes-'));

        roots.push(root);
        return root
    }

    function writeFile(root, relativePath, mtimeMs, content='fixture') {
        const file = path.join(root, relativePath);

        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, content);
        fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000)
    }

    function materialize(root, mtimeMs=Date.now()) {
        writeFile(root, 'resources/theme-map.json', mtimeMs, JSON.stringify({
            Neo: {Global: ['src', 'theme-neo-dark']}
        }));
        writeFile(root, 'dist/development/css/src/Global.css', mtimeMs);
        writeFile(root, 'dist/development/css/theme-neo-dark/Global.css', mtimeMs)
    }

    function seedScss(root, mtimeMs=1000) {
        writeFile(root, 'resources/scss/src/Global.scss', mtimeMs);
        writeFile(root, 'resources/scss/theme-neo-dark/Global.scss', mtimeMs)
    }

    test.afterAll(() => {
        roots.forEach(root => fs.rmSync(root, {force: true, recursive: true}))
    });

    test('fresh outputs do not rebuild', async () => {
        const root   = createRoot();
        let   builds = 0;

        seedScss(root, 1000);
        materialize(root, 2000);

        const result = await ensureDevelopmentThemeAssets({
            repoRoot: root,
            build   : async () => builds++,
            logger  : {log() {}}
        });

        expect(result.built).toBe(false);
        expect(result.state.ready).toBe(true);
        expect(builds).toBe(0)
    });

    test('the SCSS source tree, not additive retired theme-map entries, owns the CSS census', () => {
        const root = createRoot();

        seedScss(root, 1000);
        materialize(root, 2000);
        writeFile(root, 'resources/theme-map.json', 2000, JSON.stringify({
            'Neo.apps.agentos.RetiredPanel': ['src', 'theme-neo-dark'],
            Neo                            : {Global: ['src', 'theme-neo-dark']}
        }));

        const state = inspectDevelopmentThemeAssets({repoRoot: root});

        expect(state.ready).toBe(true);
        expect(state.expectedCss).toEqual([
            path.join('dist/development/css/src/Global.css'),
            path.join('dist/development/css/theme-neo-dark/Global.css')
        ]);
        expect(state.missing).toEqual([])
    });

    for (const missingPath of [
        'resources/theme-map.json',
        'dist/development/css/theme-neo-dark/Global.css'
    ]) {
        test(`a missing ${missingPath} triggers exactly one canonical build`, async () => {
            const root   = createRoot();
            let   builds = 0;

            seedScss(root, 1000);
            materialize(root, 2000);
            fs.rmSync(path.join(root, missingPath));

            const result = await ensureDevelopmentThemeAssets({
                repoRoot: root,
                build   : async () => {
                    builds++;
                    materialize(root, 3000)
                },
                logger: {log() {}}
            });

            expect(result.built).toBe(true);
            expect(result.state.ready).toBe(true);
            expect(builds).toBe(1)
        })
    }

    for (const stalePath of [
        'resources/theme-map.json',
        'dist/development/css/src/Global.css'
    ]) {
        test(`a stale ${stalePath} triggers exactly one canonical build`, async () => {
            const root   = createRoot();
            let   builds = 0;

            seedScss(root, 2000);
            materialize(root, 3000);
            fs.utimesSync(path.join(root, stalePath), 1, 1);

            const result = await ensureDevelopmentThemeAssets({
                repoRoot: root,
                build   : async () => {
                    builds++;
                    materialize(root, 4000)
                },
                logger: {log() {}}
            });

            expect(result.built).toBe(true);
            expect(result.state.ready).toBe(true);
            expect(builds).toBe(1)
        })
    }

    test('a failed builder aborts before browser startup and names the canonical recovery command', async () => {
        const root = createRoot();

        seedScss(root);

        await expect(ensureDevelopmentThemeAssets({
            repoRoot: root,
            build   : async () => { throw new Error('exit code 7') },
            logger  : {log() {}}
        })).rejects.toThrow(`exit code 7\nRecovery: ${DEVELOPMENT_THEME_BUILD_COMMAND}`)
    });

    test('a successful but incomplete builder aborts after exactly one attempt', async () => {
        const root   = createRoot();
        let   builds = 0;

        seedScss(root);

        await expect(ensureDevelopmentThemeAssets({
            repoRoot: root,
            build   : async () => builds++,
            logger  : {log() {}}
        })).rejects.toThrow(`Recovery: ${DEVELOPMENT_THEME_BUILD_COMMAND}`);

        expect(builds).toBe(1)
    });

    test('a symlink-borrowed output is never accepted as checkout-local readiness', () => {
        const root       = createRoot(),
              foreign    = createRoot(),
              linkedPath = path.join(root, 'dist/development/css/src/Global.css');

        seedScss(root, 1000);
        materialize(root, 2000);
        writeFile(foreign, 'Global.css', 3000);
        fs.rmSync(linkedPath);
        fs.symlinkSync(path.join(foreign, 'Global.css'), linkedPath);

        const state = inspectDevelopmentThemeAssets({repoRoot: root});

        expect(state.ready).toBe(false);
        expect(state.symlinked).toContain('dist/development/css/src/Global.css')
    })
});
