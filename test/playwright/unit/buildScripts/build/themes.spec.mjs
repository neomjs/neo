import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    scriptPath = path.resolve(__dirname, '../../../../../buildScripts/build/themes.mjs');

/**
 * build-themes theme-map regeneration: a full build reseeds the map from the effective SCSS
 * tree — deletions and renames land on the next build — instead of merging the previous artifact
 * (create-only insertion made deleted skins permanent fossils, re-inherited on every rebuild). The
 * one preserved merge is the workspace overlay: the ENGINE's map still seeds a workspace build, so
 * engine components stay resolvable. Fixtures run the real CLI against a minimal tmp tree, so the
 * pin covers the shipped path rather than a re-implementation of it.
 */
test.describe('build-themes theme-map regeneration (#17222)', () => {
    let root;

    test.afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    const writeScss = (base, rel) => {
        const filePath = path.join(base, 'resources/scss/src', rel);
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, '.x { color: red; }\n', 'utf8');
    };

    // execFileSync (not execSync): node is spawned directly with an argv array — no shell, so the
    // absolute scriptPath can never be interpolated into a shell command (CodeQL-clean).
    const runBuild = (cwd) => execFileSync('node', [scriptPath, '-n', '-e', 'dev', '-t', 'all'], {cwd, encoding: 'utf8', stdio: 'pipe'});

    const readMap = (cwd) => JSON.parse(fs.readFileSync(path.join(cwd, 'resources/theme-map.json'), 'utf8'));

    const mapKeys = (map) => {
        const keys = [];
        const walk = (node, prefix) => {
            for (const [key, value] of Object.entries(node)) {
                if (Array.isArray(value)) {
                    keys.push(prefix + key);
                } else {
                    walk(value, prefix + key + '.');
                }
            }
        };
        walk(map, '');
        return keys;
    };

    test('a full build reseeds from the effective SCSS tree — a fossil key from the previous map is gone (AC1)', () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-themes-seed-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://example.invalid'},
            name   : 'neo.mjs-fixture',
            version: '1.0.0'
        }));
        writeScss(root, 'apps/demo/Widget.scss');

        // The previous artifact carries a fossil: a key whose SCSS file no longer exists.
        fs.writeFileSync(path.join(root, 'resources/theme-map.json'), JSON.stringify({apps: {demo: {Fossil: ['src']}}}));

        runBuild(root);

        const keys = mapKeys(readMap(root));
        expect(keys).toContain('apps.demo.Widget');      // the real tree lands
        expect(keys).not.toContain('apps.demo.Fossil');  // the fossil does not survive a fresh build
    });

    test('a workspace build still seeds from the ENGINE map, but never from its own previous output (AC2)', () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-themes-workspace-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://example.invalid'},
            name   : 'demo-workspace',
            version: '1.0.0'
        }));
        writeScss(root, 'apps/demo/Widget.scss');

        // The engine ships a built map; the workspace's own previous output carries a fossil.
        const engineResources = path.join(root, 'node_modules/neo.mjs/resources');
        fs.mkdirSync(engineResources, {recursive: true});
        fs.writeFileSync(path.join(engineResources, 'theme-map.json'), JSON.stringify({Neo: {button: {Base: ['src']}}}));
        fs.writeFileSync(path.join(root, 'resources/theme-map.json'), JSON.stringify({apps: {demo: {Fossil: ['src']}}}));

        runBuild(root);

        const keys = mapKeys(readMap(root));
        expect(keys).toContain('Neo.button.Base');       // the engine overlay is preserved
        expect(keys).toContain('apps.demo.Widget');      // the workspace's own tree lands
        expect(keys).not.toContain('apps.demo.Fossil');  // the workspace's own fossil is not inherited
    });

    test('a workspace merges and deduplicates framework and workspace theme-* folders for selection and build (#3638)', () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-themes-merge-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://example.invalid'},
            name   : 'demo-workspace',
            version: '1.0.0'
        }));

        const engineRoot = path.join(root, 'node_modules/neo.mjs');
        fs.mkdirSync(engineRoot, {recursive: true});
        fs.writeFileSync(path.join(engineRoot, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://github.com/neomjs/neo/issues'},
            name   : 'neo.mjs',
            version: '1.0.0'
        }));

        // Framework has theme-neo-dark and theme-neo-light; workspace has theme-neo-dark (overlap) and theme-workspace
        const writeThemeScss = (base, theme, rel) => {
            const filePath = path.join(base, 'resources/scss', theme, rel);
            fs.mkdirSync(path.dirname(filePath), {recursive: true});
            fs.writeFileSync(filePath, '.x { color: blue; }\n', 'utf8');
        };

        writeScss(root, 'apps/demo/Widget.scss');
        writeThemeScss(engineRoot, 'theme-neo-dark',  'button/Base.scss');
        writeThemeScss(engineRoot, 'theme-neo-light', 'button/Base.scss');
        writeThemeScss(root,       'theme-neo-dark',  'apps/demo/Widget.scss');
        writeThemeScss(root,       'theme-workspace', 'apps/demo/Widget.scss');

        const helpOutput = execFileSync('node', [scriptPath, '--help'], {cwd: root, encoding: 'utf8', stdio: 'pipe'});
        expect(helpOutput).toContain('all, theme-neo-dark, theme-neo-light, theme-workspace');

        runBuild(root);

        const map = readMap(root);
        expect(map.Neo.button.Base).toEqual(expect.arrayContaining(['theme-neo-dark', 'theme-neo-light']));
        expect(map.apps.demo.Widget).toEqual(expect.arrayContaining(['src', 'theme-neo-dark', 'theme-workspace']));
    });

    test('a workspace compiles SCSS from a declaring dependency, ignores non-declaring and unlisted packages, and lets the workspace overlay same-path files (#20260)', () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-themes-pkg-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            bugs           : {url: 'https://example.invalid'},
            name           : 'demo-workspace',
            version        : '1.0.0',
            dependencies   : {'@acme/grid-ext': '1.0.0'},
            devDependencies: {'plain-pkg': '1.0.0'}
        }));

        const engineRoot = path.join(root, 'node_modules/neo.mjs');
        fs.mkdirSync(engineRoot, {recursive: true});
        fs.writeFileSync(path.join(engineRoot, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://github.com/neomjs/neo/issues'},
            name   : 'neo.mjs',
            version: '1.0.0'
        }));

        // Declaring package: declares "neo": {"scss": "resources/scss"}
        const declaringRoot = path.join(root, 'node_modules/@acme/grid-ext');
        fs.mkdirSync(declaringRoot, {recursive: true});
        fs.writeFileSync(path.join(declaringRoot, 'package.json'), JSON.stringify({
            name   : '@acme/grid-ext',
            version: '1.0.0',
            neo    : {scss: 'resources/scss'}
        }));

        // Non-declaring dependency: has resources/scss on disk, but no neo.scss field in package.json
        const plainRoot = path.join(root, 'node_modules/plain-pkg');
        fs.mkdirSync(plainRoot, {recursive: true});
        fs.writeFileSync(path.join(plainRoot, 'package.json'), JSON.stringify({
            name   : 'plain-pkg',
            version: '1.0.0'
        }));

        // Unlisted package in node_modules: even with neo.scss, not a direct dependency of the workspace
        const unlistedRoot = path.join(root, 'node_modules/unlisted-pkg');
        fs.mkdirSync(unlistedRoot, {recursive: true});
        fs.writeFileSync(path.join(unlistedRoot, 'package.json'), JSON.stringify({
            name   : 'unlisted-pkg',
            version: '1.0.0',
            neo    : {scss: 'resources/scss'}
        }));

        const writeFile = (base, relPath, css) => {
            const filePath = path.join(base, relPath);
            fs.mkdirSync(path.dirname(filePath), {recursive: true});
            fs.writeFileSync(filePath, css, 'utf8');
        };

        // Engine supplies theme-neo-light; declaring package adds src + theme-neo-dark; workspace overlays Shared.scss
        writeFile(engineRoot,    'resources/scss/theme-neo-light/button/Base.scss',       '.neo-btn { color: white; }\n');
        writeFile(declaringRoot, 'resources/scss/src/apps/ext/Row.scss',                  '.ext-row { color: green; }\n');
        writeFile(declaringRoot, 'resources/scss/src/apps/ext/Shared.scss',               '.ext-shared { color: green; }\n');
        writeFile(declaringRoot, 'resources/scss/theme-neo-dark/apps/ext/Row.scss',       '.ext-row { color: cyan; }\n');
        writeFile(plainRoot,     'resources/scss/src/apps/plain/Ignored.scss',            '.plain { color: red; }\n');
        writeFile(unlistedRoot,  'resources/scss/src/apps/unlisted/Ignored.scss',         '.unlisted { color: red; }\n');
        writeFile(root,          'resources/scss/src/apps/ext/Shared.scss',               '.ext-shared { color: purple; }\n');

        const helpOutput = execFileSync('node', [scriptPath, '--help'], {cwd: root, encoding: 'utf8', stdio: 'pipe'});
        expect(helpOutput).toContain('all, theme-neo-light, theme-neo-dark');

        runBuild(root);

        const map  = readMap(root),
              keys = mapKeys(map);

        // Declaring package's src and theme-neo-dark join the map and compile to dist/development/css
        expect(keys).toContain('apps.ext.Row');
        expect(keys).toContain('apps.ext.Shared');
        expect(map.apps.ext.Row).toEqual(expect.arrayContaining(['src', 'theme-neo-dark']));

        const rowCss = fs.readFileSync(path.join(root, 'dist/development/css/src/apps/ext/Row.css'), 'utf8');
        expect(rowCss).toContain('color: green');

        // Same-path file in the workspace overlays the declaring package's file
        const sharedCss = fs.readFileSync(path.join(root, 'dist/development/css/src/apps/ext/Shared.css'), 'utf8');
        expect(sharedCss).toContain('color: purple');
        expect(sharedCss).not.toContain('color: green');

        // Non-declaring and unlisted packages contribute nothing
        expect(keys).not.toContain('apps.plain.Ignored');
        expect(keys).not.toContain('apps.unlisted.Ignored');
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/apps/plain/Ignored.css'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'dist/development/css/src/apps/unlisted/Ignored.css'))).toBe(false);
    });
});
