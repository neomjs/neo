import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'HighlightJsUtilTest'
    }
});

import fs                from 'node:fs';
import os                from 'node:os';
import path              from 'node:path';
import {pathToFileURL}   from 'node:url';
import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import HighlightJs       from '../../../../src/util/HighlightJs.mjs';

const bundles = {
    debug     : 'dist/highlight/highlight.custom.js',
    production: 'dist/highlight/highlight.custom.min.js'
};

/**
 * @summary The loader addresses the producer's two filenames inside a consumer's installed Engine.
 * The full consumer-build guard owns real generation; these stand-ins isolate the public debug-path contract.
 */
test.describe('Neo.util.HighlightJs — consumer-generated bundle paths', () => {
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
     * @summary Creates consumer-generated stand-ins at the producer's filenames, independently of the loader.
     * @returns {String} The installed Engine root as a file URL with a trailing slash.
     */
    const installConsumerBundles = () => {
        const installRoot = path.join(tmpRoot, 'install');

        fs.mkdirSync(installRoot, {recursive: true});
        fs.writeFileSync(path.join(installRoot, 'package.json'), JSON.stringify({type: 'module'}));

        for (const bundlePath of Object.values(bundles)) {
            const file = path.join(installRoot, bundlePath);

            fs.mkdirSync(path.dirname(file), {recursive: true});
            fs.writeFileSync(file, `export default {bundle: ${JSON.stringify(bundlePath)}};`)
        }

        return pathToFileURL(installRoot).href + '/'
    };

    test('the declared default loads its consumer-generated file', async () => {
        Neo.config.basePath = installConsumerBundles();

        await HighlightJs.load();

        expect(HighlightJs.hljs.bundle).toBe(originalDebug ? bundles.debug : bundles.production)
    });

    test('so does the other value of debug, a public config a consumer may set', async () => {
        Neo.config.basePath = installConsumerBundles();
        HighlightJs.debug   = !originalDebug;

        await HighlightJs.load();

        expect(HighlightJs.hljs.bundle).toBe(originalDebug ? bundles.production : bundles.debug)
    });

    test('control: a requested bundle absent from the install tree rejects instead of loading', async () => {
        Neo.config.basePath = installConsumerBundles();

        fs.rmSync(new URL(HighlightJs.getBundlePath(), Neo.config.basePath), {force: true});

        await expect(HighlightJs.load()).rejects.toMatchObject({code: 'ERR_MODULE_NOT_FOUND'})
    });
});
