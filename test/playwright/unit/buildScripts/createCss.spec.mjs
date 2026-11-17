import {execFileSync}  from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import {test, expect}  from '@playwright/test';

const
    __dirname     = path.dirname(fileURLToPath(import.meta.url)),
    cssScriptPath = path.resolve(__dirname, '../../../../buildScripts/create/css.mjs');

test.describe('buildScripts/create/css.mjs theme root selector generation (#5085)', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-create-css-'));
        fs.mkdirpSync(path.join(tmpDir, 'resources', 'css', 'theme-dark'));
        fs.mkdirpSync(path.join(tmpDir, 'resources', 'css', 'theme-light'));
    });

    test.afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.removeSync(tmpDir);
        }
    });

    test('emits :root .neo-<theme> selectors for non-Neo app component namespaces (LearnNeo.view.home.ContentComponent)', () => {
        execFileSync(
            process.execPath,
            [cssScriptPath, '-c', 'LearnNeo.view.home.ContentComponent', '-b', 'component.Base'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            srcFile   = path.join(tmpDir, 'resources', 'css', 'src', 'apps', 'learnneo', 'home', 'ContentComponent.css'),
            darkFile  = path.join(tmpDir, 'resources', 'css', 'theme-dark', 'apps', 'learnneo', 'home', 'ContentComponent.css'),
            lightFile = path.join(tmpDir, 'resources', 'css', 'theme-light', 'apps', 'learnneo', 'home', 'ContentComponent.css');

        expect(fs.existsSync(srcFile)).toBe(true);
        expect(fs.existsSync(darkFile)).toBe(true);
        expect(fs.existsSync(lightFile)).toBe(true);

        const
            darkContent  = fs.readFileSync(darkFile, 'utf8'),
            lightContent = fs.readFileSync(lightFile, 'utf8');

        expect(darkContent).toContain(':root .neo-theme-dark { /* .learn-neo-view-home-content-component */');
        expect(darkContent).not.toContain('.learnneo-theme-dark');
        expect(darkContent).toContain('--learn-neo-view-home-content-component-background-color: darkgreen;');

        expect(lightContent).toContain(':root .neo-theme-light { /* .learn-neo-view-home-content-component */');
        expect(lightContent).not.toContain('.learnneo-theme-light');
        expect(lightContent).toContain('--learn-neo-view-home-content-component-background-color: green;');
    });

    test('emits :root .neo-<theme> selectors for Neo framework component namespaces (Neo.component.MyWidget)', () => {
        execFileSync(
            process.execPath,
            [cssScriptPath, '-c', 'Neo.component.MyWidget', '-b', 'component.Base'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            srcFile     = path.join(tmpDir, 'resources', 'css', 'src', 'component', 'MyWidget.css'),
            darkFile    = path.join(tmpDir, 'resources', 'css', 'theme-dark', 'component', 'MyWidget.css'),
            darkContent = fs.readFileSync(darkFile, 'utf8');

        expect(fs.existsSync(srcFile)).toBe(true);
        expect(fs.existsSync(darkFile)).toBe(true);
        expect(darkContent).toContain(':root .neo-theme-dark { /* .neo-component-my-widget */');
    });

    test('removes only the leading view segment, matching the runtime theme lookup', () => {
        execFileSync(process.execPath, [cssScriptPath, '-c', 'Demo.view.section.view.Card'], {cwd: tmpDir, stdio: 'pipe'});

        for (const folder of ['src', 'theme-dark', 'theme-light']) {
            const expected = path.join(tmpDir, 'resources/css', folder, 'apps/demo/section/view/Card.css'),
                flattened  = path.join(tmpDir, 'resources/css', folder, 'apps/demo/section/Card.css');

            expect(fs.existsSync(expected)).toBe(true);
            expect(fs.existsSync(flattened)).toBe(false);
            expect(fs.readFileSync(expected, 'utf8')).toContain('demo-view-section-view-card')
        }
    });
});
