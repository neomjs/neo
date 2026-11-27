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
 * build-themes theme-map regeneration: a full build reseeds the map from the effective source
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

    const writeSource = (base, rel) => {
        const filePath = path.join(base, 'resources/css/src', rel);
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

    test('a full build reseeds from the effective source tree — a fossil key from the previous map is gone (AC1)', () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-themes-seed-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://example.invalid'},
            name   : 'neo.mjs-fixture',
            version: '1.0.0'
        }));
        writeSource(root, 'apps/demo/Widget.css');

        // The previous artifact carries a fossil: a key whose source file no longer exists.
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
        writeSource(root, 'apps/demo/Widget.css');

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
        const writeThemeSource = (base, theme, rel) => {
            const filePath = path.join(base, 'resources/css', theme, rel);
            fs.mkdirSync(path.dirname(filePath), {recursive: true});
            fs.writeFileSync(filePath, '.x { color: blue; }\n', 'utf8');
        };

        writeSource(root, 'apps/demo/Widget.css');
        writeThemeSource(engineRoot, 'theme-neo-dark',      'Global.css');
        writeThemeSource(engineRoot, 'theme-neo-light',     'Global.css');
        fs.writeFileSync(path.join(engineRoot, 'resources/css/theme-neo-dark/Global.css'),  ':where(.neo-theme-neo-dark) { --x: 1; }\n',  'utf8');
        fs.writeFileSync(path.join(engineRoot, 'resources/css/theme-neo-light/Global.css'), ':where(.neo-theme-neo-light) { --x: 1; }\n', 'utf8');
        writeThemeSource(engineRoot, 'theme-neo-dark',      'button/Base.css');
        writeThemeSource(engineRoot, 'theme-neo-light',     'button/Base.css');
        writeThemeSource(root,       'theme-neo-dark',      'apps/demo/Widget.css');
        fs.mkdirSync(path.join(root, 'resources/css/theme-workspace'), {recursive: true});
        fs.writeFileSync(path.join(root, 'resources/css/theme-workspace/Global.css'), ':where(.neo-theme-workspace) { --x: 1; }\n', 'utf8');
        writeThemeSource(root,       'theme-workspace',     'apps/demo/Widget.css');
        writeThemeSource(root,       'not-a-theme-helper',  'apps/demo/Ignored.css');

        const helpOutput = execFileSync('node', [scriptPath, '--help'], {cwd: root, encoding: 'utf8', stdio: 'pipe'});
        expect(helpOutput).toContain('all, theme-neo-dark, theme-neo-light, theme-workspace');
        expect(helpOutput).not.toContain('not-a-theme-helper');

        runBuild(root);

        const map = readMap(root);
        expect(map.Neo.button.Base).toEqual(expect.arrayContaining(['theme-neo-dark', 'theme-neo-light']));
        expect(map.apps.demo.Widget).toEqual(expect.arrayContaining(['src', 'theme-neo-dark', 'theme-workspace']));
        expect(map.apps.demo.Ignored).toBeUndefined();
    });

    test('a workspace builds the sheets of a declaring dependency, ignores non-declaring and unlisted packages, and lets the workspace overlay same-path files (#20260)', () => {
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

        // Declaring package: declares "neo": {"css": "resources/css"}
        const declaringRoot = path.join(root, 'node_modules/@acme/grid-ext');
        fs.mkdirSync(declaringRoot, {recursive: true});
        fs.writeFileSync(path.join(declaringRoot, 'package.json'), JSON.stringify({
            name   : '@acme/grid-ext',
            version: '1.0.0',
            neo    : {css:'resources/css'}
        }));

        // Non-declaring dependency: has resources/css on disk, but no neo.css field in package.json
        const plainRoot = path.join(root, 'node_modules/plain-pkg');
        fs.mkdirSync(plainRoot, {recursive: true});
        fs.writeFileSync(path.join(plainRoot, 'package.json'), JSON.stringify({
            name   : 'plain-pkg',
            version: '1.0.0'
        }));

        // Unlisted package in node_modules: even with neo.css, not a direct dependency of the workspace
        const unlistedRoot = path.join(root, 'node_modules/unlisted-pkg');
        fs.mkdirSync(unlistedRoot, {recursive: true});
        fs.writeFileSync(path.join(unlistedRoot, 'package.json'), JSON.stringify({
            name   : 'unlisted-pkg',
            version: '1.0.0',
            neo    : {css:'resources/css'}
        }));

        const writeFile = (base, relPath, css) => {
            const filePath = path.join(base, relPath);
            fs.mkdirSync(path.dirname(filePath), {recursive: true});
            fs.writeFileSync(filePath, css, 'utf8');
        };

        // Engine supplies theme-neo-light; declaring package adds src + theme-neo-dark; workspace overlays Shared.css
        writeFile(engineRoot,    'resources/css/theme-neo-light/Global.css',            ':where(.neo-theme-neo-light) { --x: 1; }\n');
        writeFile(engineRoot,    'resources/css/theme-neo-light/button/Base.css',       '.neo-btn { color: white; }\n');
        writeFile(declaringRoot, 'resources/css/src/apps/ext/Row.css',                  '.ext-row { color: green; }\n');
        writeFile(declaringRoot, 'resources/css/src/apps/ext/Shared.css',               '.ext-shared { color: green; }\n');
        writeFile(declaringRoot, 'resources/css/theme-neo-dark/Global.css',             ':where(.neo-theme-neo-dark) { --x: 1; }\n');
        writeFile(declaringRoot, 'resources/css/theme-neo-dark/apps/ext/Row.css',       '.ext-row { color: cyan; }\n');
        writeFile(plainRoot,     'resources/css/src/apps/plain/Ignored.css',            '.plain { color: red; }\n');
        writeFile(unlistedRoot,  'resources/css/src/apps/unlisted/Ignored.css',         '.unlisted { color: red; }\n');
        writeFile(root,          'resources/css/src/apps/ext/Shared.css',               '.ext-shared { color: purple; }\n');

        const helpOutput = execFileSync('node', [scriptPath, '--help'], {cwd: root, encoding: 'utf8', stdio: 'pipe'});
        expect(helpOutput).toContain('all, theme-neo-light, theme-neo-dark');

        runBuild(root);

        const map  = readMap(root),
              keys = mapKeys(map);

        // Declaring package's src and theme-neo-dark join the map and build to dist/development/css
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

    test('derives class-to-folders from Global.css selectors, admitting theme-base and multi-class folders without name derivation', () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-themes-class-map-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            bugs   : {url: 'https://example.invalid'},
            name   : 'neo.mjs-fixture',
            version: '1.0.0'
        }));

        const writeCss = (relPath, css) => {
            const filePath = path.join(root, 'resources/css', relPath);
            fs.mkdirSync(path.dirname(filePath), {recursive: true});
            fs.writeFileSync(filePath, css, 'utf8');
        };

        writeCss('src/Global.css', ':where([class^="neo-theme-"]) { --motion-fast: 120ms; } .neo-theme-scope { color-scheme: var(--neo-color-scheme); }\n');
        writeCss('src/button/Base.css', '.neo-button { color: var(--button-text-color); }\n');
        writeCss('theme-base/button/Base.css', '[class*="neo-theme-"] { --button-text-color: var(--neo-color-text-default); }\n');
        // Folder name intentionally differs from both declared classes, while theme-neo-dark coexists during migration
        writeCss('shared-neo/Global.css', [
            '/* .neo-theme-commented-out { --ignored: 1; } */',
            '.neo-theme-neo-light { --neo-color-scheme: light; }',
            '.neo-theme-neo-dark  { --neo-color-scheme: dark; }',
            ':where(.neo-theme-neo-light, .neo-theme-neo-dark) { --neo-color-text-default: #111; }'
        ].join('\n'));
        writeCss('shared-neo/button/Base.css', ':where(.neo-theme-neo-light, .neo-theme-neo-dark) { --button-gap: 4px; }\n');
        writeCss('theme-neo-dark/Global.css', ':where(.neo-theme-neo-dark) { --legacy-dark: 1; }\n');
        writeCss('theme-dark/Global.css', ':root .neo-theme-dark { --neo-color-scheme: dark; }\n');

        runBuild(root);

        const map = readMap(root);

        expect(map.themes).toEqual({
            'neo-theme-dark'     : ['theme-dark'],
            'neo-theme-neo-dark' : ['shared-neo', 'theme-neo-dark'],
            'neo-theme-neo-light': ['shared-neo']
        });
        expect(map.Neo.button.Base).toEqual(['src', 'shared-neo', 'theme-base']);
        expect(fs.existsSync(path.join(root, 'dist/development/css/theme-base/button/Base.css'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'dist/development/css/shared-neo/Global.css'))).toBe(true);
    });
});
