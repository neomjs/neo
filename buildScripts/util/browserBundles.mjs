/**
 * @module buildScripts/util/browserBundles
 * @summary Browser dependencies generated into `dist/` by the Engine's build scripts.
 *
 * Build, ESM-copy and dependency-resolution checks share this producer list. Generated output
 * belongs to a build or consuming workspace; the npm package excludes the entire `dist/` tree.
 * @type {String[]}
 */
export const BROWSER_BUNDLES = ['marked', 'mermaid', 'parse5'];

/**
 * @summary Browser artifacts addressed from the page's workspace rather than the Engine package.
 * @type {String[]}
 */
export const WORKSPACE_BROWSER_BUNDLE_FILES = ['dist/highlight/highlight.custom.js', 'dist/highlight/highlight.custom.min.js'];

/**
 * @summary Runtime-addressed files emitted by a consumer build.
 * Computed URLs also load the highlight variants and Monaco's workers, stylesheet and font; a
 * successful webpack compile alone cannot prove these files exist at their runtime roots.
 * HighlightJS belongs to the workspace; the other files belong to the installed Engine.
 * @type {String[]}
 */
export const BROWSER_BUNDLE_FILES = [
    ...BROWSER_BUNDLES.map(name => `dist/${name}.mjs`),
    ...WORKSPACE_BROWSER_BUNDLE_FILES,
    ...['codicon.ttf', 'css.worker.mjs', 'editor.css', 'editor.mjs', 'editor.worker.mjs',
        'html.worker.mjs', 'json.worker.mjs', 'ts.worker.mjs'].map(name => `dist/monaco/${name}`)
];
