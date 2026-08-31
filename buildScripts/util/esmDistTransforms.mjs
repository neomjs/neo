/**
 * The pure transforms behind `buildScripts/build/esmodules.mjs`.
 *
 * They live here rather than inside the build script because that script executes its work at module
 * scope: importing it *runs a build*. A transform that cannot be imported cannot be pinned by a spec,
 * and every defect this module exists to fix was a silent one that only a spec would have caught.
 *
 * `dist/development` and `dist/production` are webpack bundles, so webpack resolves imports wherever
 * they point and these assumptions never had to hold. `dist/esm` is a copy-and-minify transform with
 * no resolver, so each assumption below is load-bearing.
 *
 * @see https://github.com/neomjs/neo/issues/17921
 * @see https://github.com/neomjs/neo/issues/6752 introduced the workspace import rewrite
 */

/**
 * Matches a static or dynamic import specifier that mentions `node_modules`.
 *
 * Returned as a factory, not a shared constant: the pattern carries the `g` flag, so a single shared
 * instance would carry `lastIndex` between unrelated callers and skip matches non-deterministically.
 *
 * The quote class is `["'`]` and the single quote is the point. It was `["`]` — double quote or
 * backtick only — while the engine's house style, and every generated workspace's, is the single
 * quote. So the rewrite added by #6752 never fired on the code it was written for, and Terser
 * normalized the untouched specifiers to double quotes afterwards, which made the output *look*
 * like the rewrite had run.
 *
 * @returns {RegExp}
 */
export const createImportSpecifierRegex = () =>
    /(import(?:\s*(?:[\w*{}\n\r\t, ]+from\s*)?|\s*\(\s*)?)(["'`])((?:(?!\2).)*node_modules(?:(?!\2).)*)\2/g;

/**
 * Matches any relative import specifier, whatever the quote style.
 *
 * Deliberately separate from the rewrite pattern: this one runs over *emitted* code, which Terser has
 * already normalized, so it cannot assume the source's quoting.
 *
 * @returns {RegExp}
 */
export const createRelativeSpecifierRegex = () =>
    /(?:import|export)(?:\s*(?:[\w*{}\n\r\t, ]+from\s*)?|\s*\(\s*)(["'`])(\.{1,2}\/(?:(?!\1).)*)\1/g;

/**
 * Rewrites `node_modules`-bearing specifiers for the flattened `dist/esm` layout.
 *
 * The engine is copied from `node_modules/neo.mjs/src` to `dist/esm/src`, which preserves the
 * relative depth — so dropping the `node_modules/neo.mjs/` segment is the whole rewrite. Any other
 * package keeps its `node_modules` path but sits two levels further away, hence the `../../`.
 *
 * @param {String} content
 * @returns {String}
 */
export function rewriteImportPaths(content) {
    return content.replace(createImportSpecifierRegex(), (match, prefix, quote, specifier) => {
        const rewritten = specifier.includes('/node_modules/neo.mjs/')
            ? specifier.replace('/node_modules/neo.mjs/', '/')
            : '../../' + specifier;

        return prefix + quote + rewritten + quote
    })
}

/**
 * True for a base path that already addresses a fixed location: an absolute mount (`/mount/`), a
 * protocol-relative host (`//cdn/`), or a fully-qualified URL.
 *
 * @param {String} basePath
 * @returns {Boolean}
 */
export const isFixedBasePath = basePath =>
    typeof basePath === 'string' && (basePath.startsWith('/') || /^[a-z][a-z\d+\-.]*:\/\//i.test(basePath));

/**
 * Applies the `dist/esm` overrides to a parsed `neo-config.json`.
 *
 * `basePath` gains `../../` because the config moves two directories deeper in the output tree, and
 * the value is *position-relative* arithmetic — it compensates for where the config now sits. A fixed
 * base path is not position-relative and has nothing to compensate for, so prefixing it produced
 * `../..//mount/`, which no environment can resolve. It passes through untouched.
 *
 * `workerBasePath` composes from the ORIGINAL `basePath` rather than the prefixed one, and that
 * asymmetry is intentional and pre-existing — the worker path is resolved from a different origin.
 * Preserved exactly.
 *
 * @param {Object} config parsed neo-config.json; mutated in place, matching the caller's contract
 * @param {Object}  options
 * @param {Boolean} options.insideNeo
 * @returns {Object} the same object
 */
export function rewriteNeoConfig(config, {insideNeo}) {
    const {basePath} = config;

    Object.assign(config, {
        basePath      : isFixedBasePath(basePath) ? basePath : '../../' + basePath,
        environment   : 'dist/esm',
        mainPath      : './Main.mjs',
        workerBasePath: basePath + 'src/worker/'
    });

    if (!insideNeo) {
        config.appPath = config.appPath.substring(6)
    }

    return config
}

/**
 * The directory trees copied into `dist/esm`.
 *
 * The list used to be a hardcoded four entries, so a workspace keeping shared view code in any other
 * root-level tree — a component library beside `apps/` — produced a `dist/esm` whose app files import
 * siblings that were never copied. Nothing warned; the app worker simply died fetching a module.
 *
 * Extra roots are declared in the workspace's own `package.json`, not passed as a CLI flag, because
 * `buildScripts/build/all.mjs` spawns this build with no argv — a flag would be unreachable through
 * the primary entry point and only work when the script was invoked directly.
 *
 * Declared roots are additive and de-duplicated; the defaults cannot be dropped.
 *
 * @param {Object}  options
 * @param {Boolean} options.insideNeo
 * @param {Object}  options.packageJson the consuming workspace's manifest
 * @returns {String[]}
 */
export function resolveSourceRoots({insideNeo, packageJson}) {
    const
        defaults = insideNeo
            ? ['apps', 'docs', 'examples', 'src']
            : ['apps', 'docs', 'node_modules/neo.mjs/src', 'src'],
        declared = packageJson?.neo?.esmSourceRoots;

    if (!declared) {
        return defaults
    }

    if (!Array.isArray(declared) || declared.some(entry => typeof entry !== 'string' || !entry)) {
        throw new Error('package.json "neo.esmSourceRoots" must be an array of non-empty strings')
    }

    return [...new Set([...defaults, ...declared])]
}

/**
 * Every relative specifier imported by a piece of emitted code.
 *
 * @param {String} code
 * @returns {String[]}
 */
export function relativeSpecifiers(code) {
    return [...code.matchAll(createRelativeSpecifierRegex())].map(match => match[2])
}

/**
 * Reports every emitted module whose relative imports do not resolve to a file that was emitted.
 *
 * This is the guard the build never had. Both shipped defect classes end the same way — a specifier
 * pointing at a file that is not in the output tree — and both were invisible because a copy-and-
 * minify build has no resolver to complain: an unrewritten `node_modules` path lands inside
 * `dist/esm` at a path that was never populated, and an uncopied source root leaves a sibling import
 * dangling. Containment in the output tree is therefore NOT the property to check; existence is.
 *
 * @param {Object[]} modules `{outputPath, specifiers}` records, as emitted
 * @param {Function} exists  predicate over an absolute path, injected so specs need no fixture tree
 * @param {Function} resolve `(from, specifier) => absolutePath`
 * @returns {Object[]} `{outputPath, specifier, resolved}` for each unresolvable import
 */
export function findUnresolvableImports(modules, exists, resolve) {
    const failures = [];

    modules.forEach(({outputPath, specifiers}) => {
        specifiers.forEach(specifier => {
            const resolved = resolve(outputPath, specifier);

            if (!exists(resolved)) {
                failures.push({outputPath, specifier, resolved})
            }
        })
    });

    return failures
}
