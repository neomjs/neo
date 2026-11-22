import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

test.describe('buildScripts/create scripts run from a consumer workspace (#21825)', () => {
    let root, engineLink;

    // A workspace runs the engine's scripts as `node ./node_modules/neo.mjs/buildScripts/create/<script>`
    const run = (script, args) => spawnSync(process.execPath, [`./node_modules/neo.mjs/buildScripts/create/${script}`, ...args], {
        cwd: root, encoding: 'utf8', input: ''
    });

    const exists = file => fs.existsSync(path.join(root, file));

    test.beforeEach(() => {
        root       = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-create-component-'));
        engineLink = path.join(root, 'node_modules/neo.mjs');

        // The shape `npx neo-app` generates: its own package, an app folder and `buildScripts/myApps.json`
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: 'ws', version: '1.0.0'}));
        fs.mkdirSync(path.join(root, 'apps/myapp/view'), {recursive: true});
        fs.mkdirSync(path.join(root, 'buildScripts'));
        fs.writeFileSync(path.join(root, 'buildScripts/myApps.json'), JSON.stringify({apps: ['MyApp']}));
        fs.mkdirSync(path.dirname(engineLink));
        fs.symlinkSync(repoRoot, engineLink, 'dir');
    });

    test.afterEach(() => {
        // Unlink the engine first, so removing the workspace can never reach the checkout behind the link
        fs.unlinkSync(engineLink);
        fs.rmSync(root, {recursive: true, force: true});
    });

    test('create-component writes a view class and its style stub into the workspace', () => {
        test.setTimeout(60_000);

        const result = run('component.mjs', ['-c', 'MyApp.view.Foo', '-b', 'container.Base', '-n', 'no', '-C', 'no', '-p', 'no']);

        expect(result.status, result.stderr).toBe(0);
        expect(exists('apps/myapp/view/Foo.mjs')).toBe(true);
        expect(exists('resources/css/src/apps/myapp/Foo.css')).toBe(true);
    });

    test('create-class, create-app and create-app-minimal each run with arguments', () => {
        test.setTimeout(60_000);

        const app = ['-m', 'DragDrop,Stylesheet', '-s', 'no', '-t', 'neo-light', '-u', 'no'];

        for (const [script, args, file] of [
            ['class.mjs',      ['-c', 'MyApp.view.Bar', '-b', 'container.Base', '-n', 'no', '-C', 'no', '-p', 'no'], 'apps/myapp/view/Bar.mjs'],
            ['app.mjs',        ['-a', 'Alpha', ...app],                                                         'apps/alpha/app.mjs'],
            ['appMinimal.mjs', ['-a', 'Beta', ...app],                                                          'apps/beta/app.mjs']
        ]) {
            const result = run(script, args);

            expect(result.status, `${script}: ${result.stderr}`).toBe(0);
            expect(exists(file), file).toBe(true);
        }
    });
});
