import autoprefixer    from 'autoprefixer';
import chalk           from 'chalk';
import fs              from 'fs-extra';
import path            from 'node:path';
import postcss         from 'postcss';
import isEntryModule   from '../util/isEntryModule.mjs';
import {
    collectThemeClassMap,
    isCssTargetFolder
}                      from '../util/themeCss.mjs';
import {themeCssRoots} from '../util/themeCssRoots.mjs';
import {
    DEVELOPMENT_THEME_BUILD_COMMAND,
    inspectDevelopmentThemeAssets
} from '../util/developmentThemeAssets.mjs';

const REPO_ROOT = process.cwd();

/**
 * CLI usage text scoping `watch-themes` to supervised interactive shells or explicit daemons.
 * @type {String}
 */
export const WATCH_THEMES_HELP = [
    'Usage: npm run watch-themes [-- --help]',
    '',
    'Starts a persistent foreground CSS watcher for supervised interactive development shells',
    '(or explicit background daemon supervision). It never exits on its own.',
    `For unattended one-shot theme builds in CI or coding-agent tasks, run: ${DEVELOPMENT_THEME_BUILD_COMMAND}`
].join('\n');

/**
 * @summary Returns the theme source roots the full theme builder reads, in override order
 * ({@link themeCssRoots}), and refuses to start without one of them. Like the builder, it takes a
 * package name containing `neo.mjs` for the Engine checkout.
 * @param {String} repoRoot Repository root.
 * @returns {String[]} Absolute directories.
 */
function getThemeSourceRoots(repoRoot) {
    const roots = themeCssRoots(repoRoot, {insideNeo: fs.readJsonSync(path.join(repoRoot, 'package.json')).name.includes('neo.mjs')});

    roots.forEach(root => {
        if (!fs.existsSync(root)) {
            throw new Error(`[watch-themes] missing theme source root: ${root}`)
        }
    });

    return roots
}

/**
 * @summary Builds the exact effective source census for development output. A later root (a declared
 * package over the Engine, the workspace over both) replaces an earlier entry with the same output
 * path, matching the full theme builder.
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

                if (!entry.name.endsWith('.css')) return;

                const
                    filename   = path.join(root, relative),
                    outputPath = path.join(repoRoot, 'dist/development/css', filename),
                    classPath  = relative
                        .replace(/\.css$/, '')
                        .split(path.sep)
                        .join('.'),
                    className  = classPath.startsWith('apps.') ? classPath : `Neo.${classPath}`;

                entries.set(outputPath, {
                    className,
                    filename,
                    outputPath,
                    root,
                    sourcePath
                })
            })
    }

    getThemeSourceRoots(repoRoot).forEach(cssRoot => {
        fs.readdirSync(cssRoot, {withFileTypes: true})
            .filter(entry => (
                entry.isDirectory() &&
                !entry.isSymbolicLink() &&
                isCssTargetFolder(cssRoot, entry.name)
            ))
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(entry => visit(path.join(cssRoot, entry.name), entry.name))
    });

    return [...entries.values()].sort((a, b) => a.outputPath.localeCompare(b.outputPath))
}

/**
 * @summary Adds one effective source entry to the nested class-to-theme map used by worker.App.
 * @param {Object} themeMap Mutable theme map.
 * @param {Object} entry Effective source census entry.
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
 * @summary Creates the exact nested class-to-theme map plus `themes` (class → folders) for an effective source census.
 * @param {Array} census Effective source census.
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Object}
 */
function createDevelopmentThemeMap(census, {repoRoot = REPO_ROOT} = {}) {
    const themeMap = {
        themes: collectThemeClassMap(getThemeSourceRoots(repoRoot))
    };

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
 * @summary Replaces both development theme-map copies from the effective source census.
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
    const themeMap = createDevelopmentThemeMap(census ?? getThemeSourceCensus({repoRoot}), {repoRoot});

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
 * @summary Inspects the watcher's precise startup contract. Each entry output compares against its
 * own source only, so a prior valid one-file rebuild does not falsely stale every unrelated output.
 * Both map copies must reach every effective census entry.
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root.
 * @returns {{census: Array, invalidMap: String|null, mapMissing: String[], missing: String[],
 *            ready: Boolean, stale: String[], symlinked: String[]}}
 */
export function inspectThemeWatcherAssets({repoRoot = REPO_ROOT} = {}) {
    const
        census            = getThemeSourceCensus({repoRoot}),
        conservativeState = inspectDevelopmentThemeAssets({repoRoot}),
        mapMissing        = [],
        missing           = [],
        stale             = [];

    let invalidMap = null;

    census.forEach(entry => {
        try {
            const outputStat = fs.statSync(entry.outputPath);

            if (!outputStat.isFile()) {
                missing.push(path.relative(repoRoot, entry.outputPath))
            } else if (outputStat.mtimeMs < fs.statSync(entry.sourcePath).mtimeMs) {
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

        const expectedThemes = collectThemeClassMap(getThemeSourceRoots(repoRoot));

        census.forEach(entry => {
            if (!themeMapHasEntry(themeMap, entry)) {
                mapMissing.push(
                    `${path.relative(repoRoot, mapPath)}: ${entry.className} (${entry.root})`
                )
            }
        });

        for (const [themeClass, folders] of Object.entries(expectedThemes)) {
            const mapped = themeMap?.themes?.[themeClass];

            for (const folder of folders) {
                if (!Array.isArray(mapped) || !mapped.includes(folder)) {
                    mapMissing.push(
                        `${path.relative(repoRoot, mapPath)}: themes.${themeClass} (${folder})`
                    )
                }
            }
        }
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
 * @summary Removes development CSS and source maps with no corresponding effective source entry.
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
 * @summary Copies one effective source entry to its development CSS and source-map targets,
 * through autoprefixer as the full theme build does.
 * @param {Object} entry Effective source census entry.
 * @param {Object} [options]
 * @param {Object} [options.logger] Console-compatible logger.
 * @returns {Promise<String>} Absolute CSS output path.
 */
async function buildEntry(entry, {logger = console} = {}) {
    const startTime = Date.now();

    try {
        const postcssResult = await postcss([autoprefixer]).process(fs.readFileSync(entry.sourcePath, 'utf8'), {
            from: entry.sourcePath,
            to  : entry.outputPath,
            map : {inline: false}
        });

        fs.mkdirpSync(path.dirname(entry.outputPath));
        fs.writeFileSync(entry.outputPath, postcssResult.css);
        fs.writeFileSync(entry.outputPath + '.map', postcssResult.map.toString());

        const processTime = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.log('Updated file:', chalk.blue(`${processTime}s`), entry.outputPath);

        return entry.outputPath
    } catch (error) {
        const message = `[watch-themes] build failed for ${entry.filename}: ${error.message}`;

        (logger.error ?? logger.log).call(logger, message);
        throw new Error(message, {cause: error})
    }
}

/**
 * @summary Copies one workspace source file through the low-latency watcher path.
 * @param {String} filename Path relative to `resources/css`.
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
        cssRoot    = path.resolve(repoRoot, 'resources/css'),
        normalized = path.normalize(String(filename)),
        sourcePath = path.resolve(cssRoot, normalized);

    if (
        path.isAbsolute(normalized) ||
        sourcePath !== cssRoot && !sourcePath.startsWith(cssRoot + path.sep)
    ) {
        throw new Error(`[watch-themes] rejected source path outside resources/css: ${filename}`)
    }

    return buildEntry({
        className : '',
        filename  : normalized,
        outputPath: path.join(repoRoot, 'dist/development/css', normalized),
        root      : normalized.split(path.sep)[0],
        sourcePath
    }, {logger})
}

/**
 * @summary Reconciles development CSS and the generated theme map against one immutable source
 * census. Structural events build missing/stale entries, delete ghosts, and replace the map.
 * @param {Object} [options]
 * @param {Function} [options.build] Injectable effective-entry builder.
 * @param {String[]} [options.forceFiles] Entries to rebuild, relative to `resources/css`.
 * @param {Object} [options.logger] Console-compatible logger.
 * @param {String} [options.repoRoot] Repository root.
 * @returns {Promise<{built: String[], removed: String[], themeMap: Object}>}
 */
export async function reconcileThemeStructure({
    build      = buildEntry,
    forceFiles = [],
    logger     = console,
    repoRoot   = REPO_ROOT
} = {}) {
    const
        census      = getThemeSourceCensus({repoRoot}),
        forcedFiles = new Set(forceFiles.map(file => path.normalize(file))),
        built       = [];

    for (const entry of census) {
        let outputStat;

        try {
            outputStat = fs.lstatSync(entry.outputPath)
        } catch {}

        const shouldBuild = (
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
 * structural events use the wider source-census reconciliation.
 * @param {String} eventType fs.watch event type.
 * @param {String|Buffer} filename Path relative to `resources/css`.
 * @param {Object} [options]
 * @param {Function} [options.build] Injectable one-file builder.
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

    if (!normalized.endsWith('.css')) return {action: 'ignored', reason: 'not-css'};

    const exists = fs.existsSync(path.join(repoRoot, 'resources/css', normalized));

    if (eventType === 'change' && exists) {
        await build(normalized, {logger, repoRoot});
        return {action: 'built', built: [normalized], removed: []}
    }

    if (eventType !== 'rename' && eventType !== 'change') {
        return {action: 'ignored', reason: 'unsupported-event'}
    }

    try {
        // Forced even when deleted: a removed workspace sheet can uncover a package's or the Engine's
        // sheet at the same path, whose source is older than the output the workspace sheet left
        const result = await reconcile({forceFiles: [normalized], logger, repoRoot});
        const action = exists ? 'built' : 'removed';

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
 * the recursive source watcher.
 * @param {Object} [options]
 * @param {Function} [options.inspect] Injectable readiness inspector.
 * @param {Object} [options.logger] Console-compatible logger.
 * @param {Function} [options.reconcile] Injectable structural reconciler.
 * @param {String} [options.repoRoot] Repository root.
 * @param {Function} [options.watch] Injectable fs.watch seam.
 * @returns {Promise<fs.FSWatcher>}
 */
export async function startThemeWatcher({
    inspect   = inspectThemeWatcherAssets,
    logger    = console,
    reconcile = reconcileThemeStructure,
    repoRoot  = REPO_ROOT,
    watch     = fs.watch
} = {}) {
    assertThemeWatcherReady({inspect, repoRoot});
    await reconcile({logger, repoRoot});

    const cssRoot = path.join(repoRoot, 'resources/css');

    logger.log(`[watch-themes] watching ${cssRoot}`);

    return watch(
        cssRoot,
        {recursive: true},
        createThemeWatchListener({logger, reconcile, repoRoot})
    )
}

if (isEntryModule(import.meta.url)) {
    if (process.argv.includes('-h') || process.argv.includes('--help')) {
        console.log(WATCH_THEMES_HELP);
    } else {
        startThemeWatcher().catch(error => {
            console.error(error.message);
            process.exitCode = 1
        })
    }
}
