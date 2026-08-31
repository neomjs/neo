import esbuild         from 'esbuild';
import path            from 'path';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const require = createRequire(import.meta.url);

/**
 * @summary The parse5 entry point, resolved by module resolution rather than a cwd-relative path.
 *
 * `build/all.mjs` spawns this script with the **consumer's** cwd, so a literal
 * `node_modules/parse5/dist/index.js` was read from wherever the build happened to start. When a
 * consumer installs the engine as a dependency npm hoists parse5 to the consumer root, and the
 * failure surfaces as an esbuild "entry point not found" that names a path but not the reason.
 * Resolving from this module's own URL walks the real resolution chain, so it lands on the same file
 * whether parse5 sits beside the engine or hoisted above it.
 *
 * **The bare specifier is deliberate and is the only form that works.** parse5 declares an `exports`
 * map that does not expose `./dist/index.js`, so the subpath that mirrors the old literal —
 * `require.resolve('parse5/dist/index.js')` — throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. The bare
 * specifier resolves to that exact file through the package's own `exports`, so this is a pure
 * resolution change with an identical target. Anyone "correcting" it back toward the visible path
 * gets a red that reads like a missing file.
 * @type {String}
 */
const parse5EntryPoint = require.resolve('parse5');

const build = async () => {
    try {
        await esbuild.build({
            entryPoints: [parse5EntryPoint],
            bundle     : true,
            minify     : true,
            format     : 'esm',
            outfile    : path.join(__dirname, '../../dist/parse5.mjs'),
            banner     : {
                js: '/* eslint-disable */'
            }
        });
        console.log('Successfully bundled and minified parse5 to dist/parse5.mjs');
    } catch (error) {
        console.error('Error bundling parse5:', error);
        process.exit(1);
    }
};

build();
