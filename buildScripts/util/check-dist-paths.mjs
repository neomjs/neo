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
 *
 * Links are followed, because the production resource copy keeps a linked folder a link, and its files are
 * served like any other. A folder already walked under its real path is not walked again, which bounds link
 * cycles. A link that cannot be followed throws: what the scan cannot read, it cannot pass.
 * @param {String} dir The build folder to scan.
 * @returns {String[]} Paths relative to `dir`, sorted.
 * @throws {Error} When a link under `dir` cannot be followed.
 */
export function findFileUrls(dir) {
    const
        found   = [],
        visited = new Set();

    const walk = current => {
        const real = fs.realpathSync(current);

        if (visited.has(real)) {
            return
        }

        visited.add(real);

        for (const name of fs.readdirSync(current)) {
            const fullPath = path.join(current, name);

            let stat;

            try {
                stat = fs.statSync(fullPath)
            } catch {
                throw new Error(`check-dist-paths: ${path.relative(dir, fullPath)} is a link that cannot be followed, so it cannot be checked.`)
            }

            if (stat.isDirectory()) {
                walk(fullPath)
            } else if (EXTENSIONS.has(path.extname(name)) && fs.readFileSync(fullPath, 'utf8').includes(FILE_URL)) {
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

    let found;

    try {
        found = findFileUrls(dir)
    } catch (error) {
        console.error(error.message);
        process.exit(1)
    }

    if (found.length) {
        console.error(`check-dist-paths: ${found.length} build file(s) carry a file:/// URL, the build machine's path:`);
        found.forEach(file => console.error(`  ${file}`));
        process.exit(1)
    }

    console.log(`check-dist-paths: OK, no file:/// URL in ${path.relative(process.cwd(), dir) || dir}.`)
}
