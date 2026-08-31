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
 * The output tree this build writes, relative to the workspace root.
 *
 * Exported rather than duplicated in the build script because it is now a *boundary*: a declared
 * source root is only safe if it cannot address this tree, and that check has to compare against the
 * same string the caller writes into.
 *
 * @type {String}
 */
export const esmOutputRoot = 'dist/esm';

/**
 * The engine's own package path inside a consuming workspace.
 *
 * Every specifier that still names it after the rewrite addresses a SECOND engine module graph, which
 * is why it is a failure independent of whether the file it names exists.
 *
 * @type {String}
 */
export const enginePackagePath = 'node_modules/neo.mjs';

/**
 * Matches a static import, a dynamic import, or a re-export whose specifier mentions `node_modules`.
 *
 * A module-scope constant, compiled once. It was a factory, justified on the `g` flag carrying
 * `lastIndex` between callers — which is a real hazard and **does not reach either consumer here**:
 * `String.replace` and `String.matchAll` both leave `lastIndex` at 0 (`matchAll` iterates a clone).
 * Measured both ways before this was changed. A function around a literal is not a defence; it is
 * this cache discarded once per call, on a path that runs over every emitted module in the tree.
 *
 * **The invariant that keeps it safe, stated because it is now shared:** no consumer may leave
 * `lastIndex` dirty. `.exec()` or `.test()` against this constant would do exactly that, and the
 * next `matchAll` would silently start mid-string. Neither is used; a future one must reset it.
 *
 * Module-private for the same reason — an exported factory hands a fresh object to every caller and
 * so hides that invariant instead of stating it. Nothing outside this file consumed either pattern.
 *
 * The quote class is `["'`]` and the single quote is the point. It was `["`]` — double quote or
 * backtick only — while the engine's house style, and every generated workspace's, is the single
 * quote. So the rewrite added by #6752 never fired on the code it was written for, and Terser
 * normalized the untouched specifiers to double quotes afterwards, which made the output *look*
 * like the rewrite had run.
 *
 * `export ... from` is matched for the same reason the quote class is wide: a re-export is a request
 * the browser makes, so a rewrite that skips it emits a specifier addressing the workspace's engine
 * from inside `dist/esm`. It used to be skipped, and the emitted path happened to resolve, so nothing
 * failed — it simply booted two disjoint engine graphs.
 *
 * @type {RegExp}
 */
const IMPORT_SPECIFIER_REGEX =
    /((?:import|export)(?:\s*(?:[\w*{}\n\r\t, ]+from\s*)?|\s*\(\s*)?)(["'`])((?:(?!\2).)*node_modules(?:(?!\2).)*)\2/g;

/**
 * Matches any relative import specifier, whatever the quote style.
 *
 * Module-scope constant, same reasoning and same `lastIndex` invariant as the pattern above.
 *
 * Deliberately separate from the rewrite pattern: this one runs over *emitted* code, which Terser has
 * already normalized, so it cannot assume the source's quoting.
 *
 * @type {RegExp}
 */
const RELATIVE_SPECIFIER_REGEX =
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
    return content.replace(IMPORT_SPECIFIER_REGEX, (match, prefix, quote, specifier) => {
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
 * A declared root is not just an input path. The caller resolves it twice — once against the
 * workspace to read from, once against `dist/esm` to write to — so the manifest field is an OUTPUT
 * authority, and validating its type without validating its containment turns a convenience into an
 * overwrite primitive. See {@link unsafeSourceRootReason}.
 *
 * @param {Object}  options
 * @param {Boolean} options.insideNeo
 * @param {Object}  options.packageJson the consuming workspace's manifest
 * @returns {String[]}
 * @throws {Error} on a malformed or unsafe declaration; never on a default
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

    const safe = declared.map(entry => {
        const
            root   = normalizeSourceRoot(entry),
            reason = unsafeSourceRootReason(root);

        if (reason) {
            throw new Error(`package.json "neo.esmSourceRoots" entry ${JSON.stringify(entry)} ${reason}`)
        }

        return root
    });

    return [...new Set([...defaults, ...safe])]
}

/**
 * The workspace-relative form of a declared source root: POSIX separators, no `./` prefix, no
 * duplicate or trailing slashes.
 *
 * Normalizing before validating is the point — `.\\..//outside/` and `../outside` are the same
 * request, and a check that only recognised one of them would be a check the other walks past.
 *
 * @param {String} root
 * @returns {String}
 */
export const normalizeSourceRoot = root =>
    root.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '').replace(/\/$/, '');

/**
 * Why a normalized source root may not be built, or `null` when it is safe.
 *
 * The caller derives the output directory from the declared string, so an unconstrained entry does
 * not merely read the wrong tree — it writes one. Two shapes are decisive:
 *
 * - an absolute root makes input and output the SAME external directory, because `path.resolve`
 *   discards every earlier segment once it meets one: the build then minifies a foreign tree in
 *   place, which is data loss, not a bad build;
 * - a traversing root escapes `dist/esm` on the output side, so `../../outside` emits into the
 *   workspace beside the output tree rather than inside it.
 *
 * The absolute forms are matched textually rather than through `path.isAbsolute`, because a Windows
 * manifest is a perfectly ordinary thing to read on a POSIX CI box and the platform of the *checker*
 * must not decide whether the declaration is safe.
 *
 * Overlap with `dist/esm` is rejected in both directions: a root beneath the output tree feeds the
 * build its own output, and a root above it (`.`, `dist`) does the same one level up.
 *
 * @param {String} root a value already through {@link normalizeSourceRoot}
 * @returns {String|null} the reason, phrased to complete `entry "x" …`
 */
export function unsafeSourceRootReason(root) {
    if (root.startsWith('/')) {
        return 'must be workspace-relative; an absolute root makes the build read and write the same external directory'
    }

    if (/^[a-z]:/i.test(root)) {
        return 'must be workspace-relative; a drive-qualified root is absolute on Windows'
    }

    const segments = root.split('/').filter(segment => segment && segment !== '.');

    if (segments.includes('..')) {
        return 'must not traverse upwards; the output path is derived from it and would escape dist/esm'
    }

    const outputSegments = esmOutputRoot.split('/');

    if (segments.every((segment, index) => segment === outputSegments[index]) ||
        outputSegments.every((segment, index) => segment === segments[index])) {
        return `must not overlap "${esmOutputRoot}"; the build would read its own output tree`
    }

    return null
}

/**
 * Every relative specifier imported by a piece of emitted code.
 *
 * @param {String} code
 * @returns {String[]}
 */
export function relativeSpecifiers(code) {
    return [...code.matchAll(RELATIVE_SPECIFIER_REGEX)].map(match => match[2])
}

/**
 * Reports every emitted import that cannot boot: one naming a file that is not there, and one naming
 * the wrong engine.
 *
 * This is the guard the build never had. Both shipped defect classes end the same way — a specifier
 * pointing at a file that is not in the output tree — and both were invisible because a copy-and-
 * minify build has no resolver to complain: an unrewritten `node_modules` path lands inside
 * `dist/esm` at a path that was never populated, and an uncopied source root leaves a sibling import
 * dangling. Containment in the output tree is NOT the property that separates those, because the
 * rewrite deliberately points third-party packages back out at `../../node_modules/`. Existence is.
 *
 * Existence alone, however, is only sufficient for a package the output does not own. The engine the
 * output DOES own is copied to `dist/esm/src`, so an emitted specifier that still names
 * `node_modules/neo.mjs` addresses the workspace's own source engine — a second, disjoint module
 * graph with its own class registry and its own singletons. It resolves, it exists, and the app that
 * loads it fails at runtime in a way no path check would ever have reported. Identity, not
 * existence, is the property there, so that shape fails whether or not the target is on disk.
 *
 * @param {Object[]} modules `{outputPath, specifiers}` records, as emitted
 * @param {Function} exists  predicate over an absolute path, injected so specs need no fixture tree
 * @param {Function} resolve `(from, specifier) => absolutePath`
 * @returns {Object[]} `{outputPath, specifier, resolved, reason}`; reason is `missing` or `engine-identity`
 */
export function findUnresolvableImports(modules, exists, resolve) {
    const failures = [];

    modules.forEach(({outputPath, specifiers}) => {
        specifiers.forEach(specifier => {
            const
                resolved = resolve(outputPath, specifier),
                reason   = addressesSourceEngine(resolved) || addressesSourceEngine(specifier)
                    ? 'engine-identity'
                    : exists(resolved) ? null : 'missing';

            if (reason) {
                failures.push({outputPath, specifier, resolved, reason})
            }
        })
    });

    return failures
}

/**
 * True for a path that traverses the workspace's own engine package.
 *
 * Checked on whole segments: a directory named `node_modules/neo.mjs-examples` is somebody else's
 * package and must not be caught by a substring match.
 *
 * @param {String} candidate
 * @returns {Boolean}
 */
export function addressesSourceEngine(candidate) {
    const normalized = candidate.replace(/\\/g, '/');

    return normalized.includes(`/${enginePackagePath}/`) || normalized.startsWith(`${enginePackagePath}/`)
}
