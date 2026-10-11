import {spawn} from 'node:child_process';
import fs      from 'node:fs';
import path    from 'node:path';

export const DEVELOPMENT_THEME_BUILD_COMMAND = 'npm run build-themes -- -n -e dev -t all';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * @summary Returns the newest mtime under a directory tree for files with a given extension.
 * Symbolic-link entries are deliberately ignored: generated-asset readiness must describe this
 * checkout, never a foreign tree borrowed through a link.
 * @param {String} dir Absolute directory.
 * @param {String} extension File extension including the dot.
 * @returns {Number} Newest epoch mtime in milliseconds, or 0 when no matching file exists.
 */
export function newestMtime(dir, extension) {
    let newest = 0;

    if (!fs.existsSync(dir)) return newest;

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isSymbolicLink()) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            newest = Math.max(newest, newestMtime(fullPath, extension))
        } else if (entry.name.endsWith(extension)) {
            newest = Math.max(newest, fs.statSync(fullPath).mtimeMs)
        }
    }

    return newest
}

/**
 * @summary Converts the canonical non-partial SCSS source tree into the complete development-CSS
 * output census. The builder reads these same `src` + `theme*` roots; the generated theme map is
 * intentionally not the authority because it is additive and can retain retired class paths.
 * @param {String} [repoRoot] Repository root.
 * @returns {String[]} Repo-relative CSS paths, sorted and deduplicated.
 */
export function getExpectedDevelopmentCss(repoRoot = REPO_ROOT) {
    const files = new Set();

    function visit(dir, targetRoot) {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            if (entry.isSymbolicLink()) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                visit(fullPath, targetRoot)
            } else if (entry.name.endsWith('.scss') && !entry.name.startsWith('_')) {
                const relative = path.relative(targetRoot, fullPath).replace(/\.scss$/, '.css');

                files.add(path.join(
                    'dist/development/css',
                    path.basename(targetRoot),
                    relative
                ))
            }
        }
    }

    const scssRoot = path.join(repoRoot, 'resources/scss');

    if (!fs.existsSync(scssRoot)) return [];

    fs.readdirSync(scssRoot, {withFileTypes: true}).forEach(entry => {
        if (entry.isDirectory() && !entry.isSymbolicLink() && (entry.name === 'src' || entry.name.includes('theme'))) {
            const targetRoot = path.join(scssRoot, entry.name);

            visit(targetRoot, targetRoot)
        }
    });

    return [...files].sort()
}

/**
 * @summary Converts the canonical non-partial SCSS source tree into the complete theme-map class
 * census — every class the runtime can ask the map for. Derivation mirrors the builder's
 * `getScssFiles` exactly: dot-joined relative path; the `apps.*` namespace stays top-level,
 * everything else takes the `Neo.` prefix. The map itself is never the census authority: it is
 * additive and can retain retired class paths.
 * @param {String} [repoRoot] Repository root.
 * @returns {Object[]} `{className, root}` entries, sorted by className then root.
 */
export function getExpectedThemeClasses(repoRoot = REPO_ROOT) {
    const entries = [];

    function visit(dir, rootName, relativePath) {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            if (entry.isSymbolicLink()) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                visit(fullPath, rootName, `${relativePath}/${entry.name}`)
            } else if (entry.name.endsWith('.scss') && !entry.name.startsWith('_')) {
                const base     = entry.name.slice(0, -'.scss'.length),
                      relative = relativePath === '' ? base : `${relativePath.substring(1)}/${base}`;

                let className = relative.split('/').join('.');

                if (!className.startsWith('apps.')) className = 'Neo.' + className;

                entries.push({className, root: rootName})
            }
        }
    }

    const scssRoot = path.join(repoRoot, 'resources/scss');

    if (!fs.existsSync(scssRoot)) return [];

    fs.readdirSync(scssRoot, {withFileTypes: true}).forEach(entry => {
        if (entry.isDirectory() && !entry.isSymbolicLink() && (entry.name === 'src' || entry.name.includes('theme'))) {
            visit(path.join(scssRoot, entry.name), entry.name, '')
        }
    });

    return entries.sort((a, b) => a.className.localeCompare(b.className) || a.root.localeCompare(b.root))
}

/**
 * @summary Returns true when the nested theme-map namespace tree holds a leaf array for the class
 * that includes the given source root. Runtime reachability (`src/worker/App.mjs` resolves theme
 * folders through exactly these per-class entries) requires both: the class present and the root
 * listed. A fresh CSS file on disk without this entry is a file the runtime never requests.
 * @param {Object} themeMap Parsed `resources/theme-map.json`.
 * @param {String} className Dot-joined class name, e.g. `Neo.button.Base`.
 * @param {String} root Source root directory name, e.g. `src` or `theme-neo-dark`.
 * @returns {Boolean}
 */
function themeMapHasClass(themeMap, className, root) {
    const leaf = className.split('.').reduce(
        (ns, segment) => (ns && typeof ns === 'object') ? ns[segment] : undefined,
        themeMap
    );

    return Array.isArray(leaf) && leaf.includes(root)
}

/**
 * @summary Returns true when a repo-relative output path traverses a symbolic-link segment.
 * @param {String} repoRoot Repository root.
 * @param {String} target Absolute output path within the repository.
 * @returns {Boolean}
 */
function hasSymlinkSegment(repoRoot, target) {
    const relative = path.relative(repoRoot, target);

    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return relative !== '';

    let cursor = repoRoot;

    for (const segment of relative.split(path.sep)) {
        cursor = path.join(cursor, segment);

        try {
            if (fs.lstatSync(cursor).isSymbolicLink()) return true
        } catch {
            return false
        }
    }

    return false
}

/**
 * @summary Inspects whether this checkout has a complete, current development theme build.
 * Every non-partial SCSS input must have a local CSS output at least as new as the newest SCSS
 * source. The independently generated theme map is held to the same freshness boundary AND to a
 * completeness boundary: every census class must be present with its source root, or the runtime
 * never requests that stylesheet (a fresh file on disk the map does not reach is unstyled).
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root to inspect.
 * @returns {{expectedCss: String[], invalidMap: String|null, mapMissing: String[], missing: String[],
 *            newestScss: Number, ready: Boolean, stale: String[], symlinked: String[]}}
 */
export function inspectDevelopmentThemeAssets({repoRoot = REPO_ROOT} = {}) {
    const
        cssRoot    = path.join(repoRoot, 'dist/development/css'),
        mapPath    = path.join(repoRoot, 'resources/theme-map.json'),
        newestScss = newestMtime(path.join(repoRoot, 'resources/scss'), '.scss'),
        mapMissing = [],
        missing    = [],
        stale      = [],
        symlinked  = [];

    let expectedCss = getExpectedDevelopmentCss(repoRoot),
        invalidMap  = null,
        mapStat,
        themeMap;

    if (hasSymlinkSegment(repoRoot, mapPath)) {
        symlinked.push('resources/theme-map.json')
    } else {
        try {
            mapStat = fs.statSync(mapPath);

            if (!mapStat.isFile()) {
                missing.push('resources/theme-map.json')
            } else {
                themeMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

                if (!themeMap || typeof themeMap !== 'object' || Object.keys(themeMap).length === 0) {
                    invalidMap = 'theme-map contains no class entries';
                    themeMap   = null
                }
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                missing.push('resources/theme-map.json')
            } else {
                invalidMap = error.message
            }
        }
    }

    if (themeMap) {
        getExpectedThemeClasses(repoRoot).forEach(({className, root}) => {
            if (!themeMapHasClass(themeMap, className, root)) {
                mapMissing.push(`${className} (${root})`)
            }
        })
    }

    if (!hasSymlinkSegment(repoRoot, cssRoot)) {
        try {
            if (!fs.statSync(cssRoot).isDirectory()) missing.push('dist/development/css')
        } catch {
            missing.push('dist/development/css')
        }
    } else {
        symlinked.push('dist/development/css')
    }

    if (mapStat?.mtimeMs < newestScss) stale.push('resources/theme-map.json');
    if (expectedCss.length === 0) invalidMap ??= 'SCSS source tree contains no buildable theme files';

    expectedCss.forEach(relativePath => {
        const absolutePath = path.join(repoRoot, relativePath);

        if (hasSymlinkSegment(repoRoot, absolutePath)) {
            symlinked.push(relativePath);
            return
        }

        try {
            const stat = fs.statSync(absolutePath);

            if (!stat.isFile()) {
                missing.push(relativePath)
            } else if (stat.mtimeMs < newestScss) {
                stale.push(relativePath)
            }
        } catch {
            missing.push(relativePath)
        }
    });

    return {
        expectedCss,
        invalidMap,
        mapMissing,
        missing  : [...new Set(missing)].sort(),
        newestScss,
        ready    : newestScss > 0 && !invalidMap && mapMissing.length === 0 && missing.length === 0 && stale.length === 0 && symlinked.length === 0,
        stale    : [...new Set(stale)].sort(),
        symlinked: [...new Set(symlinked)].sort()
    }
}

/**
 * @summary Runs the one canonical, non-interactive all-theme development build.
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root in which to run npm.
 * @returns {Promise<void>}
 */
export function runDevelopmentThemeBuild({repoRoot = REPO_ROOT} = {}) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    return new Promise((resolve, reject) => {
        const child = spawn(
            npmCommand,
            ['run', 'build-themes', '--', '-n', '-e', 'dev', '-t', 'all'],
            {cwd: repoRoot, stdio: 'inherit'}
        );

        child.once('error', error => reject(new Error(
            `E2E theme preflight could not run \`${DEVELOPMENT_THEME_BUILD_COMMAND}\`: ${error.message}`
        )));
        child.once('exit', (code, signal) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(
                    `E2E theme preflight: \`${DEVELOPMENT_THEME_BUILD_COMMAND}\` failed ` +
                    `with ${signal ? `signal ${signal}` : `exit code ${code}`}`
                ))
            }
        })
    })
}

/**
 * @summary Materializes current development themes exactly once when inspection finds missing,
 * stale, invalid, or symlink-borrowed outputs, then revalidates before Playwright starts a server.
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root to inspect and build.
 * @param {Function} [options.build] Injectable builder seam for focused tests.
 * @param {Object} [options.logger] Console-compatible logger.
 * @returns {Promise<{built: Boolean, state: Object}>}
 */
export async function ensureDevelopmentThemeAssets({
    repoRoot = REPO_ROOT,
    build    = runDevelopmentThemeBuild,
    logger   = console
} = {}) {
    let state = inspectDevelopmentThemeAssets({repoRoot});

    if (state.ready) return {built: false, state};

    logger.log(`[e2e] development theme assets are missing or stale — running ${DEVELOPMENT_THEME_BUILD_COMMAND}`);

    try {
        await build({repoRoot})
    } catch (error) {
        throw new Error(
            `E2E theme preflight failed before browser startup: ${error.message}\n` +
            `Recovery: ${DEVELOPMENT_THEME_BUILD_COMMAND}`
        )
    }

    state = inspectDevelopmentThemeAssets({repoRoot});

    if (!state.ready) {
        const details = [
            state.invalidMap && `invalid map: ${state.invalidMap}`,
            state.mapMissing.length > 0 && `map missing entries: ${state.mapMissing.join(', ')}`,
            state.missing.length > 0   && `missing: ${state.missing.join(', ')}`,
            state.stale.length > 0     && `stale: ${state.stale.join(', ')}`,
            state.symlinked.length > 0 && `symlinked: ${state.symlinked.join(', ')}`
        ].filter(Boolean).join('; ');

        throw new Error(
            `E2E theme preflight incomplete after a successful builder exit${details ? ` (${details})` : ''}.\n` +
            `Recovery: ${DEVELOPMENT_THEME_BUILD_COMMAND}`
        )
    }

    return {built: true, state}
}
