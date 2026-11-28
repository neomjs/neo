import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename    = fileURLToPath(import.meta.url),
    __dirname     = path.dirname(__filename),
    appScript     = path.resolve(__dirname, '../../../../buildScripts/create/app.mjs'),
    minimalScript = path.resolve(__dirname, '../../../../buildScripts/create/appMinimal.mjs'),
    engineRoot    = path.resolve(__dirname, '../../../..');

test.describe('buildScripts/create/app.mjs & appMinimal.mjs theme discovery (#5305)', () => {
    let root;

    test.beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-create-app-themes-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name   : 'demo-workspace',
            version: '1.0.0'
        }));

        // Framework addon & theme dirs inside node_modules/neo.mjs
        const addonDir = path.join(root, 'node_modules/neo.mjs/src/main/addon');
        fs.mkdirSync(addonDir, {recursive: true});
        fs.writeFileSync(path.join(addonDir, 'Stylesheet.mjs'), '');
        fs.writeFileSync(path.join(addonDir, 'HighlightJS.mjs'), '');

        const engineDir = path.join(root, 'node_modules/neo.mjs');
        fs.mkdirSync(path.join(engineDir, 'buildScripts'), {recursive: true});
        fs.symlinkSync(path.join(engineRoot, 'buildScripts/util'), path.join(engineDir, 'buildScripts/util'), 'dir');
        fs.cpSync(path.join(engineRoot, 'resources/lib'), path.join(engineDir, 'resources/lib'), {recursive: true});

        const writeTheme = (repoRoot, folder, selectors) => {
            const dir = path.join(repoRoot, 'resources/css', folder);
            fs.mkdirSync(dir, {recursive: true});
            fs.writeFileSync(path.join(dir, 'Global.css'), `${selectors} { color: inherit }`);
        };

        writeTheme(engineDir, 'theme-neo', '.neo-theme-neo-dark, .neo-theme-neo-light');
        writeTheme(engineDir, 'theme-material', '.neo-theme-material-light, .neo-theme-material-dark');
        writeTheme(engineDir, 'theme-base', ':root');
        writeTheme(root, 'theme-neo-dark', '.neo-theme-neo-dark');
        writeTheme(root, 'theme-workspace', '.neo-theme-workspace');

        // Workspace myApps.json
        fs.mkdirSync(path.join(root, 'buildScripts'), {recursive: true});
        fs.writeFileSync(path.join(root, 'buildScripts/myApps.json'), JSON.stringify({apps: []}));
    });

    test.afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    test('create/app.mjs scaffolds a controller-backed viewport with a workspace theme', () => {
        execFileSync('node', [
            appScript,
            '-a', 'DemoApp',
            '-t', 'neo-theme-workspace',
            '-u', 'no',
            '-s', 'no'
        ], {cwd: root, encoding: 'utf8', stdio: 'pipe'});

        const neoConfig = JSON.parse(fs.readFileSync(path.join(root, 'apps/demoapp/neo-config.json'), 'utf8'));
        expect(neoConfig.themes).toEqual(['neo-theme-workspace']);

        const viewport           = fs.readFileSync(path.join(root, 'apps/demoapp/view/Viewport.mjs'), 'utf8'),
              viewportController = fs.readFileSync(path.join(root, 'apps/demoapp/view/ViewportController.mjs'), 'utf8');

        expect(viewport).toContain("import ViewportController from './ViewportController.mjs';");
        expect(viewport).toContain('controller: ViewportController,');
        expect(viewportController).toContain("import Component from '../../../node_modules/neo.mjs/src/controller/Component.mjs';");
        expect(viewportController).toContain("className: 'DemoApp.view.ViewportController'");
        expect(viewportController).toContain('export default Neo.setupClass(ViewportController);');
    });

    for (const [name, script] of [['app', appScript], ['appMinimal', minimalScript]]) {
        test(`${name} offers each theme class once and writes the selected Material pair in order`, () => {
            const help = execFileSync('node', [script, '--help'], {cwd: root, encoding: 'utf8'}).replace(/\s+/g, ' ');
            expect(help).toContain('all, neo-theme-material-dark, neo-theme-material-light, neo-theme-neo-dark, neo-theme-neo-light, neo-theme-workspace, none');

            execFileSync('node', [script, '-a', 'MaterialApp', '-t', 'neo-theme-material-light, neo-theme-material-dark',
                '-u', 'no', '-s', 'no'], {cwd: root, stdio: 'pipe'});

            const config = JSON.parse(fs.readFileSync(path.join(root, 'apps/materialapp/neo-config.json'), 'utf8'));
            expect(config.themes).toEqual(['neo-theme-material-light', 'neo-theme-material-dark']);
        });

        test(`${name} copies the shared highlight styles into an external app`, () => {
            execFileSync('node', [script, '-a', 'DemoApp', '-m', 'HighlightJS,Stylesheet',
                '-t', 'none', '-u', 'no', '-s', 'no'], {cwd: root, encoding: 'utf8', stdio: 'pipe'});

            const actual = path.join(root, 'apps/demoapp/resources/lib');
            for (const filename of ['highlightjs-custom-dark-theme.css', 'highlightjs-custom-github-theme.css']) {
                expect(fs.readFileSync(path.join(actual, filename), 'utf8')).toBe(
                    fs.readFileSync(path.join(engineRoot, 'resources/lib', filename), 'utf8')
                );
            }
            expect(fs.existsSync(path.join(actual, 'highlight'))).toBe(false);
            expect(fs.existsSync(path.join(root, 'apps/demoapp/resources/images'))).toBe(false);
        });
    }
});
