#!/usr/bin/env node
/**
 * @summary Fails when a production build ships the build machine's file system: any `.js` or `.mjs` file under
 * the build folder that contains a `file:///` URL. Such a URL is the builder's absolute path (a user name, a
 * directory layout), and it reaches every visitor of the public bundle.
 *
 * The usual source is a source module's `import.meta.url`, which webpack inlines at build time unless the config
 * keeps it a runtime value (`module.parser.javascript.importMeta: false`). `build/all.mjs` runs this check after
 * every production thread build, so a new `import.meta.url` cannot ship the path quietly.
 *
 * Usage: `node buildScripts/util/check-dist-paths.mjs [dir]`, where `dir` defaults to `dist/production`. A folder
 * that does not exist fails too: a check that finds nothing to read passes nothing.
 */

import fs            from 'node:fs';
import path          from 'node:path';
import isEntryModule from './isEntryModule.mjs';

const
    FILE_URL   = 'file:///',
    EXTENSIONS = new Set(['.js', '.mjs']);

/**
 * @summary Lists the script files under `dir` whose text contains a `file:///` URL.
 * @param {String} dir The build folder to scan.
 * @returns {String[]} Paths relative to `dir`, sorted.
 */
export function findFileUrls(dir) {
    const found = [];

    const walk = current => {
        for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
            const fullPath = path.join(current, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath)
            } else if (EXTENSIONS.has(path.extname(entry.name)) && fs.readFileSync(fullPath, 'utf8').includes(FILE_URL)) {
                found.push(path.relative(dir, fullPath).replaceAll('\\', '/'))
            }
        }
    };

    walk(dir);

    return found.sort()
}

if (isEntryModule(import.meta.url)) {
    const dir = path.resolve(process.argv[2] || 'dist/production');

    if (!fs.existsSync(dir)) {
        console.error(`check-dist-paths: ${dir} does not exist, so there is no build to check.`);
        process.exit(1)
    }

    const found = findFileUrls(dir);

    if (found.length) {
        console.error(`check-dist-paths: ${found.length} build file(s) carry a file:/// URL, the build machine's path:`);
        found.forEach(file => console.error(`  ${file}`));
        process.exit(1)
    }

    console.log(`check-dist-paths: OK, no file:/// URL in ${path.relative(process.cwd(), dir) || dir}.`)
}
