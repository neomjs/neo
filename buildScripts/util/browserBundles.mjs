/**
 * @module buildScripts/util/browserBundles
 * @summary The vendored browser bundles the engine builds into `dist/` and ships.
 *
 * ## Why this is a constant and not a list at each site
 *
 * Adding `mermaid` had to touch five places: the producer spawn in `build/all.mjs`, the copy loop in
 * `build/esmodules.mjs`, a `REQUIRED_ENTRIES` row in `util/check-package-contents.mjs`, a
 * `!/dist/<name>.mjs` negation in `.npmignore`, and three separate lists inside
 * `unit/buildScripts/buildDependencyResolution.spec.mjs` — a symlinked-package list, a
 * copied-producer list, and the loop that runs them. Two were updated and three were missed, and
 * the one that failed loudly did so only because a spec happened to enumerate the set.
 *
 * That is the shape a shared constant exists for: the next bundle joins here, and every consumer
 * that can import JavaScript follows without being found first.
 *
 * `.npmignore` cannot import this, so it stays the one copy — which is why
 * `unit/buildScripts/checkPackageContents.spec.mjs` asserts a negation exists per name rather than
 * trusting that whoever adds a bundle remembers the file. `.npmignore` is the sole gate on package
 * contents, and a bundle that stops shipping is discovered by a consumer, at the point of use.
 * @type {String[]}
 */
export const BROWSER_BUNDLES = ['marked', 'mermaid', 'parse5'];
