/**
 * @module buildScripts/util/browserBundles
 * @summary Browser dependencies generated into `dist/` by the Engine's build scripts.
 *
 * Build, ESM-copy and dependency-resolution checks share this producer list. Generated output
 * belongs to a build or consuming workspace; the npm package excludes the entire `dist/` tree.
 * @type {String[]}
 */
export const BROWSER_BUNDLES = ['marked', 'mermaid', 'parse5'];
