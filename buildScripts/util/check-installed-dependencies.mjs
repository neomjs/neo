#!/usr/bin/env node
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';
import isEntryModule   from './isEntryModule.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * @module buildScripts/util/check-installed-dependencies
 * @summary Refuses a run whose `node_modules` was installed from another `package-lock.json`, so a local result speaks
 * for the dependency set CI installs.
 *
 * npm records every install in `node_modules/.package-lock.json`. Comparing its packages with the lockfile, by
 * `version` and `resolved`, finds each package a pull, branch switch or merge changed without an `npm i` since.
 * A linked package is deliberate, and an optional, `devOptional` or peer package may be absent by design, so neither
 * counts as drift. The Playwright configs call {@link assertInstallMatchesLock} at load, and `npm run server-start`
 * runs this file first. Fleet's seat Start can reuse {@link findInstallDrift} for the same question.
 */

/**
 * @summary Lists the packages whose installed copy differs from the lockfile.
 * @param {Object} lock      The parsed `package-lock.json`
 * @param {Object} installed The parsed `node_modules/.package-lock.json`
 * @returns {String[]} One line per package, empty when the install matches the lock
 */
export function findInstallDrift(lock, installed) {
    const installedPackages = installed?.packages || {},
          drift             = [];

    Object.entries(lock?.packages || {}).forEach(([key, locked]) => {
        const actual = installedPackages[key];

        // A linked package stands in for its locked copy on purpose
        if (!key.startsWith('node_modules/') || locked.link || actual?.link) {
            return
        }

        const name = key.slice('node_modules/'.length);

        if (!actual) {
            if (!locked.optional && !locked.devOptional && !locked.peer) {
                drift.push(`${name}: not installed, the lock wants ${locked.version}`)
            }
        } else if (actual.version !== locked.version) {
            drift.push(`${name}: ${actual.version} installed, the lock wants ${locked.version}`)
        } else if (actual.resolved && locked.resolved && actual.resolved !== locked.resolved) {
            drift.push(`${name}: installed from ${actual.resolved}, the lock wants ${locked.resolved}`)
        }
    });

    return drift
}

/**
 * @summary Throws when a repository's `node_modules` was installed from another `package-lock.json`, naming the
 * packages and the fix. A repository without a lockfile has nothing to compare and passes.
 * @param {String} [root] The repository root; by default the repository this file belongs to
 */
export function assertInstallMatchesLock(root = ROOT) {
    const lockPath      = path.join(root, 'package-lock.json'),
          installedPath = path.join(root, 'node_modules', '.package-lock.json'),
          readJson      = file => JSON.parse(fs.readFileSync(file, 'utf8'));

    if (!fs.existsSync(lockPath)) {
        return
    }

    if (!fs.existsSync(installedPath)) {
        throw new Error(`${root} has no npm install record (node_modules/.package-lock.json). Run \`npm i\`.`)
    }

    const drift = findInstallDrift(readJson(lockPath), readJson(installedPath));

    if (drift.length > 0) {
        throw new Error([
            `node_modules differs from package-lock.json in ${drift.length} package${drift.length === 1 ? '' : 's'}, so this run would not test what CI installs:`,
            ...drift.slice(0, 10).map(line => `  ${line}`),
            ...drift.length > 10 ? [`  … and ${drift.length - 10} more`] : [],
            'Run `npm i`, and `npx playwright install chromium` after a Playwright change.'
        ].join('\n'))
    }
}

/**
 * @summary CLI entry: checks the repository named by the first argument, by default this one.
 * @returns {Number} The exit code, 1 on drift
 */
function run() {
    try {
        assertInstallMatchesLock(process.argv[2] ? path.resolve(process.argv[2]) : ROOT);
        return 0
    } catch (error) {
        console.error(error.message);
        return 1
    }
}

if (isEntryModule(import.meta.url)) {
    process.exitCode = run()
}
