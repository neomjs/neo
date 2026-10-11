import esbuild         from 'esbuild';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const outfile    = path.join(__dirname, '../../dist/mermaid.mjs');

/**
 * The identifier every UMD wrapper inside mermaid's dependency graph is rewritten to.
 *
 * Not a string replacement over the output — esbuild substitutes the identifier while it walks the
 * module graph, so a wrapper in a dependency nobody enumerated is covered by construction. The
 * banner then supplies a value that satisfies every guard form observed in that graph and throws in
 * none of them:
 *
 *   `typeof define == "function"`  → `"object" == "function"`  → false
 *   `typeof define && define.amd`  → `"object" && false`       → false
 *   `(typeof define)[0] == "f"`    → `"o" == "f"`              → false
 *
 * An object rather than `undefined` on purpose: `typeof undefined` is the truthy string
 * `"undefined"`, so the second form above would go on to read `.amd` off `undefined` and throw.
 * @type {String}
 */
const AMD_SHIM = '__neoMermaidNoAmd';

/**
 * @summary Bundles mermaid so its UMD wrappers cannot register into another AMD loader.
 *
 * @description
 * Mermaid's published chunks carry vendored UMD wrappers — `fastdom` among them — which branch on
 * `typeof define` and hand any global AMD loader an ANONYMOUS factory. The loader refuses that with
 * `Can only have one anonymous define call per script file`, the library never finishes loading, and
 * every diagram on the page fails. Monaco's AMD distribution put such a loader on every portal
 * route; a consumer's page can carry its own.
 *
 * Checking `define.amd` does not save those wrappers: a loader's `define` HAS `.amd`, so the guarded
 * majority take the AMD branch exactly like the unguarded pair does.
 *
 * Bundling from the package entry rather than copying `dist/` is what makes this durable. esbuild
 * resolves the real graph, so the substitution reaches wrappers in dependencies that no scan of
 * today's chunk filenames would have listed.
 *
 * The addon loads one browser ESM bundle. A consumer installs the Engine's build dependencies
 * and runs `bundle-browser-deps` to generate it alongside parse5 and marked in the installed Engine.
 * Generated `dist/` output is excluded from npm. {@link Neo.main.addon.Mermaid} sets
 * `useLazyLoading: true`, so the browser fetches the bundle only when a page contains a diagram.
 *
 * Consumed by {@link Neo.main.addon.Mermaid}. Same shape as `buildScripts/build/parse5.mjs`:
 * bundle an installed package into `dist/` and let the addon import the artifact, which also makes
 * the library reachable in a deployed build where `node_modules` is absent.
 * @returns {Promise<void>}
 */
const build = async () => {
    try {
        const result = await esbuild.build({
            banner     : {js: `const ${AMD_SHIM}={amd:false};`},
            bundle     : true,
            define     : {define: AMD_SHIM},
            entryPoints: ['mermaid'],
            format     : 'esm',
            metafile   : true,
            minify     : true,
            outfile
        });

        // The guard, and it runs on the ARTIFACT rather than on the intent. A future mermaid version
        // can introduce a wrapper shape the substitution misses, and the failure mode is silent:
        // diagrams keep working on every page without an AMD loader, so the tier stays green and only
        // a page that carries one breaks. Refusing the build is the only place that is cheap to see.
        const emitted = fs.readFileSync(outfile, 'utf8'),
              hits    = emitted.match(/\btypeof define\b|[^\w.]define\s*\(/g) || [];

        if (hits.length > 0) {
            throw new Error(
                `mermaid bundle still carries ${hits.length} UMD registration(s). The esbuild ` +
                '`define` substitution did not reach them — inspect the wrapper shape before ' +
                'shipping, or a page carrying an AMD loader will fail to render every diagram.'
            )
        }

        console.log(`Successfully bundled mermaid to dist/mermaid.mjs (${(emitted.length / 1048576).toFixed(2)} MB, 0 UMD registrations)`)
    } catch (error) {
        console.error('Error bundling mermaid:', error.message);
        process.exit(1)
    }
};

build();
