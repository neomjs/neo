import {test, expect}                               from '@playwright/test';
import {spawnSync}                                  from 'node:child_process';
import fs                                           from 'node:fs';
import os                                           from 'node:os';
import path                                         from 'node:path';
import {fileURLToPath}                              from 'node:url';
import {assertInstallMatchesLock, findInstallDrift} from '../../../../../buildScripts/util/check-installed-dependencies.mjs';

const CLI = fileURLToPath(new URL('../../../../../buildScripts/util/check-installed-dependencies.mjs', import.meta.url));

/**
 * @summary A lockfile shape: the root entry plus the given packages.
 * @param {Object} packages Keyed like npm's, e.g. `node_modules/foo`
 * @returns {Object}
 */
const lockOf = packages => ({lockfileVersion: 3, packages: {'': {name: 'fixture'}, ...packages}});

/**
 * @summary Writes a repository root holding the given lockfile and, when passed, npm's install record.
 * @param {Object} lock
 * @param {Object} [installed]
 * @returns {String} The root
 */
function writeRepository(lock, installed) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-install-check-'));

    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));

    if (installed) {
        fs.mkdirSync(path.join(root, 'node_modules'));
        fs.writeFileSync(path.join(root, 'node_modules', '.package-lock.json'), JSON.stringify(installed))
    }

    return root
}

const PLAYWRIGHT = {version: '1.65.0', resolved: 'https://registry.npmjs.org/@playwright/test/-/test-1.65.0.tgz', dev: true};

test.describe('buildScripts/util/check-installed-dependencies', () => {
    test('an install that matches the lock has no drift; the root and workspace entries are not packages', () => {
        const lock = lockOf({'node_modules/@playwright/test': PLAYWRIGHT, 'packages/app': {version: '0.0.1'}});

        expect(findInstallDrift(lock, lockOf({'node_modules/@playwright/test': PLAYWRIGHT}))).toEqual([])
    });

    test('a different version or source is drift', () => {
        const lock = lockOf({
            'node_modules/@playwright/test': PLAYWRIGHT,
            'node_modules/a/node_modules/b': {version: '2.0.0', resolved: 'git+ssh://git@github.com/x/b.git#aaa'}
        });

        expect(findInstallDrift(lock, lockOf({
            'node_modules/@playwright/test': {...PLAYWRIGHT, version: '1.64.1'},
            'node_modules/a/node_modules/b': {version: '2.0.0', resolved: 'git+ssh://git@github.com/x/b.git#bbb'}
        }))).toEqual([
            '@playwright/test: 1.64.1 installed, the lock wants 1.65.0',
            'a/node_modules/b: installed from git+ssh://git@github.com/x/b.git#bbb, the lock wants git+ssh://git@github.com/x/b.git#aaa'
        ])
    });

    test('a package the lock requires and the install lacks is drift; an optional, devOptional or peer one is not', () => {
        const lock = lockOf({
            'node_modules/required'      : {version: '1.0.0'},
            'node_modules/@esbuild/linux': {version: '0.28.2', optional: true},
            'node_modules/fsevents'      : {version: '2.3.3', devOptional: true},
            'node_modules/peer-only'     : {version: '3.0.0', peer: true}
        });

        expect(findInstallDrift(lock, lockOf({}))).toEqual(['required: not installed, the lock wants 1.0.0'])
    });

    test('a link on either side is deliberate, not drift', () => {
        const lock = lockOf({'node_modules/neo.mjs': {version: '13.4.0'}, 'node_modules/linked': {resolved: '../linked', link: true}});

        expect(findInstallDrift(lock, lockOf({'node_modules/neo.mjs': {resolved: '../neo', link: true}}))).toEqual([])
    });

    test('assertInstallMatchesLock names the drift and the fix, and needs the install record', () => {
        const lock = lockOf({'node_modules/@playwright/test': PLAYWRIGHT});

        expect(() => assertInstallMatchesLock(writeRepository(lock, lock))).not.toThrow();
        expect(() => assertInstallMatchesLock(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-install-check-')))).not.toThrow();
        expect(() => assertInstallMatchesLock(writeRepository(lock))).toThrow(/no npm install record/);
        expect(() => assertInstallMatchesLock(writeRepository(lock, lockOf({'node_modules/@playwright/test': {...PLAYWRIGHT, version: '1.64.1'}}))))
            .toThrow(/1 package, so this run would not test what CI installs:\n  @playwright\/test: 1\.64\.1 installed, the lock wants 1\.65\.0\nRun `npm i`/)
    });

    test('the CLI exits 1 on drift and 0 on a match', () => {
        const lock  = lockOf({'node_modules/@playwright/test': PLAYWRIGHT}),
              stale = spawnSync(process.execPath, [CLI, writeRepository(lock, lockOf({}))], {encoding: 'utf8'}),
              fresh = spawnSync(process.execPath, [CLI, writeRepository(lock, lock)], {encoding: 'utf8'});

        expect({status: stale.status, says: stale.stderr.includes('@playwright/test: not installed')}).toEqual({status: 1, says: true});
        expect(fresh.status).toBe(0)
    });
});
