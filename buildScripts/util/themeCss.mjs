/**
 * @module buildScripts/util/themeCss
 * @summary The stylesheet reading the theme tools share: the walk over a tree, the comment strip, and
 * the custom properties CSS may read although no CSS declares them.
 *
 * `check-theme-var-references` and `theme-census` read `resources/css` with regular expressions over
 * comment-stripped text, not through a CSS parser. One copy of that reading keeps a guard's verdict and
 * the census's counts about the same tree.
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
