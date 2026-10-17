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
 * @summary Runtime-addressed files a dependency build must emit beneath the installed Engine root.
 * Computed URLs also load the highlight variants and Monaco's workers, stylesheet and font; a
 * successful webpack compile alone cannot prove these files exist.
 * @type {String[]}
 */
export const BROWSER_BUNDLE_FILES = [
    ...BROWSER_BUNDLES.map(name => `dist/${name}.mjs`),
    ...['highlight.custom.js', 'highlight.custom.min.js'].map(name => `dist/highlight/${name}`),
    ...['codicon.ttf', 'css.worker.mjs', 'editor.css', 'editor.mjs', 'editor.worker.mjs',
        'html.worker.mjs', 'json.worker.mjs', 'ts.worker.mjs'].map(name => `dist/monaco/${name}`)
];
