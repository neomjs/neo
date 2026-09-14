import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'HighlightJsUtilTest'
    }
});

import {spawnSync}       from 'node:child_process';
import fs                from 'node:fs';
import os                from 'node:os';
import path              from 'node:path';
import {pathToFileURL}   from 'node:url';
import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import HighlightJs       from '../../../../src/util/HighlightJs.mjs';
import {parsePackOutput} from '../../../../buildScripts/util/check-package-contents.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

/**
 * `HighlightJs#load()` imports `Neo.config.basePath + getBundlePath()`, so in an installed engine the
 * file it requests must be one the npm package ships. CI's checkout builds both bundles, so no hosted
 * render can notice when it is not.
 *
 * The file set therefore comes from npm, not from a registry: a real `npm pack` over this repository's
 * `package.json` and `.npmignore`, with a stand-in at every path the loader can request, and the real
 * loader run against a tree holding only what was packed.
 */
test.describe('Neo.util.HighlightJs — the loader resolves inside the published package', () => {
    let originalBasePath, originalDebug, tmpRoot;

    test.beforeEach(() => {
        originalBasePath = Neo.config.basePath;
        originalDebug    = HighlightJs.debug;
        tmpRoot          = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-highlight-pack-')))
    });

    test.afterEach(() => {
        Neo.config.basePath = originalBasePath;
        HighlightJs.debug   = originalDebug;
        HighlightJs.hljs    = null;
        fs.rmSync(tmpRoot, {recursive: true, force: true})
    });

    /**
     * Plants a stand-in at the bundle path of each `debug` value, packs that fixture with the
     * repository's package metadata, and installs only the packed files.
     * @returns {String} The install root as a `basePath`: a file URL with a trailing slash.
     */
    const installPackedBundles = () => {
        const packRoot    = path.join(tmpRoot, 'pack'),
              installRoot = path.join(tmpRoot, 'install');

        fs.mkdirSync(packRoot, {recursive: true});

        ['package.json', '.npmignore'].forEach(file => {
            fs.copyFileSync(path.join(repoRoot, file), path.join(packRoot, file))
        });

        [originalDebug, !originalDebug].forEach(debug => {
            HighlightJs.debug = debug;

            const bundlePath = HighlightJs.getBundlePath(),
                  file       = path.join(packRoot, bundlePath);

            fs.mkdirSync(path.dirname(file), {recursive: true});
            // The payload only names its own path; which file loaded is what the arms assert.
            fs.writeFileSync(file, `export default {bundle: ${JSON.stringify(bundlePath)}};`)
        });

        HighlightJs.debug = originalDebug;

        const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {cwd: packRoot, encoding: 'utf8'});

        expect(result.status, result.stderr).toBe(0);

        parsePackOutput(result.stdout)[0].files.forEach(({path: file}) => {
            fs.mkdirSync(path.dirname(path.join(installRoot, file)), {recursive: true});
            fs.copyFileSync(path.join(packRoot, file), path.join(installRoot, file))
        });

        return pathToFileURL(installRoot).href + '/'
    };

    test('the declared default loads the bundle it names from the packed files', async () => {
        Neo.config.basePath = installPackedBundles();

        await HighlightJs.load();

        expect(HighlightJs.hljs.bundle).toBe(HighlightJs.getBundlePath())
    });

    test('so does the other value of debug, a public config a consumer may set', async () => {
        Neo.config.basePath = installPackedBundles();
        HighlightJs.debug   = !originalDebug;

        await HighlightJs.load();

        expect(HighlightJs.hljs.bundle).toBe(HighlightJs.getBundlePath())
    });

    test('control: a requested bundle absent from the install tree rejects instead of loading', async () => {
        Neo.config.basePath = installPackedBundles();

        fs.rmSync(new URL(HighlightJs.getBundlePath(), Neo.config.basePath), {force: true});

        await expect(HighlightJs.load()).rejects.toMatchObject({code: 'ERR_MODULE_NOT_FOUND'})
    });
});
