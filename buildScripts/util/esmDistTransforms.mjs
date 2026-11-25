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

import * as acorn from 'acorn';
import path       from 'node:path';
import {parse}    from 'parse5';

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
 * @summary The single emitted destination for an admitted logical source file or directory.
 * @param {String} sourcePath
 * @param {Object} options
 * @param {String} options.workspaceRoot
 * @param {String} options.engineRoot
 * @returns {String}
 */
export function esmDestination(sourcePath, {workspaceRoot, engineRoot}) {
    const within = (root, file) => file === root || file.startsWith(root + path.sep),
          root   = within(engineRoot, sourcePath) ? engineRoot : workspaceRoot;
    if (!within(workspaceRoot, sourcePath)) throw new Error(`ESM source is outside the workspace: ${sourcePath}`);
    return path.join(workspaceRoot, esmOutputRoot, path.relative(root, sourcePath))
}

/**
 * The AST node types whose `source` may name a module.
 *
 * `ExportNamedDeclaration` is included but only counts when it actually has a `source` — a plain
 * `export {x}` re-exports nothing and its `source` is null.
 *
 * For the three static forms the grammar guarantees that `source` is a string literal.
 * `ImportExpression` is the exception, and the reason {@link staticSpecifier} exists: its `source` is
 * an ARBITRARY expression, so `import(base + name)` is a node of this type that names no module at
 * all. Membership here means "may carry a specifier", never "does".
 *
 * @type {Set<String>}
 */
const SPECIFIER_NODE_TYPES = new Set([
    'ExportAllDeclaration', 'ExportNamedDeclaration', 'ImportDeclaration', 'ImportExpression'
]);

/**
 * @summary Rebases admitted workspace, package, Main-addon and Canvas-module modules through one emitted file plan.
 * @description Planned static edges use their shared emitted destinations, including helpers reached by both
 * App components and Main addons. The computed package contexts of Main and of the Canvas worker resolve under the
 * emitted tree's `node_modules`, where their declared roots are emitted. Unadmitted dependencies retain the
 * established host fallback; this transform does not discover dynamic imports.
 * @param {String} content Source module text.
 * @param {Object} options
 * @param {String} options.sourcePath Source filename in the consuming workspace.
 * @param {String} options.outputPath Emitted filename.
 * @param {String} options.workspaceRoot Consuming workspace.
 * @param {String} options.engineRoot Installed or in-repository Engine root.
 * @param {Object[]} options.packageRoots Declared roots from `mainAddonPackageRoots` and `canvasModulePackageRoots`.
 * @param {Map<String, Object>} [options.files] The build plan, keyed by logical source filename.
 * @returns {String}
 */
export function rewriteEsmImports(content, {sourcePath, outputPath, workspaceRoot, engineRoot, packageRoots, files}) {
    const within          = (root, file) => file === root || file.startsWith(root + path.sep),
          installedEngine = engineRoot !== workspaceRoot,
          isMain          = sourcePath === path.join(engineRoot, 'src/Main.mjs'),
          isCanvas        = sourcePath === path.join(engineRoot, 'src/worker/Canvas.mjs'),
          isAddon         = packageRoots.some(entry => within(entry.sourceRoot, sourcePath)),
          isPackage       = files?.has(sourcePath) && within(path.join(workspaceRoot, 'node_modules'), sourcePath) &&
              (!installedEngine || !within(engineRoot, sourcePath)),
          outputRoot = path.join(workspaceRoot, esmOutputRoot),
          edits      = [];
    visitImportSources(content, source => {
        const entry = staticSpecifier(source, content);
        if (!entry) return;
        const quasi  = entry.computed ? source.quasis[0] : null,
              prefix = quasi ? quasi.value.cooked : entry.specifier;
        const relative = prefix.startsWith('./') || prefix.startsWith('../');
        if (!relative && (isMain || isAddon || isPackage || !prefix.includes('node_modules'))) return;

        let target;
        const resolved = path.resolve(path.dirname(sourcePath), prefix),
              mapped   = relative && !entry.computed && files?.get(resolved)?.outputPath;
        if (mapped) {
            target = mapped
        } else if (entry.computed && (isMain && ['../../', '../node_modules/'].includes(prefix) ||
            isCanvas && prefix === '../../../')) {
            target = path.join(outputRoot, 'node_modules')
        } else if (isAddon || isPackage) {
            const owner        = packageRoots.find(root => within(root.sourceRoot, resolved)),
                  engineTarget = within(engineRoot, resolved) &&
                      (installedEngine || !within(path.join(workspaceRoot, 'node_modules'), resolved));
            target = engineTarget || owner ? esmDestination(resolved, {workspaceRoot, engineRoot}) : resolved
        } else if (prefix.includes('node_modules')) {
            const rewritten = prefix.includes('/node_modules/neo.mjs/')
                ? prefix.replace('/node_modules/neo.mjs/', '/') : '../../' + prefix;
            target = path.resolve(path.dirname(outputPath), rewritten)
        } else {
            return
        }

        let replacement = path.relative(path.dirname(outputPath), target).split(path.sep).join('/');
        if (!replacement.startsWith('.')) replacement = './' + replacement;
        if (prefix.endsWith('/') && !replacement.endsWith('/')) replacement += '/';
        edits.push(quasi ? {
            start: quasi.start, end: quasi.end,
            text : JSON.stringify(replacement).slice(1, -1).replaceAll('`', '\\`').replaceAll('${', '\\${')
        } : {start: source.start, end: source.end, text: JSON.stringify(replacement)})
    });

    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        content = content.slice(0, edit.start) + edit.text + content.slice(edit.end)
    }
    return content
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
 * @param {String} [options.appSubPath] App directory relative to dist/esm; defaults to the emitted appPath's directory.
 * @returns {Object} the same object
 */
export function rewriteNeoConfig(config, {insideNeo, appSubPath}) {
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

    if (config.routerMode === 'pathname') {
        rewritePathnameConfig(config, `${esmOutputRoot}/${appSubPath ?? path.posix.dirname(config.appPath)}`)
    }
    return config
}

/**
 * @summary Anchors a pathname app at its emitted directory, shared by ESM and webpack builds.
 * Hash configurations retain their existing properties unchanged.
 * @param {Object} config Mutated in place.
 * @param {String} outputDirectory Workspace-relative output directory.
 * @returns {Object}
 */
export function rewritePathnameConfig(config, outputDirectory) {
    if (config.routerMode === 'pathname') config.routerBasePath = '/' + outputDirectory.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    return config
}

/**
 * @summary Synchronizes the emitted HTML's base with its pathname mount using parsed source locations.
 * Only the real head/base is edited; comments, script strings and unrelated formatting stay intact.
 * Hash pages pass through byte-for-byte. No server-side HTML rewrite is needed.
 * @param {String} html
 * @param {Object} config
 * @param {String} outputDirectory Workspace-relative output directory.
 * @returns {String}
 */
export function rewritePathnameHtml(html, config, outputDirectory) {
    if (config.routerMode !== 'pathname') return html;
    const document  = parse(html, {sourceCodeLocationInfo: true}),
          root      = document.childNodes.find(node => node.tagName === 'html'),
          head      = root.childNodes.find(node => node.tagName === 'head'),
          base      = head.childNodes.find(node => node.tagName === 'base'),
          href      = '/' + outputDirectory.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '') + '/',
          attribute = `href="${href.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`;
    let start, end, replacement;
    if (base) {
        const location = base.sourceCodeLocation;
        if (location.attrs?.href) {
            ({startOffset: start, endOffset: end} = location.attrs.href);
            replacement = attribute
        } else {
            start = end = location.startTag.endOffset - (html[location.startTag.endOffset - 2] === '/' ? 2 : 1);
            replacement = ' ' + attribute
        }
    } else {
        start = end = head.sourceCodeLocation?.startTag.endOffset ?? root.sourceCodeLocation?.startTag?.endOffset ??
            document.childNodes.find(node => node.nodeName === '#documentType')?.sourceCodeLocation?.endOffset ?? 0;
        replacement = `<base ${attribute}>`
    }
    return html.slice(0, start) + replacement + html.slice(end)
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
 * The module specifier an AST source node statically names, or `null` when it names none.
 *
 * The three properties this preserves are the three ways that reading the raw source text instead
 * gets it wrong — a parser recovers node kind and cooked value, and slicing delimiters off the text
 * throws both away again:
 *
 * - **a source node is not always a string.** `import('../' + name + '/x.mjs')` is a
 *   `BinaryExpression`, and removing its first and last character yields `../' + name + '/x.mjs`,
 *   which the guard would report as a file that is not there. Nothing about that import is
 *   statically knowable, so `null` is the honest answer and the guard says nothing about it.
 * - **a quoted string containing `${…}` is a literal, not a template.** `import('../data/${x}.mjs')`
 *   requests a file spelled exactly that way; classifying it as computed checks only that
 *   `../data/` exists and lets a genuinely absent file through.
 * - **a literal's escapes resolve.** `import('./foo.mjs')` requests `./foo.mjs` — which is what
 *   `value` holds, and what the raw text does not.
 *
 * A template literal is rebuilt from its COOKED quasis with each interpolation reinserted as the
 * source wrote it, so the static text is what the runtime concatenates while the report still prints
 * something a developer recognizes. One with no interpolation is a literal path that happens to be
 * written in backticks: it names a single file and is checked as one.
 *
 * @param {Object} source a {@link SPECIFIER_NODE_TYPES} node's `source`
 * @param {String} code   the module text it was parsed from
 * @returns {Object|null} `{specifier, computed}`, or `null` when nothing is statically knowable
 */
export function staticSpecifier(source, code) {
    if (source.type === 'Literal') {
        // `import(0)` parses; a non-string literal names no module.
        return typeof source.value === 'string' ? {specifier: source.value, computed: false} : null
    }

    if (source.type === 'TemplateLiteral') {
        const specifier = source.quasis.map((quasi, index) => {
            const expression = source.expressions[index];

            // `cooked` is null only for an invalid escape, which is legal exclusively in a TAGGED
            // template and so cannot occur here; `raw` keeps this total regardless.
            return (quasi.value.cooked ?? quasi.value.raw) +
                (expression ? '${' + code.slice(expression.start, expression.end) + '}' : '')
        }).join('');

        return {specifier, computed: source.expressions.length > 0}
    }

    return null
}

/**
 * Every relative specifier imported by a piece of emitted code.
 *
 * Read from the module's AST rather than matched out of its text, because a regex over minified code
 * cannot tell an import from a string that contains one — and this engine ships several. The portal's
 * home page renders `"import Viewport from '../../apps/colors/view/Viewport.mjs';"` as sample code, the
 * Toast example renders a `node_modules/neo.mjs` specifier the same way, and a text match reported all
 * of them as broken imports on a full build. They are strings; only a parser knows that.
 *
 * `acorn` is already this build's parser — `astTemplateProcessor` runs every emitted module through it
 * — so this reads the grammar the transform already depends on rather than adding a second opinion
 * about what the code says.
 *
 * What each entry carries is decided by the node's TYPE, never by re-reading its text: using a parser
 * only helps if the semantics it recovered survive extraction. See {@link staticSpecifier}.
 *
 * @param {String} code
 * @returns {Object[]} `{specifier, computed}` records, in source order
 */
export function relativeSpecifiers(code) {
    const specifiers = [];
    visitImportSources(code, source => {
        const entry = staticSpecifier(source, code);
        if (entry && (entry.specifier.startsWith('./') || entry.specifier.startsWith('../'))) specifiers.push(entry)
    });
    return specifiers
}

/**
 * @summary Returns static import/re-export edges without admitting runtime dynamic import expressions.
 * @param {String} code
 * @returns {String[]}
 */
export function staticModuleSpecifiers(code) {
    const specifiers = [];
    visitImportSources(code, (source, kind) => {
        if (kind !== 'ImportExpression') specifiers.push(source.value)
    });
    return specifiers
}

/**
 * @summary Returns non-computed runtime dynamic import specifiers without widening static discovery.
 * @param {String} code
 * @returns {String[]}
 */
export function literalDynamicSpecifiers(code) {
    const specifiers = [];
    visitImportSources(code, (source, kind) => {
        if (kind !== 'ImportExpression') return;
        const entry = staticSpecifier(source, code);
        if (entry && !entry.computed) specifiers.push(entry.specifier)
    });
    return specifiers
}

/** @summary Visits actual import/re-export source nodes, excluding source-like prose strings. @param {String} code @param {Function} visitor */
function visitImportSources(code, visitor) {
    const visit = node => {
            if (!node || typeof node !== 'object') {
                return
            }

            if (Array.isArray(node)) {
                node.forEach(visit);
                return
            }

            if (SPECIFIER_NODE_TYPES.has(node.type) && node.source) {
                visitor(node.source, node.type)
            }

            // A dynamic import can sit anywhere, so every child is visited rather than only the
            // program body. `parent` is skipped because acorn does not set it and a future walker
            // that does would loop.
            Object.keys(node).forEach(key => key !== 'parent' && visit(node[key]))
        };

    visit(acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module'}));
}

/**
 * The directory a computed specifier reads from, or `null` when the specifier is a literal path.
 *
 * The engine loads its parser, normalizer, connection, task, canvas and Main-addon families through
 * a template literal — `../data/parser/${name}.mjs`. In source those calls carry webpack magic
 * comments between the parenthesis and the template literal, so {@link relativeSpecifiers} never
 * reaches them; but Terser strips comments, and the EMITTED module this guard inspects is
 * post-Terser. What it hands back is literal text still carrying the interpolation, which no
 * filesystem can hold.
 *
 * Exempting that text is the obvious move and it throws away real signal. A computed specifier still
 * makes one static claim: everything before the first interpolation is a path, and the directory it
 * ends in must be in the output tree. `../data/parser/${name}.mjs` asserts `dist/esm/src/data/parser/`
 * exists — and an uncopied source root, the very defect this guard was built for, is visible exactly
 * there. So the prefix is checked and the interpolation is not guessed at.
 *
 * A specifier interpolated from its first segment — `../../${path}/task.mjs` — yields a prefix of
 * `../../`, which trivially exists. That is the honest answer: nothing about it is statically
 * knowable, so the guard says nothing about it.
 *
 * Whether a specifier IS computed is not this function's call and must not be read from its return
 * value: a quoted `'../data/${x}.mjs'` is a literal filename that contains those two characters.
 * {@link staticSpecifier} decides it from the AST node type, and {@link findUnresolvableImports}
 * carries that flag; this only answers *where* an already-computed one reads from.
 *
 * @param {String} specifier a specifier {@link staticSpecifier} flagged `computed`
 * @returns {String|null} the prefix through its last `/`, or `null` when it holds no interpolation
 */
export function computedSpecifierRoot(specifier) {
    const interpolation = specifier.indexOf('${');

    // `relativeSpecifiers` keeps only specifiers opening `./` or `../`, so a separator always
    // precedes the interpolation and the slice is never the whole specifier.
    return interpolation === -1 ? null : specifier.slice(0, specifier.lastIndexOf('/', interpolation) + 1)
}

/**
 * Reports every emitted import that cannot boot: one naming a file that is not there, one whose
 * computed family reads from a directory that is not there, and one naming the wrong engine.
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
 * The third reason exists so the report can say the right sentence. "This import does not resolve"
 * is wrong about a computed specifier — the import is fine and the directory its family reads from
 * is gone — and a developer told the wrong thing goes looking in the wrong place. All three exit 1;
 * the separation is what the reader is told, never whether the build refuses.
 *
 * @param {Object[]} modules `{outputPath, specifiers}` records whose `specifiers` are
 *                           {@link relativeSpecifiers} entries — `{specifier, computed}`, not strings
 * @param {Function} exists  predicate over an absolute path, injected so specs need no fixture tree
 * @param {Function} resolve `(from, specifier) => absolutePath`
 * @param {String}   root    the build root. Identity is judged on each resolved path below it, since an engine
 *                           built inside a consumer's `node_modules/neo.mjs` carries that segment in its root
 * @returns {Object[]} `{outputPath, specifier, resolved, reason}`; reason is `missing`, `computed-root`
 *                    or `engine-identity`
 */
export function findUnresolvableImports(modules, exists, resolve, root) {
    const failures = [];

    modules.forEach(({outputPath, specifiers}) => {
        specifiers.forEach(({specifier, computed}) => {
            const
                // Read from the flag the parser set, never re-derived from the text: a literal
                // filename may contain `${…}` and is still one file.
                computedRoot = computed ? computedSpecifierRoot(specifier) : null,
                // A computed specifier names no file, so what gets resolved is the directory its
                // family reads from. A literal one resolves as itself, exactly as before.
                resolved     = resolve(outputPath, computedRoot ?? specifier);

            let reason = null;

            // Identity is checked first and on the specifier as written, so a computed family
            // reaching `node_modules/neo.mjs` is still the two-graph defect rather than a missing
            // directory. Truncating to the prefix must not launder that.
            if (addressesSourceEngine(path.relative(root, resolved)) || addressesSourceEngine(specifier)) {
                reason = 'engine-identity'
            } else if (!exists(resolved)) {
                reason = computed ? 'computed-root' : 'missing'
            }

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
