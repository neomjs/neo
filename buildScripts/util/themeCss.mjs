/**
 * @module buildScripts/util/themeCss
 * @summary The stylesheet reading the theme tools share: the walk over a tree, the comment strip, the
 * `var()` strip, and the custom properties CSS may read although no CSS declares them.
 *
 * `check-theme-var-references`, `check-theme-surfaces` and `theme-census` read `resources/css` with
 * regular expressions over comment-stripped text, not through a CSS parser. One copy of that reading
 * keeps a guard's verdict and the census's counts about the same tree.
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
    '--desktop-app-color'      : 'desktop.AppWindow, desktop.Launcher and desktop.PopupViewport set it from the app record',
    '--fa-style-family-classic': 'Font Awesome sets it in its own stylesheet',
    '--neo-duration'           : 'grid.plugin.AnimateRows sets it on the grid',
    '--neo-easing'             : 'grid.plugin.AnimateRows sets it on the grid',
    '--neo-tree-level'         : 'tree.List sets it per item from the record level',
    '--upload-progress'        : 'form.field.FileUpload sets it while a file uploads'
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
 * @summary Returns whether a directory under `resources/css` participates in theme builds and censuses:
 * `src`, `theme-base`, any `theme*` directory, or any directory whose `Global.css` declares a theme class.
 * @param {String} cssRoot Absolute `resources/css` root directory.
 * @param {String} folderName Direct child directory name.
 * @returns {Boolean}
 */
export function isCssTargetFolder(cssRoot, folderName) {
    if (folderName === 'src' || folderName === 'theme-base' || folderName.includes('theme')) {
        return true
    }

    const globalCssPath = path.join(cssRoot, folderName, 'Global.css');

    try {
        return fs.statSync(globalCssPath).isFile() &&
            extractThemeClasses(fs.readFileSync(globalCssPath, 'utf8')).length > 0
    } catch {
        return false
    }
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
