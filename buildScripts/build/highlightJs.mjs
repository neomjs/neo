import esbuild         from 'esbuild';
import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import {Command}       from 'commander';
import isEntryModule   from '../util/isEntryModule.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Runtime URLs are workspace-relative, including when this script comes from an installed Engine.
const outputDir     = path.resolve('dist/highlight');
const outputFile    = path.join(outputDir, 'highlight.custom.js');
const minOutputFile = path.join(outputDir, 'highlight.custom.min.js');

const program = new Command();

/**
 * The languages the bundle registers. `ruby` keeps the set upstream's build produced: that build pulled it in
 * for `yaml`, so code-fenced guides have highlighted it ever since.
 * @type {String[]}
 */
export const LANGUAGES = ['bash', 'css', 'javascript', 'json', 'markdown', 'plaintext', 'ruby', 'scss', 'xml', 'yaml'];

/**
 * @summary Bundles the installed highlight.js core with {@link LANGUAGES} registered, as an ES module whose
 * default export is `hljs`: `highlight.custom.js` and its minified twin `highlight.custom.min.js`.
 *
 * Like the other browser bundles (`parse5.mjs`, `marked.mjs`), it reads the lockfile-pinned package, so the build
 * needs no network, no git and no second install. The entry resolves from this file's folder upwards, which
 * reaches a workspace's own `node_modules` when the script runs from an installed Engine.
 * @param {String} targetDir Folder that receives both files.
 * @returns {Promise<void>}
 */
export async function buildBundle(targetDir) {
    const stdin = {
        contents: [
            "import hljs from 'highlight.js/lib/core';",
            ...LANGUAGES.map((name, i) => `import language${i} from 'highlight.js/lib/languages/${name}';`),
            ...LANGUAGES.map((name, i) => `hljs.registerLanguage('${name}', language${i});`),
            'export default hljs;'
        ].join('\n'),
        resolveDir: __dirname,
        sourcefile: 'highlight.custom.entry.js'
    };

    await Promise.all([
        esbuild.build({stdin, bundle: true, format: 'esm', outfile: path.join(targetDir, 'highlight.custom.js')}),
        esbuild.build({stdin, bundle: true, format: 'esm', minify: true, outfile: path.join(targetDir, 'highlight.custom.min.js')})
    ])
}

async function main() {
    program
        .option('-f, --force', 'Force regeneration of the highlight.js bundle')
        .parse(process.argv);

    const options = program.opts();

    if (!options.force) {
        try {
            await fs.access(outputFile);
            await fs.access(minOutputFile);
            console.log('highlight.js bundle already exists. Skipping build. Use -f to force regeneration.');
            return;
        } catch (e) {
            // Files don't exist, proceed with build
        }
    }

    console.log('Building custom highlight.js bundle...');

    try {
        await buildBundle(outputDir);

        console.log(`Custom highlight.js bundle created at: ${outputFile}`);
        console.log(`Minified highlight.js bundle created at: ${minOutputFile}`);
    } catch (error) {
        // The exit code is what `build-all` and `bundle-browser-deps` gate on.
        console.error(`Error building highlight.js bundle: ${error}`);
        process.exit(1)
    }
}

// Run only when executed directly: the spec imports this module to build into a temporary folder.
if (isEntryModule(import.meta.url)) {
    main()
}
