/**
 * @module buildScripts/util/themeCss
 * @summary The stylesheet reading the theme tools share: the walk over a tree, the comment strip, the
 * `var()` strip, the colours a value derives instead of reading, and the custom properties CSS may read
 * although no CSS declares them.
 *
 * `check-theme-var-references`, `check-theme-surfaces`, `check-theme-palette` and `theme-census` read
 * `resources/css` with regular expressions over comment-stripped text, not through a CSS parser. One copy
 * of that reading keeps a guard's verdict and the census's counts about the same tree.
 */
import fs   from 'node:fs';
import path from 'node:path';

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
 * A raw colour written as a hex colour or a colour function. `color-mix()` and `light-dark()` hold colours and
 * are read for what they hold.
 * @type {RegExp}
 */
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

/**
 * The named colours of CSS Color 4, each a raw colour. `transparent` and `currentcolor` are keywords, and the
 * system colours are the browser's.
 * @type {Set<String>}
 */
const NAMED_COLOURS = new Set([
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood',
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray',
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen',
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue',
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew',
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan',
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray',
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue',
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred',
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid',
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple',
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue',
    'slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke',
    'yellow yellowgreen'
].join(' ').split(' '));

/**
 * `url()` data and quoted strings: a `#` fragment or a word inside one is no colour.
 * @type {RegExp}
 */
const DATA = /url\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]*)\s*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gi;

/**
 * A whole identifier: no part of a dashed name, and no function name.
 * @type {RegExp}
 */
const IDENTIFIER = /(?<![\w-])[a-z]+(?![\w(-])/gi;

/**
 * @summary A value with its `url()` data and quoted strings blanked out, each index still on its character.
 * @param {String} text
 * @returns {String}
 */
function withoutData(text) {
    return text.replace(DATA, data => ' '.repeat(data.length))
}

/**
 * @summary The raw colours in a stretch of CSS: hex colours, colour functions and named colours, in any case,
 * and none inside `url()` data or a quoted string. `check-theme-surfaces`, `check-theme-palette` and
 * `theme-census` read raw colour through it.
 * @param {String} text
 * @returns {String[]}
 */
export function rawColours(text) {
    const bare = withoutData(text);

    return [
        ...bare.match(RAW_COLOUR) ?? [],
        ...(bare.match(IDENTIFIER) ?? []).filter(word => NAMED_COLOURS.has(word.toLowerCase()))
    ]
}

/**
 * @summary The arguments of a call, split at the commas outside nested parentheses.
 * @param {String} list The text between the call's own parentheses
 * @returns {String[]}
 */
function topLevelArguments(list) {
    const args  = [];
    let   depth = 0,
        start = 0;

    for (let i = 0; i < list.length; i++) {
        if (list[i] === '(') {
            depth++
        } else if (list[i] === ')') {
            depth--
        } else if (list[i] === ',' && depth === 0) {
            args.push(list.slice(start, i).trim());
            start = i + 1
        }
    }

    return [...args, list.slice(start).trim()]
}

/**
 * @summary The colours a declaration value derives instead of reading, which a component variable does not
 * hold: it reads roles, and derives a colour only by mixing one role with `transparent`.
 *
 * `mixes` holds each `color-mix()` whose two colours are both something other than `transparent`: the result
 * is a colour no role names, so no palette check measures a pair it forms. `raw` holds each raw colour
 * (`rawColours`), one inside a `var()` fallback too. Function names are read in any case, and nothing inside
 * `url()` data or a quoted string counts. `check-theme-palette` fails both in `theme-base`, and `theme-census`
 * counts a value by the same reading.
 * @param {String} value A declaration value without comments
 * @returns {{mixes: String[], raw: String[]}}
 */
export function colourSources(value) {
    const
        bare  = withoutData(value),
        lower = bare.toLowerCase(),
        mixes = [];
    let index = -1;

    while ((index = lower.indexOf('color-mix(', index + 1)) !== -1) {
        let depth = 0,
            end   = -1;

        for (let i = index + 9; i < bare.length; i++) {
            if (bare[i] === '(') {
                depth++
            } else if (bare[i] === ')' && --depth === 0) {
                end = i;
                break
            }
        }

        if (end === -1) {
            break
        }

        // `in <space>` first, then two colours, each with an optional percentage
        const colours = topLevelArguments(lower.slice(index + 10, end)).slice(1)
            .map(colour => colour.replace(/(?:^|\s)\d*\.?\d+%(?=\s|$)/g, '').trim());

        if (colours.length === 2 && !colours.includes('transparent')) {
            mixes.push(value.slice(index, end + 1))
        }
    }

    return {mixes, raw: rawColours(value)}
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
    const effectiveGlobalByFolder = new Map(),
          classToFolders          = new Map();

    for (const cssRoot of cssRoots) {
        if (!fs.existsSync(cssRoot)) continue;

        const entries = fs.readdirSync(cssRoot, {withFileTypes: true})
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
            if (entry.name === 'src' || entry.name === 'theme-base') continue;

            const globalPath = path.join(cssRoot, entry.name, 'Global.css');

            try {
                if (fs.statSync(globalPath).isFile()) {
                    effectiveGlobalByFolder.set(entry.name, globalPath)
                }
            } catch {}
        }
    }

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
