import esbuild         from 'esbuild';
import fs              from 'node:fs';
import {fileURLToPath} from 'node:url';

const output = new URL('../../dist/monaco/', import.meta.url);

/**
 * The bundles this build emits, keyed by output name and resolved through monaco-editor's own `exports`
 * map. The worker names are the ones {@link Neo.main.addon.MonacoEditor#getWorkerUrl} hands to Monaco.
 * @type {Object<String, String>}
 */
const entryPoints = Object.fromEntries(Object.entries({
    editor         : 'editor/editor.main.js',
    'css.worker'   : 'language/css/css.worker.js',
    'editor.worker': 'editor/editor.worker.js',
    'html.worker'  : 'language/html/html.worker.js',
    'json.worker'  : 'language/json/json.worker.js',
    'ts.worker'    : 'language/typescript/ts.worker.js'
}).map(([name, module]) => [name, fileURLToPath(import.meta.resolve(`monaco-editor/${module}`))]));

/**
 * The version DOMPurify's factory assigns to itself, `DOMPurify.version = '…'` followed by
 * `DOMPurify.removed = []`, in plain or minified code. Code rather than the license banner, which a
 * minified build can drop.
 * @type {RegExp}
 */
const SANITIZER_VERSION = /\.version\s*=\s*["'](\d+\.\d+\.\d+)["']\s*[,;]\s*[\w$]+\.removed\s*=\s*\[\]/g;

/**
 * Monaco's `vs/base/browser/domSanitize.js` imports the DOMPurify copy Monaco vendors. Resolving that
 * one specifier as a bare `dompurify` import from the same directory hands the sanitizer the package
 * npm installed for monaco-editor: the one `package-lock.json` records and Dependabot audits.
 * @type {esbuild.Plugin}
 */
const npmSanitizer = {
    name: 'npm-dompurify',
    setup(build) {
        build.onResolve({filter: /^\.\/dompurify\/dompurify\.js$/}, ({resolveDir}) =>
            build.resolve('dompurify', {kind: 'import-statement', resolveDir}))
    }
};

/**
 * @summary Compiles Monaco's published ESM sources into `dist/monaco/`, with the sanitizer npm resolves.
 *
 * @description
 * Both of Monaco's distributions embed DOMPurify at build time. No dependency override reaches that
 * copy, so the browser kept executing a sanitizer below the patched releases whatever the lockfile
 * said. Compiling the ESM sources with this one substituted import makes the executed sanitizer and
 * the audited dependency the same package.
 *
 * The shape follows Monaco's own esbuild smoke build: an editor entry whose stylesheet and codicon
 * font esbuild emits beside it, plus one bundle per language worker. The build refuses to emit when
 * the vendored module is still in the graph, or when the editor carries anything but one DOMPurify.
 *
 * Consumed by {@link Neo.main.addon.MonacoEditor}, and shipped for the reason the other `dist/`
 * bundles are: monaco-editor and esbuild are devDependencies, so a consumer cannot build it.
 * @returns {Promise<void>}
 */
const build = async () => {
    try {
        fs.rmSync(output, {force: true, recursive: true});

        const result = await esbuild.build({
            assetNames  : '[name]',
            bundle      : true,
            entryPoints,
            format      : 'esm',
            loader      : {'.ttf': 'file'},
            metafile    : true,
            minify      : true,
            outdir      : fileURLToPath(output),
            outExtension: {'.js': '.mjs'},
            plugins     : [npmSanitizer]
        });

        const outputs    = Object.values(result.metafile.outputs),
              vendored   = Object.keys(result.metafile.inputs).some(input => input.endsWith('/dompurify/dompurify.js')),
              sanitizers = [...new Set([...fs.readFileSync(new URL('editor.mjs', output), 'utf8').matchAll(SANITIZER_VERSION)].map(([, version]) => version))];

        if (vendored || sanitizers.length !== 1) {
            throw new Error(`the editor must carry exactly one DOMPurify, the one npm resolved: found ${JSON.stringify(sanitizers)}, vendored module ${vendored ? 'still bundled' : 'absent'}`)
        }

        console.log(`Successfully bundled Monaco to dist/monaco (${outputs.length} files, ${(outputs.reduce((sum, file) => sum + file.bytes, 0) / 1048576).toFixed(2)} MB, DOMPurify ${sanitizers[0]})`)
    } catch (error) {
        console.error('Error bundling Monaco:', error.message);
        process.exit(1)
    }
};

build();
