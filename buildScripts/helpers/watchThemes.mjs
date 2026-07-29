import autoprefixer    from 'autoprefixer';
import chalk           from 'chalk';
import fs              from 'fs-extra';
import path            from 'node:path';
import {pathToFileURL} from 'node:url';
import postcss         from 'postcss';
import {
    DEVELOPMENT_THEME_BUILD_COMMAND,
    inspectDevelopmentThemeAssets
} from '../util/developmentThemeAssets.mjs';

const REPO_ROOT = process.cwd();
let sassModulePromise;

/**
 * @summary Loads Dart Sass once. Successful watcher startup preloads this cached promise so the
 * first content edit retains the existing single-file latency profile.
 * @returns {Promise<Object>}
 */
function loadSass() {
    return sassModulePromise ??= import('sass')
}

/**
 * @summary Returns the framework and workspace SCSS roots in override order. Framework checkouts
 * have one root; app workspaces layer their own sources over the installed Neo package.
 * @param {String} repoRoot Repository root.
 * @returns {String[]}
 */
function getThemeSourceRoots(repoRoot) {
    const
        packageJson = fs.readJsonSync(path.join(repoRoot, 'package.json')),
        neoRoot     = packageJson.name.includes('neo.mjs')
            ? repoRoot
            : path.join(repoRoot, 'node_modules/neo.mjs'),
        roots       = neoRoot === repoRoot ? [repoRoot] : [neoRoot, repoRoot];

    roots.forEach(root => {
        const scssRoot = path.join(root, 'resources/scss');

        if (!fs.existsSync(scssRoot)) {
            throw new Error(`[watch-themes] missing SCSS source root: ${scssRoot}`)
        }
    });

    return roots
}

/**
 * @summary Builds the exact effective SCSS entry census for development output. Later workspace
 * roots replace framework entries with the same output path, matching the full theme builder.
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Array<{className: String, filename: String, outputPath: String, root: String,
 *                   sourcePath: String}>}
 */
export function getThemeSourceCensus({repoRoot = REPO_ROOT} = {}) {
    const entries = new Map();

    function visit(dir, root, relativePath='') {
        fs.readdirSync(dir, {withFileTypes: true})
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(entry => {
                if (entry.isSymbolicLink()) return;

                const
                    sourcePath = path.join(dir, entry.name),
                    relative   = path.join(relativePath, entry.name);

                if (entry.isDirectory()) {
                    visit(sourcePath, root, relative);
                    return
                }

                if (!entry.name.endsWith('.scss') || entry.name.startsWith('_')) return;

                const
                    filename   = path.join(root, relative),
                    outputPath = path.join(
                        repoRoot,
                        'dist/development/css',
                        filename.replace(/\.scss$/, '.css')
                    ),
                    classPath      = relative
                        .replace(/\.scss$/, '')
                        .split(path.sep)
                        .join('.'),
                    className      = classPath.startsWith('apps.') ? classPath : `Neo.${classPath}`;

                entries.set(outputPath, {
                    className,
                    filename,
                    outputPath,
                    root,
                    sourcePath
                })
            })
    }

    getThemeSourceRoots(repoRoot).forEach(sourceRoot => {
        const scssRoot = path.join(sourceRoot, 'resources/scss');

        fs.readdirSync(scssRoot, {withFileTypes: true})
            .filter(entry => (
                entry.isDirectory() &&
                !entry.isSymbolicLink() &&
                (entry.name === 'src' || entry.name.includes('theme'))
            ))
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(entry => visit(path.join(scssRoot, entry.name), entry.name))
    });

    return [...entries.values()].sort((a, b) => a.outputPath.localeCompare(b.outputPath))
}

/**
 * @summary Adds one effective SCSS entry to the nested class-to-theme map used by worker.App.
 * @param {Object} themeMap Mutable theme map.
 * @param {Object} entry Effective SCSS census entry.
 * @returns {void}
 */
function addToThemeMap(themeMap, entry) {
    const
        classPath = entry.className.split('.'),
        leafName  = classPath.pop(),
        namespace = classPath.reduce((scope, segment) => scope[segment] ??= {}, themeMap),
        targets   = namespace[leafName] ??= [];

    if (!targets.includes(entry.root)) targets.push(entry.root)
}

/**
 * @summary Creates the exact nested class-to-theme map for an effective SCSS source census.
 * @param {Array} census Effective source census.
 * @returns {Object}
 */
function createDevelopmentThemeMap(census) {
    const themeMap = {};

    census.forEach(entry => addToThemeMap(themeMap, entry));

    return themeMap
}

/**
 * @summary Returns whether a generated theme map reaches one effective source-census entry.
 * @param {Object} themeMap Parsed theme map.
 * @param {Object} entry Effective source-census entry.
 * @returns {Boolean}
 */
function themeMapHasEntry(themeMap, entry) {
    const leaf = entry.className.split('.').reduce(
        (scope, segment) => scope && typeof scope === 'object' ? scope[segment] : undefined,
        themeMap
    );

    return Array.isArray(leaf) && leaf.includes(entry.root)
}

/**
 * @summary Replaces both development theme-map copies from the effective SCSS source census.
 * Retired source paths therefore disappear instead of surviving as additive ghost entries.
 * @param {Object} [options]
 * @param {Array} [options.census] Effective source census.
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Object} The generated theme map.
 */
export function regenerateDevelopmentThemeMap({
    census,
    repoRoot = REPO_ROOT
} = {}) {
    const themeMap = createDevelopmentThemeMap(census ?? getThemeSourceCensus({repoRoot}));

    const serialized = JSON.stringify(themeMap);

    for (const target of [
        path.join(repoRoot, 'resources/theme-map.json'),
        path.join(repoRoot, 'dist/development/resources/theme-map.json')
    ]) {
        fs.mkdirpSync(path.dirname(target));
        fs.writeFileSync(target, serialized)
    }

    return themeMap
}

/**
 * @summary Finds the newest partial timestamp per build root and across shared SCSS roots. Partial
 * edits force these same output boundaries in the live watcher.
 * @param {String} repoRoot Repository root.
 * @returns {{byRoot: Map<String, Number>, shared: Number}}
 */
function getPartialFreshnessBoundaries(repoRoot) {
    const byRoot = new Map();
    let   shared = 0;

    function visit(dir, root) {
        fs.readdirSync(dir, {withFileTypes: true}).forEach(entry => {
            if (entry.isSymbolicLink()) return;

            const target = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                visit(target, root)
            } else if (entry.name.startsWith('_') && entry.name.endsWith('.scss')) {
                const mtime = fs.statSync(target).mtimeMs;

                if (root === 'src' || root.includes('theme')) {
                    byRoot.set(root, Math.max(byRoot.get(root) ?? 0, mtime))
                } else {
                    shared = Math.max(shared, mtime)
                }
            }
        })
    }

    getThemeSourceRoots(repoRoot).forEach(sourceRoot => {
        const scssRoot = path.join(sourceRoot, 'resources/scss');

        fs.readdirSync(scssRoot, {withFileTypes: true})
            .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
            .forEach(entry => visit(path.join(scssRoot, entry.name), entry.name))
    });

    return {byRoot, shared}
}

/**
 * @summary Inspects the watcher's precise startup contract. Entry outputs compare against their
 * own source plus owning/shared partial boundaries, so a prior valid one-file rebuild does not
 * falsely stale every unrelated output. Both map copies must reach every effective census entry.
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root.
 * @returns {{census: Array, invalidMap: String|null, mapMissing: String[], missing: String[],
 *            ready: Boolean, stale: String[], symlinked: String[]}}
 */
export function inspectThemeWatcherAssets({repoRoot = REPO_ROOT} = {}) {
    const
        census            = getThemeSourceCensus({repoRoot}),
        boundaries        = getPartialFreshnessBoundaries(repoRoot),
        conservativeState = inspectDevelopmentThemeAssets({repoRoot}),
        mapMissing        = [],
        missing           = [],
        stale             = [];

    let invalidMap = null;

    census.forEach(entry => {
        try {
            const
                outputStat   = fs.statSync(entry.outputPath),
                sourceMtime  = fs.statSync(entry.sourcePath).mtimeMs,
                partialMtime = Math.max(
                    boundaries.shared,
                    boundaries.byRoot.get(entry.root) ?? 0
                );

            if (!outputStat.isFile()) {
                missing.push(path.relative(repoRoot, entry.outputPath))
            } else if (outputStat.mtimeMs < Math.max(sourceMtime, partialMtime)) {
                stale.push(path.relative(repoRoot, entry.outputPath))
            }
        } catch {
            missing.push(path.relative(repoRoot, entry.outputPath))
        }
    });

    for (const mapPath of [
        path.join(repoRoot, 'resources/theme-map.json'),
        path.join(repoRoot, 'dist/development/resources/theme-map.json')
    ]) {
        let themeMap;

        try {
            themeMap = fs.readJsonSync(mapPath)
        } catch (error) {
            if (error.code === 'ENOENT') {
                missing.push(path.relative(repoRoot, mapPath))
            } else {
                invalidMap = `${path.relative(repoRoot, mapPath)}: ${error.message}`
            }
            continue
        }

        census.forEach(entry => {
            if (!themeMapHasEntry(themeMap, entry)) {
                mapMissing.push(
                    `${path.relative(repoRoot, mapPath)}: ${entry.className} (${entry.root})`
                )
            }
        })
    }

    const symlinked = conservativeState.symlinked ?? [];

    return {
        census,
        invalidMap,
        mapMissing: [...new Set(mapMissing)].sort(),
        missing   : [...new Set(missing)].sort(),
        ready     : (
            census.length > 0 &&
            !invalidMap &&
            mapMissing.length === 0 &&
            missing.length === 0 &&
            stale.length === 0 &&
            symlinked.length === 0
        ),
        stale     : [...new Set(stale)].sort(),
        symlinked
    }
}

/**
 * @summary Removes development CSS and source maps with no corresponding effective SCSS entry.
 * Symbolic-link directories are never traversed.
 * @param {Object} [options]
 * @param {Array} [options.census] Effective source census.
 * @param {String} [options.repoRoot] Repository root.
 * @returns {String[]} Removed repo-relative artifact paths.
 */
export function pruneDevelopmentThemeArtifacts({
    census,
    repoRoot = REPO_ROOT
} = {}) {
    const
        cssRoot  = path.join(repoRoot, 'dist/development/css'),
        expected = new Set(
            (census ?? getThemeSourceCensus({repoRoot})).map(entry => path.resolve(entry.outputPath))
        ),
        removed  = [];

    function visit(dir) {
        if (!fs.existsSync(dir)) return;

        fs.readdirSync(dir, {withFileTypes: true}).forEach(entry => {
            const target = path.join(dir, entry.name);

            if (entry.isSymbolicLink()) return;

            if (entry.isDirectory()) {
                visit(target);

                if (fs.readdirSync(target).length === 0) fs.removeSync(target);
                return
            }

            if (!entry.name.endsWith('.css') && !entry.name.endsWith('.css.map')) return;

            const cssTarget = entry.name.endsWith('.css.map') ? target.slice(0, -4) : target;

            if (!expected.has(path.resolve(cssTarget))) {
                fs.removeSync(target);
                removed.push(path.relative(repoRoot, target))
            }
        })
    }

    visit(cssRoot);

    return removed.sort()
}

/**
 * @summary Compiles one effective SCSS entry to its development CSS and source-map targets.
 * @param {Object} entry Effective SCSS census entry.
 * @param {Object} [options]
 * @param {Object} [options.logger] Console-compatible logger.
 * @returns {Promise<String>} Absolute CSS output path.
 */
async function buildEntry(entry, {logger = console} = {}) {
    const startTime = Date.now();

    try {
        const
            {compile}  = await loadSass(),
            sassResult = compile(entry.sourcePath, {
                outFile                : entry.outputPath,
                sourceMap              : true,
                sourceMapIncludeSources: true
            }),
            postcssResult = await postcss([autoprefixer]).process(sassResult.css, {
                from: entry.sourcePath,
                to  : entry.outputPath,
                map : {
                    inline: false,
                    prev  : sassResult.sourceMap && JSON.stringify(sassResult.sourceMap)
                }
            });

        fs.mkdirpSync(path.dirname(entry.outputPath));
        fs.writeFileSync(entry.outputPath, postcssResult.css);

        if (postcssResult.map) {
            const sourceMap = JSON.parse(postcssResult.map.toString());

            // Sass can emit the same source as an absolute and a relative URL. Runtime debugging
            // only needs the portable relative entries.
            sourceMap.sources = sourceMap.sources.filter(source => source.startsWith('../'));
            fs.writeFileSync(entry.outputPath + '.map', JSON.stringify(sourceMap))
        }

        const processTime = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.log('Updated file:', chalk.blue(`${processTime}s`), entry.outputPath);

        return entry.outputPath
    } catch (error) {
        const message = `[watch-themes] SCSS build failed for ${entry.filename}: ${error.message}`;

        (logger.error ?? logger.log).call(logger, message);
        throw new Error(message, {cause: error})
    }
}

/**
 * @summary Compiles one non-partial workspace SCSS file through the low-latency watcher path.
 * @param {String} filename Path relative to `resources/scss`.
 * @param {Object} [options]
 * @param {Object} [options.logger] Console-compatible logger.
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Promise<String>} Absolute CSS output path.
 */
export function buildFile(filename, {
    logger   = console,
    repoRoot = REPO_ROOT
} = {}) {
    const
        scssRoot   = path.resolve(repoRoot, 'resources/scss'),
        normalized = path.normalize(String(filename)),
        sourcePath = path.resolve(scssRoot, normalized);

    if (
        path.isAbsolute(normalized) ||
        sourcePath !== scssRoot && !sourcePath.startsWith(scssRoot + path.sep)
    ) {
        throw new Error(`[watch-themes] rejected SCSS path outside resources/scss: ${filename}`)
    }

    if (path.basename(normalized).startsWith('_')) {
        throw new Error(`[watch-themes] partials require an owning-root rebuild: ${filename}`)
    }

    return buildEntry({
        className : '',
        filename  : normalized,
        outputPath: path.join(
            repoRoot,
            'dist/development/css',
            normalized.replace(/\.scss$/, '.css')
        ),
        root      : normalized.split(path.sep)[0],
        sourcePath
    }, {logger})
}

/**
 * @summary Reconciles development CSS and the generated theme map against one immutable source
 * census. Structural events build missing/stale entries, delete ghosts, and replace the map.
 * Partial events can force their owning root (or every root for shared mixins).
 * @param {Object} [options]
 * @param {Function} [options.build] Injectable effective-entry compiler.
 * @param {String[]} [options.forceFiles] Repo-SCSS-relative entries to rebuild.
 * @param {String[]} [options.forceRoots] Top-level SCSS roots to rebuild; `*` means every root.
 * @param {Object} [options.logger] Console-compatible logger.
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Promise<{built: String[], removed: String[], themeMap: Object}>}
 */
export async function reconcileThemeStructure({
    build      = buildEntry,
    forceFiles = [],
    forceRoots = [],
    logger     = console,
    repoRoot   = REPO_ROOT
} = {}) {
    const
        census      = getThemeSourceCensus({repoRoot}),
        forcedFiles = new Set(forceFiles.map(file => path.normalize(file))),
        forcedRoots = new Set(forceRoots),
        built       = [];

    for (const entry of census) {
        let outputStat;

        try {
            outputStat = fs.lstatSync(entry.outputPath)
        } catch {}

        const shouldBuild = (
            forcedRoots.has('*') ||
            forcedRoots.has(entry.root) ||
            forcedFiles.has(entry.filename) ||
            !outputStat ||
            outputStat.isSymbolicLink() ||
            outputStat.mtimeMs < fs.statSync(entry.sourcePath).mtimeMs
        );

        if (shouldBuild) {
            if (outputStat?.isSymbolicLink()) fs.removeSync(entry.outputPath);

            await build(entry, {logger});
            built.push(entry.filename)
        }
    }

    return {
        built,
        removed : pruneDevelopmentThemeArtifacts({census, repoRoot}),
        themeMap: regenerateDevelopmentThemeMap({census, repoRoot})
    }
}

/**
 * @summary Handles one fs.watch event. Ordinary entry-file changes stay on the one-file path;
 * structural and partial events use the wider source-census reconciliation.
 * @param {String} eventType fs.watch event type.
 * @param {String|Buffer} filename Path relative to `resources/scss`.
 * @param {Object} [options]
 * @param {Function} [options.build] Injectable one-file compiler.
 * @param {Object} [options.logger] Console-compatible logger.
 * @param {Function} [options.reconcile] Injectable structural reconciler.
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Promise<Object>} Event outcome.
 */
export async function handleThemeWatchEvent(eventType, filename, {
    build     = buildFile,
    logger    = console,
    reconcile = reconcileThemeStructure,
    repoRoot  = REPO_ROOT
} = {}) {
    if (!filename) return {action: 'ignored', reason: 'missing-filename'};

    const normalized = path.normalize(String(filename));

    if (!normalized.endsWith('.scss')) return {action: 'ignored', reason: 'not-scss'};

    const
        sourcePath = path.join(repoRoot, 'resources/scss', normalized),
        exists     = fs.existsSync(sourcePath),
        isPartial  = path.basename(normalized).startsWith('_');

    if (eventType === 'change' && exists && !isPartial) {
        await build(normalized, {logger, repoRoot});
        return {action: 'built', built: [normalized], removed: []}
    }

    if (eventType !== 'rename' && eventType !== 'change') {
        return {action: 'ignored', reason: 'unsupported-event'}
    }

    const
        root       = normalized.split(path.sep)[0],
        forceFiles = exists && !isPartial ? [normalized] : [],
        forceRoots = isPartial ? [root === 'src' || root.includes('theme') ? root : '*'] : [];

    try {
        const result = await reconcile({forceFiles, forceRoots, logger, repoRoot});
        const action = isPartial ? 'rebuilt-root' : exists ? 'built' : 'removed';

        logger.log(
            `[watch-themes] ${eventType} ${normalized}: ${action}; ` +
            `${result.built.length} built, ${result.removed.length} removed, theme-map regenerated`
        );

        return {action, ...result}
    } catch (error) {
        throw new Error(
            `[watch-themes] ${eventType} reconcile failed for ${normalized}: ${error.message}`,
            {cause: error}
        )
    }
}

/**
 * @summary Creates a serialized fs.watch listener so lifecycle bursts cannot race map writes or
 * artifact deletion. A failed event is logged while the queue remains usable for later changes.
 * @param {Object} [options] Forwarded event-handler options.
 * @returns {Function}
 */
export function createThemeWatchListener(options={}) {
    const logger = options.logger ?? console;
    let   queue  = Promise.resolve();

    return (eventType, filename) => {
        queue = queue
            .then(() => handleThemeWatchEvent(eventType, filename, options))
            .catch(error => (logger.error ?? logger.log).call(logger, error.message));

        return queue
    }
}

/**
 * @summary Refuses to watch before a complete initial development theme build has established the
 * output tree and generated map.
 * @param {Object} [options]
 * @param {Function} [options.inspect] Injectable readiness inspector.
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Object} Ready inspection state.
 */
export function assertThemeWatcherReady({
    inspect  = inspectThemeWatcherAssets,
    repoRoot = REPO_ROOT
} = {}) {
    const state = inspect({repoRoot});

    if (state.ready) return state;

    const details = [
        state.invalidMap && `invalid map: ${state.invalidMap}`,
        state.mapMissing?.length > 0 && `map missing entries: ${state.mapMissing.join(', ')}`,
        state.missing?.length > 0    && `missing: ${state.missing.join(', ')}`,
        state.stale?.length > 0      && `stale: ${state.stale.join(', ')}`,
        state.symlinked?.length > 0  && `symlinked: ${state.symlinked.join(', ')}`
    ].filter(Boolean).join('; ');

    throw new Error(
        `[watch-themes] development theme assets are not ready${details ? ` (${details})` : ''}.\n` +
        `Recovery: ${DEVELOPMENT_THEME_BUILD_COMMAND}`
    )
}

/**
 * @summary Verifies initial build state, reconciles any retired structural artifacts, then starts
 * the recursive SCSS watcher.
 * @param {Object} [options]
 * @param {Function} [options.inspect] Injectable readiness inspector.
 * @param {Function} [options.loadCompiler] Injectable compiler preload.
 * @param {Object} [options.logger] Console-compatible logger.
 * @param {Function} [options.reconcile] Injectable structural reconciler.
 * @param {String} [options.repoRoot] Repository root.
 * @param {Function} [options.watch] Injectable fs.watch seam.
 * @returns {Promise<fs.FSWatcher>}
 */
export async function startThemeWatcher({
    inspect      = inspectThemeWatcherAssets,
    loadCompiler = loadSass,
    logger       = console,
    reconcile    = reconcileThemeStructure,
    repoRoot     = REPO_ROOT,
    watch        = fs.watch
} = {}) {
    assertThemeWatcherReady({inspect, repoRoot});
    await reconcile({logger, repoRoot});
    await loadCompiler();

    const scssRoot = path.join(repoRoot, 'resources/scss');

    logger.log(`[watch-themes] watching ${scssRoot}`);

    return watch(
        scssRoot,
        {recursive: true},
        createThemeWatchListener({logger, reconcile, repoRoot})
    )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    startThemeWatcher().catch(error => {
        console.error(error.message);
        process.exitCode = 1
    })
}
