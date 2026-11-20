import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    WATCH_THEMES_HELP,
    handleThemeWatchEvent,
    inspectThemeWatcherAssets,
    reconcileThemeStructure,
    regenerateDevelopmentThemeMap,
    startThemeWatcher
} from '../../../../../buildScripts/helpers/watchThemes.mjs';

const WATCH_SCRIPT = fileURLToPath(new URL('../../../../../buildScripts/helpers/watchThemes.mjs', import.meta.url));

/**
 * @summary Pins watch-themes lifecycle reconciliation: low-latency content changes, exact
 * add/rename/delete output + map state, build failure visibility, the copy (never compile)
 * contract, and startup readiness.
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
        fs.mkdirSync(path.join(root, 'resources/css/src'), {recursive: true});

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

    async function buildFixtureEntry(entry) {
        const source = fs.readFileSync(entry.sourcePath, 'utf8');

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

    function writeSource(root, filename, content='.fixture { color: red; }') {
        const target = path.join(root, 'resources/css', filename);

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
            sourceFile = writeSource(root, 'src/Panel.css');

        await handleThemeWatchEvent('change', 'src/Panel.css', {
            build    : async filename => calls.push(['build', filename]),
            logger,
            reconcile: async () => {
                calls.push(['reconcile']);
                return {built: [], removed: [], themeMap: {}}
            },
            repoRoot: root
        });

        expect(fs.existsSync(sourceFile)).toBe(true);
        expect(calls).toEqual([['build', 'src/Panel.css']])
    });

    test('a content change copies the source, nesting kept, with a source map back to it', async () => {
        const
            root     = createRoot(),
            {logger} = createLogger();

        writeSource(root, 'src/Panel.css', '.panel {\n    .child {\n        color: red;\n    }\n}\n');

        await handleThemeWatchEvent('change', 'src/Panel.css', {logger, repoRoot: root});

        const
            output = fs.readFileSync(path.join(root, 'dist/development/css/src/Panel.css'), 'utf8'),
            map    = JSON.parse(fs.readFileSync(path.join(root, 'dist/development/css/src/Panel.css.map'), 'utf8'));

        expect(output).toContain('.panel {\n    .child {');
        expect(output).toContain('/*# sourceMappingURL=Panel.css.map */');
        expect(map.sources).toEqual(['../../../../resources/css/src/Panel.css'])
    });

    test('one structural event reconciles add, rename, delete, source maps, and the exact map', async () => {
        const
            root     = createRoot(),
            {logger} = createLogger();

        writeSource(root, 'src/Initial.css');
        await reconcileFixture({logger, repoRoot: root});

        writeSource(root, 'src/Added.css', '.added { display: flex; }');
        await handleThemeWatchEvent('rename', 'src/Added.css', {
            logger,
            reconcile: reconcileFixture,
            repoRoot : root
        });

        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Added.css'))).toBe(true);
        expect(mapLeaf(root, 'Neo.Added')).toEqual(['src']);

        fs.renameSync(
            path.join(root, 'resources/css/src/Added.css'),
            path.join(root, 'resources/css/src/Renamed.css')
        );

        // macOS is allowed to report only the retired filename. The census still discovers and
        // builds the new path before replacing the map.
        await handleThemeWatchEvent('rename', 'src/Added.css', {
            logger,
            reconcile: reconcileFixture,
            repoRoot : root
        });

        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Added.css'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Added.css.map'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Renamed.css'))).toBe(true);
        expect(mapLeaf(root, 'Neo.Added')).toBeUndefined();
        expect(mapLeaf(root, 'Neo.Renamed')).toEqual(['src']);

        fs.rmSync(path.join(root, 'resources/css/src/Renamed.css'));
        await handleThemeWatchEvent('rename', 'src/Renamed.css', {
            logger,
            reconcile: reconcileFixture,
            repoRoot : root
        });

        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Renamed.css'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/Renamed.css.map'))).toBe(false);
        expect(mapLeaf(root, 'Neo.Renamed')).toBeUndefined()
    });

    test('a source the build cannot parse fails loudly', async () => {
        const
            root             = createRoot(),
            {errors, logger} = createLogger();

        writeSource(root, 'src/Broken.css', '.broken {\n    color: red;\n');

        await expect(
            handleThemeWatchEvent('rename', 'src/Broken.css', {logger, repoRoot: root})
        ).rejects.toThrow('[watch-themes] rename reconcile failed for src/Broken.css');

        expect(errors.some(message => message.includes(
            '[watch-themes] build failed for src/Broken.css'
        ))).toBe(true)
    });

    test('workspace regeneration preserves framework classes and removes retired local entries', () => {
        const root = createRoot('theme-workspace');

        writeSource(root, 'src/Local.css');
        writeSource(
            path.join(root, 'node_modules/neo.mjs'),
            'src/Base.css'
        );
        fs.writeFileSync(path.join(root, 'resources/theme-map.json'), JSON.stringify({
            Neo: {Retired: ['src']}
        }));

        regenerateDevelopmentThemeMap({repoRoot: root});

        expect(mapLeaf(root, 'Neo.Base')).toEqual(['src']);
        expect(mapLeaf(root, 'Neo.Local')).toEqual(['src']);
        expect(mapLeaf(root, 'Neo.Retired')).toBeUndefined()
    });

    test('a declared package\'s sheets stay built and mapped under the workspace overlay (#21253)', async () => {
        const
            root     = createRoot('theme-workspace'),
            {logger} = createLogger(),
            pkg      = path.join(root, 'node_modules/@acme/grid-ext'),
            plain    = path.join(root, 'node_modules/plain-pkg'),
            output   = filename => path.join(root, 'dist/development/css', filename),
            writeAt  = (target, content) => {
                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, content);
                return target
            };

        // Both packages are dependencies; only one declares a theme root, and it is not `resources/css`
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name        : 'theme-workspace',
            version     : '1.0.0',
            dependencies: {'@acme/grid-ext': '1.0.0', 'plain-pkg': '1.0.0'}
        }));
        writeAt(path.join(pkg,   'package.json'), JSON.stringify({name: '@acme/grid-ext', neo: {css: 'themes'}}));
        writeAt(path.join(plain, 'package.json'), JSON.stringify({name: 'plain-pkg'}));

        writeSource(path.join(root, 'node_modules/neo.mjs'), 'src/Base.css');
        const shared = writeAt(path.join(pkg, 'themes/src/apps/ext/Shared.css'), '.ext-shared { color: green; }');
        writeAt(path.join(pkg, 'themes/src/apps/ext/Row.css'), '.ext-row { color: green; }');
        writeSource(plain, 'src/apps/plain/Ignored.css');
        writeSource(root, 'src/apps/ext/Shared.css', '.ext-shared { color: purple; }');

        // A full build already placed the package sheet; startup reconciliation must keep it
        writeAt(output('src/apps/ext/Row.css'), '/* built */');
        fs.utimesSync(path.join(pkg, 'themes/src/apps/ext/Row.css'), 1, 1);
        fs.utimesSync(shared, 1, 1);

        await reconcileFixture({logger, repoRoot: root});

        expect(fs.readFileSync(output('src/apps/ext/Row.css'), 'utf8')).toBe('/* built */');
        expect(fs.readFileSync(output('src/apps/ext/Shared.css'), 'utf8')).toContain('purple');
        expect(fs.existsSync(output('src/apps/plain/Ignored.css'))).toBe(false);
        expect(mapLeaf(root, 'apps.ext.Row')).toEqual(['src']);
        expect(mapLeaf(root, 'apps.plain.Ignored')).toBeUndefined();

        // Removing the workspace overlay brings the package's own sheet back
        fs.rmSync(path.join(root, 'resources/css/src/apps/ext/Shared.css'));
        await handleThemeWatchEvent('rename', 'src/apps/ext/Shared.css', {logger, reconcile: reconcileFixture, repoRoot: root});

        expect(fs.readFileSync(output('src/apps/ext/Shared.css'), 'utf8')).toContain('green')
    });

    test('startup freshness preserves a prior valid one-file rebuild', async () => {
        const
            root     = createRoot(),
            {logger} = createLogger(),
            panel    = writeSource(root, 'src/Panel.css'),
            other    = writeSource(root, 'src/Other.css');

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

    test('successful startup reconciles before opening the watcher', async () => {
        const
            root     = createRoot(),
            calls    = [],
            {logger} = createLogger(),
            watcher  = {close() {}};

        const result = await startThemeWatcher({
            inspect  : () => ({ready: true}),
            logger,
            reconcile: async () => calls.push('reconcile'),
            repoRoot : root,
            watch    : () => {
                calls.push('watch');
                return watcher
            }
        });

        expect(result).toBe(watcher);
        expect(calls).toEqual(['reconcile', 'watch'])
    });

    test('startup refuses loudly before the canonical initial build', async () => {
        const
            root     = createRoot(),
            calls    = [],
            {logger} = createLogger();

        await expect(startThemeWatcher({
            inspect  : () => ({
                invalidMap: null,
                mapMissing: [],
                missing   : ['resources/theme-map.json'],
                ready     : false,
                stale     : [],
                symlinked : []
            }),
            logger,
            reconcile: async () => calls.push('reconcile'),
            repoRoot : root,
            watch    : () => { throw new Error('watch must not start') }
        })).rejects.toThrow(
            'Recovery: npm run build-themes -- -n -e dev -t all'
        );

        expect(calls).toEqual([])
    });

    test('--help scopes watch-themes to supervised interactive dev shells and names the unattended build command', () => {
        const result = spawnSync(process.execPath, [WATCH_SCRIPT, '--help'], {
            encoding: 'utf8',
            stdio   : 'pipe',
            timeout : 5000
        });

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(WATCH_THEMES_HELP);
        expect(result.stdout).toContain('supervised interactive development shells');
        expect(result.stdout).toContain('npm run build-themes -- -n -e dev -t all');
    })
});
