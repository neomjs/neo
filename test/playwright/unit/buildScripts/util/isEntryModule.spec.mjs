import {test, expect}                 from '@playwright/test';
import {execFileSync, spawnSync}      from 'node:child_process';
import fs                             from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import isEntryModule                  from '../../../../../buildScripts/util/isEntryModule.mjs';

const
    REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'),
    HELPER    = path.join(REPO_ROOT, 'buildScripts/util/isEntryModule.mjs'),
    /**
     * @param {...String} args
     * @returns {String} what the node process printed
     */
    run       = (...args) => execFileSync(process.execPath, args, {encoding: 'utf8'}).trim();

/**
 * @summary A disposable directory holding a probe that prints whether it is the entry module, a second module that
 * only imports the probe, and a symlink to the directory. The directory is canonical first: on macOS the tmpdir is
 * itself reached through a symlink, which would make the "real path" arm a symlinked one.
 * @returns {{dir: String, real: String, link: String}}
 */
function fixture() {
    const dir  = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'is-entry-module-'))),
          real = path.join(dir, 'real'),
          link = path.join(dir, 'link');

    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'probe.mjs'), [
        `import isEntryModule from ${JSON.stringify(pathToFileURL(HELPER).href)};`,
        'console.log(JSON.stringify(isEntryModule(import.meta.url)));'
    ].join('\n'));
    fs.writeFileSync(path.join(real, 'importer.mjs'), "import './probe.mjs';\n");
    fs.symlinkSync(real, link);

    return {dir, real, link}
}

/**
 * @summary `isEntryModule()` tells a build script whether `node` was asked to run it, however the path reached it.
 */
test.describe('buildScripts/util/isEntryModule', () => {
    test('the script node runs is the entry: through its real path, a symlinked one, and --preserve-symlinks-main', () => {
        const {dir, real, link} = fixture();

        try {
            expect(run(path.join(real, 'probe.mjs')), 'the real path').toBe('true');
            expect(run(path.join(link, 'probe.mjs')), 'a symlinked path').toBe('true');
            expect(run('--preserve-symlinks-main', path.join(link, 'probe.mjs')), 'with --preserve-symlinks-main').toBe('true')
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('an imported module is not the entry, and nothing is when argv names no script on disk', () => {
        const {dir, real} = fixture(),
              [, entry]   = process.argv;

        try {
            expect(run(path.join(real, 'importer.mjs')), 'imported by another script').toBe('false')
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }

        try {
            process.argv[1] = undefined;
            expect(isEntryModule(pathToFileURL(HELPER).href), 'no argv entry').toBe(false);

            process.argv[1] = path.join(os.tmpdir(), 'no-such-script.mjs');
            expect(isEntryModule(pathToFileURL(HELPER).href), 'an argv path that names nothing').toBe(false)
        } finally {
            process.argv[1] = entry
        }
    });

    test('a guard run through a symlinked checkout path reports instead of exiting silently', () => {
        const dir  = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'is-entry-module-checkout-'))),
              link = path.join(dir, 'checkout');

        fs.symlinkSync(REPO_ROOT, link);

        try {
            const {stdout, stderr} = spawnSync(process.execPath, [path.join(link, 'buildScripts/util/check-guard-ci-parity.mjs')], {encoding: 'utf8'});

            expect((stdout + stderr).trim(), 'the guard ran its CLI block and printed its report').not.toBe('')
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    })
});
