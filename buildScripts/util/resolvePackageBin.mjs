import fs   from 'fs';
import path from 'path';

/**
 * @module buildScripts/util/resolvePackageBin
 * @summary Locates a dependency's executable entry script through module resolution.
 *
 * The build programs spawn third-party executables, and they used to name them by **filesystem
 * path** — `./node_modules/.bin/webpack`, read from `process.cwd()`. That holds only for a checkout
 * whose `node_modules` sits exactly one level below where the build was started. `build/all.mjs`
 * spawns those programs with the **consumer's** cwd, and npm hoists, so for anyone installing the
 * engine as a dependency the literal points at nothing. The failure is a bare ENOENT that names a
 * path but not the cause, which is why the class was diagnosed one site at a time.
 *
 * Two properties make this replacement hoist-proof:
 *
 * 1. **Resolution runs from the caller's module URL**, not from cwd, so it walks the real resolution
 *    chain and finds the package whether it sits beside the engine or hoisted above it.
 * 2. **The target is the package's declared JS entry, not its `.bin` shim.** The result is launched
 *    with `node`, the dispatch `build/all.mjs` already uses everywhere. That removes the shim
 *    question outright: on Windows a `.bin` entry is a `.cmd` script rather than an executable
 *    image, the constraint `buildScripts/build/highlightJs.mjs` documents at length.
 *
 * The `bin` declaration is **read, not assumed** — a release that moves its entry point resolves
 * through its own manifest instead of breaking a hardcode. That discipline is borrowed from
 * `resolveHuskyBin` in `buildScripts/util/prepare.mjs`, which reaches the same conclusion by joining
 * paths under a known root; this module differs only in using module resolution, because its callers
 * cannot assume a root.
 */

/**
 * @summary Absolute path to a package's executable entry script, resolved via its own manifest.
 *
 * `resolve` is injected rather than closed over so callers pass a `createRequire(import.meta.url)`
 * resolver bound to **their** module — resolution must start at the consumer, not here. It is also
 * the seam that makes hoisted and nested layouts assertable without installing either.
 * @param {String} packageName Bare package name, e.g. `'webpack'`.
 * @param {Function} resolve Resolver, typically `createRequire(import.meta.url).resolve`.
 * @param {Object} [options]
 * @param {String} [options.binName=packageName] Key to select when `bin` is a map of several.
 * @returns {String} Absolute path to the entry script.
 * @throws {Error} When the manifest declares no usable `bin` entry.
 */
export function resolvePackageBin(packageName, resolve, {binName=packageName}={}) {
    const manifestPath = resolve(`${packageName}/package.json`),
          {bin}        = JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
          entry        = typeof bin === 'string' ? bin : bin?.[binName] ?? Object.values(bin ?? {})[0];

    if (typeof entry !== 'string' || entry.length === 0) {
        throw new Error(`resolvePackageBin: '${packageName}' declares no bin entry in '${manifestPath}'`)
    }

    return path.join(path.dirname(manifestPath), entry)
}
