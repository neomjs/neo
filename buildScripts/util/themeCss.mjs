/**
 * @module buildScripts/util/themeCss
 * @summary The stylesheet reading the theme tools share: the walk over a tree, the comment strip, the
 * `var()` strip, and the custom properties CSS may read although no CSS declares them.
 *
 * `check-theme-var-references`, `check-theme-surfaces` and `theme-census` read `resources/css` with
 * regular expressions over comment-stripped text, not through a CSS parser. One copy of that reading
 * keeps a guard's verdict and the census's counts about the same tree. The theme map's schemes are the
 * exception and parse (`readDeclaredSchemes`): a scheme is a declaration, and the same text in a value or
 * under a condition is none.
 */
import fs                from 'node:fs';
import path              from 'node:path';
import postcss           from 'postcss';
import {SCHEME_PROPERTY} from './themeNameShapes.mjs';

/**
 * Custom properties that stylesheets read and no stylesheet declares, because something outside CSS
 * sets them. A row must still be read by some stylesheet: `check-theme-var-references` fails a row
 * nothing reads, so the list cannot outlive its reason.
 * @type {Object<String,String>}
 */
export const RUNTIME_PROPERTIES = Object.freeze({
    '--neo-desktop-app-color'                           : 'desktop.AppWindow, desktop.Launcher and desktop.PopupViewport set it from the app record',
    '--fa-style-family-classic'                         : 'Font Awesome sets it in its own stylesheet',
    '--neo-grid-animate-rows-transition-duration'       : 'grid.plugin.AnimateRows sets it on the grid',
    '--neo-grid-animate-rows-transition-timing-function': 'grid.plugin.AnimateRows sets it on the grid',
    '--neo-tree-list-level'                             : 'tree.List sets it per item from the record level',
    '--neo-fileuploadfield-upload-progress'             : 'form.field.FileUpload sets it while a file uploads'
});

/**
 * @summary Every `.css` file below a directory, sorted, so that every reader walks the same order.
 * @param {String} dir
 * @returns {String[]}
 */
export function cssFiles(dir) {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const full = path.join(dir, entry.name);

        return entry.isDirectory() ? cssFiles(full) : entry.name.endsWith('.css') ? [full] : []
    }).sort()
}

/**
 * @summary A stylesheet without its comments, line breaks kept so that line numbers still match.
 * @param {String} file
 * @returns {String}
 */
export function readCss(file) {
    return fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ''))
}

/**
 * A corner radius: `border-radius`, a corner longhand, either with a vendor prefix, or a custom
 * property named `--*-border-radius[-<state>]`. The lookbehind keeps a custom property's name from
 * matching as its `border-radius` tail.
 * @type {RegExp}
 */
const RADIUS_DECLARATION = /(?<![\w-])((?:-(?:webkit|moz)-)?border(?:-(?:top|bottom)-(?:left|right)|-(?:start|end)-(?:start|end))?-radius|--[\w-]*-border-radius(?:-[\w-]+)?)\s*:\s*([^;{}]+)/gi;

/**
 * @summary The corner radii of a stylesheet that hold a literal length, which no theme can reach.
 *
 * A value is a literal when it holds a length and no `var()`. `0`, the CSS-wide keywords and values
 * made of percentages only pass: a circle is shape by construction, not a theme's choice.
 * `theme-census` (section 8) and `check-theme-radius-literals` read structural rules through it.
 * @param {String} css A stylesheet as `readCss` returns it
 * @returns {Object[]} `{line, property, value}` per literal, in source order
 */
export function radiusLiterals(css) {
    const literals = [];

    for (const match of css.matchAll(RADIUS_DECLARATION)) {
        const value = match[2].trim().replace(/\s*!important$/i, '');

        if (!/var\(/i.test(value) && /\d*\.?\d+(?:px|r?em|ex|ch|vw|vh|vmin|vmax|cm|mm|in|pt|pc)\b/i.test(value) && !/^(?:0(?:px)?\s*)+$/.test(value)) {
            literals.push({line: css.slice(0, match.index).split('\n').length, property: match[1], value})
        }
    }

    return literals
}

/**
 * @summary Removes balanced `var()` calls, fallbacks included, so that what remains is the CSS no custom
 * property can change: a literal inside a fallback is one a theme reaches by setting the property.
 * @param {String} value
 * @returns {String}
 */
export function stripVarCalls(value) {
    let index;

    while ((index = value.indexOf('var(')) !== -1) {
        let depth = 0,
            end   = -1;

        for (let i = index + 3; i < value.length; i++) {
            if (value[i] === '(') {
                depth++
            } else if (value[i] === ')' && --depth === 0) {
                end = i;
                break
            }
        }

        value = end === -1
            ? value.slice(0, index) + value.slice(index + 3)
            : value.slice(0, index) + value.slice(end + 1)
    }

    return value
}

/**
 * @summary Extracts declared `.neo-theme-<name>` class selectors from a `Global.css` stylesheet,
 * ignoring comments, strings, declarations, and the structural `.neo-theme-scope` marker.
 * @param {String} css Raw CSS source text.
 * @returns {String[]} Sorted unique theme class names.
 */
export function extractThemeClasses(css) {
    const stripped = String(css)
              .replace(/\/\*[\s\S]*?\*\//g, ' ')
              .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""'),
          classes  = new Set();

    let parenDepth = 0,
        segment    = '';

    for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];

        if (ch === '(') {
            parenDepth++;
            segment += ch
        } else if (ch === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            segment += ch
        } else if (ch === '{' && parenDepth === 0) {
            const header = segment.trim();

            if (header && !header.startsWith('@')) {
                for (const match of header.matchAll(/\.(neo-theme-[a-zA-Z0-9_-]+)/g)) {
                    if (match[1] !== 'neo-theme-scope') {
                        classes.add(match[1])
                    }
                }
            }

            segment = ''
        } else if ((ch === ';' || ch === '}') && parenDepth === 0) {
            segment = ''
        } else {
            segment += ch
        }
    }

    return [...classes].sort()
}

/**
 * @summary Reads the `themes` (`class → folders`) table from a `theme-map.json` file when it exists.
 * @param {String} [themeMapPath] Absolute path to a `theme-map.json` file.
 * @returns {Object<String, String[]>|null}
 */
export function readThemeMapFile(themeMapPath) {
    if (!themeMapPath || !fs.existsSync(themeMapPath)) {
        return null
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(themeMapPath, 'utf8'));

        return parsed?.themes && typeof parsed.themes === 'object' && !Array.isArray(parsed.themes)
            ? parsed.themes
            : null
    } catch {
        return null
    }
}

/**
 * The selectors that declare on a theme class itself: the class, `:root` before it, and the root that holds
 * it as a child. Any other selector reaches other elements.
 * @type {RegExp}
 */
const OWN_SELECTOR = /^(?::root\s+)?\.(neo-theme-[a-zA-Z0-9_-]+)$|^:root:has\(\s*>\s*\.(neo-theme-[a-zA-Z0-9_-]+)\s*\)$/;

/**
 * @summary The theme classes a rule declares on: every alternative of its selector list, bare or inside one
 * `:where()`, has to be such a selector. Empty for any other rule, and for the structural `neo-theme-scope`.
 * @param {String} header
 * @returns {String[]}
 */
export function ownThemeClasses(header) {
    const names = (header.match(/^:where\(([^]*)\)$/)?.[1] ?? header).split(',').map(part => {
        const match = part.trim().match(OWN_SELECTOR);

        return match?.[1] ?? match?.[2]
    });

    return names.every(name => name && name !== 'neo-theme-scope') ? [...new Set(names)] : []
}

/**
 * @summary The `Global.css` the theme build reads for each folder across `cssRoots`: a later root's sheet
 * replaces an earlier root's sheet in the same folder. `src` and `theme-base` declare no theme.
 * @param {String[]} cssRoots Ordered CSS source roots (Engine, declared packages, workspace).
 * @returns {Map<String, String>} Folder name → `Global.css` path.
 */
export function effectiveThemeGlobals(cssRoots) {
    const sheets = new Map();

    for (const cssRoot of cssRoots) {
        if (!fs.existsSync(cssRoot)) continue;

        for (const entry of fs.readdirSync(cssRoot, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === 'src' || entry.name === 'theme-base') continue;

            const globalPath = path.join(cssRoot, entry.name, 'Global.css');

            try {
                fs.statSync(globalPath).isFile() && sheets.set(entry.name, globalPath)
            } catch {}
        }
    }

    return sheets
}

/**
 * @summary The light or dark `--neo-color-scheme` each theme class declares in one stylesheet: in a rule that
 * declares on the class ({@link ownThemeClasses}), under no at-rule but `@layer`. A later declaration wins.
 * @param {String} file
 * @returns {Object<String, ('dark'|'light')>} Empty for a sheet that does not parse.
 */
export function readDeclaredSchemes(file) {
    const schemes = {};

    let root;

    try {
        root = postcss.parse(fs.readFileSync(file, 'utf8'))
    } catch {
        return schemes
    }

    root.walkDecls(SCHEME_PROPERTY, ({parent, value}) => {
        let scope = parent.parent;

        while (scope?.type === 'atrule' && scope.name.toLowerCase() === 'layer') scope = scope.parent;

        if (parent.type === 'rule' && scope?.type === 'root' && /^(?:dark|light)$/.test(value.trim())) {
            ownThemeClasses(parent.selector.trim()).forEach(themeClass => {schemes[themeClass] = value.trim()})
        }
    });

    return schemes
}

/**
 * @summary Each theme class's declared light or dark scheme, read from the `Global.css` the build emits for
 * each of its folders ({@link effectiveThemeGlobals}, {@link readDeclaredSchemes}). The build and the theme
 * watcher write it into `theme-map.json`, so a component that hands a renderer a light or dark hint reads the
 * theme's own answer instead of keeping a map of theme names. A theme that declares none is left out, and its
 * components fall back to light.
 * @param {Object} options
 * @param {String[]} options.cssRoots Ordered CSS source roots; a later root's `Global.css` replaces an earlier one's.
 * @param {Object<String, String[]>} options.themes Theme class → folders, as `resolveThemeClassMap()` returns it.
 * @returns {Object<String, ('dark'|'light')>}
 */
export function resolveThemeSchemes({cssRoots, themes}) {
    const sheets   = effectiveThemeGlobals(cssRoots),
          declared = new Map(),
          schemes  = {};

    for (const [themeClass, folders] of Object.entries(themes)) {
        for (const folder of folders) {
            if (!sheets.has(folder)) continue;

            declared.has(folder) || declared.set(folder, readDeclaredSchemes(sheets.get(folder)));

            const scheme = declared.get(folder)[themeClass];

            scheme && (schemes[themeClass] = scheme)
        }
    }

    return schemes
}

/**
 * @summary Resolves the `class → folders` theme map from `theme-map.json` seeds when available
 * and merges live `Global.css` `.neo-theme-*` declarations across `cssRoots` (covering fresh CI
 * checkouts before `build-themes`, unbuilt consumer workspaces, and isolated `--root` fixtures).
 * Build and watcher source-discovery pass `includeWorkspaceMap: false` so a workspace's own stale
 * generated `resources/theme-map.json` never re-admits a retired local theme folder.
 * @param {Object} [options]
 * @param {String[]} [options.cssRoots] Ordered CSS source roots.
 * @param {Boolean} [options.includeWorkspaceMap=true] Whether to read `../theme-map.json` beside the final local/workspace root.
 * @param {String} [options.root] Single `resources/css` root shorthand.
 * @param {Object<String, String[]>} [options.seedThemes] Additional seed `class → folders` entries.
 * @param {String} [options.themeMapPath] Explicit `theme-map.json` path override.
 * @returns {Object<String, String[]>} Sorted map of theme class name to sorted folder list.
 */
export function resolveThemeClassMap({cssRoots, includeWorkspaceMap=true, root, seedThemes, themeMapPath} = {}) {
    const roots     = cssRoots ?? (root ? [root] : []),
          seedRoots = includeWorkspaceMap ? roots : (roots.length > 1 ? roots.slice(0, -1) : []),
          mapSeeds  = {},
          mapPaths  = themeMapPath
              ? [themeMapPath]
              : [...new Set(seedRoots.map(cssRoot => path.resolve(cssRoot, '../theme-map.json')))];

    for (const candidate of mapPaths) {
        const mapped = readThemeMapFile(candidate);

        if (!mapped) continue;

        for (const [themeClass, folders] of Object.entries(mapped)) {
            if (!Array.isArray(folders)) continue;
            mapSeeds[themeClass] = [...new Set([...(mapSeeds[themeClass] || []), ...folders])]
        }
    }

    if (seedThemes) {
        for (const [themeClass, folders] of Object.entries(seedThemes)) {
            if (!Array.isArray(folders)) continue;
            mapSeeds[themeClass] = [...new Set([...(mapSeeds[themeClass] || []), ...folders])]
        }
    }

    return collectThemeClassMap(roots, mapSeeds)
}

/**
 * @summary Resolves the sorted list of unique theme folder names from `theme-map.json` and
 * `Global.css` declarations, excluding `src` and `theme-base` without globbing `theme-*`.
 * @param {Object} [options]
 * @param {String[]} [options.cssRoots] Ordered CSS source roots.
 * @param {Boolean} [options.existingOnly=true] Restrict returned folders to directories present in `cssRoots`.
 * @param {Boolean} [options.includeWorkspaceMap=true] Whether to seed from the local/workspace `theme-map.json`.
 * @param {String} [options.root] Single `resources/css` root shorthand.
 * @param {Object<String, String[]>} [options.seedThemes] Additional seed `class → folders` entries.
 * @param {String} [options.themeMapPath] Explicit `theme-map.json` path override.
 * @returns {String[]}
 */
export function resolveThemeFolders({cssRoots, existingOnly=true, includeWorkspaceMap=true, root, seedThemes, themeMapPath} = {}) {
    const roots    = cssRoots ?? (root ? [root] : []),
          classMap = resolveThemeClassMap({cssRoots: roots, includeWorkspaceMap, seedThemes, themeMapPath}),
          folders  = [...new Set(Object.values(classMap).flat())]
              .filter(folder => folder !== 'src' && folder !== 'theme-base')
              .sort();

    if (!existingOnly || roots.length === 0) {
        return folders
    }

    return folders.filter(folder => roots.some(cssRoot => {
        try {
            return fs.statSync(path.join(cssRoot, folder)).isDirectory()
        } catch {
            return false
        }
    }))
}

/**
 * @summary Returns whether a directory under `resources/css` participates in theme builds and censuses:
 * `src`, `theme-base`, or a theme folder resolved through upstream shipped/package `theme-map.json`
 * seeds and live `Global.css` class declarations (never a stale local workspace `theme-map.json`).
 * @param {String|String[]} cssRootsOrRoot Single `resources/css` directory or ordered CSS roots across workspace layers.
 * @param {String} folderName Direct child directory name.
 * @returns {Boolean}
 */
export function isCssTargetFolder(cssRootsOrRoot, folderName) {
    if (folderName === 'src' || folderName === 'theme-base') {
        return true
    }

    const roots = Array.isArray(cssRootsOrRoot) ? cssRootsOrRoot : [cssRootsOrRoot];

    return resolveThemeFolders({cssRoots: roots, includeWorkspaceMap: false}).includes(folderName)
}

/**
 * @summary Builds the `class → folders` map for `resources/theme-map.json` from the effective `Global.css`
 * of each non-`src`, non-`theme-base` directory across `cssRoots` (later roots override same-folder sheets).
 * @param {String[]} cssRoots Ordered CSS source roots (Engine, declared packages, workspace).
 * @param {Object<String, String[]>} [seedThemes={}] Engine-seeded `themes` map for workspace builds.
 * @returns {Object<String, String[]>} Sorted map of theme class name to sorted folder list.
 */
export function collectThemeClassMap(cssRoots, seedThemes={}) {
    const effectiveGlobalByFolder = effectiveThemeGlobals(cssRoots),
          classToFolders          = new Map();

    for (const [themeClass, folders] of Object.entries(seedThemes || {})) {
        if (!Array.isArray(folders)) continue;

        for (const folder of folders) {
            if (!effectiveGlobalByFolder.has(folder)) {
                let set = classToFolders.get(themeClass);
                if (!set) classToFolders.set(themeClass, set = new Set());
                set.add(folder)
            }
        }
    }

    for (const [folder, globalPath] of [...effectiveGlobalByFolder.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const classes = extractThemeClasses(fs.readFileSync(globalPath, 'utf8'));

        for (const themeClass of classes) {
            let set = classToFolders.get(themeClass);
            if (!set) classToFolders.set(themeClass, set = new Set());
            set.add(folder)
        }
    }

    const result = {};

    for (const themeClass of [...classToFolders.keys()].sort()) {
        result[themeClass] = [...classToFolders.get(themeClass)].sort()
    }

    return result
}
