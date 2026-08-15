import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    scriptPath = path.resolve(__dirname, '../../../../../../buildScripts/build/themes.mjs');

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
});
