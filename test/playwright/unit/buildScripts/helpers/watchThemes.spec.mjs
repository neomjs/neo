import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    handleThemeWatchEvent,
    inspectThemeWatcherAssets,
    reconcileThemeStructure,
    regenerateDevelopmentThemeMap,
    startThemeWatcher
} from '../../../../../buildScripts/helpers/watchThemes.mjs';

/**
 * @summary Pins watch-themes lifecycle reconciliation: low-latency content changes, exact
 * add/rename/delete output + map state, partial failure visibility, and startup readiness.
 */
test.describe('buildScripts/helpers/watchThemes (#15585)', () => {
    const roots = [];

    function createRoot(name='neo.mjs-watch-fixture') {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-watch-themes-'));

        roots.push(root);
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://github.com/neomjs/neo/issues'},
            name,
            version: '1.0.0'
        }));
        fs.mkdirSync(path.join(root, 'resources/scss/src'), {recursive: true});

        return root
    }

    function createLogger() {
        const errors = [],
              logs   = [];

        return {
            errors,
            logger: {
                error(message) {
                    errors.push(message)
                },
                log(...items) {
                    logs.push(items.join(' '))
                }
            },
            logs
        }
    }

    function mapLeaf(root, className) {
        const themeMap = JSON.parse(fs.readFileSync(
            path.join(root, 'resources/theme-map.json'),
            'utf8'
        ));

        return className.split('.').reduce((scope, segment) => scope?.[segment], themeMap)
    }

    async function buildFixtureEntry(entry, {logger}) {
        const source = fs.readFileSync(entry.sourcePath, 'utf8');

        if (
            source.includes("@use 'tokens'") &&
            !fs.existsSync(path.join(path.dirname(entry.sourcePath), '_tokens.scss'))
        ) {
            const message = `[watch-themes] SCSS build failed for ${entry.filename}: missing tokens partial`;

            logger.error(message);
            throw new Error(message)
        }

        fs.mkdirSync(path.dirname(entry.outputPath), {recursive: true});
        fs.writeFileSync(entry.outputPath, `/* ${entry.filename} */\n${source}`);
        fs.writeFileSync(entry.outputPath + '.map', JSON.stringify({
            sources: [path.relative(path.dirname(entry.outputPath), entry.sourcePath)]
        }));

        return entry.outputPath
    }

    function reconcileFixture(options) {
        return reconcileThemeStructure({...options, build: buildFixtureEntry})
    }

    function writeScss(root, filename, content='.fixture { color: red; }') {
        const target = path.join(root, 'resources/scss', filename);

        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, content);

        return target
    }

    test.afterAll(() => {
        roots.forEach(root => fs.rmSync(root, {force: true, recursive: true}))
    });

    test('ordinary content changes keep the one-file path', async () => {
        const
            root       = createRoot(),
            calls      = [],
            {logger}   = createLogger(),
            sourceFile = writeScss(root, 'src/Panel.scss');

        await handleThemeWatchEvent('change', 'src/Panel.scss', {
            build    : async filename => calls.push(['build', filename]),
            logger,
            reconcile: async () => {
                calls.push(['reconcile']);
                return {built: [], removed: [], themeMap: {}}
            },
            repoRoot: root
        });

        expect(fs.existsSync(sourceFile)).toBe(true);
        expect(calls).toEqual([['build', 'src/Panel.scss']])
    });

    test('one structural event reconciles add, rename, delete, source maps, and the exact map', async () => {
        const
            root     = createRoot(),
            {logger} = createLogger();

        writeScss(root, 'src/Initial.scss');
        await reconcileFixture({logger, repoRoot: root});

        writeScss(root, 'src/Added.scss', '.added { display: flex; }');
        await handleThemeWatchEvent('rename', 'src/Added.scss', {
            logger,
            reconcile: reconcileFixture,
            repoRoot : root
        });

        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Added.css'))).toBe(true);
        expect(mapLeaf(root, 'Neo.Added')).toEqual(['src']);

        fs.renameSync(
            path.join(root, 'resources/scss/src/Added.scss'),
            path.join(root, 'resources/scss/src/Renamed.scss')
        );

        // macOS is allowed to report only the retired filename. The census still discovers and
        // builds the new path before replacing the map.
        await handleThemeWatchEvent('rename', 'src/Added.scss', {
            logger,
            reconcile: reconcileFixture,
            repoRoot : root
        });

        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Added.css'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Added.css.map'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Renamed.css'))).toBe(true);
        expect(mapLeaf(root, 'Neo.Added')).toBeUndefined();
        expect(mapLeaf(root, 'Neo.Renamed')).toEqual(['src']);

        fs.rmSync(path.join(root, 'resources/scss/src/Renamed.scss'));
        await handleThemeWatchEvent('rename', 'src/Renamed.scss', {
            logger,
            reconcile: reconcileFixture,
            repoRoot : root
        });

        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Renamed.css'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Renamed.css.map'))).toBe(false);
        expect(mapLeaf(root, 'Neo.Renamed')).toBeUndefined()
    });

    test('a deleted partial rebuilds its owning root and fails loudly when an importer breaks', async () => {
        const
            root             = createRoot(),
            {errors, logger} = createLogger(),
            partial          = writeScss(root, 'src/_tokens.scss', '$color: red;');

        writeScss(root, 'src/Panel.scss', "@use 'tokens';\n.panel { color: tokens.$color; }");
        await reconcileFixture({logger, repoRoot: root});
        fs.rmSync(partial);

        await expect(
            handleThemeWatchEvent('rename', 'src/_tokens.scss', {
                logger,
                reconcile: reconcileFixture,
                repoRoot : root
            })
        ).rejects.toThrow('[watch-themes] rename reconcile failed for src/_tokens.scss');

        expect(errors.some(message => message.includes(
            '[watch-themes] SCSS build failed for src/Panel.scss'
        ))).toBe(true)
    });

    test('workspace regeneration preserves framework classes and removes retired local entries', () => {
        const root = createRoot('theme-workspace');

        writeScss(root, 'src/Local.scss');
        writeScss(
            path.join(root, 'node_modules/neo.mjs'),
            'src/Base.scss'
        );
        fs.writeFileSync(path.join(root, 'resources/theme-map.json'), JSON.stringify({
            Neo: {Retired: ['src']}
        }));

        regenerateDevelopmentThemeMap({repoRoot: root});

        expect(mapLeaf(root, 'Neo.Base')).toEqual(['src']);
        expect(mapLeaf(root, 'Neo.Local')).toEqual(['src']);
        expect(mapLeaf(root, 'Neo.Retired')).toBeUndefined()
    });

    test('startup freshness preserves a prior valid one-file rebuild', async () => {
        const
            root     = createRoot(),
            {logger} = createLogger(),
            panel    = writeScss(root, 'src/Panel.scss'),
            other    = writeScss(root, 'src/Other.scss');

        fs.utimesSync(panel, 1, 1);
        fs.utimesSync(other, 1, 1);
        await reconcileFixture({logger, repoRoot: root});

        const
            panelCss = path.join(root, 'dist/development/css/src/Panel.css'),
            otherCss = path.join(root, 'dist/development/css/src/Other.css');

        // Panel changed and was rebuilt later. Other remains older than Panel's new source, but
        // newer than its own source: that is a valid watcher state, not a reason for a full build.
        fs.utimesSync(otherCss, 1.5, 1.5);
        fs.utimesSync(panel, 2, 2);
        fs.utimesSync(panelCss, 3, 3);

        const state = inspectThemeWatcherAssets({repoRoot: root});

        expect(state.ready).toBe(true);
        expect(state.stale).toEqual([])
    });

    test('successful startup preloads Sass before opening the watcher', async () => {
        const
            root     = createRoot(),
            calls    = [],
            {logger} = createLogger(),
            watcher  = {close() {}};

        const result = await startThemeWatcher({
            inspect     : () => ({ready: true}),
            loadCompiler: async () => calls.push('compiler'),
            logger,
            reconcile   : async () => calls.push('reconcile'),
            repoRoot    : root,
            watch       : () => {
                calls.push('watch');
                return watcher
            }
        });

        expect(result).toBe(watcher);
        expect(calls).toEqual(['reconcile', 'compiler', 'watch'])
    });

    test('startup refuses loudly before the canonical initial build', async () => {
        const
            root     = createRoot(),
            calls    = [],
            {logger} = createLogger();

        await expect(startThemeWatcher({
            inspect: () => ({
                invalidMap: null,
                mapMissing: [],
                missing   : ['resources/theme-map.json'],
                ready     : false,
                stale     : [],
                symlinked : []
            }),
            loadCompiler: async () => calls.push('compiler'),
            logger,
            repoRoot    : root,
            watch       : () => { throw new Error('watch must not start') }
        })).rejects.toThrow(
            'Recovery: npm run build-themes -- -n -e dev -t all'
        );

        expect(calls).toEqual([])
    })
});
