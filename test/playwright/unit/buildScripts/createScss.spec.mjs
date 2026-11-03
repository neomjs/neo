import {execFileSync}  from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import {test, expect}  from '@playwright/test';

const
    __dirname      = path.dirname(fileURLToPath(import.meta.url)),
    scssScriptPath = path.resolve(__dirname, '../../../../buildScripts/create/scss.mjs');

test.describe('buildScripts/create/scss.mjs theme root selector generation (#5085)', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-create-scss-'));
        fs.mkdirpSync(path.join(tmpDir, 'resources', 'scss', 'theme-dark'));
        fs.mkdirpSync(path.join(tmpDir, 'resources', 'scss', 'theme-light'));
    });

    test.afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.removeSync(tmpDir);
        }
    });

    test('emits :root .neo-<theme> selectors for non-Neo app component namespaces (LearnNeo.view.home.ContentComponent)', () => {
        execFileSync(
            process.execPath,
            [scssScriptPath, '-c', 'LearnNeo.view.home.ContentComponent', '-b', 'component.Base'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            srcFile   = path.join(tmpDir, 'resources', 'scss', 'src', 'apps', 'learnneo', 'home', 'ContentComponent.scss'),
            darkFile  = path.join(tmpDir, 'resources', 'scss', 'theme-dark', 'apps', 'learnneo', 'home', 'ContentComponent.scss'),
            lightFile = path.join(tmpDir, 'resources', 'scss', 'theme-light', 'apps', 'learnneo', 'home', 'ContentComponent.scss');

        expect(fs.existsSync(srcFile)).toBe(true);
        expect(fs.existsSync(darkFile)).toBe(true);
        expect(fs.existsSync(lightFile)).toBe(true);

        const
            darkContent  = fs.readFileSync(darkFile, 'utf8'),
            lightContent = fs.readFileSync(lightFile, 'utf8');

        expect(darkContent).toContain(':root .neo-theme-dark { // .learn-neo-view-home-content-component');
        expect(darkContent).not.toContain('.learnneo-theme-dark');
        expect(darkContent).toContain('--learn-neo-view-home-content-component-background-color: darkgreen;');

        expect(lightContent).toContain(':root .neo-theme-light { // .learn-neo-view-home-content-component');
        expect(lightContent).not.toContain('.learnneo-theme-light');
        expect(lightContent).toContain('--learn-neo-view-home-content-component-background-color: green;');
    });

    test('emits :root .neo-<theme> selectors for Neo framework component namespaces (Neo.component.MyWidget)', () => {
        execFileSync(
            process.execPath,
            [scssScriptPath, '-c', 'Neo.component.MyWidget', '-b', 'component.Base'],
            {cwd: tmpDir, stdio: 'pipe'}
        );

        const
            srcFile     = path.join(tmpDir, 'resources', 'scss', 'src', 'component', 'MyWidget.scss'),
            darkFile    = path.join(tmpDir, 'resources', 'scss', 'theme-dark', 'component', 'MyWidget.scss'),
            darkContent = fs.readFileSync(darkFile, 'utf8');

        expect(fs.existsSync(srcFile)).toBe(true);
        expect(fs.existsSync(darkFile)).toBe(true);
        expect(darkContent).toContain(':root .neo-theme-dark { // .neo-component-my-widget');
    });
});
