import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    DEVELOPMENT_THEME_BUILD_COMMAND,
    ensureDevelopmentThemeAssets,
    inspectDevelopmentThemeAssets
} from '../../../../../buildScripts/util/developmentThemeAssets.mjs';
import webpackServerConfig, {
    createDevelopmentThemeFreshnessHooks,
    DEVELOPMENT_THEME_RECHECK_INTERVAL_MS
} from '../../../../../buildScripts/webpack/webpack.server.config.mjs';

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

    test('a fresh map missing one census root entry is incomplete and triggers exactly one build', async () => {
        const root   = createRoot();
        let   builds = 0;

        seedScss(root, 1000);
        materialize(root, 2000);
        writeFile(root, 'resources/theme-map.json', 3000, JSON.stringify({
            Neo: {Global: ['src']} // fresh, parseable, non-empty — but theme-neo-dark is not reachable
        }));

        const state = inspectDevelopmentThemeAssets({repoRoot: root});

        expect(state.ready).toBe(false);
        expect(state.invalidMap).toBe(null);
        expect(state.mapMissing).toEqual(['Neo.Global (theme-neo-dark)']);

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
    });

    test('a fresh map missing a census class entirely is incomplete and triggers exactly one build', async () => {
        const root   = createRoot();
        let   builds = 0;

        seedScss(root, 1000);
        writeFile(root, 'resources/scss/src/button/Base.scss', 1000);
        materialize(root, 2000);
        writeFile(root, 'dist/development/css/src/button/Base.css', 2000);

        const state = inspectDevelopmentThemeAssets({repoRoot: root});

        expect(state.ready).toBe(false);
        expect(state.mapMissing).toEqual(['Neo.button.Base (src)']);

        const result = await ensureDevelopmentThemeAssets({
            repoRoot: root,
            build   : async () => {
                builds++;
                materialize(root, 4000);
                writeFile(root, 'resources/theme-map.json', 4000, JSON.stringify({
                    Neo: {Global: ['src', 'theme-neo-dark'], button: {Base: ['src']}}
                }))
            },
            logger: {log() {}}
        });

        expect(result.built).toBe(true);
        expect(result.state.ready).toBe(true);
        expect(builds).toBe(1)
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

/**
 * @summary Pins the development-server consumer: startup inspection, bounded request-time
 * revalidation, transition-based warning de-duplication, and fail-soft request handling.
 */
test.describe('webpack development-theme freshness hooks (#15666)', () => {
    test('the live config wires a 5s guard before static serving', () => {
        const staticMiddleware = {name: 'express-static', middleware() {}};
        const middlewares      = webpackServerConfig.devServer.setupMiddlewares([staticMiddleware]);

        expect(DEVELOPMENT_THEME_RECHECK_INTERVAL_MS).toBe(5000);
        expect(webpackServerConfig.devServer.static.watch).toBe(false);
        expect(typeof webpackServerConfig.devServer.onListening).toBe('function');
        expect(middlewares[0].name).toBe('development-theme-freshness');
        expect(middlewares[1]).toBe(staticMiddleware)
    });

    test('startup + bounded CSS requests warn once per fresh-to-stale transition', () => {
        const
            readyStates = [false, false, true, false],
            warnings    = [];

        let inspections = 0,
            nextCalls   = 0,
            now         = 0;

        const hooks = createDevelopmentThemeFreshnessHooks({
            inspect: () => ({ready: readyStates[inspections++]}),
            logger : {warn: message => warnings.push(message)},
            now    : () => now
        });
        const middleware = hooks.setupMiddlewares([])[0].middleware;

        hooks.onListening();

        const requestAt = time => {
            now = time;
            middleware(
                {url: '/dist/development/css/src/Global.css?theme=dark'},
                {},
                () => nextCalls++
            )
        };

        requestAt(4999);  // startup result is reused
        requestAt(5000);  // stale revalidation, warning stays de-duped
        requestAt(9999);  // second result is reused
        requestAt(10000); // rebuild observed: fresh
        requestAt(15000); // next fresh -> stale transition warns again

        expect(inspections).toBe(4);
        expect(nextCalls).toBe(5);
        expect(warnings).toHaveLength(2);
        warnings.forEach(message => {
            expect(message).toContain(DEVELOPMENT_THEME_BUILD_COMMAND)
        })
    });

    test('inspection errors never block responses and stay de-duped until a successful check', () => {
        const warnings = [];

        let inspections = 0,
            mode        = 'error',
            nextCalls   = 0,
            now         = 0;

        const hooks = createDevelopmentThemeFreshnessHooks({
            inspect: () => {
                inspections++;
                if (mode === 'error') throw new Error('fixture inspection failed');
                return {ready: true}
            },
            logger: {warn: message => warnings.push(message)},
            now   : () => now
        });
        const middleware = hooks.setupMiddlewares([])[0].middleware;

        expect(() => hooks.onListening()).not.toThrow();

        now = 5000;
        expect(() => middleware(
            {url: '/dist/development/css/src/Global.css'},
            {},
            () => nextCalls++
        )).not.toThrow();

        expect(inspections).toBe(2);
        expect(nextCalls).toBe(1);
        expect(warnings).toHaveLength(1);

        mode = 'fresh';
        now  = 10000;
        middleware({url: '/dist/development/css/src/Global.css'}, {}, () => nextCalls++);

        mode = 'error';
        now  = 15000;
        middleware({url: '/dist/development/css/src/Global.css'}, {}, () => nextCalls++);

        now = 20000;
        middleware({url: '/src/Neo.mjs'}, {}, () => nextCalls++);

        expect(inspections).toBe(4); // the non-theme request never inspects
        expect(nextCalls).toBe(4);
        expect(warnings).toHaveLength(2); // a successful check reset the error transition
        expect(warnings[0]).toContain('fixture inspection failed');
        expect(warnings[0]).toContain(DEVELOPMENT_THEME_BUILD_COMMAND)
    })
});
